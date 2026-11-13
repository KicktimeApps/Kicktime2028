import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TipError } from "@/services/tipgroups";

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-border bg-card p-4 text-[15px] text-muted-foreground">
      {children}
    </p>
  );
}

/** Bestätigung mit verständlicher Fehlermeldung. */
export function Confirm({
  title,
  text,
  action,
  onConfirm,
  children,
}: {
  title: string;
  text: string;
  action: string;
  onConfirm: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() =>
              onConfirm().catch((err) =>
                toast.error(err instanceof TipError ? err.message : "Das hat nicht geklappt."),
              )
            }
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
