import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Ban, UserX } from "lucide-react";
import { createPortal } from "react-dom";
import { useMyGroups } from "@/hooks/useMyGroups";
import { useAppStore } from "@/store/app-store";

/**
 * Einmaliger Hinweis über den ganzen Bildschirm, wenn man aus einer Runde
 * entfernt oder (vom Betreiber) gesperrt wurde, die Runde gelöscht oder die
 * Anfrage abgelehnt wurde.
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
  // Direkt an <body>: Eltern mit Animation/transform würden „fixed“ sonst
  // auf ihren Bereich beschränken.
  return createPortal(
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="group-notice-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-background px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center"
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
        {banned ? (
          <>
            {notice.by === "owner" ? "Der Ersteller hat dich aus " : "Du wurdest aus "}
            <strong className="text-foreground">„{notice.name}“</strong> gesperrt. Du kannst nicht
            wieder beitreten, auch nicht mit dem Code
            {notice.by === "owner" ? " – erst, wenn er dich wieder entsperrt" : ""}. Deine Tipps
            dort zählen nicht mehr.
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
      <button
        type="button"
        autoFocus
        onClick={() => {
          clear(null);
          navigate({ to: "/tipps", replace: true });
        }}
        className="mt-8 inline-flex h-12 w-full max-w-xs items-center justify-center rounded-full bg-primary text-[16px] font-semibold text-primary-foreground"
      >
        Verstanden
      </button>
    </motion.div>,
    document.body,
  );
}
