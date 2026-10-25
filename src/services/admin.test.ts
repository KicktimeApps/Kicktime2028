import { beforeEach, describe, expect, it, vi } from "vitest";

// Edge Function nachstellen: zählt gleichzeitige Aufrufe, antwortet nach Wunsch.
let active = 0;
let peak = 0;
let answers: { data?: unknown; status?: number }[] = [];
const invoke = vi.fn(async () => {
  active++;
  peak = Math.max(peak, active);
  await new Promise((r) => setTimeout(r, 5));
  active--;
  const a = answers.shift() ?? { data: { ok: true } };
  if (a.status)
    return {
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: new Response(JSON.stringify({ error: "Zu viele Fehlversuche" }), {
          status: a.status,
        }),
      },
    };
  return { data: a.data, error: null };
});

vi.mock("./supabase", () => ({
  getSupabase: async () => ({ functions: { invoke } }),
}));

const admin = await import("./admin");

describe("Admin-Aufrufe", () => {
  beforeEach(() => {
    active = 0;
    peak = 0;
    answers = [];
    invoke.mockClear();
  });

  it("höchstens zwei gleichzeitig – sonst sperrt der Server das Team aus", async () => {
    const all = await Promise.all([
      admin.fetchStats("123456"),
      admin.fetchConfig("123456"),
      admin.fetchGroups("123456"),
      admin.fetchAlerts("123456"),
      admin.fetchFeedback("123456"),
      admin.fetchRequests("123456"),
    ]);
    expect(all.every((r) => r.ok)).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(6);
    expect(peak).toBe(2);
  });

  it("„zu viele“ (429) wird einmal wiederholt, falsche PIN nie", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"], shouldAdvanceTime: true });
    try {
      answers = [{ status: 429 }, { data: { alerts: [] } }];
      const r = await admin.fetchAlerts("123456");
      expect(r.ok).toBe(true);
      expect(invoke).toHaveBeenCalledTimes(2);

      invoke.mockClear();
      answers = [{ status: 429 }];
      expect(await admin.verifyPin("123456")).toBe(false);
      expect(invoke).toHaveBeenCalledTimes(1);

      invoke.mockClear();
      answers = [{ status: 401 }];
      expect((await admin.fetchStats("000000")).ok).toBe(false);
      expect(invoke).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
