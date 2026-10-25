/**
 * Edge Function: admin
 *
 * Einziger Schreibweg für Admin-Korrekturen + Statistik/Feedback-Abfrage.
 * Die PIN liegt nur als Secret ADMIN_PIN auf dem Server. Brute-Force-Schutz:
 * nach 5 Fehlversuchen pro IP (bzw. 150 insgesamt) ist der Zugang 15 Minuten gesperrt.
 *
 * Aktionen:
 *  verify | set | clear | clear_overrides | stats | feedback | feedback_delete | fixtures | fixtures_list
 *  config | set_source | test_source | clear_cache | reset_results | set_announcement | broadcast
 *  groups | group | group_delete | member_remove | member_unban | owner_transfer | delete_tip_groups
 *  requests | decide | ban_global | unban_global | global_bans | team_device
 *  alerts | alert_test   (Wächter: Probleme der Live-Daten, Test-Mitteilung)
 *  find_person | group_board | team_log   (Team-App: Personensuche, Rundentabelle, Protokoll)
 *  passkey_register_options | passkey_register | passkey_list | passkey_delete
 *  passkey_login_options | passkey_login   (Team-App: Entsperren mit Face ID, ohne PIN)
 *
 * Face ID: Nach passkey_login gibt es eine signierte Freigabe „s1.…“ (4 Stunden),
 * die die Team-App statt der PIN mitschickt. Einrichten nur mit echter PIN.
 * Jede ändernde Aktion landet mit Klartext im Team-Protokoll (kt_team_log);
 * `by` = Geräte-ID des Absenders (nur zur Anzeige „dieses Gerät“).
 * Für „broadcast“ (Push an alle) dieselben Secrets wie send-push-reminders:
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@13.2.2";
import { isoBase64URL } from "npm:@simplewebauthn/server@13.2.2/helpers";

// ---------- Helfer (bewusst in dieser Datei, damit sie sich einzeln ins Dashboard kopieren lässt) ----------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function preflight(req: Request): Response | null {
  return req.method === "OPTIONS"
    ? new Response(null, { status: 204, headers: CORS_HEADERS })
    : null;
}

/** Welche dieser Geräte ein Mitteilungs-Abo haben (nur an die kommt etwas an). */
// deno-lint-ignore no-explicit-any
async function withPush(db: any, devices: string[]): Promise<Set<string>> {
  if (devices.length === 0) return new Set();
  const { data } = await db.from("push_subscriptions").select("device_id").in("device_id", devices);
  return new Set(((data ?? []) as { device_id: string }[]).map((r) => r.device_id));
}

function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback;
  if (v === undefined) throw new Error(`Secret ${name} fehlt`);
  return v;
}

const MAX_FAILURES = 5;
const MAX_GLOBAL_FAILURES = 150;
const LOCK_MS = 15 * 60_000;
const STATUSES = ["scheduled", "live", "finished"];
const PHASES = ["first", "half", "second", "extra", "penalties"];

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const clampInt = (v: unknown, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

// ---------- Team-Protokoll ----------

/** Ändernde Aktionen – sie landen im Protokoll (kt_team_log). */
const LOGGED = new Set([
  "set",
  "clear",
  "clear_overrides",
  "fixtures",
  "feedback_delete",
  "delete_tip_groups",
  "set_source",
  "clear_cache",
  "reset_results",
  "set_announcement",
  "broadcast",
  "group_delete",
  "member_remove",
  "member_unban",
  "owner_transfer",
  "decide",
  "ban_global",
  "unban_global",
  "team_device",
  "alert_test",
  "passkey_register",
  "passkey_delete",
]);

type LogCtx = { group?: string; member?: string; request?: string; passkey?: string };

/** Namen von Runde, Mitglied bzw. Antrag – vor der Aktion, danach sind sie evtl. gelöscht. */
// deno-lint-ignore no-explicit-any
async function logContext(db: any, body: Record<string, unknown>): Promise<LogCtx> {
  const ctx: LogCtx = {};
  try {
    if (body.groupId) {
      const { data } = await db
        .from("tip_groups")
        .select("name")
        .eq("id", String(body.groupId))
        .maybeSingle();
      ctx.group = data?.name;
    }
    if (body.groupId && body.memberId) {
      const { data } = await db
        .from("tip_members")
        .select("name")
        .eq("group_id", String(body.groupId))
        .eq("member_id", String(body.memberId))
        .maybeSingle();
      ctx.member = data?.name;
    }
    if (body.action === "decide") {
      const { data } = await db
        .from("kt_unban_requests")
        .select("scope, group_id, target_device")
        .eq("id", Number(body.id))
        .maybeSingle();
      if (data) {
        const { data: m } = await db
          .from("tip_members")
          .select("name")
          .eq("device_id", data.target_device)
          .limit(1)
          .maybeSingle();
        ctx.request = `${m?.name ?? "?"}${data.scope === "global" ? " (überall)" : ""}`;
      }
    }
    if (body.action === "passkey_delete") {
      const { data } = await db
        .from("kt_team_passkeys")
        .select("label")
        .eq("id", String(body.id ?? ""))
        .maybeSingle();
      ctx.passkey = data?.label ?? undefined;
    }
    if (body.action === "unban_global" && !body.memberId && body.device) {
      const { data } = await db
        .from("kt_device_bans")
        .select("label")
        .eq("device_id", String(body.device))
        .maybeSingle();
      ctx.member = data?.label;
    }
  } catch {
    /* Protokoll ist Zusatz – Fehler hier dürfen die Aktion nicht stören */
  }
  return ctx;
}

/** Klartext für das Protokoll, z. B. „Korrektur m01: 2:1 live“. */
function describe(
  body: Record<string, unknown>,
  ctx: LogCtx,
  res: Record<string, unknown>,
): string | null {
  const who = ctx.member ? `„${ctx.member}“` : "Mitglied";
  const where = ctx.group ? ` in „${ctx.group}“` : "";
  const score = `${body.scoreHome}:${body.scoreAway}`;
  switch (body.action) {
    case "set":
      return `Korrektur ${body.matchId}: ${score} ${body.status === "finished" ? "beendet" : body.status === "live" ? "live" : "geplant"}`;
    case "clear":
      return `Korrektur ${body.matchId} entfernt`;
    case "clear_overrides":
      return `Alle Korrekturen entfernt (${res.count ?? 0})`;
    case "fixtures":
      return `${res.count ?? 0} Anstoßzeiten abgeglichen`;
    case "feedback_delete":
      return body.id === "all" ? "Alles Feedback gelöscht" : `Feedback #${body.id} gelöscht`;
    case "delete_tip_groups":
      return `Alle Tipprunden gelöscht (${res.count ?? 0})`;
    case "set_source":
      return `Live-Quelle: ${body.league}/${body.season}${body.suffix ? `/${body.suffix}` : ""}, ESPN ${body.backup || "aus"}${body.paused ? ", angehalten" : ""}`;
    case "clear_cache":
      return "Zwischenspeicher geleert";
    case "reset_results":
      return `Gespeicherte Ergebnisse zurückgesetzt (${res.count ?? 0})`;
    case "set_announcement":
      return String(body.text ?? "").trim()
        ? `Hinweis: „${String(body.text).trim().slice(0, 80)}“`
        : "Hinweis entfernt";
    case "broadcast":
      return body.onlyDevice
        ? null // Test an sich selbst – nicht protokollieren
        : `Mitteilung an alle: „${String(body.title ?? "").slice(0, 60)}“ (${res.sent ?? 0} zugestellt)`;
    case "group_delete":
      return `Runde${ctx.group ? ` „${ctx.group}“` : ""} gelöscht`;
    case "member_remove":
      return `${who}${where} ${body.ban === true ? "gesperrt" : "entfernt"}`;
    case "member_unban":
      return `${who}${where} entsperrt`;
    case "owner_transfer":
      return `${who} ist jetzt Ersteller${where}`;
    case "decide":
      return `Antrag ${ctx.request ? `von ${ctx.request} ` : ""}${body.accept === true ? "angenommen" : "abgelehnt"}`;
    case "ban_global":
      return `${who} überall gesperrt${body.reason ? ` – Grund: ${String(body.reason).slice(0, 80)}` : ""}`;
    case "unban_global":
      return `${who} überall entsperrt`;
    case "team_device":
      return body.mode === "on"
        ? "Gerät für Team-Mitteilungen eingetragen"
        : body.mode === "off"
          ? "Gerät aus Team-Mitteilungen ausgetragen"
          : body.mode === "only"
            ? "Nur noch ein Gerät für Team-Mitteilungen"
            : null; // nur abgefragt
    case "alert_test":
      return "Test-Mitteilung an Team-Geräte";
    case "passkey_register":
      return `Face ID eingerichtet${body.label ? ` („${String(body.label).slice(0, 40)}“)` : ""}`;
    case "passkey_delete":
      return `Face ID entfernt${ctx.passkey ? ` („${ctx.passkey}“)` : ""}`;
    case "passkey_login":
      return `Mit Face ID entsperrt${res.label ? ` („${res.label}“)` : ""}`;
    default:
      return null;
  }
}

// deno-lint-ignore no-explicit-any
async function writeLog(
  db: any,
  body: Record<string, unknown>,
  ctx: LogCtx,
  res: Record<string, unknown>,
) {
  const detail = describe(body, ctx, res);
  if (!detail) return;
  const by = String(body.by ?? "");
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  try {
    await db.from("kt_team_log").insert({
      action: String(body.action),
      detail: detail.slice(0, 300),
      device_id: UUID.test(by) ? by : null,
    });
    // Alte Einträge nebenbei aufräumen.
    await db
      .from("kt_team_log")
      .delete()
      .lt("at", new Date(Date.now() - 180 * 86_400_000).toISOString());
  } catch {
    /* Tabelle fehlt (SQL-Update noch nicht ausgeführt) – Aktion trotzdem erfolgreich */
  }
}

// ---------- Face ID (Passkeys) für die Team-App ----------

const SESSION_MS = 4 * 3600_000;
const CHALLENGE_MS = 5 * 60_000;
const MAX_PASSKEYS = 10;
const te = new TextEncoder();

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Signatur der Freigabe – Schlüssel ist ein Server-Geheimnis (nie die kurze PIN). */
async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    te.encode(`${env("SUPABASE_SERVICE_ROLE_KEY")}|kt-team-session`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, te.encode(data)));
}

async function issueSession(passkeyId: string) {
  const expiresAt = Date.now() + SESSION_MS;
  const payload = `s1.${passkeyId}.${expiresAt}`;
  return { token: `${payload}.${await sign(payload)}`, expiresAt };
}

/** Freigabe prüfen: Signatur, Ablauf und ob der Passkey noch existiert. */
// deno-lint-ignore no-explicit-any
async function checkSession(db: any, token: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "s1") return false;
  const [, id, exp, sig] = parts;
  if (!(Number(exp) > Date.now())) return false;
  if (!safeEqual(sig, await sign(`s1.${id}.${exp}`))) return false;
  const { data } = await db.from("kt_team_passkeys").select("id").eq("id", id).maybeSingle();
  return !!data;
}

/** Adresse der Team-App aus dem Origin-Header (setzt der Browser, nicht fälschbar per Skript). */
function originOf(req: Request): { origin: string; rpID: string } | null {
  try {
    const u = new URL(req.headers.get("origin") ?? "");
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
    return { origin: u.origin, rpID: u.hostname };
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
async function saveChallenge(db: any, challenge: string, kind: "register" | "login") {
  await db
    .from("kt_team_challenges")
    .delete()
    .lt("created_at", new Date(Date.now() - CHALLENGE_MS).toISOString());
  await db.from("kt_team_challenges").insert({ challenge, kind });
}

/** Zufallswert aus der Antwort holen und verbrauchen (nur einmal, nur 5 Minuten gültig). */
// deno-lint-ignore no-explicit-any
async function takeChallenge(db: any, clientDataJSON: unknown, kind: string) {
  let challenge = "";
  try {
    const text = new TextDecoder().decode(isoBase64URL.toBuffer(String(clientDataJSON)));
    challenge = String(JSON.parse(text).challenge ?? "");
  } catch {
    return null;
  }
  if (!challenge) return null;
  const { data } = await db
    .from("kt_team_challenges")
    .delete()
    .eq("challenge", challenge)
    .eq("kind", kind)
    .gte("created_at", new Date(Date.now() - CHALLENGE_MS).toISOString())
    .select("challenge");
  return data && data.length > 0 ? challenge : null;
}

/** Ohne PIN: Zufallswert und die Passkeys, die für diese Adresse eingerichtet sind. */
// deno-lint-ignore no-explicit-any
async function passkeyLoginOptions(db: any, req: Request): Promise<Response> {
  const o = originOf(req);
  if (!o) return json({ available: false });
  const { data, error } = await db
    .from("kt_team_passkeys")
    .select("id, transports")
    .eq("rp_id", o.rpID);
  if (error || !data?.length) return json({ available: false }); // nichts eingerichtet / SQL-Update fehlt
  // Schutz gegen Fluten: höchstens 50 offene Anmelde-Zufallswerte.
  const { count } = await db
    .from("kt_team_challenges")
    .select("challenge", { count: "exact", head: true })
    .eq("kind", "login")
    .gte("created_at", new Date(Date.now() - CHALLENGE_MS).toISOString());
  if ((count ?? 0) > 50) return json({ error: "Zu viele Anfragen – bitte kurz warten" }, 429);
  const options = await generateAuthenticationOptions({
    rpID: o.rpID,
    allowCredentials: (data as { id: string; transports: string[] | null }[]).map((c) => ({
      id: c.id,
      // deno-lint-ignore no-explicit-any
      transports: (c.transports ?? undefined) as any,
    })),
    userVerification: "required",
    timeout: 60_000,
  });
  await saveChallenge(db, options.challenge, "login");
  return json({ available: true, options });
}

/** Face-ID-Antwort prüfen → Freigabe für 4 Stunden. */
async function passkeyLogin(
  // deno-lint-ignore no-explicit-any
  db: any,
  req: Request,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; token: string; expiresAt: number; label: string | null }
  | { ok: false; error: string }
> {
  const o = originOf(req);
  // deno-lint-ignore no-explicit-any
  const resp = body.response as any;
  if (!o || !resp?.id || !resp?.response?.clientDataJSON)
    return { ok: false, error: "Ungültige Anmeldung" };
  const { data: pk } = await db
    .from("kt_team_passkeys")
    .select("id, public_key, counter, transports, label, rp_id, origin")
    .eq("id", String(resp.id))
    .maybeSingle();
  if (!pk || pk.rp_id !== o.rpID || pk.origin !== o.origin)
    return { ok: false, error: "Dieses Gerät ist für Face ID nicht (mehr) eingerichtet" };
  const challenge = await takeChallenge(db, resp.response.clientDataJSON, "login");
  if (!challenge) return { ok: false, error: "Abgelaufen – bitte noch einmal versuchen" };
  try {
    const v = await verifyAuthenticationResponse({
      response: resp,
      expectedChallenge: challenge,
      expectedOrigin: o.origin,
      expectedRPID: o.rpID,
      credential: {
        id: pk.id,
        publicKey: isoBase64URL.toBuffer(pk.public_key),
        counter: Number(pk.counter),
        transports: pk.transports ?? undefined,
      },
      requireUserVerification: true,
    });
    if (!v.verified) return { ok: false, error: "Face ID nicht bestätigt" };
    await db
      .from("kt_team_passkeys")
      .update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq("id", pk.id);
    return { ok: true, ...(await issueSession(pk.id)), label: pk.label ?? null };
  } catch {
    return { ok: false, error: "Face ID nicht bestätigt" };
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  let db;
  let pin: string;
  try {
    db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    pin = env("ADMIN_PIN");
  } catch {
    return json({ error: "Nicht konfiguriert" }, 500);
  }

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Ungültige Anfrage" }, 400);

  // ---- Brute-Force-Schutz ----
  // Pro IP 5 Fehlversuche / 15 min. Die IP setzt Cloudflare vor Supabase selbst
  // (cf-connecting-ip) – anders als x-forwarded-for, dessen erster Eintrag vom
  // Absender stammen kann. Dazu eine Obergrenze für alle zusammen (150 / 15 min):
  // Selbst mit vielen IPs dauert Durchprobieren einer 6-stelligen PIN Wochen, und
  // aussperren kann das Team nur, wer Fehlversuche von 30+ IPs schickt.
  const ip = (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for") ??
    "unbekannt"
  )
    .split(",")[0]
    .trim();
  const keys = [
    { key: `ip:${ip}`, max: MAX_FAILURES },
    { key: "global", max: MAX_GLOBAL_FAILURES },
  ];
  const keyNames = keys.map((k) => k.key);
  const provided = String(body.pin ?? "");
  const action = String(body.action ?? "");

  // ---- Face ID (Team-App) ----
  // Anmeldeoptionen brauchen keine PIN: Sie enthalten nur einen Zufallswert.
  if (action === "passkey_login_options") return passkeyLoginOptions(db, req);
  // Anmelden zählt wie ein PIN-Versuch – aber nur je IP, nicht für die
  // Sammel-Sperre: Ein Passkey lässt sich nicht durchprobieren. So kommt das
  // Team per Face ID auch dann noch hinein, wenn jemand mit falschen PINs die
  // Sammel-Sperre (150 Versuche) ausgelöst hat.
  if (action === "passkey_login") {
    const ipKeys = [`ip:${ip}`];
    const { data: counted } = await db.rpc("kt_admin_attempt", { p_keys: ipKeys });
    const rows = (counted ?? []) as { r_key: string; r_failures: number }[];
    if ((rows.find((r) => r.r_key === ipKeys[0])?.r_failures ?? 0) > MAX_FAILURES)
      return json({ error: "Zu viele Fehlversuche – bitte später erneut" }, 429);
    const result = await passkeyLogin(db, req, body);
    if (!result.ok) return json({ error: result.error }, 401);
    await db.rpc("kt_admin_ok", { p_keys: ipKeys });
    await writeLog(db, body, {}, { label: result.label });
    return json({ ok: true, token: result.token, expiresAt: result.expiresAt });
  }
  // Freigabe nach Face ID statt PIN.
  const viaSession = provided.startsWith("s1.");
  if (viaSession && !(await checkSession(db, provided)))
    return json({ error: "Sitzung abgelaufen – bitte neu entsperren" }, 401);
  if (viaSession && (action === "passkey_register_options" || action === "passkey_register"))
    return json({ error: "Face ID einrichten geht nur nach Entsperren mit der PIN" }, 403);

  // Bevorzugt: atomar hochzählen, BEVOR die PIN geprüft wird (SQL-Update
  // „Härtung“). So hilft auch das gleichzeitige Senden vieler Anfragen nicht.
  const { data: counted, error: rpcError } = viaSession
    ? { data: null, error: null }
    : await db.rpc("kt_admin_attempt", { p_keys: keyNames });
  if (viaSession) {
    // schon geprüft (checkSession)
  } else if (!rpcError) {
    const rows = (counted ?? []) as { r_key: string; r_failures: number }[];
    const over = keys.some(
      ({ key, max }) => (rows.find((r) => r.r_key === key)?.r_failures ?? 0) > max,
    );
    if (over) {
      // Auch abgewiesen: Bei richtiger PIN den Versuch wieder abziehen. Sonst
      // treiben gleichzeitige Anfragen des Teams den Zähler hoch und sperren
      // es 15 Minuten aus. Antwort und Aufwand sind in beiden Fällen gleich
      // (auch bei falscher PIN ein Aufruf, dann ohne Wirkung) – so verrät
      // weder Inhalt noch Antwortzeit, ob die PIN gestimmt hat.
      await db.rpc("kt_admin_ok", { p_keys: safeEqual(provided, pin) ? keyNames : [] });
      return json({ error: "Zu viele Fehlversuche – bitte später erneut" }, 429);
    }
    if (!safeEqual(provided, pin)) return json({ error: "Falsche PIN" }, 401);
    await db.rpc("kt_admin_ok", { p_keys: keyNames });
  } else {
    // Rückfall ohne SQL-Update: lesen, prüfen, schreiben (nicht atomar).
    const { data: attempts } = await db
      .from("admin_attempts")
      .select("key, failures, window_start")
      .in("key", keyNames);
    const active = (k: string) => {
      const a = (attempts ?? []).find((x: { key: string }) => x.key === k);
      return a && Date.now() - Date.parse(a.window_start) < LOCK_MS ? a : null;
    };
    if (keys.some(({ key, max }) => (active(key)?.failures ?? 0) >= max)) {
      return json({ error: "Zu viele Fehlversuche – bitte später erneut" }, 429);
    }
    if (!safeEqual(provided, pin)) {
      await db.from("admin_attempts").upsert(
        keys.map(({ key }) => {
          const a = active(key);
          return {
            key,
            failures: a ? a.failures + 1 : 1,
            window_start: a ? a.window_start : new Date().toISOString(),
          };
        }),
      );
      return json({ error: "Falsche PIN" }, 401);
    }
    if (active(`ip:${ip}`)) await db.from("admin_attempts").delete().eq("key", `ip:${ip}`);
  }

  const matchId = String(body.matchId ?? "");
  const validId = /^m\d{2}$/.test(matchId);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const groupId = String(body.groupId ?? "");
  const memberId = String(body.memberId ?? "");
  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (!error) return json({ ok: true, data });
    // Funktion fehlt → SQL-Update; „not found“ → schon erledigt/weg; sonst echte Meldung.
    if (error.code === "PGRST202" || /does not exist|could not find/i.test(error.message))
      return json({ error: "Server-Funktion fehlt – SQL-Updates ausgeführt?" }, 500);
    if (error.message.includes("not found"))
      return json({ error: "Nicht (mehr) vorhanden – vielleicht schon erledigt." }, 404);
    return json({ error: `Fehlgeschlagen: ${error.message}` }, 500);
  };

  // Für das Protokoll: Namen vorher holen (nach dem Löschen sind sie weg).
  const ctx = LOGGED.has(String(body.action)) ? await logContext(db, body) : {};
  const route = async (): Promise<Response> => {
    switch (body.action) {
      case "verify":
        return json({ ok: true });

      case "set": {
        if (!validId || !STATUSES.includes(body.status))
          return json({ error: "Ungültige Daten" }, 400);
        const row = {
          match_id: matchId,
          status: body.status,
          score_home: clampInt(body.scoreHome, 0, 50) ?? 0,
          score_away: clampInt(body.scoreAway, 0, 50) ?? 0,
          pens_home: body.pensHome == null ? null : clampInt(body.pensHome, 0, 50),
          pens_away: body.pensAway == null ? null : clampInt(body.pensAway, 0, 50),
          phase: PHASES.includes(body.phase) ? body.phase : null,
          updated_at: new Date().toISOString(),
          // Stand der Live-Quelle beim Speichern: Ändert sie sich danach, gilt
          // wieder die Quelle (die Korrektur überbrückt nur).
          source_sig: typeof body.sourceSig === "string" ? body.sourceSig.slice(0, 100) : null,
        };
        let { error } = await db.from("match_overrides").upsert(row);
        if (error) {
          // Spalte source_sig noch nicht angelegt (SQL-Update fehlt) → ohne speichern.
          const { source_sig: _unused, ...legacy } = row;
          ({ error } = await db.from("match_overrides").upsert(legacy));
        }
        return error ? json({ error: "Speichern fehlgeschlagen" }, 500) : json({ ok: true, row });
      }

      case "clear": {
        if (!validId) return json({ error: "Ungültige Daten" }, 400);
        const { error } = await db.from("match_overrides").delete().eq("match_id", matchId);
        return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true });
      }

      case "stats": {
        const since = (ms: number) => new Date(Date.now() - ms).toISOString();
        // Push-Zustand: anstehende und in 24 h verschickte Erinnerungen.
        const head = { count: "exact" as const, head: true };
        const pushCounts = () =>
          Promise.all([
            db
              .from("match_alarms")
              .select("device_id", head)
              .gt("kickoff_utc", new Date().toISOString()),
            db
              .from("match_alarms")
              .select("device_id", head)
              .gte("notified_for", since(86_400_000))
              .lte("notified_for", new Date(Date.now() + 3_600_000).toISOString()),
          ]);
        // Ausführliche Statistik (SQL-Update „Admin-Ausbau“) enthält schon alles Übrige.
        const { data: ext } = await db.rpc("kt_admin_stats");
        if (ext) {
          const [upcoming, sent24h] = await pushCounts();
          return json({
            online: ext.online,
            day: ext.day,
            week: ext.week,
            total: ext.total,
            topTeams: ext.topTeams,
            push: {
              subscriptions: ext.subscriptions,
              upcoming: upcoming.count ?? 0,
              sent24h: sent24h.count ?? 0,
            },
            ext,
          });
        }
        const count = async (from?: string) => {
          let q = db.from("app_pings").select("client_id", { count: "exact", head: true });
          if (from) q = q.gte("last_ping", from);
          const { count } = await q;
          return count ?? 0;
        };
        const [online, day, week, total] = await Promise.all([
          count(since(10 * 60_000)),
          count(since(86_400_000)),
          count(since(7 * 86_400_000)),
          count(),
        ]);
        const { data: favs } = await db
          .from("app_pings")
          .select("fav_team")
          .not("fav_team", "is", null)
          .limit(5000);
        const tally = new Map<string, number>();
        for (const r of favs ?? []) tally.set(r.fav_team, (tally.get(r.fav_team) ?? 0) + 1);
        const topTeams = [...tally.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([team, count]) => ({ team, count }));
        const [subs, [upcoming, sent24h]] = await Promise.all([
          db.from("push_subscriptions").select("device_id", head),
          pushCounts(),
        ]);
        const push = {
          subscriptions: subs.count ?? 0,
          upcoming: upcoming.count ?? 0,
          sent24h: sent24h.count ?? 0,
        };
        return json({ online, day, week, total, topTeams, push, ext: null });
      }

      // Anstoßzeiten für die Tipprunden-Sperre (kt_fixtures) aus der App übernehmen.
      case "fixtures": {
        const list = Array.isArray(body.fixtures) ? body.fixtures.slice(0, 60) : [];
        const rows = list
          .filter(
            (f: { matchId?: string; kickoffUtc?: string }) =>
              /^m\d{2}$/.test(String(f.matchId)) && !Number.isNaN(Date.parse(String(f.kickoffUtc))),
          )
          .map((f: { matchId: string; kickoffUtc: string; title?: unknown }) => ({
            match_id: f.matchId,
            kickoff_utc: new Date(f.kickoffUtc).toISOString(),
            // Paarung für die Tipp-Erinnerung („Deutschland – Schottland“), sonst leer.
            title: typeof f.title === "string" ? f.title.trim().slice(0, 80) || null : null,
          }));
        if (rows.length === 0) return json({ error: "Keine gültigen Anstoßzeiten" }, 400);
        let { error } = await db.from("kt_fixtures").upsert(rows);
        if (error) {
          // Spalte title noch nicht angelegt (SQL-Update fehlt) → ohne speichern.
          ({ error } = await db
            .from("kt_fixtures")
            .upsert(rows.map(({ title: _t, ...r }: { title: string | null }) => r)));
        }
        return error
          ? json({ error: "Speichern fehlgeschlagen (SQL-Update Tipprunde ausgeführt?)" }, 500)
          : json({ ok: true, count: rows.length });
      }

      // Anstoßzeiten der Tipp-Sperre lesen (Team-App vergleicht sie mit den eigenen).
      case "fixtures_list": {
        const { data, error } = await db
          .from("kt_fixtures")
          .select("match_id, kickoff_utc, title")
          .order("match_id");
        return error ? json({ error: "Lesen fehlgeschlagen" }, 500) : json({ rows: data ?? [] });
      }

      case "feedback": {
        const { data } = await db
          .from("app_feedback")
          .select("id, rating, message, created_at, app_version, category")
          .order("created_at", { ascending: false })
          .limit(50);
        return json({ rows: data ?? [] });
      }

      // Alle Tipprunden löschen (zum Aufräumen nach dem Testen).
      case "delete_tip_groups": {
        const { data, error } = await db.rpc("kt_admin_delete_tip_groups");
        if (!error) return json({ ok: true, count: data ?? 0 });
        // Rückfall ohne SQL-Update: direkt löschen (Mitglieder/Tipps fallen mit).
        const { error: delErr, count } = await db
          .from("tip_groups")
          .delete({ count: "exact" })
          .not("id", "is", null);
        return delErr
          ? json({ error: "Löschen fehlgeschlagen" }, 500)
          : json({ ok: true, count: count ?? 0 });
      }

      case "feedback_delete": {
        const q = db.from("app_feedback").delete();
        const { error } =
          body.id === "all" ? await q.not("id", "is", null) : await q.eq("id", Number(body.id));
        return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true });
      }

      case "clear_overrides": {
        const { error, count } = await db
          .from("match_overrides")
          .delete({ count: "exact" })
          .not("match_id", "is", null);
        return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true, count });
      }

      // ---- Live-Quelle & Einstellungen ----

      case "config": {
        const { data, error } = await db.from("app_config").select("key, value, updated_at");
        if (error) return json({ error: "SQL-Update „Admin-Ausbau“ fehlt noch" }, 500);
        const get = (k: string) => data?.find((r: { key: string }) => r.key === k) ?? null;
        const { data: cache } = await db.from("live_cache").select("id, fetched_at");
        const { count: stored } = await db
          .from("match_results")
          .select("external_id", { count: "exact", head: true });
        return json({
          liveSource: get("live_source")?.value ?? null,
          defaults: {
            league: Deno.env.get("OPENLIGA_LEAGUE") ?? "em",
            season: Deno.env.get("OPENLIGA_SEASON") ?? "2028",
            backup: "uefa.euro",
          },
          announcement: get("announcement")?.value ?? null,
          cache: cache ?? [],
          storedResults: stored ?? 0,
        });
      }

      case "set_source":
      case "test_source": {
        const league = String(body.league ?? "")
          .trim()
          .toLowerCase();
        const season = String(body.season ?? "").trim();
        const suffix = String(body.suffix ?? "").trim();
        // Zweitquelle ESPN: Liga-Kürzel wie „uefa.euro“, leer = aus.
        const backup = String(body.backup ?? "")
          .trim()
          .toLowerCase();
        if (
          !/^[a-z0-9_]{1,30}$/.test(league) ||
          !/^\d{4}$/.test(season) ||
          !/^(\d{1,3})?$/.test(suffix) ||
          !/^([a-z0-9]{2,12}(\.[a-z0-9_]{1,20})?)?$/.test(backup)
        )
          return json(
            {
              error:
                "Liga (Buchstaben/Zahlen), Saison (4 Ziffern), Endung (Zahl) und ESPN-Liga (z. B. uefa.euro) prüfen",
            },
            400,
          );
        const url = `https://api.openligadb.de/getmatchdata/${league}/${season}${suffix ? `/${suffix}` : ""}`;
        if (body.action === "set_source") {
          const value = { league, season, suffix, paused: body.paused === true, backup };
          const { error } = await db
            .from("app_config")
            .upsert({ key: "live_source", value, updated_at: new Date().toISOString() });
          return error ? json({ error: "Speichern fehlgeschlagen" }, 500) : json({ ok: true, url });
        }
        try {
          const res = await fetch(url, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) return json({ ok: true, url, status: res.status, count: 0 });
          const raw = await res.json();
          const list = Array.isArray(raw) ? raw : [];
          type M = {
            matchDateTimeUTC?: string;
            matchIsFinished?: boolean;
            team1?: { teamName?: string };
            team2?: { teamName?: string };
          };
          const times = list
            .map((m: M) => Date.parse(String(m.matchDateTimeUTC)))
            .filter((t: number) => !Number.isNaN(t))
            .sort((a: number, b: number) => a - b);
          return json({
            ok: true,
            url,
            status: res.status,
            count: list.length,
            finished: list.filter((m: M) => m.matchIsFinished).length,
            from: times.length ? new Date(times[0]).toISOString() : null,
            to: times.length ? new Date(times[times.length - 1]).toISOString() : null,
            sample: list
              .slice(0, 3)
              .map((m: M) => `${m.team1?.teamName ?? "?"} – ${m.team2?.teamName ?? "?"}`),
          });
        } catch (err) {
          return json({ ok: true, url, status: 0, count: 0, error: String(err) });
        }
      }

      case "clear_cache": {
        const { error } = await db.from("live_cache").delete().not("id", "is", null);
        return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true });
      }

      // Gespeicherte Endergebnisse verwerfen (z. B. nach einem Test mit einer anderen Liga).
      case "reset_results": {
        const { error, count } = await db
          .from("match_results")
          .delete({ count: "exact" })
          .not("external_id", "is", null);
        await db.from("live_cache").delete().not("id", "is", null);
        return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true, count });
      }

      case "set_announcement": {
        const text = String(body.text ?? "")
          .trim()
          .slice(0, 280);
        if (!text) {
          const { error } = await db.from("app_config").delete().eq("key", "announcement");
          return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true });
        }
        const until =
          body.until && !Number.isNaN(Date.parse(String(body.until)))
            ? new Date(String(body.until)).toISOString()
            : null;
        const value = {
          id: Date.now(),
          text,
          tone: ["info", "warn", "success"].includes(body.tone) ? body.tone : "info",
          until,
        };
        const { error } = await db
          .from("app_config")
          .upsert({ key: "announcement", value, updated_at: new Date().toISOString() });
        return error ? json({ error: "Speichern fehlgeschlagen" }, 500) : json({ ok: true, value });
      }

      // Push an alle Abonnenten – oder nur an ein Gerät (Test).
      case "broadcast": {
        const title = String(body.title ?? "")
          .trim()
          .slice(0, 60);
        const text = String(body.body ?? "")
          .trim()
          .slice(0, 180);
        const url = /^\/[\w\-/?=&.]*$/.test(String(body.url ?? "")) ? String(body.url) : "/";
        if (!title || !text) return json({ error: "Titel und Text angeben" }, 400);
        try {
          webpush.setVapidDetails(
            env("VAPID_SUBJECT", "mailto:kontakt@kicktime.app"),
            env("VAPID_PUBLIC_KEY"),
            env("VAPID_PRIVATE_KEY"),
          );
        } catch {
          return json({ error: "VAPID-Secrets fehlen" }, 500);
        }
        let q = db.from("push_subscriptions").select("device_id, endpoint, p256dh, auth");
        if (body.onlyDevice) {
          if (!UUID.test(String(body.onlyDevice))) return json({ error: "Ungültiges Gerät" }, 400);
          q = q.eq("device_id", String(body.onlyDevice));
        }
        const { data: subs, error } = await q.limit(5000);
        if (error) return json({ error: "Abos nicht lesbar" }, 500);
        type Sub = { device_id: string; endpoint: string; p256dh: string; auth: string };
        const queue = [...((subs ?? []) as Sub[])];
        const payload = JSON.stringify({ title, body: text, url, tag: `admin-${Date.now()}` });
        let sent = 0;
        let failed = 0;
        const expired: string[] = [];
        await Promise.all(
          Array.from({ length: Math.min(10, queue.length) }, async () => {
            for (let s = queue.shift(); s; s = queue.shift()) {
              try {
                await webpush.sendNotification(
                  { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                  payload,
                  { TTL: 6 * 3600, urgency: "normal" },
                );
                sent++;
              } catch (err) {
                const status = (err as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410) expired.push(s.device_id);
                else failed++;
              }
            }
          }),
        );
        if (expired.length > 0)
          await db.from("push_subscriptions").delete().in("device_id", expired);
        return json({ ok: true, total: subs?.length ?? 0, sent, failed, cleaned: expired.length });
      }

      // ---- Tipprunden verwalten ----

      case "groups":
        return rpc("kt_admin_groups");

      case "group":
        if (!UUID.test(groupId)) return json({ error: "Ungültige Runde" }, 400);
        return rpc("kt_admin_group", { p_group: groupId });

      case "group_delete":
        if (!UUID.test(groupId)) return json({ error: "Ungültige Runde" }, 400);
        return rpc("kt_admin_delete_group", { p_group: groupId });

      case "member_remove":
        if (!UUID.test(groupId) || !UUID.test(memberId))
          return json({ error: "Ungültige Daten" }, 400);
        return rpc("kt_admin_remove_member", {
          p_group: groupId,
          p_member: memberId,
          p_ban: body.ban === true,
        });

      case "member_unban": {
        if (!UUID.test(groupId) || !UUID.test(memberId))
          return json({ error: "Ungültige Daten" }, 400);
        const { error } = await db.rpc("kt_admin_unban", { p_group: groupId, p_member: memberId });
        if (error?.message.includes("global"))
          return json({ error: "Überall gesperrt – unter „Anträge“ überall entsperren." }, 400);
        return error ? json({ error: "Fehlgeschlagen" }, 500) : json({ ok: true });
      }

      // ---- Sperren überall & Entsperrungsanträge ----

      case "requests":
        return rpc("kt_admin_requests");

      case "decide": {
        const id = Number(body.id);
        if (!Number.isInteger(id) || id <= 0) return json({ error: "Ungültiger Antrag" }, 400);
        return rpc("kt_admin_decide", {
          p_id: id,
          p_accept: body.accept === true,
          p_reply:
            String(body.reply ?? "")
              .trim()
              .slice(0, 300) || null,
        });
      }

      case "ban_global": {
        if (!UUID.test(groupId) || !UUID.test(memberId))
          return json({ error: "Ungültige Daten" }, 400);
        const { data: device, error } = await db.rpc("kt_admin_member_device", {
          p_group: groupId,
          p_member: memberId,
        });
        if (error || !device) return json({ error: "Mitglied nicht gefunden" }, 404);
        return rpc("kt_admin_ban_global", {
          p_device: device,
          p_reason:
            String(body.reason ?? "")
              .trim()
              .slice(0, 300) || null,
        });
      }

      case "unban_global": {
        let device = String(body.device ?? "");
        if (!UUID.test(device) && UUID.test(groupId) && UUID.test(memberId)) {
          const { data } = await db.rpc("kt_admin_member_device", {
            p_group: groupId,
            p_member: memberId,
          });
          device = String(data ?? "");
        }
        if (!UUID.test(device)) return json({ error: "Ungültige Daten" }, 400);
        return rpc("kt_admin_unban_global", { p_device: device });
      }

      case "global_bans":
        return rpc("kt_admin_global_bans");

      // Team-Mitteilungen (Anträge, Wächter): nur ausdrücklich eingetragene Geräte.
      case "team_device": {
        const device = String(body.deviceId ?? "");
        if (!UUID.test(device)) return json({ error: "Ungültiges Gerät" }, 400);
        const { data: row } = await db
          .from("app_config")
          .select("value")
          .eq("key", "admin_devices")
          .maybeSingle();
        let list: string[] = Array.isArray(row?.value?.devices) ? row.value.devices : [];
        const live = await withPush(db, [...list, device]);
        // Beim Eintragen Geräte ohne Mitteilungs-Abo aussortieren (z. B. App neu
        // installiert → neue Geräte-ID): an die käme nie etwas an.
        if (body.mode === "on")
          list = [...new Set([...list.filter((d) => live.has(d)), device])].slice(-5);
        if (body.mode === "off") list = list.filter((d) => d !== device);
        if (body.mode === "only") list = [device];
        if (body.mode) {
          const { error } = await db.from("app_config").upsert({
            key: "admin_devices",
            value: { devices: list },
            updated_at: new Date().toISOString(),
          });
          if (error) return json({ error: "Speichern fehlgeschlagen" }, 500);
        }
        // Letzte Zustellung je eingetragenem Gerät (SQL-Update „Zustell-Bestätigung“).
        const { data: deliv } = list.length
          ? await db
              .from("kt_team_delivery")
              .select("device_id, last_ok_at, last_fail_at, last_status")
              .in("device_id", list)
          : { data: [] };
        type Deliv = {
          device_id: string;
          last_ok_at: string | null;
          last_fail_at: string | null;
          last_status: number | null;
        };
        return json({
          ok: true,
          registered: list.includes(device),
          count: list.length,
          // Wie viele eingetragene Geräte wirklich Mitteilungen empfangen können.
          reachable: list.filter((d) => live.has(d)).length,
          selfPush: live.has(device),
          devices: list.map((d) => {
            const x = ((deliv ?? []) as Deliv[]).find((r) => r.device_id === d);
            return {
              self: d === device,
              push: live.has(d),
              lastOk: x?.last_ok_at ?? null,
              lastFail: x?.last_fail_at ?? null,
              lastStatus: x?.last_status ?? null,
            };
          }),
        });
      }

      // ---- Wächter ----

      case "alerts": {
        const { data, error } = await db
          .from("kt_alerts")
          .select("key, message, active, first_at, last_seen_at, resolved_at")
          .order("active", { ascending: false })
          .order("last_seen_at", { ascending: false })
          .limit(30);
        if (error) return json({ alerts: null }); // SQL-Update fehlt noch
        return json({ alerts: data ?? [] });
      }

      // Test: Mitteilung an alle eingetragenen Team-Geräte (kommt in ~1 Minute).
      case "alert_test": {
        const { data: row } = await db
          .from("app_config")
          .select("value")
          .eq("key", "admin_devices")
          .maybeSingle();
        const devices: string[] = Array.isArray(row?.value?.devices) ? row.value.devices : [];
        if (devices.length === 0)
          return json({ error: "Kein Gerät für Team-Mitteilungen eingetragen" }, 400);
        const live = await withPush(db, devices);
        const targets = devices.filter((d) => live.has(d));
        if (targets.length === 0)
          return json(
            {
              error:
                "Kein eingetragenes Gerät kann Mitteilungen empfangen – dieses Gerät neu eintragen",
            },
            400,
          );
        const { error } = await db.from("kt_push_queue").insert(
          targets.map((d) => ({
            device_id: d,
            title: "🔔 KickTime-Wächter: Test",
            body: "So sehen Warnungen aus, wenn Live-Daten ausfallen.",
            url: "/einstellungen",
            tag: "alert-test",
          })),
        );
        return error
          ? json({ error: "Speichern fehlgeschlagen" }, 500)
          : json({ ok: true, count: targets.length, skipped: devices.length - targets.length });
      }

      case "owner_transfer":
        if (!UUID.test(groupId) || !UUID.test(memberId))
          return json({ error: "Ungültige Daten" }, 400);
        return rpc("kt_admin_transfer", { p_group: groupId, p_member: memberId });

      // ---- Team-App: Personensuche, Rundentabelle, Protokoll ----

      case "find_person": {
        const query = String(body.query ?? "")
          .trim()
          .slice(0, 60);
        if (query.length < 2) return json({ ok: true, data: [] });
        return rpc("kt_admin_find_person", { p_query: query });
      }

      case "group_board":
        if (!UUID.test(groupId)) return json({ error: "Ungültige Runde" }, 400);
        return rpc("kt_admin_group_board", { p_group: groupId });

      case "team_log": {
        const { data, error } = await db
          .from("kt_team_log")
          .select("id, at, action, detail, device_id")
          .order("at", { ascending: false })
          .limit(200);
        if (error) return json({ rows: null }); // SQL-Update fehlt noch
        return json({ rows: data ?? [] });
      }

      // ---- Face ID (Passkeys) ----

      case "passkey_register_options": {
        const o = originOf(req);
        if (!o) return json({ error: "Nur aus der Team-App (https) möglich" }, 400);
        const { data: existing, error } = await db
          .from("kt_team_passkeys")
          .select("id, transports")
          .eq("rp_id", o.rpID);
        if (error) return json({ error: "Server-Funktion fehlt – SQL-Updates ausgeführt?" }, 500);
        if ((existing ?? []).length >= MAX_PASSKEYS)
          return json({ error: `Höchstens ${MAX_PASSKEYS} Geräte – erst eins entfernen` }, 400);
        const options = await generateRegistrationOptions({
          rpName: "KickTime-Team",
          rpID: o.rpID,
          userName: "kicktime-team",
          userDisplayName: "KickTime-Team",
          userID: te.encode("kicktime-team"),
          attestationType: "none",
          excludeCredentials: (existing as { id: string; transports: string[] | null }[]).map(
            (c) => ({
              id: c.id,
              // deno-lint-ignore no-explicit-any
              transports: (c.transports ?? undefined) as any,
            }),
          ),
          authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
          timeout: 60_000,
        });
        await saveChallenge(db, options.challenge, "register");
        return json({ ok: true, options });
      }

      case "passkey_register": {
        const o = originOf(req);
        // deno-lint-ignore no-explicit-any
        const resp = body.response as any;
        if (!o || !resp?.response?.clientDataJSON) return json({ error: "Ungültige Daten" }, 400);
        const challenge = await takeChallenge(db, resp.response.clientDataJSON, "register");
        if (!challenge) return json({ error: "Abgelaufen – bitte noch einmal" }, 400);
        try {
          const v = await verifyRegistrationResponse({
            response: resp,
            expectedChallenge: challenge,
            expectedOrigin: o.origin,
            expectedRPID: o.rpID,
            requireUserVerification: true,
          });
          if (!v.verified || !v.registrationInfo)
            return json({ error: "Face ID nicht bestätigt" }, 400);
          const c = v.registrationInfo.credential;
          const { error } = await db.from("kt_team_passkeys").upsert({
            id: c.id,
            public_key: isoBase64URL.fromBuffer(c.publicKey),
            counter: c.counter,
            transports: c.transports ?? resp.response.transports ?? null,
            label:
              String(body.label ?? "")
                .trim()
                .slice(0, 40) || null,
            rp_id: o.rpID,
            origin: o.origin,
          });
          return error
            ? json({ error: "Speichern fehlgeschlagen" }, 500)
            : json({ ok: true, id: c.id });
        } catch {
          return json({ error: "Face ID nicht bestätigt" }, 400);
        }
      }

      case "passkey_list": {
        const o = originOf(req);
        const { data, error } = await db
          .from("kt_team_passkeys")
          .select("id, label, rp_id, created_at, last_used_at")
          .order("created_at", { ascending: true });
        if (error) return json({ ok: true, data: null }); // SQL-Update fehlt noch
        return json({
          ok: true,
          data: (data ?? []).map((r: { rp_id: string }) => ({ ...r, here: r.rp_id === o?.rpID })),
        });
      }

      case "passkey_delete": {
        const { error } = await db
          .from("kt_team_passkeys")
          .delete()
          .eq("id", String(body.id ?? ""));
        return error ? json({ error: "Löschen fehlgeschlagen" }, 500) : json({ ok: true });
      }

      default:
        return json({ error: "Unbekannte Aktion" }, 400);
    }
  };
  const res = await route();
  if (res.ok && LOGGED.has(String(body.action)))
    await writeLog(
      db,
      body,
      ctx,
      await res
        .clone()
        .json()
        .catch(() => ({})),
    );
  return res;
});
