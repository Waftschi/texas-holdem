// Die Bots: Spielertypen (Charaktere), Zufallsauswahl und die wählbaren Entscheidungsmodelle.
// Marta, Rico und Otto nutzen das gewählte Modell mit eigenen Parametern; Bruno, Luna und Ines haben je eine eigene Strategie.
import { chen, equity } from './poker';
import { ActCtx, Action, BOT_ITERS, Style, clampRaise, position, potRaise } from './botkit';
import { decideClassic } from './models/classic';
import { decideImproved } from './models/improved';
import { decidePro } from './models/pro';

export type { Action, ActCtx, Style } from './botkit';
export { BOT_ITERS } from './botkit';

export const STYLES: Style[] = [
  { name: 'Marta', desc: 'vorsichtig', loose: 0, agg: 0.55, bluff: 0.05 },
  { name: 'Rico', desc: 'aggressiv', loose: 2, agg: 0.85, bluff: 0.2 },
  { name: 'Otto', desc: 'ruft viel', loose: 2.5, agg: 0.2, bluff: 0.02 },
];

/** Bruno, der Maniac: setzt fast immer, auch mit Luft, und zwingt andere zum Folden. */
function maniac(ctx: ActCtx, st: Style): Action {
  const r = Math.random();
  const odds = ctx.toCall / (ctx.pot + ctx.toCall);
  if (ctx.toCall === 0) {
    if (ctx.canRaise && r < 0.7) return potRaise(ctx, 0.6 + Math.random() * 0.5);
    return { type: 'check' };
  }
  if (ctx.canRaise && r < 0.35) return potRaise(ctx, 1);
  const eq = equity(ctx.hole, ctx.board, ctx.nOpp, BOT_ITERS.n, ctx.foeLevels);
  return eq + 0.1 > odds ? { type: 'call' } : { type: 'fold' };
}

/** Luna, der Fels: spielt nur Premiumhände, setzt nur für Value und blufft nie. */
function rock(ctx: ActCtx, st: Style): Action {
  const r = Math.random();
  const call: Action = ctx.canCheck ? { type: 'check' } : { type: 'call' };
  const fold: Action = ctx.canCheck ? { type: 'check' } : { type: 'fold' };
  if (ctx.street === 0) {
    const s = chen(ctx.hole) + position(ctx);
    const facing = ctx.currentBet > ctx.bb;
    if (s >= 11) return ctx.canRaise ? clampRaise(ctx, ctx.currentBet * 3) : call;
    if (s >= 8.5 && !facing) return call;
    return fold;
  }
  const eq = equity(ctx.hole, ctx.board, ctx.nOpp, BOT_ITERS.n, ctx.foeLevels);
  const eq1 = Math.pow(eq, 1 / ctx.nOpp);
  if (ctx.toCall === 0) return ctx.canRaise && eq1 > 0.72 && r < 0.85 ? potRaise(ctx, 0.6) : { type: 'check' };
  const odds = ctx.toCall / (ctx.pot + ctx.toCall);
  if (eq1 > 0.92 && ctx.canRaise && r < 0.6) return potRaise(ctx, 0.8);
  return eq > odds + 0.08 ? { type: 'call' } : { type: 'fold' };
}

/** Ines, die Fallenstellerin: spielt starke Hände passiv und schlägt erst später zu (Check-Raise). */
function trapper(ctx: ActCtx, st: Style): Action {
  const r = Math.random();
  const call: Action = ctx.canCheck ? { type: 'check' } : { type: 'call' };
  const fold: Action = ctx.canCheck ? { type: 'check' } : { type: 'fold' };
  if (ctx.street === 0) {
    const s = chen(ctx.hole) + position(ctx);
    if (s >= 13 && ctx.canRaise && r < 0.3) return clampRaise(ctx, ctx.currentBet * 3);
    if (s >= 8) return call;
    if (s >= 5.5 && ctx.toCall <= ctx.bb) return call;
    return fold;
  }
  const eq = equity(ctx.hole, ctx.board, ctx.nOpp, BOT_ITERS.n, ctx.foeLevels);
  const eq1 = Math.pow(eq, 1 / ctx.nOpp);
  if (ctx.toCall === 0) {
    if (!ctx.canRaise) return { type: 'check' };
    if (eq1 > 0.8) return r < 0.7 ? { type: 'check' } : potRaise(ctx, 0.7); // Falle
    if (eq1 > 0.55 && r < 0.4) return potRaise(ctx, 0.3);
    return { type: 'check' };
  }
  if (eq1 > 0.85 && ctx.canRaise && r < 0.8) return potRaise(ctx, 1); // Falle schnappt zu
  const odds = ctx.toCall / (ctx.pot + ctx.toCall);
  return eq + 0.02 > odds ? { type: 'call' } : { type: 'fold' };
}

/** Weitere Spielertypen mit eigener Strategie; zusammen mit STYLES der Pool für jedes neue Spiel. */
export const EXTRA_STYLES: Style[] = [
  { name: 'Bruno', desc: 'Maniac', loose: 3.5, agg: 1, bluff: 0.5, brain: maniac },
  { name: 'Luna', desc: 'nur Premiumhände', loose: -1, agg: 0.6, bluff: 0, brain: rock },
  { name: 'Ines', desc: 'legt Fallen', loose: 1, agg: 0.3, bluff: 0.05, brain: trapper },
];

/** Zufällige, verschiedene Bots aus dem ganzen Pool. */
export function pickStyles(n = 3): Style[] {
  const pool = [...STYLES, ...EXTRA_STYLES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Ein wählbares Entscheidungsmodell für die parametrisierten Bots. */
export interface Model {
  id: string;
  name: string;
  desc: string;
  decide: (ctx: ActCtx, st: Style) => Action;
}

export const MODELS: Model[] = [
  {
    id: 'pro',
    name: 'Pro Spieler',
    desc: 'Verfeinert und tückisch: variable Einsatzgrößen, Slowplay, Check-Raise, Semi-Bluffs und Bluffs nach Position. Starke Hände und Bluffs sehen gleich aus.',
    decide: decidePro,
  },
  {
    id: 'improved',
    name: 'Verbessert',
    desc: 'Spielt mit wenigen Gegnern deutlich mehr Hände und schiebt bei kurzem Stack früher All-in.',
    decide: decideImproved,
  },
  {
    id: 'classic',
    name: 'Klassisch',
    desc: 'Die ursprüngliche Logik: feste Starthand-Schwellen, unabhängig von der Spielerzahl.',
    decide: decideClassic,
  },
];

let active: Model = MODELS.find((m) => m.id === 'improved')!;

export const getModel = (): Model => active;

/** Wählt das Modell; unbekannte Namen werden ignoriert. */
export function setModel(id: string): boolean {
  const m = MODELS.find((x) => x.id === id);
  if (!m) return false;
  active = m;
  return true;
}

export function decide(ctx: ActCtx, st: Style): Action {
  return active.decide(ctx, st);
}
