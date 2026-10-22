import {
  Activity,
  BarChart3,
  Inbox,
  LayoutGrid,
  Loader2,
  Lock,
  Megaphone,
  Pencil,
  Radio,
  Settings2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { fetchRequests, verifyPin } from "@/services/admin";
import { isBackendConfigured } from "@/services/supabase";
import { GroupsSection } from "./GroupsSection";
import { LiveSection } from "./LiveSection";
import { MessagesSection } from "./MessagesSection";
import { OverrideSection } from "./OverrideSection";
import { OverviewSection } from "./OverviewSection";
import { RequestsSection } from "./RequestsSection";
import { StatsSection } from "./StatsSection";
import { SystemSection } from "./SystemSection";

export type AdminSection =
  "overview" | "live" | "override" | "groups" | "requests" | "messages" | "stats" | "system";

const SECTIONS: { value: AdminSection; label: string; icon: typeof Activity }[] = [
  { value: "overview", label: "Übersicht", icon: LayoutGrid },
  { value: "live", label: "Live-Daten", icon: Radio },
  { value: "override", label: "Korrektur", icon: Pencil },
  { value: "groups", label: "Tipprunden", icon: Users },
  { value: "requests", label: "Anträge", icon: Inbox },
  { value: "messages", label: "Mitteilungen", icon: Megaphone },
  { value: "stats", label: "Statistik", icon: BarChart3 },
  { value: "system", label: "System", icon: Settings2 },
];

/**
 * Die PIN bleibt 30 Minuten nach der letzten Nutzung im Speicher (nicht auf
 * dem Gerät) – so muss man sie beim erneuten Öffnen nicht ständig eingeben.
 */
const UNLOCK_MS = 30 * 60_000;
let unlocked: { pin: string; at: number } | null = null;
const rememberedPin = () =>
  unlocked && Date.now() - unlocked.at < UNLOCK_MS ? unlocked.pin : null;

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pin, setPin] = useState<string | null>(rememberedPin);
  const [section, setSection] = useState<AdminSection>("overview");
  useEffect(() => {
    if (open) setPin(rememberedPin());
    else if (unlocked) unlocked.at = Date.now();
  }, [open]);
  const unlock = (p: string) => {
    unlocked = { pin: p, at: Date.now() };
    setPin(p);
  };
  const lock = () => {
    unlocked = null;
    setPin(null);
    setSection("overview");
  };
  // Aktiven Bereich in der Leiste sichtbar halten (auf dem Handy scrollt sie seitlich).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [section, pin]);
  // Offene Entsperrungsanträge – Zähler in der Leiste.
  const [openRequests, setOpenRequests] = useState(0);
  const countRequests = useCallback(async () => {
    if (!pin) return;
    const r = await fetchRequests(pin);
    if (r.ok) setOpenRequests((r.data.data ?? []).filter((x) => x.status === "open").length);
  }, [pin]);
  useEffect(() => {
    void countRequests();
  }, [countRequests, section]);
  const go = (s: AdminSection) => {
    setSection(s);
    if (unlocked) unlocked.at = Date.now();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0">
        <DialogHeader className="space-y-1 px-5 pb-3 pt-5 text-left">
          <DialogTitle>Admin · Kontrollzentrum</DialogTitle>
          <DialogDescription>
            Nur für den Betreiber. Aktionen wirken für alle Nutzer.
          </DialogDescription>
        </DialogHeader>
        {!isBackendConfigured() ? (
          <p className="mx-5 mb-5 rounded-xl bg-subtle p-4 text-[13.5px] text-muted-foreground">
            Kein Backend konfiguriert – Admin-Funktionen benötigen Supabase (siehe README).
          </p>
        ) : !pin ? (
          <PinGate onUnlock={unlock} />
        ) : (
          <>
            <nav
              ref={navRef}
              aria-label="Admin-Bereiche"
              className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-5 pb-3 [scrollbar-width:none] sm:flex-wrap"
            >
              {SECTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => go(value)}
                  aria-current={section === value ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
                    section === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {value === "requests" && openRequests > 0 && (
                    <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
                      {openRequests}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
              {section === "overview" && (
                <OverviewSection pin={pin} go={go} openRequests={openRequests} />
              )}
              {section === "live" && <LiveSection pin={pin} />}
              {section === "override" && <OverrideSection pin={pin} />}
              {section === "groups" && <GroupsSection pin={pin} />}
              {section === "requests" && <RequestsSection pin={pin} onChange={countRequests} />}
              {section === "messages" && <MessagesSection pin={pin} />}
              {section === "stats" && <StatsSection pin={pin} />}
              {section === "system" && <SystemSection onLock={lock} />}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PinGate({ onUnlock }: { onUnlock: (pin: string) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const submit = async (v: string) => {
    setBusy(true);
    const ok = await verifyPin(v);
    setBusy(false);
    if (ok) {
      haptics.success();
      onUnlock(v);
    } else {
      haptics.warn();
      setError(true);
      setValue("");
    }
  };
  return (
    <form
      className="flex flex-col items-center gap-4 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.length >= 6) submit(value);
      }}
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
      </span>
      <input
        autoFocus
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={12}
        value={value}
        onChange={(e) => {
          setError(false);
          setValue(e.target.value.replace(/\D/g, ""));
        }}
        placeholder="PIN"
        aria-label="Admin-PIN"
        className={cn(
          "h-12 w-48 rounded-xl border bg-subtle text-center text-2xl tracking-[0.4em] outline-none",
          error ? "border-destructive" : "border-border focus:border-primary",
        )}
      />
      {error && <p className="text-[13px] text-destructive">Falsche PIN oder zu viele Versuche.</p>}
      <button
        type="submit"
        disabled={busy || value.length < 6}
        className="h-10 rounded-full bg-primary px-6 text-[14px] font-semibold text-primary-foreground disabled:opacity-40"
      >
        Entsperren
      </button>
    </form>
  );
}
