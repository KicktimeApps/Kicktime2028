import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Info,
  Copy,
  Crown,
  Eye,
  Loader2,
  LogOut,
  Pencil,
  Settings,
  Share2,
  Trash2,
  Undo2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Flag } from "@/components/team/Flag";
import { Segmented } from "@/components/common/Segmented";
import { AppealBlock } from "@/components/tipgroups/AppealBlock";
import { GroupFormDrawer, RulesButton } from "@/components/tipgroups/TipGroups";
import { TipPanel } from "@/components/tipgroups/TipPanel";
import type { TipContext } from "@/lib/tips";
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
import {
  FormSheet,
  FormSheetContent,
  FormSheetDescription,
  FormSheetTitle,
} from "@/components/common/FormSheet";
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
  bannedMembers,
  deleteGroup,
  groupEvents,
  inviteUrl,
  kickMember,
  leaveGroup,
  loadBoard,
  normalizeCode,
  renameMe,
  rejectUnban,
  TipError,
  unbanMember,
  type BannedMember,
  type TipBoard,
  type TipMember,
  type TipRequest,
} from "@/services/tipgroups";
import { useAppStore, useTimeZone } from "@/store/app-store";
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
  const { data: groups, isLoading } = useMyGroups();
  const group = groups?.find((g) => g.code === code);
  // Angenommen, während die Seite offen war → kurz Bescheid geben.
  const wasPending = useRef(false);
  useEffect(() => {
    if (group?.pending) wasPending.current = true;
    else if (group && wasPending.current) {
      wasPending.current = false;
      toast.success(`Du bist jetzt in „${group.name}“ dabei`, {
        description: "Ab sofort kannst du hier tippen.",
      });
    }
  }, [group]);
  // War man eben noch drin (verlassen, entfernt, Anfrage abgelehnt, Runde
  // gelöscht)? Dann zurück zur Tipps-Seite statt zur Einladung.
  const navigate = useNavigate();
  const wasIn = useRef(false);
  const inNow = !!group;
  useEffect(() => {
    if (inNow) wasIn.current = true;
    else if (wasIn.current && !isLoading) navigate({ to: "/tipps", replace: true });
  }, [inNow, isLoading, navigate]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/tipps"
        className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-full pl-1 pr-3 text-[15px] font-medium text-primary hover:bg-primary/10"
      >
        <ChevronLeft className="h-5 w-5" /> Tipps
      </Link>
      {!isBackendConfigured() ? (
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
          navigate({ to: "/tipps", replace: true });
          toast("Anfrage zurückgezogen");
          await qc.invalidateQueries({ queryKey: TIP_GROUPS_KEY });
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
        Nur du als Ersteller siehst das. Nur wen du annimmst, tippt mit.
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
  /** `ban`: sperren statt nur entfernen. */
  kick: (m: TipMember, ban: boolean) => Promise<void>;
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
    // Oft nachsehen, damit neue Anfragen und Mitglieder gleich erscheinen.
    refetchInterval: 10_000,
    // Verweigert der Server (nicht mehr Mitglied), nicht erst mehrfach probieren.
    retry: (count, err) => !(err instanceof TipError) && count < 2,
  });
  // Tabelle verweigert (z. B. gerade entfernt) → Rundenliste sofort neu laden;
  // die Seite springt dann zur Tipps-Seite und der Hinweis erscheint.
  useEffect(() => {
    if (error) void qc.invalidateQueries({ queryKey: TIP_GROUPS_KEY });
  }, [error, qc]);
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
    navigate({ to: "/tipps", replace: true });
    await qc.invalidateQueries({ queryKey: TIP_GROUPS_KEY });
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
        kick: async (m, ban) => {
          await kickMember(groupId, m.id, ban);
          await refetch();
          if (ban) await qc.invalidateQueries({ queryKey: ["tip-banned", groupId] });
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
  const demo = useAppStore((s) => s.demo.enabled);
  const [tab, setTab] = useState<"tippen" | "tabelle">("tippen");
  // Diese Runde wird zur gewählten – auch das Spiel-Detail tippt dann hierfür.
  const setTipContext = useAppStore((s) => s.setTipContext);
  useEffect(() => setTipContext(context.id), [context.id, setTipContext]);
  const spoiler = useAppStore((s) => s.spoilerProtection);
  const revealed = useAppStore((s) => s.revealed);
  const revealMany = useAppStore((s) => s.revealMany);
  const [selected, setSelected] = useState<TipMember | null>(null);
  const [renaming, setRenaming] = useState(false);
  // Aus der Push-Nachricht „Neue Beitrittsanfrage“: direkt die Verwaltung öffnen.
  const [settings, setSettings] = useState(
    () => typeof window !== "undefined" && /[?&]verwaltung=/.test(window.location.search),
  );

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

  const requests = g.isOwner ? (data.requests ?? []) : [];
  // Bitten Gesperrter an den Ersteller – zählen am Zahnrad mit.
  const ownerAppeals = (useBannedList(g.id, g.isOwner).data ?? []).filter(
    (b) => b.by === "owner" && b.request,
  ).length;

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
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSettings(true)}
              aria-label={
                requests.length
                  ? `Einstellungen der Runde, ${requests.length} offene Anfragen`
                  : "Einstellungen der Runde"
              }
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-5 w-5" />
              {requests.length + ownerAppeals > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
                  {requests.length + ownerAppeals}
                </span>
              )}
            </button>
            <RulesButton />
          </div>
        }
      />

      <GroupEvents groupId={g.id} />
      {requests.length > 0 && (
        <button
          type="button"
          onClick={() => setSettings(true)}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-left"
        >
          <UserPlus className="h-5 w-5 shrink-0 text-gold" />
          <span className="min-w-0 flex-1 text-[15px] font-semibold">
            {requests.length === 1
              ? `${requests[0].name} möchte mittippen`
              : `${requests.length} Beitrittsanfragen`}
          </span>
          <span className="text-[14px] font-semibold text-primary">Ansehen</span>
          <ChevronRight className="-ml-2 h-5 w-5 shrink-0 text-primary" />
        </button>
      )}

      <Segmented<"tippen" | "tabelle">
        size="lg"
        className="mb-3"
        value={tab}
        onChange={setTab}
        options={[
          { value: "tippen", label: "Tippen" },
          { value: "tabelle", label: "Tabelle" },
        ]}
      />

      {/* „Tippen“ bleibt beim Wechsel zur Tabelle erhalten (nur versteckt) –
          so gehen eingegebene, noch nicht gespeicherte Tipps nicht verloren. */}
      <div hidden={tab !== "tippen"}>
        {demo && (
          <p className="-mt-1 mb-3 px-1 text-[12.5px] text-muted-foreground">
            Vorschau: Die Runde ist echt, Ergebnisse und Punkte sind simuliert.
          </p>
        )}
        <TipPanel ctx={context} showStats={false} />
      </div>
      {tab === "tabelle" && (
        <>
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
          <InviteCard code={g.code} onShare={share} />
        </>
      )}

      <RoundSettings
        open={settings}
        onClose={() => setSettings(false)}
        group={g}
        me={me}
        members={members}
        requests={requests}
        actions={actions}
        onShare={share}
        onRename={() => {
          setSettings(false);
          setRenaming(true);
        }}
      />
      <MemberDrawer
        member={selected}
        row={rows.find((r) => r.id === selected?.id)}
        onClose={() => setSelected(null)}
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

function InviteCard({ code, onShare }: { code: string; onShare: () => void }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="text-[13px] text-muted-foreground">Code zum Beitreten</div>
      <div className="mt-0.5 flex items-center gap-3">
        <span className="font-display text-[34px] font-bold tracking-[0.2em] tabular">{code}</span>
        <button
          type="button"
          aria-label="Code kopieren"
          onClick={async () => {
            await navigator.clipboard?.writeText(code).catch(() => {});
            toast.success("Code kopiert");
          }}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={onShare}
        className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground"
      >
        <Share2 className="h-4 w-4" /> Freunde einladen
      </button>
    </section>
  );
}

/**
 * Einstellungen der Runde (Zahnrad): eigener Name, verlassen; für den
 * Ersteller zusätzlich Anfragen und Mitgliederverwaltung, Runde löschen.
 */
function RoundSettings({
  open,
  onClose,
  group: g,
  me,
  members,
  requests,
  actions,
  onShare,
  onRename,
}: {
  open: boolean;
  onClose: () => void;
  group: TipBoard["group"];
  me?: TipMember;
  members: TipMember[];
  requests: TipRequest[];
  actions: BoardActions;
  onShare: () => void;
  onRename: () => void;
}) {
  const row = "flex h-14 w-full items-center gap-3 px-4 text-left text-[15px] hover:bg-muted/40";
  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()} shouldScaleBackground={false}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-lg border-border bg-background">
        <div className="overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
          <DrawerTitle className="font-display text-2xl font-bold uppercase">
            Einstellungen
          </DrawerTitle>
          <DrawerDescription className="mb-4 text-[14px] text-muted-foreground">
            „{g.name}“ · Code {g.code}
          </DrawerDescription>

          {g.isOwner && (
            <>
              <RequestsCard requests={requests} onAnswer={actions.answer} />
              <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Mitglieder ({members.length})
              </h3>
              <ul className="mb-5 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
                {members.map((m) => (
                  <li key={m.id} className="flex min-h-14 items-center gap-2 px-4 py-2">
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-semibold">
                      <span className="truncate">{m.name}</span>
                      {m.isMe && <span className="text-[13px] font-normal text-primary">(du)</span>}
                      {m.isOwner && <Crown className="h-4 w-4 shrink-0 text-gold" />}
                    </span>
                    {!m.isMe && (
                      <KickChoice
                        name={m.name}
                        onKick={async (ban) => {
                          await actions.kick(m, ban);
                          toast(ban ? `${m.name} wurde gesperrt` : `${m.name} wurde entfernt`);
                        }}
                      >
                        <button
                          type="button"
                          aria-label={`${m.name} entfernen`}
                          className="inline-flex h-10 items-center gap-1 rounded-full border border-destructive/40 px-3 text-[13.5px] font-semibold text-destructive"
                        >
                          <UserMinus className="h-4 w-4" /> Entfernen
                        </button>
                      </KickChoice>
                    )}
                  </li>
                ))}
              </ul>
              {open && <BannedList groupId={g.id} />}
            </>
          )}

          <button
            type="button"
            onClick={onShare}
            className="mb-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground"
          >
            <Share2 className="h-4 w-4" /> Freunde einladen
          </button>

          <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
            <button type="button" onClick={onRename} className={row}>
              <Pencil className="h-[18px] w-[18px] text-muted-foreground" />
              <span className="flex-1">Meinen Namen ändern</span>
              <span className="text-muted-foreground">{me?.name}</span>
            </button>
            <Confirm
              title="Runde verlassen?"
              text={
                g.isOwner
                  ? "Du hast die Runde erstellt. Wenn du gehst, übernimmt das älteste Mitglied."
                  : "Du kannst später mit dem Code wieder anfragen."
              }
              action="Verlassen"
              onConfirm={async () => {
                await actions.leave();
                toast("Runde verlassen");
              }}
            >
              <button type="button" className={cn(row, "text-destructive")}>
                <LogOut className="h-[18px] w-[18px]" />
                <span className="flex-1">Runde verlassen</span>
              </button>
            </Confirm>
            {g.isOwner && (
              <Confirm
                title="Runde für alle löschen?"
                text="Die Runde, ihre Tabelle und alle Tipps darin verschwinden für alle Mitspieler."
                action="Löschen"
                onConfirm={async () => {
                  await actions.remove();
                  toast("Runde gelöscht");
                }}
              >
                <button type="button" className={cn(row, "text-destructive")}>
                  <Trash2 className="h-[18px] w-[18px]" />
                  <span className="flex-1">Runde löschen</span>
                </button>
              </Confirm>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Entfernen (darf wieder anfragen) oder sperren (kein Wiederbeitritt). */
function KickChoice({
  name,
  onKick,
  children,
}: {
  name: string;
  onKick: (ban: boolean) => Promise<void>;
  children: React.ReactNode;
}) {
  const run = (ban: boolean) =>
    onKick(ban).catch((err) =>
      toast.error(err instanceof TipError ? err.message : "Das hat nicht geklappt."),
    );
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{name} entfernen?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              <p>
                <strong className="text-foreground">Entfernen:</strong> {name} verschwindet aus der
                Tabelle, die Tipps sind weg. Mit dem Code kann {name} wieder anfragen.
              </p>
              <p>
                <strong className="text-foreground">Sperren:</strong> wie Entfernen, aber {name}{" "}
                kommt nicht wieder rein – bis du in den Einstellungen entsperrst.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="mt-0">Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            className="border border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10"
            onClick={() => run(false)}
          >
            Entfernen
          </AlertDialogAction>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => run(true)}
          >
            Sperren
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const BY_LABEL: Record<BannedMember["by"], string> = {
  owner: "von dir gesperrt",
  admin: "vom KickTime-Team gesperrt",
  global: "vom KickTime-Team für alle Runden gesperrt",
};

/**
 * Gesperrte der Runde (nur für den Ersteller). Eigene Sperren: entsperren –
 * und Bitten der Gesperrten annehmen oder ablehnen. Sperren durch das
 * KickTime-Team: nur beantragen. Ohne Gesperrte unsichtbar.
 */
function BannedList({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data } = useBannedList(groupId, true);
  if (!data?.length) return null;
  const act = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(id);
    try {
      await fn();
      toast(msg);
      await qc.invalidateQueries({ queryKey: ["tip-banned", groupId] });
    } catch (err) {
      toast.error(err instanceof TipError ? err.message : "Das hat nicht geklappt.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Gesperrt ({data.length})
      </h3>
      <ul className="mb-5 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
        {data.map((b) => (
          <li key={b.id} className="space-y-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{b.name}</span>
                <span className="block text-[12.5px] text-muted-foreground">{BY_LABEL[b.by]}</span>
              </span>
              {b.by === "owner" && (
                <button
                  type="button"
                  disabled={busy === b.id}
                  onClick={() =>
                    act(
                      b.id,
                      () => unbanMember(groupId, b.id),
                      `${b.name} ist entsperrt und kann mit dem Code wieder anfragen`,
                    )
                  }
                  className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-[13.5px] font-semibold disabled:opacity-50"
                >
                  {busy === b.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Undo2 className="h-4 w-4" />
                  )}
                  Entsperren
                </button>
              )}
            </div>
            {b.by === "owner" && b.request && (
              <div className="rounded-xl border border-primary/30 bg-primary/8 px-3 py-2.5 text-[13.5px]">
                <div className="font-semibold">Bittet um Entsperrung</div>
                {b.request.message && (
                  <p className="mt-0.5 text-muted-foreground">„{b.request.message}“</p>
                )}
                <button
                  type="button"
                  disabled={busy === b.id}
                  onClick={() => act(b.id, () => rejectUnban(groupId, b.id), "Bitte abgelehnt")}
                  className="mt-2 text-[13px] font-semibold text-destructive"
                >
                  Ablehnen
                </button>
              </div>
            )}
            {b.by !== "owner" && (
              <AppealBlock
                decider="team"
                appealKey={
                  b.by === "global"
                    ? { scope: "global", memberId: b.id }
                    : { scope: "group", groupId, memberId: b.id }
                }
              />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Gesperrte einer Runde – geteilt von Liste und Zähler am Zahnrad. */
function useBannedList(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["tip-banned", groupId],
    queryFn: () => bannedMembers(groupId),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
    // Fehlt das Server-Update, einfach nichts anzeigen.
    retry: false,
  });
}

/**
 * Hinweise der Runde für alle Mitglieder, z. B. „Tim wurde vom KickTime-Team
 * gesperrt“ oder „Anna leitet die Runde jetzt“. Weggeklickt bleibt weg.
 */
function GroupEvents({ groupId }: { groupId: string }) {
  const { data } = useQuery({
    queryKey: ["tip-events", groupId],
    queryFn: () => groupEvents(groupId),
    refetchInterval: 60_000,
    retry: false,
  });
  const [seen, setSeen] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SEEN_EVENTS_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const fresh = (data ?? []).filter((e) => !seen.includes(e.id)).slice(0, 3);
  if (fresh.length === 0) return null;
  const dismiss = () => {
    const next = [...seen, ...fresh.map((e) => e.id)].slice(-200);
    setSeen(next);
    try {
      localStorage.setItem(SEEN_EVENTS_KEY, JSON.stringify(next));
    } catch {
      /* egal */
    }
  };
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2.5 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-[14px]"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
      <ul className="flex-1 space-y-0.5">
        {fresh.map((e) => (
          <li key={e.id}>{e.text}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hinweis schließen"
        className="-m-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

const SEEN_EVENTS_KEY = "kicktime-2028.seen-group-events";

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
  onClose,
  isVisible,
}: {
  member: TipMember | null;
  row?: BoardRow;
  onClose: () => void;
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
    <FormSheet open={open} onOpenChange={(v) => !v && onClose()}>
      <FormSheetContent>
        <form
          key={String(open)}
          className="space-y-4"
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
          <FormSheetTitle className="pr-10 font-display text-2xl font-bold uppercase">
            Namen ändern
          </FormSheetTitle>
          <FormSheetDescription className="sr-only">
            Neuer Name in dieser Runde
          </FormSheetDescription>
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
      </FormSheetContent>
    </FormSheet>
  );
}
