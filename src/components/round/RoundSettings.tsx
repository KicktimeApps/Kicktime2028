import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  Check,
  ChevronRight,
  Crown,
  Loader2,
  KeyRound,
  LogOut,
  Pencil,
  Share2,
  Trash2,
  Undo2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppealBlock } from "@/components/tipgroups/AppealBlock";
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
import { cn } from "@/lib/utils";
import {
  rejectUnban,
  TipError,
  unbanMember,
  type BannedMember,
  type TipBoard,
  type TipMember,
  type TipRequest,
} from "@/services/tipgroups";
import { Confirm } from "./RoundShared";
import { useBannedList } from "./use-banned-list";

export type BoardActions = {
  /** `ban`: sperren statt nur entfernen. */
  kick: (m: TipMember, ban: boolean) => Promise<void>;
  leave: () => Promise<void>;
  remove: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  answer: (r: TipRequest, accept: boolean) => Promise<void>;
};

/** Beitrittsanfragen – nur der Ersteller sieht sie, gut sichtbar oben. */
export function RequestsCard({
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

/**
 * Einstellungen der Runde (Zahnrad): eigener Name, verlassen; für den
 * Ersteller zusätzlich Anfragen und Mitgliederverwaltung, Runde löschen.
 */
export function RoundSettings({
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
            <Link to="/einstellungen" search={{ s: "handywechsel" }} className={row}>
              <KeyRound className="h-[18px] w-[18px] text-muted-foreground" />
              <span className="flex-1">Code für neues Handy</span>
              <ChevronRight className="h-5 w-5 text-muted-foreground/60" />
            </Link>
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
export function KickChoice({
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
export function BannedList({ groupId }: { groupId: string }) {
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
