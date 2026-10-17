import { Trophy } from "lucide-react";
import { Chip } from "@/components/common/Chip";
import { OUT_LABEL, type TeamStatus } from "@/domain/status";

export function statusChip(s: TeamStatus | undefined) {
  if (!s) return null;
  switch (s.phase) {
    case "champion":
      return (
        <Chip tone="gold" icon={<Trophy />}>
          Europameister
        </Chip>
      );
    case "alive":
      return (
        <Chip tone="primary">{s.group ? `Gruppe ${s.group} · noch dabei` : "Qualifiziert"}</Chip>
      );
    case "out":
      return <Chip tone="neutral">{s.outIn ? OUT_LABEL[s.outIn] : "Ausgeschieden"}</Chip>;
    case "missed":
      return <Chip tone="neutral">Nicht qualifiziert</Chip>;
    default:
      return <Chip tone="outline">Qualifikation läuft</Chip>;
  }
}
