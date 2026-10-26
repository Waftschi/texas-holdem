// Oberfläche: rendert den Spielzustand ins DOM und gibt dem Menschen die Buttons.
import { Game, Player } from './game';
import { Action, ActCtx, pickStyles } from './bots';
import { HandRec, addHand, clearStats, loadStats, summarize } from './stats';
import { RANKS, SUITS, SUIT_NAMES, bestHand, equity, handName, isRed, rankOf, suitOf } from './poker';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const fmt = (n: number): string => n.toLocaleString('de-DE');
const r5 = (n: number): number => Math.round(n / 5) * 5;

let game: Game;
let humanCtx: ActCtx | null = null;
let humanResolve: ((a: Action) => void) | null = null;
let nextResolve: (() => void) | null = null;
let raiseOpen = false;
let raiseTo = 0;
let eqOn = false;
let eqKey = '';
let eqVal: number | null = null;
let lastHand = -1;
// Schutz vor Doppel-Taps: Eingaben direkt nach dem Freischalten der Buttons oder dem Öffnen des Raise-Reglers zählen nicht.
const TAP_GUARD_MS = 450;
let armedAt = 0;
let raiseOpenedAt = 0;
const guarded = (since: number): boolean => performance.now() - since < TAP_GUARD_MS;
const seen = new Set<string>();
let rec: HandRec = newRec();

function newRec(): HandRec {
  return { vpip: 0, pfr: 0, bets: 0, calls: 0, faced: 0, foldedTo: 0, badCalls: 0, badFolds: 0, sd: 0, win: 0, net: 0 };
}

/** Hält fest, was der Mensch in dieser Hand getan hat. */
function record(c: ActCtx, a: Action): void {
  if (a.type === 'raise') {
    rec.bets++;
    if (c.street === 0) rec.pfr = rec.vpip = 1;
  } else if (a.type === 'call') {
    rec.calls++;
    if (c.street === 0) rec.vpip = 1;
  }
  if (c.toCall <= 0) return;
  rec.faced++;
  if (a.type === 'fold') rec.foldedTo++;
  if (a.type === 'raise') return;
  const nOpp = Math.max(1, c.nOpp);
  const eq = equity(c.hole, c.board, nOpp, 300, c.foeLevels);
  const odds = c.toCall / (c.pot + c.toCall);
  if (a.type === 'call' && eq < odds - 0.05) rec.badCalls++;
  if (a.type === 'fold' && eq > odds + 0.1) rec.badFolds++;
}

// ---------- Bausteine ----------

function cardHTML(c: number, key: string, size: string): string {
  const k = 'u' + key;
  const fresh = !seen.has(k);
  seen.add(k);
  const s = suitOf(c);
  const r = RANKS[rankOf(c)];
  const hi = game.handOver && game.winCards.size ? (game.winCards.has(c) ? ' hi' : ' dim') : '';
  return `<div class="card ${size}${isRed(c) ? ' red' : ''}${fresh ? ' deal' : ''}${hi}" role="img" aria-label="${r} ${SUIT_NAMES[s]}"><b class="rk">${r}</b><i class="st">${SUITS[s]}</i><i class="big">${SUITS[s]}</i></div>`;
}

function backHTML(key: string, size: string): string {
  const k = 'd' + key;
  const fresh = !seen.has(k);
  seen.add(k);
  return `<div class="card back ${size}${fresh ? ' deal' : ''}" aria-hidden="true"></div>`;
}

const DENOMS = [1000, 500, 100, 25, 5];

function chipsHTML(amount: number): string {
  if (amount <= 0) return '';
  let rest = amount;
  const cols: string[] = [];
  for (const d of DENOMS) {
    const n = Math.min(5, Math.floor(rest / d));
    rest -= Math.floor(rest / d) * d;
    if (n <= 0) continue;
    let chips = '';
    for (let i = 0; i < n; i++) chips += `<i class="chip c${d}" style="bottom:${i * 4}px"></i>`;
    cols.push(`<span class="col" style="height:${11 + (n - 1) * 4 + 2}px">${chips}</span>`);
  }
  return `<span class="chips" aria-hidden="true">${cols.join('')}</span>`;
}

function seatHTML(p: Player): string {
  const g = game;
  const turn = g.toAct === p.id && !g.handOver && !g.over;
  const cls = ['seat', p.folded && !p.out ? 'folded' : '', p.out ? 'out' : '', turn ? 'turn' : '', p.won > 0 ? 'winner' : '']
    .filter(Boolean)
    .join(' ');
  let cards = '';
  if (!p.out && !p.folded) {
    cards = p.hole
      .map((c, i) => (p.shown ? cardHTML(c, `p${p.id}h${i}`, 'sm') : backHTML(`p${p.id}h${i}`, 'sm')))
      .join('');
  }
  const tag = p.out ? 'raus' : turn ? '…' : p.won > 0 ? `+${fmt(p.won)}` : p.tag;
  const dealer = g.handNo > 0 && g.dealer === p.id ? '<b class="dbtn" title="Dealer">D</b>' : '';
  return `<div class="${cls}"><div class="nm"><span>${p.name}</span>${dealer}</div><div class="ds">${p.style?.desc ?? ''}</div><div class="stk">${fmt(p.stack)}</div><div class="cards">${cards}</div><div class="tg">${tag}</div><div class="hl">${p.shown && !p.folded ? p.handLabel : ''}</div><div class="bt">${chipsHTML(p.bet)}${p.bet > 0 ? `<span>${fmt(p.bet)}</span>` : ''}</div></div>`;
}

function renderMe(): void {
  const g = game;
  const p = g.players[0];
  const turn = g.toAct === 0 && !g.handOver && !g.over;
  const el = $('me');
  el.className = ['me', p.folded && !p.out ? 'folded' : '', turn ? 'turn' : '', p.won > 0 ? 'winner' : ''].filter(Boolean).join(' ');
  const cards = p.out ? '' : p.hole.map((c, i) => cardHTML(c, `p0h${i}`, 'lg')).join('');
  let label = '';
  if (!p.out && !p.folded) {
    if (g.handOver && p.handLabel) label = p.handLabel;
    else if (!g.handOver && g.board.length >= 3) label = handName(bestHand(p.hole.concat(g.board)));
  }
  const live = !p.out && !p.folded && !g.handOver && p.hole.length === 2;
  const eq = eqOn && live ? (eqVal === null ? 'Gewinnchance …' : `Gewinnchance ${Math.round(eqVal * 100)} %`) : '';
  const tag = p.won > 0 ? `+${fmt(p.won)}` : p.tag;
  const dealer = g.handNo > 0 && g.dealer === 0 ? '<b class="dbtn" title="Dealer">D</b>' : '';
  el.innerHTML = `<div class="cards">${cards}</div><div class="me-info"><div class="nm"><span>Du</span>${dealer}</div><div class="stk">${fmt(p.stack)}</div><div class="tg">${tag}</div><div class="bt">${chipsHTML(p.bet)}${p.bet > 0 ? `<span>${fmt(p.bet)}</span>` : ''}</div><div class="hl">${label}</div><div class="eq">${eq}</div></div>`;
}

function streetLabel(): string {
  const g = game;
  if (g.handOver) return g.showdownDone ? 'Showdown' : 'Hand beendet';
  return { idle: '', preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' }[g.street];
}

// ---------- Dock ----------

function presetTo(c: ActCtx, frac: number): number {
  return Math.max(c.minRaiseTo, Math.min(c.maxTo, r5(c.currentBet + frac * (c.pot + c.toCall))));
}

function renderDock(): void {
  const g = game;
  const me = g.players[0];
  const acts = $('acts');
  const nextRow = $('nextRow');
  const panel = $('raisePanel');
  const status = $('dockStatus');
  const bFold = $<HTMLButtonElement>('bFold');
  const bCall = $<HTMLButtonElement>('bCall');
  const bRaise = $<HTMLButtonElement>('bRaise');

  if (g.over) {
    acts.hidden = true;
    nextRow.hidden = true;
    panel.hidden = true;
    status.textContent = '';
    return;
  }
  if (g.handOver) {
    acts.hidden = true;
    panel.hidden = true;
    nextRow.hidden = false;
    status.textContent = `Hand ${g.handNo} beendet`;
    return;
  }
  acts.hidden = false;
  nextRow.hidden = true;

  const c = humanCtx;
  if (!c) {
    panel.hidden = true;
    bFold.disabled = true;
    bCall.disabled = true;
    bRaise.disabled = true;
    bFold.textContent = 'Fold';
    bCall.textContent = 'Call';
    bRaise.textContent = 'Raise';
    if (me.folded) status.textContent = 'Du hast gefoldet. Die Hand läuft weiter …';
    else if (g.toAct > 0) status.textContent = `${g.players[g.toAct].name} überlegt …`;
    else status.textContent = '';
    return;
  }

  status.textContent = `Du bist dran · ${c.canCheck ? 'kein Einsatz offen' : 'zu zahlen ' + fmt(c.toCall)} · Pot ${fmt(c.pot)}`;
  bFold.disabled = c.canCheck;
  bFold.textContent = 'Fold';
  bCall.disabled = false;
  bCall.textContent = c.canCheck ? 'Check' : c.toCall >= c.stack ? `All-in ${fmt(c.stack)}` : `Call ${fmt(c.toCall)}`;

  const single = c.minRaiseTo >= c.maxTo; // nur All-in als Erhöhung möglich
  const verb = c.currentBet === 0 ? 'Bet' : 'Raise';
  bRaise.disabled = !c.canRaise;
  panel.hidden = !(raiseOpen && c.canRaise && !single);
  if (!c.canRaise) bRaise.textContent = verb;
  else if (single) bRaise.textContent = `All-in ${fmt(c.maxTo)}`;
  else if (raiseOpen) bRaise.textContent = raiseTo >= c.maxTo ? `All-in ${fmt(c.maxTo)}` : `${verb} auf ${fmt(raiseTo)}`;
  else bRaise.textContent = verb;

  if (!panel.hidden) {
    const slider = $<HTMLInputElement>('slider');
    slider.min = String(c.minRaiseTo);
    slider.max = String(c.maxTo);
    slider.step = '5';
    slider.value = String(raiseTo);
    $('raiseOut').textContent = fmt(raiseTo);
  }
}

function act(a: Action): void {
  if (!humanResolve || guarded(armedAt)) return;
  const r = humanResolve;
  if (humanCtx) record(humanCtx, a);
  humanResolve = null;
  humanCtx = null;
  raiseOpen = false;
  r(a);
  render();
}

function askHuman(ctx: ActCtx): Promise<Action> {
  humanCtx = ctx;
  raiseOpen = false;
  armedAt = performance.now();
  return new Promise((res) => {
    humanResolve = res;
    render();
  });
}

// ---------- Gewinnchance (Monte-Carlo) ----------

function maybeEquity(): void {
  if (!eqOn) return;
  const g = game;
  const me = g.players[0];
  if (me.out || me.folded || me.hole.length < 2 || g.handOver) return;
  const nOpp = g.players.filter((p) => p.id !== 0 && !p.out && !p.folded).length;
  if (nOpp === 0) return;
  const key = `${me.hole.join()}|${g.board.join()}|${nOpp}`;
  if (key === eqKey) return;
  eqKey = key;
  eqVal = null;
  setTimeout(() => {
    if (key !== eqKey) return;
    eqVal = equity(me.hole, g.board, nOpp, 2500);
    render();
  }, 30);
}

// ---------- Rendern ----------

function render(): void {
  const g = game;
  if (g.handNo !== lastHand) {
    seen.clear();
    lastHand = g.handNo;
    eqKey = '';
    eqVal = null;
  }
  $('blinds').textContent = `Blinds ${g.sb}/${g.bb}`;
  $('handno').textContent = g.handNo > 0 ? `Hand ${g.handNo}` : 'Gleich geht’s los';
  $('street').textContent = streetLabel();

  let board = '';
  for (let i = 0; i < 5; i++) board += g.board[i] !== undefined ? cardHTML(g.board[i], `b${i}`, 'md') : '<div class="slot"></div>';
  $('board').innerHTML = board;

  const collected = g.players.reduce((s, p) => s + p.total - p.bet, 0);
  $('pot').innerHTML = `${chipsHTML(collected)}<span class="amt">Pot ${fmt(g.pot)}</span>`;
  $('msg').textContent = g.message;

  $('opps').innerHTML = g.players.slice(1).map(seatHTML).join('');
  renderMe();
  renderDock();

  const over = $('over');
  over.hidden = !g.over;
  if (g.over) {
    $('overTitle').textContent = g.over === 'win' ? 'Du hast alle Chips.' : 'Deine Chips sind weg.';
    $('overSub').textContent =
      g.over === 'win' ? `Alle drei Bots sind raus, nach ${g.handNo} Händen.` : `Ausgeschieden nach ${g.handNo} Händen.`;
  }
  maybeEquity();
}

// ---------- Ablauf ----------

function speed(): number {
  const me = game.players[0];
  return (me.folded || me.out) && !game.handOver ? 0.25 : 1;
}

function waitNext(): Promise<void> {
  armedAt = performance.now();
  return new Promise((res) => {
    nextResolve = res;
  });
}

async function run(): Promise<void> {
  const g = new Game(
    {
      update: () => render(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms * speed())),
      askHuman,
    },
    pickStyles(),
  );
  game = g;
  humanCtx = null;
  humanResolve = null;
  render();
  await new Promise((r) => setTimeout(r, 500));
  while (!g.over) {
    rec = newRec();
    const before = g.players[0].stack;
    await g.playHand();
    const me = g.players[0];
    rec.chips = me.stack - before;
    rec.net = rec.chips / g.bb;
    rec.win = me.stack > before ? 1 : 0;
    rec.sd = g.showdownDone && !me.folded ? 1 : 0;
    addHand(rec);
    render();
    if (g.over) break;
    await waitNext();
  }
}

// ---------- Eingaben ----------

$('bFold').addEventListener('click', () => act({ type: 'fold' }));
$('bCall').addEventListener('click', () => act(humanCtx?.canCheck ? { type: 'check' } : { type: 'call' }));
$('bRaise').addEventListener('click', () => {
  const c = humanCtx;
  if (!c || !c.canRaise) return;
  if (c.minRaiseTo >= c.maxTo) return act({ type: 'raise', to: c.maxTo });
  if (!raiseOpen) {
    raiseOpen = true;
    raiseOpenedAt = performance.now();
    raiseTo = presetTo(c, 0.5);
    render();
    return;
  }
  if (guarded(raiseOpenedAt)) return;
  act({ type: 'raise', to: raiseTo });
});
$('slider').addEventListener('input', (e) => {
  raiseTo = Number((e.target as HTMLInputElement).value);
  renderDock();
});
$('bClose').addEventListener('click', () => {
  raiseOpen = false;
  renderDock();
});
$('minus').addEventListener('click', () => {
  const c = humanCtx;
  if (!c) return;
  raiseTo = Math.max(c.minRaiseTo, raiseTo - game.bb);
  renderDock();
});
$('plus').addEventListener('click', () => {
  const c = humanCtx;
  if (!c) return;
  raiseTo = Math.min(c.maxTo, raiseTo + game.bb);
  renderDock();
});
$('presets').addEventListener('click', (e) => {
  const c = humanCtx;
  const b = (e.target as HTMLElement).closest('button');
  if (!c || !b) return;
  const p = b.dataset.p;
  raiseTo = p === 'min' ? c.minRaiseTo : p === 'max' ? c.maxTo : presetTo(c, Number(p));
  renderDock();
});
$('bNext').addEventListener('click', () => {
  if (guarded(armedAt)) return;
  const r = nextResolve;
  nextResolve = null;
  r?.();
});
function showStats(): void {
  const s = summarize(loadStats());
  const signed = (n: number) => (n > 0 ? '+' : '') + fmt(n);
  const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)} %`);
  $('statsBody').innerHTML = s
    ? `${s.name ? `<p class="name">${s.name}</p>` : ''}<p class="label">${s.label}</p>
<dl>
<dt>Hände</dt><dd>${s.hands}</dd>
<dt>Gespielt (VPIP)</dt><dd>${pct(s.vpip)}</dd>
<dt>Preflop erhöht (PFR)</dt><dd>${pct(s.pfr)}</dd>
<dt>Aggression</dt><dd>${s.aggr === null ? '–' : s.aggr.toFixed(1)}</dd>
<dt>Fold gegen Einsatz</dt><dd>${pct(s.foldTo)}</dd>
<dt>Showdown</dt><dd>${pct(s.showdown)}</dd>
<dt>Hände gewonnen</dt><dd>${pct(s.winRate)}</dd>
<dt>Bilanz</dt><dd class="${s.chips >= 0 ? 'plus' : 'minus'}">${signed(s.chips)} Chips</dd>
<dt>Hände im Plus / Minus</dt><dd>${s.won} / ${s.lost}</dd>
<dt>Größter Gewinn / Verlust</dt><dd>${signed(s.best)} / ${signed(s.worst)}</dd>
<dt>Ø pro Hand</dt><dd>${s.bbPerHand >= 0 ? '+' : ''}${s.bbPerHand.toFixed(2)} BB</dd>
</dl>
<p class="hint">BB = Big Blind, der größere Pflichteinsatz. „Ø pro Hand“ ist dein durchschnittlicher Gewinn (+) oder Verlust (−) pro Hand, gemessen in Big Blinds. So bleibt der Wert vergleichbar, auch wenn die Blinds steigen.</p>
<ul>${s.tips.map((t) => `<li>${t}</li>`).join('')}</ul>`
    : '<p>Noch keine Daten. Spiel ein paar Hände.</p>';
  $<HTMLButtonElement>('bClear').disabled = !s;
  $('stats').hidden = false;
}
$('bStats').addEventListener('click', showStats);
$('bStatsClose').addEventListener('click', () => ($('stats').hidden = true));
$('bClear').addEventListener('click', () => {
  if (!confirm('Alle gespeicherten Statistiken löschen?')) return;
  if (clearStats()) showStats();
  else alert('Löschen nicht möglich: Der Browser-Speicher ist gesperrt.');
});
$('bNew').addEventListener('click', () => {
  seen.clear();
  lastHand = -1;
  run();
});
$<HTMLInputElement>('eqToggle').addEventListener('change', (e) => {
  eqOn = (e.target as HTMLInputElement).checked;
  eqKey = '';
  eqVal = null;
  render();
});

run();
