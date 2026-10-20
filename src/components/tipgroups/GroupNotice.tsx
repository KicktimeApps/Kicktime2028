import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Ban, UserX } from "lucide-react";
import { createPortal } from "react-dom";
import { useMyGroups } from "@/hooks/useMyGroups";
import { useAppStore } from "@/store/app-store";
import { AppealBlock } from "./AppealBlock";

/**
 * Einmaliger Hinweis über den ganzen Bildschirm, wenn man aus einer Runde
 * entfernt oder gesperrt wurde (vom Ersteller oder vom KickTime-Team), die
 * Runde gelöscht oder die Anfrage abgelehnt wurde. Bei einer Sperre lässt
 * sich direkt die Entsperrung beantragen.
 * Hält dafür (und für neue Anfragen) die eigenen Runden aktuell.
 */
export function GroupNotice() {
  useMyGroups();
  const notice = useAppStore((s) => s.groupNotice);
  const clear = useAppStore((s) => s.setGroupNotice);
  const navigate = useNavigate();
  if (!notice || typeof document === "undefined") return null;
  const rejected = notice.reason === "rejected";
  const banned = notice.reason === "banned";
  const Icon = banned ? Ban : UserX;
  const byTeam = notice.by === "admin" || notice.by === "global";
  // Direkt an <body>: Eltern mit Animation/transform würden „fixed“ sonst
  // auf ihren Bereich beschränken.
  return createPortal(
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="group-notice-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-y-auto bg-background px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] text-center"
    >
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/12 text-destructive">
        <Icon className="h-10 w-10" />
      </span>
      <h1
        id="group-notice-title"
        className="mt-6 font-display text-[30px] font-bold uppercase leading-tight"
      >
        {banned ? "Gesperrt" : rejected ? "Anfrage abgelehnt" : "Nicht mehr dabei"}
      </h1>
      <p className="mt-3 max-w-sm text-[16px] text-muted-foreground">
        {banned && notice.by === "global" ? (
          <>
            Das <strong className="text-foreground">KickTime-Team</strong> hat dich für alle
            Tipprunden gesperrt. Du kannst keiner Runde beitreten und keine erstellen. Deine Tipps
            bleiben gespeichert, falls die Sperre aufgehoben wird.
          </>
        ) : banned && byTeam ? (
          <>
            Das <strong className="text-foreground">KickTime-Team</strong> hat dich aus{" "}
            <strong className="text-foreground">„{notice.name}“</strong> gesperrt. Du kannst nicht
            wieder beitreten. Deine Tipps bleiben gespeichert, falls die Sperre aufgehoben wird.
          </>
        ) : banned ? (
          <>
            Der Ersteller hat dich aus <strong className="text-foreground">„{notice.name}“</strong>{" "}
            gesperrt. Du kannst nicht wieder beitreten, auch nicht mit dem Code – erst, wenn er dich
            entsperrt. Deine Tipps dort zählen nicht mehr.
          </>
        ) : rejected ? (
          <>
            Der Ersteller von <strong className="text-foreground">„{notice.name}“</strong> hat deine
            Anfrage abgelehnt. Mit dem Code kannst du es später noch einmal versuchen.
          </>
        ) : (
          <>
            Du bist nicht mehr in <strong className="text-foreground">„{notice.name}“</strong>. Der
            Ersteller hat dich entfernt oder die Runde gelöscht. Deine Tipps dort zählen nicht mehr.
            Gibt es die Runde noch, kannst du mit dem Code wieder anfragen.
          </>
        )}
      </p>
      {banned && (notice.by === "global" || notice.id) && (
        <AppealBlock
          className="mt-6 max-w-xs"
          decider={byTeam ? "team" : "owner"}
          appealKey={
            notice.by === "global" || !notice.id
              ? { scope: "global" }
              : { scope: "group", groupId: notice.id }
          }
        />
      )}
      <button
        type="button"
        autoFocus
        onClick={() => {
          clear(null);
          navigate({ to: "/tipps", replace: true });
        }}
        className="mt-4 inline-flex h-12 w-full max-w-xs items-center justify-center rounded-full bg-primary text-[16px] font-semibold text-primary-foreground"
      >
        Verstanden
      </button>
    </motion.div>,
    document.body,
  );
}
