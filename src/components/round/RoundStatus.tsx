import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { GroupFormDrawer } from "@/components/tipgroups/TipGroups";
import { TIP_GROUPS_KEY } from "@/hooks/useMyGroups";
import { Confirm } from "./RoundShared";

/** Über einen Einladungslink gekommen, aber noch nicht dabei. */
export function JoinInvite({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader eyebrow="Einladung" title="Tipprunde" subtitle={`Code ${code}`} />
      <div className="rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-[16px]">Du wurdest zu einer Tipprunde eingeladen.</p>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Wähle einen Namen und schick eine Anfrage. Sobald der Ersteller dich annimmt, tippst du
          mit. Ohne Anmeldung.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-[16px] font-semibold text-primary-foreground"
        >
          Jetzt beitreten
        </button>
      </div>
      <GroupFormDrawer mode="join" open={open} onOpenChange={setOpen} initialCode={code} />
    </>
  );
}

/** Anfrage gestellt – wartet auf den Ersteller. */
export function PendingView({
  name,
  code,
  onWithdraw,
}: {
  name: string;
  code: string;
  onWithdraw: () => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader eyebrow="Tipprunde" title={name} subtitle={`Code ${code}`} />
      <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5 text-center">
        <Hourglass className="mx-auto h-8 w-8 text-gold" />
        <p className="mt-2 text-[17px] font-semibold">Wartet auf Freigabe</p>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Deine Anfrage ist angekommen. Sobald der Ersteller der Runde dich annimmt, kannst du hier
          tippen und siehst die Tabelle. Deine bisherigen Tipps sind schon dabei.
        </p>
      </div>
      <Confirm
        title="Anfrage zurückziehen?"
        text="Du kannst später mit dem Code erneut anfragen."
        action="Zurückziehen"
        onConfirm={async () => {
          await onWithdraw();
          navigate({ to: "/tipps", replace: true });
          toast("Anfrage zurückgezogen");
          await qc.invalidateQueries({ queryKey: TIP_GROUPS_KEY });
        }}
      >
        <button
          type="button"
          className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-card text-[15px] font-semibold text-muted-foreground"
        >
          Anfrage zurückziehen
        </button>
      </Confirm>
    </>
  );
}
