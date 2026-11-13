import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      {children}
    </section>
  );
}
