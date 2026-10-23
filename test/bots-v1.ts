// Die Bots: Preflop nach der Chen-Formel, danach nach Gewinnchance (Monte-Carlo) gegen Pot-Odds.
import { equity, rankOf, suitOf } from '../src/poker';

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
}

export interface Style {
  name: string;
  desc: string;
  loose: number; // spielt mehr Hände
  agg: number; // erhöht statt mitzugehen
  bluff: number; // Bluff-Häufigkeit
}

export const STYLES: Style[] = [
  { name: 'Marta', desc: 'vorsichtig', loose: 0, agg: 0.55, bluff: 0.05 },
  { name: 'Rico', desc: 'aggressiv', loose: 2, agg: 0.85, bluff: 0.2 },
  { name: 'Otto', desc: 'ruft viel', loose: 2.5, agg: 0.2, bluff: 0.02 },
];

export const BOT_ITERS = { n: 500 };

/** Chen-Formel: grobe Starthand-Stärke, AA = 20, 72o ≈ -1. */
export function chen(hole: number[]): number {
  const [a, b] = hole;
  const hi = Math.max(rankOf(a), rankOf(b));
  const lo = Math.min(rankOf(a), rankOf(b));
  const pts = (r: number) => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  let s = pts(hi);
  if (hi === lo) return Math.max(5, Math.ceil(s * 2));
  if (suitOf(a) === suitOf(b)) s += 2;
  const gap = hi - lo - 1;
  s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 10) s += 1;
  return Math.ceil(s);
}

const r5 = (n: number) => Math.round(n / 5) * 5;

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

function preflop(ctx: ActCtx, st: Style): Action {
  const score = chen(ctx.hole) + st.loose + (Math.random() - 0.5) * 3;
  const facing = ctx.currentBet > ctx.bb; // jemand hat erhöht
  const cost = ctx.toCall / (ctx.bet + ctx.stack); // Anteil des Stacks, den das Mitgehen kostet
  const r = Math.random();
  const call: Action = ctx.canCheck ? { type: 'check' } : { type: 'call' };
  const fold: Action = ctx.canCheck ? { type: 'check' } : { type: 'fold' };
  const open = () => clampRaise(ctx, ctx.currentBet * 3);

  if (score >= 11) {
    if (!ctx.canRaise) return call;
    if (facing && score >= 15 && cost > 0.25) return clampRaise(ctx, ctx.maxTo);
    return open();
  }
  if (score >= 8) {
    if (!facing) return ctx.canRaise && r < st.agg * 0.7 ? open() : call;
    return cost < 0.18 ? call : fold;
  }
  if (score >= 5.5) {
    if (!facing) {
      if (ctx.canRaise && r < st.agg * 0.2) return open();
      return r < 0.8 + st.loose * 0.05 ? call : fold;
    }
    return cost < 0.07 ? call : fold;
  }
  if (ctx.canCheck) return ctx.canRaise && r < st.bluff ? open() : call;
  if (!facing && ctx.toCall <= ctx.bb && r < 0.12 + st.loose * 0.08) return call;
  if (!facing && ctx.canRaise && r < st.bluff * 0.5) return open();
  return fold;
}

function postflop(ctx: ActCtx, st: Style): Action {
  let eq = equity(ctx.hole, ctx.board, ctx.nOpp, BOT_ITERS.n);
  const r = Math.random();

  if (ctx.toCall === 0) {
    if (!ctx.canRaise) return { type: 'check' };
    if (eq > 0.72) return r < 0.85 ? potRaise(ctx, 0.5 + Math.random() * 0.4) : { type: 'check' };
    if (eq > 0.5) return r < st.agg * 0.6 ? potRaise(ctx, 0.35 + Math.random() * 0.2) : { type: 'check' };
    return r < st.bluff ? potRaise(ctx, 0.5) : { type: 'check' };
  }

  // Wer setzt, hat im Schnitt mehr als eine Zufallshand.
  eq -= Math.min(0.15, (ctx.toCall / Math.max(1, ctx.pot)) * 0.1);
  const odds = ctx.toCall / (ctx.pot + ctx.toCall);
  if (eq > 0.8 && ctx.canRaise && r < 0.75) return potRaise(ctx, 0.75);
  if (eq > odds + 0.04 - st.loose * 0.02) {
    if (eq > 0.62 && ctx.canRaise && r < st.agg * 0.3) return potRaise(ctx, 0.6);
    return { type: 'call' };
  }
  if (ctx.canRaise && r < st.bluff * 0.4) return potRaise(ctx, 0.8);
  return { type: 'fold' };
}

export function decide(ctx: ActCtx, st: Style): Action {
  return ctx.street === 0 ? preflop(ctx, st) : postflop(ctx, st);
}
