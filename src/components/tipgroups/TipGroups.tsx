import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  Crown,
  FlaskConical,
  Info,
  Loader2,
  Plus,
  Save,
  Trophy,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Flag } from "@/components/team/Flag";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { canPredict, CHAMPION_BONUS, RESULT_POINTS, STAGE_MULTIPLIER } from "@/domain/predictions";
import { TIP_GROUPS_KEY, useMyGroups } from "@/hooks/useMyGroups";
import { saveChampion, useContextChampion, useTipContext, type TipContext } from "@/lib/tips";
import { DEMO_GROUP } from "@/demo/demoGroup";
import { cn } from "@/lib/utils";
import { isBackendConfigured } from "@/services/supabase";
import {
  createGroup,
  importTips,
  joinGroup,
  loadBoard,
  normalizeCode,
  setGroupChampion,
  TipError,
} from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";
import { useNow, useTournament } from "@/store/match-store";
import { NATIONS, getNation } from "@/tournament/nations";

/* ------------------------------------------------------------------ */
/* Regeln                                                              */
/* ------------------------------------------------------------------ */

export function RulesCard({ className }: { className?: string }) {
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
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
  return (
    <section className="mb-7 rounded-2xl border border-gold/30 bg-gold/8 p-4">
      <div className="flex items-center gap-2 text-[16px] font-bold">
        <Trophy className="h-5 w-5 text-gold" /> Dein Europameister-Tipp
      </div>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        {locked
          ? "Abgabe ist vorbei."
          : `Bonuspunkte, wenn er stimmt. Änderbar bis zum Eröffnungsspiel${where}.`}
      </p>
      {locked ? (
        <div className="mt-3 flex items-center gap-2.5 text-[16px] font-semibold">
          {pick ? (
            <>
              <Flag flag={pick.flag} size="md" /> {pick.name}
            </>
          ) : (
            <span className="text-muted-foreground">Kein Tipp abgegeben</span>
          )}
        </div>
      ) : (
        <>
          <select
            value={draft ?? ""}
            onChange={(e) => setDraft(e.target.value || null)}
            aria-label="Europameister-Tipp"
            className="mt-3 h-12 w-full rounded-xl border border-border bg-card px-3 text-[16px] outline-none focus:border-primary"
          >
            <option value="">Noch kein Tipp</option>
            {options.map((n) => (
              <option key={n.code} value={n.code}>
                {n.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!dirty || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await saveChampion(ctx, draft);
                toast.success(
                  draft
                    ? `Europameister-Tipp gespeichert${where}`
                    : `Europameister-Tipp gelöscht${where}`,
                  { description: draft ? getNation(draft)?.name : undefined },
                );
              } catch (err) {
                toast.error(err instanceof TipError ? err.message : "Das hat nicht geklappt.");
              } finally {
                setBusy(false);
              }
            }}
            className={cn(
              "mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[16px] font-semibold",
              dirty
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground",
            )}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : dirty ? (
              <Save className="h-4 w-4" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : null}
            {dirty ? "Tipp speichern" : saved ? "Gespeichert" : "Erst auswählen, dann speichern"}
          </button>
        </>
      )}
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
  const kickoffs = new Map(matches.map((m) => [m.id, Date.parse(m.kickoffUtc)]));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(tipName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const g =
        mode === "create"
          ? await createGroup(groupName.trim(), name.trim())
          : await joinGroup(normalizeCode(code), name.trim());
      setTipName(name.trim());
      // Bisherige Einzel-Tipps für noch offene Spiele in die Runde übernehmen.
      const { predictions, championTip } = useAppStore.getState();
      const open = Object.entries(predictions)
        .filter(([id]) => (kickoffs.get(id) ?? 0) > Date.now())
        .map(([match_id, p]) => ({ match_id, home: p.home, away: p.away }));
      const imported = open.length ? await importTips(g.id, open).catch(() => 0) : 0;
      if (championTip) await setGroupChampion(g.id, championTip).catch(() => {});
      setTipContext(g.id);
      await qc.invalidateQueries({ queryKey: TIP_GROUPS_KEY });
      await qc.invalidateQueries({ queryKey: ["tip-board", g.id] });
      if (imported > 0)
        toast(`${imported} ${imported === 1 ? "Tipp" : "Tipps"} übernommen`, {
          description: "Deine bisherigen Tipps gelten jetzt auch in dieser Runde.",
        });
      onOpenChange(false);
      toast.success(mode === "create" ? "Tipprunde erstellt" : `Willkommen in „${g.name}“`, {
        description: mode === "create" ? `Code ${g.code} – jetzt Freunde einladen.` : undefined,
      });
      navigate({ to: "/runde/$code", params: { code: g.code } });
    } catch (err) {
      setError(err instanceof TipError ? err.message : "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  };

  const valid =
    name.trim().length >= 2 &&
    (mode === "create" ? groupName.trim().length >= 2 : normalizeCode(code).length === 6);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="mx-auto max-w-lg border-border bg-background">
        <form
          className="space-y-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !busy) void submit();
          }}
        >
          <DrawerTitle className="font-display text-2xl font-bold uppercase">
            {mode === "create" ? "Tipprunde erstellen" : "Tipprunde beitreten"}
          </DrawerTitle>
          <DrawerDescription className="text-[14px] text-muted-foreground">
            {mode === "create"
              ? "Du bekommst einen Code, den du an Freunde schickst. Ohne Anmeldung."
              : "Gib den Code ein, den du bekommen hast. Ohne Anmeldung."}
          </DrawerDescription>
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
          <button
            type="submit"
            disabled={!valid || busy}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "create" ? "Runde erstellen" : "Beitreten"}
          </button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Abschnitt auf der Tipps-Seite                                       */
/* ------------------------------------------------------------------ */

/** Anzahl offener (gepaarter, noch nicht angepfiffener) Spiele ohne Tipp. */
function useOpenWithoutTip(tips: Record<string, unknown> | undefined): number | null {
  const { matches } = useTournament();
  const now = useNow();
  const open = matches.filter((m) => m.home && m.away && canPredict(m, now));
  // Noch nichts zu tippen (z. B. vor der Auslosung): keine Anzeige.
  if (!tips || open.length === 0) return null;
  return open.filter((m) => !tips[m.id]).length;
}

function RoundCard({
  code,
  name,
  sub,
  owner,
  tips,
  demo,
}: {
  code: string;
  name: string;
  sub: string;
  owner?: boolean;
  tips: Record<string, unknown> | undefined;
  demo?: boolean;
}) {
  const open = useOpenWithoutTip(tips);
  return (
    <Link
      to="/runde/$code"
      params={{ code }}
      className={cn(
        "flex min-h-[72px] items-center gap-3 rounded-2xl border px-4 py-3",
        demo ? "border-gold/40 bg-gold/10" : "border-border bg-card hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          demo ? "bg-gold text-gold-foreground" : "bg-primary/12 text-primary",
        )}
      >
        {demo ? <FlaskConical className="h-5 w-5" /> : <Users className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[17px] font-semibold">
          <span className="line-clamp-2 leading-tight">{name}</span>
          {owner && <Crown className="h-4 w-4 shrink-0 text-gold" aria-label="von dir erstellt" />}
        </span>
        <span className="block text-[13px] text-muted-foreground">{sub}</span>
        {open !== null &&
          (open > 0 ? (
            <span className="mt-1 inline-block rounded-full bg-gold/15 px-2 py-0.5 text-[12px] font-semibold text-gold">
              {open} {open === 1 ? "Spiel" : "Spiele"} noch ohne Tipp
            </span>
          ) : (
            <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
              <Check className="h-3.5 w-3.5" /> Alles getippt
            </span>
          ))}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
    </Link>
  );
}

/**
 * „solo“: unter den eigenen Tipps – lädt zu einer Runde ein.
 * „hub“: man ist in Runden – die Runden sind der Weg zum Tippen.
 */
export function TipGroupsSection({ variant }: { variant: "solo" | "hub" }) {
  const demo = useAppStore((s) => s.demo.enabled);
  const groupTips = useAppStore((s) => s.groupTips);
  const demoTips = useAppStore((s) => s.demoPredictions);
  const { data: groups, isLoading, isError, error } = useMyGroups();
  const [form, setForm] = useState<"create" | "join" | null>(null);
  // Eigene Tipps aller Runden laden, damit jede Karte „noch ohne Tipp“ zeigen kann.
  useQueries({
    queries: (variant === "hub" && !demo ? (groups ?? []) : []).map((g) => ({
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
  if (!demo && (!isBackendConfigured() || (error instanceof TipError && error.notInstalled)))
    return null;

  const buttons = !demo && (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => setForm("create")}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground"
      >
        <Plus className="h-4 w-4" /> Runde erstellen
      </button>
      <button
        type="button"
        onClick={() => setForm("join")}
        className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card text-[15px] font-semibold"
      >
        Mit Code beitreten
      </button>
    </div>
  );

  return (
    <section className={variant === "solo" ? "mt-2" : undefined}>
      {variant === "solo" ? (
        <div className="mb-3 rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-[16px] font-semibold">
            <Users className="h-5 w-5 text-primary" /> Mit Freunden oder Familie tippen
          </p>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Erstelle eine Tipprunde und schick den Code weiter – ohne Anmeldung. Danach tippst du in
            der Runde, deine bisherigen Tipps werden übernommen.
          </p>
        </div>
      ) : (
        <div className="mb-6 space-y-2.5">
          {!demo && groups && groups.length > 1 && (
            <p className="mb-1 rounded-2xl border border-primary/30 bg-primary/8 px-4 py-3 text-[14px]">
              Du bist in <strong>{groups.length} Runden</strong>. Jede Runde hat eigene Tipps –
              tippe in jeder Runde einzeln. Bereits getippte Spiele kannst du dort übernehmen.
            </p>
          )}
          {demo ? (
            <>
              <RoundCard
                code={DEMO_GROUP.code}
                name={DEMO_GROUP.name}
                sub="Beispielrunde mit ausgedachten Mitspielern"
                tips={demoTips}
                demo
              />
              <p className="px-1 text-[13px] text-muted-foreground">
                Eigene Runden erstellen und beitreten geht, sobald du die Vorschau beendest.
              </p>
            </>
          ) : (
            groups?.map((g) => (
              <RoundCard
                key={g.id}
                code={g.code}
                name={g.name}
                sub={`${g.members} Mitspieler · Code ${g.code}`}
                owner={g.isOwner}
                tips={groupTips[g.id]}
              />
            ))
          )}
        </div>
      )}

      {isLoading && !demo && (
        <p className="mb-3 flex items-center gap-2 text-[14px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lade deine Runden …
        </p>
      )}
      {isError && !demo && (
        <p className="mb-3 text-[14px] text-muted-foreground">
          Deine Runden konnten gerade nicht geladen werden.
        </p>
      )}

      {variant === "hub" && !demo && (
        <h2 className="mb-2.5 text-[15px] font-semibold text-muted-foreground">Weitere Runde</h2>
      )}
      {buttons}

      <GroupFormDrawer
        key={form ?? "none"}
        mode={form ?? "create"}
        open={form !== null}
        onOpenChange={(v) => !v && setForm(null)}
      />
    </section>
  );
}
