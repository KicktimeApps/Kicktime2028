import { useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BAN_STATUS_KEY, useBanStatus } from "@/hooks/useBanStatus";
import { appealState, type AppealKey } from "@/lib/appeals";
import { cn } from "@/lib/utils";
import { requestUnban, TipError } from "@/services/tipgroups";

const fmtDate = (t: number | string) =>
  new Date(t).toLocaleDateString("de-DE", { day: "numeric", month: "long" });

/**
 * Entsperrung beantragen – mit Stand des letzten Antrags. Das Formular klappt
 * direkt hier auf (kein extra Fenster), damit es auch im Vollbild-Hinweis geht.
 */
export function AppealBlock({
  appealKey,
  code,
  decider,
  className,
}: {
  appealKey: AppealKey;
  /** Statt der Runden-ID: Code (beim Beitreten). */
  code?: string;
  /** Wer entscheidet – für die Texte (unbekannt z. B. beim Beitreten per Code). */
  decider?: "team" | "owner";
  className?: string;
}) {
  const qc = useQueryClient();
  const { data } = useBanStatus();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const state = appealState(data, appealKey);
  const who =
    decider === "team"
      ? "das KickTime-Team"
      : decider === "owner"
        ? "der Ersteller der Runde"
        : null;

  const submit = async () => {
    setBusy(true);
    try {
      await requestUnban({
        groupId: appealKey.scope === "group" && !code ? appealKey.groupId : undefined,
        code,
        memberId: appealKey.memberId,
        message: text.trim(),
      });
      setOpen(false);
      setText("");
      toast.success(
        "Antrag gesendet",
        who ? { description: `Jetzt entscheidet ${who}.` } : undefined,
      );
      await qc.invalidateQueries({ queryKey: BAN_STATUS_KEY });
    } catch (err) {
      toast.error(err instanceof TipError ? err.message : "Das hat nicht geklappt.");
      await qc.invalidateQueries({ queryKey: BAN_STATUS_KEY });
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === "open")
    return (
      <Status className={className}>
        Antrag vom {fmtDate(state.since)} – {who ? `${who} prüft ihn.` : "wird geprüft."}
      </Status>
    );
  if (state.kind === "accepted") return <Status className={className}>Antrag angenommen.</Status>;
  if (state.kind === "limit")
    return (
      <Status className={className}>
        Für diese Sperre sind keine weiteren Anträge möglich.
        {state.reply && <Reply text={state.reply} />}
      </Status>
    );
  if (state.kind === "rejected" && state.next)
    return (
      <Status className={className}>
        Antrag abgelehnt. Ein neuer Antrag geht ab dem {fmtDate(state.next)}.
        {state.reply && <Reply text={state.reply} />}
      </Status>
    );

  return (
    <div className={cn("w-full text-left", className)}>
      {state.kind === "rejected" && (
        <p className="mb-2 text-[13px] text-muted-foreground">
          Letzter Antrag abgelehnt. Noch {state.left} {state.left === 1 ? "Versuch" : "Versuche"}.
          {state.reply && <Reply text={state.reply} />}
        </p>
      )}
      {open ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 300))}
            rows={3}
            placeholder={
              appealKey.memberId
                ? "Warum soll die Person wieder mitmachen dürfen?"
                : "Warum solltest du wieder mitmachen dürfen?"
            }
            className="w-full resize-none rounded-xl border border-border bg-subtle px-3 py-2 text-[15px] outline-none focus:border-primary"
          />
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[12px] text-muted-foreground tabular">
              {text.length}/300
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 rounded-full px-3 text-[14px] font-medium text-muted-foreground"
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Senden
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 w-full items-center justify-center rounded-full border border-border text-[15px] font-semibold"
        >
          Entsperrung beantragen
        </button>
      )}
    </div>
  );
}

function Status({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex w-full items-start gap-2 rounded-xl bg-subtle px-3 py-2.5 text-left text-[13.5px] text-muted-foreground",
        className,
      )}
    >
      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Reply({ text }: { text: string }) {
  return <span className="block w-full pt-1 italic">„{text}“</span>;
}
