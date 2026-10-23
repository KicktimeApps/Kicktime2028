import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { APP_VERSION } from "@/lib/version";

/** Version des laufenden Servers – die App vergleicht sie mit ihrer eigenen (useUpdateCheck). */
export const Route = createFileRoute("/version.json")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ version: APP_VERSION }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }),
    },
  },
});
