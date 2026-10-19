# Einrichtung komplett vom iPhone aus

Diese Anleitung funktioniert nur mit Safari, ohne Computer und ohne Terminal.

**Tipp für Safari:** Das Supabase-Dashboard ist auf dem Handy eng. Tippe in der Adressleiste
auf **„aA“** und dann auf **„Desktop-Website anfordern“**. Danach im Querformat arbeiten.

**Dateien aus dem Repo kopieren:** Öffne die Datei auf github.com (eingeloggt), tippe auf
**„Raw“** und dann lange in den Text → **„Alles auswählen“** → **„Kopieren“**.

---

## Schritt 1 – Neues Supabase-Projekt

1. [supabase.com/dashboard](https://supabase.com/dashboard) öffnen und einloggen.
2. **„New project“** antippen:
   - Name: `kicktime-2028`
   - Database Password: sicheres Passwort, **notieren**
   - Region: **Central EU (Frankfurt)**
3. **„Create new project“** antippen und ca. 2 Minuten warten.

> Bitte ein **neues** Projekt anlegen und nicht das von KickTime 2026 verwenden. Die Tabellen
> sind anders aufgebaut.

## Schritt 2 – Tabellen anlegen

1. Im Repo diese Datei öffnen und den Inhalt kopieren (siehe oben, „Raw“):
   `supabase/migrations/20261018000000_kicktime_2028.sql`
2. In Supabase links **„SQL Editor“** → **„New query“** (bzw. „+“).
3. Den Text einfügen → **„Run“**.
4. Ergebnis: „Success. No rows returned“. Unter **„Table Editor“** stehen jetzt Tabellen wie
   `match_overrides` und `push_subscriptions`.

## Schritt 3 – Zugangsdaten notieren

**„Project Settings“** (Zahnrad) → **„API“** bzw. **„Data API“ / „API Keys“**:

- **Project URL**, z. B. `https://abcdefghijk.supabase.co`. Der Teil `abcdefghijk` ist deine
  **Projekt-Ref**.
- **anon public** bzw. **publishable** Key: der lange Schlüssel.

Beide sind öffentlich und dürfen in die App. Der **service_role**/**secret**-Key ist geheim:
den brauchst du nicht, und er darf nirgends hinein.

## Schritt 4 – Push-Schlüssel (VAPID) erzeugen

1. Auf dem iPhone [vapidkeys.com](https://vapidkeys.com) öffnen. Die Seite erzeugt die
   Schlüssel direkt im Browser.
2. **Public Key** und **Private Key** kopieren und sicher notieren, z. B. in der
   Passwörter-App oder in einer gesperrten Notiz.
3. Der **Private Key** ist geheim und kommt **nur** in Schritt 5 zu Supabase. Bitte nirgendwo
   sonst hineinkopieren, auch nicht in den Chat.

## Schritt 5 – Secrets in Supabase

Links **„Edge Functions“** → **„Secrets“** (bzw. „Manage secrets“). Diese fünf Einträge
anlegen (**Name** genau so schreiben):

| Name                | Wert                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `ADMIN_PIN`         | deine neue Admin-PIN, 6–12 Ziffern                                                           |
| `VAPID_PUBLIC_KEY`  | Public Key aus Schritt 4                                                                     |
| `VAPID_PRIVATE_KEY` | Private Key aus Schritt 4                                                                    |
| `VAPID_SUBJECT`     | `mailto:` + deine E-Mail, z. B. `mailto:ich@example.de`                                      |
| `CRON_SECRET`       | lange Zufallszeichenkette (z. B. mit der Passwörter-App ein Passwort erzeugen), **notieren** |

Speichern.

## Schritt 6 – Die drei Edge Functions anlegen

Wiederhole das für jede der drei Funktionen:

1. **„Edge Functions“** → **„Deploy a new function“** → **„Via Editor“**.
2. **Name** exakt wie in der Tabelle eingeben.
3. Den Beispielcode im Editor komplett löschen (lange tippen → „Alles auswählen“ → löschen).
4. Den Inhalt der Datei aus dem Repo einfügen.
5. **„Deploy function“** antippen.

| Name im Dashboard     | Datei im Repo                                     |
| --------------------- | ------------------------------------------------- |
| `live-scores`         | `supabase/functions/live-scores/index.ts`         |
| `admin`               | `supabase/functions/admin/index.ts`               |
| `send-push-reminders` | `supabase/functions/send-push-reminders/index.ts` |

**Wichtig bei allen drei Funktionen:** Danach die Funktion öffnen → **„Settings“** →
**„Verify JWT with legacy secret“** (bzw. „Enforce JWT Verification“) **ausschalten** →
**„Save changes“**. Die Absicherung steckt in den Funktionen selbst (PIN, Cron-Secret,
Drosselung).

## Schritt 7 – Erinnerungen automatisch versenden (Cron)

1. **„Database“** → **„Extensions“**: nach **`pg_cron`** suchen → aktivieren. Dann nach
   **`pg_net`** suchen → aktivieren.
2. **„SQL Editor“** → **„New query“** und folgenden Text einfügen. Ersetze dabei
   `DEINE-PROJEKT-REF` (aus Schritt 3) und `DEIN-CRON-SECRET` (aus Schritt 5):

```sql
select cron.schedule('kicktime-push', '* * * * *', $$
  select net.http_post(
    url := 'https://DEINE-PROJEKT-REF.supabase.co/functions/v1/send-push-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','DEIN-CRON-SECRET'),
    body := '{}'::jsonb
  );
$$);
```

3. **„Run“**. Unter **„Integrations“ → „Cron“** (bzw. „Database → Cron Jobs“) taucht jetzt
   `kicktime-push` auf und läuft jede Minute.

## Schritt 8 – App mit Supabase verbinden

Die drei öffentlichen Werte kommen in die Datei `src/public-config.ts`:

```ts
export const PUBLIC_CONFIG = {
  supabaseUrl: "https://abcdefghijk.supabase.co",
  supabaseAnonKey: "der-lange-anon-oder-publishable-key",
  vapidPublicKey: "der-public-key-aus-schritt-4",
};
```

Dafür gibt es zwei Wege:

- **Einfach:** Schick die drei Werte an Claude. Sie sind öffentlich, dürfen also in den Chat.
  Claude trägt sie ein.
- **Selbst:** Auf github.com die Datei öffnen → **Stift-Symbol** → Werte zwischen die
  Anführungszeichen setzen → **„Commit changes“**.

**Niemals** den VAPID Private Key, die Admin-PIN oder den secret/service_role-Key in diese
Datei schreiben.

## Schritt 9 – Veröffentlichen (Hosting)

Die App ist ein Cloudflare Worker (wie KickTime 2026). Vom iPhone aus geht es über
Cloudflare:

1. [dash.cloudflare.com](https://dash.cloudflare.com) öffnen (Konto ggf. kostenlos anlegen)
   → **„Workers & Pages“** → **„Create“** → **„Import a repository“** → GitHub verbinden →
   Repo **Kicktime2028** auswählen.
2. Build-Einstellungen:
   - **Build command:** `npm install && npm run build`
   - **Deploy command:** `npx wrangler deploy`
3. **„Deploy“** antippen. Danach gibt es eine Adresse wie `kicktime-2028.<name>.workers.dev`,
   eine eigene Domain lässt sich später unter „Settings → Domains“ verbinden.

Jeder Push auf `main` veröffentlicht die App automatisch neu. Hakt ein Schritt, schick Claude
die Fehlermeldung aus dem Build-Log.

## Schritt 10 – Testen

1. Die veröffentlichte App auf dem iPhone in Safari öffnen → **Teilen** → **„Zum
   Home-Bildschirm“**. KickTime danach **über das neue Icon** starten (nötig für Push auf dem
   iPhone).
2. Einrichtung durchklicken.
3. **Profil** → ganz unten **5× schnell auf die Versionszeile** tippen → Admin-PIN eingeben →
   Reiter **„System“**: Bei **Quelle** muss `backend` stehen.
4. **Profil → Erinnerungen** einschalten und die Mitteilungen erlauben.
5. In Supabase → **„Table Editor“** → `push_subscriptions`: Hier steht jetzt ein Eintrag.
6. **Profil → Erinnerungen → „Test-Benachrichtigung senden“** antippen, dann zum
   Home-Bildschirm wechseln oder das iPhone sperren. Nach etwa 1 Minute kommt eine echte
   Mitteilung („Gleich geht's los ⚽ …“). Damit ist der komplette Weg (Supabase → Apple →
   iPhone) geprüft. Die echten Erinnerungen kommen, sobald die offiziellen Anstoßzeiten
   eingetragen sind (nach der Auslosung).

> **Nach einem Update, das das Verhalten oben am Bildschirm ändert:** Das iPhone merkt
> sich manche Einstellungen beim Hinzufügen zum Home-Bildschirm. Dann das App-Symbol
> löschen, die Seite in Safari neu öffnen und erneut „Zum Home-Bildschirm“ wählen.
> Danach die Erinnerungen einmal neu einschalten.

---

## Später: Daten pflegen

| Wann                                       | Was                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| März 2027 – März 2028 (optional)           | qualifizierte / ausgeschiedene Teams                                                     |
| nach der Endrunden-Auslosung (≈ Dez. 2027) | **Auslosung**                                                                            |
| kurz danach                                | **offizielle Anstoßzeiten**                                                              |
| sobald ARD/ZDF es melden                   | **TV-Sender pro Spiel**                                                                  |
| Frühjahr 2028                              | Live-Daten prüfen: `https://api.openligadb.de/getmatchdata/em/2028` darf nicht leer sein |

Am einfachsten: die Infos (z. B. das Auslosungsergebnis) an Claude schicken. Claude trägt sie
in `src/tournament/draw.ts` bzw. `tv.ts` ein. Details stehen in [PFLEGE.md](PFLEGE.md).

## Updates am Backend

Manche App-Updates brauchen eine kleine Änderung in Supabase. Die Edge Functions laufen auch
ohne sie weiter (mit dem alten Verhalten), aber mit Update sind sie sicherer und zuverlässiger.

| Update               | SQL-Datei (im SQL-Editor ausführen)                          | Edge Functions neu einfügen    |
| -------------------- | ------------------------------------------------------------ | ------------------------------ |
| Korrektur überbrückt | `supabase/migrations/20261018120000_override_source_sig.sql` | `admin`                        |
| Härtung              | `supabase/migrations/20261018180000_haertung.sql`            | `admin`, `send-push-reminders` |
| Tipprunde            | `supabase/migrations/20261019000000_tipprunde.sql`           | `admin`                        |
| Tipps pro Runde      | `supabase/migrations/20261019120000_tipps_pro_runde.sql`     | –                              |
| Beitrittsanfragen    | `supabase/migrations/20261019180000_beitrittsanfragen.sql`   | –                              |

Edge Function neu einfügen: **Edge Functions** → Funktion öffnen → **Code** → alles ersetzen
→ **Deploy**. Danach prüfen, dass „Verify JWT“ aus ist.
