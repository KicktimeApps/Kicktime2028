export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>KickTime – kurze Unterbrechung</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #0b1122; color: #f5f7fb; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #aab3c5; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.6rem 1.1rem; border-radius: 999px; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #3ee58c; color: #0b1122; font-weight: 600; }
      .secondary { background: transparent; color: #f5f7fb; border-color: #34405e; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Kurze Spielunterbrechung</h1>
      <p>Da ist auf unserer Seite etwas schiefgelaufen. Bitte lade die Seite neu.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Neu laden</button>
        <a class="secondary" href="/">Zur Startseite</a>
      </div>
    </div>
  </body>
</html>`;
}
