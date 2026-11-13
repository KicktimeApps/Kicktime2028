import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  Copy,
  Crown,
  Eye,
  QrCode as QrCodeIcon,
  Settings,
  Share2,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { QrCode } from "@/components/common/QrCode";
import { Segmented } from "@/components/common/Segmented";
import { RulesButton } from "@/components/tipgroups/TipGroups";
import { RoundTour } from "@/components/tipgroups/TipsTour";
import { TipCompare } from "@/components/tipgroups/TipCompare";
import { TipPanel } from "@/components/tipgroups/TipPanel";
import type { TipContext } from "@/lib/tips";
import { TIP_GROUPS_KEY } from "@/hooks/useMyGroups";
import { RoundPageSkeleton } from "@/components/common/Skeleton";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { buildBoard, isRated } from "@/domain/predictions";
import { tournamentWinner } from "@/domain/status";
import type { MatchView } from "@/domain/types";
import { cn } from "@/lib/utils";
import {
  answerRequest,
  deleteGroup,
  inviteUrl,
  kickMember,
  leaveGroup,
  loadBoard,
  renameMe,
  TipError,
  type TipBoard,
  type TipMember,
} from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";
import { useTournament } from "@/store/match-store";
import { Note } from "./RoundShared";
import { type BoardActions, RoundSettings } from "./RoundSettings";
import { useBannedList } from "./use-banned-list";
import { GroupEvents } from "./GroupEvents";
import { MemberDrawer, RenameDrawer } from "./MemberDrawer";

/** Echte Runde: Daten vom Server, Aktionen über die RPC-Funktionen. */
export function ServerBoard({ groupId }: { groupId: string }) {
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

  if (isLoading) return <RoundPageSkeleton />;
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
  const [tab, setTab] = useState<"tippen" | "vergleich" | "tabelle">("tippen");
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
    .filter((m) => isRated(m, true) && !isVisible(m))
    .map((m) => m.id);
  // Laufende Spiele zählen mit dem Zwischenstand vorläufig mit (wie bei Kicktipp).
  const rows = buildBoard(members, tournament.matches, {
    live: true,
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
              data-tour="round-settings"
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
            <RulesButton tour="round" />
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

      <div data-tour="round-tabs" className="mb-3">
        <Segmented<"tippen" | "vergleich" | "tabelle">
          size="lg"
          value={tab}
          onChange={setTab}
          options={[
            { value: "tippen", label: "Tippen" },
            { value: "vergleich", label: "Vergleich" },
            { value: "tabelle", label: "Tabelle" },
          ]}
        />
      </div>

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
      {tab === "vergleich" && (
        <TipCompare
          members={members}
          rows={rows}
          isVisible={isVisible}
          onSelect={setSelected}
          demo={demo}
        />
      )}
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
          {rows.some((r) => r.hasLive) && (
            <p className="mb-2 flex items-center gap-2 px-1 text-[12.5px] text-muted-foreground">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-live" />
              Live: Punkte aus laufenden Spielen sind vorläufig.
            </p>
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
                    <span className="flex shrink-0 flex-col items-end leading-none">
                      <span className="font-display text-[26px] font-bold tabular">{r.points}</span>
                      {r.hasLive && (
                        <span className="mt-1 text-[11.5px] font-semibold text-live tabular">
                          {r.livePoints > 0 ? `+${r.livePoints} live` : "live"}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <InviteCard code={g.code} name={g.name} onShare={share} />
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
      {tab === "tippen" && <RoundTour name={g.name} isOwner={g.isOwner} />}
    </>
  );
}

function InviteCard({ code, name, onShare }: { code: string; name: string; onShare: () => void }) {
  const [qr, setQr] = useState(false);
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
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={onShare}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground"
        >
          <Share2 className="h-4 w-4" /> Freunde einladen
        </button>
        <button
          type="button"
          onClick={() => setQr(true)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border px-4 text-[15px] font-semibold"
        >
          <QrCodeIcon className="h-4 w-4" /> QR-Code
        </button>
      </div>
      <Drawer open={qr} onOpenChange={setQr} shouldScaleBackground={false}>
        <DrawerContent className="mx-auto max-w-lg border-border bg-background">
          <div className="flex flex-col items-center px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4 text-center">
            <DrawerTitle className="font-display text-2xl font-bold uppercase">{name}</DrawerTitle>
            <DrawerDescription className="mt-1 text-[14px] text-muted-foreground">
              Mit der Handy-Kamera scannen – öffnet die Einladung direkt.
            </DrawerDescription>
            <div className="mt-5 w-full max-w-[280px] overflow-hidden rounded-2xl bg-white p-3 shadow-sm">
              <QrCode
                value={inviteUrl(code)}
                label={`QR-Code für die Einladung in „${name}“`}
                className="block h-auto w-full"
              />
            </div>
            <div className="mt-4 text-[13px] text-muted-foreground">oder Code eingeben</div>
            <div className="font-display text-[30px] font-bold tracking-[0.2em] tabular">
              {code}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
