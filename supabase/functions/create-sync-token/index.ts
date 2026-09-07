import { createClient } from "npm:@supabase/supabase-js@2";
import { handlePreflight, json } from "../_shared/cors.ts";

/**
 * Mints a sync token for the signed-in user.
 *
 * Runs here rather than in the browser because crypto.subtle is unavailable
 * outside a secure context, and dev is served over plain http on a LAN IP.
 *
 * The raw token is returned exactly once and never stored - only its SHA-256.
 */

const TOKEN_PREFIX = "cts_";
const PREFIX_KEPT = 12;
const MAX_ACTIVE_TOKENS = 10;

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const base64 = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return TOKEN_PREFIX + base64;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return json(req, { error: "Use POST" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(req, { error: "Missing Authorization header" }, 401);

  // The caller's own JWT, so the insert below is still subject to RLS.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json(req, { error: "Invalid or expired session" }, 401);

  let label = "Shortcut";
  try {
    const body = await req.json();
    if (typeof body?.label === "string" && body.label.trim() !== "") {
      label = body.label.trim().slice(0, 40);
    }
  } catch {
    // No body is fine - the default label stands.
  }

  const { count } = await supabase
    .from("sync_tokens")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null);

  if ((count ?? 0) >= MAX_ACTIVE_TOKENS) {
    return json(req, { error: `At most ${MAX_ACTIVE_TOKENS} active tokens` }, 409);
  }

  const token = generateToken();
  const { data, error } = await supabase
    .from("sync_tokens")
    .insert({
      user_id: auth.user.id,
      label,
      token_hash: await sha256Hex(token),
      token_prefix: token.slice(0, PREFIX_KEPT),
    })
    .select("id, label, token_prefix, created_at")
    .single();

  if (error) {
    console.error("Failed to insert sync token:", error.message);
    return json(req, { error: "Could not create token" }, 500);
  }

  // The only time the raw token ever leaves this function.
  return json(req, { ...data, token }, 201);
});
