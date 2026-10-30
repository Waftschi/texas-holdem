// Spielablauf: Blinds, Setzrunden, Showdown, Side-Pots. Keine DOM-Zugriffe, die UI hängt über Hooks dran.
import { bestHand, handName, newDeck } from './poker';
import { Action, ActCtx, Style, decide } from './bots';

export const START_STACK = 1000;
export const HANDS_PER_LEVEL = 10;

export type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

export interface Player {
  id: number;
  name: string;
  human: boolean;
  style?: Style;
  stack: number;
  hole: number[];
  bet: number; // Einsatz in der aktuellen Runde
  total: number; // Einsatz in dieser Hand insgesamt
  folded: boolean;
  allIn: boolean;
  out: boolean; // ausgeschieden
  acted: boolean;
  tag: string; // letzte Aktion als Text
  shown: boolean; // Karten aufgedeckt
  handLabel: string;
  score: number;
  won: number;
  lvl: number; // wie stark der Spieler in dieser Runde gesetzt hat (0 nichts, 1 gesetzt, 2 groß)
  preRaiser: boolean; // hat preflop erhöht
  buyins: number; // Anzahl Buy-ins (Cash Game: nach jedem Pleitegehen +1)
  stat: { faced: number; folded: number; bets: number; acts: number }; // Verhalten über das ganze Spiel
}

export interface Hooks {
  update(): void;
  sleep(ms: number): Promise<void>;
  askHuman(ctx: ActCtx): Promise<Action>;
}

function mk(id: number, name: string, human: boolean, style?: Style): Player {
  return {
    id,
    name,
    human,
    style,
    stack: START_STACK,
    hole: [],
    bet: 0,
    total: 0,
    folded: false,
    allIn: false,
    out: false,
    acted: false,
    tag: '',
    shown: false,
    handLabel: '',
    score: 0,
    won: 0,
    lvl: 0,
    preRaiser: false,
    buyins: 1,
    stat: { faced: 0, folded: 0, bets: 0, acts: 0 },
  };
}

export class Game {
  players: Player[];
  board: number[] = [];
  deck: number[] = [];
  dealer: number;
  handNo = 0;
  sb = 10;
  bb = 20;
  currentBet = 0;
  minRaise = 20;
  street: Street = 'idle';
  toAct = -1;
  message = '';
  handOver = false;
  showdownDone = false;
  winCards = new Set<number>();
  over: 'win' | 'lose' | 'leave' | null = null;
  /** Protokoll der letzten Hände: jede Aktion mit Einsatz, Stack und Pot, zum Nachprüfen der Chips. */
  history: { no: number; lines: string[] }[] = [];
  private lines: string[] = [];

  constructor(
    private hooks: Hooks,
    styles: Style[],
    readonly mode: 'tournament' | 'cash' = 'tournament',
  ) {
    this.players = [mk(0, 'Du', true), ...styles.map((s, i) => mk(i + 1, s.name, false, s))];
    this.dealer = this.players.length - 1;
  }

  get pot(): number {
    return this.players.reduce((s, p) => s + p.total, 0);
  }

  private live(): Player[] {
    return this.players.filter((p) => !p.out && !p.folded);
  }

  private canAct(): Player[] {
    return this.live().filter((p) => !p.allIn);
  }

  private next(from: number, ok: (p: Player) => boolean): number {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      if (ok(this.players[i])) return i;
    }
    return from;
  }

  private note(line: string): void {
    this.lines.push(line);
  }

  private stacks(): string {
    return this.players.map((p) => `${p.name} ${p.stack}`).join(', ');
  }

  private u(): void {
    this.hooks.update();
  }

  private put(p: Player, amt: number): void {
    const a = Math.min(amt, p.stack);
    p.stack -= a;
    p.bet += a;
    p.total += a;
    if (p.stack === 0) p.allIn = true;
  }

  private ctxFor(p: Player): ActCtx {
    const live = this.live();
    const toCall = Math.min(this.currentBet - p.bet, p.stack);
    const maxTo = p.bet + p.stack;
    const others = live.filter((q) => q !== p);
    const foes = others.filter((q) => !q.allIn).length;
    // Wer oft setzt, hat im Schnitt schwächere Hände: seine Range wird um eine Stufe weiter gefasst.
    const levels = others.map((q) => (q.lvl > 0 && q.stat.acts >= 8 && q.stat.bets / q.stat.acts > 0.4 ? q.lvl - 1 : q.lvl));
    const foldRate = others.reduce((s, q) => s + (q.stat.folded + 2) / (q.stat.faced + 5), 0) / Math.max(1, others.length);
    return {
      hole: p.hole,
      board: this.board,
      pot: this.pot,
      toCall,
      stack: p.stack,
      bet: p.bet,
      currentBet: this.currentBet,
      minRaiseTo: Math.min(this.currentBet + this.minRaise, maxTo),
      maxTo,
      bb: this.bb,
      nOpp: live.length - 1,
      street: Math.max(0, STREETS.indexOf(this.street)),
      canRaise: p.stack > this.currentBet - p.bet && foes > 0,
      canCheck: this.currentBet === p.bet,
      behind: others.filter((q) => !q.allIn && !q.acted).length,
      foeLevels: levels,
      foldRate,
      wasAggressor: p.preRaiser,
    };
  }

  private sanitize(a: Action, c: ActCtx): Action {
    if (a.type === 'fold' && c.canCheck) return { type: 'check' };
    if (a.type === 'check' && !c.canCheck) return { type: 'call' };
    if (a.type === 'call' && c.canCheck) return { type: 'check' };
    if (a.type === 'raise') {
      if (!c.canRaise) return c.canCheck ? { type: 'check' } : { type: 'call' };
      return { type: 'raise', to: Math.max(c.minRaiseTo, Math.min(c.maxTo, Math.round(a.to))) };
    }
    return a;
  }

  private apply(p: Player, a: Action, c: ActCtx): void {
    const before = this.currentBet;
    const who = p.name;
    p.stat.acts++;
    if (c.toCall > 0) {
      p.stat.faced++;
      if (a.type === 'fold') p.stat.folded++;
    }
    if (a.type === 'fold') {
      p.folded = true;
      p.tag = 'Fold';
      this.message = `${who}: Fold`;
    } else if (a.type === 'check') {
      p.tag = 'Check';
      this.message = `${who}: Check`;
    } else if (a.type === 'call') {
      const amt = Math.min(this.currentBet - p.bet, p.stack);
      this.put(p, amt);
      p.tag = p.allIn ? 'All-in' : 'Call';
      this.message = p.allIn ? `${who}: All-in ${p.bet}` : `${who}: Call ${amt}`;
    } else {
      this.put(p, a.to - p.bet);
      const size = p.bet - before;
      if (size >= this.minRaise) this.minRaise = size;
      this.currentBet = Math.max(this.currentBet, p.bet);
      for (const q of this.players) if (q !== p) q.acted = false;
      p.stat.bets++;
      if (this.street === 'preflop') {
        p.preRaiser = true;
        p.lvl = before > this.bb ? 2 : 1;
      } else {
        p.lvl = size / Math.max(1, c.pot) >= 0.7 ? 2 : 1;
      }
      p.tag = p.allIn ? 'All-in' : before === 0 ? 'Bet' : 'Raise';
      this.message = p.allIn ? `${who}: All-in ${p.bet}` : `${who}: ${before === 0 ? 'Bet' : 'Raise auf'} ${p.bet}`;
    }
    p.acted = true;
    this.note(`${this.street}: ${this.message} | Einsatz ${p.bet} · Stack ${p.stack} · Pot ${this.pot}`);
  }

  private async betRound(first: number): Promise<void> {
    const ps = this.players;
    const n = ps.length;
    for (const p of ps) p.acted = false;
    let i = first;
    for (;;) {
      const live = this.live();
      if (live.length <= 1) return;
      const can = live.filter((p) => !p.allIn);
      if (can.length === 0) return;
      if (can.length === 1 && can[0].bet >= this.currentBet) return;
      if (can.every((p) => p.acted && p.bet === this.currentBet)) return;

      while (ps[i].out || ps[i].folded || ps[i].allIn) i = (i + 1) % n;
      const p = ps[i];
      if (p.acted && p.bet === this.currentBet) {
        i = (i + 1) % n;
        continue;
      }

      this.toAct = i;
      this.u();
      const ctx = this.ctxFor(p);
      let a: Action;
      if (p.human) {
        a = await this.hooks.askHuman(ctx);
      } else {
        await this.hooks.sleep(450 + Math.random() * 500);
        a = (p.style!.brain ?? decide)(ctx, p.style!);
      }
      this.apply(p, this.sanitize(a, ctx), ctx);
      this.toAct = -1;
      this.u();
      await this.hooks.sleep(160);
      i = (i + 1) % n;
    }
  }

  async playHand(): Promise<void> {
    const ps = this.players;
    this.handNo++;
    // Turnier: Blinds steigen. Cash Game: feste Blinds, wer pleite ist, kauft wieder ein.
    const level = this.mode === 'cash' ? 0 : Math.min(4, Math.floor((this.handNo - 1) / HANDS_PER_LEVEL));
    this.sb = 10 * 2 ** level;
    this.bb = this.sb * 2;
    const rebuyers = this.mode === 'cash' ? ps.filter((p) => p.stack <= 0) : [];
    for (const p of rebuyers) {
      p.stack = START_STACK;
      p.buyins++;
    }
    this.lines = [];
    this.history.push({ no: this.handNo, lines: this.lines });
    if (this.history.length > 30) this.history.shift();
    this.note(`Start: ${this.stacks()} (Summe ${this.players.reduce((t, p) => t + p.stack, 0)})`);
    if (rebuyers.length) this.note(`Rebuy: ${rebuyers.map((p) => p.name).join(', ')} (je ${START_STACK})`);
    for (const p of ps) {
      p.hole = [];
      p.bet = 0;
      p.total = 0;
      p.folded = p.out;
      p.allIn = false;
      p.acted = false;
      p.tag = '';
      p.shown = false;
      p.handLabel = '';
      p.score = 0;
      p.won = 0;
      p.lvl = 0;
      p.preRaiser = false;
    }
    this.board = [];
    this.deck = newDeck();
    this.handOver = false;
    this.showdownDone = false;
    this.winCards = new Set();
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.toAct = -1;
    this.dealer = this.next(this.dealer, (p) => !p.out);

    const inHand = ps.filter((p) => !p.out);
    const sbI = inHand.length === 2 ? this.dealer : this.next(this.dealer, (p) => !p.out);
    const bbI = this.next(sbI, (p) => !p.out);

    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < ps.length; k++) {
        const p = ps[(sbI + k) % ps.length];
        if (!p.out) p.hole.push(this.deck.pop()!);
      }
    }

    this.street = 'preflop';
    this.put(ps[sbI], this.sb);
    ps[sbI].tag = 'SB';
    this.put(ps[bbI], this.bb);
    ps[bbI].tag = 'BB';
    this.currentBet = Math.max(...ps.map((p) => p.bet));
    this.note(`Blinds ${this.sb}/${this.bb}: ${ps[sbI].name} SB ${ps[sbI].bet}, ${ps[bbI].name} BB ${ps[bbI].bet}`);
    this.message = level > 0 && (this.handNo - 1) % HANDS_PER_LEVEL === 0 ? `Blinds steigen auf ${this.sb}/${this.bb}` : `Hand ${this.handNo}`;
    if (rebuyers.length) this.message += ` · ${rebuyers.map((p) => (p.human ? 'Du kaufst' : `${p.name} kauft`)).join(', ')} nach`;
    this.u();
    await this.hooks.sleep(800);

    const free = (p: Player) => !p.out && !p.folded && !p.allIn;
    for (let s = 0; s < 4; s++) {
      if (s > 0) {
        this.street = STREETS[s];
        for (const p of ps) {
          p.bet = 0;
          p.acted = false;
          p.lvl = 0;
          if (!p.folded) p.tag = p.allIn ? 'All-in' : '';
        }
        this.currentBet = 0;
        this.minRaise = this.bb;
        const cnt = s === 1 ? 3 : 1;
        for (let k = 0; k < cnt; k++) this.board.push(this.deck.pop()!);
        this.message = ['', 'Flop', 'Turn', 'River'][s];
        this.note(`${this.message}: Pot ${this.pot}`);
        this.u();
        await this.hooks.sleep(700);
      }
      const first = s === 0 ? this.next(bbI, free) : this.next(this.dealer, free);
      await this.betRound(first);
      if (this.live().length <= 1) break;
      if (this.canAct().length <= 1 && s < 3) {
        // Niemand kann mehr setzen: Karten aufdecken und Board auslaufen lassen.
        for (const p of this.live()) p.shown = true;
        this.u();
      }
    }

    if (this.live().length === 1) {
      const w = this.live()[0];
      w.won = this.pot;
      w.stack += this.pot;
    } else {
      await this.showdown();
    }
    this.finish();
  }

  private async showdown(): Promise<void> {
    const ps = this.players;
    this.street = 'showdown';
    this.showdownDone = true;
    const live = this.live();
    for (const p of live) {
      p.shown = true;
      p.score = bestHand(p.hole.concat(this.board));
      p.handLabel = handName(p.score);
    }
    this.message = 'Showdown';
    this.toAct = -1;
    this.u();
    await this.hooks.sleep(1200);

    const levels = [...new Set(ps.filter((p) => p.total > 0).map((p) => p.total))].sort((a, b) => a - b);
    let prev = 0;
    for (const L of levels) {
      let amt = 0;
      for (const p of ps) amt += Math.min(p.total, L) - Math.min(p.total, prev);
      let elig = live.filter((p) => p.total >= L);
      if (elig.length === 0) elig = live;
      this.award(amt, elig);
      prev = L;
    }
  }

  private award(amt: number, elig: Player[]): void {
    const n = this.players.length;
    const best = Math.max(...elig.map((p) => p.score));
    const ws = elig
      .filter((p) => p.score === best)
      .sort((a, b) => ((a.id - this.dealer - 1 + n) % n) - ((b.id - this.dealer - 1 + n) % n));
    const share = Math.floor(amt / ws.length / 5) * 5;
    const rest = amt - share * ws.length;
    for (const p of ws) {
      p.stack += share;
      p.won += share;
    }
    ws[0].stack += rest;
    ws[0].won += rest;
  }

  /** Die fünf Karten aus Hand + Board, die den Score des Spielers ergeben. */
  private bestFive(p: Player): number[] {
    const all = p.hole.concat(this.board);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const five = all.filter((_, k) => k !== i && k !== j);
        if (bestHand(five) === p.score) return five;
      }
    }
    return all;
  }

  private finish(): void {
    const ps = this.players;
    const winners = ps.filter((p) => p.won > 0);
    this.winCards = new Set();
    if (this.showdownDone && winners.length) {
      // Das Board zeigt nur die stärkste Gewinnerhand; weitere Gewinner (Nebenpot) markieren nur ihre eigenen Hole Cards.
      const top = winners.reduce((a, b) => (b.score > a.score ? b : a));
      for (const c of this.bestFive(top)) this.winCards.add(c);
      for (const w of winners) {
        if (w === top) continue;
        const five = this.bestFive(w);
        for (const c of w.hole) if (five.includes(c)) this.winCards.add(c);
      }
    }
    this.message = winners
      .map((w) => {
        const head = w.human ? `Du gewinnst ${w.won}` : `${w.name} gewinnt ${w.won}`;
        return this.showdownDone && w.handLabel ? `${head} · ${w.handLabel}` : head;
      })
      .join('  |  ');
    for (const p of ps) {
      p.tag = p.won > 0 ? '' : p.folded ? 'Fold' : '';
      p.bet = 0;
      p.total = 0;
    }
    const busted = ps.filter((p) => !p.out && p.stack === 0);
    if (this.mode === 'tournament') {
      for (const p of busted) p.out = true;
      if (busted.length) this.message += `  |  ${busted.map((p) => (p.human ? 'Du bist raus' : `${p.name} ist raus`)).join(', ')}`;
      if (ps[0].out) this.over = 'lose';
      else if (ps.slice(1).every((p) => p.out)) this.over = 'win';
    } else if (busted.length) {
      this.message += `  |  ${busted.map((p) => (p.human ? 'Du bist pleite' : `${p.name} ist pleite`)).join(', ')}`;
    }
    this.toAct = -1;
    this.handOver = true;
    this.note(`Ende: ${this.message}`);
    this.note(`Stacks: ${this.stacks()} (Summe ${ps.reduce((t, p) => t + p.stack, 0)})`);
    this.u();
  }
}
