import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBanStatus } from "@/hooks/useBanStatus";
import { TIP_GROUPS_KEY } from "@/hooks/useMyGroups";
import type { Appeal } from "@/services/tipgroups";
import { useAppStore } from "@/store/app-store";
import { GroupFormDrawer } from "./TipGroups";

const SEEN_KEY = "kicktime-2028.seen-unbans";
const MAX_AGE = 14 * 86_400_000;

function readSeen(): number[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/**
 * Einmaliger Hinweis, wenn ein eigener Entsperrungsantrag angenommen wurde.
 * Ersteller-Sperre: mit Code und „Wieder beitreten“ (die Runde muss einen
 * dann noch annehmen). Team-Sperre: man ist samt Tipps schon wieder drin.
 */
export function UnbanNotice() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useBanStatus();
  const blocked = useAppStore((s) => !!s.groupNotice);
  const [seen, setSeen] = useState<number[]>(readSeen);
  const [join, setJoin] = useState<string | null>(null);

  const accepted: Appeal | undefined = (data?.requests ?? []).find(
    (r) =>
      r.status === "accepted" &&
      !r.forMember &&
      !seen.includes(r.id) &&
      Date.now() - Date.parse(r.decidedAt ?? r.createdAt) < MAX_AGE,
  );

  // Vom Team entsperrt → man ist wieder in seinen Runden: Liste neu laden.
  useEffect(() => {
    if (accepted && accepted.handler === "team")
      void qc.invalidateQueries({ queryKey: TIP_GROUPS_KEY });
  }, [accepted, qc]);

  const close = () => {
    if (!accepted) return;
    const next = [...seen, accepted.id].slice(-100);
    setSeen(next);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {
      /* egal */
    }
  };

  const byOwner = accepted?.handler === "owner";
  const global = accepted?.scope === "global";
  const name = accepted?.groupName ?? "der Runde";

  return (
    <>
      <Dialog open={!!accepted && !blocked} onOpenChange={(v) => !v && close()}>
        <DialogContent className="max-w-sm rounded-2xl border-border bg-background text-center">
          <span className="mx-auto mt-2 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
            <PartyPopper className="h-8 w-8" />
          </span>
          <DialogHeader className="space-y-2 text-center sm:text-center">
            <DialogTitle className="font-display text-[26px] font-bold uppercase">
              Entsperrt!
            </DialogTitle>
            <DialogDescription className="text-[15px]">
              {byOwner ? (
                <>
                  Der Ersteller von <strong className="text-foreground">„{name}“</strong> hat deine
                  Sperre aufgehoben. Mit dem Code kannst du wieder beitreten – er nimmt dich dann
                  noch an.
                </>
              ) : global ? (
                <>
                  Das <strong className="text-foreground">KickTime-Team</strong> hat deine Sperre
                  aufgehoben. Du bist wieder in deinen Runden – mit deinen Tipps – und kannst Runden
                  erstellen und beitreten.
                </>
              ) : (
                <>
                  Das <strong className="text-foreground">KickTime-Team</strong> hat deine Sperre in{" "}
                  <strong className="text-foreground">„{name}“</strong> aufgehoben. Du bist wieder
                  dabei – mit deinen Tipps.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {byOwner && accepted?.groupCode && (
            <div className="rounded-xl bg-subtle py-3">
              <div className="text-[12px] uppercase tracking-wider text-muted-foreground">Code</div>
              <div className="font-mono text-2xl font-bold tracking-[0.25em]">
                {accepted.groupCode}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                const code = accepted?.groupCode ?? null;
                close();
                if (byOwner && code) setJoin(code);
                else if (!global && code) navigate({ to: "/runde/$code", params: { code } });
                else navigate({ to: "/tipps" });
              }}
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-[16px] font-semibold text-primary-foreground"
            >
              {byOwner ? "Wieder beitreten" : global ? "Zu den Tipps" : "Zur Runde"}
            </button>
            {byOwner && (
              <button
                type="button"
                onClick={close}
                className="inline-flex h-11 w-full items-center justify-center rounded-full text-[15px] font-medium text-muted-foreground"
              >
                Später
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {join && (
        <GroupFormDrawer
          mode="join"
          open
          initialCode={join}
          onOpenChange={(v) => !v && setJoin(null)}
        />
      )}
    </>
  );
}
