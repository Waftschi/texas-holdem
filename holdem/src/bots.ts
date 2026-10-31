// Die Bots: Spielertypen (Charaktere), Zufallsauswahl und die wählbaren Entscheidungsmodelle.
// Marta, Rico und Otto nutzen das gewählte Modell mit eigenen Parametern; Bruno, Luna und Ines haben je eine eigene Strategie.
import { chen, equity } from './poker';
import { ActCtx, Action, BOT_ITERS, Style, clamp, clampRaise, position, potRaise } from './botkit';
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

/** Bruno, der Angreifer: spielt viele Hände, setzt und blufft oft, gibt aber auf, wenn Widerstand kommt und die Gewinnchance fehlt. */
function lag(ctx: ActCtx, st: Style): Action {
  const r = Math.random();
  const pos = position(ctx);
  const heads = ctx.nOpp === 1;
  const odds = ctx.toCall / (ctx.pot + ctx.toCall);
  const check: Action = { type: 'check' };
  const call: Action = ctx.canCheck ? check : { type: 'call' };
  const fold: Action = ctx.canCheck ? check : { type: 'fold' };

  if (ctx.street === 0) {
    const few = clamp((3 - ctx.nOpp) * 2.2, 0, 6);
    const sc = chen(ctx.hole) + pos * 2 + few + 1.5 + (Math.random() - 0.5) * 2;
    if (ctx.currentBet > ctx.bb) {
      // Gegen eine Erhöhung: mit guten Händen zurückschlagen, ab und zu als Bluff, sonst nach Gewinnchance mitgehen.
      const eq = equity(ctx.hole, [], ctx.nOpp, BOT_ITERS.n, ctx.foeLevels);
      if (ctx.canRaise && eq * (ctx.nOpp + 1) >= 2 && r < 0.8) return clampRaise(ctx, ctx.currentBet * 3);
      if (ctx.canRaise && pos > 0.4 && r < 0.1) return clampRaise(ctx, ctx.currentBet * 3);
      return eq + 0.08 > odds ? call : fold;
    }
    if (sc >= 7 && ctx.canRaise) return clampRaise(ctx, ctx.currentBet * (2.5 + Math.random()));
    if (sc >= 4.5 && ctx.canRaise && r < 0.6) return clampRaise(ctx, ctx.currentBet * 2.5);
    if (pos > 0.5 && ctx.canRaise && r < 0.3) return clampRaise(ctx, ctx.currentBet * 2.5); // Steal
    if (ctx.canCheck) return ctx.canRaise && r < 0.3 ? clampRaise(ctx, ctx.currentBet * 3) : check;
    return ctx.toCall <= ctx.bb && r < 0.35 ? call : fold;
  }

  const eq = equity(ctx.hole, ctx.board, ctx.nOpp, BOT_ITERS.n, ctx.foeLevels);
  const eq1 = Math.pow(eq, 1 / ctx.nOpp);
  if (ctx.toCall === 0) {
    if (!ctx.canRaise) return check;
    if (eq1 > 0.6) return r < 0.9 ? potRaise(ctx, 0.5 + Math.random() * 0.4) : check;
    if (eq1 > 0.35 && r < 0.6) return potRaise(ctx, 0.5 + Math.random() * 0.3); // Semi-Bluff
    return r < (heads ? 0.3 : 0.1) * (0.6 + pos) ? potRaise(ctx, 0.5 + Math.random() * 0.3) : check; // Bluff
  }
  if (eq1 > 0.85 && ctx.canRaise && r < 0.6) return potRaise(ctx, 0.8);
  if (eq + 0.03 > odds) return { type: 'call' };
  if (ctx.canRaise && heads && eq > 0.3 && r < 0.12) return potRaise(ctx, 0.75); // Bluff-Raise
  return { type: 'fold' };
}

/**
 * Kalle, der Betrunkene: schaut kaum auf seine Karten, geht fast immer mit, setzt und erhöht nach Laune in wilden Größen
 * und schiebt gelegentlich versehentlich alles in die Mitte. Mit kurzem Stack wird er verzweifelt und schiebt öfter.
 */
function drunk(ctx: ActCtx, st: Style): Action {
  const r = Math.random();
  const desperate = ctx.stack + ctx.bet < 15 * ctx.bb;
  const check: Action = { type: 'check' };
  const call: Action = ctx.canCheck ? check : { type: 'call' };
  if (ctx.canRaise && r < (desperate ? 0.1 : 0.03)) return { type: 'raise', to: ctx.maxTo }; // „Ups, alles drin“
  if (ctx.toCall === 0) return ctx.canRaise && r < 0.35 ? potRaise(ctx, 0.3 + Math.random() * 1.7) : check;
  // Gegen einen Einsatz: fast immer mitgehen, bei sehr großen Einsätzen gelegentlich passen.
  const big = ctx.toCall > 0.6 * ctx.pot;
  if (r < (big ? 0.35 : 0.12)) return { type: 'fold' };
  if (ctx.canRaise && r > 0.82) return potRaise(ctx, 0.3 + Math.random() * 1.5);
  return call;
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
  { name: 'Bruno', desc: 'greift an', loose: 2.5, agg: 0.9, bluff: 0.3, brain: lag },
  { name: 'Luna', desc: 'nur Premiumhände', loose: -1, agg: 0.6, bluff: 0, brain: rock },
  { name: 'Kalle', desc: 'hat einen sitzen', loose: 4, agg: 0.7, bluff: 0.3, brain: drunk },
  { name: 'Ines', desc: 'legt Fallen', loose: 1, agg: 0.3, bluff: 0.05, brain: trapper },
];

/** Zufällige, verschiedene Bots aus dem ganzen Pool. */
export function pickStyles(n = 4): Style[] {
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
