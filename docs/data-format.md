# Data formats

How the digital game stores its data, and why. Written for whoever maintains the cards and rules next.

## The short version

- **People edit two things**: the workbook (`dig_game_database_master.xlsx`) for card stats, and `game/data/rules.json` for task cards, starting values and the crisis table.
- **The game reads generated files**, never the sources directly. A build step checks the source and writes a `.generated.js` file. Nothing generated is edited by hand.
- **Everything the game produces is JSON** with a `format` name and a `version` number, so a file can always be recognised and old files can still be read after the format grows.

## Why JSON, generated into scripts

JSON is the usual choice for a browser game: every language reads it, a text editor shows it, and Git shows exactly what changed between versions (a spreadsheet does not). The one obstacle is that a page opened by double-click cannot load a `.json` file, so the build step wraps the data in a small script the page can load. That keeps "no install, no server" true.

A spreadsheet is still the better place for wide tables that designers fill in by hand (hundreds of capability cards), which is why the workbook stays as the source for those.

## Sources and what they generate

| You edit | It holds | Build command | Generated file |
|---|---|---|---|
| `dig_game_database_master.xlsx` | Capabilities, ASOS requests, staff cells, MSCs, the tracker die legend | `python tools/build_data.py` | `game/js/data.generated.js` |
| `game/data/rules.json` | The 21 task cards, starting tracker values, Crisis Assessment table, points per crisis type | `node game/tools/build_rules.js` | `game/js/rules.generated.js` |
| (simulation, nothing to edit) | AI-vs-AI averages used for "par" | `node game/tools/baseline.js` | `game/js/baseline.generated.js`, `docs/ai-baseline.md` |

`node game/tests/run.js` fails if `rules.generated.js` no longer matches `rules.json`, so a forgotten rebuild is caught.

## rules.json

Described field by field in `game/data/rules.schema.json` (a JSON Schema; most editors use it to underline mistakes as you type). The build refuses to run if the file breaks the schema, and reports where:

```
rules.json has 1 problem:
  rules.tasks[3].effects: unknown field "intell" (typo?)
```

It also checks things a schema cannot: card numbers run 1, 2, 3 in order, IDs are unique, crisis table rows join up with no gaps.

A task card:

```json
{
  "id": "task_10",
  "num": 10,
  "name": "HNS agreement",
  "function": "Set and maintain the theater",
  "blockedByHighAssurance": true,
  "staff": ["SUST", "OPS"],
  "commands": ["TSC", "SPT"],
  "capabilities": [],
  "points": 5,
  "cost": { "influence": 1 },
  "effects": {},
  "chooseOne": [
    { "key": "SUST", "label": "Sustainment path: Stockage +1", "capabilities": ["SUST"], "effects": { "stockage": 1 } },
    { "key": "CA", "label": "Civil Affairs path: Infrastructure +1", "capabilities": ["CA"], "effects": { "infrastructure": 1 } }
  ],
  "optional": [
    { "key": "MP", "label": "Add Military Police: Protection +1", "capabilities": ["MP"], "effects": { "protection": 1 } }
  ]
}
```

- `id` never changes, even if the card is renamed or renumbered. Saved games and exported records refer to cards by it.
- `chooseOne` is an "OR" printed on the card; `optional` is a dashed box.
- Every type listed in `capabilities` must be represented when the task is executed.

## Files the game writes

| File | Made by | What it is |
|---|---|---|
| Save file (`.json`) | Menu → Download save file | The whole game state, so a campaign can be resumed. A hot-seat save made during planning is scrambled (not encrypted) so the plans cannot be read in a text editor. |
| Adjudicator log (`.csv`) | Menu or end screen | One row per log line: line, turn, phase, army, kind, text. Opens in Excel. |
| Campaign record (`.json`) | Menu or end screen | The campaign as data for analysis. |

### Campaign record

`"format": "theatercomplex-campaign-record", "version": 1`. One file per campaign.

| Field | Meaning |
|---|---|
| `seed`, `settings` | Enough to replay the same dice and draws |
| `players` | `human`, `human-online` or `ai:<level>` for each army |
| `finished`, `winner`, `score` | Outcome |
| `scoreBySource` | Points by source for each army: zone wins, objective bonus, deterrence (calm and violent), Influence lead, over-tasked MSCs |
| `turns[]` | One entry per finished turn: `taskLimit`, `asos`, `initiative`, `tasks` (each army's task cards with zone, branch, options, status and whether it was a Disruption), `rffArrived`, `crisis` (per zone: type, Instability, d10 roll, winner, totals, dice, deterrence, points), `trackers` (every tracker value at the end of the turn), `scoreAfter` |
| `scoreEvents[]` | Every point awarded: turn, army, points, reason |
| `log[]` | The adjudicator log |

`node game/tools/analyze.js <folder of records> --csv players.csv` reads any number of these and writes one row per player.

## Recommendations still open

1. **Move the task cards into the workbook** if designers prefer one place to edit. `rules.json` is ready to be generated from a sheet: the schema already defines every column.
2. **Give capability cards permanent IDs in the workbook.** Today the ID (`4a_cap_001`) comes from the row order, so inserting a row renumbers the cards below it and breaks older save files.
3. **Record decisions, not only outcomes.** The campaign record says what was played. If the analysis should cover how a player decided (cards considered, plans changed, time taken), add an event list to the record: `{ t, turn, phase, army, action, details }`.
