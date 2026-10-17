import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Eigene Konfiguration für Unit-Tests: die App-Konfiguration (vite.config.ts)
// bringt SSR-/Cloudflare-Plugins mit, die für reine Logik-Tests nicht nötig sind.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
