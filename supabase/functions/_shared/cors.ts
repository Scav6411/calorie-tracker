// Browser origins allowed to call edge functions.

/** Exact production origins. The first is the fallback for a denied origin. */
const PRODUCTION_ORIGINS: string[] = ["https://calorie-tracker-cg6.pages.dev"];

/**
 * Cloudflare Pages gives every deployment its own hostname
 * (<hash>.calorie-tracker-cg6.pages.dev), so preview builds cannot be listed
 * exactly. Anchored at both ends and https only, so this matches this
 * project's subdomains and nothing else.
 */
const PAGES_ORIGIN = /^https:\/\/[a-z0-9-]+\.calorie-tracker-cg6\.pages\.dev$/;

/** localhost, 127.0.0.1, or a private LAN address on any port, http or https. */
const LOCAL_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

function isAllowed(origin: string): boolean {
  return PRODUCTION_ORIGINS.includes(origin) || PAGES_ORIGIN.test(origin) ||
    LOCAL_ORIGIN.test(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && isAllowed(origin) ? origin : PRODUCTION_ORIGINS[0] ?? "null";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-sync-secret, x-user-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/** Returns a preflight response for OPTIONS requests, or null to continue. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
  });
}
