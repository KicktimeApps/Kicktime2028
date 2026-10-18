import { motion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = { value: T; label: string; count?: number };

/** Segment-Umschalter mit gleitendem Indikator. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      className={cn("flex rounded-xl border border-border bg-subtle p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 font-medium transition-colors",
              size === "sm"
                ? "h-8 text-[12px]"
                : size === "lg"
                  ? "h-11 text-[15px] font-semibold"
                  : "h-9 text-[13px]",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-lg bg-elevated shadow-sm ring-1 ring-border"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10 truncate">{o.label}</span>
            {o.count !== undefined && o.count > 0 && (
              <span
                className={cn(
                  "relative z-10 rounded-full px-1.5 font-semibold tabular",
                  size === "lg" ? "text-[12px]" : "text-[10px]",
                  active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
