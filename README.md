# TheaterComplex: digital edition

TheaterComplex is a two-sided U.S. Army War College wargame (v13, Europe Edition). Staff officers run a Theater Army (Fourth or Tenth Army) across the competition-to-conflict continuum.

This repo contains two ways to play:

| | What it is | Open |
|---|---|---|
| **Digital edition** | A rules-enforcing card game with a guided tutorial, an AI opponent, hot-seat two-player mode, a Rules Codex and autosave. | `game/index.html` |
| Free-form tabletop | The original drag-and-drop virtual table. Nothing is enforced. | `index.html` |

Both run straight from the file system: double-click the HTML file. There's no build step and no server.

## Playing the digital edition

- **Tutorial**: one guided turn as Fourth Army against the AI. A coach points at each part of the screen and waits for you to act.
- **New campaign**: play Fourth or Tenth Army against the AI, play two people on one screen (planning is hidden behind a hand-off screen), or watch AI vs AI.
- **Rules Codex**: the rulebook reorganized for play. It includes the die legend, the crisis table, all 21 task cards, the order of battle, and every rules clarification.

The game automates the adjudicator. It handles the task-limit and ASOS draws, checks staff, MSC and capability requirements, over-tasking rolls, initiative, Disruption, Influence spending, all of Crisis Assessment (Intelligence, Communications and Protection advantages, scoring), force tailoring with RFF, RSOI and SecWar, and even-turn decay.

## Project layout

```
game/
  index.html            entry point
  css/game.css
  js/data.generated.js  GENERATED from the workbook (do not edit)
  js/data.js            task requirements, starting values, crisis table, settings
  js/rules.js           pure rules: dice legend, deterrence, instability, requirement checks
  js/engine.js          turn/phase state machine and every player action
  js/ai.js              heuristic AI commander
  js/ui*.js, planner.js, crisis.js, codex.js, tutorial.js   interface
  img/                  web-sized card art (GENERATED from assets/)
  tests/run.js          rules tests + full AI-vs-AI campaign simulation
tools/
  build_data.py         workbook -> game/js/data.generated.js
  build_assets.py       assets/*.png -> game/img/*.webp
  capability_art_index.csv  links each workbook capability row to its card art
docs/rules-verification.md  source cross-check, discrepancies, open design questions
```

## Changing the game

- **Card stats** (capabilities, ASOS, staff, MSCs, tracker legend): edit `dig_game_database_master.xlsx`, then run `python tools/build_data.py`.
- **Card art**: replace files in `assets/`, then run `python tools/build_assets.py`.
- **Task requirements, starting values, Crisis Assessment table**: edit `game/js/data.js`.
- **Tests**: `node game/tests/run.js [games]` checks the die legend against the printed cards, the starting deterrence against Enclosure 2, and the rule edge cases. It then plays full AI-vs-AI campaigns and checks invariants after every step.

## Open design questions

See [docs/rules-verification.md](docs/rules-verification.md). The main one is that the rulebook's **Crisis Assessment table doesn't exist in any source file**. The game uses a clearly labelled provisional table until the designer supplies the real one.
