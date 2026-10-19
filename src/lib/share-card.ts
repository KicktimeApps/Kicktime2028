import { teamDisplay } from "@/domain/labels";
import { formatDate, formatTime } from "@/domain/time";
import type { MatchView } from "@/domain/types";
import { STAGE_LABEL, TOURNAMENT } from "@/tournament/config";

/**
 * Teilbares Bild (1080×1350) für ein Spiel – reine Canvas-API, Flaggen als
 * SVG aus /public/flags. Respektiert den Spoilerschutz (kein Ergebnis).
 */
const W = 1080;
const H = 1350;
const FONT = "'Barlow Condensed', 'Inter Variable', system-ui, sans-serif";
const SANS = "'Inter Variable', system-ui, sans-serif";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

async function renderShareCard(m: MatchView, timeZone: string, hideScore: boolean): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  await document.fonts?.ready;

  const primary =
    getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#3ee58c";

  // Hintergrund
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#111c3d");
  bg.addColorStop(1, "#060a17");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 900);
  glow.addColorStop(0, "rgba(62,229,140,0.18)");
  glow.addColorStop(1, "rgba(62,229,140,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Kopf
  const logo = await loadImage("/logo.svg");
  if (logo) ctx.drawImage(logo, 80, 80, 72, 72);
  ctx.fillStyle = "#f5f7fb";
  ctx.font = `700 52px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText("KICKTIME", 170, 118);
  ctx.textAlign = "right";
  ctx.fillStyle = primary;
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(TOURNAMENT.name, W - 80, 118);

  // Runde
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(245,247,251,0.6)";
  ctx.font = `600 40px ${FONT}`;
  const stage = m.stage === "group" ? `GRUPPE ${m.group}` : STAGE_LABEL[m.stage].toUpperCase();
  ctx.fillText(stage, W / 2, 300);

  // Teams
  const a = teamDisplay(m.home, m.slotHome);
  const b = teamDisplay(m.away, m.slotAway);
  const flagW = 280;
  const flagH = 210;
  for (const [t, cx] of [
    [a, W * 0.27],
    [b, W * 0.73],
  ] as const) {
    const img = t.flag ? await loadImage(`/flags/${t.flag}.svg`) : null;
    ctx.save();
    roundRect(ctx, cx - flagW / 2, 380, flagW, flagH, 22);
    ctx.clip();
    if (img) ctx.drawImage(img, cx - flagW / 2, 380, flagW, flagH);
    else {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(cx - flagW / 2, 380, flagW, flagH);
    }
    ctx.restore();
    ctx.fillStyle = "#f5f7fb";
    ctx.font = `700 ${t.name.length > 12 ? 52 : 64}px ${FONT}`;
    ctx.fillText(t.name.toUpperCase(), cx, 680, 420);
  }

  // Mitte: Ergebnis oder Anstoß
  const showScore = m.status !== "scheduled" && m.score && !hideScore;
  ctx.fillStyle = "#f5f7fb";
  if (showScore && m.score) {
    ctx.font = `700 260px ${FONT}`;
    ctx.fillText(`${m.score.home}:${m.score.away}`, W / 2, 900);
    ctx.font = `500 34px ${SANS}`;
    ctx.fillStyle = "rgba(245,247,251,0.6)";
    ctx.fillText(
      m.status === "live"
        ? "ZWISCHENSTAND"
        : m.penalties
          ? `${m.penalties.home}:${m.penalties.away} I. E.`
          : "ENDSTAND",
      W / 2,
      1040,
    );
  } else {
    ctx.font = `700 220px ${FONT}`;
    ctx.fillText(formatTime(m.kickoffUtc, timeZone), W / 2, 890);
    ctx.font = `500 36px ${SANS}`;
    ctx.fillStyle = "rgba(245,247,251,0.7)";
    ctx.fillText(formatDate(m.kickoffUtc, timeZone), W / 2, 1020);
  }

  // Fuß
  ctx.fillStyle = "rgba(245,247,251,0.75)";
  ctx.font = `600 34px ${SANS}`;
  ctx.fillText(`${m.venue.name} · ${m.venue.city}`, W / 2, H - 170);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, H - 120);
  ctx.lineTo(W - 80, H - 120);
  ctx.stroke();
  ctx.fillStyle = "rgba(245,247,251,0.45)";
  ctx.font = `500 28px ${SANS}`;
  ctx.fillText("Geplant mit KickTime – dein EM-Planer", W / 2, H - 72);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/png"),
  );
}

export async function shareMatch(
  m: MatchView,
  timeZone: string,
  hideScore: boolean,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await renderShareCard(m, timeZone, hideScore);
  const file = new File([blob], `kicktime-spiel-${m.number}.png`, { type: "image/png" });
  const a = teamDisplay(m.home, m.slotHome).name;
  const b = teamDisplay(m.away, m.slotAway).name;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({
        files: [file],
        title: `${a} – ${b}`,
        text: `${a} – ${b} · ${TOURNAMENT.name}`,
      });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
