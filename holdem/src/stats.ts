// Auswertung des eigenen Spiels: pro Hand ein kleiner Datensatz im localStorage, Kennzahlen werden beim Öffnen berechnet.
const KEY = 'holdem.stats.v1';
const MAX_HANDS = 2000;
const LOG_KEY = 'holdem.log.v1';

export interface HandLog {
  no: number;
  lines: string[];
}

export function saveLog(h: HandLog[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(h));
  } catch {
    /* ignorieren */
  }
}

export function loadLog(): HandLog[] {
  try {
    const a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export interface HandRec {
  vpip: number; // 1 = freiwillig Geld in den Pot (Call oder Raise preflop)
  pfr: number; // 1 = preflop erhöht
  bets: number; // Bets und Raises in der Hand
  calls: number;
  faced: number; // Einsätze, vor denen man stand
  foldedTo: number; // davon gefoldet
  badCalls: number; // Call, obwohl Gewinnchance deutlich unter den Pot-Odds
  badFolds: number; // Fold, obwohl Gewinnchance deutlich über den Pot-Odds
  sd: number; // 1 = Showdown erreicht
  win: number; // 1 = Hand mit Gewinn beendet
  net: number; // Ergebnis in Big Blinds
  chips?: number; // Ergebnis in Chips (fehlt bei älteren Datensätzen)
}

export interface Summary {
  hands: number;
  vpip: number;
  pfr: number;
  aggr: number | null; // (Bets + Raises) / Calls
  foldTo: number | null;
  showdown: number;
  winRate: number;
  bbPerHand: number;
  chips: number; // Bilanz: gewonnene minus verlorene Chips
  won: number; // Anzahl Hände im Plus
  lost: number; // Anzahl Hände im Minus
  best: number; // größter Gewinn in einer Hand
  worst: number; // größter Verlust in einer Hand
  badCalls: number;
  badFolds: number;
  name: string; // ein Name für den Spielertyp, z. B. „Fels“
  label: string;
  tips: string[];
}

const NAMES: Record<string, string> = {
  'locker|aggressiv': 'Draufgänger',
  'locker|solide': 'Zocker',
  'locker|passiv': 'Mitläufer',
  'locker|': 'Hitzkopf',
  'ausgewogen|aggressiv': 'Hai',
  'ausgewogen|solide': 'Allrounder',
  'ausgewogen|passiv': 'Beobachter',
  'ausgewogen|': 'Allrounder',
  'straff|aggressiv': 'Scharfschütze',
  'straff|solide': 'Stratege',
  'straff|passiv': 'Fels',
  'straff|': 'Fels',
};

export function loadStats(): HandRec[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export function addHand(rec: HandRec): void {
  try {
    const all = loadStats();
    all.push(rec);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX_HANDS)));
  } catch {
    /* Speicher gesperrt oder voll: das Spiel läuft trotzdem */
  }
}

export function clearStats(): boolean {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LOG_KEY);
    return true;
  } catch {
    return false;
  }
}

export function summarize(recs: HandRec[]): Summary | null {
  const n = recs.length;
  if (n === 0) return null;
  const sum = (f: (r: HandRec) => number) => recs.reduce((s, r) => s + f(r), 0);
  const calls = sum((r) => r.calls);
  const faced = sum((r) => r.faced);
  const s: Summary = {
    hands: n,
    vpip: sum((r) => r.vpip) / n,
    pfr: sum((r) => r.pfr) / n,
    aggr: calls > 0 ? sum((r) => r.bets) / calls : null,
    foldTo: faced > 0 ? sum((r) => r.foldedTo) / faced : null,
    showdown: sum((r) => r.sd) / n,
    winRate: sum((r) => r.win) / n,
    bbPerHand: sum((r) => r.net) / n,
    chips: sum((r) => r.chips ?? 0),
    won: recs.filter((r) => r.net > 0).length,
    lost: recs.filter((r) => r.net < 0).length,
    best: Math.max(0, ...recs.map((r) => r.chips ?? 0)),
    worst: Math.min(0, ...recs.map((r) => r.chips ?? 0)),
    badCalls: sum((r) => r.badCalls),
    badFolds: sum((r) => r.badFolds),
    name: '',
    label: '',
    tips: [],
  };
  if (n < 20) {
    s.label = 'Noch zu wenig Hände';
    s.tips.push('Ab etwa 20 Händen werden die Zahlen aussagekräftig.');
    return s;
  }
  const loose = s.vpip > 0.4 ? 'locker' : s.vpip < 0.2 ? 'straff' : 'ausgewogen';
  const agg = s.aggr === null ? '' : s.aggr >= 1.5 ? 'aggressiv' : s.aggr < 0.8 ? 'passiv' : 'solide';
  s.label = [loose, agg].filter(Boolean).join(' · ');
  s.name = NAMES[`${loose}|${agg}`];
  if (s.vpip > 0.4) s.tips.push('Du spielst viele Hände. Schwache Starthände früh wegzuwerfen spart Chips.');
  if (s.vpip < 0.2) s.tips.push('Du spielst sehr wenige Hände. In später Position darfst du mehr mitgehen.');
  if (s.vpip - s.pfr > 0.2) s.tips.push('Du gehst oft nur mit, statt zu erhöhen. Mit guten Händen öfter selbst erhöhen.');
  if (s.aggr !== null && s.aggr < 0.8) s.tips.push('Du callst mehr, als du setzt. Aggressiveres Spiel setzt Gegner unter Druck.');
  if (s.foldTo !== null && s.foldTo > 0.6) s.tips.push('Du foldest oft gegen Einsätze. Gegner können dich leicht ausbluffen.');
  if (s.foldTo !== null && s.foldTo < 0.25) s.tips.push('Du foldest selten gegen Einsätze. Gegen große Einsätze mit schwachen Händen ruhig aussteigen.');
  if (s.badCalls > n * 0.1) s.tips.push(`${s.badCalls}× hast du gecallt, obwohl die Gewinnchance klar unter den Pot-Odds lag.`);
  if (s.badFolds > n * 0.1) s.tips.push(`${s.badFolds}× hast du gefoldet, obwohl die Gewinnchance klar über den Pot-Odds lag.`);
  if (s.tips.length === 0) s.tips.push('Keine auffälligen Schwächen. Weiter so.');
  return s;
}
