import { cn } from "@/lib/utils";
import { TOURNAMENT } from "@/tournament/config";

export function LogoMark({ className }: { className?: string }) {
  return <img src="/logo.svg" alt="" aria-hidden className={cn("h-8 w-8", className)} />;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-baseline gap-1.5 font-display text-[22px] font-bold uppercase leading-none tracking-tight",
        className,
      )}
    >
      Kick<span className="-ml-1.5 text-primary">Time</span>
      <span className="text-[13px] font-semibold tracking-[0.12em] text-muted-foreground">
        {TOURNAMENT.year}
      </span>
    </span>
  );
}
