import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Server-Tests: spielt alle SQL-Updates der Reihe nach in eine echte
 * Postgres-Datenbank im Speicher (PGlite) ein – das neueste zweimal, es muss
 * wiederholbar sein – und prüft die wichtigsten Regeln mit echten Aufrufen,
 * so wie die App sie macht (Rolle `anon`).
 */
const DIR = fileURLToPath(new URL("../migrations/", import.meta.url));
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const KEY =
  "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";

let db: PGlite;
const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;
/** Aufruf als App (anon) – danach wieder volle Rechte. */
async function asApp<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const call = <T = unknown>(sql: string, params: unknown[] = []) =>
  asApp(async () => (await rows<{ r: T }>(`select ${sql} as r`, params))[0].r);

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  for (const f of files) await db.exec(readFileSync(DIR + f, "utf8"));
  await db.exec(readFileSync(DIR + files[files.length - 1], "utf8"));
}, 120_000);

describe("Rechte", () => {
  it("Tabellen sind für die App gesperrt", async () => {
    for (const t of [
      "tip_groups",
      "tip_members",
      "tip_predictions",
      "push_subscriptions",
      "kt_fixtures",
      "app_feedback",
      "kt_client_errors",
      "kt_team_log",
      "admin_attempts",
    ])
      await expect(
        asApp(() => rows(`select * from ${t}`)),
        t,
      ).rejects.toThrow(/permission denied/);
  });
  it("Team- und Server-Funktionen sind für die App gesperrt", async () => {
    for (const f of [
      "kt_admin_groups()",
      "kt_source_summary()",
      "kt_retention_cleanup()",
      "kt_push_cleanup()",
      "kt_fixture_propose('m01', now())",
      "kt_alerts_tidy()",
    ])
      await expect(call(f), f).rejects.toThrow(/permission denied/);
  });
  it("jede SECURITY-DEFINER-Funktion hat einen festen Suchpfad mit pg_temp", async () => {
    const bad = await rows<{ proname: string }>(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef and proname like 'kt\\_%'
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                           where c like 'search_path=%pg_temp' or c = 'search_path=""')`,
    );
    expect(bad.map((r) => r.proname)).toEqual([]);
  });
});

describe("Tipprunden", () => {
  let group: { id: string; code: string };
  let memberB: string;
  it("erstellen, Anfrage stellen, annehmen", async () => {
    group = await call("kt_tip_create($1, 'Bürorunde', 'Anna')", [A]);
    const joined = await call<{ pending: boolean }>("kt_tip_join($1, $2, 'Bert')", [B, group.code]);
    expect(joined.pending).toBe(true);
    // Vor der Annahme darf B nichts sehen.
    await expect(call("kt_tip_board($1, $2)", [B, group.id])).rejects.toThrow(/pending/);
    memberB = (
      await rows<{ member_id: string }>("select member_id from tip_members where device_id = $1", [
        B,
      ])
    )[0].member_id;
    // Nur der Ersteller darf annehmen.
    await expect(call("kt_tip_answer($1, $2, $3, true)", [B, group.id, memberB])).rejects.toThrow(
      /not owner/,
    );
    await call("kt_tip_answer($1, $2, $3, true)", [A, group.id, memberB]);
  });
  it("Tipps nur bis zum Anpfiff, fremde Tipps erst danach sichtbar", async () => {
    await call("kt_tip_set($1, $2, 'm01', 2, 1)", [A, group.id]);
    type Board = { members: { isMe: boolean; tips: Record<string, unknown> }[] };
    let board = await call<Board>("kt_tip_board($1, $2)", [B, group.id]);
    expect(board.members.find((m) => !m.isMe)?.tips).toEqual({});
    // Anpfiff vorbei: sichtbar, aber kein Tippen mehr.
    await db.exec(
      "update kt_fixtures set kickoff_utc = now() - interval '1 minute' where match_id = 'm01'",
    );
    board = await call<Board>("kt_tip_board($1, $2)", [B, group.id]);
    expect(board.members.find((m) => !m.isMe)?.tips).toEqual({ m01: { home: 2, away: 1 } });
    await expect(call("kt_tip_set($1, $2, 'm01', 0, 0)", [B, group.id])).rejects.toThrow(
      /match started/,
    );
    await db.exec(
      "update kt_fixtures set kickoff_utc = '2028-06-09T19:00:00Z' where match_id = 'm01'",
    );
  });
  it("Fremde kommen nicht in die Runde", async () => {
    await expect(call("kt_tip_board($1, $2)", [C, group.id])).rejects.toThrow(/not a member/);
    await expect(call("kt_tip_set($1, $2, 'm02', 1, 1)", [C, group.id])).rejects.toThrow(
      /not a member/,
    );
    await expect(call("kt_tip_remove($1, $2, $3, true)", [B, group.id, memberB])).rejects.toThrow(
      /not owner/,
    );
  });
  it("Gerät vergessen: Leitung geht ans nächste Mitglied, Push-Abo ist weg", async () => {
    await call("kt_save_subscription($1, 'https://fcm.googleapis.com/x', $2, $3, 'UA')", [
      A,
      KEY,
      AUTH,
    ]);
    expect(await call("kt_forget_device($1)", [A])).toEqual({ left: 1 });
    expect(await rows("select owner_device from tip_groups")).toEqual([{ owner_device: B }]);
    expect(await rows("select 1 from push_subscriptions where device_id = $1", [A])).toEqual([]);
  });
});

describe("Absicherung", () => {
  it("Push nur an echte Push-Dienste", async () => {
    await expect(
      call("kt_save_subscription($1, 'https://boese.example.com/x', $2, $3, 'UA')", [C, KEY, AUTH]),
    ).rejects.toThrow(/not allowed/);
  });
  it("Quellen-Meldungen nur von bekannten Geräten", async () => {
    await call("kt_report_source($1, 'espn', 'x')", [C]);
    expect(await rows("select 1 from kt_source_reports where device_id = $1", [C])).toEqual([]);
  });
  it("Feedback: 3 je Gerät am Tag, 300 für alle zusammen", async () => {
    for (let i = 0; i < 3; i++) await call("kt_send_feedback($1, 'idee', null, 'Hallo', '1')", [C]);
    await expect(call("kt_send_feedback($1, 'idee', null, 'Hallo', '1')", [C])).rejects.toThrow(
      /feedback limit/,
    );
    await db.exec(
      "insert into app_feedback (device_id, rating, message) select gen_random_uuid(), 1, 'x' from generate_series(1, 300)",
    );
    await expect(call("kt_send_feedback($1, 'idee', null, 'Hallo', '1')", [A])).rejects.toThrow(
      /feedback limit/,
    );
  });
  it("Fehlermeldungen: gleiche Meldung nur einmal, höchstens 5 je Stunde", async () => {
    await call("kt_report_error($1, 'render', 'Kaputt', '2.19.0')", [C]);
    await call("kt_report_error($1, 'render', 'Kaputt', '2.19.0')", [C]);
    await call("kt_report_error($1, 'unsinn', 'Egal', '2.19.0')", [C]);
    for (let i = 0; i < 8; i++)
      await call("kt_report_error($1, 'api', $2, '2.19.0')", [C, `F${i}`]);
    expect((await rows("select 1 from kt_client_errors where device_id = $1", [C])).length).toBe(5);
  });
});

describe("Anstoßzeiten selbst übernehmen", () => {
  const cur = async () =>
    (
      await rows<{ k: string }>(
        "select kickoff_utc::text as k from kt_fixtures where match_id = 'm05'",
      )
    )[0].k;
  const propose = async (k: string) =>
    (await rows<{ r: string }>("select kt_fixture_propose('m05', $1::timestamptz) as r", [k]))[0].r;
  it("erst nach einem Tag gleicher Meldung, mit Protokoll und Mitteilung", async () => {
    const before = await cur();
    expect(await propose("2028-06-11T16:00:00Z")).toBe("pending");
    expect(await propose("2028-06-11T16:00:00Z")).toBe("pending");
    expect(await cur()).toBe(before);
    await db.exec("update kt_fixture_pending set first_seen = now() - interval '21 hours'");
    expect(await propose("2028-06-11T16:00:00Z")).toBe("adopted");
    expect(await cur()).not.toBe(before);
    expect((await rows("select 1 from kt_team_log where action = 'fixtures_auto'")).length).toBe(1);
    expect(await propose("2028-06-11T16:00:00Z")).toBe("same");
  });
  it("wechselnde Meldungen fangen von vorn an", async () => {
    expect(await propose("2028-06-11T13:00:00Z")).toBe("pending");
    await db.exec("update kt_fixture_pending set first_seen = now() - interval '21 hours'");
    expect(await propose("2028-06-11T19:00:00Z")).toBe("pending");
    expect(await propose("2028-06-11T19:00:00Z")).toBe("pending");
  });
  it("große Sprünge und die letzten 24 Stunden bleiben Sache des Teams", async () => {
    expect(await propose("2028-06-20T16:00:00Z")).toBe("blocked");
    await db.exec(
      "update kt_fixtures set kickoff_utc = now() + interval '5 hours' where match_id = 'm05'",
    );
    expect(
      (
        await rows<{ r: string }>(
          "select kt_fixture_propose('m05', now() + interval '8 hours') as r",
        )
      )[0].r,
    ).toBe("blocked");
  });
});

describe("Löschfristen", () => {
  it("während des Turniers bleibt alles, alte Nutzungs-Einträge gehen", async () => {
    await db.exec(`update kt_fixtures set kickoff_utc = '2028-06-11T16:00:00Z' where match_id = 'm05';
      insert into app_pings (client_id, last_ping) values (gen_random_uuid(), now() - interval '200 days'), (gen_random_uuid(), now());
      insert into kt_client_errors (device_id, category, message, created_at) values (gen_random_uuid(), 'api', 'alt', now() - interval '40 days');`);
    const r = (await rows<{ r: Record<string, number> }>("select kt_retention_cleanup() as r"))[0]
      .r;
    expect(r).toMatchObject({ groups: 0, pings: 1, errors: 1 });
    expect((await rows("select 1 from tip_groups")).length).toBe(1);
  });
  it("sechs Monate nach dem letzten Spiel: Runden, Anträge und Sperren weg", async () => {
    await db.exec(`update kt_fixtures set kickoff_utc = kickoff_utc - interval '3 years';
      update tip_groups set created_at = created_at - interval '3 years 1 month';
      insert into kt_device_bans (device_id, created_at) values (gen_random_uuid(), now() - interval '2 years');
      insert into tip_groups (code, name, owner_device) values ('NEU123', 'Neue Runde', gen_random_uuid());`);
    const r = (await rows<{ r: Record<string, number> }>("select kt_retention_cleanup() as r"))[0]
      .r;
    expect(r.groups).toBe(1);
    // Was nach dem Turnier angelegt wurde, bleibt.
    expect(await rows("select name from tip_groups")).toEqual([{ name: "Neue Runde" }]);
    expect(await rows("select 1 from tip_members")).toEqual([]);
    expect(await rows("select 1 from kt_device_bans")).toEqual([]);
  });
});
