import { Check, RefreshCw, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  decideRequest,
  fetchGlobalBans,
  fetchRequests,
  unbanGlobal,
  type GlobalBan,
  type UnbanRequest,
} from "@/services/admin";
import { ActionButton, Card, ConfirmButton } from "./shared";
import { TeamDeviceRow } from "./TeamDevice";
import { fmtTime, useAction } from "./use-action";

/** Entsperrungsanträge, „überall gesperrt“ und Mitteilungen an dieses Gerät. */
export function RequestsSection({ pin, onChange }: { pin: string; onChange?: () => void }) {
  const { busy, run } = useAction();
  const [requests, setRequests] = useState<UnbanRequest[] | null>(null);
  const [bans, setBans] = useState<GlobalBan[] | null>(null);

  const load = useCallback(async () => {
    const [r, b] = await Promise.all([fetchRequests(pin), fetchGlobalBans(pin)]);
    if (r.ok) setRequests(r.data.data ?? []);
    if (b.ok) setBans(b.data.data ?? []);
  }, [pin]);
  useEffect(() => {
    void load();
  }, [load]);
  const changed = async () => {
    await load();
    onChange?.();
  };

  const open = (requests ?? []).filter((r) => r.status === "open");
  const done = (requests ?? []).filter((r) => r.status !== "open");

  return (
    <div className="space-y-3 text-[13.5px]">
      <Card
        title="Mitteilungen ans Team"
        text="Neue Anträge und Warnungen des Wächters gehen nur an eingetragene Geräte."
      >
        <TeamDeviceRow pin={pin} />
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-[14.5px] font-semibold">
          Offene Anträge{requests ? ` (${open.length})` : ""}
        </h3>
        <button
          type="button"
          onClick={load}
          aria-label="Aktualisieren"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      {requests && open.length === 0 && (
        <p className="rounded-xl bg-subtle p-3 text-muted-foreground">Keine offenen Anträge.</p>
      )}
      {open.map((r) => (
        <RequestCard
          key={r.id}
          r={r}
          busy={busy}
          onDecide={async (accept, reply) => {
            const ok = await run(
              `r-${r.id}`,
              () => decideRequest(pin, r.id, accept, reply),
              accept ? "Entsperrt" : "Abgelehnt",
            );
            if (ok) await changed();
          }}
        />
      ))}

      <Card
        title={`Überall gesperrt${bans ? ` (${bans.length})` : ""}`}
        text="Können keiner Tipprunde beitreten und keine erstellen. Entsperren holt sie mit ihren Tipps in ihre Runden zurück."
      >
        {bans && bans.length === 0 && <p className="text-muted-foreground">Niemand.</p>}
        <ul className="space-y-1.5">
          {bans?.map((b) => (
            <li key={b.device} className="rounded-lg bg-subtle px-2.5 py-2">
              <div className="font-semibold">{b.label || "ohne Runde"}</div>
              <div className="text-[12px] text-muted-foreground">
                seit {fmtTime(b.createdAt)}
                {b.reason && ` · Grund: ${b.reason}`}
                {b.openRequests > 0 &&
                  ` · ${b.openRequests} ${b.openRequests === 1 ? "offener Antrag" : "offene Anträge"}`}
              </div>
              <ConfirmButton
                variant="outline"
                className="mt-1.5 h-8 rounded-lg bg-background px-2.5 text-[12.5px]"
                icon={<Undo2 />}
                busy={busy === `u-${b.device}`}
                title="Überall entsperren?"
                text="Die Person kommt mit ihren Tipps in ihre bisherigen Runden zurück und kann wieder Runden erstellen und beitreten."
                confirm="Entsperren"
                onConfirm={async () => {
                  const ok = await run(
                    `u-${b.device}`,
                    () => unbanGlobal(pin, { device: b.device }),
                    "Überall entsperrt",
                  );
                  if (ok) await changed();
                }}
              >
                Überall entsperren
              </ConfirmButton>
            </li>
          ))}
        </ul>
      </Card>

      {done.length > 0 && (
        <Card title="Entschieden (30 Tage)">
          <ul className="space-y-1.5">
            {done.map((r) => (
              <li key={r.id} className="rounded-lg bg-subtle px-2.5 py-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  {r.status === "accepted" ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-destructive" />
                  )}
                  <span className="truncate">{r.name ?? "?"}</span>
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {scopeLabel(r)} · {fmtTime(r.decidedAt)}
                  {r.reply && ` · „${r.reply}“`}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

const scopeLabel = (r: UnbanRequest) =>
  r.scope === "global" ? "überall gesperrt" : `in „${r.groupName ?? "?"}“`;

function RequestCard({
  r,
  busy,
  onDecide,
}: {
  r: UnbanRequest;
  busy: string | null;
  onDecide: (accept: boolean, reply: string) => void;
}) {
  const [reply, setReply] = useState("");
  const key = `r-${r.id}`;
  return (
    <div className="space-y-2 rounded-2xl border border-primary/40 bg-card p-3.5">
      <div>
        <div className="text-[15px] font-semibold">{r.name ?? "Unbekannt"}</div>
        <div className="text-[12px] text-muted-foreground">
          {scopeLabel(r)} · {fmtTime(r.createdAt)} ·{" "}
          {r.byOwner ? "beantragt vom Ersteller der Runde" : "beantragt von der Person selbst"}
        </div>
        {r.banReason && (
          <div className="text-[12px] text-muted-foreground">Sperrgrund: {r.banReason}</div>
        )}
      </div>
      <p
        className={cn(
          "rounded-xl bg-subtle px-3 py-2",
          !r.message && "italic text-muted-foreground",
        )}
      >
        {r.message ? `„${r.message}“` : "ohne Begründung"}
      </p>
      <input
        value={reply}
        onChange={(e) => setReply(e.target.value.slice(0, 300))}
        placeholder="Antwort (optional, sieht der Antragsteller)"
        className="h-10 w-full rounded-xl border border-border bg-subtle px-3 text-[14px] outline-none focus:border-primary"
      />
      <div className="grid grid-cols-2 gap-2">
        <ActionButton
          variant="danger-outline"
          icon={<X />}
          busy={busy === key}
          onClick={() => onDecide(false, reply)}
        >
          Ablehnen
        </ActionButton>
        <ActionButton
          variant="primary"
          icon={<Check />}
          busy={busy === key}
          onClick={() => onDecide(true, reply)}
        >
          Entsperren
        </ActionButton>
      </div>
    </div>
  );
}
