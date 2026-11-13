import { KeyRound, ShieldAlert } from "lucide-react";
import {
  FormSheet,
  FormSheetContent,
  FormSheetDescription,
  FormSheetTitle,
} from "@/components/common/FormSheet";
import { formatRecoveryCode, getDeviceId } from "@/lib/device-id";
import { useBackupOffer } from "@/lib/backup-offer";
import { useAppStore } from "@/store/app-store";
import { RecoveryCodeActions, RecoveryCodeBox } from "./RecoveryCode";

/**
 * Fenster „Code sichern“ nach dem ersten Erstellen/Beitreten einer Tipprunde
 * (geöffnet über `offerBackupCode` in `lib/backup-offer.ts`).
 */
export function BackupCodeOffer() {
  const open = useBackupOffer((s) => s.open);
  const setSeen = useAppStore((s) => s.setCodeBackupSeen);
  if (!open) return null;
  const code = formatRecoveryCode(getDeviceId());
  const close = () => useBackupOffer.setState({ open: false });
  return (
    <FormSheet open onOpenChange={(v) => !v && close()}>
      <FormSheetContent>
        <div className="flex items-center gap-2 pr-10">
          <KeyRound className="h-5 w-5 shrink-0 text-gold" />
          <FormSheetTitle className="font-display text-2xl font-bold uppercase">
            Code sichern
          </FormSheetTitle>
        </div>
        <FormSheetDescription className="mt-2 text-[14px] text-muted-foreground">
          Ohne Konto hängt deine Tipprunde an diesem Handy. Installierst du KickTime neu oder
          bekommst ein neues Handy, holst du sie nur mit diesem Code zurück. Am besten jetzt in
          Notizen oder deiner Passwort-App ablegen.
        </FormSheetDescription>
        <div className="mt-4">
          <RecoveryCodeBox code={code} />
        </div>
        <div className="mt-3">
          <RecoveryCodeActions
            code={code}
            onSaved={() => {
              setSeen();
              close();
            }}
          />
        </div>
        <button
          type="button"
          onClick={close}
          className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold text-muted-foreground"
        >
          Später
        </button>
        <p className="mt-2 flex gap-2 text-[13px] text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <span>Geheim halten: Wer den Code hat, kann in deinem Namen tippen.</span>
        </p>
      </FormSheetContent>
    </FormSheet>
  );
}
