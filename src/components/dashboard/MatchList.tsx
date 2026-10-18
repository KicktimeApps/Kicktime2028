import { Check, Moon } from "lucide-react";
import type { Fit } from "@/domain/time";
import { cn } from "@/lib/utils";

/** Klartext zur Zeitfenster-Einstufung – ohne Fachbegriffe. */
export function FitNote({ fit, className }: { fit: Fit; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        fit === "full" ? "text-primary" : "text-muted-foreground",
        className,
      )}
    >
      {fit === "none" ? <Moon className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
      {fit === "full"
        ? "Passt in deine Zeit"
        : fit === "partial"
          ? "Teilweise in deiner Zeit"
          : "Außerhalb deiner Zeit"}
    </span>
  );
}

/** Gemeinsame Karte für mehrere {@link MatchRow}s. */
export function MatchList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
