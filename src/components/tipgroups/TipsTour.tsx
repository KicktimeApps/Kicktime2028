import { useEffect, useState } from "react";
import { CoachTour, type TourStep } from "@/components/common/CoachTour";
import { CHAMPION_BONUS, RESULT_POINTS, STAGE_MULTIPLIER } from "@/domain/predictions";
import { useAppStore } from "@/store/app-store";

const POINTS: [number, string][] = [
  [RESULT_POINTS.exact, "exaktes Ergebnis"],
  [RESULT_POINTS.diff, "richtige Tordifferenz"],
  [RESULT_POINTS.tendency, "richtiger Sieger bzw. Remis"],
];

const welcome: TourStep = {
  title: "Willkommen beim Tippspiel",
  body: (
    <>
      Tippe die Ergebnisse der EM-Spiele und sammle Punkte:
      <ul className="mt-2.5 space-y-1.5">
        {POINTS.map(([pts, label]) => (
          <li key={label} className="flex items-center gap-2.5 text-foreground">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 font-display text-[16px] font-bold text-primary">
              {pts}
            </span>
            {label}
          </li>
        ))}
      </ul>
      <p className="mt-2.5">Halbfinale und Finale zählen doppelt (×{STAGE_MULTIPLIER.final}).</p>
    </>
  ),
};

const rules: TourStep = {
  target: "rules",
  title: "Alles nachlesen",
  body: "Hier stehen die Regeln jederzeit – und hier kannst du diese Einführung noch mal ansehen.",
};

/** Allein tippen: direkt auf der Tipp-Seite. */
const SOLO: TourStep[] = [
  welcome,
  {
    target: "tip-input",
    title: "Hier tippst du",
    body: "Links die Tore fürs erste Team, rechts fürs zweite. Danach unten auf „Tipp speichern“. Ändern geht bis zum Anpfiff.",
  },
  {
    target: "matchday",
    title: "Spieltage wechseln",
    body: "Mit den Pfeilen blätterst du durch die Spieltage – vom ersten Gruppenspiel bis zum Finale.",
  },
  {
    target: "stats",
    title: "Deine Bilanz",
    body: "Deine Punkte, wie oft du richtig lagst und wie viele Spiele du schon getippt hast.",
  },
  {
    target: "friends",
    title: "Mit Freunden tippen",
    body: "Erstelle eine Tipprunde und schick den Link an Freunde – oder tritt mit einem Code bei. Ohne Anmeldung.",
  },
  {
    target: "bonus",
    title: "Bonustipp",
    body: `Wer wird Europameister? Richtig getippt gibt es +${CHAMPION_BONUS} Punkte – abgeben geht nur bis zum Eröffnungsspiel.`,
  },
  rules,
];

/** In Tipprunden: getippt wird in der jeweiligen Runde. */
const HUB: TourStep[] = [
  welcome,
  {
    target: "groups",
    title: "Deine Tipprunden",
    body: "Tippe eine Runde an – dort gibst du deine Tipps ab und siehst die Tabelle. Jede Runde hat eigene Tipps.",
  },
  {
    target: "new-group",
    title: "Weitere Runde",
    body: "Eine neue Runde erstellen oder mit einem Code einer weiteren beitreten.",
  },
  rules,
];

/**
 * Startet einen Rundgang, solange er nicht erledigt ist – erst wenn die
 * Öffnungsanimation weg ist und kein Fenster offen ist.
 */
function TourLauncher({
  steps,
  done,
  onDone,
}: {
  steps: TourStep[];
  done: boolean;
  onDone: () => void;
}) {
  const [run, setRun] = useState(false);
  useEffect(() => {
    if (done) return;
    let timer = 0;
    const wait = () => {
      const busy = document.querySelector("img.splash-logo, [role='dialog']");
      timer = window.setTimeout(busy ? wait : () => setRun(true), busy ? 300 : 600);
    };
    wait();
    return () => window.clearTimeout(timer);
  }, [done]);
  if (done || !run) return null;
  return (
    <CoachTour
      steps={steps}
      onClose={() => {
        setRun(false);
        onDone();
      }}
    />
  );
}

/**
 * Einführung beim ersten Besuch der Tipp-Seite; danach nie wieder – außer
 * über „Einführung noch mal ansehen“ in den Regeln.
 */
export function TipsTour({ variant }: { variant: "solo" | "hub" }) {
  const done = useAppStore((s) => s.tipsTourDone);
  const setDone = useAppStore((s) => s.setTipsTourDone);
  return (
    <TourLauncher
      steps={variant === "solo" ? SOLO : HUB}
      done={done}
      onDone={() => setDone(true)}
    />
  );
}

/** Einführung beim ersten Öffnen einer Tipprunde (dort wird getippt). */
export function RoundTour({ name, isOwner }: { name: string; isOwner: boolean }) {
  const done = useAppStore((s) => s.roundTourDone);
  const setDone = useAppStore((s) => s.setRoundTourDone);
  const steps: TourStep[] = [
    {
      title: `Willkommen in „${name}“`,
      body: "Hier tippst du für diese Runde. Jede Runde hat eigene Tipps – bist du in mehreren, tippst du in jeder einzeln.",
    },
    {
      target: "round-tabs",
      title: "Tippen und Tabelle",
      body: "Unter „Tippen“ gibst du deine Tipps ab, unter „Tabelle“ siehst du den Stand der Runde.",
    },
    {
      target: "tip-input",
      title: "Hier tippst du",
      body: "Links die Tore fürs erste Team, rechts fürs zweite, dann „Tipp speichern“. Die Tipps der anderen siehst du ab Anpfiff.",
    },
    {
      target: "matchday",
      title: "Spieltage wechseln",
      body: "Mit den Pfeilen blätterst du durch die Spieltage.",
    },
    {
      target: "bonus",
      title: "Bonustipp",
      body: `Wer wird Europameister? +${CHAMPION_BONUS} Punkte in dieser Runde – abgeben geht nur bis zum Eröffnungsspiel.`,
    },
    {
      target: "round-settings",
      title: "Einstellungen der Runde",
      body: isOwner
        ? "Hier nimmst du Beitrittsanfragen an, lädst Freunde ein und verwaltest die Mitspieler. Ein roter Punkt zeigt neue Anfragen."
        : "Hier lädst du Freunde ein, änderst deinen Namen oder verlässt die Runde.",
    },
    rules,
  ];
  return <TourLauncher steps={steps} done={done} onDone={() => setDone(true)} />;
}
