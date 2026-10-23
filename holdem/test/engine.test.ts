import { bestHand, handName, equity } from '../src/poker';
import { Game, START_STACK } from '../src/game';
import { ActCtx, Action, BOT_ITERS, STYLES, decide } from '../src/bots';

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

const card = (s: string): number => '23456789TJQKA'.indexOf(s[0]) + 13 * 'shdc'.indexOf(s[1]);
const H = (s: string): number => bestHand(s.split(' ').map(card));

// --- Handbewertung -------------------------------------------------------
check(handName(H('As Ks Qs Js Ts 2d 3c')) === 'Royal Flush', 'Royal Flush erkannt');
check(H('As Ks Qs Js Ts 2d 3c') > H('9s 8s 7s 6s 5s Ad Ac'), 'Royal > Straight Flush');
check(H('9s 8s 7s 6s 5s Ad Ac') > H('Ah Ad Ac As Kd 2c 3c'), 'Straight Flush > Vierling');
check(H('Ah Ad Ac As Kd 2c 3c') > H('Kh Kd Kc 2s 2d 3c 4c'), 'Vierling > Full House');
check(H('Kh Kd Kc 2s 2d 3c 4c') > H('Ah 9h 7h 4h 2h Kd Qc'), 'Full House > Flush');
check(H('Ah 9h 7h 4h 2h Kd Qc') > H('9s 8d 7c 6h 5s Ad Kc'), 'Flush > Straße');
check(H('9s 8d 7c 6h 5s Ad Kc') > H('Qh Qd Qc 2s 5d 9c Kh'), 'Straße > Drilling');
check(H('Qh Qd Qc 2s 5d 9c Kh') > H('Ah Ad Kh Kd 2c 3s 4d'), 'Drilling > Zwei Paare');
check(H('Ah Ad Kh Kd 2c 3s 4d') > H('Ah Ad Kc Qd Jh 3s 2c'), 'Zwei Paare > Paar');
check(H('Ah Ad Kc Qd Jh 3s 2c') > H('Ah Kd Qc Jd 9h 3s 2c'), 'Paar > Hohe Karte');
check(H('2d 3c 4h 5s 6s 9d Kc') > H('As 2d 3c 4h 5s 9d Kc'), 'Rad (A-5) schlägt 6-hoch nicht');
check(handName(H('As 2d 3c 4h 5s 9d Kc')) === 'Straße', 'Rad ist eine Straße');
check(H('Ah Ad Kh Kd Qh Qd 2c') === H('Ah Ad Kh Kd Qc 3s 2c'), 'Drei Paare: Kicker ist das dritte Paar');
check(H('Ah Ad Kh Kd Qc 3s 2c') > H('Ah Ad Kh Kd Jc 3s 2c'), 'Zwei Paare: Kicker entscheidet');
check(H('Ah Ad Kc Qd Jh 3s 2c') > H('Ah Ad Kc Qd Th 3s 2c'), 'Paar: dritter Kicker entscheidet');
check(handName(H('Ah Ad Ac Kh Kd Kc 2s')) === 'Full House', 'Zwei Drillinge ergeben Full House');
check(H('Ah Ad Ac Kh Kd Kc 2s') > H('Ah Ad Ac Qh Qd 3c 2s'), 'Bestes Full House gewinnt');
check(H('Ah Kh Qh Jh 9h 2h 3d') > H('Ah Kh Qh Jh 8h 2h 3d'), 'Flush: fünfte Karte entscheidet');
check(H('9s 8s 7s 6s 5s Ac Kd') > H('Ah Kd Qc Js Td 2c 3c'), 'Straight Flush > höhere Straße');
check(H('Ah Ad Ac 2s 2d 5c 9h') === H('Ah Ad Ac 2s 2h 5d 9c'), 'Gleiche Hände sind gleich');

// --- Monte-Carlo ---------------------------------------------------------
const eqAA = equity([card('As'), card('Ah')], [], 1, 30000);
check(Math.abs(eqAA - 0.852) < 0.02, `AA gegen 1 Zufallshand ≈ 85 % (gemessen ${(eqAA * 100).toFixed(1)} %)`);
const eq72 = equity([card('7s'), card('2h')], [], 1, 30000);
check(Math.abs(eq72 - 0.346) < 0.02, `72o gegen 1 Zufallshand ≈ 35 % (gemessen ${(eq72 * 100).toFixed(1)} %)`);
const eqNuts = equity([card('As'), card('Ks')], [card('Qs'), card('Js'), card('Ts')], 3, 2000);
check(eqNuts > 0.99, 'Royal Flush auf dem Flop gewinnt immer');

// --- Ganze Spiele: Bots und zufällige "Menschen" -------------------------
BOT_ITERS.n = 40;
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

function randomHuman(c: ActCtx): Action {
  const r = Math.random();
  if (c.canRaise && r < 0.3) {
    const k = Math.floor((c.maxTo - c.minRaiseTo) / 5);
    return { type: 'raise', to: r < 0.05 ? c.maxTo : c.minRaiseTo + 5 * rnd(0, k) };
  }
  if (c.canCheck) return { type: 'check' };
  return r < 0.65 ? { type: 'call' } : { type: 'fold' };
}

let hands = 0;
let wins = 0;
let losses = 0;
let bad = '';
for (let g = 0; g < 60 && !bad; g++) {
  const useBot = g % 2 === 0;
  const game: Game = new Game(
    {
      update() {
        const sum = game.players.reduce((s, p) => s + p.stack + p.total, 0);
        if (sum !== START_STACK * 4) bad = `Chips nicht erhalten: ${sum} (Hand ${game.handNo})`;
        for (const p of game.players) {
          if (p.stack < 0 || p.stack % 5 !== 0) bad = `Ungültiger Stack ${p.stack} bei ${p.name}`;
        }
      },
      sleep: () => Promise.resolve(),
      askHuman: (c) => Promise.resolve(useBot ? decide(c, STYLES[1]) : randomHuman(c)),
    },
    STYLES,
  );
  let guard = 0;
  while (!game.over && guard++ < 400 && !bad) {
    await game.playHand();
    hands++;
  }
  if (game.over === 'win') wins++;
  if (game.over === 'lose') losses++;
}
check(bad === '', bad || `60 Spiele (${hands} Hände) ohne Fehler, Chips immer erhalten`);
check(wins + losses > 30, `Spiele enden (${wins} Siege, ${losses} Niederlagen)`);

if (failed) process.exitCode = 1;
