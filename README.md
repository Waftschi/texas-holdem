# Hold'em Tisch

Texas Hold'em gegen vier Bots (einstellbar auf drei), als einzelne HTML-Seite (PWA). Bei jedem neuen Spiel werden die Gegner zufällig aus zehn Charakteren gezogen. Die Tischgröße (4, 5 oder 6 Spieler) stellst du unter **Statistik → Tischgröße** ein.

## Charaktere

| Name | Typ | Spielweise |
|---|---|---|
| **Marta** | vorsichtig | Spielt wenige Hände, erhöht mäßig und blufft selten. |
| **Rico** | aggressiv | Spielt viele Hände, erhöht oft und blufft häufig. |
| **Otto** | ruft viel | Geht fast jeden Einsatz mit, erhöht kaum und blufft kaum. |
| **Bruno** | greift an | Spielt viele Hände, erhöht oft, setzt Semi-Bluffs und blufft, gibt aber auf, wenn Widerstand kommt und die Gewinnchance fehlt. |
| **Luna** | nur Premiumhände | Spielt nur starke Starthände und setzt nur für Value. Blufft nie und foldet ohne klaren Vorteil. |
| **Ines** | legt Fallen | Spielt starke Hände passiv (Check/Call) und schlägt später zu, z. B. per Check-Raise. |
| **Vera** | rechnet Odds | Spielt solide Starthände nach Position und entscheidet danach strikt nach Gewinnchance und Pot-Odds. |
| **Fritz** | klaut Blinds | Erhöht aus später Position oft mit schwachen Händen und setzt, wenn alle checken. Gibt bei Widerstand ohne Chance auf. |
| **Mia** | schiebt kurz | Mit kurzem Stack (unter 12 Big Blinds) nur Push-or-Fold, sonst straffes, ordentliches Spiel. |
| **Hans** | ausgewogen | Spielt eine ausgewogene Mischung aus Starthänden, Erhöhungen und Bluffs nach dem gewählten Bot-Modell. |

Marta, Rico, Otto und Hans nutzen dieselbe Entscheidungslogik mit unterschiedlichen Parametern (`loose`, `agg`, `bluff`). Bruno, Luna, Ines, Vera, Fritz und Mia haben jeweils eine eigene Strategie. Der Code steht in `holdem/src/bots.ts`.

## Spielmodi

Unter **Statistik → Spielmodus** wählst du den Modus. Ein Wechsel startet ein neues Spiel.

| Modus | Ablauf |
|---|---|
| **Turnier** | Die Blinds steigen alle 10 Hände. Wer alle Chips verliert, scheidet aus. Das Spiel endet, wenn nur noch einer übrig ist. Jeder Spieler zahlt **1000 Buy-in** (so viel wie dein Start-Stack), und der Sieger bekommt den ganzen Preispool (Winner takes all). Bei 5 Spielern sind das +4000 für den Sieger und −1000 für alle anderen. |
| **Cash Game** | Feste Blinds 10/20. Bei 0 Chips kaufst du (und jeder Bot) automatisch für 1000 nach. Mit **Tisch verlassen** (zwischen den Händen) beendest du das Spiel und siehst deine Bilanz. Die Kopfzeile zeigt die laufende Bilanz. |

Die Bilanz im Cash Game ist dein Stack minus alle Buy-ins; ein Rebuy zählt in der Statistik nicht als Gewinn.

In der Statistik stehen beide getrennt: die **Cash-Bilanz** (Chips aus Cash-Händen) und die **Turnier-Bilanz** (Geld aus beendeten Turnieren, mit Siegen und bestem Gewinn), dazu eine Gesamtbilanz. Ein Turnier, das du vor dem Ende abbrichst (neues Spiel, Moduswechsel, Seite neu laden), zählt nicht. Die Turnier-Bilanz wird unter `holdem.tournaments.v1` gespeichert und mit **Daten löschen** zurückgesetzt.

## Einstellungen

Unten in der **Statistik** stehen die Einstellungen. Sie werden im Browser gespeichert.

| Einstellung | Werte | Wirkung |
|---|---|---|
| **Tempo** | Langsam, Normal, Schnell | Faktor 1,5, 1 und 0,5 auf alle Wartezeiten (Denkpausen der Bots, Austeilen, Showdown). Gilt sofort, auch mitten im Spiel. |
| **Tischgröße** | 6 Spieler (du + 5 Bots), 5 Spieler (du + 4 Bots), 4 Spieler | Ein Wechsel startet ein neues Spiel. |
| **Spielmodus** | Turnier, Cash Game | Ein Wechsel startet ein neues Spiel. |
| **Bot-Modell** | Pro Spieler, Verbessert, Klassisch | Gilt ab der nächsten Entscheidung. |

## Bot-Modelle

Die Entscheidungslogik von Marta, Rico und Otto ist als Modell austauschbar. Unter **Statistik → Bot-Modell** wählst du, welches Modell sie nutzen. Die Wahl wird im Browser gespeichert und gilt ab der nächsten Entscheidung.

| Modell | Beschreibung |
|---|---|
| **Pro Spieler** | Verfeinert und tückisch: variable Einsatzgrößen, Slowplay, Check-Raise, Semi-Bluffs und Bluffs nach Position. Starke Hände und Bluffs sehen gleich aus. |
| **Verbessert** (Standard) | Spielt mit wenigen Gegnern deutlich mehr Hände und schiebt bei kurzem Stack früher All-in. |
| **Klassisch** | Die ursprüngliche Logik: feste Starthand-Schwellen, unabhängig von der Spielerzahl. |

Bruno, Luna, Ines, Vera, Fritz und Mia haben je eine eigene Strategie und bleiben vom Modell unberührt. Ein neues Modell besteht aus einer Datei in `holdem/src/models/` mit einer Funktion `(ctx, style) => Action` und einem Eintrag in `MODELS` (`holdem/src/bots.ts`). Gemeinsame Typen und Hilfsfunktionen stehen in `holdem/src/botkit.ts`.

**Gedächtnis pro Spiel:** Die Engine zählt für jeden Spieler mit, wie er in diesem Spiel spielt: freiwillig gespielte Hände (VPIP), Preflop-Raises, Bets und Calls und wie oft er nach dem Flop auf einen Einsatz foldet. Daraus entsteht für die Bots eine „Lesung“ der Gegner (`ctx.read`), die bei Normalwerten startet und nach 8 Händen gilt. „Pro Spieler“ passt sich daran an: Gegen Gegner, die fast alles callen, setzt er dünner für Value und blufft weniger. Gegen sehr aggressive geht er mit schwächeren Händen mit, gegen sehr passive nimmt er deren Einsätze ernster, und gegen Spieler, die oft folden, blufft er öfter. Das Gedächtnis beginnt bei jedem neuen Spiel leer und wird nicht gespeichert. Gemessen gewinnt Pro mit Gedächtnis gegen „Verbessert“ etwa 14 BB/100 mehr als ohne (+45 ± 8 gegen +30 ± 7). Dieser Vorteil ist nicht riesig; eine Wiederholung der Messung lohnt sich. Mit `pro-nomem` im Benchmark spielt Pro ohne Gedächtnis.

## Statistik

Der Button **Statistik** in der Kopfzeile zeigt eine Auswertung des eigenen Spiels. Pro beendeter Hand wird ein kleiner Datensatz im `localStorage` des Browsers gespeichert (Schlüssel `holdem.stats.v1`, die letzten 2000 Hände). Die Daten bleiben auf diesem Gerät. **Daten löschen** in der Statistik entfernt sie wieder.

**Filter:** Oben in der Statistik wählst du den **Modus** (Alle / Cash / Turnier) und den **Zeitraum** (alle Hände / letzte 200 / letzte 100). Name, Grade, Kennzahlen und Tipps werden dann nur aus diesen Händen berechnet, und eine Zeile zeigt den Vergleich mit allen Händen (z. B. „VPIP 38 % / 44 %“). Hinter dem VPIP steht die Schwankung durch Zufall (z. B. ±9). Die Auswahl wird gemerkt. Die gespeicherten Hände ändern sich dadurch nicht. Ältere Hände ohne Modus erscheinen nur unter „Alle“. Turnier-Bilanz und Gesamtbilanz hängen nicht vom Filter ab.

| Kennzahl | Bedeutung |
|---|---|
| **VPIP** (Voluntarily Put money In Pot) | Anteil der Hände, in denen du preflop freiwillig Chips setzt (Call oder Raise). Blinds und Check im Big Blind zählen nicht. Hoch heißt: du spielst viele Hände (typisch 20–40 %). |
| **PFR** (PreFlop Raise) | Anteil der Hände, in denen du preflop erhöhst. Immer höchstens so hoch wie VPIP. Ein großer Abstand heißt: du gehst meist nur mit. |
| **BB** (Big Blind) | Der größere erzwungene Einsatz. „Ø pro Hand“ ist dein durchschnittlicher Gewinn oder Verlust pro Hand in Big Blinds, unabhängig von den steigenden Blinds. |
| **Bilanz** | Gewonnene minus verlorene Chips über alle gespeicherten Hände, dazu Anzahl der Hände im Plus und Minus sowie größter Gewinn und Verlust in einer Hand. Ältere Datensätze ohne Chip-Angabe zählen mit 0. |
| **Aggression** | (Bets + Raises) ÷ Calls, in fünf Graden: sehr passiv (unter 0,5), passiv (bis 0,9), solide (bis 1,6), aggressiv (bis 2,6), sehr aggressiv (darüber). |
| **Fold gegen Einsatz** | Wie oft du foldest, wenn du einem Einsatz gegenüberstehst. |
| **Showdown** | Anteil der Hände, die du bis zum Aufdecken spielst. |
| **Pot-Odds** | Preis des Calls im Verhältnis zum Pot: `zu zahlen / (Pot + zu zahlen)`. Ein Call lohnt sich, wenn die Gewinnchance (Equity) höher ist. Darauf beruhen die Hinweise zu schlechten Calls und Folds. Mit eingeschalteter **Gewinnchance** steht der Wert bei einem offenen Einsatz neben deiner Gewinnchance („Gewinnchance 45 % · Pot-Odds 25 %“): Liegt die Gewinnchance darüber, lohnt sich der Call rechnerisch. |
| **Equity** | Deine Gewinnchance in der Hand, per Simulation geschätzt. |

Aus VPIP und Aggression entsteht dein Spielertyp, in je fünf Graden:

- **Spielweite (VPIP):** sehr straff (unter 18 %), straff (bis 28 %), ausgewogen (bis 42 %), locker (bis 55 %), sehr locker (darüber).
- **Aggression:** sehr passiv, passiv, solide, aggressiv, sehr aggressiv (Grenzen siehe oben).

Beide Grade ergeben 25 Typen mit Namen, zum Beispiel „Fels“ (straff · passiv), „Scharfschütze“ (straff · aggressiv), „Draufgänger“ (locker · aggressiv) oder „Maniac“ (sehr locker · sehr aggressiv). In der Statistik siehst du Name, Etikett und beide Grade als Punkte (●●●○○) plus einige Tipps. Unter 20 Händen zeigt die Statistik nur an, dass noch zu wenig Daten vorliegen. Der Code steht in `holdem/src/stats.ts`.

## Bots messen

`npm run bench -- <Format> <Anzahl> <Simulationen> <Modell A> <Modell B>` lässt zwei Modelle gegeneinander spielen (Bot gegen Bot, ohne Oberfläche, mit der echten Spiellogik). Die Plätze wechseln sich ab, die Charakterstile rotieren, und die Ausgabe enthält ein 95-%-Intervall (±).

| Format | Spiel | Ergebnis |
|---|---|---|
| `hu`, `2v2` | Turniere heads-up bzw. zwei gegen zwei | Siegquote von A |
| `cash`, `cash4` | Cash-Sessions mit 300 Händen, heads-up bzw. zu viert | Big Blinds pro 100 Hände von A |

Beispiel: `npm run bench -- cash 400 100 pro improved`. Modelle sind `pro`, `improved` und `classic`; `pro/improved` nimmt Preflop von Pro und danach Improved. Ein Modell gegen sich selbst muss etwa 0 ergeben. Im Turnier entscheidet wegen der steigenden Blinds vor allem das Schieben mit kurzem Stack; Unterschiede nach dem Flop zeigt das Cash Game besser.

Messungen (Cash, 400 Sessions, 100 Simulationen): Pro gegen Verbessert +22 ± 9 BB/100 heads-up und +7 ± 9 zu viert, Verbessert gegen Klassisch +42 ± 7, Pro gegen Klassisch +54 ± 8. Das ist Bot gegen Bot, nicht gegen einen Menschen.

## Architektur

Die Spiel-Engine (`holdem/src/game.ts`) kennt keine Oberfläche. Die Bots entscheiden über austauschbare Strategien.

| Muster | Wo | Zweck |
|---|---|---|
| **Strategy** (GoF) | `Model` und `models/` in `bots.ts`, `Style.brain` | Austauschbare Entscheidungslogik der Bots, wählbar zur Laufzeit |
| **Registry** (Lookup per Id) | `MODELS`, `setModel(id)` in `bots.ts` | Modelle unter einem Namen finden (Menü, Speicherung, Benchmark) |
| **Dependency Injection** / Ports and Adapters | `Hooks` in `game.ts` | Die Engine bekommt Oberfläche, Wartezeit und Eingaben von außen |
| **Repository** | `stats.ts` | Kapselt `localStorage` für Statistik, Verlauf und Turniere |
| **Parameter Object** | `ActCtx`, `Style` in `botkit.ts` | Bündelt alles, was ein Bot vor seiner Entscheidung sieht |
| **Template Method** (ohne Vererbung) | `playHand()` in `game.ts` | Fester Ablauf pro Hand, austauschbar sind nur die Entscheidungen |

Dependency Injection ist kein GoF-Muster, sondern eine Technik, die das Dependency-Inversion-Prinzip umsetzt. Die Auszüge unten sind gekürzt.

**Strategy und Registry** (`holdem/src/bots.ts`, `game.ts`):

```ts
export interface Model {
  id: string;
  name: string;
  decide: (ctx: ActCtx, st: Style) => Action;
}

export const MODELS: Model[] = [
  { id: 'pro', name: 'Pro Spieler', decide: decidePro },
  { id: 'improved', name: 'Verbessert', decide: decideImproved },
  { id: 'classic', name: 'Klassisch', decide: decideClassic },
];

export function setModel(id: string): boolean {
  const m = MODELS.find((x) => x.id === id);
  if (!m) return false;
  active = m;
  return true;
}

export function decide(ctx: ActCtx, st: Style): Action {
  return active.decide(ctx, st); // leitet an das gewählte Modell weiter
}

// game.ts: ein Charakter kann eine eigene Strategie mitbringen
a = (p.style!.brain ?? decide)(ctx, p.style!);
```

**Dependency Injection** (`Hooks` in `game.ts`, Adapter in `main.ts` und `test/bench.ts`):

```ts
export interface Hooks {
  update(): void;
  sleep(ms: number): Promise<void>;
  askHuman(ctx: ActCtx): Promise<Action>;
  newPlayer?(seated: Style[]): Style | null;
}

// Oberfläche
new Game({ update: () => render(), sleep, askHuman }, pickStyles(4), mode);
// Benchmark: ohne Oberfläche und ohne Wartezeit
new Game({ update() {}, sleep: () => Promise.resolve(), askHuman: (c) => Promise.resolve(brain(c, style)) }, bots, 'cash');
```

**Repository** (`stats.ts`):

```ts
export function loadStats(): HandRec[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
export function addHand(rec: HandRec): void { /* laden, anhängen, auf 2000 kürzen, speichern */ }
export function clearStats(): boolean { /* Schlüssel entfernen */ }
```

**Template Method** (`playHand()` in `game.ts`, stark gekürzt):

```ts
async playHand() {
  /* Blinds setzen, Karten geben */
  for (const street of streets) {
    /* Board aufdecken */
    await this.betRound(first); // fragt den Menschen (askHuman) oder den Bot (decide)
  }
  await this.showdown();
  this.finish();
}
```

Nicht als Muster gebaut: Die Spielphasen sind ein einfaches Enum und kein State-Pattern, und der Spielmodus (Turnier oder Cash) wird mit `if (mode === …)` unterschieden und nicht als Strategy.

## Version

Unten in der Statistik steht die Version des Builds, z. B. `v1.18+ · 03.11.2026`: Hauptversion (die erste Zahl von `version` in `package.json`, für ein neues Hauptrelease z. B. auf `2.0.0` setzen), Anzahl der Commits und Build-Datum (ohne Uhrzeit). Die Commit-Anzahl zählt bei einem neuen Hauptrelease weiter und beginnt nicht bei null. Ein `+` hinter der Nummer heißt, dass beim Bauen noch nicht committete Änderungen vorlagen (gebaute Dateien wie `index.html` zählen nicht mit). Die Nummer zeigt den letzten Commit zur Zeit des Builds. Ein committeter Build, der vor dem Commit entstand, trägt also die Nummer davor.

Der Name des Service-Worker-Caches (`holdem-<Version>-<Hash>`) enthält dieselbe Version und den kurzen Commit-Hash (er wird nicht angezeigt). Jede neue Fassung ersetzt so den alten Cache. Die Statistik liegt im `localStorage` und ist davon nicht betroffen.

## Entwicklung

```sh
node holdem/build.mjs        # baut dist/holdem.html
node holdem/build-pwa.mjs    # baut dist/pages (index.html, Manifest, Service Worker, Icons)
node holdem/test/ui-smoke.mjs dist/holdem.html   # Rauchtest in jsdom
```
