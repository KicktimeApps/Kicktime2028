import { getSupabase } from "@/services/supabase";
import { getDeviceId } from "./device-id";
import { APP_VERSION } from "./version";

export type FeedbackRating = -1 | 0 | 1;

export type FeedbackResult = "ok" | "limit" | "error";

/**
 * Anonymes Kurz-Feedback. Läuft über kt_submit_feedback (höchstens 3 pro
 * Gerät und Tag); fehlt die Funktion noch (SQL-Update nicht ausgeführt),
 * wird direkt eingetragen.
 */
export async function submitFeedback(
  rating: FeedbackRating,
  message?: string,
): Promise<FeedbackResult> {
  const sb = await getSupabase();
  if (!sb) return "error";
  const text = message?.trim().slice(0, 1000) || null;
  const { error } = await sb.rpc("kt_submit_feedback", {
    p_device: getDeviceId(),
    p_rating: rating,
    p_message: text,
    p_version: APP_VERSION,
  });
  if (!error) return "ok";
  if (error.message.includes("feedback limit")) return "limit";
  // Funktion noch nicht vorhanden → alter Weg
  if (error.code === "PGRST202" || error.message.includes("kt_submit_feedback")) {
    const res = await sb.from("app_feedback").insert({
      device_id: getDeviceId(),
      rating,
      message: text,
      app_version: APP_VERSION,
    });
    return res.error ? "error" : "ok";
  }
  return "error";
}
