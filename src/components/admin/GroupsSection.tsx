import { useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronDown, Crown, RefreshCw, Trash2, Undo2, UserMinus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag } from "@/components/team/Flag";
import { teamDisplay } from "@/domain/labels";
import { cn } from "@/lib/utils";
import {
  deleteAllTipGroups,
  deleteGroup,
  fetchGroup,
  fetchGroups,
  removeMember,
  transferOwner,
  unbanMember,
  type AdminGroup,
  type AdminMember,
} from "@/services/admin";
import { useAppStore } from "@/store/app-store";
import { ActionButton, Card, ConfirmButton, Info } from "./shared";
import { fmtTime, useAction } from "./use-action";

export function GroupsSection({ pin }: { pin: string }) {
  const qc = useQueryClient();
  const { busy, run } = useAction();
  const [groups, setGroups] = useState<AdminGroup[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const res = await run("load", () => fetchGroups(pin));
    if (res) setGroups(res.data ?? []);
  }, [pin, run]);
  useEffect(() => {
    void load();
  }, [load]);

  // Eigene Ansichten der App (Mitgliederlisten, Tabellen) danach neu laden.
  const changed = async () => {
    await load();
    await qc.invalidateQueries();
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (groups ?? []).filter(
      (g) => !q || [g.name, g.code, g.owner ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [groups, query]);

  const sum = (k: "members" | "pending" | "tips") =>
    (groups ?? []).reduce((n, g) => n + Number(g[k] ?? 0), 0);

  return (
    <div className="space-y-3 text-[13.5px]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Info label="Runden" value={groups ? String(groups.length) : "–"} />
        <Info label="Mitglieder" value={groups ? String(sum("members")) : "–"} />
        <Info label="Offene Anfragen" value={groups ? String(sum("pending")) : "–"} />
        <Info label="Tipps" value={groups ? String(sum("tips")) : "–"} />
      </div>
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, Code oder Ersteller …"
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-subtle px-3 text-[14px] outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={load}
          aria-label="Aktualisieren"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground"
        >
          <RefreshCw className={cn("h-4 w-4", busy === "load" && "animate-spin")} />
        </button>
      </div>

      {groups && list.length === 0 && (
        <p className="text-muted-foreground">
          {query ? "Nichts gefunden." : "Noch keine Tipprunden."}
        </p>
      )}
      <ul className="space-y-2">
        {list.map((g) => (
          <li key={g.id} className="rounded-xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setOpen(open === g.id ? null : g.id)}
              aria-expanded={open === g.id}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{g.name}</div>
                <div className="truncate text-[12px] text-muted-foreground">
                  <span className="font-mono">{g.code}</span> · {g.owner ?? "?"} · {g.members}{" "}
                  {g.members === 1 ? "Mitglied" : "Mitglieder"}
                  {g.pending > 0 && ` · ${g.pending} offen`} · {g.tips} Tipps
                </div>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  open === g.id && "rotate-180",
                )}
              />
            </button>
            {open === g.id && <GroupDetail pin={pin} group={g} onChanged={changed} />}
          </li>
        ))}
      </ul>

      <Card
        title="Alle Tipprunden löschen"
        text="Zum Aufräumen nach dem Testen – auch die aus dem Vorschau-Modus."
      >
        <ConfirmButton
          icon={<Trash2 />}
          busy={busy === "all"}
          className="w-full"
          title="Wirklich alle Tipprunden löschen?"
          text="Alle Runden aller Nutzer verschwinden – mit Mitgliedern, Tipps und Tabellen. Das lässt sich nicht rückgängig machen."
          confirm="Alle löschen"
          onConfirm={async () => {
            const res = await run(
              "all",
              () => deleteAllTipGroups(pin),
              (d) => `${d.count} ${d.count === 1 ? "Runde" : "Runden"} gelöscht`,
            );
            if (res) {
              useAppStore.getState().setTipGroups([]);
              useAppStore.getState().setSeenGroups([]);
              await changed();
            }
          }}
        >
          Alle Tipprunden löschen
        </ConfirmButton>
      </Card>
    </div>
  );
}

function GroupDetail({
  pin,
  group,
  onChanged,
}: {
  pin: string;
  group: AdminGroup;
  onChanged: () => Promise<void>;
}) {
  const { busy, run } = useAction();
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const load = useCallback(async () => {
    const res = await run("load", () => fetchGroup(pin, group.id));
    if (res) setMembers(res.data ?? []);
  }, [pin, group.id, run]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (key: string, fn: () => ReturnType<typeof removeMember>, msg: string) => {
    if (await run(key, fn, msg)) {
      await load();
      await onChanged();
    }
  };

  return (
    <div className="space-y-2 border-t border-border px-3 pb-3 pt-2.5">
      <div className="text-[12px] text-muted-foreground">Erstellt {fmtTime(group.created_at)}</div>
      {!members && <div className="text-muted-foreground">Lädt …</div>}
      <ul className="space-y-1.5">
        {members?.map((m) => {
          const champ = m.champion ? teamDisplay(m.champion, m.champion) : null;
          return (
            <li
              key={m.memberId}
              className={cn("rounded-lg bg-subtle px-2.5 py-2", m.banned && "opacity-60")}
            >
              <div className="flex items-center gap-1.5">
                {m.owner && (
                  <Crown className="h-3.5 w-3.5 shrink-0 text-gold" aria-label="Ersteller" />
                )}
                <span className="truncate font-semibold">{m.name}</span>
                <span className="ml-auto shrink-0 text-[11.5px] text-muted-foreground">
                  {m.banned ? "gesperrt" : !m.approved ? "Anfrage offen" : `${m.tips} Tipps`}
                </span>
                {champ && <Flag flag={champ.flag} size="xs" />}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {m.banned ? (
                  <MiniButton
                    icon={<Undo2 />}
                    busy={busy === `unban-${m.memberId}`}
                    onClick={() =>
                      act(
                        `unban-${m.memberId}`,
                        () => unbanMember(pin, group.id, m.memberId),
                        `${m.name} entsperrt`,
                      )
                    }
                  >
                    Entsperren
                  </MiniButton>
                ) : (
                  <>
                    {!m.owner && m.approved && (
                      <MiniButton
                        icon={<Crown />}
                        busy={busy === `owner-${m.memberId}`}
                        onClick={() =>
                          act(
                            `owner-${m.memberId}`,
                            () => transferOwner(pin, group.id, m.memberId),
                            `${m.name} ist jetzt Ersteller`,
                          )
                        }
                      >
                        Zum Ersteller
                      </MiniButton>
                    )}
                    <MiniButton
                      icon={<UserMinus />}
                      busy={busy === `rm-${m.memberId}`}
                      onClick={() =>
                        act(
                          `rm-${m.memberId}`,
                          () => removeMember(pin, group.id, m.memberId, false),
                          `${m.name} entfernt`,
                        )
                      }
                    >
                      Entfernen
                    </MiniButton>
                    <MiniButton
                      danger
                      icon={<Ban />}
                      busy={busy === `ban-${m.memberId}`}
                      onClick={() =>
                        act(
                          `ban-${m.memberId}`,
                          () => removeMember(pin, group.id, m.memberId, true),
                          `${m.name} gesperrt`,
                        )
                      }
                    >
                      Sperren
                    </MiniButton>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11.5px] text-muted-foreground">
        Entfernen: Tipps weg, darf mit dem Code neu beitreten. Sperren: kommt nicht wieder rein.
      </p>
      <ConfirmButton
        icon={<Trash2 />}
        variant="danger-outline"
        className="h-9 w-full"
        busy={busy === "delete"}
        title={`„${group.name}“ löschen?`}
        text="Die Runde verschwindet für alle Mitglieder – mit allen Tipps. Das lässt sich nicht rückgängig machen."
        confirm="Löschen"
        onConfirm={async () => {
          if (await run("delete", () => deleteGroup(pin, group.id), "Runde gelöscht"))
            await onChanged();
        }}
      >
        Diese Runde löschen
      </ConfirmButton>
    </div>
  );
}

function MiniButton({
  children,
  icon,
  busy,
  danger,
  onClick,
}: {
  children: string;
  icon: React.ReactNode;
  busy?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <ActionButton
      icon={icon}
      busy={busy}
      onClick={onClick}
      variant={danger ? "danger-outline" : "outline"}
      className="h-8 rounded-lg bg-background px-2.5 text-[12.5px] font-medium [&_svg]:h-3.5 [&_svg]:w-3.5"
    >
      {children}
    </ActionButton>
  );
}
