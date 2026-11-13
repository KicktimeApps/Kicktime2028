import { useState } from "react";
import { toast } from "sonner";
import { submitFeedback, type FeedbackCategory, type FeedbackRating } from "@/lib/feedback";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { isBackendConfigured } from "@/services/supabase";
import { Panel } from "./SettingsPanel";

const FEEDBACK_KINDS: {
  value: FeedbackCategory;
  emoji: string;
  label: string;
  placeholder: string;
}[] = [
  {
    value: "idee",
    emoji: "💡",
    label: "Idee",
    placeholder: "Was würdest du dir wünschen?",
  },
  {
    value: "fehler",
    emoji: "🐞",
    label: "Fehler",
    placeholder: "Was ist passiert – und wo in der App? (z. B. „Tipps → Spieltag 2: …“)",
  },
  { value: "lob", emoji: "💚", label: "Lob", placeholder: "Was gefällt dir besonders?" },
  {
    value: "sonstiges",
    emoji: "💬",
    label: "Sonstiges",
    placeholder: "Was möchtest du uns sagen?",
  },
];

const FEEDBACK_RATINGS: { value: FeedbackRating; emoji: string; label: string }[] = [
  { value: -1, emoji: "👎", label: "Nicht so" },
  { value: 0, emoji: "😐", label: "Geht so" },
  { value: 1, emoji: "👍", label: "Super" },
];

export function FeedbackContent() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<FeedbackCategory | null>(null);
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [text, setText] = useState("");
  if (!isBackendConfigured()) return null;

  const current = FEEDBACK_KINDS.find((k) => k.value === kind);
  const ready = !!kind && (text.trim().length >= 3 || rating !== null);

  const send = async () => {
    if (!kind || !ready || busy) return;
    haptics.tap();
    setBusy(true);
    const res = await submitFeedback({ category: kind, rating, message: text });
    setBusy(false);
    if (res === "ok") {
      setSent(true);
      setKind(null);
      setRating(null);
      setText("");
    } else if (res === "limit") {
      toast("Für heute ist genug Feedback angekommen", {
        description: "Danke! Morgen kannst du wieder etwas schicken.",
      });
    } else toast.error("Konnte nicht gesendet werden – bitte später noch mal.");
  };

  if (sent)
    return (
      <Panel className="py-8 text-center">
        <div className="text-4xl">💚</div>
        <p className="mt-2 text-[16px] font-semibold">Danke für dein Feedback!</p>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Es ist direkt beim KickTime-Team angekommen.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-4 text-[14px] font-semibold text-primary underline-offset-2 hover:underline"
        >
          Noch etwas schicken
        </button>
      </Panel>
    );

  const chip = (active: boolean) =>
    cn(
      "flex items-center justify-center gap-2 rounded-xl border px-3 text-[14px] font-medium transition-colors",
      active
        ? "border-primary bg-primary/10 text-foreground"
        : "border-border text-muted-foreground hover:border-primary/50",
    );

  return (
    <Panel className="space-y-4">
      <div>
        <div className="mb-2 text-[13px] font-semibold">Worum geht’s?</div>
        <div className="grid grid-cols-2 gap-2">
          {FEEDBACK_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => {
                haptics.tap();
                setKind(k.value);
              }}
              className={cn(chip(kind === k.value), "h-12")}
            >
              <span className="text-lg">{k.emoji}</span>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder={current?.placeholder ?? "Erzähl uns, was du denkst …"}
          aria-label="Deine Nachricht"
          className="w-full resize-none rounded-xl border border-border bg-subtle px-3 py-2 text-[15px] outline-none focus:border-primary"
        />
        <div className="mt-1 text-right text-[11.5px] text-muted-foreground tabular">
          {text.length}/1000
        </div>
      </div>

      <div>
        <div className="mb-2 text-[13px] font-semibold">
          Wie gefällt dir KickTime?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {FEEDBACK_RATINGS.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={rating === r.value}
              onClick={() => {
                haptics.tap();
                setRating(rating === r.value ? null : r.value);
              }}
              className={cn(chip(rating === r.value), "h-14 flex-col gap-0 text-[12.5px]")}
            >
              <span className="text-xl leading-tight">{r.emoji}</span>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={send}
        disabled={!ready || busy}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-[16px] font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
      >
        {busy ? "Wird gesendet …" : "Absenden"}
      </button>
      <p className="text-center text-[12px] text-muted-foreground">
        {kind ? "Anonym – ohne Namen oder Konto." : "Wähle oben, worum es geht."}
      </p>
    </Panel>
  );
}
