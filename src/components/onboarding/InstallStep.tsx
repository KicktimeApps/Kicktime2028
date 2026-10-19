import {
  BellRing,
  Check,
  Copy,
  Download,
  Ellipsis,
  EllipsisVertical,
  Maximize2,
  Menu,
  Share,
  Smartphone,
  SquarePlus,
  Zap,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  detectInstallBrowser,
  promptInstall,
  useInstallPrompt,
  type InstallBrowser,
} from "@/lib/install";

interface Guide {
  /** Wie der Browser den Startbildschirm nennt. */
  screen: "Home-Bildschirm" | "Startbildschirm";
  steps: { icon?: ReactNode; text: ReactNode }[];
  /** Erst im richtigen Browser öffnen – Link zum Kopieren anbieten. */
  needsOtherBrowser?: boolean;
}

const B = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-foreground">{children}</strong>
);

const OPEN_FROM_HOME = {
  icon: <Smartphone />,
  text: (
    <>
      KickTime auf dem Home-Bildschirm öffnen und <B>dort einrichten</B>.
    </>
  ),
};

function guideFor(browser: InstallBrowser): Guide {
  switch (browser) {
    case "ios-safari":
      return {
        screen: "Home-Bildschirm",
        steps: [
          {
            icon: <Share />,
            text: (
              <>
                Unten auf <B>Teilen</B> tippen. Nicht zu sehen? Erst auf <B>•••</B> tippen.
              </>
            ),
          },
          {
            icon: <SquarePlus />,
            text: (
              <>
                Nach unten scrollen und <B>„Zum Home-Bildschirm“</B> wählen.
              </>
            ),
          },
          {
            text: (
              <>
                Oben rechts auf <B>„Hinzufügen“</B> tippen.
              </>
            ),
          },
          OPEN_FROM_HOME,
        ],
      };
    case "ios-chrome":
      return {
        screen: "Home-Bildschirm",
        steps: [
          {
            icon: <Share />,
            text: (
              <>
                Oben rechts in der Adresszeile auf <B>Teilen</B> tippen.
              </>
            ),
          },
          {
            icon: <SquarePlus />,
            text: (
              <>
                <B>„Zum Home-Bildschirm“</B> wählen – evtl. unter <B>„Mehr“</B>.
              </>
            ),
          },
          {
            text: (
              <>
                Auf <B>„Hinzufügen“</B> tippen.
              </>
            ),
          },
          OPEN_FROM_HOME,
        ],
      };
    case "ios-firefox":
      return {
        screen: "Home-Bildschirm",
        steps: [
          {
            icon: <Menu />,
            text: (
              <>
                Unten rechts auf das <B>Menü</B> tippen.
              </>
            ),
          },
          {
            icon: <Share />,
            text: (
              <>
                <B>„Teilen“</B> wählen.
              </>
            ),
          },
          {
            icon: <SquarePlus />,
            text: (
              <>
                <B>„Zum Home-Bildschirm“</B> und dann <B>„Hinzufügen“</B>.
              </>
            ),
          },
          OPEN_FROM_HOME,
        ],
      };
    case "ios-edge":
      return {
        screen: "Home-Bildschirm",
        steps: [
          {
            icon: <Ellipsis />,
            text: (
              <>
                Unten auf <B>•••</B> tippen.
              </>
            ),
          },
          {
            icon: <Share />,
            text: (
              <>
                <B>„Teilen“</B> wählen.
              </>
            ),
          },
          {
            icon: <SquarePlus />,
            text: (
              <>
                <B>„Zum Home-Bildschirm“</B> und dann <B>„Hinzufügen“</B>.
              </>
            ),
          },
          OPEN_FROM_HOME,
        ],
      };
    case "ios-other":
      return {
        screen: "Home-Bildschirm",
        needsOtherBrowser: true,
        steps: [
          {
            icon: <Copy />,
            text: (
              <>
                Link kopieren und in <B>Safari</B> öffnen.
              </>
            ),
          },
          {
            icon: <Share />,
            text: (
              <>
                Dort <B>Teilen</B> → <B>„Zum Home-Bildschirm“</B>.
              </>
            ),
          },
          OPEN_FROM_HOME,
        ],
      };
    case "android-samsung":
      return {
        screen: "Startbildschirm",
        steps: [
          {
            icon: <Menu />,
            text: (
              <>
                Unten rechts auf das <B>Menü</B> tippen.
              </>
            ),
          },
          {
            icon: <SquarePlus />,
            text: (
              <>
                <B>„Seite hinzufügen zu“</B> wählen.
              </>
            ),
          },
          {
            text: (
              <>
                <B>„Startbildschirm“</B> und dann <B>„Hinzufügen“</B>.
              </>
            ),
          },
        ],
      };
    case "android-firefox":
      return {
        screen: "Startbildschirm",
        steps: [
          {
            icon: <EllipsisVertical />,
            text: (
              <>
                Auf das <B>Menü ⋮</B> tippen.
              </>
            ),
          },
          {
            icon: <SquarePlus />,
            text: (
              <>
                <B>„Zum Startbildschirm hinzufügen“</B> oder <B>„Installieren“</B> wählen.
              </>
            ),
          },
          {
            text: (
              <>
                Mit <B>„Hinzufügen“</B> bestätigen.
              </>
            ),
          },
        ],
      };
    case "android-edge":
      return {
        screen: "Startbildschirm",
        steps: [
          {
            icon: <Ellipsis />,
            text: (
              <>
                Unten auf <B>•••</B> tippen.
              </>
            ),
          },
          {
            icon: <SquarePlus />,
            text: (
              <>
                <B>„Zum Telefon hinzufügen“</B> wählen.
              </>
            ),
          },
          {
            text: (
              <>
                Mit <B>„Installieren“</B> bestätigen.
              </>
            ),
          },
        ],
      };
    case "in-app":
      return {
        screen: "Home-Bildschirm",
        needsOtherBrowser: true,
        steps: [
          {
            icon: <Ellipsis />,
            text: (
              <>
                Du bist im Browser einer anderen App. Über <B>•••</B> bzw. <B>⋮</B>{" "}
                <B>„Im Browser öffnen“</B> wählen – oder den Link kopieren.
              </>
            ),
          },
          {
            icon: <SquarePlus />,
            text: (
              <>
                In <B>Safari</B> (iPhone) oder <B>Chrome</B> (Android) zum Home-Bildschirm
                hinzufügen.
              </>
            ),
          },
        ],
      };
    default:
      // Chrome, Opera und andere Android-Browser
      return {
        screen: "Startbildschirm",
        steps: [
          {
            icon: <EllipsisVertical />,
            text: (
              <>
                Oben rechts auf das <B>Menü ⋮</B> tippen.
              </>
            ),
          },
          {
            icon: <SquarePlus />,
            text: (
              <>
                <B>„Zum Startbildschirm hinzufügen“</B> oder <B>„App installieren“</B> wählen.
              </>
            ),
          },
          {
            text: (
              <>
                Mit <B>„Installieren“</B> bzw. <B>„Hinzufügen“</B> bestätigen.
              </>
            ),
          },
        ],
      };
  }
}

export function InstallStep() {
  const [browser] = useState(() =>
    detectInstallBrowser({ ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }),
  );
  const prompt = useInstallPrompt();
  const guide = guideFor(browser);
  const ios = browser.startsWith("ios-");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      toast.success("Link kopiert");
    } catch {
      toast(window.location.origin);
    }
  };

  return (
    <>
      <div className="mb-5">
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary [&_svg]:h-5 [&_svg]:w-5">
          <Download />
        </div>
        <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-tight">
          Auf den {guide.screen}
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
          Dann startet KickTime wie eine richtige App – ohne Store, in wenigen Sekunden.
        </p>
      </div>

      <ul className="mb-5 grid grid-cols-3 gap-2">
        {[
          { icon: <Maximize2 />, text: "Vollbild" },
          { icon: <Zap />, text: "Ein Tipp zum Start" },
          { icon: <BellRing />, text: "Erinnerung vor Anpfiff" },
        ].map((b) => (
          <li
            key={b.text}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-3 text-center text-[12px] font-medium leading-tight [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:text-primary"
          >
            {b.icon}
            {b.text}
          </li>
        ))}
      </ul>

      {prompt === "installed" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-4 w-4" />
          </span>
          <div>
            <div className="text-[15px] font-semibold">Installiert!</div>
            <div className="text-[13.5px] text-muted-foreground">
              KickTime liegt jetzt auf deinem {guide.screen}. Du kannst hier direkt weitermachen.
            </div>
          </div>
        </div>
      ) : prompt === "ready" ? (
        <>
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground shadow-lg shadow-primary/25"
          >
            <Download className="h-5 w-5" /> KickTime installieren
          </button>
          <details className="mt-4 text-[13.5px] text-muted-foreground">
            <summary className="cursor-pointer select-none">
              Klappt nicht? So geht’s von Hand
            </summary>
            <Steps guide={guide} className="mt-3" />
          </details>
        </>
      ) : (
        <>
          <Steps guide={guide} />
          {guide.needsOtherBrowser && (
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-3 inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-[14px] font-semibold"
            >
              <Copy className="h-4 w-4" /> Link kopieren
            </button>
          )}
        </>
      )}

      {ios && prompt !== "installed" && (
        <p className="mt-4 rounded-2xl bg-subtle p-3.5 text-[13px] leading-relaxed text-muted-foreground">
          Wichtig fürs iPhone: Die App vom Home-Bildschirm speichert getrennt von Safari. Richte
          KickTime deshalb erst dort ein – nur so klappen auch Erinnerungen per Mitteilung.
        </p>
      )}
    </>
  );
}

function Steps({ guide, className }: { guide: Guide; className?: string }) {
  return (
    <ol className={cn("space-y-2", className)}>
      {guide.steps.map((s, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-[14px] leading-snug text-muted-foreground"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[13px] font-bold text-primary tabular">
            {i + 1}
          </span>
          <span className="flex-1">{s.text}</span>
          {s.icon && (
            <span className="shrink-0 text-primary [&_svg]:h-5 [&_svg]:w-5">{s.icon}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
