import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { RulesButton, TipGroupsSection } from "@/components/tipgroups/TipGroups";
import { TipPanel } from "@/components/tipgroups/TipPanel";
import { useTipContext } from "@/lib/tips";
import { TOURNAMENT } from "@/tournament/config";

export const Route = createFileRoute("/tipps")({
  head: () => ({ meta: [{ title: `Tipps ${TOURNAMENT.name} | KickTime` }] }),
  component: TipsPage,
});

/**
 * Allein: hier wird direkt getippt. Wer in Tipprunden ist (oder die
 * Vorschau nutzt), sieht hier nur seine Runden – getippt wird dann in der
 * jeweiligen Runde, damit immer klar ist, wofür der Tipp gilt.
 */
function TipsPage() {
  const ctx = useTipContext();
  const solo = ctx.kind === "solo";
  return (
    <div>
      <PageHeader
        eyebrow={TOURNAMENT.name}
        title="Tipps"
        subtitle={
          solo
            ? "Du tippst allein. Tippen ist bis zum Anpfiff möglich."
            : "Wähle eine Runde – dort gibst du deine Tipps ab."
        }
        action={<RulesButton />}
      />
      {solo ? (
        <>
          <TipGroupsSection variant="solo" />
          <TipPanel ctx={ctx} />
        </>
      ) : (
        <TipGroupsSection variant="hub" />
      )}
    </div>
  );
}
