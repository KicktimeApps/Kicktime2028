import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Segmented } from "@/components/common/Segmented";
import { Flag } from "@/components/team/Flag";
import { statusChip } from "@/components/team/statusChip";
import { Bracket } from "@/components/tournament/Bracket";
import { GroupTableCard } from "@/components/tournament/GroupTableCard";
import { rankThirds } from "@/domain/standings";
import { resultKeys, tablesHidden } from "@/domain/table-spoiler";
import type { TeamStatus } from "@/domain/status";
import { useTeamStatuses } from "@/hooks/useTeamStatuses";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useTournament } from "@/store/match-store";
import { useUi } from "@/store/ui-store";
import { TOURNAMENT } from "@/tournament/config";
import { getNation, NATIONS } from "@/tournament/nations";

export const Route = createFileRoute("/turnier")({
  head: () => ({ meta: [{ title: `Tabellen & K.-o.-Baum ${TOURNAMENT.name} | KickTime` }] }),
  component: TournamentPage,
});

type View = "groups" | "bracket" | "teams";

function TournamentPage() {
  const [view, setView] = useState<View>("groups");
  const spoiler = useTableSpoiler();
  return (
    <div>
      <PageHeader
        eyebrow={TOURNAMENT.name}
        title="Turnier"
        subtitle="Gruppen, K.-o.-Baum und alle Teams"
      />
      <Segmented<View>
        className="mb-5 max-w-md"
        value={view}
        onChange={setView}
        options={[
          { value: "groups", label: "Gruppen" },
          { value: "bracket", label: "K.-o.-Baum" },
          { value: "teams", label: "Teams" },
        ]}
      />
      {view === "groups" && <Groups spoiler={spoiler} />}
      {view === "bracket" && <BracketView spoiler={spoiler} />}
      {view === "teams" && <Teams spoiler={spoiler} />}
    </div>
  );
}

/**
 * Spoilerschutz für Tabellen: Sie verraten Ergebnisse. „Anzeigen“ wird
 * gespeichert (auch über Seitenwechsel und Neustart) – bis ein neues Ergebnis
 * oder Tor dazukommt (domain/table-spoiler).
 */
function useTableSpoiler() {
  const protect = useAppStore((s) => s.spoilerProtection);
  const seen = useAppStore((s) => s.tablesSeen);
  const revealed = useAppStore((s) => s.revealed);
  const setSeen = useAppStore((s) => s.setTablesSeen);
  const { matches } = useTournament();
  const hidden = protect && tablesHidden(matches, seen, revealed);
  return { hidden, show: () => setSeen(resultKeys(matches)) };
}

type Spoiler = ReturnType<typeof useTableSpoiler>;

const EASE = [0.32, 0.72, 0, 1] as const;

/** Hinweis mit „Anzeigen“ – klappt beim Aufdecken weich zu statt zu verschwinden. */
function SpoilerGate({ show, text, onShow }: { show: boolean; text: string; onShow: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="gate"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="overflow-hidden"
        >
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/8 px-4 py-3">
            <p className="text-[13px]">
              <strong>Spoilerschutz:</strong> {text}
            </p>
            <button
              type="button"
              onClick={onShow}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
            >
              <Eye className="h-4 w-4" /> Anzeigen
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Inhalt, der hinter dem Spoilerschutz steckt – blendet beim Aufdecken weich ein. */
function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Groups({ spoiler }: { spoiler: Spoiler }) {
  const t = useTournament();
  const anyPlayed = t.matches.some(
    (m) => m.stage === "group" && m.status !== "scheduled" && m.score,
  );
  const { hidden, show } = spoiler;
  const thirds = useMemo(
    () =>
      rankThirds(
        t.tables.filter((x) => x.drawn),
        TOURNAMENT.bestThirds,
      ),
    [t.tables],
  );
  const blur = hidden && anyPlayed;

  return (
    <div>
      <SpoilerGate show={blur} text="Die Tabellen verraten Ergebnisse." onShow={show} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {t.tables.map((table) => (
          <GroupTableCard
            key={table.group}
            table={table}
            hideScores={blur}
            thirdQualified={
              t.qualifiedThirdGroups ? t.qualifiedThirdGroups.includes(table.group) : null
            }
          />
        ))}
      </div>
      <Legend />

      {anyPlayed && !blur && (
        <motion.section
          className="mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <h2 className="mb-1 font-display text-xl font-bold uppercase tracking-wide">
            Die besten Gruppendritten
          </h2>
          <p className="mb-3 text-[13px] text-muted-foreground">
            Vier der sechs Dritten erreichen das Achtelfinale.{" "}
            {t.groupStageComplete
              ? "Endstand."
              : "Zwischenstand – noch nicht alle Gruppen beendet."}
          </p>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {thirds.map((r, i) => {
              const n = getNation(r.code);
              return (
                <div
                  key={r.code}
                  className={cn(
                    "flex items-center gap-3 border-t border-border/50 px-4 py-2.5 first:border-t-0",
                    i === 4 && "border-t-2 border-t-dashed border-t-muted-foreground/40",
                  )}
                >
                  <span
                    className={cn(
                      "w-5 text-center text-[12px] font-bold",
                      r.qualified ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <Flag flag={n?.flag ?? null} size="sm" />
                  <span className="flex-1 truncate text-[14px] font-medium">{n?.name}</span>
                  <span className="text-[12px] text-muted-foreground">Gr. {r.group}</span>
                  <span className={cn("w-10 text-right text-[13px] tabular", blur && "blur-[5px]")}>
                    {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                  </span>
                  <span
                    className={cn(
                      "w-8 text-right font-display text-[17px] font-bold tabular",
                      blur && "blur-[5px]",
                    )}
                  >
                    {r.points}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.section>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-primary/60" /> Achtelfinale
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-gold/60" /> Chance als einer der 4 besten Dritten
      </span>
      <span>Bei Punktgleichheit zählt zuerst der direkte Vergleich (UEFA-Regel).</span>
    </div>
  );
}

function BracketView({ spoiler }: { spoiler: Spoiler }) {
  const t = useTournament();
  const ko = t.matches.filter((m) => m.stage !== "group");
  const anyPlayed = t.matches.some((m) => m.status !== "scheduled" && m.score);
  return (
    <div>
      <p className="mb-4 text-[13px] text-muted-foreground">
        Die Paarungen füllen sich automatisch, sobald Gruppen und Spiele entschieden sind. Seitlich
        wischen für den ganzen Baum.
      </p>
      <SpoilerGate
        show={spoiler.hidden && anyPlayed}
        text="Der K.-o.-Baum verrät, wer weitergekommen ist."
        onShow={spoiler.show}
      />
      {!(spoiler.hidden && anyPlayed) && (
        <Reveal>
          <Bracket matches={ko} />
        </Reveal>
      )}
    </div>
  );
}

function Teams({ spoiler }: { spoiler: Spoiler }) {
  const statuses = useTeamStatuses();
  const favorites = useAppStore((s) => s.favorites);
  const interesting = useAppStore((s) => s.interesting);
  const openTeam = useUi((s) => s.openTeam);
  const drawn = [...statuses.values()].some((s) => s.group);
  const tournament = useTournament();
  const anyPlayed = tournament.matches.some((m) => m.status !== "scheduled" && m.score);

  const groups = useMemo(() => {
    const list = NATIONS.map((n) => ({ n, s: statuses.get(n.code)! }));
    const mine = (c: string) => favorites.includes(c) || interesting.includes(c);
    const sortByName = (a: { n: { name: string } }, b: { n: { name: string } }) =>
      a.n.name.localeCompare(b.n.name, "de");
    if (!drawn) {
      return [
        { title: "Deine Teams", items: list.filter((x) => mine(x.n.code)).sort(sortByName) },
        {
          title: "Gastgeber",
          items: list.filter((x) => x.n.host && !mine(x.n.code)).sort(sortByName),
        },
        {
          title: "Alle weiteren Nationen",
          items: list.filter((x) => !x.n.host && !mine(x.n.code)).sort(sortByName),
        },
      ];
    }
    const phase = (p: TeamStatus["phase"][]) =>
      list.filter((x) => p.includes(x.s.phase)).sort(sortByName);
    return [
      { title: "Noch im Turnier", items: phase(["alive", "champion"]) },
      { title: "Ausgeschieden", items: phase(["out"]) },
      { title: "Nicht qualifiziert", items: phase(["missed", "qualifying"]) },
    ];
  }, [statuses, drawn, favorites, interesting]);

  const gated = spoiler.hidden && anyPlayed;
  return (
    <>
      <SpoilerGate
        show={gated}
        text="Die Teamliste verrät, wer ausgeschieden ist."
        onShow={spoiler.show}
      />
      {!gated && (
        <Reveal>
          <TeamGroups drawn={drawn} groups={groups} openTeam={openTeam} favorites={favorites} />
        </Reveal>
      )}
    </>
  );
}

function TeamGroups({
  drawn,
  groups,
  openTeam,
  favorites,
}: {
  drawn: boolean;
  groups: { title: string; items: { n: (typeof NATIONS)[number]; s: TeamStatus }[] }[];
  openTeam: (code: string) => void;
  favorites: string[];
}) {
  return (
    <div className="space-y-6">
      {!drawn && (
        <p className="text-[13px] text-muted-foreground">
          54 Nationen spielen in der Qualifikation um 24 Startplätze (März 2027 bis März 2028).
        </p>
      )}
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {g.title} <span className="font-normal">· {g.items.length}</span>
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map(({ n, s }) => (
                <li key={n.code}>
                  <button
                    type="button"
                    onClick={() => openTeam(n.code)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left hover:border-muted-foreground/40"
                  >
                    <Flag
                      flag={n.flag}
                      size="md"
                      muted={s.phase === "out" || s.phase === "missed"}
                    />
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
                      {n.name}
                    </span>
                    {favorites.includes(n.code) && (
                      <Star className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" />
                    )}
                    <span className="shrink-0">{statusChip(s)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
