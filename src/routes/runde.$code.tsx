import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  Hourglass,
  Copy,
  Crown,
  Eye,
  Loader2,
  LogOut,
  Pencil,
  Share2,
  Target,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Flag } from "@/components/team/Flag";
import { Segmented } from "@/components/common/Segmented";
import { GroupFormDrawer, RulesButton } from "@/components/tipgroups/TipGroups";
import { TipPanel } from "@/components/tipgroups/TipPanel";
import type { TipContext } from "@/lib/tips";
import { demoBoard } from "@/demo/demoGroup";
import { TIP_GROUPS_KEY, useMyGroups } from "@/hooks/useMyGroups";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { teamDisplay } from "@/domain/labels";
import { buildBoard, scorePrediction, type BoardRow } from "@/domain/predictions";
import { tournamentWinner } from "@/domain/status";
import { formatDayShort } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { cn } from "@/lib/utils";
import { isBackendConfigured } from "@/services/supabase";
import {
  answerRequest,
  deleteGroup,
  inviteUrl,
  kickMember,
  leaveGroup,
  loadBoard,
  normalizeCode,
  renameMe,
  TipError,
  type TipBoard,
  type TipMember,
  type TipRequest,
} from "@/services/tipgroups";
import { useAppStore, useTimeZone, type DemoGroup } from "@/store/app-store";
import { useTournament } from "@/store/match-store";
import { getNation } from "@/tournament/nations";

export const Route = createFileRoute("/runde/$code")({
  head: () => ({
    meta: [{ title: "Tipprunde | KickTime" }, { name: "robots", content: "noindex" }],
  }),
  component: GroupPage,
});

function GroupPage() {
  const code = normalizeCode(Route.useParams().code);
  const demo = useAppStore((s) => s.demo.enabled);
  const { data: groups, isLoading } = useMyGroups();
  const group = groups?.find((g) => g.code === code);
  const demoGroup = useAppStore((s) => s.demoGroups.find((g) => g.code === code));

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/tipps"
        className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-full pl-1 pr-3 text-[15px] font-medium text-primary hover:bg-primary/10"
      >
        <ChevronLeft className="h-5 w-5" /> Tipps
      </Link>
      {demo ? (
        demoGroup?.pending ? (
          <DemoPending group={demoGroup} />
        ) : demoGroup ? (
          <DemoBoard group={demoGroup} />
        ) : (
          <JoinInvite code={code} />
        )
      ) : !isBackendConfigured() ? (
        <Note>Tipprunden brauchen den KickTime-Server.</Note>
      ) : isLoading ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lade …
        </p>
      ) : group?.pending ? (
        <PendingView name={group.name} code={group.code} onWithdraw={() => leaveGroup(group.id)} />
      ) : group ? (
        <ServerBoard groupId={group.id} />
      ) : (
        <JoinInvite code={code} />
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-border bg-card p-4 text-[15px] text-muted-foreground">
      {children}
    </p>
  );
}

/** Über einen Einladungslink gekommen, aber noch nicht dabei. */
function JoinInvite({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader eyebrow="Einladung" title="Tipprunde" subtitle={`Code ${code}`} />
      <div className="rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-[16px]">Du wurdest zu einer Tipprunde eingeladen.</p>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Wähle einen Namen und schick eine Anfrage. Sobald der Ersteller dich annimmt, tippst du
          mit. Ohne Anmeldung.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-[16px] font-semibold text-primary-foreground"
        >
          Jetzt beitreten
        </button>
      </div>
      <GroupFormDrawer mode="join" open={open} onOpenChange={setOpen} initialCode={code} />
    </>
  );
}

/** Anfrage gestellt – wartet auf den Ersteller. */
function PendingView({
  name,
  code,
  onWithdraw,
}: {
  name: string;
  code: string;
  onWithdraw: () => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader eyebrow="Tipprunde" title={name} subtitle={`Code ${code}`} />
      <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5 text-center">
        <Hourglass className="mx-auto h-8 w-8 text-gold" />
        <p className="mt-2 text-[17px] font-semibold">Wartet auf Freigabe</p>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Deine Anfrage ist angekommen. Sobald der Ersteller der Runde dich annimmt, kannst du hier
          tippen und siehst die Tabelle. Deine bisherigen Tipps sind schon dabei.
        </p>
      </div>
      <Confirm
        title="Anfrage zurückziehen?"
        text="Du kannst später mit dem Code erneut anfragen."
        action="Zurückziehen"
        onConfirm={async () => {
          await onWithdraw();
          await qc.invalidateQueries({ queryKey: TIP_GROUPS_KEY });
          toast("Anfrage zurückgezogen");
          navigate({ to: "/tipps" });
        }}
      >
        <button
          type="button"
          className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-card text-[15px] font-semibold text-muted-foreground"
        >
          Anfrage zurückziehen
        </button>
      </Confirm>
    </>
  );
}

/** Vorschau: wie in echt warten – nach ein paar Sekunden nimmt Oma Gerda an. */
function DemoPending({ group: g }: { group: DemoGroup }) {
  const update = useAppStore((s) => s.updateDemoGroup);
  const removeGroup = useAppStore((s) => s.removeDemoGroup);
  useEffect(() => {
    const t = window.setTimeout(() => {
      update(g.id, { pending: false });
      toast.success(`Oma Gerda hat dich in „${g.name}“ angenommen`, {
        description: "Vorschau: In echt entscheidet der Ersteller der Runde.",
      });
    }, 5000);
    return () => window.clearTimeout(t);
  }, [g.id, g.name, update]);
  return <PendingView name={g.name} code={g.code} onWithdraw={async () => removeGroup(g.id)} />;
}

/** Beitrittsanfragen – nur der Ersteller sieht sie, gut sichtbar oben. */
function RequestsCard({
  requests,
  onAnswer,
}: {
  requests: TipRequest[];
  onAnswer: (r: TipRequest, accept: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (requests.length === 0) return null;
  const answer = async (r: TipRequest, accept: boolean) => {
    setBusy(r.id);
    try {
      await onAnswer(r, accept);
      toast(accept ? `${r.name} ist jetzt dabei` : `Anfrage von ${r.name} abgelehnt`);
    } catch (err) {
      toast.error(err instanceof TipError ? err.message : "Das hat nicht geklappt.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="mb-5 rounded-2xl border border-gold/40 bg-gold/10 p-4">
      <h2 className="flex items-center gap-2 text-[16px] font-bold">
        <UserPlus className="h-5 w-5 text-gold" />
        {requests.length === 1 ? "1 Beitrittsanfrage" : `${requests.length} Beitrittsanfragen`}
      </h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Nur du als Ersteller siehst das. Erst wen du annimmst, tippt mit.
      </p>
      <ul className="mt-3 space-y-2">
        {requests.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{r.name}</span>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => answer(r, false)}
              aria-label={`${r.name} ablehnen`}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-full border border-border px-3.5 text-[14px] font-semibold text-muted-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Ablehnen
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => answer(r, true)}
              aria-label={`${r.name} annehmen`}
              className="inline-flex h-11 items-center justify-center gap-1 rounded-full bg-primary px-3.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy === r.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Annehmen
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */

type BoardActions = {
  /** Vorschau: nichts wird geteilt oder gespeichert. */
  demo?: boolean;
  kick: (m: TipMember) => Promise<void>;
  leave: () => Promise<void>;
  remove: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  answer: (r: TipRequest, accept: boolean) => Promise<void>;
};

/** Echte Runde: Daten vom Server, Aktionen über die RPC-Funktionen. */
function ServerBoard({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["tip-board", groupId],
    queryFn: () => loadBoard(groupId),
    refetchInterval: 60_000,
  });
  const cachedTips = useAppStore((s) => s.groupTips[groupId]);
  const cachedChampion = useAppStore((s) => s.groupChampion[groupId]);
  // Eigene Tipps dieser Runde vom Server in den Zwischenspeicher übernehmen.
  useEffect(() => {
    const me = data?.members.find((m) => m.isMe);
    if (!me) return;
    const store = useAppStore.getState();
    store.setGroupTips(groupId, me.tips);
    store.setGroupChampion(groupId, me.champion);
  }, [data, groupId]);

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Lade Tabelle …
      </p>
    );
  }
  if (error || !data) {
    return (
      <Note>
        {error instanceof TipError ? error.message : "Die Tabelle konnte nicht geladen werden."}{" "}
        <button type="button" onClick={() => refetch()} className="font-semibold text-primary">
          Erneut versuchen
        </button>
      </Note>
    );
  }
  const afterLeave = async () => {
    await qc.invalidateQueries({ queryKey: TIP_GROUPS_KEY });
    navigate({ to: "/tipps" });
  };
  return (
    <BoardView
      data={data}
      myTips={cachedTips ?? data.members.find((m) => m.isMe)?.tips ?? {}}
      myChampion={
        cachedChampion !== undefined
          ? cachedChampion
          : (data.members.find((m) => m.isMe)?.champion ?? null)
      }
      context={{ kind: "group", id: groupId, label: data.group.name }}
      actions={{
        kick: async (m) => {
          await kickMember(groupId, m.id);
          await refetch();
        },
        leave: async () => {
          await leaveGroup(groupId);
          await afterLeave();
        },
        remove: async () => {
          await deleteGroup(groupId);
          await afterLeave();
        },
        answer: async (r, accept) => {
          await answerRequest(groupId, r.id, accept);
          await refetch();
          await qc.invalidateQueries({ queryKey: TIP_GROUPS_KEY });
        },
        rename: async (name) => {
          await renameMe(groupId, name);
          useAppStore.getState().setTipName(name);
          await refetch();
        },
      }}
    />
  );
}

/** Vorschau-Runde – verhält sich wie eine echte, alles nur auf dem Gerät. */
function DemoBoard({ group: g }: { group: DemoGroup }) {
  const { matches } = useTournament();
  const navigate = useNavigate();
  const update = useAppStore((s) => s.updateDemoGroup);
  const removeGroup = useAppStore((s) => s.removeDemoGroup);
  const myTips = useAppStore((s) => s.groupTips[g.id]) ?? EMPTY_TIPS;
  const myChampion = useAppStore((s) => s.groupChampion[g.id]) ?? null;
  const data = useMemo(() => demoBoard(matches, g), [matches, g]);
  const leave = async () => {
    removeGroup(g.id);
    navigate({ to: "/tipps" });
  };
  return (
    <BoardView
      data={data}
      myTips={myTips}
      myChampion={myChampion}
      context={{ kind: "demo", id: g.id, label: g.name }}
      actions={{
        demo: true,
        kick: async (m) => update(g.id, { members: g.members.filter((id) => id !== m.id) }),
        answer: async (r, accept) =>
          update(g.id, {
            requests: g.requests.filter((id) => id !== r.id),
            members: accept ? [...g.members, r.id] : g.members,
          }),
        leave,
        remove: leave,
        rename: async (name) => update(g.id, { myName: name }),
      }}
    />
  );
}

const EMPTY_TIPS: Record<string, { home: number; away: number }> = {};

function BoardView({
  data,
  actions,
  myTips,
  myChampion,
  context,
}: {
  data: TipBoard;
  actions: BoardActions;
  /** Eigene Tipps in dieser Runde (frisch vom Gerät). */
  myTips: Record<string, { home: number; away: number }>;
  myChampion: string | null;
  context: TipContext;
}) {
  const tournament = useTournament();
  const [tab, setTab] = useState<"tippen" | "tabelle">("tippen");
  // Diese Runde wird zur gewählten – auch das Spiel-Detail tippt dann hierfür.
  const setTipContext = useAppStore((s) => s.setTipContext);
  useEffect(() => setTipContext(context.id), [context.id, setTipContext]);
  const spoiler = useAppStore((s) => s.spoilerProtection);
  const revealed = useAppStore((s) => s.revealed);
  const revealMany = useAppStore((s) => s.revealMany);
  const [selected, setSelected] = useState<TipMember | null>(null);
  const [renaming, setRenaming] = useState(false);

  // Eigene Tipps immer frisch vom Gerät (der Server kennt sie evtl. noch nicht).
  const members = useMemo(
    () =>
      data.members.map((m) =>
        m.isMe
          ? {
              ...m,
              champion: myChampion,
              tips: Object.fromEntries(
                Object.entries(myTips).map(([id, p]) => [id, { home: p.home, away: p.away }]),
              ),
            }
          : m,
      ),
    [data, myTips, myChampion],
  );

  const champion = tournamentWinner(tournament);
  const final = tournament.matches.find((m) => m.stage === "final");
  const isVisible = (m: MatchView) => !spoiler || !!revealed[m.id];
  const hiddenIds = tournament.matches
    .filter((m) => m.status === "finished" && m.score && !isVisible(m))
    .map((m) => m.id);
  const rows = buildBoard(members, tournament.matches, {
    counts: isVisible,
    champion: champion && final && isVisible(final) ? champion : null,
  });

  const g = data.group;
  const me = data.members.find((m) => m.isMe);
  const myRank = rows.find((r) => r.id === me?.id);
  const share = async () => {
    if (actions.demo) {
      toast("In der Vorschau wird nichts geteilt", {
        description: "In einer echten Runde schickst du hier den Link an Freunde.",
      });
      return;
    }
    const url = inviteUrl(g.code);
    const text = `Tipp mit mir die EURO 2028 in der Runde „${g.name}“! Code: ${g.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "KickTime Tipprunde", text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success("Einladung kopiert");
      }
    } catch {
      /* Teilen abgebrochen */
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Tipprunde"
        title={g.name}
        subtitle={
          myRank
            ? `${rows.length} Mitspieler · Du: ${myRank.rank}. Platz, ${myRank.points} Punkte`
            : `${rows.length} Mitspieler`
        }
        action={<RulesButton />}
      />

      {g.isOwner && <RequestsCard requests={data.requests ?? []} onAnswer={actions.answer} />}

      <Segmented<"tippen" | "tabelle">
        size="lg"
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "tippen", label: "Tippen" },
          { value: "tabelle", label: "Tabelle" },
        ]}
      />

      {tab === "tippen" ? (
        <>
          <p className="mb-4 flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/8 px-4 py-3 text-[14px]">
            <Target className="h-4 w-4 shrink-0 text-primary" />
            <span>
              Deine Tipps gelten nur für <strong>„{g.name}“</strong>.
              {actions.demo && " Vorschau: Die Runde gibt es nur auf diesem Gerät."}
            </span>
          </p>
          <TipPanel ctx={context} showStats={false} />
        </>
      ) : (
        <>
          {/* Tabelle */}
          {hiddenIds.length > 0 && (
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-[14px]">
              <span className="flex-1 text-muted-foreground">
                Spoilerschutz: {hiddenIds.length}{" "}
                {hiddenIds.length === 1 ? "Ergebnis zählt" : "Ergebnisse zählen"} noch nicht mit.
              </span>
              <button
                type="button"
                onClick={() => revealMany(hiddenIds)}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-elevated px-3.5 font-semibold ring-1 ring-border"
              >
                <Eye className="h-4 w-4" /> Aufdecken
              </button>
            </div>
          )}
          <ol className="mb-6 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
            {rows.map((r) => {
              const m = members.find((x) => x.id === r.id)!;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m)}
                    className={cn(
                      "flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40",
                      m.isMe && "bg-primary/8",
                    )}
                  >
                    <span
                      className={cn(
                        "w-7 shrink-0 text-center font-display text-[20px] font-bold tabular",
                        r.rank === 1 ? "text-gold" : "text-muted-foreground",
                      )}
                    >
                      {r.rank}.
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[16px] font-semibold">
                        <span className="truncate">{r.name}</span>
                        {m.isMe && (
                          <span className="text-[13px] font-normal text-primary">(du)</span>
                        )}
                        {m.isOwner && <Crown className="h-4 w-4 shrink-0 text-gold" />}
                      </span>
                      <span className="text-[12.5px] text-muted-foreground">
                        {r.exact} Volltreffer · {r.hits} Treffer
                        {r.championPoints > 0 && " · Europameister richtig"}
                      </span>
                    </span>
                    <span className="font-display text-[26px] font-bold tabular">{r.points}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Einladen */}
          <section className="mb-6 rounded-2xl border border-border bg-card p-4">
            <div className="text-[13px] text-muted-foreground">Code zum Beitreten</div>
            <div className="mt-0.5 flex items-center gap-3">
              <span className="font-display text-[34px] font-bold tracking-[0.2em] tabular">
                {g.code}
              </span>
              <button
                type="button"
                aria-label="Code kopieren"
                onClick={async () => {
                  await navigator.clipboard?.writeText(g.code).catch(() => {});
                  toast.success("Code kopiert");
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={share}
              className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground"
            >
              <Share2 className="h-4 w-4" /> Freunde einladen
            </button>
          </section>

          {/* Eigene Einstellungen */}
          <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="flex h-14 w-full items-center gap-3 px-4 text-left text-[15px] hover:bg-muted/40"
            >
              <Pencil className="h-[18px] w-[18px] text-muted-foreground" />
              <span className="flex-1">Meinen Namen ändern</span>
              <span className="text-muted-foreground">{me?.name}</span>
            </button>
            <Confirm
              title="Runde verlassen?"
              text={
                g.isOwner
                  ? "Du hast die Runde erstellt. Wenn du gehst, übernimmt das älteste Mitglied."
                  : "Du kannst später mit dem Code wieder beitreten."
              }
              action="Verlassen"
              onConfirm={async () => {
                await actions.leave();
                toast("Runde verlassen");
              }}
            >
              <button
                type="button"
                className="flex h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-destructive hover:bg-muted/40"
              >
                <LogOut className="h-[18px] w-[18px]" />
                <span className="flex-1">Runde verlassen</span>
              </button>
            </Confirm>
            {g.isOwner && (
              <Confirm
                title="Runde für alle löschen?"
                text="Die Runde und ihre Tabelle verschwinden für alle Mitspieler. Eure Tipps bleiben auf euren Geräten."
                action="Löschen"
                onConfirm={async () => {
                  await actions.remove();
                  toast("Runde gelöscht");
                }}
              >
                <button
                  type="button"
                  className="flex h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-destructive hover:bg-muted/40"
                >
                  <Trash2 className="h-[18px] w-[18px]" />
                  <span className="flex-1">Runde löschen</span>
                </button>
              </Confirm>
            )}
          </div>
        </>
      )}

      <MemberDrawer
        member={selected}
        row={rows.find((r) => r.id === selected?.id)}
        canKick={g.isOwner && !!selected && !selected.isMe}
        onClose={() => setSelected(null)}
        onKick={async (m) => {
          await actions.kick(m);
          toast(`${m.name} wurde entfernt`);
          setSelected(null);
        }}
        isVisible={isVisible}
      />
      <RenameDrawer
        open={renaming}
        current={me?.name ?? ""}
        onClose={() => setRenaming(false)}
        onSave={actions.rename}
      />
    </>
  );
}

/** Bestätigung mit verständlicher Fehlermeldung. */
function Confirm({
  title,
  text,
  action,
  onConfirm,
  children,
}: {
  title: string;
  text: string;
  action: string;
  onConfirm: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() =>
              onConfirm().catch((err) =>
                toast.error(err instanceof TipError ? err.message : "Das hat nicht geklappt."),
              )
            }
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Tipps eines Mitspielers (fremde erst ab Anpfiff sichtbar). */
function MemberDrawer({
  member,
  row,
  canKick,
  onClose,
  onKick,
  isVisible,
}: {
  member: TipMember | null;
  row?: BoardRow;
  canKick: boolean;
  onClose: () => void;
  onKick: (m: TipMember) => Promise<void>;
  isVisible: (m: MatchView) => boolean;
}) {
  const { matches } = useTournament();
  const tz = useTimeZone();
  const list = member
    ? matches
        .filter((m) => member.tips[m.id] && (m.status !== "scheduled" || member.isMe))
        .sort((a, b) => Date.parse(b.kickoffUtc) - Date.parse(a.kickoffUtc))
    : [];
  const champ = getNation(member?.champion);
  return (
    <Drawer open={!!member} onOpenChange={(v) => !v && onClose()} shouldScaleBackground={false}>
      <DrawerContent className="mx-auto max-h-[90dvh] max-w-lg border-border bg-background">
        {member && (
          <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
            <DrawerTitle className="font-display text-2xl font-bold uppercase">
              {member.name}
            </DrawerTitle>
            <DrawerDescription className="text-[14px] text-muted-foreground">
              {row ? `${row.rank}. Platz · ${row.points} Punkte` : ""}
              {!member.isMe && " · Tipps sichtbar ab Anpfiff"}
            </DrawerDescription>
            {champ && (
              <p className="mt-3 flex items-center gap-2 text-[15px]">
                Europameister-Tipp: <Flag flag={champ.flag} size="sm" /> {champ.name}
              </p>
            )}
            <ul className="mt-4 divide-y divide-border/70 rounded-2xl border border-border bg-card">
              {list.length === 0 && (
                <li className="px-4 py-3 text-[14px] text-muted-foreground">
                  Noch keine sichtbaren Tipps.
                </li>
              )}
              {list.map((m) => {
                const t = member.tips[m.id];
                const show = m.status === "finished" && m.score && isVisible(m);
                const r = show ? scorePrediction(t, m.score!, m.stage) : null;
                return (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-[14.5px]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {teamDisplay(m.home, m.slotHome).name} –{" "}
                        {teamDisplay(m.away, m.slotAway).name}
                      </span>
                      <span className="text-[12.5px] text-muted-foreground">
                        {formatDayShort(m.kickoffUtc, tz)}
                        {show && ` · Ergebnis ${m.score!.home}:${m.score!.away}`}
                      </span>
                    </span>
                    <span className="font-display text-[19px] font-bold tabular">
                      {t.home}:{t.away}
                    </span>
                    <span className="w-9 text-right font-semibold text-primary tabular">
                      {r ? `+${r.points}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            {canKick && (
              <Confirm
                title={`${member.name} entfernen?`}
                text="Die Person verschwindet aus der Tabelle und kann mit dem Code nicht wieder beitreten."
                action="Entfernen"
                onConfirm={() => onKick(member)}
              >
                <button
                  type="button"
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-destructive/40 text-[15px] font-semibold text-destructive"
                >
                  <UserMinus className="h-4 w-4" /> Aus der Runde entfernen
                </button>
              </Confirm>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function RenameDrawer({
  open,
  current,
  onClose,
  onSave,
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName(current);
      setError(null);
    }
  }, [open, current]);
  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()} shouldScaleBackground={false}>
      <DrawerContent className="mx-auto max-w-lg border-border bg-background">
        <form
          key={String(open)}
          className="space-y-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await onSave(name.trim());
              toast.success("Name geändert");
              onClose();
            } catch (err) {
              setError(err instanceof TipError ? err.message : "Das hat nicht geklappt.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <DrawerTitle className="font-display text-2xl font-bold uppercase">
            Namen ändern
          </DrawerTitle>
          <DrawerDescription className="sr-only">Neuer Name in dieser Runde</DrawerDescription>
          <input
            defaultValue={current}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            aria-label="Neuer Name"
            className="h-12 w-full rounded-xl border border-border bg-card px-3.5 text-[16px] outline-none focus:border-primary"
          />
          {error && <p className="text-[14px] text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={busy || name.trim().length < 2}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            Speichern
          </button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
