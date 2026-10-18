import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  Copy,
  Crown,
  Eye,
  Loader2,
  LogOut,
  Pencil,
  Share2,
  Trash2,
  UserMinus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Flag } from "@/components/team/Flag";
import { GroupFormDrawer, RulesCard } from "@/components/tipgroups/TipGroups";
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
  deleteGroup,
  inviteUrl,
  kickMember,
  leaveGroup,
  loadBoard,
  normalizeCode,
  renameMe,
  TipError,
  type TipMember,
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
  const demo = useAppStore((s) => s.demo.enabled);
  const { data: groups, isLoading } = useMyGroups();
  const group = groups?.find((g) => g.code === code);

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
      ) : demo ? (
        <Note>
          Tipprunden gibt es nicht im Vorschau-Modus. Beende ihn oben im gelben Band, dann geht es
          weiter.
        </Note>
      ) : isLoading ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lade …
        </p>
      ) : group ? (
        <Board groupId={group.id} />
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
          Wähle einen Namen – dann siehst du die gemeinsame Tabelle. Ohne Anmeldung.
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

/* ------------------------------------------------------------------ */

function Board({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tournament = useTournament();
  const predictions = useAppStore((s) => s.predictions);
  const championTip = useAppStore((s) => s.championTip);
  const spoiler = useAppStore((s) => s.spoilerProtection);
  const revealed = useAppStore((s) => s.revealed);
  const revealMany = useAppStore((s) => s.revealMany);
  const [selected, setSelected] = useState<TipMember | null>(null);
  const [renaming, setRenaming] = useState(false);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["tip-board", groupId],
    queryFn: () => loadBoard(groupId),
    refetchInterval: 60_000,
  });

  // Eigene Tipps immer frisch vom Gerät (der Server kennt sie evtl. noch nicht).
  const members = useMemo(
    () =>
      (data?.members ?? []).map((m) =>
        m.isMe
          ? {
              ...m,
              champion: championTip,
              tips: Object.fromEntries(
                Object.entries(predictions).map(([id, p]) => [id, { home: p.home, away: p.away }]),
              ),
            }
          : m,
      ),
    [data, predictions, championTip],
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

  const g = data.group;
  const me = data.members.find((m) => m.isMe);
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
  const afterLeave = async () => {
    await qc.invalidateQueries({ queryKey: TIP_GROUPS_KEY });
    navigate({ to: "/tipps" });
  };

  return (
    <>
      <PageHeader eyebrow="Tipprunde" title={g.name} subtitle={`${rows.length} Mitspieler`} />

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

      {/* Tabelle */}
      <h2 className="mb-2.5 text-[19px] font-bold tracking-tight">Tabelle</h2>
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
                    {m.isMe && <span className="text-[13px] font-normal text-primary">(du)</span>}
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

      <RulesCard className="mb-6" />

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
            await leaveGroup(g.id);
            toast("Runde verlassen");
            await afterLeave();
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
              await deleteGroup(g.id);
              toast("Runde gelöscht");
              await afterLeave();
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

      <MemberDrawer
        member={selected}
        row={rows.find((r) => r.id === selected?.id)}
        canKick={g.isOwner && !!selected && !selected.isMe}
        onClose={() => setSelected(null)}
        onKick={async (m) => {
          await kickMember(g.id, m.id);
          toast(`${m.name} wurde entfernt`);
          setSelected(null);
          await refetch();
        }}
        isVisible={isVisible}
      />
      <RenameDrawer
        open={renaming}
        current={me?.name ?? ""}
        onClose={() => setRenaming(false)}
        onSave={async (name) => {
          await renameMe(g.id, name);
          useAppStore.getState().setTipName(name);
          await refetch();
        }}
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
