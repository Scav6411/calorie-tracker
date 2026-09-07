import { createClient } from "npm:@supabase/supabase-js@2";
import { handlePreflight, json } from "../_shared/cors.ts";

// Template edge function: verifies the caller's JWT and echoes back who they are.
// Copy this file as the starting point for real functions.
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(req, { error: "Missing Authorization header" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return json(req, { error: "Invalid or expired token" }, 401);

  return json(req, {
    ok: true,
    user_id: data.user.id,
    email: data.user.email,
    timestamp: new Date().toISOString(),
  });
});
