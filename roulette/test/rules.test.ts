import { WHEEL, betName, colorOf, corner, draw, multiplier, settle, split, wins } from '../src/rules';

declare const process: { exitCode?: number };

let failed = 0;
function check(cond: boolean, msg: string): void {
  if (!cond) {
    failed++;
    console.error('FAIL', msg);
  } else {
    console.log('ok  ', msg);
  }
}

check(WHEEL.length === 37 && new Set(WHEEL).size === 37, 'Kessel hat 37 verschiedene Fächer');
check([...WHEEL].sort((a, b) => a - b).every((n, i) => n === i), 'Kessel enthält 0 bis 36');
check(WHEEL.filter((n) => colorOf(n) === 'red').length === 18, '18 rote Zahlen');
check(WHEEL.filter((n) => colorOf(n) === 'black').length === 18, '18 schwarze Zahlen');

// Jede Chance muss die richtige Anzahl Zahlen abdecken.
const count = (key: string) => Array.from({ length: 37 }, (_, n) => n).filter((n) => wins(key, n)).length;
for (const k of ['low', 'high', 'even', 'odd', 'red', 'black']) check(count(k) === 18, `${betName(k)} deckt 18 Zahlen`);
for (const k of ['d1', 'd2', 'd3', 'c1', 'c2', 'c3']) check(count(k) === 12, `${betName(k)} deckt 12 Zahlen`);
check(count('n17') === 1, 'Einzelzahl deckt 1 Zahl');
check(count(split(4, 5)) === 2 && multiplier(split(4, 5)) === 17, 'Doppel deckt 2 Zahlen und zahlt 17:1');
check(wins(split(0, 2), 0) && wins(split(0, 2), 2) && !wins(split(0, 2), 1), 'Doppel mit der Null');
check(count(corner(1, 2, 4, 5)) === 4 && multiplier(corner(1, 2, 4, 5)) === 8, 'Viertel deckt 4 Zahlen und zahlt 8:1');
check(betName(split(17, 18)) === 'Doppel 17/18' && betName(corner(1, 2, 4, 5)) === 'Viertel 1/2/4/5', 'Namen für Doppel und Viertel');

check(['low', 'even', 'red', 'black', 'odd', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3', 'n0'].every((k) => !wins(k, 0) || k === 'n0'), 'Bei der Null verlieren alle Chancen');
check(wins('c1', 1) && wins('c2', 2) && wins('c3', 3) && wins('c3', 36), 'Kolonnen: 1/2/3 und 36');
check(wins('d2', 13) && wins('d2', 24) && !wins('d2', 25), 'Dutzend-Grenzen');

// Erwartungswert: jede Wette hat bei 37 Fächern denselben Hausvorteil von 1/37.
for (const k of ['n7', 'red', 'odd', 'd1', 'c2', split(7, 10), split(0, 1), corner(8, 9, 11, 12)]) {
  let ret = 0;
  for (let n = 0; n <= 36; n++) if (wins(k, n)) ret += multiplier(k) + 1;
  check(Math.abs(ret / 37 - 36 / 37) < 1e-9, `Rückzahlung ${betName(k)} = 36/37`);
}

const s = settle({ red: 25, n7: 5, d3: 10 }, 7);
check(s.staked === 40 && s.returned === 50 + 5 * 36, 'Abrechnung: Rot und Zahl 7 gewinnen, Dutzend verliert');
check(s.net === 50 + 180 - 40, 'Abrechnung: Nettogewinn');
check(settle({ red: 25 }, 0).net === -25, 'Null: Einsatz verloren');

const hits = new Array(37).fill(0);
for (let i = 0; i < 37000; i++) hits[draw()]++;
check(hits.every((h) => h > 700 && h < 1300), 'Zufall deckt alle 37 Zahlen ab');

if (failed) {
  console.error(`${failed} Test(s) fehlgeschlagen`);
  process.exitCode = 1;
} else {
  console.log('Alle Tests bestanden');
}
