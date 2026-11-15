# TheaterComplex digital game: issues and status

The 23 issues from the last review, with what was done about each. "Done" means built and
checked in a browser; "Partly" means it is better but the original problem is not fully gone.

## Balance and rules

| # | Issue | Status | What changed |
|---|---|---|---|
| 1 | Fourth Army won about twice as often as Tenth (131 to 64) | Done, with an option | The AI cause is fixed. Over 600 AI campaigns Fourth wins 334 and Tenth 244 (58%); the rest comes from the printed tracker tables (issue 31). An optional head start for Tenth Army on the setup screen evens it: 2 points gives 286 to 290. Off by default. |
| 2 | No truly hard opponent | Done | Aggressive now chooses its deterrence level in each zone by expected points and moves combat units to match. It beats Regular 84 to 28 over 120 games, equally with either army. It still plans one year at a time. |
| 3 | "Suggest a plan" left slots empty without saying why | Done | It now says what the remaining cards are short of: staff, an MSC, capability points, Assurance or cost. |
| 4 | Negative scores with no explanation | Done | Click either score for a breakdown by source and by turn. |

## Beginner clarity

| # | Issue | Status | What changed |
|---|---|---|---|
| 5 | Blocked cards did not say why | Done | A blocked card shows its reason on the card, for example "needs SUST in zone". |
| 6 | Crisis screen assumed you know the dice rules | Done | Each zone ends with a one-line verdict: who won, by how much, and what decided it. |
| 7 | Force Management hard to read | Done | Combat units show ⚔ instead of 0, a line explains the numbers, suggested requests are starred, and one button requests them all. |
| 8 | No undo | Done | Undo button and Ctrl+Z take back the last commitment (ASOS, execute, Disruption, stand down, Influence) until a die is rolled or the phase ends. |
| 9 | Tutorial only covered turn 1 | Done | A short tip appears the first time you meet even-turn decay, Disruption (yours and the enemy's), a violent crisis, over-tasking and RFF arrivals. Can be turned off. |
| 10 | Jargon in the top bar | Done | "Aa Glossary" button in the top bar opens the glossary directly. |

## Interface

| # | Issue | Status | What changed |
|---|---|---|---|
| 11 | Messages covered Zone C | Done | Messages now sit over the adjudicator log in the side panel, which records the same events. |
| 12 | Bottom bar crowded on a 1366x768 laptop | Done | On short screens the row of filter buttons is one drop-down and the hint text is hidden, so the bar is one header line plus the cards. Cards are narrower so six fit, and the bar can be hidden. |
| 13 | Not usable on a phone or tablet | Mostly done | A full turn can be played by touch at phone and tablet size. Force Management and other dialogs now stack instead of squeezing. Still a desktop design shrunk down: lots of scrolling on a phone. |
| 14 | No sound, few animations | Done | Sounds with a menu switch. Results now arrive in sequence: points chips pop in, the verdict and year-review lines slide in, the score bumps when it changes, the end screen stamps the result. Respects the system's reduced-motion setting. Cards do not physically fly between zones. |
| 15 | Colour alone marked armies and good/bad | Done | "Colour-blind marks" in the menu adds arrows and shapes to every colour cue. |
| 16 | Keyboard support partial | Done | Tab reaches every card, chip and button; Enter or Space activates; arrow keys walk the cards; focus shows the same preview as hover and survives redraws. |
| 17 | End screen thin | Done | Adds "What decided the campaign" and a per-zone table of wins and points, plus buttons for the score breakdown and a save file. |

## Technical

| # | Issue | Status | What changed |
|---|---|---|---|
| 18 | Fonts loaded from Google | Done | Both fonts are in `game/fonts` (SIL Open Font License). The game makes no network requests. |
| 19 | Tabletop link broke when only `game` was shared | Done | The link only appears when the tabletop is really there. |
| 20 | One save slot per browser | Done | Six named slots (menu and title screen), plus reminders to download a save file. |
| 21 | No browser tests in the repository | Done | `game/tests/playthrough.py` plays a campaign in each mode in a headless browser. |
| 22 | Whole screen redrawn on every change | Done | Only panels whose content changed are replaced, so scroll, hover and focus elsewhere are kept. Each panel is still rebuilt as text first. |
| 23 | Hot-seat save file showed both plans | Done | No save file can be made during hot-seat planning; it is available again once both plans are submitted. The autosave inside the browser still holds both plans, as it must to resume: someone using the browser's developer tools on the shared computer could read it. |

## From the War College meeting (November 2026)

| # | Request | Status | Notes |
|---|---|---|---|
| 24 | ASOS requests must be met with every listed type, not either one (for example Sustainment + Military Police needs both) | Done | The check, auto-select, the AI, the wording on screen, the Codex and the tutorial all follow the ruling. 17 of the 31 ASOS cards list two types. Task cards already required every listed type; "OR" boxes printed on a task card are still a choice. |
| 25 | Export the adjudicator log for students and for data analysis | Done (first version) | Menu and end screen export the log as a spreadsheet (CSV) and the whole campaign as structured data (JSON): settings, who played, each turn's tasks, crises, scores and trackers. See issue 26 for the analysis side. |
| 26 | Analyse exported games: classify players and techniques | Done | `node game/tools/analyze.js <folder> --csv players.csv` gives each player a row: where they played, how, traits, score against par, and now how they decided (planning time per turn, plan changes, reliance on Suggest a plan, cards inspected, undos), from a decision record the game keeps for human players. |
| 27 | Play other people online | Done, one thing untested | New Campaign → Two players online: invite code, reply code, direct connection, no game server. If the browsers cannot reach each other it now says so after 25 seconds and suggests another network. Tested with two separate browsers on one computer; **I cannot test it between two different networks from here, so try it with a second person**. Networks that block direct connections will not work without a relay server, which would need hosting. |
| 28 | Put the game on a website (GitHub Pages) | On hold at your request | Nothing has been made public. The game still makes no network requests except the address lookup used by online play. When you decide, the choice is between a new public repository with only the `game` folder, or this repository made public (which would show your email in the commit history unless it is rewritten first). |
| 29 | AI-vs-AI baseline showing what a good strategy looks like | Done | `node game/tools/baseline.js` writes [docs/ai-baseline.md](docs/ai-baseline.md) from 300 campaigns: results, par score per turn, points by source, where and on what tasks are spent, every task card's use when winning and losing, common openings. The game shows your score against par in the year review and on the end screen. It describes this AI, not best play. |
| 30 | Preferred data format for a digital interface like this | Done | Task cards, starting values and the crisis table moved out of code into `game/data/rules.json`, described by a JSON Schema and checked by `node game/tools/build_rules.js`, which reports mistakes by location. Task cards have permanent IDs. [docs/data-format.md](docs/data-format.md) explains every format and lists what is still worth doing (task cards in the workbook, permanent IDs for capability cards). |
| 31 | Re-tune the AI after the ASOS ruling | Done | Aggressive is now clearly the strongest level (issue 2). The remaining 58:42 between the armies is the printed tracker tables, so it is on the list for the designers, with an optional head start in the meantime (issue 1). |
| 32 | Tabletop view: show the current game as it would look on the physical table | Done | ▦ Table in the top bar and the menu. Tabs for each zone (both capability mats with cards in their category columns, the 3 x 3 tracker array with black and white markers, Defense Readiness mats with the dice, task cards played) and the theater (points and turn tracker, Influence, Access, MSCs with tasking markers). Dice positions on the readiness mats are approximate. |

## Still open

- **Publishing to a website (issue 28)** is on hold until you choose how: a new public repository with only the game, or this repository made public (which shows your email in the commit history unless it is rewritten first).
- **Online play between two real networks (issue 27)** needs a second person to try it.
- **Rulings from the designers**: [docs/questions-for-designers.md](docs/questions-for-designers.md) lists eight rules questions and three findings to put to the War College.
- Phone play works but is a shrunk desktop layout (issue 13).
