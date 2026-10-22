import { cn } from "@/lib/utils";

/**
 * Grauer Platzhalter in der Form des kommenden Inhalts – statt „Lade …“.
 * So springt nichts, wenn die Daten da sind. Pulsiert nur, wenn das Gerät
 * Bewegung erlaubt.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-xl bg-muted motion-safe:animate-pulse", className)} />
  );
}

/** Platzhalter für eine Runden-Karte (wie RoundCard). */
export function RoundCardSkeleton() {
  return (
    <div className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}

/** Platzhalter für die Runden-Seite: Kopf, Reiter, Spieltag und Spiele. */
export function RoundPageSkeleton({ withHeader = true }: { withHeader?: boolean }) {
  return (
    <div role="status" aria-label="Wird geladen">
      {withHeader && (
        <div className="mb-6 space-y-2.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-3.5 w-56" />
        </div>
      )}
      <Skeleton className="mb-4 h-12 w-full rounded-2xl" />
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col items-center gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
      </div>
      <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3.5 py-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-11 w-12" />
            <Skeleton className="h-11 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
