import { Bell, Bookmark, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { isAlarmActive } from "@/domain/alarms";
import { teamDisplay } from "@/domain/labels";
import type { MatchView } from "@/domain/types";
import { downloadIcs } from "@/lib/calendar";
import { haptics } from "@/lib/haptics";
import { enableReminders } from "@/lib/reminders";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors [&_svg]:h-5 [&_svg]:w-5",
        active
          ? "bg-primary/14 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function MatchActions({
  match: m,
  calendar = false,
}: {
  match: MatchView;
  calendar?: boolean;
}) {
  const pinned = useAppStore((s) => s.pinned.includes(m.id));
  const togglePinned = useAppStore((s) => s.togglePinned);
  const alarms = useAppStore((s) => s.alarms);
  const autoFav = useAppStore((s) => s.autoAlarmFavorites);
  const favorites = useAppStore((s) => s.favorites);
  const pushEnabled = useAppStore((s) => s.pushEnabled);
  const setAlarm = useAppStore((s) => s.setAlarm);
  const upcoming = m.status === "scheduled";
  const alarmOn = pushEnabled && isAlarmActive(m, alarms, autoFav, favorites);
  const title = `${teamDisplay(m.home, m.slotHome).name} – ${teamDisplay(m.away, m.slotAway).name}`;

  const onBell = async () => {
    haptics.tap();
    if (!pushEnabled) {
      const ok = await enableReminders();
      if (!ok) return;
      setAlarm(m.id, true);
      return;
    }
    const autoOn = isAlarmActive(m, {}, autoFav, favorites);
    if (alarmOn) {
      setAlarm(m.id, autoOn ? false : null);
      toast("Erinnerung entfernt", { description: title });
    } else {
      setAlarm(m.id, autoOn ? null : true);
      toast.success("Erinnerung gesetzt", {
        description: m.kickoffConfirmed
          ? `15 Minuten vor Anpfiff: ${title}`
          : `${title} – sobald die Anstoßzeit feststeht`,
      });
    }
  };

  return (
    <div className="-mr-1.5 flex shrink-0 items-center">
      {calendar && (
        <IconButton
          label="Zum Kalender hinzufügen"
          onClick={() => {
            downloadIcs([m], `kicktime-spiel-${m.number}.ics`);
            toast.success("Kalendereintrag erstellt");
          }}
        >
          <CalendarPlus />
        </IconButton>
      )}
      {upcoming && (
        <IconButton
          label={alarmOn ? "Erinnerung entfernen" : "Erinnern"}
          active={alarmOn}
          onClick={onBell}
        >
          <Bell className={cn(alarmOn && "fill-current")} />
        </IconButton>
      )}
      <IconButton
        label={pinned ? "Nicht mehr vormerken" : "Vormerken"}
        active={pinned}
        onClick={() => {
          haptics.tap();
          togglePinned(m.id);
          toast(pinned ? "Nicht mehr vorgemerkt" : "Vorgemerkt – erscheint bei „Für dich“", {
            description: title,
            // Versehentlich entfernt? Mit einem Tipp zurückholen.
            action: pinned ? { label: "Rückgängig", onClick: () => togglePinned(m.id) } : undefined,
            duration: pinned ? 6000 : undefined,
          });
        }}
      >
        <Bookmark className={cn(pinned && "fill-current")} />
      </IconButton>
    </div>
  );
}
