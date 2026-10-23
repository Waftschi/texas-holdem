// Rauchtest: lädt die gebaute Seite in jsdom und spielt ein paar Züge über die Buttons.
// Aufruf: node holdem/test/ui-smoke.mjs dist/holdem.html   (vorher: node holdem/build.mjs)
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const html = readFileSync(process.argv[2], 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window;
const d = w.document;
const errors = [];
w.addEventListener('error', (e) => errors.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => d.getElementById(id);

let turns = 0;
let hands = 0;
const t0 = Date.now();
while (Date.now() - t0 < 90000 && (turns < 14 || hands < 2)) {
  await sleep(200);
  if (!$('nextRow').hidden) {
    hands++;
    console.log(`Hand ${hands} fertig:`, $('msg').textContent);
    $('bNext').click();
    continue;
  }
  const st = $('dockStatus').textContent;
  if (!st.startsWith('Du bist dran')) continue;
  turns++;
  console.log(
    `Zug ${turns}:`, st,
    '| Call:', $('bCall').textContent,
    '| Raise:', $('bRaise').textContent,
    '| Board:', d.querySelectorAll('#board .card').length,
    '| Hand:', d.querySelectorAll('#me .card').length,
  );
  const pick = turns % 4;
  if (pick === 1 && !$('bRaise').disabled) {
    $('bRaise').click();
    console.log('  Raise-Panel offen:', !$('raisePanel').hidden, '->', $('bRaise').textContent);
    $('presets').querySelector('[data-p="1"]')?.click();
    console.log('  Pot-Preset:', $('bRaise').textContent);
    $('bRaise').click();
  } else if (pick === 2 && !$('bFold').disabled) {
    $('bFold').click();
  } else {
    $('bCall').click();
  }
}
console.log('Hände gespielt:', hands, '| Züge:', turns);
console.log('Sitze:', d.querySelectorAll('#opps .seat').length, '| Fehler:', errors);
w.close();
process.exit(errors.length || turns < 5 ? 1 : 0);
