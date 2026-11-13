# TheaterComplex digital game: open issues and ideas

Things that would improve the game but are not done yet, most valuable first in each group.
Sizes are rough: S = under an hour, M = a few hours, L = a day or more.

## Balance and rules

1. **Fourth Army wins about twice as often as Tenth Army.** Over 200 AI-vs-AI games the split is Fourth 131, Tenth 64, draws 5. Find out whether this comes from the starting trackers, the starting forces, or the AI playing Tenth badly, then either fix it or tell players up front which side is the harder one. (L)
2. **"Aggressive" AI is barely stronger than "Regular"** (63 wins to 52 in 120 games). There is no truly hard opponent yet. A stronger AI would need to look ahead at the crisis odds per zone rather than score each task on its own. (L)
3. **"Suggest a plan" sometimes leaves slots empty** (for example 4 of 6 filled) without saying why. Tell the player what is short: staff, a command, or capability points in the zone. (S)
4. **Scores can go negative** (over-tasking penalties) with no explanation next to the number. A hover breakdown of where each army's points came from would help. (M)

## Beginner clarity

5. **Blocked cards do not say why at a glance.** A striped card needs a hover to learn what is missing. Put a short reason on the card itself, such as "needs SIG staff". (M)
6. **The crisis screen assumes you know the dice rules.** Add a one-line plain-English verdict for the human player, such as "You lost Zone B by 2: their Protection re-roll cost you 2". (M)
7. **Force Management is the hardest screen to read.** Cards with a value of 0 look broken, and nothing says which requests would help the plan. Add suggested requests, like the star on task cards. (M)
8. **No undo.** Committing ASOS forces and executing a task are final. A one-step undo before the next dice roll would forgive misclicks. (M)
9. **The tutorial only covers turn 1.** Even-turn decay, RFF arrivals and Disruption are first met without guidance. Add short first-time tips when each one first happens. (M)
10. **Jargon stays in the top bar** (ASOS, RFF, MSC, LSCO). The tooltips explain them, but a small glossary button would be easier to find. (S)

## Interface

11. **Messages cover the top of Zone C.** They are now smaller, capped at three, and click to dismiss, but they still sit on the board. A dedicated strip above the bottom bar would never cover anything. (M)
12. **The bottom bar is crowded on a 1366x768 laptop.** Only about five task cards fit, and the zone dice at the bottom of each board are hidden until you scroll. A collapsible bottom bar or a compact card size would help. (M)
13. **Not usable on a phone or small tablet.** The layout stacks below a certain width, but hover-only features (card inspector, tooltips) have no touch equivalent. (L)
14. **No sound and few animations.** Dice rolls and scoring would feel better with short sounds and a mute switch. (M)
15. **Colour alone marks the two armies and good/bad changes.** Add shapes or labels for colour-blind players. (M)
16. **Keyboard support is partial.** Enter presses the highlighted button and Esc closes dialogs, but cards and zones cannot be reached with Tab. (M)
17. **The end screen is thin.** It shows the score chart and crisis history but no "what decided the game" summary or per-zone statistics. (M)

## Technical

18. **Fonts load from Google**, so the look changes when offline. Bundle the two fonts in the game folder. (S)
19. **"Open free-form tabletop" breaks when only the `game` folder is shared.** Hide the link when the page is not there. (S)
20. **One save slot, stored per browser.** Clearing browser data loses the campaign. Add named slots and a reminder to download a save file. (M)
21. **No browser-level tests in the repository.** The rules have 20 automated tests, but the screens are only checked by throwaway scripts. Keep a small scripted play-through in `game/tests`. (M)
22. **The whole screen is redrawn on every change.** It is fast enough today, but it resets scroll positions and hover state, which has caused bugs (for example the stuck card preview). Redrawing only the changed panels would remove that class of bug. (L)
23. **Hot-seat secrecy relies on players looking away.** The plan is hidden behind the hand-off screen, but a saved file contains both plans in plain text. (S)
