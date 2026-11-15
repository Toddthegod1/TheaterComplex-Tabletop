# TheaterComplex digital game: issues and status

The 23 issues from the last review, with what was done about each. "Done" means built and
checked in a browser; "Partly" means it is better but the original problem is not fully gone.

## Balance and rules

| # | Issue | Status | What changed |
|---|---|---|---|
| 1 | Fourth Army won about twice as often as Tenth (131 to 64) | Partly | The main cause was the AI: Tenth's AI spent its tasks on Zone A, which it cannot take. Regular and Aggressive now weigh how contested a zone is. Over 600 AI campaigns Fourth wins 334 and Tenth 244 (58% of decided games). What remains is in the printed tracker tables, not the AI: see issue 31. |
| 2 | No truly hard opponent | Open | Aggressive adds Disruption to Regular, but 120 games cannot tell them apart (54 to 60 after the ASOS ruling). A stronger level needs look-ahead (issue 31). |
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
| 12 | Bottom bar crowded on a 1366x768 laptop | Partly | Cards are narrower so six fit, and a "Hide bottom bar" tab shows the whole board. The bar is still dense. |
| 13 | Not usable on a phone or tablet | Partly | A full turn can be played by touch at phone and tablet size: the board scrolls, the bottom bar stays put, first tap on a card explains it and the second opens it, tapping a label shows its tooltip. Layout is functional, not polished, and Force Management is cramped on a phone. |
| 14 | No sound, few animations | Partly | Short synthesised sounds for dice, task results, zone wins and losses and the final result, with a switch in the menu. No new animations. |
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
| 23 | Hot-seat save file showed both plans | Partly | A hot-seat save made during planning is scrambled so it cannot be read in a text editor. It is not encryption: someone determined can decode it. |

## From the War College meeting (November 2026)

| # | Request | Status | Notes |
|---|---|---|---|
| 24 | ASOS requests must be met with every listed type, not either one (for example Sustainment + Military Police needs both) | Done | The check, auto-select, the AI, the wording on screen, the Codex and the tutorial all follow the ruling. 17 of the 31 ASOS cards list two types. Task cards already required every listed type; "OR" boxes printed on a task card are still a choice. |
| 25 | Export the adjudicator log for students and for data analysis | Done (first version) | Menu and end screen export the log as a spreadsheet (CSV) and the whole campaign as structured data (JSON): settings, who played, each turn's tasks, crises, scores and trackers. See issue 26 for the analysis side. |
| 26 | Analyse exported games: classify players and techniques | Done (first version) | `node game/tools/analyze.js <folder> --csv players.csv` reads campaign records and gives each player a row: where they played, how, traits (Disruptor, Force builder, Escalation risk and others) and score against par, plus win rates per label. The thresholds are simple and written in the tool. Not yet recorded: how a player decided (cards considered, time taken). |
| 27 | Play other people online | Done (first version) | New Campaign → Two players online. Host sends an invite code, opponent sends back a reply code, and the browsers connect directly with no game server. Tested with two separate browsers on one computer playing whole turns in step; **not yet tried between two different networks**. Networks that block direct connections will not work (no relay server). Undo is off online. |
| 28 | Put the game on a website (GitHub Pages) | On hold at your request | Nothing has been made public. The game still makes no network requests except the address lookup used by online play. When you decide, the choice is between a new public repository with only the `game` folder, or this repository made public (which would show your email in the commit history unless it is rewritten first). |
| 29 | AI-vs-AI baseline showing what a good strategy looks like | Done | `node game/tools/baseline.js` writes [docs/ai-baseline.md](docs/ai-baseline.md) from 300 campaigns: results, par score per turn, points by source, where and on what tasks are spent, every task card's use when winning and losing, common openings. The game shows your score against par in the year review and on the end screen. It describes this AI, not best play. |
| 30 | Preferred data format for a digital interface like this | Done | Task cards, starting values and the crisis table moved out of code into `game/data/rules.json`, described by a JSON Schema and checked by `node game/tools/build_rules.js`, which reports mistakes by location. Task cards have permanent IDs. [docs/data-format.md](docs/data-format.md) explains every format and lists what is still worth doing (task cards in the workbook, permanent IDs for capability cards). |
| 31 | Re-tune the AI after the ASOS ruling | Investigated, open | 600 campaigns put Fourth at 58% of decided games. Both armies score the same in Zone B; the gap is the home zones (Fourth averages 13.5 points from Zone A, Tenth 12.5 from Zone C), which comes from the printed tracker tables being more generous in Zone A. That is a design question for the War College, not an AI fault. Still open: Aggressive is no stronger than Regular (54 to 60). |
| 32 | Tabletop view: show the current game as it would look on the physical table | Done | ▦ Table in the top bar and the menu. Tabs for each zone (both capability mats with cards in their category columns, the 3 x 3 tracker array with black and white markers, Defense Readiness mats with the dice, task cards played) and the theater (points and turn tracker, Influence, Access, MSCs with tasking markers). Dice positions on the readiness mats are approximate. |

## Still open

- A look-ahead AI for a real "hard" level: Aggressive is no stronger than Regular (issues 2 and 31).
- The home-zone imbalance in the tracker tables: a question for the game's designers (issue 31).
- Online play across two real networks has not been tried, and there is no relay for networks that block direct connections (issue 27).
- Publishing to a website is on hold (issue 28).
- A cleaner small-screen layout, especially Force Management on a phone (issues 12 and 13).
- Animations for scoring and force movements (issue 14).
- The rules questions in [docs/rules-verification.md](docs/rules-verification.md) still need an answer from the game's designers.
