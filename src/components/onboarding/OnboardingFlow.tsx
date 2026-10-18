import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CalendarClock, EyeOff, Sparkles, Star, Users } from "lucide-react";
import { useState } from "react";
import { LogoMark, Wordmark } from "@/components/layout/Logo";
import { WeekEditor } from "@/components/settings/WeekEditor";
import { Flag } from "@/components/team/Flag";
import { TeamPicker } from "@/components/team/TeamPicker";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/domain/time";
import { cn } from "@/lib/utils";
import { useAppStore, useTimeZone } from "@/store/app-store";
import { TOURNAMENT } from "@/tournament/config";
import { getNation } from "@/tournament/nations";

const STEPS = ["Willkommen", "Teams", "Zeit", "Fertig"] as const;

export function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const favorites = useAppStore((s) => s.favorites);
  const interesting = useAppStore((s) => s.interesting);
  const complete = useAppStore((s) => s.completeOnboarding);
  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
    window.scrollTo({ top: 0 });
  };
  const teamCount = favorites.length + interesting.length;

  return (
    <div className="app-backdrop min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-28 pt-6">
        {step > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => go(step - 1)}
              aria-label="Zurück"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex flex-1 gap-1.5">
              {STEPS.slice(1).map((s, i) => (
                <span
                  key={s}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    i + 1 <= step ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>
            <span className="w-9 text-right text-[12px] font-medium text-muted-foreground tabular">
              {step}/{STEPS.length - 1}
            </span>
          </div>
        )}

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -28 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex-1"
          >
            {step === 0 && <Welcome onStart={() => go(1)} />}
            {step === 1 && (
              <>
                <StepTitle
                  icon={<Users />}
                  title="Deine Teams"
                  text="Wem drückst du die Daumen? Favoriten stehen bei dir ganz oben, interessante Teams fließen in deine Empfehlungen ein. Die 24 Endrunden-Teams stehen erst im März 2028 fest – markiere ruhig mehrere."
                />
                <TeamPicker />
              </>
            )}
            {step === 2 && <TimeStep />}
            {step === 3 && <Done />}
          </motion.div>
        </AnimatePresence>
      </div>

      {step > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-border/70 bg-background/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-xl items-center gap-3 px-5 py-3">
            {step === 1 && (
              <span className="flex-1 text-[13px] text-muted-foreground">
                {teamCount === 0
                  ? "Mindestens ein Team wählen"
                  : `${teamCount} ${teamCount === 1 ? "Team" : "Teams"} gewählt`}
              </span>
            )}
            {step === 2 && (
              <span className="flex-1 text-[13px] text-muted-foreground">
                Später jederzeit änderbar
              </span>
            )}
            {step === 3 && <span className="flex-1" />}
            <button
              type="button"
              disabled={step === 1 && teamCount === 0}
              onClick={() => (step < 3 ? go(step + 1) : complete())}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-opacity disabled:opacity-40"
            >
              {step < 3 ? "Weiter" : "Los geht's"} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepTitle({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="mb-5">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </div>
      <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-tight">
        {title}
      </h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  const features = [
    { icon: <Star />, title: "Deine Teams", text: "Du sagst, wem du die Daumen drückst." },
    {
      icon: <CalendarClock />,
      title: "Deine Zeit",
      text: "Wir zeigen, welche Spiele in deinen Alltag passen.",
    },
    {
      icon: <EyeOff />,
      title: "Spoilerfrei",
      text: "Ergebnisse bleiben verborgen, bis du sie sehen willst.",
    },
  ];
  return (
    <div className="flex min-h-[85dvh] flex-col justify-center">
      <div className="mb-8 flex items-center gap-3">
        <LogoMark className="h-14 w-14" />
        <Wordmark className="text-[30px]" />
      </div>
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">
        {TOURNAMENT.longName} · {TOURNAMENT.hostsShort}
      </div>
      <h1 className="font-display text-[44px] font-bold uppercase leading-[0.95] tracking-tight sm:text-[56px]">
        Die EM, die zu
        <br />
        deinem Leben passt.
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
        51 Spiele, 31 Tage, ab {formatDate(TOURNAMENT.start, "Europe/Berlin")}. KickTime filtert für
        dich heraus, welche davon du wirklich sehen willst – und kannst.
      </p>
      <ul className="mt-8 space-y-3">
        {features.map((f) => (
          <li key={f.title} className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary [&_svg]:h-[18px] [&_svg]:w-[18px]">
              {f.icon}
            </span>
            <div>
              <div className="text-[15px] font-semibold">{f.title}</div>
              <div className="text-[13.5px] text-muted-foreground">{f.text}</div>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onStart}
        className="mt-10 inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground shadow-lg shadow-primary/25"
      >
        In 1 Minute einrichten <ArrowRight className="h-5 w-5" />
      </button>
      <p className="mt-3 text-center text-[12px] text-muted-foreground">
        Ohne Anmeldung · Daten bleiben auf deinem Gerät
      </p>
    </div>
  );
}

function TimeStep() {
  const availability = useAppStore((s) => s.availability);
  const setAvailability = useAppStore((s) => s.setAvailability);
  const tz = useTimeZone();
  return (
    <>
      <StepTitle
        icon={<CalendarClock />}
        title="Deine Zeit"
        text="Wann kannst du in der Regel Fußball schauen? Gespielt wird um 15, 18 und 21 Uhr – genaue Zeiten folgen nach der Auslosung."
      />
      <WeekEditor value={availability} onChange={setAvailability} timeZone={tz} />
      <p className="mt-3 text-[12px] text-muted-foreground">Zeitzone: {tz.replaceAll("_", " ")}</p>
    </>
  );
}

function Done() {
  const favorites = useAppStore((s) => s.favorites);
  const interesting = useAppStore((s) => s.interesting);
  const spoiler = useAppStore((s) => s.spoilerProtection);
  const setSpoiler = useAppStore((s) => s.setSpoiler);
  const teams = [...favorites, ...interesting].map((c) => getNation(c)).filter((n) => !!n);
  return (
    <>
      <StepTitle
        icon={<Sparkles />}
        title="Alles bereit"
        text="Dein persönlicher EM-Fahrplan steht. Sobald die Auslosung feststeht, erscheinen deine Spiele automatisch."
      />
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Deine Teams
        </div>
        <div className="flex flex-wrap gap-2">
          {teams.map((n) => (
            <span
              key={n.code}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-subtle py-1 pl-1.5 pr-3 text-[13px] font-medium"
            >
              <Flag flag={n.flag} size="sm" className="rounded-full" />
              {n.name}
              {favorites.includes(n.code) && <Star className="h-3 w-3 fill-gold text-gold" />}
            </span>
          ))}
        </div>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <EyeOff className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1">
          <div className="text-[15px] font-semibold">Spoilerschutz</div>
          <div className="text-[13px] text-muted-foreground">
            Ergebnisse erst zeigen, wenn du darauf tippst. Ideal, wenn du Spiele später schaust.
          </div>
        </div>
        <Switch checked={spoiler} onCheckedChange={setSpoiler} aria-label="Spoilerschutz" />
      </label>
    </>
  );
}
