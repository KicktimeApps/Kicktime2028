// Build-Konfiguration der App (eigene, ohne Lovable – gleiche Bausteine wie vorher).
//
// Produktions-Build: TanStack Start (SSR) → Nitro mit Preset „cloudflare-module“ →
// .output/ (Worker unter .output/server, statische Dateien unter .output/public) plus
// .wrangler/deploy/config.json, damit `npx wrangler deploy` genau diese Ausgabe nimmt.
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Server-Code darf nie im Browser-Bundle landen.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // Eigener Server-Einstieg (src/server.ts): fängt SSR-Fehler ab und zeigt eine eigene Fehlerseite.
      server: { entry: "server" },
    }),
    // Nitro nur beim Bauen: erzeugt den Cloudflare-Worker samt wrangler.json.
    ...(command === "build" ? [nitro({ preset: "cloudflare-module" })] : []),
    viteReact(),
  ],
  css: { transformer: "lightningcss" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  server: {
    host: "::",
    port: 8080,
    // Erst neu laden, wenn eine Datei fertig geschrieben ist.
    watch: { awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 } },
  },
}));
