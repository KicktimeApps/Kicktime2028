export type ThemeMode = "system" | "dark" | "light";
export type AccentId = "floodlight" | "gold" | "red" | "blue" | "orange";

/**
 * „Fan-Style“: Primärfarbe der App. Jeweils eine Variante für Dark und Light,
 * damit Kontraste in beiden Modi stimmen.
 */
export const ACCENTS: {
  id: AccentId;
  label: string;
  swatch: string;
  dark: { primary: string; fg: string };
  light: { primary: string; fg: string };
}[] = [
  {
    id: "floodlight",
    label: "Flutlicht",
    swatch: "oklch(0.82 0.17 155)",
    dark: { primary: "oklch(0.82 0.17 155)", fg: "oklch(0.18 0.04 200)" },
    light: { primary: "oklch(0.47 0.14 155)", fg: "oklch(0.99 0.005 155)" },
  },
  {
    id: "gold",
    label: "Schwarz-Rot-Gold",
    swatch: "oklch(0.84 0.15 85)",
    dark: { primary: "oklch(0.85 0.15 85)", fg: "oklch(0.22 0.04 70)" },
    light: { primary: "oklch(0.55 0.13 70)", fg: "oklch(0.99 0.01 85)" },
  },
  {
    id: "red",
    label: "Rot-Weiß",
    swatch: "oklch(0.66 0.21 22)",
    dark: { primary: "oklch(0.7 0.19 22)", fg: "oklch(0.18 0.04 25)" },
    light: { primary: "oklch(0.56 0.2 25)", fg: "oklch(0.99 0 0)" },
  },
  {
    id: "blue",
    label: "Azzurro",
    swatch: "oklch(0.68 0.16 250)",
    dark: { primary: "oklch(0.74 0.14 245)", fg: "oklch(0.18 0.05 260)" },
    light: { primary: "oklch(0.52 0.17 255)", fg: "oklch(0.99 0 0)" },
  },
  {
    id: "orange",
    label: "Oranje",
    swatch: "oklch(0.75 0.17 55)",
    dark: { primary: "oklch(0.78 0.16 55)", fg: "oklch(0.2 0.04 50)" },
    light: { primary: "oklch(0.56 0.17 50)", fg: "oklch(0.99 0 0)" },
  },
];

function resolveMode(mode: ThemeMode): "dark" | "light" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(mode: ThemeMode, accent: AccentId) {
  if (typeof document === "undefined") return;
  const resolved = resolveMode(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  const a = ACCENTS.find((x) => x.id === accent) ?? ACCENTS[0];
  const v = resolved === "dark" ? a.dark : a.light;
  root.style.setProperty("--primary", v.primary);
  root.style.setProperty("--primary-foreground", v.fg);
  root.style.setProperty("--ring", v.primary);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", resolved === "dark" ? "#0b1122" : "#f5f6fa");
}
