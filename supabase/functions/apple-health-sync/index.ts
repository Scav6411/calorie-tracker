import { createClient } from "npm:@supabase/supabase-js@2";
import { handlePreflight, json } from "../_shared/cors.ts";

/**
 * Apple Health ingest endpoint.
 *
 * Health data cannot be read from a browser, so the expected caller is an iOS
 * Shortcut (Automation -> Find Health Samples -> Get Contents of URL) posting a
 * JSON body. Shortcuts cannot hold a refreshing Supabase JWT, so this function
 * runs with verify_jwt = false and authenticates with a shared secret header
 * instead.
 *
 * Two body shapes are accepted.
 *
 * Hourly (preferred). "Find Health Samples" with Group by: Hour, Fill Missing
 * on and Order: Oldest First returns one figure per hour of the local day.
 * Dropped into a Text field, Shortcuts joins the list with newlines:
 *
 *   { "synced_at": <date>,
 *     "active_energy":  "0\n0\n20.166\n...",
 *     "resting_energy": "92.98\n105.73\n0\n..." }
 *
 * Cumulative (legacy). A single running total per field, which is how every
 * reading before 2026-09-09 was sent:
 *
 *   { "synced_at": <date>, "active_energy": <kcal>, "resting_energy": <kcal> }
 *
 * The two are told apart by whether the field holds a list. Both are stored in
 * energy_readings, tagged by the granularity column so the daily rollup knows
 * whether to sum the rows or take the largest.
 *
 * The token identifies the user: its SHA-256 is looked up in sync_tokens, and
 * the resolved user_id owns the rows written.
 */

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** YYYY-MM-DD, then an optional time with an optional UTC offset. */
const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Shortcuts' localised date, e.g. "9 Sep 2026 at 2:24 AM". iOS 16 and later put
 * a narrow no-break space (U+202F) before the meridiem rather than a plain one,
 * which \s does match - it is in the Unicode space separator category.
 */
const SHORTCUTS_DATE =
  /^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})(?:\s+at)?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?$/;

/**
 * The wall clock the phone reports has no UTC offset attached, so it is read in
 * this zone. India has no DST, which keeps the conversion unambiguous.
 */
const SYNC_TIMEZONE = Deno.env.get("SYNC_TIMEZONE") ?? "Asia/Kolkata";

/** Offset of `timeZone` from UTC, in ms, at the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
}

/** Converts a wall-clock reading in `timeZone` to a real UTC instant. */
function wallClockToUtc(
  year: number, month: number, day: number, hour: number, minute: number, second: number,
  timeZone: string,
): Date {
  const asIfUtc = Date.UTC(year, month, day, hour, minute, second);
  return new Date(asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone));
}

/** The calendar date an instant falls on, as seen in `timeZone`. */
function localDateParts(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  // en-CA months are 1-based; Date.UTC wants 0-based.
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

/** Hour of the day, 0-23, an instant falls in as seen in `timeZone`. */
function localHour(instant: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" })
      .format(instant),
  );
}

/**
 * Accepts ISO 8601, or the localised string Shortcuts produces. Returns the
 * instant plus how it was read, so the caller can surface an assumed timezone.
 */
function parseSyncedAt(raw: string): { date: Date; format: string; assumedZone: boolean } | null {
  const value = raw.trim();

  if (ISO_8601.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    // A bare date or a naive datetime carries no offset of its own.
    const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
    return { date: parsed, format: "iso8601", assumedZone: !hasOffset };
  }

  const match = SHORTCUTS_DATE.exec(value);
  if (match) {
    const [, day, monthName, year, hour, minute, second, meridiem] = match;
    const month = MONTHS[monthName.slice(0, 3).toLowerCase()];
    if (month === undefined) return null;

    let hours = Number(hour) % 12;
    if (meridiem.toLowerCase() === "p") hours += 12;

    const date = wallClockToUtc(
      Number(year), month, Number(day), hours, Number(minute), Number(second ?? 0),
      SYNC_TIMEZONE,
    );
    if (Number.isNaN(date.getTime())) return null;
    return { date, format: "shortcuts", assumedZone: true };
  }

  return null;
}

const HOURS_PER_DAY = 24;

/**
 * "Start Date is today" with Fill Missing on spans midnight to midnight, which
 * is 25 boundaries and therefore 25 buckets - the last being the midnight that
 * ends the day, always empty. 24 is accepted for the day a future iOS stops
 * emitting it. Anything else is rejected rather than trimmed: the only thing
 * that can go wrong here is calories landing in the wrong hour, and a silent
 * realignment is exactly how that would happen unnoticed.
 */
const MAX_HOURLY_VALUES = HOURS_PER_DAY + 1;

/** Describes an unknown payload's shape, to help debug a mismatched sender. */
function describe(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const inner = value.length > 0 ? describe(value[0], depth + 1) : "unknown";
    return `array(${value.length}) of ${inner}`;
  }
  if (typeof value === "object") {
    if (depth > 1) return "object";
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${describe(item, depth + 1)}`)
      .join(", ");
    return `{ ${entries} }`;
  }
  return typeof value;
}

/** Energy is stored to 2 decimals; round here so the echo matches the row. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Shortcuts frequently sends numbers as strings depending on how the value was
 * assembled, so accept both rather than rejecting a genuine sync.
 */
function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * A list of per-hour figures, or null when the field holds a single value.
 *
 * Shortcuts flattens a list variable dropped into a Text field by joining it
 * with newlines, so that is the shape that actually arrives. A real JSON array
 * is accepted too in case the Array body type is used instead. Returns the
 * strings that failed to parse so the caller can say which ones.
 */
function asNumberList(value: unknown): { values: number[]; bad: string[] } | null {
  let parts: string[];

  if (Array.isArray(value)) {
    parts = value.map((item) => String(item).trim());
  } else if (typeof value === "string") {
    parts = value.split(/[\n,;]+/).map((part) => part.trim());
  } else {
    return null;
  }

  parts = parts.filter((part) => part !== "");
  // One value is a cumulative total, not a list of buckets.
  if (parts.length < 2) return null;

  const values: number[] = [];
  const bad: string[] = [];
  for (const part of parts) {
    const parsed = Number(part);
    if (Number.isFinite(parsed)) values.push(parsed);
    else bad.push(part);
  }
  return { values, bad };
}

/** The Shortcut may name the fields either way; accept both spellings. */
function pickField(record: Record<string, unknown>, base: string): unknown {
  const hourly = record[`${base}_hourly`];
  return hourly === undefined ? record[base] : hourly;
}

interface HourBucket {
  hour: number;
  active: number;
  resting: number;
}

type Reading =
  | { kind: "cumulative"; syncedAt: Date; active: number; resting: number }
  | { kind: "hourly"; syncedAt: Date; buckets: HourBucket[] };

interface ValidationMeta {
  synced_at_format: string;
  assumed_timezone: string | null;
}

function validate(
  payload: unknown,
): { reading: Reading | null; meta?: ValidationMeta; problems: string[] } {
  const problems: string[] = [];

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { reading: null, problems: ["body must be a JSON object"] };
  }

  const record = payload as Record<string, unknown>;

  const syncedAt = record.synced_at;
  let syncedAtDate: Date | null = null;
  let syncedAtFormat = "";
  let assumedZone = false;
  if (typeof syncedAt !== "string" || syncedAt.trim() === "") {
    problems.push("synced_at is missing");
  } else {
    // Never fall back to Date.parse(): it reads "07/09/2026" month-first and
    // would silently shift a day-first date onto the wrong day.
    const parsed = parseSyncedAt(syncedAt);
    if (!parsed) {
      problems.push(
        `synced_at is not ISO 8601 or a recognised Shortcuts date: ${syncedAt}`,
      );
    } else {
      syncedAtDate = parsed.date;
      syncedAtFormat = parsed.format;
      assumedZone = parsed.assumedZone;
    }
  }

  const meta: ValidationMeta = {
    synced_at_format: syncedAtFormat,
    assumed_timezone: assumedZone ? SYNC_TIMEZONE : null,
  };

  const rawActive = pickField(record, "active_energy");
  const rawResting = pickField(record, "resting_energy");
  const activeList = asNumberList(rawActive);
  const restingList = asNumberList(rawResting);

  if (activeList || restingList) {
    // Half a payload cannot be filed: one field summed across the day and the
    // other spread over hours would put the two on different scales.
    if (!activeList) problems.push("active_energy is a single value but resting_energy is a list");
    if (!restingList) problems.push("resting_energy is a single value but active_energy is a list");

    for (const [name, list] of [["active_energy", activeList], ["resting_energy", restingList]] as const) {
      if (!list) continue;
      if (list.bad.length > 0) {
        problems.push(`${name} has non-numeric entries: ${list.bad.slice(0, 3).join(", ")}`);
      }
      if (list.values.length < HOURS_PER_DAY || list.values.length > MAX_HOURLY_VALUES) {
        problems.push(
          `${name} has ${list.values.length} values; expected ${HOURS_PER_DAY} or ${MAX_HOURLY_VALUES} ` +
            `(Group by: Hour, Fill Missing on, Order: Oldest First)`,
        );
      }
      if (list.values.some((value) => value < 0)) {
        problems.push(`${name} cannot be negative`);
      }
    }

    if (problems.length > 0 || !activeList || !restingList || !syncedAtDate) {
      return { reading: null, meta, problems };
    }

    // Index 0 is midnight local. Anything past hour 23 is the trailing bucket
    // that closes the day, which is always empty.
    const buckets: HourBucket[] = [];
    for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
      buckets.push({
        hour,
        active: round2(activeList.values[hour]),
        resting: round2(restingList.values[hour]),
      });
    }

    // The lists are matched to hours by position, so the wrong sort order files
    // real calories into the wrong hours - which looks like plausible data
    // rather than an error, and is the one failure here nobody would notice.
    //
    // With Fill Missing on, hours that have not happened yet are zero, so a
    // figure sitting after the hour synced_at falls in means the list is not
    // running oldest-first. "Order: Latest First" reverses it exactly this way.
    const syncedHour = localHour(syncedAtDate, SYNC_TIMEZONE);
    const filled = buckets.filter((bucket) => bucket.active + bucket.resting > 0);
    const latestFilled = filled.length > 0 ? filled[filled.length - 1].hour : -1;
    if (latestFilled > syncedHour) {
      problems.push(
        `hour ${latestFilled} holds energy but the sync ran during hour ${syncedHour}; ` +
          `the list looks reversed (set Sort by: Start Date and Order: Oldest First on both Find actions)`,
      );
      return { reading: null, meta, problems };
    }

    return { reading: { kind: "hourly", syncedAt: syncedAtDate, buckets }, meta, problems };
  }

  const active = asNumber(rawActive);
  if (active === null) problems.push("active_energy is missing or not a number");
  else if (active < 0) problems.push("active_energy cannot be negative");

  const resting = asNumber(rawResting);
  if (resting === null) problems.push("resting_energy is missing or not a number");
  else if (resting < 0) problems.push("resting_energy cannot be negative");

  if (problems.length > 0 || active === null || resting === null || !syncedAtDate) {
    return { reading: null, meta, problems };
  }

  return {
    reading: {
      kind: "cumulative",
      syncedAt: syncedAtDate,
      active: round2(active),
      resting: round2(resting),
    },
    meta,
    problems,
  };
}

interface EnergyRow {
  user_id: string;
  synced_at: string;
  active_energy: number;
  resting_energy: number;
  granularity: "cumulative" | "hourly";
  source: string;
  updated_at: string;
}

/**
 * The hour buckets as database rows, keyed by the real UTC instant each local
 * hour starts at. Built one hour at a time rather than by adding 3600 s to
 * midnight, so a zone with DST still lands on the right instants.
 */
function bucketRows(userId: string, syncedAt: Date, buckets: HourBucket[]): EnergyRow[] {
  const { year, month, day } = localDateParts(syncedAt, SYNC_TIMEZONE);
  const writtenAt = new Date().toISOString();

  return buckets.map((bucket) => ({
    user_id: userId,
    synced_at: wallClockToUtc(year, month, day, bucket.hour, 0, 0, SYNC_TIMEZONE).toISOString(),
    active_energy: bucket.active,
    resting_energy: bucket.resting,
    granularity: "hourly" as const,
    source: "apple_health",
    updated_at: writtenAt,
  }));
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return json(req, { error: "Use POST" }, 405);
  }

  // x-user-token matches the expense-tracker convention; x-sync-secret is kept
  // so an existing Shortcut only needs its value swapped, not its header name.
  const presented = req.headers.get("x-user-token") ?? req.headers.get("x-sync-secret");
  if (!presented) {
    return json(req, { error: "Unauthorized: missing token" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Looking the hash up both authenticates the caller and identifies them.
  const { data: tokenRow } = await supabase
    .from("sync_tokens")
    .select("id, user_id")
    .eq("token_hash", await sha256Hex(presented))
    .is("revoked_at", null)
    .maybeSingle();

  if (!tokenRow) {
    console.warn("Rejected a request with an unknown or revoked token.");
    return json(req, { error: "Unauthorized: invalid token" }, 401);
  }

  const raw = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    console.error("Body was not valid JSON:", raw.slice(0, 500));
    return json(req, { error: "Body must be JSON" }, 400);
  }

  const receivedAt = new Date().toISOString();
  const { reading, meta, problems } = validate(payload);

  // Always print what arrived, valid or not - that is the point for now.
  console.log("=== apple-health-sync ===");
  console.log("received_at :", receivedAt);
  console.log("bytes       :", raw.length);
  console.log("user_agent  :", req.headers.get("user-agent") ?? "(none)");
  console.log("shape       :", describe(payload));
  console.log("payload     :", JSON.stringify(payload, null, 2));

  if (!reading) {
    console.warn("invalid    :", problems.join("; "));
    return json(req, { ok: false, received_at: receivedAt, problems, payload }, 422);
  }

  console.log("synced_at   :", reading.syncedAt.toISOString());
  console.log("granularity :", reading.kind);
  console.log(
    "read as     :",
    meta?.synced_at_format,
    meta?.assumed_timezone ? `(assumed ${meta.assumed_timezone})` : "(explicit offset)",
  );

  if (reading.kind === "cumulative") {
    const total = round2(reading.active + reading.resting);
    console.log("active      :", reading.active, "kcal");
    console.log("resting     :", reading.resting, "kcal");
    console.log("total burn  :", total, "kcal");

    const { data: row, error: writeError } = await supabase
      .from("energy_readings")
      .upsert(
        {
          user_id: tokenRow.user_id,
          synced_at: reading.syncedAt.toISOString(),
          active_energy: reading.active,
          resting_energy: reading.resting,
          granularity: "cumulative",
          source: "apple_health",
          updated_at: new Date().toISOString(),
        },
        // A repeated sync for the same instant corrects the row rather than
        // duplicating it.
        { onConflict: "user_id,synced_at" },
      )
      .select("id")
      .single();

    if (writeError) {
      console.error("Failed to write reading:", writeError.message);
      return json(req, { error: "Could not save reading" }, 500);
    }

    await supabase
      .from("sync_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    console.log("stored      :", row.id, "for user", tokenRow.user_id);

    return json(req, {
      ok: true,
      received_at: receivedAt,
      granularity: "cumulative",
      sample: {
        synced_at: reading.syncedAt.toISOString(),
        active_energy: reading.active,
        resting_energy: reading.resting,
      },
      synced_at_format: meta?.synced_at_format,
      assumed_timezone: meta?.assumed_timezone,
      // What the home screen's "Burned" figure needs.
      total_energy: total,
      reading_id: row.id,
      persisted: true,
    });
  }

  const rows = bucketRows(tokenRow.user_id, reading.syncedAt, reading.buckets);
  const localDay = localDateParts(reading.syncedAt, SYNC_TIMEZONE);
  const dayStart = rows[0].synced_at;
  // Midnight of the next calendar day rather than dayStart + 24 h, so a zone
  // with DST still ends its day where the calendar does. Date.UTC normalises a
  // day number past the end of the month, so no month-end special case.
  const dayEnd = wallClockToUtc(
    localDay.year, localDay.month, localDay.day + 1, 0, 0, 0, SYNC_TIMEZONE,
  ).toISOString();

  // Health keeps writing samples into hours that have already closed, so a
  // resync revises earlier buckets rather than only appending. Writing all 24
  // every time would be correct but would fire 24 realtime events at the
  // browser for what is usually a one-hour change, so only the rows that
  // actually moved are sent.
  const { data: existingRows, error: readError } = await supabase
    .from("energy_readings")
    .select("synced_at, active_energy, resting_energy")
    .eq("user_id", tokenRow.user_id)
    .eq("granularity", "hourly")
    .gte("synced_at", dayStart)
    .lt("synced_at", dayEnd);

  if (readError) {
    console.error("Failed to read existing buckets:", readError.message);
    return json(req, { error: "Could not save readings" }, 500);
  }

  const existing = new Map<string, { active: number; resting: number }>();
  for (const row of existingRows ?? []) {
    existing.set(new Date(row.synced_at as string).toISOString(), {
      active: Number(row.active_energy),
      resting: Number(row.resting_energy),
    });
  }

  const changed = rows.filter((row) => {
    const previous = existing.get(row.synced_at);
    // An empty hour that was never written stays unwritten - most of a day is
    // zeros, and rows for hours that have not happened yet say nothing. An
    // empty hour that used to hold a figure is still written, so a correction
    // downwards is not lost.
    if (!previous) return row.active_energy > 0 || row.resting_energy > 0;
    return previous.active !== row.active_energy || previous.resting !== row.resting_energy;
  });

  const activeTotal = round2(reading.buckets.reduce((sum, bucket) => sum + bucket.active, 0));
  const restingTotal = round2(reading.buckets.reduce((sum, bucket) => sum + bucket.resting, 0));

  console.log("buckets     :", reading.buckets.length, "hours,", changed.length, "changed");
  console.log("active      :", activeTotal, "kcal");
  console.log("resting     :", restingTotal, "kcal");
  console.log("total burn  :", round2(activeTotal + restingTotal), "kcal");

  if (changed.length > 0) {
    const { error: writeError } = await supabase
      .from("energy_readings")
      .upsert(changed, { onConflict: "user_id,synced_at" });

    if (writeError) {
      console.error("Failed to write buckets:", writeError.message);
      return json(req, { error: "Could not save readings" }, 500);
    }
  }

  await supabase
    .from("sync_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  console.log("stored      :", changed.length, "buckets for user", tokenRow.user_id);

  return json(req, {
    ok: true,
    received_at: receivedAt,
    granularity: "hourly",
    day_start: dayStart,
    // Filed, not received: a 25th bucket closing the day is dropped.
    hours_filed: reading.buckets.length,
    hours_written: changed.length,
    synced_at_format: meta?.synced_at_format,
    assumed_timezone: meta?.assumed_timezone,
    active_energy: activeTotal,
    resting_energy: restingTotal,
    // What the home screen's "Burned" figure needs.
    total_energy: round2(activeTotal + restingTotal),
    persisted: true,
  });
});
