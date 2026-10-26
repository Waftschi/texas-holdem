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

## Statistik

Der Button **Statistik** in der Kopfzeile zeigt eine Auswertung des eigenen Spiels. Pro beendeter Hand wird ein kleiner Datensatz im `localStorage` des Browsers gespeichert (Schlüssel `holdem.stats.v1`, die letzten 2000 Hände). Die Daten bleiben auf diesem Gerät. **Daten löschen** in der Statistik entfernt sie wieder.

| Kennzahl | Bedeutung |
|---|---|
| **VPIP** (Voluntarily Put money In Pot) | Anteil der Hände, in denen du preflop freiwillig Chips setzt (Call oder Raise). Blinds und Check im Big Blind zählen nicht. Hoch heißt: du spielst viele Hände (typisch 20–40 %). |
| **PFR** (PreFlop Raise) | Anteil der Hände, in denen du preflop erhöhst. Immer höchstens so hoch wie VPIP. Ein großer Abstand heißt: du gehst meist nur mit. |
| **BB** (Big Blind) | Der größere erzwungene Einsatz. „BB / Hand“ ist dein durchschnittlicher Gewinn oder Verlust pro Hand in Big Blinds, unabhängig von den steigenden Blinds. |
| **Aggression** | (Bets + Raises) ÷ Calls. Über 1,5 aggressiv, unter 0,8 passiv. |
| **Fold gegen Einsatz** | Wie oft du foldest, wenn du einem Einsatz gegenüberstehst. |
| **Showdown** | Anteil der Hände, die du bis zum Aufdecken spielst. |
| **Pot-Odds** | Preis des Calls im Verhältnis zum Pot: `zu zahlen / (Pot + zu zahlen)`. Ein Call lohnt sich, wenn die Gewinnchance (Equity) höher ist. Darauf beruhen die Hinweise zu schlechten Calls und Folds. |
| **Equity** | Deine Gewinnchance in der Hand, per Simulation geschätzt. |

Aus den Zahlen entsteht ein Stil-Etikett (z. B. „straff · aggressiv“) und einige Tipps. Unter 20 Händen zeigt die Statistik nur an, dass noch zu wenig Daten vorliegen. Der Code steht in `holdem/src/stats.ts`.

## Entwicklung

```sh
node holdem/build.mjs        # baut dist/holdem.html
node holdem/build-pwa.mjs    # baut dist/pages (index.html, Manifest, Service Worker, Icons)
node holdem/test/ui-smoke.mjs dist/holdem.html   # Rauchtest in jsdom
```
