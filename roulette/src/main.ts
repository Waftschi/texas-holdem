// Oberfläche: Setzfeld, Kessel mit Kugel, Auswertung. Die Regeln stehen in rules.ts.
import { BetKey, COLOR_NAMES, Settlement, WHEEL, betName, colorOf, corner, draw, multiplier, settle, split, straight } from './rules';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const fmt = (n: number): string => n.toLocaleString('de-DE');
const signed = (n: number): string => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));

const START = 1000;
const CHIPS = [5, 25, 100, 500];
const STORE = 'roulette-v1';

type Phase = 'bet' | 'spin' | 'done';

let bank = START;
let bets: Record<BetKey, number> = {};
let log: { key: BetKey; amt: number }[] = [];
let last: Record<BetKey, number> = {};
let phase: Phase = 'bet';
let chip = 25;
let history: number[] = [];
let result: number | null = null;
let settlement: Settlement | null = null;
let wheelAngle = 0;
let ballIdx: number | null = null;
/** Auszahlung der laufenden Runde: ist schon verbucht, wird aber erst angezeigt, wenn die Kugel liegt. */
let hidden = 0;

const total = (b: Record<BetKey, number>): number => Object.values(b).reduce((s, v) => s + v, 0);

// ---------- Speicher ----------

function save(): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ bank: bank + (phase === 'bet' ? total(bets) : 0), history }));
  } catch {
    /* Speicher nicht verfügbar: Spiel läuft trotzdem */
  }
}

function load(): void {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (s && typeof s.bank === 'number' && s.bank >= 0) bank = s.bank;
    if (s && Array.isArray(s.history)) history = s.history.filter((n: unknown) => typeof n === 'number').slice(0, 14);
  } catch {
    /* ungültige Daten werden ignoriert */
  }
}

// ---------- Setzfeld ----------

const cellEls = new Map<BetKey, HTMLElement>();

function buildBoard(): void {
  const cell = (key: BetKey, cls: string, label: string, col: string, row: string, aria: string): string =>
    `<button type="button" class="cell ${cls}" data-bet="${key}" style="grid-column:${col};grid-row:${row}" aria-label="${aria}"><span class="lbl">${label}</span><span class="stack"></span></button>`;
  let html = cell('n0', 'num green', '0', '2 / 5', '1', 'Zahl 0, Grün');
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 3; c++) {
      const n = r * 3 + c + 1;
      html += cell(straight(n), `num ${colorOf(n)}`, String(n), String(c + 2), String(r + 2), `Zahl ${n}, ${COLOR_NAMES[colorOf(n)]}`);
    }
  }
  ['d1', 'd2', 'd3'].forEach((k, i) => (html += cell(k, 'side', betName(k), '1', `${2 + i * 4} / ${6 + i * 4}`, `${betName(k)}, zahlt 2 zu 1`)));
  ['low', 'even', 'red', 'black', 'odd', 'high'].forEach((k, i) => {
    const label = k === 'red' || k === 'black' ? `<i class="dia ${k}"></i>` : betName(k);
    html += cell(k, k === 'red' || k === 'black' ? '' : 'side', label, '5', `${2 + i * 2} / ${4 + i * 2}`, `${betName(k)}, zahlt 1 zu 1`);
  });
  ['c1', 'c2', 'c3'].forEach((k, i) => (html += cell(k, '', '2:1', String(i + 2), '14', `${betName(k)}, zahlt 2 zu 1`)));
  // Doppel und Viertel: kleine Tippflächen auf den Linien zwischen den Zahlen, im selben Raster wie die Zahlen.
  const hot = (key: BetKey, cls: string, col: number, row: number, aria: string): string =>
    `<button type="button" class="hot ${cls}" data-bet="${key}" style="grid-column:${col};grid-row:${row}" aria-label="${aria}"><span class="stack"></span></button>`;
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 3; c++) {
      const n = r * 3 + c + 1;
      const col = c + 2;
      const row = r + 2;
      if (r === 0) html += hot(split(0, n), 'z', col, row, `${betName(split(0, n))}, zahlt 17 zu 1`);
      if (c < 2) html += hot(split(n, n + 1), 'v', col, row, `${betName(split(n, n + 1))}, zahlt 17 zu 1`);
      if (r < 11) html += hot(split(n, n + 3), 'h', col, row, `${betName(split(n, n + 3))}, zahlt 17 zu 1`);
      if (c < 2 && r < 11) html += hot(corner(n, n + 1, n + 3, n + 4), 'q', col, row, `${betName(corner(n, n + 1, n + 3, n + 4))}, zahlt 8 zu 1`);
    }
  }
  const grid = $('grid');
  grid.innerHTML = html;
  grid.querySelectorAll<HTMLElement>('[data-bet]').forEach((el) => cellEls.set(el.dataset.bet!, el));
  grid.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-bet]');
    if (b) place(b.dataset.bet!);
  });
}

const chipClass = (amt: number): string => 'c' + ([1000, 500, 100, 25, 5].find((d) => d <= amt) ?? 5);
const short = (amt: number): string => (amt >= 10000 ? `${Math.round(amt / 1000)}k` : amt >= 1000 ? `${(amt / 1000).toFixed(1).replace('.0', '')}k` : String(amt));

// ---------- Aktionen ----------

function newRound(): void {
  bets = {};
  log = [];
  settlement = null;
  result = null;
  phase = 'bet';
  $('report').hidden = true;
  setResult();
}

function place(key: BetKey): void {
  if (phase === 'spin') return;
  if (phase === 'done') {
    if (bank < CHIPS[0]) return;
    newRound();
  }
  const amt = Math.min(chip, bank);
  if (amt <= 0) return;
  bank -= amt;
  bets[key] = (bets[key] ?? 0) + amt;
  log.push({ key, amt });
  save();
  render();
}

function undo(): void {
  const l = log.pop();
  if (!l || phase !== 'bet') return;
  bank += l.amt;
  bets[l.key] -= l.amt;
  if (bets[l.key] <= 0) delete bets[l.key];
  save();
  render();
}

function clearBets(): void {
  if (phase !== 'bet') return;
  bank += total(bets);
  bets = {};
  log = [];
  save();
  render();
}

function rebet(): void {
  if (phase === 'spin' || !total(last) || total(last) > bank) return;
  if (phase === 'done') newRound();
  else clearBets();
  for (const [key, amt] of Object.entries(last)) {
    bank -= amt;
    bets[key] = amt;
    log.push({ key, amt });
  }
  save();
  render();
}

async function spin(): Promise<void> {
  if (phase === 'done') {
    if (bank < CHIPS[0]) {
      bank = START;
      history = [];
      save();
    }
    newRound();
    render();
    return;
  }
  if (phase !== 'bet' || !total(bets)) return;
  phase = 'spin';
  last = { ...bets };
  // Ergebnis steht sofort fest und wird gespeichert, damit ein Neuladen mitten im Dreh nichts rückgängig macht.
  const n = draw();
  const s = settle(bets, n);
  bank += s.returned;
  hidden = s.returned;
  history.unshift(n);
  history = history.slice(0, 14);
  save();
  setResult('Kugel läuft …');
  render();
  await animate(WHEEL.indexOf(n));
  hidden = 0;
  result = n;
  settlement = s;
  ballIdx = WHEEL.indexOf(n);
  phase = 'done';
  setResult();
  showReport();
  render();
  drawWheel(wheelAngle, null, 0);
}

// ---------- Anzeige ----------

function describe(n: number): string {
  return n === 0 ? 'Null: alle Chancen verlieren' : `${COLOR_NAMES[colorOf(n)]} · ${n % 2 ? 'Ungerade' : 'Gerade'} · ${n <= 18 ? '1–18' : '19–36'} · ${Math.ceil(n / 12)}. Dutzend`;
}

function setResult(msg?: string): void {
  const el = $('result');
  if (msg) el.innerHTML = `<div class="hint">${msg}</div>`;
  else if (result !== null) el.innerHTML = `<div class="ball ${colorOf(result)}">${result}</div><div class="rtext"><b>${COLOR_NAMES[colorOf(result)]} ${result}</b><span>${describe(result)}</span></div>`;
  else el.innerHTML = '<div class="hint">Wähle einen Chip und tippe aufs Setzfeld. Die Punkte zwischen den Zahlen sind Doppel (2 Zahlen, 17:1) und Viertel (4 Zahlen, 8:1).</div>';
}

function showReport(): void {
  const s = settlement;
  if (!s || result === null) return;
  const n = result;
  const items = s.lines
    .map((l) => {
      const name = betName(l.key);
      if (l.won) {
        const gain = l.stake * multiplier(l.key);
        return `<li class="w"><span>${name} · Einsatz ${fmt(l.stake)}</span><b>${signed(gain)}</b><small>${n} gehört zu ${name}, zahlt ${multiplier(l.key)}:1</small></li>`;
      }
      const why = n === 0 ? 'Bei der Null verlieren alle Chancen' : `${n} gehört nicht zu ${name}`;
      return `<li class="l"><span>${name} · Einsatz ${fmt(l.stake)}</span><b>${signed(-l.stake)}</b><small>${why}</small></li>`;
    })
    .join('');
  const head = s.net > 0 ? `Du gewinnst ${fmt(s.net)}` : s.net < 0 ? `Du verlierst ${fmt(-s.net)}` : 'Unentschieden';
  const el = $('report');
  el.innerHTML = `<h3>${head}</h3><ul>${items}</ul><div class="sum">Einsatz <b>${fmt(s.staked)}</b> · Zurück <b>${fmt(s.returned)}</b> · Netto <b>${signed(s.net)}</b></div>`;
  el.hidden = false;
}

function render(): void {
  $('bank').textContent = fmt(bank - hidden);
  const done = phase === 'done';
  const delta = $('delta');
  delta.textContent = done && settlement ? signed(settlement.net) : '';
  delta.className = done && settlement ? (settlement.net > 0 ? 'up' : settlement.net < 0 ? 'down' : '') : '';
  for (const [key, el] of cellEls) {
    const amt = bets[key] ?? 0;
    const line = settlement?.lines.find((l) => l.key === key);
    el.classList.toggle('hit', done && result !== null && key === straight(result));
    el.classList.toggle('win', done && !!line?.won);
    el.classList.toggle('lose', done && !!line && !line.won);
    el.querySelector('.stack')!.innerHTML = amt > 0 ? `<span class="chip ${chipClass(amt)}">${short(amt)}</span>` : '';
  }
  for (const b of $('chips').querySelectorAll<HTMLElement>('.pick')) b.classList.toggle('sel', Number(b.dataset.v) === chip);
  const staked = total(bets);
  $('total').textContent = done && settlement ? `Netto ${signed(settlement.net)}` : `Einsatz ${fmt(staked)}`;
  const idle = phase !== 'bet';
  ($('bUndo') as HTMLButtonElement).disabled = idle || !log.length;
  ($('bClear') as HTMLButtonElement).disabled = idle || !log.length;
  ($('bRebet') as HTMLButtonElement).disabled = phase === 'spin' || !total(last) || total(last) > bank + (phase === 'bet' ? staked : 0);
  const spinBtn = $('bSpin') as HTMLButtonElement;
  if (done) {
    spinBtn.textContent = bank < CHIPS[0] ? `Neues Spiel (${fmt(START)})` : 'Neue Runde';
    spinBtn.disabled = false;
  } else {
    spinBtn.textContent = 'Drehen';
    spinBtn.disabled = phase === 'spin' || staked === 0;
  }
  $('history').innerHTML = history.slice(phase === 'spin' ? 1 : 0).map((n) => `<i class="${colorOf(n)}">${n}</i>`).join('');
  if (phase !== 'spin') drawWheel(wheelAngle, null, 0);
}

// ---------- Kessel ----------

const canvas = $<HTMLCanvasElement>('wheel');
const STEP = (2 * Math.PI) / WHEEL.length;
const POCKET_FILL = { red: '#b3262a', black: '#14181a', green: '#1f7a4c' };

/** Winkel gemessen von oben im Uhrzeigersinn. */
function drawWheel(angle: number, ballAngle: number | null, ballR: number): void {
  const dpr = window.devicePixelRatio || 1;
  const size = Math.max(160, Math.round(canvas.clientWidth * dpr));
  // Breite und Höhe getrennt prüfen: ein neues Canvas ist 300×150, bei Größe 300 stimmte sonst nur die Breite.
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext('2d')!;
  const R = size / 2;
  const rIn = R * 0.52;
  const rOut = R * 0.8;
  ctx.clearRect(0, 0, size, size);

  const rim = ctx.createRadialGradient(R, R, R * 0.8, R, R, R);
  rim.addColorStop(0, '#5a3d14');
  rim.addColorStop(1, '#2a1b08');
  ctx.beginPath();
  ctx.arc(R, R, R * 0.99, 0, 2 * Math.PI);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.lineWidth = Math.max(2, R * 0.015);
  ctx.strokeStyle = '#d3a64a';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(R, R, R * 0.96, 0, 2 * Math.PI);
  ctx.fillStyle = '#0d1512';
  ctx.fill();

  const sector = (i: number): void => {
    const a0 = angle + i * STEP - STEP / 2 - Math.PI / 2;
    const a1 = a0 + STEP;
    ctx.beginPath();
    ctx.arc(R, R, rOut, a0, a1);
    ctx.arc(R, R, rIn, a1, a0, true);
    ctx.closePath();
  };
  ctx.font = `600 ${Math.round(R * 0.08)}px 'IBM Plex Mono', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < WHEEL.length; i++) {
    const n = WHEEL[i];
    sector(i);
    ctx.fillStyle = POCKET_FILL[colorOf(n)];
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#c9a24a';
    ctx.stroke();
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(angle + i * STEP);
    ctx.fillStyle = '#f6f4ee';
    ctx.fillText(String(n), 0, -R * 0.7);
    ctx.restore();
  }

  const hub = ctx.createRadialGradient(R, R, 0, R, R, rIn);
  hub.addColorStop(0, '#3b3b3b');
  hub.addColorStop(1, '#161a18');
  ctx.beginPath();
  ctx.arc(R, R, rIn, 0, 2 * Math.PI);
  ctx.fillStyle = hub;
  ctx.fill();
  ctx.strokeStyle = '#d3a64a';
  ctx.lineWidth = Math.max(2, R * 0.02);
  for (let k = 0; k < 4; k++) {
    const a = angle + (k * Math.PI) / 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(R, R);
    ctx.lineTo(R + Math.cos(a) * rIn * 0.85, R + Math.sin(a) * rIn * 0.85);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(R, R, R * 0.07, 0, 2 * Math.PI);
  ctx.fillStyle = '#d3a64a';
  ctx.fill();

  if (phase === 'done' && ballIdx !== null) {
    sector(ballIdx);
    ctx.lineWidth = Math.max(3, R * 0.025);
    ctx.strokeStyle = '#ffd54a';
    ctx.stroke();
  }

  // Kugel: im Lauf auf der Bahn, danach im Fach der gewonnenen Zahl.
  let ba = ballAngle;
  let br = ballR;
  if (ba === null && ballIdx !== null) {
    ba = angle + ballIdx * STEP;
    br = (rIn + rOut) / 2 / R;
  }
  if (ba !== null) {
    const x = R + Math.sin(ba) * br * R;
    const y = R - Math.cos(ba) * br * R;
    const g = ctx.createRadialGradient(x - R * 0.012, y - R * 0.012, 0, x, y, R * 0.04);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#b9bdb9');
    ctx.beginPath();
    ctx.arc(x, y, R * 0.038, 0, 2 * Math.PI);
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = R * 0.03;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const smooth = (a: number, b: number, t: number): number => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

function animate(idx: number): Promise<void> {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = reduce ? 700 : 5600;
  const w0 = wheelAngle;
  const wTurn = 2 * Math.PI * 2.5;
  const ballTurns = 7;
  const pocketR = (0.52 + 0.8) / 2;
  const trackR = 0.88;
  const t0 = performance.now();
  ballIdx = null;
  return new Promise((resolve) => {
    const frame = (now: number): void => {
      const t = Math.min(1, (now - t0) / dur);
      const wa = w0 + wTurn * easeOut(t);
      // Die Kugel läuft gegen die Drehrichtung des Kessels und fällt zum Schluss ins Fach.
      const rel = idx * STEP + (1 - easeOut(t)) * 2 * Math.PI * ballTurns;
      const drop = smooth(0.62, 0.92, t);
      const bounce = t > 0.85 && t < 1 ? Math.sin((t - 0.85) * 60) * 0.02 * (1 - t) * 6 : 0;
      drawWheel(wa, wa + rel, trackR + (pocketR - trackR) * drop + bounce);
      if (t < 1) requestAnimationFrame(frame);
      else {
        wheelAngle = wa;
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

// ---------- Start ----------

function init(): void {
  load();
  buildBoard();
  $('chips').innerHTML =
    CHIPS.map((v) => `<button type="button" class="pick c${v}" data-v="${v}" aria-label="Chip ${v}">${v}</button>`).join('') + '<span class="total" id="total"></span>';
  $('chips').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.pick');
    if (!b) return;
    chip = Number(b.dataset.v);
    render();
  });
  $('bUndo').addEventListener('click', undo);
  $('bClear').addEventListener('click', clearBets);
  $('bRebet').addEventListener('click', rebet);
  $('bSpin').addEventListener('click', () => void spin());
  window.addEventListener('resize', () => {
    if (phase !== 'spin') drawWheel(wheelAngle, null, 0);
  });
  if (bank < CHIPS[0]) bank = START;
  setResult();
  render();
}

init();
