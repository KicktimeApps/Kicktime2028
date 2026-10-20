import type { Appeal, BanStatus } from "@/services/tipgroups";

export const APPEAL_COOLDOWN_DAYS = 7;
export const APPEAL_MAX = 3;

/** Wofür beantragt wird – passt zu den Regeln auf dem Server. */
export type AppealKey =
  | { scope: "global"; memberId?: string }
  | { scope: "group"; groupId: string; memberId?: string };

export type AppealState =
  | { kind: "none" }
  | { kind: "open"; since: string }
  | { kind: "rejected"; reply: string | null; next: number | null; left: number }
  | { kind: "accepted" }
  | { kind: "limit"; reply: string | null };

/**
 * Stand der eigenen Anträge zu einer Sperre: offen, abgelehnt (mit Wartezeit),
 * angenommen oder keine weiteren möglich.
 */
export function appealState(
  status: BanStatus | undefined,
  key: AppealKey,
  now = Date.now(),
): AppealState {
  const list = (status?.requests ?? []).filter(
    (r: Appeal) =>
      r.scope === key.scope &&
      (key.scope === "global" || r.groupId === key.groupId) &&
      (key.memberId ? r.forMember && r.memberId === key.memberId : !r.forMember),
  );
  if (list.length === 0) return { kind: "none" };
  const last = list[list.length - 1];
  if (last.status === "open") return { kind: "open", since: last.createdAt };
  if (last.status === "accepted") return { kind: "accepted" };
  if (list.length >= APPEAL_MAX) return { kind: "limit", reply: last.reply };
  const next = last.decidedAt
    ? Date.parse(last.decidedAt) + APPEAL_COOLDOWN_DAYS * 86_400_000
    : null;
  return {
    kind: "rejected",
    reply: last.reply,
    next: next && next > now ? next : null,
    left: APPEAL_MAX - list.length,
  };
}
