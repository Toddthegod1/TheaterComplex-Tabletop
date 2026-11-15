# AI-vs-AI baseline

300 simulated 10-turn campaigns, both armies played by the **Regular** AI. Regenerate with `node game/tools/baseline.js`.

Read this as "what the game's AI does and what its winning sides did differently", not as proven best play. The AI plans one year at a time. Differences between winners and losers are associations, not causes: a side that is already ahead can afford different tasks.

## Results

| | Fourth Army | Tenth Army |
|---|---|---|
| Campaigns won | 177 (59%) | 113 (38%) |
| Draws | 10 | |
| Tasks played per turn | 3.7 | 3.6 |
| Task slots used | 91% | 91% |
| Tasks played as Disruption, per campaign | 0 | 0 |
| Requested forces (RFF) arriving per turn | 1 | 1 |
| Tasks that failed, per campaign | 0.3 | 0.3 |

## Par: average score after each turn

The game shows this next to a player's own score. "When winning" is the average over campaigns that army went on to win.

| Turn | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Fourth Army | 3 | 6.3 | 9.6 | 13.1 | 16.6 | 20.3 | 23.7 | 27.3 | 31 | 34.7 |
| Fourth Army, when winning | 3.6 | 7.1 | 10.6 | 14.6 | 18.5 | 22.5 | 26.3 | 30.3 | 34.5 | 38.8 |
| Tenth Army | 3 | 6.2 | 9.6 | 12.6 | 15.8 | 19 | 22.3 | 25.7 | 28.8 | 31.9 |
| Tenth Army, when winning | 3.8 | 7.4 | 11.3 | 14.8 | 18.5 | 22.3 | 26.2 | 30.3 | 34.2 | 38.1 |

## Where the points come from (average per campaign)

| Source | Fourth Army | Tenth Army |
|---|---|---|
| Zone wins | 36.8 | 35.2 |
| Objective-zone bonus | 0.6 | 0.1 |
| Deterrence lead in calm crises | 8.2 | 7.8 |
| Deterrence lead in violent crises | -13.7 | -13.7 |
| Influence lead | 2.8 | 2.6 |
| Over-tasked MSCs | 0 | 0 |

## Where tasks are played

Share of all tasks by zone. Zone A is Fourth Army's home and Tenth Army's objective; Zone C is the reverse.

| | Zone A | Zone B | Zone C |
|---|---|---|---|
| Fourth Army, all campaigns | 3% | 72% | 25% |
| Fourth Army, when winning | 3% | 72% | 25% |
| Fourth Army, when losing | 4% | 73% | 24% |
| Tenth Army, all campaigns | 5% | 74% | 21% |
| Tenth Army, when winning | 6% | 73% | 22% |
| Tenth Army, when losing | 5% | 74% | 20% |

## What the tasks are spent on

Share of tracker changes by kind.

| | more or bigger dice | Intelligence / Communications / Protection | Influence and Access | Assurance |
|---|---|---|---|---|
| Fourth Army, when winning | 29% | 34% | 31% | 6% |
| Fourth Army, when losing | 29% | 34% | 31% | 6% |
| Tenth Army, when winning | 31% | 31% | 33% | 6% |
| Tenth Army, when losing | 30% | 31% | 33% | 6% |

## Fourth Army: task cards

Times played per campaign. "Best zone" is where it was played most.

| Task | Per campaign | When winning | When losing | Best zone |
|---|---|---|---|---|
| 8 SPP contact event | 8.8 | 8.8 | 8.8 | B (77%) |
| 3 Contingency planning | 5.4 | 5.4 | 5.2 | B (68%) |
| 4 Intelligence support | 5 | 4.9 | 5.3 | B (87%) |
| 9 Combined exercise | 3.6 | 3.5 | 3.7 | C (55%) |
| 1 Access agreement | 2.6 | 2.7 | 2.5 | B (93%) |
| 12 Military engagement | 2.1 | 2 | 2.3 | B (91%) |
| 7 RSOI | 1.9 | 2 | 1.8 | C (68%) |
| 21 AMD support | 1.8 | 1.8 | 1.7 | C (66%) |
| 10 HNS agreement | 1.2 | 1.1 | 1.2 | B (100%) |
| 14 Basing agreement | 1 | 1 | 0.9 | B (100%) |
| 15 Storage agreement | 0.9 | 1 | 0.8 | B (98%) |
| 17 Medical operations | 0.7 | 0.6 | 0.7 | A (52%) |
| 5 Information operations | 0.6 | 0.6 | 0.6 | B (86%) |
| 11 Stockage adjustment | 0.5 | 0.5 | 0.6 | B (95%) |
| 18 Force health protection | 0.3 | 0.3 | 0.3 | C (61%) |
| 6 Theater distribution | 0.2 | 0.2 | 0.3 | C (56%) |
| 2 Threat monitoring | 0.1 | 0.1 | 0 | C (100%) |
| 16 Communications network development | 0.1 | 0.1 | 0.1 | C (83%) |

Most common first-turn task sets: Contingency planning, Intelligence support, SPP contact event (47%); Contingency planning, Intelligence support, SPP contact event, HNS agreement (30%); Contingency planning, Intelligence support, SPP contact event, Military engagement (9%).

## Tenth Army: task cards

Times played per campaign. "Best zone" is where it was played most.

| Task | Per campaign | When winning | When losing | Best zone |
|---|---|---|---|---|
| 8 SPP contact event | 8.6 | 8.4 | 8.7 | B (84%) |
| 4 Intelligence support | 5.7 | 5.5 | 5.8 | B (69%) |
| 3 Contingency planning | 4.7 | 4.7 | 4.6 | B (79%) |
| 9 Combined exercise | 3.6 | 3.5 | 3.6 | C (51%) |
| 12 Military engagement | 3 | 3.1 | 2.9 | B (64%) |
| 1 Access agreement | 2.5 | 2.6 | 2.5 | B (100%) |
| 7 RSOI | 1.9 | 1.8 | 1.9 | A (63%) |
| 10 HNS agreement | 1.3 | 1.3 | 1.3 | B (99%) |
| 14 Basing agreement | 1.1 | 1.2 | 1.1 | B (97%) |
| 15 Storage agreement | 0.9 | 1 | 0.9 | B (100%) |
| 21 AMD support | 0.9 | 0.9 | 0.9 | B (70%) |
| 17 Medical operations | 0.8 | 0.8 | 0.8 | C (62%) |
| 5 Information operations | 0.7 | 0.7 | 0.6 | B (92%) |
| 11 Stockage adjustment | 0.5 | 0.5 | 0.6 | B (86%) |
| 18 Force health protection | 0.2 | 0.2 | 0.2 | B (57%) |
| 6 Theater distribution | 0.1 | 0.1 | 0.1 | B (92%) |
| 2 Threat monitoring | 0 | 0 | 0 | A (100%) |
| 16 Communications network development | 0 | 0 | 0 | A (50%) |

Most common first-turn task sets: Contingency planning, Intelligence support, SPP contact event (47%); Contingency planning, Intelligence support, SPP contact event, HNS agreement (35%); Contingency planning, Intelligence support, SPP contact event, Military engagement (9%).
