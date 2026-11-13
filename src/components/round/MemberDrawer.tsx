import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Flag } from "@/components/team/Flag";
import {
  FormSheet,
  FormSheetContent,
  FormSheetDescription,
  FormSheetTitle,
} from "@/components/common/FormSheet";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { teamDisplay } from "@/domain/labels";
import { isRated, scorePrediction, type BoardRow } from "@/domain/predictions";
import { formatDayShort } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { cn } from "@/lib/utils";
import { TipError, type TipMember } from "@/services/tipgroups";
import { useTimeZone } from "@/store/app-store";
import { useTournament } from "@/store/match-store";
import { getNation } from "@/tournament/nations";

/** Tipps eines Mitspielers (fremde erst ab Anpfiff sichtbar). */
export function MemberDrawer({
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
                const show = isRated(m, true) && isVisible(m);
                const live = m.status === "live";
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
                        {show && (live ? " · Live " : " · Ergebnis ")}
                        {show && (
                          <span className={cn(live && "font-semibold text-live")}>
                            {m.score!.home}:{m.score!.away}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="font-display text-[19px] font-bold tabular">
                      {t.home}:{t.away}
                    </span>
                    <span
                      className={cn(
                        "w-9 text-right font-semibold tabular",
                        live ? "text-live" : "text-primary",
                      )}
                    >
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

export function RenameDrawer({
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
