// Gemeinsame Bausteine für alle Bots und Modelle: Typen und Hilfsfunktionen für Einsätze.
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

export const BOT_ITERS = { n: 500 };

export const r5 = (n: number) => Math.round(n / 5) * 5;
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Erhöhung auf `to`, begrenzt auf das Erlaubte. Große Erhöhungen werden zum All-in. */
export function clampRaise(ctx: ActCtx, to: number): Action {
  let t = r5(to);
  t = Math.max(ctx.minRaiseTo, Math.min(ctx.maxTo, t));
  if (ctx.maxTo - t <= ctx.bb * 2) t = ctx.maxTo;
  if (t - ctx.bet >= 0.5 * (ctx.bet + ctx.stack)) t = ctx.maxTo;
  return { type: 'raise', to: t };
}

export function potRaise(ctx: ActCtx, frac: number): Action {
  return clampRaise(ctx, ctx.currentBet + frac * (ctx.pot + ctx.toCall));
}

export const position = (ctx: ActCtx) => 1 - ctx.behind / Math.max(1, ctx.nOpp); // 0 = früh, 1 = Button
