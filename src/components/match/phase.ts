import type { MatchView } from "@/domain/types";

export function phaseLabel(m: Pick<MatchView, "status" | "phase" | "hasData">): string {
  if (m.status !== "live") return "";
  if (!m.hasData) return "läuft";
  switch (m.phase) {
    case "first":
      return "1. Halbzeit";
    case "half":
      return "Halbzeit";
    case "second":
      return "2. Halbzeit";
    case "extra":
      return "Verlängerung";
    case "penalties":
      return "Elfmeter";
    default:
      return "läuft";
  }
}
