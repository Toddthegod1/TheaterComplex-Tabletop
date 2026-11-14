# TheaterComplex v13 (Europe): rules source verification

This report covers the cross-check done while building the digital edition (`game/`). It compares four sources:

| Source | What it holds |
|---|---|
| `TheaterComplex Rules v13_Europe Edition.docx` | Rulebook text plus 13 embedded figures. Figures 5–7 show the starting tracker cards for Zones A, B and C. |
| `assets/trackers/*.png` | Print art for every tracker card (27 zone cards plus points/turn, influence and access). |
| `dig_game_database_master.xlsx` | Card database: tracker legend (`dig_trackers_min_max`), capabilities, tasks, ASOS, staff and commands. |
| `TheaterComplex_Rules_Reference_Addendum.docx` | The draft addendum written to fill the gaps. |

## 1. Defense Readiness die legend: verified

The values below match in all three sources (workbook, card art, rulebook figures) for every zone. `game/tests/run.js` checks the game against them on every run.

**Deterrence → Theater Army die size** (the same in all zones)

| Value | 4–5 | 6–7 | 8 | 9 | 10 |
|---|---|---|---|---|---|
| Die | d4 | d6 | d8 | d10 | d12 |

**Partner Capability → Partner die size**

| Zone | d4 | d6 | d8 | d10 |
|---|---|---|---|---|
| A | 1 | 2–5 | 6–7 | — |
| B | — | 1–4 | 5–7 | — |
| C | — | 1–3 | 4–6 | 7 |

**Infrastructure Capacity → number of Theater Army d6**

| Zone | ×1 | ×2 | ×3 | ×4 |
|---|---|---|---|---|
| A | 1–4 | 5–6 | 7 | — |
| B | 1–3 | 4–5 | 6 | 7 |
| C | 1–5 | 6–7 | — | — |

**Partner Interoperability → number of Partner d4**

| Zone | ×1 | ×2 | ×3 |
|---|---|---|---|
| A | 1–4 | 5–7 | — |
| B | 1–5 | 6–7 | — |
| C | 1–5 | 6 | 7 |

**Stockage → modifier to each Theater Army die** (the addendum leaves this table out)

| Zone | −1 | 0 | +1 | +2 |
|---|---|---|---|---|
| A | 1–2 | — | 3–5 | 6–7 |
| B | 1 | 2–3 | 4–5 | 6–7 |
| C | 1–2 | 3–5 | 6 | 7 |

## 2. Corrections to the draft addendum

1. **Deterrence 11 and 12 rows are unsupported.** The addendum lists "11 → +1 Instability instead of a bigger die" and "12 → +2". The printed deterrence track runs only from 4 to 10, and the workbook has no rows above 10. The four boxes labelled "ADDITIONAL INSTABILITY" on the card hold the extra instability cubes caused by high Assurance (rulebook §7.A.3.D: "Indicate the effects of any increased Instability by adding extra tokens to the affected Deterrence tracker"). They do not represent deterrence values 11–12.
2. **Stockage is missing.** It is the fifth dice-related tracker and it also varies by zone. Zone A has no 0 band, and Zone C only reaches +1 at 6.
3. **"Infrastructure Capacity, Zone A" table** is correct (1–4 ×1, 5–6 ×2, 7 ×3). In the addendum the "7" row sits on the next page, which makes it easy to miss.

## 3. Crisis Assessment table: from the adjudicator sheet

Rulebook §6.F.1 says to "consult the Crisis Assessment table", but the table is not in the rulebook, its figures, the workbook or the card art. It is on the separate adjudicator's Crisis Assessment sheet, saved here as [img/crisis-assessment-sheet.png](img/crisis-assessment-sheet.png). The game uses it in `game/js/data.js` (`TC.CRISIS_TABLE`):

| Instability | Status Quo | Show of Force | Limited Op | LSCO |
|---|---|---|---|---|
| 0–1 | 1–7 | 8–9 | 10 | — |
| 2–4 | 1–3 | 4–6 | 7–9 | 10 |
| 5+ | 1 | 2–3 | 4–7 | 8–10 |

The rest of the sheet (dice, modifiers, Limited Op/LSCO deterrence and assurance bonuses, zone bonuses, theater-wide points) matches the rulebook and the game. One difference: the sheet's VP summary lists "+1 VP higher deterrence" only under Status Quo, while the rulebook's points table also gives it for Show of Force. The game follows the rulebook.

## 4. Other discrepancies, and how the digital edition resolves them

| Topic | Conflict | Digital edition |
|---|---|---|
| Deterrence below the track | Enclosure 2 starts Fourth Army in A and Tenth Army in C at 3, below the printed track (4–10). Figures 5 and 7 show that marker off the track. | Uses a d4. |
| Information Operations penalty | Rulebook §7.E.2: opponent −1 Influence. Card back: "+1/−1". Workbook note: "−2". | −1 (rulebook and card agree). |
| MSC bandwidth | §6.D.4 says "three spaces"; the card art shows 2 white plus 3 red "overtasked" slots. §7.C.2 says the roll applies to "the third task and any subsequent tasks". | 2 free tasks. The 3rd–5th need a d6 roll greater than the tasks handled so far (4+, 5+, 6). |
| HNS agreement effects | Workbook: requirement 1 → Capacity. Card back: Infrastructure +1 "if CA", Stockage +1 "if SUST". | Follows the card. |
| Task capabilities by zone | The rulebook doesn't say whether a task's capabilities must be in the task's zone. ASOS explicitly allows any zone. | Same zone by default (toggle in setup). |
| ASOS with two listed types | The card lists types without saying "and" or "or". | **Both are needed** (War College ruling, November 2026): at least one card of every listed type, together reaching the points. |
| RFF cap and command cards | "No more than 10 additional capabilities", which says nothing about GFM command cards. | MSCs count by default (toggle). |
| Transportation (Exped.) | Tasks ask for TRANS; the TBX card is a transportation unit. | TBX satisfies TRANS. |
| Starting deterrence | Calculated from the cards (floor(count ÷ category) per category, summed) it gives Fourth 3/6/5 and Tenth 5/6/3. | Matches Enclosure 2 exactly, so deterrence is always calculated from the cards. |

## 5. Balance observation from simulation

`node game/tests/run.js 200` plays 200 six-turn campaigns with the same heuristic AI on both sides. Fourth Army wins about **64%** of them. The starting values are not mirror images:

- Fourth Army: Assurance 3/4/5 in A/B/C.
- Tenth Army: Assurance 2/4/4.

So Tenth Army's objective zone (A) starts at Assurance 2. After the turn-2 decay it falls to 1, where capability requirements double. Fourth Army's objective zone (C) starts at 5, close to the 6 threshold where tasks are blocked. The AI is a simple heuristic, so treat this as a signal to review, not a verdict.
