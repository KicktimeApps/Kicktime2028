import { toast } from "sonner";
import { useAppStore } from "@/store/app-store";
import { detectPushSupport, requestPushPermission } from "./notifications";
import { hasPushBackend, subscribePush } from "./push";

/**
 * Aktiviert Erinnerungen inkl. Berechtigungsabfrage. Erklärt verständlich,
 * was auf welchem Gerät nötig ist. Gibt true zurück, wenn aktiv.
 */
export async function enableReminders(): Promise<boolean> {
  const support = detectPushSupport();
  if (support === "unsupported") {
    toast.error("Dein Browser unterstützt keine Benachrichtigungen.", {
      description: "Tipp: Nutze den Kalender-Export – der erinnert dich zuverlässig.",
    });
    return false;
  }
  if (support === "ios-needs-pwa") {
    toast("Auf dem iPhone erst zum Home-Bildschirm hinzufügen", {
      description: "Safari → Teilen → „Zum Home-Bildschirm“. Danach KickTime von dort öffnen.",
      duration: 8000,
    });
    return false;
  }
  const result = await requestPushPermission();
  if (result !== "granted") {
    toast.error("Benachrichtigungen sind blockiert", {
      description: "Erlaube sie in den Browser- bzw. Systemeinstellungen für diese Seite.",
      duration: 7000,
    });
    return false;
  }
  useAppStore.getState().setPushEnabled(true);
  if (hasPushBackend()) {
    const ok = await subscribePush();
    if (!ok) {
      toast("Erinnerungen laufen, solange die App geöffnet ist", {
        description: "Der Push-Dienst ist gerade nicht erreichbar.",
      });
      return true;
    }
  }
  toast.success("Erinnerungen aktiviert", {
    description: "Wir melden uns 15 Minuten vor Anpfiff.",
  });
  return true;
}

/**
 * Nur anbieten, wenn der Browser Mitteilungen kann und sie noch nicht aktiv
 * sind. Auf dem iPhone geht das nur in der installierten App – im Browser
 * (Installieren übersprungen) entfällt der Schritt, die Einstellungen erklären es.
 */
export function shouldOfferPush(): boolean {
  if (typeof window === "undefined") return false;
  const support = detectPushSupport();
  if (support === "unsupported" || support === "ios-needs-pwa" || support === "denied")
    return false;
  return !useAppStore.getState().pushEnabled;
}
