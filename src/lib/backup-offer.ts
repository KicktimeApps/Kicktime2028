import { create } from "zustand";
import { useAppStore } from "@/store/app-store";

/** Ob das Fenster „Code sichern“ (`BackupCodeOffer`) gerade offen ist. */
export const useBackupOffer = create<{ open: boolean }>(() => ({ open: false }));

/**
 * Nach dem Erstellen/Beitreten einer Tipprunde: Code gleich sichern anbieten –
 * ab jetzt hängt etwas am Gerät, das bei Neuinstallation sonst weg wäre.
 * Nur, solange der Code noch nie angesehen wurde (`codeBackupSeen`).
 */
export function offerBackupCode() {
  if (useAppStore.getState().codeBackupSeen) return;
  // Kurz warten, bis die Runde zu sehen ist (und das Eingabefenster zu).
  window.setTimeout(() => useBackupOffer.setState({ open: true }), 700);
}
