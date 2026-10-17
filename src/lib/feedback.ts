import { getSupabase } from "@/services/supabase";
import { getDeviceId } from "./device-id";
import { APP_VERSION } from "./version";

export type FeedbackRating = -1 | 0 | 1;

/** Anonymes Kurz-Feedback. Gibt false zurück, wenn kein Backend vorhanden ist. */
export async function submitFeedback(rating: FeedbackRating, message?: string): Promise<boolean> {
  const sb = await getSupabase();
  if (!sb) return false;
  const { error } = await sb.from("app_feedback").insert({
    device_id: getDeviceId(),
    rating,
    message: message?.trim().slice(0, 1000) || null,
    app_version: APP_VERSION,
  });
  return !error;
}
