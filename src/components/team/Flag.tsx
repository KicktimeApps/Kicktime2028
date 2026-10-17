import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "h-3.5 w-[1.2rem] rounded-[3px]",
  sm: "h-4 w-[1.35rem] rounded-[3px]",
  md: "h-5 w-[1.7rem] rounded-[4px]",
  lg: "h-7 w-[2.35rem] rounded-[5px]",
  xl: "h-12 w-16 rounded-lg",
} as const;

/**
 * SVG-Flagge (lokal gebündelt, sieht auf allen Systemen gleich aus – auch
 * unter Windows, wo Emoji-Flaggen fehlen). Ohne Team: neutrales Wappen.
 */
export function Flag({
  flag,
  size = "md",
  className,
  muted,
}: {
  flag: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  muted?: boolean;
}) {
  if (!flag) {
    return (
      <span
        aria-hidden
        className={cn(
          SIZES[size],
          "inline-flex shrink-0 items-center justify-center border border-dashed border-muted-foreground/40 bg-muted/40 text-muted-foreground/70",
          className,
        )}
      >
        <Shield className="h-[60%] w-[60%]" strokeWidth={2} />
      </span>
    );
  }
  return (
    <img
      src={`/flags/${flag}.svg`}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      className={cn(
        SIZES[size],
        "inline-block shrink-0 object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.12)]",
        muted && "grayscale opacity-60",
        className,
      )}
    />
  );
}
