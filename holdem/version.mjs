// Version für den Build: Hauptversion aus package.json („version“), Anzahl der Commits und Datum (ohne Uhrzeit), z. B. „v1.57+ · 03.11.2026“.
// Der Hash steckt nur im Cache-Namen. Für ein neues Hauptrelease erhöhst du die erste Zahl in package.json (z. B. 2.0.0).
// Ein „+“ hinter der Nummer heißt: beim Bauen gab es noch nicht committete Änderungen (die gebauten Dateien index.html und sw.js zählen nicht).
// Ohne Git steht „dev“ da.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args) => execSync(`git ${args}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

/** label: Text für die Anzeige; id: eindeutiger Name für den Cache des Service Workers (ändert sich bei jedem Build mit offenen Änderungen). */
export function getVersion() {
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  try {
    const major = String(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).split('.')[0] || '1';
    const count = git('rev-list --count HEAD');
    const hash = git('rev-parse --short HEAD');
    const dirty = git('status --porcelain -- . ":!index.html" ":!sw.js"') !== '';
    return {
      label: `v${major}.${count}${dirty ? '+' : ''} · ${date}`,
      id: `${major}.${count}-${hash}${dirty ? '-' + Date.now().toString(36) : ''}`,
    };
  } catch {
    return { label: `dev · ${date}`, id: 'dev-' + Date.now().toString(36) };
  }
}
