import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  text,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-border bg-subtle/50 px-6 py-8 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/12 text-primary [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      )}
      <div className="text-[15px] font-semibold">{title}</div>
      {text && (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{text}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
