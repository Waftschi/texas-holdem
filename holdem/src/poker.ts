// Karten, Handbewertung und Monte-Carlo-Equity.
// Eine Karte ist eine Zahl 0..51: rank = c % 13 (0 = Zwei … 12 = Ass), suit = floor(c / 13).

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
// ︎ erzwingt die Text-Darstellung (kein Emoji) auf iOS.
export const SUITS = ['♠︎', '♥︎', '♦︎', '♣︎'];
export const SUIT_NAMES = ['Pik', 'Herz', 'Karo', 'Kreuz'];

export const rankOf = (c: number): number => c % 13;
export const suitOf = (c: number): number => Math.floor(c / 13);
export const isRed = (c: number): boolean => {
  const s = suitOf(c);
  return s === 1 || s === 2;
};

export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newDeck(): number[] {
  return shuffle(Array.from({ length: 52 }, (_, i) => i));
}

const BASE4 = 13 ** 4;
const BASE5 = 13 ** 5;

/** Handkategorie eines Scores: 0 Hohe Karte, 1 Paar, 2 Zwei Paare, … 8 Straight Flush. */
export const handCategory = (score: number): number => Math.floor(score / BASE5);

export const HAND_NAMES = [
  'Hohe Karte',
  'Paar',
  'Zwei Paare',
  'Drilling',
  'Straße',
  'Flush',
  'Full House',
  'Vierling',
  'Straight Flush',
];

/** Kategorie (0..8) steht ganz vorne, danach bis zu fünf Tiebreaker-Ränge in Basis 13. */
function enc(cat: number, tb: number[]): number {
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 13 + (tb[i] ?? 0);
  return v;
}

/** Höchste Karte einer Straße in einer Rang-Bitmaske, sonst -1. Das Rad (A-2-3-4-5) zählt als 5-hoch. */
function straightHigh(mask: number): number {
  for (let h = 12; h >= 4; h--) {
    const need = 0b11111 << (h - 4);
    if ((mask & need) === need) return h;
  }
  const wheel = (1 << 12) | 0b1111;
  if ((mask & wheel) === wheel) return 3;
  return -1;
}

/** Beste Fünf-Karten-Hand aus 5 bis 7 Karten. Höherer Wert = bessere Hand. */
export function bestHand(cards: number[]): number {
  const rc = new Array<number>(13).fill(0);
  const sc = [0, 0, 0, 0];
  const sm = [0, 0, 0, 0];
  let all = 0;
  for (const c of cards) {
    const r = c % 13;
    const s = (c / 13) | 0;
    rc[r]++;
    sc[s]++;
    sm[s] |= 1 << r;
    all |= 1 << r;
  }

  let fs = -1;
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
  if (fs >= 0) {
    const h = straightHigh(sm[fs]);
    if (h >= 0) return enc(8, [h]);
  }

  let quad = -1;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (rc[r] === 4) quad = r;
    else if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
  }

  const kick = (excl: number[], n: number): number[] => {
    const out: number[] = [];
    for (let r = 12; r >= 0 && out.length < n; r--) if (rc[r] > 0 && !excl.includes(r)) out.push(r);
    return out;
  };

  if (quad >= 0) return enc(7, [quad, ...kick([quad], 1)]);

  if (trips.length >= 1 && (trips.length >= 2 || pairs.length >= 1)) {
    const second = trips.length >= 2 ? Math.max(trips[1], pairs.length ? pairs[0] : -1) : pairs[0];
    return enc(6, [trips[0], second]);
  }

  if (fs >= 0) {
    const top: number[] = [];
    for (let r = 12; r >= 0 && top.length < 5; r--) if (sm[fs] & (1 << r)) top.push(r);
    return enc(5, top);
  }

  const sh = straightHigh(all);
  if (sh >= 0) return enc(4, [sh]);

  if (trips.length) return enc(3, [trips[0], ...kick([trips[0]], 2)]);
  if (pairs.length >= 2) return enc(2, [pairs[0], pairs[1], ...kick([pairs[0], pairs[1]], 1)]);
  if (pairs.length === 1) return enc(1, [pairs[0], ...kick([pairs[0]], 3)]);
  return enc(0, kick([], 5));
}

export function handName(score: number): string {
  const cat = Math.floor(score / BASE5);
  if (cat === 8 && Math.floor(score / BASE4) % 13 === 12) return 'Royal Flush';
  return HAND_NAMES[cat];
}

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

/**
 * Passt eine Gegnerhand zu jemandem, der gesetzt hat?
 * Level 0 = jede Hand, 1 = hat gesetzt oder erhöht, 2 = hat groß gesetzt oder re-raised.
 */
function inRange(a: number, b: number, board: number[], level: number): boolean {
  if (level <= 0) return true;
  if (board.length < 3) return chen([a, b]) >= (level === 1 ? 7 : 9);
  const s = bestHand([a, b].concat(board));
  const cat = Math.floor(s / BASE5);
  if (level === 1) return cat >= 1 || chen([a, b]) >= 10;
  return cat >= 2 || (cat === 1 && Math.floor(s / BASE4) % 13 >= 9);
}

/**
 * Monte-Carlo: teilt `iters`-mal zufällig Board und Gegnerhände aus und zählt,
 * wie oft `hole` gewinnt (Split-Pots zählen anteilig). Ergebnis 0..1.
 * `levels` (optional) schränkt die Hände einzelner Gegner auf deren Setz-Range ein.
 */
export function equity(hole: number[], board: number[], nOpp: number, iters: number, levels?: number[]): number {
  const used = new Set<number>([...hole, ...board]);
  const deck: number[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
  const needBoard = 5 - board.length;
  const draw = (i: number): void => {
    const j = i + Math.floor(Math.random() * (deck.length - i));
    const t = deck[i];
    deck[i] = deck[j];
    deck[j] = t;
  };
  let won = 0;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < needBoard; i++) draw(i);
    for (let o = 0; o < nOpp; o++) {
      const base = needBoard + 2 * o;
      const lv = levels?.[o] ?? 0;
      for (let t = 0; t < 40; t++) {
        draw(base);
        draw(base + 1);
        if (lv === 0 || inRange(deck[base], deck[base + 1], board, lv)) break;
      }
    }
    const full = board.concat(deck.slice(0, needBoard));
    const mine = bestHand(hole.concat(full));
    let ties = 1;
    let lost = false;
    for (let o = 0; o < nOpp; o++) {
      const a = deck[needBoard + 2 * o];
      const b = deck[needBoard + 2 * o + 1];
      const theirs = bestHand([a, b].concat(full));
      if (theirs > mine) {
        lost = true;
        break;
      }
      if (theirs === mine) ties++;
    }
    if (!lost) won += 1 / ties;
  }
  return won / iters;
}
