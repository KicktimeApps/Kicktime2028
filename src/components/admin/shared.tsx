import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
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
import { cn } from "@/lib/utils";

/** Kleine Kennzahl-Kachel. */
export function Info({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-subtle px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate font-semibold tabular" title={value}>
        {value}
      </div>
      {hint && <div className="truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Abschnitt mit Überschrift und optionaler Erklärung. */
export function Card({
  title,
  text,
  action,
  children,
}: {
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-semibold">{title}</h3>
          {text && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{text}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const BUTTON = {
  primary: "bg-primary text-primary-foreground",
  outline: "border border-border",
  danger: "bg-destructive text-destructive-foreground",
  "danger-outline": "border border-destructive/40 text-destructive",
};

/** Weitere Props (z. B. von einem Dialog-Auslöser) landen direkt am Knopf. */
export function ActionButton({
  children,
  icon,
  variant = "outline",
  busy,
  disabled,
  className,
  ...rest
}: {
  children: ReactNode;
  icon?: ReactNode;
  variant?: keyof typeof BUTTON;
  busy?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type="button"
      {...rest}
      disabled={busy || disabled}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-[14px] font-semibold disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4",
        BUTTON[variant],
        className,
      )}
    >
      {busy ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/** Knopf mit Sicherheitsabfrage für alles, was sich nicht rückgängig machen lässt. */
export function ConfirmButton({
  children,
  icon,
  title,
  text,
  confirm,
  onConfirm,
  busy,
  disabled,
  variant = "danger",
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  title: string;
  text: ReactNode;
  confirm: string;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: keyof typeof BUTTON;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <ActionButton
          icon={icon}
          variant={variant}
          busy={busy}
          disabled={disabled}
          className={className}
        >
          {children}
        </ActionButton>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
