import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/14 text-primary",
  gold: "bg-gold/15 text-gold",
  live: "bg-live/15 text-live",
  outline: "border border-border text-muted-foreground",
} as const;

export function Chip({
  children,
  tone = "neutral",
  className,
  icon,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold leading-none [&_svg]:h-3 [&_svg]:w-3",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors [&_svg]:h-4 [&_svg]:w-4",
        active
          ? "border-primary/50 bg-primary/12 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
