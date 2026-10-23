import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DemoScenario } from "@/demo/demo";
import type { Prediction } from "@/domain/predictions";
import {
  DEFAULT_AVAILABILITY,
  detectTimeZone,
  type DayWindow,
  type WeekAvailability,
} from "@/domain/time";
import type { AccentId, ThemeMode } from "@/lib/theme";
import { TOURNAMENT } from "@/tournament/config";

export type GroupNoticeInfo = {
  /** Runde, um die es geht (für einen Entsperrungsantrag). */
  id?: string;
  name: string;
  reason: "removed" | "rejected" | "banned";
  /** Wer gesperrt hat – „global“: das KickTime-Team, für alle Tipprunden. */
  by?: "owner" | "admin" | "global";
};

export type TeamMark = "favorite" | "interesting" | null;

type State = {
  onboarded: boolean;
  favorites: string[];
  interesting: string[];
  /** Vorgemerkte Einzelspiele (Match-IDs). */
  pinned: string[];
  availability: WeekAvailability;
  /** null = automatisch aus dem Gerät. */
  timeZoneOverride: string | null;

  spoilerProtection: boolean;
  /** Spiele, deren Ergebnis der Nutzer bewusst aufgedeckt hat. */
  revealed: Record<string, true>;

  theme: ThemeMode;
  accent: AccentId;
  /** Alles etwas größer (Schrift, Knöpfe, Abstände). */
  largeText: boolean;

  pushEnabled: boolean;
  autoAlarmFavorites: boolean;
  /** „Noch kein Tipp“ eine Stunde vor Anpfiff (Tipprunden, über den Server). */
  tipReminders: boolean;
  /** Tri-State: true = an, false = bewusst aus, fehlt = Automatik. */
  alarms: Record<string, boolean>;

  predictions: Record<string, Prediction>;
  /** Europameister-Tipp (Ländercode), bis zum Eröffnungsspiel änderbar. */
  championTip: string | null;
  /** Tipps im Vorschau-Modus – getrennt, damit sie nie in echte Runden geraten. */
  demoPredictions: Record<string, Prediction>;
  demoChampionTip: string | null;
  /** Zuletzt verwendeter Name in Tipprunden. */
  tipName: string;
  /** Ist das Gerät in mindestens einer Tipprunde? (dann werden Tipps geteilt) */
  inTipGroups: boolean;
  /** Zuletzt bekannte eigene Tipprunden (für Auswahl und offline). */
  tipGroups: { id: string; code: string; name: string }[];
  /** Für welche Runde gerade getippt wird (Runden-ID). */
  tipContext: string | null;
  /** Eigene Tipps je Runde (Zwischenspeicher der Server-Daten). */
  groupTips: Record<string, Record<string, Prediction>>;
  /** Eigener Europameister-Tipp je Runde. */
  groupChampion: Record<string, string | null>;
  /** Zuletzt gesehene eigene Runden inkl. Anfragen – zum Erkennen von Rauswurf/Ablehnung. */
  seenGroups: { id: string; name: string; pending: boolean }[];
  /** Einmaliger Hinweis: aus einer Runde entfernt bzw. Anfrage abgelehnt. */
  groupNotice: GroupNoticeInfo | null;
  /** Einführung auf der Tipp-Seite schon gesehen (oder übersprungen). */
  tipsTourDone: boolean;
  /** Einführung in einer Tipprunde (Runden-Seite) schon gesehen. */
  roundTourDone: boolean;

  demo: { enabled: boolean; scenario: DemoScenario; startedAt: number };
  /** Für welchen Europameister die Feier schon gezeigt wurde. */
  celebratedChampion: string | null;
};

type Actions = {
  setTeamMark: (code: string, mark: TeamMark) => void;
  cycleTeamMark: (code: string) => void;
  togglePinned: (matchId: string) => void;
  setDay: (index: number, w: DayWindow) => void;
  setAvailability: (w: WeekAvailability) => void;
  setTimeZoneOverride: (tz: string | null) => void;
  completeOnboarding: () => void;
  restartOnboarding: () => void;
  setSpoiler: (v: boolean) => void;
  reveal: (matchId: string) => void;
  revealMany: (matchIds: string[]) => void;
  setTheme: (t: ThemeMode) => void;
  setAccent: (a: AccentId) => void;
  setLargeText: (v: boolean) => void;
  setChampionTip: (code: string | null) => void;
  setTipName: (name: string) => void;
  setInTipGroups: (v: boolean) => void;
  setTipGroups: (groups: { id: string; code: string; name: string }[]) => void;
  setTipContext: (id: string | null) => void;
  setGroupTip: (
    groupId: string,
    matchId: string,
    tip: { home: number; away: number } | null,
  ) => void;
  setGroupTips: (groupId: string, tips: Record<string, { home: number; away: number }>) => void;
  setGroupChampion: (groupId: string, code: string | null) => void;
  setSeenGroups: (list: { id: string; name: string; pending: boolean }[]) => void;
  setGroupNotice: (n: GroupNoticeInfo | null) => void;
  setPushEnabled: (v: boolean) => void;
  setAutoAlarmFavorites: (v: boolean) => void;
  setTipReminders: (v: boolean) => void;
  setAlarm: (matchId: string, v: boolean | null) => void;
  setPrediction: (matchId: string, home: number, away: number) => void;
  clearPrediction: (matchId: string) => void;
  setDemo: (enabled: boolean, scenario?: DemoScenario) => void;
  setCelebrated: (code: string) => void;
  setTipsTourDone: (v: boolean) => void;
  setRoundTourDone: (v: boolean) => void;
};

export const useAppStore = create<State & Actions>()(
  persist(
    (set) => ({
      onboarded: false,
      favorites: [],
      interesting: [],
      pinned: [],
      availability: DEFAULT_AVAILABILITY,
      timeZoneOverride: null,
      spoilerProtection: true,
      revealed: {},
      theme: "system",
      accent: "floodlight",
      largeText: false,
      championTip: null,
      demoPredictions: {},
      demoChampionTip: null,
      tipName: "",
      inTipGroups: false,
      tipGroups: [],
      tipContext: null,
      groupTips: {},
      groupChampion: {},
      seenGroups: [],
      groupNotice: null,
      tipsTourDone: false,
      roundTourDone: false,
      pushEnabled: false,
      autoAlarmFavorites: true,
      tipReminders: true,
      alarms: {},
      predictions: {},
      demo: { enabled: false, scenario: "group", startedAt: 0 },
      celebratedChampion: null,

      setTeamMark: (code, mark) =>
        set((s) => ({
          favorites:
            mark === "favorite"
              ? addUnique(s.favorites, code)
              : s.favorites.filter((c) => c !== code),
          interesting:
            mark === "interesting"
              ? addUnique(s.interesting, code)
              : s.interesting.filter((c) => c !== code),
        })),
      cycleTeamMark: (code) =>
        set((s) => {
          // nichts → Favorit → interessant → nichts
          if (s.favorites.includes(code)) {
            return {
              favorites: s.favorites.filter((c) => c !== code),
              interesting: addUnique(s.interesting, code),
            };
          }
          if (s.interesting.includes(code)) {
            return { interesting: s.interesting.filter((c) => c !== code) };
          }
          return { favorites: addUnique(s.favorites, code) };
        }),
      togglePinned: (id) =>
        set((s) => ({
          pinned: s.pinned.includes(id) ? s.pinned.filter((x) => x !== id) : [...s.pinned, id],
        })),
      setDay: (index, w) =>
        set((s) => {
          const next = [...s.availability];
          next[index] = w;
          return { availability: next };
        }),
      setAvailability: (w) => set({ availability: w }),
      setTimeZoneOverride: (tz) => set({ timeZoneOverride: tz }),
      completeOnboarding: () => set({ onboarded: true }),
      restartOnboarding: () => set({ onboarded: false }),
      setSpoiler: (v) => set({ spoilerProtection: v }),
      revealMany: (ids) =>
        set((s) => ({
          revealed: { ...s.revealed, ...Object.fromEntries(ids.map((id) => [id, true as const])) },
        })),
      reveal: (id) =>
        set((s) => (s.revealed[id] ? s : { revealed: { ...s.revealed, [id]: true } })),
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setLargeText: (largeText) => set({ largeText }),
      setChampionTip: (code) =>
        set((s) => (s.demo.enabled ? { demoChampionTip: code } : { championTip: code })),
      setTipName: (tipName) => set({ tipName }),
      setInTipGroups: (inTipGroups) => set({ inTipGroups }),
      setTipGroups: (tipGroups) =>
        set((s) => {
          // Zwischenspeicher verlassener Runden aufräumen.
          const ids = new Set(tipGroups.map((g) => g.id));
          const keep = <T>(r: Record<string, T>) =>
            Object.fromEntries(Object.entries(r).filter(([id]) => ids.has(id)));
          return {
            tipGroups,
            inTipGroups: tipGroups.length > 0,
            groupTips: keep(s.groupTips),
            groupChampion: keep(s.groupChampion),
            tipContext: s.tipContext && ids.has(s.tipContext) ? s.tipContext : null,
          };
        }),
      setTipContext: (tipContext) => set({ tipContext }),
      setGroupTip: (groupId, matchId, tip) =>
        set((s) => {
          const cur = { ...(s.groupTips[groupId] ?? {}) };
          if (tip) cur[matchId] = { ...tip, createdAt: cur[matchId]?.createdAt ?? Date.now() };
          else delete cur[matchId];
          return { groupTips: { ...s.groupTips, [groupId]: cur } };
        }),
      setGroupTips: (groupId, tips) =>
        set((s) => ({
          groupTips: {
            ...s.groupTips,
            [groupId]: Object.fromEntries(
              Object.entries(tips).map(([id, t]) => [
                id,
                { ...t, createdAt: s.groupTips[groupId]?.[id]?.createdAt ?? Date.now() },
              ]),
            ),
          },
        })),
      setGroupChampion: (groupId, code) =>
        set((s) => ({ groupChampion: { ...s.groupChampion, [groupId]: code } })),
      setSeenGroups: (seenGroups) => set({ seenGroups }),
      setGroupNotice: (groupNotice) => set({ groupNotice }),
      setPushEnabled: (v) => set(v ? { pushEnabled: true } : { pushEnabled: false }),
      setAutoAlarmFavorites: (v) => set({ autoAlarmFavorites: v }),
      setTipReminders: (v) => set({ tipReminders: v }),
      setAlarm: (id, v) =>
        set((s) => {
          const next = { ...s.alarms };
          if (v === null) delete next[id];
          else next[id] = v;
          return { alarms: next };
        }),
      setPrediction: (id, home, away) =>
        set((s) => {
          const key = s.demo.enabled ? "demoPredictions" : "predictions";
          const cur = s[key];
          return {
            [key]: {
              ...cur,
              [id]: { home, away, createdAt: cur[id]?.createdAt ?? Date.now() },
            },
          };
        }),
      clearPrediction: (id) =>
        set((s) => {
          const key = s.demo.enabled ? "demoPredictions" : "predictions";
          const next = { ...s[key] };
          delete next[id];
          return { [key]: next };
        }),
      setDemo: (enabled, scenario) =>
        set((s) => ({
          demo: { enabled, scenario: scenario ?? s.demo.scenario, startedAt: Date.now() },
          // Vorschau an oder aus → Vorschau-Tipps (allein) verwerfen.
          ...(enabled === s.demo.enabled ? {} : dropDemo()),
        })),
      setCelebrated: (code) => set({ celebratedChampion: code }),
      setTipsTourDone: (v) => set({ tipsTourDone: v }),
      setRoundTourDone: (v) => set({ roundTourDone: v }),
    }),
    {
      name: TOURNAMENT.storagePrefix,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Demo-Modus nach einem Neuladen beibehalten, aber Uhr neu starten.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const merged = { ...current, ...p };
        if (!Array.isArray(merged.availability) || merged.availability.length !== 7) {
          merged.availability = DEFAULT_AVAILABILITY;
        }
        if (merged.demo?.enabled) merged.demo = { ...merged.demo, startedAt: Date.now() };
        // Vorschau-Runden aus älteren Versionen (nur auf dem Gerät) verwerfen.
        delete (merged as Partial<State> & { demoGroups?: unknown }).demoGroups;
        return merged;
      },
    },
  ),
);

function addUnique(list: string[], code: string) {
  return list.includes(code) ? list : [...list, code];
}

export function useTimeZone(): string {
  const override = useAppStore((s) => s.timeZoneOverride);
  return override ?? detectTimeZone();
}

export function teamMarkOf(s: Pick<State, "favorites" | "interesting">, code: string): TeamMark {
  if (s.favorites.includes(code)) return "favorite";
  if (s.interesting.includes(code)) return "interesting";
  return null;
}

/** Tipps, die gerade gelten – im Vorschau-Modus die Vorschau-Tipps. */
/** Vorschau-Tipps (allein) verwerfen – Tipprunden sind auch in der Vorschau echt. */
function dropDemo(): Partial<State> {
  return { demoPredictions: {}, demoChampionTip: null };
}
