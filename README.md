# TheaterComplex: digital edition

TheaterComplex is a two-sided U.S. Army War College wargame (v13, Europe Edition). Staff officers run a Theater Army (Fourth or Tenth Army) across the competition-to-conflict continuum.

**Play online: https://toddklinger.me/TheaterComplex-Tabletop/game/** (the free-form tabletop is at https://toddklinger.me/TheaterComplex-Tabletop/). The site is GitHub Pages serving this repository's `master` branch, so every push updates it within a minute or two.

This repo contains two ways to play:

| | What it is | Open |
|---|---|---|
| **Digital edition** | A rules-enforcing card game with a guided tutorial, an AI opponent, two-player modes (one screen or online), a Rules Codex and autosave. | `game/index.html` |
| Free-form tabletop | The original drag-and-drop virtual table. Nothing is enforced. | `index.html` |

Both run straight from the file system: double-click the HTML file. There's no build step and no server.

## Playing the digital edition

- **Tutorial**: one guided turn as Fourth Army against the AI. A coach points at each part of the screen and waits for you to act.
- **New campaign**: play Fourth or Tenth Army against the AI, play two people on one screen (planning is hidden behind a hand-off screen), play two people online, or watch AI vs AI.
- **Online play**: the host picks **Two players online**, sends the invite code to the opponent, and pastes back the reply code the opponent's **Join online game** screen produces. The two browsers then talk directly; there is no game server. The host advances the game between phases, and plans are only exchanged once both players have submitted. It needs a network that allows direct browser-to-browser connections; some locked-down networks do not. If the connection drops, the host makes a new invite from the menu and the campaign carries on.
- **Table view** (▦ in the top bar): the current position drawn as it would look on the physical table, with the real mats, tracker cards and markers, capability cards in their columns (sideways when committed), dice on the Defense Readiness mats, and the points and turn tracker. The AI opponent comes in three styles: **Recruit** (plans fewer tasks; best for a first game), **Regular**, and **Aggressive** (the strongest: it also plays Disruption against you and moves its combat units to the deterrence level that pays best in each zone; it beats Regular 84 to 28 over 120 simulated campaigns). Regular and Aggressive put their effort where a zone is still in play. In 600 simulated campaigns Fourth Army wins 334 and Tenth Army 244 (58% of decided games): each army nearly always wins its home zone, and Fourth's home zone pays slightly more. An optional **balance setting** on the setup screen gives Tenth Army a head start; 2 points makes it even (286 to 290). It is off by default and not in the rulebook.
- **Help while you play**: a "Your move" line in the side panel always says what to click next. During planning, ★ marks suggested task cards with their best zone, and **Suggest a plan** fills empty task slots for you. The end-of-year panel shows where each army's points came from, with tips for next year and your score against **par** (what the AI averages with your army at that turn).
- **Forgiving and explained**: **Undo** (button or Ctrl+Z) takes back your last commitment until the next dice roll. Blocked cards say what they are missing. Each crisis ends with a one-line verdict on why you won or lost the zone. Click the score to see where every point came from. Short tips appear the first time you meet even-turn decay, Disruption, violent crises, over-tasking and RFF arrivals.
- **Keyboard and touch**: Enter presses the highlighted button, Tab reaches every card and button, arrow keys walk along the cards, Esc closes dialogs. On a touch screen the first tap on a card shows what it does and the second tap opens it.
- **Records for analysis**: the menu and the end screen export the adjudicator log as a spreadsheet (CSV, one row per log line) and the whole campaign as structured data (JSON: settings, who played, every turn's tasks, crises, scores and trackers, the log, and each human player's decisions with timings: cards looked at, tasks added, removed and changed, use of Suggest a plan, undos).
- **Menu (☰)**: sound on/off, first-time tips on/off, colour-blind marks (arrows and shapes back up every colour cue), named save slots, and save files you can download or send. In a hot-seat game no save file can be made during planning, because it would hold both secret plans; it is available again once both are submitted.
- **Rules Codex**: the rulebook reorganized for play. It includes the die legend, the crisis table, all 21 task cards, the order of battle, and every rules clarification.

The game automates the adjudicator. It handles the task-limit and ASOS draws, checks staff, MSC and capability requirements, over-tasking rolls, initiative, Disruption, Influence spending, all of Crisis Assessment (Intelligence, Communications and Protection advantages, scoring), force tailoring with RFF, RSOI and SecWar, and even-turn decay.

## Project layout

```
game/
  index.html            entry point
  css/game.css
  js/data.generated.js  GENERATED from the workbook (do not edit)
  js/data.js            names, labels and settings
  js/rules.js           pure rules: dice legend, deterrence, instability, requirement checks
  js/engine.js          turn/phase state machine and every player action
  js/ai.js              heuristic AI commander
  js/ui*.js, planner.js, crisis.js, codex.js, tutorial.js   interface
  js/extras.js          undo, tips, score breakdown, sound, save slots, touch support
  js/tabletop.js        table view (the position on the printed mats and trackers)
  js/net.js             online play between two browsers
  js/rules.generated.js GENERATED from data/rules.json (do not edit)
  js/baseline.generated.js  GENERATED AI averages for "par" (do not edit)
  data/rules.json       task cards, starting values, crisis table: edit this
  data/rules.schema.json    what rules.json may contain
  tools/build_rules.js  checks rules.json and writes js/rules.generated.js
  tools/baseline.js     AI-vs-AI baseline report and par scores
  tools/analyze.js      classifies players from exported campaign records
  fonts/                bundled fonts, so the game looks the same offline
  img/                  web-sized card art (GENERATED from assets/)
  tests/run.js          rules tests + full AI-vs-AI campaign simulation
  tests/playthrough.py  clicks through whole campaigns in a headless browser
  tests/online.py       two browsers connect and play each other
tools/
  build_data.py         workbook -> game/js/data.generated.js
  build_assets.py       assets/*.png -> game/img/*.webp
  capability_art_index.csv  links each workbook capability row to its card art
docs/rules-verification.md  source cross-check, discrepancies, open design questions
```

## Changing the game

- **Card stats** (capabilities, ASOS, staff, MSCs, tracker legend): edit `dig_game_database_master.xlsx`, then run `python tools/build_data.py`.
- **Card art**: replace files in `assets/`, then run `python tools/build_assets.py`.
- **Task requirements, starting values, Crisis Assessment table**: edit `game/data/rules.json`, then run `node game/tools/build_rules.js`. It checks the file first and says where a mistake is. See [docs/data-format.md](docs/data-format.md).
- **Tests**: `node game/tests/run.js [games]` checks the die legend against the printed cards, the starting deterrence against Enclosure 2, and the rule edge cases. It then plays full AI-vs-AI campaigns and checks invariants after every step.
- **Online test**: `python game/tests/online.py` connects two headless browsers with the invite and reply codes and plays two turns, checking after every phase that both hold the same game and that no plan leaks before both have submitted.
- **Screen tests**: `python game/tests/playthrough.py` (needs `pip install playwright` and `playwright install chromium`) plays a 4-turn campaign in each mode in a headless browser and fails on any page error or stall. Add `all 390x844` to run it at phone size.

## Analysing games

- **Baseline**: `node game/tools/baseline.js [games]` plays AI-vs-AI campaigns and writes [docs/ai-baseline.md](docs/ai-baseline.md): what the AI plays, where, and what its winning sides did differently. It also refreshes the par scores the game shows.
- **Players**: export a **Campaign record** from the menu or end screen of each game, put the files in a folder, and run `node game/tools/analyze.js <folder> --csv players.csv`. Each player gets a row with where they played (home, centre, objective), how (dice, advantages, Influence and Access), traits such as Disruptor or Escalation risk, how they decided (planning time per turn, plan changes, reliance on suggestions, cards inspected), and their score against par. The labels are simple documented thresholds, meant to start a discussion.

## Open design questions

[docs/questions-for-designers.md](docs/questions-for-designers.md) is a one-page list for the War College: eight rulings the digital game had to guess at, and three findings from simulation.


See [docs/rules-verification.md](docs/rules-verification.md). The Crisis Assessment table isn't in the rulebook; the game uses the one from the adjudicator's sheet ([docs/img/crisis-assessment-sheet.png](docs/img/crisis-assessment-sheet.png)).
