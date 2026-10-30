# Hold'em Tisch

Texas Hold'em gegen drei Bots, als einzelne HTML-Seite (PWA). Bei jedem neuen Spiel werden die drei Gegner zufällig aus sechs Charakteren gezogen.

## Charaktere

| Name | Typ | Spielweise |
|---|---|---|
| **Marta** | vorsichtig | Spielt wenige Hände, erhöht mäßig und blufft selten. |
| **Rico** | aggressiv | Spielt viele Hände, erhöht oft und blufft häufig. |
| **Otto** | ruft viel | Geht fast jeden Einsatz mit, erhöht kaum und blufft kaum. |
| **Bruno** | Maniac | Setzt oder erhöht in rund 70 % der Fälle, auch mit schwachen Händen, und re-raist oft. Ruft nur, wenn die Gewinnchance zu den Pot-Odds passt. |
| **Luna** | nur Premiumhände | Spielt nur starke Starthände und setzt nur für Value. Blufft nie und foldet ohne klaren Vorteil. |
| **Ines** | legt Fallen | Spielt starke Hände passiv (Check/Call) und schlägt später zu, z. B. per Check-Raise. |

Marta, Rico und Otto nutzen dieselbe Entscheidungslogik mit unterschiedlichen Parametern (`loose`, `agg`, `bluff`). Bruno, Luna und Ines haben jeweils eine eigene Strategie. Der Code steht in `holdem/src/bots.ts`.

## Bot-Modelle

Die Entscheidungslogik von Marta, Rico und Otto ist als Modell austauschbar. Unter **Statistik → Bot-Modell** wählst du, welches Modell sie nutzen. Die Wahl wird im Browser gespeichert und gilt ab der nächsten Entscheidung.

| Modell | Beschreibung |
|---|---|
| **Verbessert** (Standard) | Spielt mit wenigen Gegnern deutlich mehr Hände und schiebt bei kurzem Stack früher All-in. |
| **Klassisch** | Die ursprüngliche Logik: feste Starthand-Schwellen, unabhängig von der Spielerzahl. |

Bruno, Luna und Ines haben je eine eigene Strategie und bleiben vom Modell unberührt. Ein neues Modell besteht aus einer Datei in `holdem/src/models/` mit einer Funktion `(ctx, style) => Action` und einem Eintrag in `MODELS` (`holdem/src/bots.ts`). Gemeinsame Typen und Hilfsfunktionen stehen in `holdem/src/botkit.ts`.

## Statistik

Der Button **Statistik** in der Kopfzeile zeigt eine Auswertung des eigenen Spiels. Pro beendeter Hand wird ein kleiner Datensatz im `localStorage` des Browsers gespeichert (Schlüssel `holdem.stats.v1`, die letzten 2000 Hände). Die Daten bleiben auf diesem Gerät. **Daten löschen** in der Statistik entfernt sie wieder.

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

## Entwicklung

```sh
node holdem/build.mjs        # baut dist/holdem.html
node holdem/build-pwa.mjs    # baut dist/pages (index.html, Manifest, Service Worker, Icons)
node holdem/test/ui-smoke.mjs dist/holdem.html   # Rauchtest in jsdom
```
