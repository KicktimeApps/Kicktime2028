import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useMyGroups } from "@/hooks/useMyGroups";
import { RoundPageSkeleton } from "@/components/common/Skeleton";
import { isBackendConfigured } from "@/services/supabase";
import { leaveGroup, normalizeCode } from "@/services/tipgroups";

import { Note } from "@/components/round/RoundShared";
import { JoinInvite, PendingView } from "@/components/round/RoundStatus";
import { ServerBoard } from "@/components/round/RoundBoard";

export const Route = createFileRoute("/runde/$code")({
  // Link-Vorschau beim Teilen (WhatsApp & Co.). Bewusst ohne Rundennamen: Den
  // könnte sonst jeder auslesen, der Codes durchprobiert – er steht ohnehin im
  // Text, den der Ersteller mitschickt.
  head: ({ params }) => {
    const code = normalizeCode(params.code);
    const description = `Tipp mit bei der EURO 2028 – Code ${code}. Kostenlos und ohne Anmeldung.`;
    return {
      meta: [
        { title: `Einladung zur Tipprunde ${code} | KickTime` },
        { name: "robots", content: "noindex" },
        { name: "description", content: description },
        { property: "og:title", content: "Du bist zur Tipprunde eingeladen 🏆" },
        { property: "og:description", content: description },
      ],
    };
  },
  component: GroupPage,
});

function GroupPage() {
  const code = normalizeCode(Route.useParams().code);
  const { data: groups, isLoading } = useMyGroups();
  const group = groups?.find((g) => g.code === code);
  // Angenommen, während die Seite offen war → kurz Bescheid geben.
  const wasPending = useRef(false);
  useEffect(() => {
    if (group?.pending) wasPending.current = true;
    else if (group && wasPending.current) {
      wasPending.current = false;
      toast.success(`Du bist jetzt in „${group.name}“ dabei`, {
        description: "Ab sofort kannst du hier tippen.",
      });
    }
  }, [group]);
  // War man eben noch drin (verlassen, entfernt, Anfrage abgelehnt, Runde
  // gelöscht)? Dann zurück zur Tipps-Seite statt zur Einladung.
  const navigate = useNavigate();
  const wasIn = useRef(false);
  const inNow = !!group;
  useEffect(() => {
    if (inNow) wasIn.current = true;
    else if (wasIn.current && !isLoading) navigate({ to: "/tipps", replace: true });
  }, [inNow, isLoading, navigate]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/tipps"
        className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-full pl-1 pr-3 text-[15px] font-medium text-primary hover:bg-primary/10"
      >
        <ChevronLeft className="h-5 w-5" /> Tipps
      </Link>
      {!isBackendConfigured() ? (
        <Note>Tipprunden brauchen den KickTime-Server.</Note>
      ) : isLoading ? (
        <RoundPageSkeleton />
      ) : group?.pending ? (
        <PendingView name={group.name} code={group.code} onWithdraw={() => leaveGroup(group.id)} />
      ) : group ? (
        <ServerBoard groupId={group.id} />
      ) : (
        <JoinInvite code={code} />
      )}
    </div>
  );
}
