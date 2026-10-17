import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  title,
  icon,
  count,
  hint,
  action,
  children,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  count?: number;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-7", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {icon && <span className="text-primary [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
          <span className="text-foreground/90">{title}</span>
          {count !== undefined && (
            <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-semibold tabular text-muted-foreground">
              {count}
            </span>
          )}
        </h2>
        {action}
      </div>
      {hint && <p className="-mt-1 mb-3 text-[13px] text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}
