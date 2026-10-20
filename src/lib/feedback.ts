import { getSupabase } from "@/services/supabase";
import { getDeviceId } from "./device-id";
import { APP_VERSION } from "./version";

export type FeedbackRating = -1 | 0 | 1;

export type FeedbackCategory = "idee" | "fehler" | "lob" | "sonstiges";

export type FeedbackResult = "ok" | "limit" | "error";

/**
 * Anonymes Feedback. Läuft über kt_send_feedback (höchstens 3 pro Gerät
 * und Tag). Fehlt die Funktion noch (SQL-Update nicht ausgeführt), geht es
 * über das alte kt_submit_feedback – die Kategorie steht dann vorne im Text.
 */
export async function submitFeedback(input: {
  category: FeedbackCategory;
  rating: FeedbackRating | null;
  message?: string;
}): Promise<FeedbackResult> {
  const sb = await getSupabase();
  if (!sb) return "error";
  const text = input.message?.trim().slice(0, 1000) || null;
  const base = { p_device: getDeviceId(), p_version: APP_VERSION };
  let { error } = await sb.rpc("kt_send_feedback", {
    ...base,
    p_rating: input.rating,
    p_message: text,
    p_category: input.category,
  });
  if (error?.code === "PGRST202") {
    ({ error } = await sb.rpc("kt_submit_feedback", {
      ...base,
      p_rating: input.rating ?? 0,
      p_message: `[${input.category}] ${text ?? ""}`.trim().slice(0, 1000),
    }));
  }
  if (!error) return "ok";
  if (error.message.includes("feedback limit")) return "limit";
  return "error";
}
