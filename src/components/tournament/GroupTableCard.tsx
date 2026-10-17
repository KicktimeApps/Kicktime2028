import { Star } from "lucide-react";
import { Flag } from "@/components/team/Flag";
import { hostHint, teamDisplay } from "@/domain/labels";
import type { GroupTable } from "@/domain/standings";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useUi } from "@/store/ui-store";

/**
 * Gruppentabelle. Farbcodes: Platz 1–2 direkt weiter (Primär), Platz 3
 * hofft auf die besten Dritten (Gold), Platz 4 raus.
 */
export function GroupTableCard({
  table,
  highlight = [],
  thirdQualified,
  hideScores = false,
  compact = false,
}: {
  table: GroupTable;
  highlight?: string[];
  thirdQualified?: boolean | null;
  hideScores?: boolean;
  compact?: boolean;
}) {
  const favorites = useAppStore((s) => s.favorites);
  const openTeam = useUi((s) => s.openTeam);
  // Bei Spoilerschutz verrät schon die Reihenfolge das Ergebnis → alphabetisch.
  const rows = table.drawn
    ? hideScores
      ? [...table.rows].sort((x, y) =>
          teamDisplay(x.code, "").name.localeCompare(teamDisplay(y.code, "").name, "de"),
        )
      : table.rows
    : [1, 2, 3, 4].map((i) => ({ code: `${table.group}${i}`, placeholder: true }) as const);
  const ranked = table.drawn && !hideScores;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
        <h3 className="font-display text-lg font-bold uppercase tracking-wide">
          Gruppe {table.group}
        </h3>
        {table.complete && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Abgeschlossen
          </span>
        )}
      </div>
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="w-8 py-2 pl-4 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Team</th>
            <th className="w-8 py-2 text-center font-medium">Sp</th>
            {!compact && (
              <th className="hidden w-14 py-2 text-center font-medium sm:table-cell">Tore</th>
            )}
            <th className="w-10 py-2 text-center font-medium">Diff</th>
            <th className="w-12 py-2 pr-4 text-right font-medium">Pkt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const placeholder = "placeholder" in r;
            const t = placeholder ? teamDisplay(null, r.code) : teamDisplay(r.code, r.code);
            const zone = !ranked
              ? "none"
              : i < 2
                ? "q"
                : i === 2
                  ? thirdQualified === false
                    ? "out"
                    : "third"
                  : "out";
            const hl = !placeholder && highlight.includes(r.code);
            const blur = hideScores && !placeholder;
            return (
              <tr key={r.code} className={cn("border-t border-border/50", hl && "bg-primary/8")}>
                <td className="py-2.5 pl-4">
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold tabular",
                      table.drawn && zone === "q" && "bg-primary/15 text-primary",
                      table.drawn && zone === "third" && "bg-gold/15 text-gold",
                      (!table.drawn || zone === "out" || zone === "none") &&
                        "text-muted-foreground",
                    )}
                  >
                    {ranked || !table.drawn ? i + 1 : "–"}
                  </span>
                </td>
                <td className="py-2.5">
                  {placeholder ? (
                    <span className="flex items-center gap-2.5 text-muted-foreground">
                      <Flag flag={null} size="sm" />
                      <span className="truncate">
                        {t.name}
                        {hostHint(r.code) && (
                          <span className="ml-1 text-[11px]">({hostHint(r.code)})</span>
                        )}
                      </span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openTeam(r.code)}
                      className="flex min-w-0 items-center gap-2.5 text-left hover:text-primary"
                    >
                      <Flag flag={t.flag} size="sm" />
                      <span className={cn("truncate", hl ? "font-bold" : "font-medium")}>
                        {compact ? t.short : t.name}
                      </span>
                      {favorites.includes(r.code) && (
                        <Star className="h-3 w-3 shrink-0 fill-gold text-gold" />
                      )}
                    </button>
                  )}
                </td>
                {placeholder ? (
                  <>
                    <td className="text-center text-muted-foreground">–</td>
                    {!compact && (
                      <td className="hidden text-center text-muted-foreground sm:table-cell">–</td>
                    )}
                    <td className="text-center text-muted-foreground">–</td>
                    <td className="pr-4 text-right text-muted-foreground">–</td>
                  </>
                ) : (
                  <>
                    <td
                      className={cn(
                        "text-center tabular text-muted-foreground",
                        blur && "blur-[5px]",
                      )}
                    >
                      {r.played}
                    </td>
                    {!compact && (
                      <td
                        className={cn(
                          "hidden text-center tabular text-muted-foreground sm:table-cell",
                          blur && "blur-[5px]",
                        )}
                      >
                        {r.goalsFor}:{r.goalsAgainst}
                      </td>
                    )}
                    <td className={cn("text-center tabular", blur && "blur-[5px]")}>
                      {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                    </td>
                    <td
                      className={cn(
                        "pr-4 text-right font-display text-[17px] font-bold tabular",
                        blur && "blur-[5px]",
                      )}
                    >
                      {r.points}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
