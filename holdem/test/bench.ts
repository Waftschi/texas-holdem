// Vergleich zweier Bot-Modelle (Bot gegen Bot, ohne Oberfläche). Aufruf: npm run bench -- <Format> <Anzahl> <Simulationen> <Modell A> <Modell B>
//   hu / 2v2     Turniere heads-up bzw. zwei gegen zwei; Anzahl = Turniere, Ergebnis = Siegquote von A
//   cash / cash4 Cash-Sessions mit 300 Händen heads-up bzw. zu viert; Anzahl = Sessions, Ergebnis = Big Blinds pro 100 Hände von A
// Beispiel: npm run bench -- cash 400 100 pro improved
// Modelle: ids aus MODELS (pro, improved, classic); "pro/improved" nimmt Preflop von Pro und danach Improved.
import { Game, START_STACK } from '../src/game';
import * as A from '../src/bots';

declare const process: { argv: string[] };
if (process.argv.length < 3) {
  console.log('Aufruf: npm run bench -- <hu|2v2|cash|cash4> <Anzahl> <Simulationen> <Modell A> <Modell B>');
  console.log('Modelle: ' + A.MODELS.map((m) => m.id).join(', ') + '  (Beispiel: npm run bench -- cash 400 100 pro improved)');
  throw new Error('Argumente fehlen');
}
const mode = process.argv[2];
const COUNT = Number(process.argv[3] ?? 200);
A.BOT_ITERS.n = Number(process.argv[4] ?? 100);
const idA = process.argv[5] ?? 'pro';
const idB = process.argv[6] ?? 'improved';
const HANDS = 300;

type Brain = (c: any, s: any) => any;
const byId = (x: string) => A.MODELS.find((m) => m.id === x)!;
// Misch-Modelle für Ablationstests, z. B. "pro/improved" = Preflop Pro, danach Improved.
const model = (id: string) => {
  const [pre, post] = id.split('/');
  if (!post) return byId(id);
  return { id, decide: (c: any, s: any) => (c.street === 0 ? byId(pre) : byId(post)).decide(c, s) };
};
const mA = model(idA);
const mB = model(idB);
const STY = A.STYLES;
type Seat = { brain: Brain; side: 'A' | 'B' };
const sa: Seat = { brain: mA.decide as Brain, side: 'A' };
const sb: Seat = { brain: mB.decide as Brain, side: 'B' };

function newGame(seats: Seat[], styles: any[], gm: 'tournament' | 'cash'): Game {
  const bots = styles.slice(1).map((s, i) => ({ ...s, brain: seats[i + 1].brain }));
  return new Game(
    { update() {}, sleep: () => Promise.resolve(), askHuman: (c) => Promise.resolve(seats[0].brain(c, styles[0])) },
    bots,
    gm,
  );
}

function layout(g: number): { seats: Seat[]; styles: any[] } {
  if (mode === 'hu' || mode === 'cash') {
    return { seats: g % 2 === 0 ? [sa, sb] : [sb, sa], styles: [STY[g % 3], STY[(g + 1) % 3]] };
  }
  const layouts = [[sa, sb, sa, sb], [sb, sa, sb, sa], [sa, sa, sb, sb], [sb, sb, sa, sa]];
  return { seats: layouts[g % 4], styles: [STY[g % 3], STY[(g + 1) % 3], STY[(g + 2) % 3], STY[(g + 1) % 3]] };
}

async function tournaments(): Promise<void> {
  let a = 0;
  for (let g = 0; g < COUNT; g++) {
    const { seats, styles } = layout(g);
    const game = newGame(seats, styles, 'tournament');
    let guard = 0;
    while (game.players.filter((p) => !p.out).length >= 2 && guard++ < 400) await game.playHand();
    const alive = game.players.filter((p) => !p.out).sort((x, y) => y.stack - x.stack);
    if (seats[alive[0].id].side === 'A') a++;
  }
  const p = a / COUNT;
  const se = Math.sqrt((p * (1 - p)) / COUNT);
  console.log(`${idA} vs ${idB} [${mode}]: ${a} : ${COUNT - a}  =  ${(p * 100).toFixed(1)} % ± ${(se * 196).toFixed(1)} (95 %)`);
}

async function cash(): Promise<void> {
  const res: number[] = [];
  for (let g = 0; g < COUNT; g++) {
    const { seats, styles } = layout(g);
    const game = newGame(seats, styles, 'cash');
    for (let h = 0; h < HANDS; h++) await game.playHand();
    const bal = (side: 'A' | 'B') => {
      const ps = game.players.filter((p) => seats[p.id].side === side);
      return ps.reduce((t, p) => t + p.stack - p.buyins * START_STACK, 0) / ps.length;
    };
    res.push(((bal('A') - bal('B')) / 2 / game.bb / HANDS) * 100); // BB / 100 Hände, Vorsprung von A pro Spieler gegenüber dem Mittel
  }
  const mean = res.reduce((x, y) => x + y, 0) / res.length;
  const sd = Math.sqrt(res.reduce((x, y) => x + (y - mean) ** 2, 0) / (res.length - 1));
  console.log(`${idA} vs ${idB} [${mode}]: ${mean >= 0 ? '+' : ''}${mean.toFixed(1)} BB/100 ± ${((1.96 * sd) / Math.sqrt(res.length)).toFixed(1)} (95 %), ${COUNT} Sessions à ${HANDS} Hände`);
}

(async () => {
  const t0 = Date.now();
  await (mode === 'cash' || mode === 'cash4' ? cash() : tournaments());
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
})();
