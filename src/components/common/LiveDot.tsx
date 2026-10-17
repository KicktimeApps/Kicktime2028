import { cn } from "@/lib/utils";

export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("live-dot inline-block h-2 w-2 rounded-full bg-live", className)}
    />
  );
}
