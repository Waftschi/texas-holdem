// Vergleich: neue Bot-Logik gegen die alte, jeweils zwei Plätze pro Logik, bis nur noch einer übrig ist.
import { Game } from '../src/game';
import { ActCtx, Action, BOT_ITERS, STYLES, Style, decide } from '../src/bots';
import { decide as decideV1 } from './bots-v1';

declare const process: { argv: string[]; exitCode?: number };

type Brain = (c: ActCtx, s: Style) => Action;
BOT_ITERS.n = Number(process.argv[3] ?? 120);
const GAMES = Number(process.argv[2] ?? 120);

async function play(brains: Brain[]): Promise<number> {
  const styles = STYLES.map((s, i) => ({ ...s, brain: brains[i + 1] }));
  const game: Game = new Game(
    {
      update() {},
      sleep: () => Promise.resolve(),
      askHuman: (c) => Promise.resolve(brains[0](c, STYLES[1])),
    },
    styles,
  );
  let guard = 0;
  while (game.players.filter((p) => !p.out).length >= 2 && guard++ < 300) await game.playHand();
  const alive = game.players.filter((p) => !p.out);
  alive.sort((a, b) => b.stack - a.stack);
  return alive[0].id;
}

const NEW: Brain = decide;
const OLD: Brain = decideV1;
let newWins = 0;
let oldWins = 0;
const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  // Plätze wechseln sich ab, damit Position und Spielstil sich ausgleichen.
  const layout = g % 4 < 2 ? [NEW, OLD, NEW, OLD] : [OLD, NEW, OLD, NEW];
  const rot = g % 2 === 0 ? layout : [layout[1], layout[2], layout[3], layout[0]];
  const w = await play(rot);
  if (rot[w] === NEW) newWins++;
  else oldWins++;
}
const pct = ((newWins / GAMES) * 100).toFixed(1);
console.log(`Neu ${newWins} : ${oldWins} Alt  (${pct} % für die neue Logik, ${GAMES} Turniere, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
