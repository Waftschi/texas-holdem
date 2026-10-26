// Die Bots. Preflop: Starthand-Stärke, Position und Stack-Tiefe, gegen Erhöhungen die Gewinnchance
// gegen die Range des Erhöhers. Danach: Monte-Carlo-Gewinnchance gegen Pot-Odds. Alle Bots merken
// sich, wie oft Gegner folden und wie aggressiv sie sind, und passen Bluffs und Calls daran an.
import { chen, equity } from './poker';

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number }; // "to" = Gesamteinsatz dieser Setzrunde

/** Alles, was ein Spieler (Bot oder Mensch) vor seiner Entscheidung sieht. */
export interface ActCtx {
  hole: number[];
  board: number[];
  pot: number; // gesamter Pot inkl. aktueller Einsätze
  toCall: number; // so viel kostet das Mitgehen (höchstens der Stack)
  stack: number;
  bet: number; // bereits gesetzt in dieser Runde
  currentBet: number; // höchster Einsatz dieser Runde
  minRaiseTo: number;
  maxTo: number; // All-in
  bb: number;
  nOpp: number; // Gegner, die noch in der Hand sind
  street: number; // 0 preflop, 1 flop, 2 turn, 3 river
  canRaise: boolean;
  canCheck: boolean;
  behind: number; // Spieler, die nach mir noch handeln müssen (0 = ich bin zuletzt dran)
  foeLevels: number[]; // je Gegner: 0 unbekannt, 1 hat gesetzt, 2 hat groß gesetzt
  foldRate: number; // wie oft die Gegner im Schnitt gegen Einsätze folden (0..1)
  wasAggressor: boolean; // ich habe preflop erhöht
}

export interface Style {
  name: string;
  desc: string;
  loose: number; // spielt mehr Hände
  agg: number; // erhöht statt mitzugehen
  bluff: number; // Bluff-Häufigkeit
  brain?: (ctx: ActCtx, st: Style) => Action; // eigene Entscheidungslogik statt decide
}

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

export const BOT_ITERS = { n: 500 };

const r5 = (n: number) => Math.round(n / 5) * 5;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Erhöhung auf `to`, begrenzt auf das Erlaubte. Große Erhöhungen werden zum All-in. */
function clampRaise(ctx: ActCtx, to: number): Action {
  let t = r5(to);
  t = Math.max(ctx.minRaiseTo, Math.min(ctx.maxTo, t));
  if (ctx.maxTo - t <= ctx.bb * 2) t = ctx.maxTo;
  if (t - ctx.bet >= 0.5 * (ctx.bet + ctx.stack)) t = ctx.maxTo;
  return { type: 'raise', to: t };
}

function potRaise(ctx: ActCtx, frac: number): Action {
  return clampRaise(ctx, ctx.currentBet + frac * (ctx.pot + ctx.toCall));
}

const position = (ctx: ActCtx) => 1 - ctx.behind / Math.max(1, ctx.nOpp); // 0 = früh, 1 = Button

function preflop(ctx: ActCtx, st: Style): Action {
  const stackBB = (ctx.stack + ctx.bet) / ctx.bb;
  const pos = position(ctx);
  const s = chen(ctx.hole) + st.loose + pos * 1.5 + (Math.random() - 0.5) * 2;
  const facing = ctx.currentBet > ctx.bb; // jemand hat erhöht
  const r = Math.random();
  const call: Action = ctx.canCheck ? { type: 'check' } : { type: 'call' };
  const fold: Action = ctx.canCheck ? { type: 'check' } : { type: 'fold' };
  const open = () => clampRaise(ctx, ctx.currentBet * 3);

  // Kurzer Stack: nur All-in oder weg.
  if (stackBB <= 12) {
    const need = (facing ? 9.5 : 6.5) - (12 - stackBB) * 0.2;
    if (s >= need) return ctx.canRaise ? { type: 'raise', to: ctx.maxTo } : call;
    return fold;
  }

  if (facing) {
    // Gewinnchance gegen die Range des Erhöhers, verglichen mit den Pot-Odds.
    const eq = equity(ctx.hole, [], ctx.nOpp, BOT_ITERS.n, ctx.foeLevels);
    const edge = eq * (ctx.nOpp + 1); // 1 = durchschnittliche Hand
    const odds = ctx.toCall / (ctx.pot + ctx.toCall);
    const cost = ctx.toCall / (ctx.bet + ctx.stack);
    if (ctx.canRaise && edge >= 2.1 && r < 0.85) {
      return edge >= 2.6 && cost > 0.15 ? { type: 'raise', to: ctx.maxTo } : open();
    }
    if (eq + 0.06 + st.loose * 0.015 > odds) {
      if (ctx.canRaise && edge >= 1.6 && r < st.agg * 0.12) return open();
      return call;
    }
    if (ctx.canRaise && pos > 0.5 && r < st.bluff * 0.4) return open();
    return fold;
  }

  if (s >= 11) return ctx.canRaise ? open() : call;
  if (s >= 7.5) return ctx.canRaise && r < 0.45 + st.agg * 0.5 ? open() : call;
  if (s >= 5.5) {
    if (ctx.canRaise && pos >= 0.6 && r < st.agg * 0.45) return open();
    return ctx.canCheck || r < 0.75 + st.loose * 0.04 ? call : fold;
  }
  if (ctx.canCheck) return ctx.canRaise && r < st.bluff * (0.5 + pos) ? open() : call;
  if (ctx.toCall <= ctx.bb && r < 0.1 + st.loose * 0.06) return call;
  if (ctx.canRaise && pos >= 0.6 && r < st.bluff * (0.5 + pos)) return open();
  return fold;
}

function postflop(ctx: ActCtx, st: Style): Action {
  const eq = equity(ctx.hole, ctx.board, ctx.nOpp, BOT_ITERS.n, ctx.foeLevels);
  const eq1 = Math.pow(eq, 1 / ctx.nOpp); // entspricht der Chance gegen einen einzelnen Gegner
  const r = Math.random();
  const pos = position(ctx);
  const bluff = st.bluff * clamp(ctx.foldRate / 0.35, 0.5, 2.2); // gegen Folder öfter bluffen
  const check: Action = { type: 'check' };

  if (ctx.toCall === 0) {
    if (!ctx.canRaise) return check;
    if (eq1 > 0.9 && ctx.street === 1 && st.agg < 0.7 && r < 0.25) return check; // Falle stellen
    if (eq1 > 0.8) return r < 0.9 ? potRaise(ctx, 0.55 + Math.random() * 0.35) : check;
    if (eq1 > 0.62) return r < 0.5 + st.agg * 0.4 ? potRaise(ctx, 0.35 + Math.random() * 0.25) : check;
    if (ctx.wasAggressor && ctx.street === 1 && ctx.nOpp <= 2) {
      // Continuation-Bet: wer preflop erhöht hat, setzt auf dem Flop oft nach.
      if (eq1 > 0.45 && r < 0.75) return potRaise(ctx, 0.4 + Math.random() * 0.25);
      if (r < (ctx.nOpp === 1 ? 0.3 : 0.12) + bluff) return potRaise(ctx, 0.5);
    }
    return r < bluff * (0.5 + pos) ? potRaise(ctx, 0.5 + Math.random() * 0.2) : check;
  }

  // Gegen einen Einsatz: eq berücksichtigt bereits die engere Range des Setzers.
  const odds = ctx.toCall / (ctx.pot + ctx.toCall);
  const implied = ctx.street <= 2 ? 0.03 : 0; // auf Flop und Turn kommt noch Geld nach
  if (eq1 > 0.88 && ctx.canRaise && r < 0.7) return potRaise(ctx, 0.8);
  if (eq + implied + st.loose * 0.015 > odds + 0.02) {
    if (eq1 > 0.75 && ctx.canRaise && r < st.agg * 0.4) return potRaise(ctx, 0.6);
    return { type: 'call' };
  }
  if (ctx.canRaise && eq > 0.2 && r < bluff * 0.35) return potRaise(ctx, 0.75);
  return { type: 'fold' };
}

export function decide(ctx: ActCtx, st: Style): Action {
  return ctx.street === 0 ? preflop(ctx, st) : postflop(ctx, st);
}
