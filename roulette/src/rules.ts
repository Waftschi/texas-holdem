// Regeln des europäischen Roulettes (37 Fächer, eine Null). Reine Logik, ohne DOM.

/** Reihenfolge der Zahlen im Kessel, im Uhrzeigersinn. */
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type Color = 'red' | 'black' | 'green';

export const colorOf = (n: number): Color => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

export const COLOR_NAMES: Record<Color, string> = { red: 'Rot', black: 'Schwarz', green: 'Grün' };

/** Ein Feld, auf das man setzen kann: "n7" für die Zahl 7, "s4-5" für ein Doppel, "q1-2-4-5" für ein Viertel, sonst der Name der Chance. */
export type BetKey = string;

export const straight = (n: number): BetKey => `n${n}`;
export const split = (a: number, b: number): BetKey => `s${a}-${b}`;
export const corner = (a: number, b: number, c: number, d: number): BetKey => `q${a}-${b}-${c}-${d}`;

/** Die Zahlen, die ein Einsatz auf Zahl, Doppel oder Viertel abdeckt. */
const numbersOf = (key: BetKey): number[] => key.slice(1).split('-').map(Number);

export const OUTSIDE = ['low', 'even', 'red', 'black', 'odd', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3'] as const;

export const BET_NAMES: Record<string, string> = {
  low: '1–18',
  even: 'Gerade',
  red: 'Rot',
  black: 'Schwarz',
  odd: 'Ungerade',
  high: '19–36',
  d1: '1. Dutzend',
  d2: '2. Dutzend',
  d3: '3. Dutzend',
  c1: '1. Kolonne',
  c2: '2. Kolonne',
  c3: '3. Kolonne',
};

export function betName(key: BetKey): string {
  if (key[0] === 'n') return `Zahl ${key.slice(1)}`;
  if (key[0] === 's') return `Doppel ${numbersOf(key).join('/')}`;
  if (key[0] === 'q') return `Viertel ${numbersOf(key).join('/')}`;
  return BET_NAMES[key] ?? key;
}

/** Auszahlung im Verhältnis zum Einsatz (der Einsatz kommt bei einem Gewinn zusätzlich zurück). */
export function multiplier(key: BetKey): number {
  if (key[0] === 'n') return 35;
  if (key[0] === 's') return 17;
  if (key[0] === 'q') return 8;
  if (key[0] === 'd' || key[0] === 'c') return 2;
  return 1;
}

/** Gewinnt dieser Einsatz bei der gezogenen Zahl? Bei der Null verlieren alle Chancen außer der Zahl 0 selbst. */
export function wins(key: BetKey, n: number): boolean {
  if (key[0] === 'n' || key[0] === 's' || key[0] === 'q') return numbersOf(key).includes(n);
  if (n === 0) return false;
  switch (key) {
    case 'low':
      return n <= 18;
    case 'high':
      return n >= 19;
    case 'even':
      return n % 2 === 0;
    case 'odd':
      return n % 2 === 1;
    case 'red':
      return colorOf(n) === 'red';
    case 'black':
      return colorOf(n) === 'black';
    case 'd1':
      return n <= 12;
    case 'd2':
      return n >= 13 && n <= 24;
    case 'd3':
      return n >= 25;
    case 'c1':
      return n % 3 === 1;
    case 'c2':
      return n % 3 === 2;
    case 'c3':
      return n % 3 === 0;
  }
  return false;
}

export interface Line {
  key: BetKey;
  stake: number;
  won: boolean;
  /** Was zurück aufs Konto geht (Einsatz plus Gewinn), 0 bei Verlust. */
  payout: number;
}

export interface Settlement {
  lines: Line[];
  staked: number;
  returned: number;
  net: number;
}

export function settle(bets: Record<BetKey, number>, n: number): Settlement {
  const lines: Line[] = Object.entries(bets)
    .filter(([, stake]) => stake > 0)
    .map(([key, stake]) => {
      const won = wins(key, n);
      return { key, stake, won, payout: won ? stake * (multiplier(key) + 1) : 0 };
    });
  const staked = lines.reduce((s, l) => s + l.stake, 0);
  const returned = lines.reduce((s, l) => s + l.payout, 0);
  return { lines, staked, returned, net: returned - staked };
}

/** Zufallszahl 0–36 ohne Modulo-Verzerrung. */
export function draw(): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 37) * 37;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % 37;
}
