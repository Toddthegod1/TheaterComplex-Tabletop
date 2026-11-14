# TheaterComplex digital game: issues and status

The 23 issues from the last review, with what was done about each. "Done" means built and
checked in a browser; "Partly" means it is better but the original problem is not fully gone.

## Balance and rules

| # | Issue | Status | What changed |
|---|---|---|---|
| 1 | Fourth Army won about twice as often as Tenth (131 to 64) | Partly | The main cause was the AI: Tenth's AI spent its tasks on Zone A, which it cannot take. Regular and Aggressive now weigh how contested a zone is, which brought it to 101 to 91. After the ASOS ruling (issue 24) it is Fourth 117, Tenth 76, so it needs another look (issue 31). A test fails if one side passes 65%. |
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
| 26 | Analyse exported games: classify players and techniques | Open | Needs a decision on what to measure, then a script or notebook that reads many campaign records. The record does not yet log every click (card hovered, plan changed, time taken); add an event stream if that is wanted. Campaigns saved before this change have no per-turn task detail. Size: M to L. |
| 27 | Play other people online | Open | Today two people can only play on one screen (hot-seat). Online needs a way to pass moves between two browsers. Cheapest route: each player's browser connects directly to the other's with a shared room code (WebRTC), no server to run, moves sent as the same actions the engine already takes. A hosted relay or a small server is more reliable but costs money and upkeep. Hidden planning must stay hidden from the other browser. Size: L. |
| 28 | Put the game on a website (GitHub Pages) | Open, needs your decision | The game is plain files and makes no network requests, so Pages can host it as it is. Pages on a free account requires the repository to be public, which would also publish the rulebook .docx, the card workbook and all card art. Options: publish only the `game` folder from a separate public repository, or get approval to make everything public. Size: S once decided. |
| 29 | AI-vs-AI baseline showing what a good strategy looks like | Open | The simulator already plays hundreds of AI campaigns (`node game/tests/run.js`). Add a report from those games: which tasks and zones winners choose, when they request forces, how points split by source, and a "par" score per turn that a student's exported record can be compared with. Only as good as the AI, which is a teaching opponent. Size: M. |
| 30 | Preferred data format for a digital interface like this | Answered, follow-up open | Recommendation: keep the workbook as the place people edit, and generate JSON from it (already done for capabilities, ASOS, staff, MSCs and the tracker legend). Follow-up: move task-card requirements and starting values out of `game/js/data.js` into the workbook so designers can change them without touching code, give every card a stable ID, add a JSON Schema that checks the generated file, and store one JSON record per campaign for analysis. Size: M. |
| 31 | Re-tune the AI after the ASOS ruling | Open | Fourth wins 117 to 76 over 200 AI campaigns, and Aggressive is no stronger than Regular. Check whether stricter ASOS costs Tenth Army more, then adjust. Size: M. |
| 32 | Tabletop view: show the current game as it would look on the physical table | Open | A read-only screen that lays out the mats, tracker arrays with markers on the right values, capability cards in their zones (sideways when committed), task cards and dice, using the print art in `assets/`. The free-form tabletop (`index.html`) already has the mats and trackers to build on. Size: L. |

## Still open

- A look-ahead AI for a real "hard" level, and re-tuning after the ASOS ruling (issues 2 and 31).
- A cleaner small-screen layout, especially Force Management on a phone (issues 12 and 13).
- Animations for scoring and force movements (issue 14).
- The rules questions in [docs/rules-verification.md](docs/rules-verification.md) still need an answer from the game's designers.
