# Questions for the game's designers

Things the digital edition had to decide because the rulebook, the cards and the workbook are silent or disagree, plus two findings from simulation. Each has the choice the game makes today, so a short answer ("keep" or "change to …") is enough. Background and sources are in [rules-verification.md](rules-verification.md).

## Rulings needed

| # | Question | What the game does today | Easy to change? |
|---|---|---|---|
| 1 | Must a task's capability cards be in the task's zone? The rulebook does not say; ASOS explicitly allows any zone. | Same zone. A switch on the setup screen allows any zone. | Yes: already a switch |
| 2 | Do requested MSCs (command cards) count toward the limit of 10 requested forces? The rulebook says "additional capabilities" and does not mention commands. | They count. A switch on the setup screen excludes them. | Yes: already a switch |
| 3 | MSC bandwidth: the rulebook (§6.D.4) says "three spaces"; the card art shows two white and three red "overtasked" slots. Which is it, and when does the over-tasking roll start? | Follows the card: two free tasks, the third and later need a d6 roll, at most five. | Yes: two numbers |
| 4 | HNS agreement: the workbook says requirement 1 raises Capacity; the card back says Infrastructure +1 "if CA" and Stockage +1 "if SUST". | Follows the card. | Yes: one entry in `game/data/rules.json` |
| 5 | Task cards with an "OR" box (Information operations, HNS agreement, Storage agreement): is it a free choice each time the card is played? | Yes, the player picks one path each time. (ASOS requests listing two types need both, per the November 2026 ruling.) | Yes |
| 6 | The Crisis Assessment table is not in the rulebook. The game uses the adjudicator's sheet ([img/crisis-assessment-sheet.png](img/crisis-assessment-sheet.png)). Is that sheet current? | Uses the sheet. | Yes: three rows in `rules.json` |
| 7 | A tie in a Crisis Assessment roll: nobody wins the zone and no victor points are scored. Correct? | No victor. Deterrence points are still awarded. | Yes |
| 8 | Campaign length: the tabletop game runs for a set time. Is there a standard number of turns for a classroom session? | Player chooses 4, 6, 8 or 10 turns; 6 is the default. | Yes |

## Findings to discuss

These come from simulated campaigns in which the game's AI plays both armies. They describe this AI, not expert play, so treat them as questions.

**1. Each army almost always wins its home zone, so Zone B decides the campaign.** Over 600 campaigns Fourth Army averaged 13.5 points from Zone A and 0.5 from Zone C; Tenth Army averaged 12.5 from Zone C and next to nothing from Zone A. Both averaged about 5 from Zone B. Is the "objective zone" bonus meant to be reachable, or is the game meant to be fought in the centre?

**2. Fourth Army wins more often: 58% of decided campaigns (334 to 244).** The two armies start as mirror images, but the tracker cards are not mirrored: the Zone A cards reward the same tracker value more than the Zone C cards do (for example Stockage 3 is +1 in Zone A and 0 in Zone C, and Infrastructure reaches a second die at 5 in Zone A but 6 in Zone C). Is that asymmetry intended? The digital game offers an optional 2-point head start for Tenth Army that evens the result (286 to 290), off by default.

**3. Managing deterrence matters more than winning zones.** The -3 for the higher deterrence in a Limited Operation or LSCO costs a Regular AI about 7 points a campaign. The Aggressive AI picks its deterrence level in each zone by expected points and moves combat units to get there: it ends up a little above the enemy in its home zone and Zone B (under 1 on average) and well below in the enemy's home zone. Against Regular it wins 3 campaigns in 4 (84 to 28) while winning *fewer* zone points (17 against 21): the difference is deterrence points (+7 against +4 in calm crises, -5 against -7 in violent ones) and the Influence lead. Is "hold a small lead, never a large one" the lesson the game is meant to teach?

See [ai-baseline.md](ai-baseline.md) for the full numbers.
