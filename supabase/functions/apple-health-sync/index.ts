import { createClient } from "npm:@supabase/supabase-js@2";
import { handlePreflight, json } from "../_shared/cors.ts";

/**
 * Apple Health ingest endpoint.
 *
 * Health data cannot be read from a browser, so the expected caller is an iOS
 * Shortcut (Automation -> Get Health Sample -> Get Contents of URL) posting a
 * JSON body. Shortcuts cannot hold a refreshing Supabase JWT, so this function
 * runs with verify_jwt = false and authenticates with a shared secret header
 * instead.
 *
 * Expected body:
 *   { "synced_at": <iso8601>, "active_energy": <kcal>, "resting_energy": <kcal> }
 *
 * The token identifies the user: its SHA-256 is looked up in sync_tokens, and
 * the resolved user_id owns the row written to energy_readings.
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

/** Shortcuts' localised date, e.g. "7 Sep 2026 at 2:06 PM". */
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

interface HealthSample {
  synced_at: string;
  active_energy: number;
  resting_energy: number;
}

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

/**
 * Shortcuts frequently sends numbers as strings depending on how the value was
 * assembled, so accept both rather than rejecting a genuine sync.
 */
/** Energy is stored to 2 decimals; round here so the echo matches the row. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

interface ValidationMeta {
  synced_at_format: string;
  assumed_timezone: string | null;
}

function validate(
  payload: unknown,
): { sample: HealthSample | null; meta?: ValidationMeta; problems: string[] } {
  const problems: string[] = [];

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { sample: null, problems: ["body must be a JSON object"] };
  }

  const record = payload as Record<string, unknown>;

  const syncedAt = record.synced_at;
  let syncedAtIso = "";
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
      syncedAtIso = parsed.date.toISOString();
      syncedAtFormat = parsed.format;
      assumedZone = parsed.assumedZone;
    }
  }

  const active = asNumber(record.active_energy);
  if (active === null) problems.push("active_energy is missing or not a number");
  else if (active < 0) problems.push("active_energy cannot be negative");

  const resting = asNumber(record.resting_energy);
  if (resting === null) problems.push("resting_energy is missing or not a number");
  else if (resting < 0) problems.push("resting_energy cannot be negative");

  if (problems.length > 0 || active === null || resting === null) {
    return { sample: null, problems };
  }

  return {
    sample: {
      synced_at: syncedAtIso,
      active_energy: round2(active),
      resting_energy: round2(resting),
    },
    meta: { synced_at_format: syncedAtFormat, assumed_timezone: assumedZone ? SYNC_TIMEZONE : null },
    problems,
  };
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
  const { sample, meta, problems } = validate(payload);

  // Always print what arrived, valid or not - that is the point for now.
  console.log("=== apple-health-sync ===");
  console.log("received_at :", receivedAt);
  console.log("bytes       :", raw.length);
  console.log("user_agent  :", req.headers.get("user-agent") ?? "(none)");
  console.log("shape       :", describe(payload));
  console.log("payload     :", JSON.stringify(payload, null, 2));

  if (!sample) {
    console.warn("invalid    :", problems.join("; "));
    return json(req, { ok: false, received_at: receivedAt, problems, payload }, 422);
  }

  const total = sample.active_energy + sample.resting_energy;
  console.log("synced_at   :", sample.synced_at);
  console.log("active      :", sample.active_energy, "kcal");
  console.log("resting     :", sample.resting_energy, "kcal");
  console.log("total burn  :", total, "kcal");
  console.log("read as     :", meta?.synced_at_format, meta?.assumed_timezone ? `(assumed ${meta.assumed_timezone})` : "(explicit offset)");

  const { data: row, error: writeError } = await supabase
    .from("energy_readings")
    .upsert(
      {
        user_id: tokenRow.user_id,
        synced_at: sample.synced_at,
        active_energy: sample.active_energy,
        resting_energy: sample.resting_energy,
        source: "apple_health",
      },
      // A repeated sync for the same instant corrects the row rather than
      // duplicating it.
      { onConflict: "user_id,synced_at" },
    )
    .select("id, synced_at, active_energy, resting_energy, total_energy")
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
    sample,
    synced_at_format: meta?.synced_at_format,
    assumed_timezone: meta?.assumed_timezone,
    // What the home screen's "Burned" figure needs.
    total_energy: total,
    reading_id: row.id,
    persisted: true,
  });
});
