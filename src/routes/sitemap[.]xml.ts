import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { SITE_URL } from "@/tournament/config";

const PATHS = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/spielplan", priority: "0.9", changefreq: "daily" },
  { path: "/turnier", priority: "0.8", changefreq: "daily" },
  { path: "/tipps", priority: "0.5", changefreq: "weekly" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const base = SITE_URL || new URL(request.url).origin;
        const urls = PATHS.map(
          (p) =>
            `  <url><loc>${base}${p.path}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`,
        ).join("\n");
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
          {
            headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
          },
        );
      },
    },
  },
});
