
// Modell „Pro Spieler“: gemischte Strategie mit variablen Einsatzgrößen, Slowplay, Check-Raise, Semi-Bluffs und Bluffs nach Position.
// Starke Hände und Bluffs nutzen dieselben Einsatzgrößen, damit die Größe nichts verrät. Der Stil des Bots (agg, bluff) färbt die Mischung.
import { bestHand, chen, equity, handCategory, rankOf } from '../poker';
import { ActCtx, Action, BOT_ITERS, Style, clamp, clampRaise, position, potRaise } from '../botkit';

const between = (a: number, b: number): number => a + Math.random() * (b - a);
const mix = (p: number): boolean => Math.random() < p;
const CHECK: Action = { type: 'check' };
const CALL: Action = { type: 'call' };

/** Stil des Charakters als Faktoren um den Normalwert 1. */
const mood = (st: Style) => ({ agg: clamp(st.agg / 0.55, 0.6, 1.6), bluff: clamp(st.bluff / 0.1, 0.4, 2) });

function preflop(ctx: ActCtx, st: Style): Action {
  const m = mood(st);
  const pos = position(ctx);
  const stackBB = (ctx.stack + ctx.bet) / ctx.bb;
  const facing = ctx.currentBet > ctx.bb;
  const free = ctx.canCheck;
  const fold: Action = free ? CHECK : { type: 'fold' };
  const call: Action = free ? CHECK : CALL;
  const odds = ctx.toCall / (ctx.pot + ctx.toCall);
  const few = clamp((3 - ctx.nOpp) * 2.2, 0, 6);
  const s = chen(ctx.hole) + st.loose * 0.6 + pos * 2 + few + (Math.random() - 0.5) * 1.6;
  const r = Math.random();
  const hasAce = ctx.hole.some((c) => rankOf(c) === 12);
  const raise = (mult: number): Action => clampRaise(ctx, ctx.currentBet * mult);

  // Kurzer Stack: schieben oder weg, nach Gewinnchance.
  if (stackBB <= 12) {
    const eq = equity(ctx.hole, [], ctx.nOpp, BOT_ITERS.n, facing ? ctx.foeLevels : undefined);
    if (facing) return eq + 0.02 > odds ? (ctx.canRaise && eq > odds + 0.15 ? { type: 'raise', to: ctx.maxTo } : call) : fold;
    const need = (1 / (ctx.nOpp + 1)) * (0.82 + 0.22 * clamp((stackBB - 3) / 9, 0, 1)) - pos * 0.03;
    return eq > need && ctx.canRaise ? { type: 'raise', to: ctx.maxTo } : free ? CHECK : fold;
  }

  if (facing) {
    const eq = equity(ctx.hole, [], ctx.nOpp, BOT_ITERS.n, ctx.foeLevels);
    const edge = eq * (ctx.nOpp + 1);
    const cost = ctx.toCall / (ctx.bet + ctx.stack);
    if (ctx.canRaise) {
      if (edge >= 2.1 && r < 0.85) return edge >= 2.6 && cost > 0.15 ? { type: 'raise', to: ctx.maxTo } : raise(between(2.7, 3.4));
      // Bluff-Reraise mit Blocker (Ass) in Position gegen Spieler, die viel folden.
      if (hasAce && pos > 0.5 && r < 0.09 * m.bluff * clamp(ctx.foldRate / 0.35, 0.5, 2)) return raise(between(2.7, 3.4));
    }
    return eq + 0.05 + pos * 0.03 > odds ? call : fold;
  }

  if (s >= 9) return ctx.canRaise ? raise(between(2.2, 3.2)) : call;
  if (s >= 6.5) return ctx.canRaise && r < 0.5 + m.agg * 0.4 ? raise(between(2.2, 3.0)) : call;
  if (s >= 4.5) {
    if (ctx.canRaise && pos >= 0.5 && r < 0.35 * m.agg) return raise(between(2.2, 2.8));
    return free || r < 0.8 ? call : fold;
  }
  if (free) return ctx.canRaise && r < 0.12 * m.bluff * (0.5 + pos) ? raise(2.5) : CHECK;
  if (ctx.toCall <= ctx.bb && r < 0.12) return CALL;
  if (ctx.canRaise && pos >= 0.65 && r < 0.2 * m.bluff * (0.5 + pos)) return raise(between(2.2, 2.8)); // Steal
  return fold;
}

function postflop(ctx: ActCtx, st: Style): Action {
  const m = mood(st);
  const eq = equity(ctx.hole, ctx.board, ctx.nOpp, BOT_ITERS.n, ctx.foeLevels);
  const eq1 = Math.pow(eq, 1 / ctx.nOpp);
  const pos = position(ctx);
  const r = Math.random();
  const heads = ctx.nOpp === 1;
  const cat = handCategory(bestHand(ctx.hole.concat(ctx.board)));
  const top = Math.max(...ctx.board.map(rankOf));
  const topPair = cat === 1 && ctx.hole.some((c) => rankOf(c) >= top && (ctx.board.some((b) => rankOf(b) === rankOf(c)) || rankOf(ctx.hole[0]) === rankOf(ctx.hole[1])));
  const strongMade = cat >= 2 || topPair;
  // Draw: schwache fertige Hand, aber nennenswerte Gewinnchance durch kommende Karten.
  const draw = !strongMade && ctx.street < 3 && eq1 >= 0.3;
  const foldy = clamp(ctx.foldRate / 0.35, 0.4, 2); // > 1: Gegner folden viel
  const odds = ctx.toCall / (ctx.pot + ctx.toCall);

  if (ctx.toCall === 0) {
    if (!ctx.canRaise) return CHECK;
    if (eq1 > 0.9) {
      // Monster: auf Flop/Turn gegen wenige Gegner gern Falle, sonst groß setzen.
      if (ctx.street < 3 && ctx.nOpp <= 2 && mix(0.3)) return CHECK;
      return potRaise(ctx, between(0.65, 1.0));
    }
    if (eq1 > 0.72) return mix(0.88) ? potRaise(ctx, between(0.45, 0.75)) : CHECK;
    if (eq1 > 0.58) return mix((pos > 0.5 ? 0.6 : 0.4) * m.agg) ? potRaise(ctx, between(0.3, 0.5)) : CHECK;
    if (draw && mix(0.5 * m.agg * (0.6 + 0.4 * m.bluff))) return potRaise(ctx, between(0.5, 0.75)); // Semi-Bluff
    if (ctx.street === 1 && ctx.wasAggressor && ctx.nOpp <= 2 && mix(0.6 * m.agg * Math.min(1.2, foldy))) return potRaise(ctx, between(0.33, 0.55)); // C-Bet
    const bluff = 0.14 * m.bluff * (0.6 + pos) * foldy * (heads ? 1 : 0.3) * (ctx.street === 3 ? 0.6 : 1);
    return mix(bluff) ? potRaise(ctx, between(0.5, 0.75)) : CHECK;
  }

  // Gegen einen Einsatz.
  if (eq1 > 0.9 && ctx.canRaise) return mix(0.7) ? potRaise(ctx, between(0.8, 1.0)) : CALL; // Check-Raise / Value-Raise, sonst Falle
  if (eq1 > 0.74 && ctx.canRaise && mix(0.25 * m.agg)) return potRaise(ctx, between(0.6, 0.8));
  if (draw && ctx.canRaise && heads && mix(0.2 * m.agg * m.bluff * Math.min(1.5, foldy))) return potRaise(ctx, 0.75); // Semi-Bluff-Raise
  const implied = (ctx.street <= 2 ? 0.04 : 0) + pos * 0.02;
  if (eq + implied > odds + (heads ? 0.01 : 0.02)) return CALL;
  // Float: schwache Hand in Position gegen kleinen Einsatz mitgehen, um später zu bluffen.
  if (heads && cat === 0 && pos > 0.6 && ctx.street <= 2 && ctx.toCall <= 0.4 * ctx.pot && mix(0.15 * m.bluff)) return CALL;
  return { type: 'fold' };
}

export function decidePro(ctx: ActCtx, st: Style): Action {
  return ctx.street === 0 ? preflop(ctx, st) : postflop(ctx, st);
}
