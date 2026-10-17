import { useMemo } from "react";
import type { Prefs } from "@/domain/recommend";
import { useAppStore, useTimeZone } from "@/store/app-store";

export function usePrefs(): Prefs {
  const favorites = useAppStore((s) => s.favorites);
  const interesting = useAppStore((s) => s.interesting);
  const pinned = useAppStore((s) => s.pinned);
  const availability = useAppStore((s) => s.availability);
  const timeZone = useTimeZone();
  return useMemo(
    () => ({ favorites, interesting, pinned, availability, timeZone }),
    [favorites, interesting, pinned, availability, timeZone],
  );
}
