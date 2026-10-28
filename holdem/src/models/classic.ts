// Modell „Klassisch“: die ursprüngliche Entscheidungslogik der Bots, unverändert eingefroren.
import { chen, equity } from '../poker';
import { ActCtx, Action, BOT_ITERS, Style, clamp, clampRaise, position, potRaise } from '../botkit';

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

export function decideClassic(ctx: ActCtx, st: Style): Action {
  return ctx.street === 0 ? preflop(ctx, st) : postflop(ctx, st);
}
