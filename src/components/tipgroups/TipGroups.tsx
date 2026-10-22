import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  Crown,
  Hourglass,
  Info,
  Loader2,
  PlayCircle,
  Plus,
  Save,
  Trophy,
  UserPlus,
  Users,
  Ban,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Flag } from "@/components/team/Flag";
import {
  FormSheet,
  FormSheetContent,
  FormSheetDescription,
  FormSheetTitle,
} from "@/components/common/FormSheet";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { buildRounds } from "@/domain/rounds";
import { canPredict, CHAMPION_BONUS, RESULT_POINTS, STAGE_MULTIPLIER } from "@/domain/predictions";
import { useBanStatus } from "@/hooks/useBanStatus";
import { TIP_GROUPS_KEY, useMyGroups } from "@/hooks/useMyGroups";
import { saveChampion, useContextChampion, useTipContext, type TipContext } from "@/lib/tips";
import { cn } from "@/lib/utils";
import { isBackendConfigured } from "@/services/supabase";
import {
  BANNED_MESSAGE,
  createGroup,
  importTips,
  joinGroup,
  loadBoard,
  normalizeCode,
  setGroupChampion,
  TipError,
} from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";
import { AppealBlock } from "./AppealBlock";
import { useNow, useTournament } from "@/store/match-store";
import { NATIONS, getNation } from "@/tournament/nations";

/* ------------------------------------------------------------------ */
/* Regeln                                                              */
/* ------------------------------------------------------------------ */

function RulesCard({ className }: { className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <h3 className="mb-3 text-[16px] font-bold">So wird gezählt</h3>
      <ul className="space-y-2 text-[14.5px]">
        {(
          [
            [RESULT_POINTS.exact, "Exaktes Ergebnis", "Tipp 2:1, Ergebnis 2:1"],
            [RESULT_POINTS.diff, "Richtige Tordifferenz", "Tipp 2:1, Ergebnis 3:2"],
            [
              RESULT_POINTS.tendency,
              "Richtiger Sieger bzw. Unentschieden",
              "Tipp 2:1, Ergebnis 1:0",
            ],
          ] as const
        ).map(([pts, label, ex]) => (
          <li key={label} className="flex items-baseline gap-3">
            <span className="w-8 shrink-0 text-right font-display text-xl font-bold text-primary tabular">
              {pts}
            </span>
            <span>
              {label}
              <span className="block text-[13px] text-muted-foreground">{ex}</span>
            </span>
          </li>
        ))}
      </ul>
      <ul className="mt-3 space-y-1.5 border-t border-border/70 pt-3 text-[13.5px] text-muted-foreground">
        <li>
          • <strong className="text-foreground">Halbfinale und Finale zählen doppelt</strong> (×
          {STAGE_MULTIPLIER.final}).
        </li>
        <li>
          • <strong className="text-foreground">Europameister-Tipp:</strong> {CHAMPION_BONUS}{" "}
          Bonuspunkte, abzugeben bis zum Eröffnungsspiel.
        </li>
        <li>• Gewertet wird nach 90 bzw. 120 Minuten – das Elfmeterschießen zählt nicht.</li>
        <li>• Ein Unentschieden falsch getippt (z. B. 1:1 statt 2:2) gibt 2 Punkte.</li>
        <li>• Tippen ist bis zum Anpfiff möglich. Die Tipps der anderen siehst du ab Anpfiff.</li>
        <li>• Bei Punktgleichheit entscheiden mehr Volltreffer, dann mehr richtige Tendenzen.</li>
      </ul>
    </section>
  );
}

/** ⓘ-Knopf: Regeln nur bei Bedarf, nicht ständig auf dem Bildschirm. */
export function RulesButton() {
  const [open, setOpen] = useState(false);
  const setTourDone = useAppStore((s) => s.setTipsTourDone);
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour="rules"
        aria-label="So wird gezählt"
        title="So wird gezählt"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
      >
        <Info className="h-5 w-5" />
      </button>
      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
        <DrawerContent className="mx-auto max-h-[90dvh] max-w-lg border-border bg-background">
          <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
            <DrawerTitle className="sr-only">So wird gezählt</DrawerTitle>
            <DrawerDescription className="sr-only">Punkte im Tippspiel</DrawerDescription>
            <RulesCard />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTourDone(false);
                void navigate({ to: "/tipps" });
              }}
              className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-[15px] font-semibold"
            >
              <PlayCircle className="h-4 w-4 text-primary" /> Einführung noch mal ansehen
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Europameister-Tipp                                                  */
/* ------------------------------------------------------------------ */

export function ChampionTipCard({ context }: { context?: TipContext } = {}) {
  const current = useTipContext();
  const ctx = context ?? current;
  const saved = useContextChampion(ctx);
  const [draft, setDraft] = useState<string | null>(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(saved), [saved, ctx.id]);
  const { matches } = useTournament();
  const now = useNow();
  const opener = matches.find((m) => m.number === 1);
  const locked = !!opener && now >= Date.parse(opener.kickoffUtc);
  // Nach der Auslosung nur Endrunden-Teams, vorher alle Nationen.
  const drawn = matches.filter((m) => m.stage === "group" && m.home && m.away);
  const codes = drawn.length
    ? [...new Set(drawn.flatMap((m) => [m.home!, m.away!]))]
    : NATIONS.map((n) => n.code);
  const options = codes
    .map((c) => getNation(c)!)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const pick = getNation(saved);
  const dirty = draft !== saved;
  const where = ctx.kind === "solo" ? "" : ` für „${ctx.label}“`;
  const save = async () => {
    setBusy(true);
    try {
      await saveChampion(ctx, draft);
      toast.success(
        draft ? `Europameister-Tipp gespeichert${where}` : `Europameister-Tipp gelöscht${where}`,
        { description: draft ? getNation(draft)?.name : undefined },
      );
    } catch (err) {
      toast.error(err instanceof TipError ? err.message : "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  };
  // Kompakt in einer Zeile – die Spiele sollen gleich darunter sichtbar sein.
  return (
    <section
      data-tour="bonus"
      className="mb-5 rounded-2xl border border-gold/30 bg-gold/8 px-3.5 py-2.5"
    >
      <div className="flex items-center gap-2.5">
        <Trophy className="h-5 w-5 shrink-0 text-gold" />
        <span className="shrink-0 text-[14px] font-semibold leading-tight">
          Europa&shy;meister
          <span className="block text-[11.5px] font-normal text-muted-foreground">
            {locked ? "gesperrt" : `+${CHAMPION_BONUS} Punkte`}
          </span>
        </span>
        {locked ? (
          <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-[15px] font-semibold">
            {pick ? (
              <>
                <Flag flag={pick.flag} size="sm" />
                <span className="truncate">{pick.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground">kein Tipp</span>
            )}
          </span>
        ) : (
          <>
            <select
              value={draft ?? ""}
              onChange={(e) => setDraft(e.target.value || null)}
              aria-label="Europameister-Tipp"
              className={cn(
                "h-10 min-w-0 flex-1 rounded-xl border bg-card px-2.5 text-[15px] outline-none focus:border-primary",
                dirty ? "border-gold" : "border-border",
              )}
            >
              <option value="">Noch kein Tipp</option>
              {options.map((n) => (
                <option key={n.code} value={n.code}>
                  {n.name}
                </option>
              ))}
            </select>
            {dirty || busy ? (
              <button
                type="button"
                disabled={busy}
                onClick={save}
                aria-label="Europameister-Tipp speichern"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[14px] font-semibold text-primary-foreground"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Speichern
              </button>
            ) : saved ? (
              <Check className="h-5 w-5 shrink-0 text-primary" aria-label="gespeichert" />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Runde erstellen / beitreten                                         */
/* ------------------------------------------------------------------ */

function Field({
  label,
  hint,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[14px] font-semibold">{label}</span>
      <input
        {...input}
        className="mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-3.5 text-[16px] outline-none focus:border-primary"
      />
      {hint && <span className="mt-1 block text-[12.5px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function GroupFormDrawer({
  mode,
  open,
  onOpenChange,
  initialCode = "",
}: {
  mode: "create" | "join";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialCode?: string;
}) {
  const tipName = useAppStore((s) => s.tipName);
  const setTipName = useAppStore((s) => s.setTipName);
  const setTipContext = useAppStore((s) => s.setTipContext);
  const { matches } = useTournament();
  const now = useNow();
  const kickoffs = new Map(matches.map((m) => [m.id, Date.parse(m.kickoffUtc)]));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(tipName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Beim Beitreten gesperrt → gleich hier die Entsperrung beantragen können.
  const [bannedCode, setBannedCode] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setBannedCode(null);
    try {
      const g: { id: string; code: string; name: string; pending?: boolean } =
        mode === "create"
          ? await createGroup(groupName.trim(), name.trim())
          : await joinGroup(normalizeCode(code), name.trim());
      setTipName(name.trim());
      // Bisherige Einzel-Tipps für noch offene Spiele in die Runde übernehmen.
      const { predictions, championTip } = useAppStore.getState();
      const open = openTips(predictions);
      const imported = open.length ? await importTips(g.id, open).catch(() => 0) : 0;
      if (championTip) await setGroupChampion(g.id, championTip).catch(() => {});
      if (!g.pending) setTipContext(g.id);
      await qc.invalidateQueries({ queryKey: TIP_GROUPS_KEY });
      await qc.invalidateQueries({ queryKey: ["tip-board", g.id] });
      done(g, imported, !!g.pending);
    } catch (err) {
      setError(err instanceof TipError ? err.message : "Das hat nicht geklappt.");
      if (err instanceof TipError && err.message === BANNED_MESSAGE && mode === "join")
        setBannedCode(normalizeCode(code));
    } finally {
      setBusy(false);
    }
  };

  const openTips = (tips: Record<string, { home: number; away: number }>) =>
    Object.entries(tips)
      .filter(([id]) => (kickoffs.get(id) ?? 0) > now)
      .map(([match_id, p]) => ({ match_id, home: p.home, away: p.away }));

  const done = (g: { name: string; code: string }, imported: number, pending = false) => {
    if (pending) {
      onOpenChange(false);
      toast.success(`Anfrage an „${g.name}“ gesendet`, {
        description: "Sobald der Ersteller dich annimmt, tippst du mit.",
      });
      navigate({ to: "/runde/$code", params: { code: g.code } });
      return;
    }
    if (imported > 0)
      toast(`${imported} ${imported === 1 ? "Tipp" : "Tipps"} übernommen`, {
        description: "Deine bisherigen Tipps gelten jetzt auch in dieser Runde.",
      });
    onOpenChange(false);
    toast.success(mode === "create" ? "Tipprunde erstellt" : `Willkommen in „${g.name}“`, {
      description: mode === "create" ? `Code ${g.code} – jetzt Freunde einladen.` : undefined,
    });
    navigate({ to: "/runde/$code", params: { code: g.code } });
  };

  const valid =
    name.trim().length >= 2 &&
    (mode === "create" ? groupName.trim().length >= 2 : normalizeCode(code).length === 6);

  return (
    <FormSheet open={open} onOpenChange={onOpenChange}>
      <FormSheetContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !busy) void submit();
          }}
        >
          <FormSheetTitle className="pr-10 font-display text-2xl font-bold uppercase">
            {mode === "create" ? "Tipprunde erstellen" : "Tipprunde beitreten"}
          </FormSheetTitle>
          <FormSheetDescription className="text-[14px] text-muted-foreground">
            {mode === "create"
              ? "Du bekommst einen Code, den du an Freunde schickst. Ohne Anmeldung."
              : "Gib den Code ein, den du bekommen hast. Ohne Anmeldung."}
            {mode === "join" && " Der Ersteller der Runde muss dich danach noch annehmen."}
          </FormSheetDescription>
          {mode === "create" ? (
            <Field
              label="Name der Runde"
              placeholder="z. B. Familie Müller"
              maxLength={40}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          ) : (
            <Field
              label="Code"
              placeholder="z. B. K7M2QX"
              autoCapitalize="characters"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              className="tracking-[0.3em]"
            />
          )}
          <Field
            label="Dein Name in der Runde"
            hint="So sehen dich die anderen in der Tabelle (2–20 Zeichen)."
            placeholder="z. B. Opa Heinz"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[14px] text-destructive">
              {error}
            </p>
          )}
          {bannedCode && (
            <AppealBlock appealKey={{ scope: "group", code: bannedCode }} code={bannedCode} />
          )}
          <button
            type="submit"
            disabled={!valid || busy}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "create" ? "Runde erstellen" : "Beitreten"}
          </button>
        </form>
      </FormSheetContent>
    </FormSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Abschnitt auf der Tipps-Seite                                       */
/* ------------------------------------------------------------------ */

/**
 * Stand für die Rundenkarte: der nächste Spieltag mit offenen, noch nicht
 * getippten Spielen – statt einer erschlagenden Gesamtzahl fürs Turnier.
 */
function useOpenWithoutTip(
  tips: Record<string, unknown> | undefined,
): { label: string; count: number } | "done" | null {
  const { matches } = useTournament();
  const now = useNow();
  const rounds = useMemo(() => buildRounds(matches), [matches]);
  if (!tips) return null;
  const open = rounds
    .map((r) => ({ label: r.label, list: r.matches.filter((m) => canPredict(m, now)) }))
    .filter((r) => r.list.length > 0);
  // Noch nichts zu tippen (z. B. vor der Auslosung): keine Anzeige.
  if (open.length === 0) return null;
  const next = open.find((r) => r.list.some((m) => !tips[m.id]));
  if (!next) return "done";
  return { label: next.label, count: next.list.filter((m) => !tips[m.id]).length };
}

function RoundCard({
  code,
  name,
  sub,
  owner,
  tips,
  pending,
  requests = 0,
}: {
  code: string;
  name: string;
  sub: string;
  owner?: boolean;
  tips: Record<string, unknown> | undefined;
  pending?: boolean;
  requests?: number;
}) {
  const open = useOpenWithoutTip(pending ? undefined : tips);
  return (
    <Link
      to="/runde/$code"
      params={{ code }}
      className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 hover:bg-muted/40"
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          pending ? "bg-muted text-muted-foreground" : "bg-primary/12 text-primary",
        )}
      >
        {pending ? <Hourglass className="h-5 w-5" /> : <Users className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[17px] font-semibold">
          <span className="line-clamp-2 leading-tight">{name}</span>
          {owner && <Crown className="h-4 w-4 shrink-0 text-gold" aria-label="von dir erstellt" />}
        </span>
        <span className="block text-[13px] text-muted-foreground">
          {pending ? "Wartet auf Freigabe durch den Ersteller" : sub}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {requests > 0 && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[12px] font-semibold text-primary-foreground">
              <UserPlus className="h-3.5 w-3.5" />
              {requests === 1 ? "1 Beitrittsanfrage" : `${requests} Beitrittsanfragen`}
            </span>
          )}
          {open !== null &&
            (open !== "done" ? (
              <span className="mt-1 inline-block rounded-full bg-gold/15 px-2 py-0.5 text-[12px] font-semibold text-gold">
                {open.label}: {open.count} noch ohne Tipp
              </span>
            ) : (
              <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                <Check className="h-3.5 w-3.5" /> Alles getippt
              </span>
            ))}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
    </Link>
  );
}

/** Kurz erklärt – füllt die Übersicht ruhig auf, ohne eigene Funktion. */
function HowItWorks() {
  const steps: [string, string][] = [
    ["Runde öffnen", "Jede Runde wird einzeln getippt – deine Tipps gelten nur dort."],
    ["Bis zum Anpfiff tippen", "Ergebnis wählen und „Tipp speichern“. Bis Anpfiff änderbar."],
    [
      "Punkte sammeln",
      `${RESULT_POINTS.exact} exakt · ${RESULT_POINTS.diff} Tordifferenz · ${RESULT_POINTS.tendency} Tendenz. Halbfinale und Finale doppelt, Europameister +${CHAMPION_BONUS}.`,
    ],
  ];
  return (
    <section className="mt-8 rounded-2xl border border-dashed border-border px-4 py-4">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        So läuft's
      </h2>
      <ol className="space-y-3">
        {steps.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 font-display text-[15px] font-bold text-primary">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold">{title}</span>
              <span className="block text-[13.5px] text-muted-foreground">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * „solo“: oben auf der Tipps-Seite – eine schmale Zeile, die zu Tipprunden
 * einlädt (Details und Knöpfe erst beim Antippen).
 * „hub“: man ist in Runden – die Runden sind der Weg zum Tippen.
 */
/** Vom KickTime-Team für alle Tipprunden gesperrt – statt „Runde erstellen“. */
function BannedEverywhere() {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <Ban className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <div className="text-[15px] font-semibold">Für Tipprunden gesperrt</div>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            Das KickTime-Team hat dich gesperrt. Du kannst keiner Runde beitreten und keine
            erstellen. Spielplan, Erinnerungen und deine eigenen Tipps funktionieren weiter.
          </p>
        </div>
      </div>
      <AppealBlock className="mt-3" appealKey={{ scope: "global" }} decider="team" />
    </div>
  );
}

export function TipGroupsSection({ variant }: { variant: "solo" | "hub" }) {
  const demo = useAppStore((s) => s.demo.enabled);
  const groupTips = useAppStore((s) => s.groupTips);
  const { data: groups, isLoading, isError, error } = useMyGroups();
  const globallyBanned = !!useBanStatus().data?.global;
  const approved = groups?.filter((g) => !g.pending) ?? [];
  const pendingGroups = groups?.filter((g) => g.pending) ?? [];
  const [form, setForm] = useState<"create" | "join" | null>(null);
  const [invite, setInvite] = useState(false);
  // Eigene Tipps aller Runden laden, damit jede Karte „noch ohne Tipp“ zeigen kann.
  useQueries({
    queries: (variant === "hub" ? approved : []).map((g) => ({
      queryKey: ["tip-board", g.id],
      queryFn: async () => {
        const board = await loadBoard(g.id);
        const me = board.members.find((m) => m.isMe);
        if (me) {
          useAppStore.getState().setGroupTips(g.id, me.tips);
          useAppStore.getState().setGroupChampion(g.id, me.champion);
        }
        return board;
      },
      staleTime: 60_000,
    })),
  });

  // Ohne Server bzw. bevor die Tipprunde dort eingerichtet ist: ausblenden.
  if (!isBackendConfigured() || (error instanceof TipError && error.notInstalled)) return null;

  const buttons = globallyBanned ? (
    <BannedEverywhere />
  ) : (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => {
          setInvite(false);
          setForm("create");
        }}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
      >
        <Plus className="h-4 w-4" /> Runde erstellen
      </button>
      <button
        type="button"
        onClick={() => {
          setInvite(false);
          setForm("join");
        }}
        className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card text-[15px] font-semibold"
      >
        Mit Code beitreten
      </button>
    </div>
  );

  const card = (g: NonNullable<typeof groups>[number]) => (
    <RoundCard
      key={g.id}
      code={g.code}
      name={g.name}
      sub={`${g.members} Mitspieler · Code ${g.code}`}
      owner={g.isOwner}
      tips={groupTips[g.id]}
      pending={g.pending}
      requests={g.requests}
    />
  );

  const form$ = (
    <GroupFormDrawer
      key={form ?? "none"}
      mode={form ?? "create"}
      open={form !== null}
      onOpenChange={(v) => !v && setForm(null)}
    />
  );

  if (variant === "solo" && globallyBanned) {
    return (
      <section className="mb-5">
        <BannedEverywhere />
      </section>
    );
  }

  if (variant === "solo") {
    return (
      <section className="mb-5 space-y-2.5">
        {pendingGroups.map(card)}
        <button
          type="button"
          onClick={() => setInvite(true)}
          data-tour="friends"
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/40"
        >
          <Users className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Mit Freunden tippen</span>
            <span className="block text-[13px] text-muted-foreground">
              Tipprunde erstellen oder mit Code beitreten
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
        </button>
        <Drawer open={invite} onOpenChange={setInvite} shouldScaleBackground={false}>
          <DrawerContent className="mx-auto max-w-lg border-border bg-background">
            <div className="space-y-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
              <DrawerTitle className="font-display text-2xl font-bold uppercase">
                Mit Freunden tippen
              </DrawerTitle>
              <DrawerDescription className="text-[14.5px] text-muted-foreground">
                Erstelle eine Tipprunde und schick den Code weiter – ohne Anmeldung. Wer beitritt,
                nimmst du an. Danach tippst du in der Runde, deine bisherigen Tipps werden
                übernommen.
                {demo && " Vorschau: Die Runden sind echt – Ergebnisse und Punkte simuliert."}
              </DrawerDescription>
              {buttons}
            </div>
          </DrawerContent>
        </Drawer>
        {form$}
      </section>
    );
  }

  return (
    <section>
      <div data-tour={groups?.length ? "groups" : undefined} className="mb-6 space-y-2.5">
        {approved.length > 1 && (
          <p className="mb-1 rounded-2xl border border-primary/30 bg-primary/8 px-4 py-3 text-[14px]">
            Du bist in <strong>{approved.length} Runden</strong>. Jede Runde hat eigene Tipps –
            tippe in jeder Runde einzeln. Bereits getippte Spiele kannst du dort übernehmen.
          </p>
        )}
        {groups?.map(card)}
        {demo && (
          <p className="px-1 text-[13px] text-muted-foreground">
            Vorschau: Die Runden sind echt – Einladungen und Anfragen funktionieren wie später.
            Ergebnisse und Punkte sind simuliert.
          </p>
        )}
      </div>

      {isLoading && (
        <p className="mb-3 flex items-center gap-2 text-[14px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lade deine Runden …
        </p>
      )}
      {isError && (
        <p className="mb-3 text-[14px] text-muted-foreground">
          Deine Runden konnten gerade nicht geladen werden.
        </p>
      )}

      <h2 className="mb-2.5 text-[15px] font-semibold text-muted-foreground">Weitere Runde</h2>
      <div data-tour="new-group">{buttons}</div>
      <HowItWorks />
      {form$}
    </section>
  );
}
