/**
 * Supabase Edge Function: admin-override
 *
 * Sole writer for the `match_overrides` table. The PIN is stored server-side
 * only (Deno.env ADMIN_PIN) and validated on every request. The client never
 * ships the PIN in its bundle — it only forwards whatever the operator types
 * into the Admin Panel PinGate for verification.
 *
 * Actions:
 *   { action: "verify", pin }              → { ok: true } | 401
 *   { action: "set",    pin, matchId, ... }
 *   { action: "clear",  pin, matchId }
 */

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminPin = Deno.env.get("ADMIN_PIN");
  if (!supabaseUrl || !supabaseServiceKey || !adminPin) {
    return json({ error: "Service not configured" }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const providedPin = typeof body?.pin === "string" ? body.pin : "";
  if (!timingSafeEqualStr(providedPin, adminPin)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const action = body?.action;

  if (action === "verify") {
    return json({ ok: true }, 200);
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);

  if (action === "set") {
    const matchId = String(body.matchId ?? "");
    const scoreA = Number(body.scoreA);
    const scoreB = Number(body.scoreB);
    const minute = body.minute === null || body.minute === undefined ? null : Number(body.minute);
    const status = String(body.status ?? "live");
    if (!matchId || !Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
      return json({ error: "Invalid payload" }, 400);
    }
    if (!["scheduled", "live", "finished"].includes(status)) {
      return json({ error: "Invalid status" }, 400);
    }
    const row = {
      match_id: matchId,
      score_a: Math.max(0, Math.min(50, Math.floor(scoreA))),
      score_b: Math.max(0, Math.min(50, Math.floor(scoreB))),
      minute: minute === null ? null : Math.max(0, Math.min(120, Math.floor(minute))),
      status,
      is_manual: true,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin
      .from("match_overrides")
      .upsert(row, { onConflict: "match_id" });
    if (error) {
      console.error("[admin-override] upsert failed:", error);
      return json({ error: "Write failed" }, 500);
    }
    return json({ ok: true, row }, 200);
  }

  if (action === "clear") {
    const matchId = String(body.matchId ?? "");
    if (!matchId) return json({ error: "Invalid payload" }, 400);
    const { error } = await admin
      .from("match_overrides")
      .delete()
      .eq("match_id", matchId);
    if (error) {
      console.error("[admin-override] delete failed:", error);
      return json({ error: "Delete failed" }, 500);
    }
    return json({ ok: true }, 200);
  }

  return json({ error: "Unknown action" }, 400);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
