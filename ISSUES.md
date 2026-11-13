# TheaterComplex digital game: issues and status

The 23 issues from the last review, with what was done about each. "Done" means built and
checked in a browser; "Partly" means it is better but the original problem is not fully gone.

## Balance and rules

| # | Issue | Status | What changed |
|---|---|---|---|
| 1 | Fourth Army won about twice as often as Tenth (131 to 64) | Done | The cause was the AI, not the rules: Tenth's AI spent its tasks on Zone A, which it cannot take. Regular and Aggressive now weigh how contested a zone is. 200 AI campaigns: Fourth 101, Tenth 91, draws 8. A test fails if one side passes 60%. |
| 2 | No truly hard opponent | Partly | Aggressive now beats Regular 68 to 47 over 120 games (it was 63 to 52 against a weaker Regular). It still plans one year at a time; it does not look ahead. |
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

## Still open

- A look-ahead AI for a real "hard" level (issue 2).
- A cleaner small-screen layout, especially Force Management on a phone (issues 12 and 13).
- Animations for scoring and force movements (issue 14).
- The rules questions in [docs/rules-verification.md](docs/rules-verification.md) still need an answer from the game's designers.
