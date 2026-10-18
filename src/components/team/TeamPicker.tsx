import { Check, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Flag } from "@/components/team/Flag";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { teamMarkOf, useAppStore, type TeamMark } from "@/store/app-store";
import { FEATURED_CODES, NATIONS } from "@/tournament/nations";
import type { Nation } from "@/tournament/types";

function MarkButton({
  active,
  kind,
  onClick,
  label,
}: {
  active: boolean;
  kind: "favorite" | "interesting";
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-semibold transition-colors",
        active
          ? kind === "favorite"
            ? "border-gold/60 bg-gold/15 text-gold"
            : "border-primary/50 bg-primary/12 text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {kind === "favorite" ? (
        <Star className={cn("h-3.5 w-3.5", active && "fill-current")} />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
      <span>{kind === "favorite" ? "Favorit" : "Auch"}</span>
    </button>
  );
}

function TeamRow({ nation }: { nation: Nation }) {
  const mark = useAppStore((s) => teamMarkOf(s, nation.code));
  const setTeamMark = useAppStore((s) => s.setTeamMark);
  const toggle = (m: Exclude<TeamMark, null>) => {
    haptics.tap();
    setTeamMark(nation.code, mark === m ? null : m);
  };
  return (
    <li className="flex items-center gap-3 py-2">
      <Flag flag={nation.flag} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{nation.name}</div>
        {(nation.euroTitles.length > 0 || nation.host) && (
          <div className="truncate text-[12px] text-muted-foreground">
            {nation.host && "Co-Gastgeber"}
            {nation.host && nation.euroTitles.length > 0 && " · "}
            {nation.euroTitles.length > 0 && `${nation.euroTitles.length}× Europameister`}
          </div>
        )}
      </div>
      <MarkButton
        active={mark === "favorite"}
        kind="favorite"
        onClick={() => toggle("favorite")}
        label={`${nation.name} als Favorit`}
      />
      <MarkButton
        active={mark === "interesting"}
        kind="interesting"
        onClick={() => toggle("interesting")}
        label={`${nation.name} interessant`}
      />
    </li>
  );
}

/** Auswahl der Lieblings- und interessanten Teams mit Suche. */
export function TeamPicker() {
  const [q, setQ] = useState("");
  const favorites = useAppStore((s) => s.favorites);
  const interesting = useAppStore((s) => s.interesting);

  const { featured, rest } = useMemo(() => {
    const query = q.trim().toLowerCase();
    const match = (n: Nation) =>
      !query || n.name.toLowerCase().includes(query) || n.code.toLowerCase().includes(query);
    const featured = FEATURED_CODES.map((c) => NATIONS.find((n) => n.code === c)!).filter(match);
    const rest = NATIONS.filter((n) => !FEATURED_CODES.includes(n.code) && match(n)).sort((a, b) =>
      a.name.localeCompare(b.name, "de"),
    );
    return { featured, rest };
  }, [q]);

  return (
    <div>
      <div className="sticky top-[var(--top-offset,0px)] z-10 -mx-1 bg-background px-1 pb-3 pt-1">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Land suchen …"
            className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </label>
        <div className="mt-2 flex gap-3 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-gold text-gold" /> {favorites.length}{" "}
            {favorites.length === 1 ? "Favorit" : "Favoriten"}
          </span>
          <span className="flex items-center gap-1">
            <Check className="h-3 w-3 text-primary" /> {interesting.length} weitere
          </span>
        </div>
      </div>

      {featured.length > 0 && (
        <>
          <h3 className="mb-1 mt-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Beliebt
          </h3>
          <ul className="divide-y divide-border/60">
            {featured.map((n) => (
              <TeamRow key={n.code} nation={n} />
            ))}
          </ul>
        </>
      )}
      {rest.length > 0 && (
        <>
          <h3 className="mb-1 mt-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Alle Nationen A–Z
          </h3>
          <ul className="divide-y divide-border/60">
            {rest.map((n) => (
              <TeamRow key={n.code} nation={n} />
            ))}
          </ul>
        </>
      )}
      {featured.length + rest.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Kein Land gefunden.</p>
      )}
    </div>
  );
}
