import { describe, expect, it } from "vitest";
import type { Appeal } from "@/services/tipgroups";
import { appealState } from "./appeals";

const now = Date.parse("2027-03-10T12:00:00Z");
const day = 86_400_000;
const a = (o: Partial<Appeal>): Appeal => ({
  id: 1,
  scope: "global",
  groupId: null,
  groupName: null,
  forMember: false,
  memberId: null,
  handler: "team",
  status: "open",
  reply: null,
  createdAt: new Date(now - day).toISOString(),
  decidedAt: null,
  ...o,
});
const status = (requests: Appeal[]) => ({ global: true, requests });

describe("appealState", () => {
  it("ohne Antrag", () =>
    expect(appealState(status([]), { scope: "global" }, now).kind).toBe("none"));
  it("offen", () =>
    expect(appealState(status([a({})]), { scope: "global" }, now).kind).toBe("open"));
  it("abgelehnt vor 2 Tagen → warten", () => {
    const s = appealState(
      status([a({ status: "rejected", decidedAt: new Date(now - 2 * day).toISOString() })]),
      { scope: "global" },
      now,
    );
    expect(s.kind === "rejected" && s.next).toBeTruthy();
  });
  it("abgelehnt vor 8 Tagen → wieder möglich, noch 2", () => {
    const s = appealState(
      status([a({ status: "rejected", decidedAt: new Date(now - 8 * day).toISOString() })]),
      { scope: "global" },
      now,
    );
    expect(s).toMatchObject({ kind: "rejected", next: null, left: 2 });
  });
  it("3 abgelehnt → keine weiteren", () => {
    const old = new Date(now - 30 * day).toISOString();
    const list = [1, 2, 3].map((id) => a({ id, status: "rejected", decidedAt: old }));
    expect(appealState(status(list), { scope: "global" }, now).kind).toBe("limit");
  });
  it("trennt Runde, eigene Anträge und Anträge für Mitglieder", () => {
    const list = [
      a({ scope: "group", groupId: "g1" }),
      a({ scope: "group", groupId: "g2", forMember: true, memberId: "m1" }),
    ];
    expect(appealState(status(list), { scope: "group", groupId: "g1" }, now).kind).toBe("open");
    expect(appealState(status(list), { scope: "group", groupId: "g2" }, now).kind).toBe("none");
    expect(
      appealState(status(list), { scope: "group", groupId: "g2", memberId: "m1" }, now).kind,
    ).toBe("open");
  });
});
