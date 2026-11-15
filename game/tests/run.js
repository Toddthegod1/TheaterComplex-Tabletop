// Headless tests: node game/tests/run.js [games]
// Loads the same scripts the browser uses, checks the rules tables against the
// printed card art, then plays full AI-vs-AI campaigns checking invariants.
const path = require("path");
const assert = require("assert");
const js = (f) => require(path.join(__dirname, "..", "js", f));
["data.generated.js", "rules.generated.js", "data.js", "rules.js", "engine.js", "ai.js"].forEach(js);
const { rules: R, engine: E, ai: AI } = TC;
R.indexCards();

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------- legend vs. tracker art
test("deterrence die legend matches tracker cards (all zones)", () => {
  for (const z of TC.ZONES) {
    assert.deepStrictEqual([4, 5, 6, 7, 8, 9, 10].map((v) => R.legend("deterrence", z, v)), [4, 4, 6, 6, 8, 10, 12]);
    assert.strictEqual(R.legend("deterrence", z, 3), 4, "below-track deterrence uses d4");
    assert.strictEqual(R.legend("deterrence", z, 12), 12);
  }
});
test("partner capability die size per zone", () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("partnerCap", "A", v)), [4, 6, 6, 6, 6, 8, 8]);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("partnerCap", "B", v)), [6, 6, 6, 6, 8, 8, 8]);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("partnerCap", "C", v)), [6, 6, 6, 8, 8, 8, 10]);
});
test("infrastructure d6 count per zone", () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("infrastructure", "A", v)), [1, 1, 1, 1, 2, 2, 3]);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("infrastructure", "B", v)), [1, 1, 1, 2, 2, 3, 4]);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("infrastructure", "C", v)), [1, 1, 1, 1, 1, 2, 2]);
});
test("interoperability d4 count per zone", () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("interop", "A", v)), [1, 1, 1, 1, 2, 2, 2]);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("interop", "B", v)), [1, 1, 1, 1, 1, 2, 2]);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("interop", "C", v)), [1, 1, 1, 1, 1, 2, 3]);
});
test("stockage DRM per zone", () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("stockage", "A", v)), [-1, -1, 1, 1, 1, 2, 2]);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("stockage", "B", v)), [-1, 0, 0, 1, 1, 2, 2]);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map((v) => R.legend("stockage", "C", v)), [-1, -1, 0, 0, 0, 1, 2]);
});

// ---------------------------------------------------------------- setup
test("computed starting deterrence reproduces Enclosure 2", () => {
  const s = E.newGame({ seed: 1 });
  // Undo the SecWar draw to compare against the printed starting values.
  Object.values(s.cards).forEach((c) => c.origin === "secwar" && (c.zone = "GFM"));
  assert.deepStrictEqual(TC.ZONES.map((z) => R.deterrence(s, "fourth", z)), [3, 6, 5]);
  assert.deepStrictEqual(TC.ZONES.map((z) => R.deterrence(s, "tenth", z)), [5, 6, 3]);
});
test("assurance instability: 6→+1, 7→+2, additive across armies", () => {
  const s = E.newGame({ seed: 2 });
  const base = R.instabilityBreakdown(s, "B").base;
  s.teams.fourth.zones.B.assurance = 6;
  s.teams.tenth.zones.B.assurance = 7;
  assert.strictEqual(R.instability(s, "B"), base + 3);
});
test("crisis table rows cover the full d10", () => {
  for (let i = 0; i <= 8; i++) {
    const odds = R.crisisOdds(i);
    assert.strictEqual(odds.SQ + odds.SOF + odds.LIM + odds.LSCO, 100);
  }
});
test("crisis table matches the adjudicator sheet", () => {
  const col = (inst) => Array.from({ length: 10 }, (_, i) => R.crisisTypeFor(inst, i + 1)).join(" ");
  const low = "SQ SQ SQ SQ SQ SQ SQ SOF SOF LIM";
  const mid = "SQ SQ SQ SOF SOF SOF LIM LIM LIM LSCO";
  const high = "SQ SOF SOF LIM LIM LIM LIM LSCO LSCO LSCO";
  [0, 1].forEach((i) => assert.strictEqual(col(i), low));
  [2, 3, 4].forEach((i) => assert.strictEqual(col(i), mid));
  [5, 6, 9].forEach((i) => assert.strictEqual(col(i), high));
});
test("instability bands follow the crisis table rows", () => {
  assert.deepStrictEqual([0, 1, 2, 4, 5, 9].map(R.instabilityBand), [0, 0, 1, 1, 2, 2]);
});
test("capability check: types, points, combat units", () => {
  const s = E.newGame({ seed: 3 });
  const sust = Object.keys(s.cards).filter((id) => R.cap(id).code === "SUST" && R.cap(id).team === "fourth");
  const armor = Object.keys(s.cards).find((id) => R.cap(id).code === "AR");
  assert.ok(!R.checkCaps([armor], ["ANY"], 0).ok, "combat units cannot fulfil tasks");
  const big = sust.sort((a, b) => R.cap(b).points - R.cap(a).points).slice(0, 2);
  assert.ok(R.checkCaps(big, ["SUST"], R.cap(big[0]).points).ok);
  assert.ok(!R.checkCaps(big, ["SUST", "TRANS"], 1).ok, "every listed type must be present");
  const tbx = Object.keys(s.cards).find((id) => R.cap(id).code === "TBX");
  assert.ok(R.capMatches(R.cap(tbx).code, "TRANS"), "expeditionary transportation counts as TRANS");
});
test("assurance 1 doubles the capability requirement", () => {
  const s = E.newGame({ seed: 4 });
  s.teams.tenth.zones.A.assurance = 1;
  assert.strictEqual(R.pointsMultiplier(s, "tenth", "A"), 2);
});
test("assurance 6 blocks agreements and security cooperation", () => {
  const s = E.newGame({ seed: 5 });
  E.rollTaskLimit(s);
  TC.TEAMS.forEach((t) => AI.allocateAsos(s, t));
  E.beginPlanning(s);
  s.teams.fourth.zones.B.assurance = 6;
  const ev = E.evaluateTask(s, "fourth", { num: 12, zone: "B" });
  assert.ok(ev.issues.some((i) => i.includes("Assurance")));
});

// ---------------------------------------------------------------- full games
function checkInvariants(s, where) {
  TC.TEAMS.forEach((team) => {
    const t = s.teams[team];
    assert.ok(t.influence >= 0 && t.influence <= TC.INFLUENCE_MAX, `${where}: influence ${t.influence}`);
    TC.ZONES.forEach((z) => {
      assert.ok(t.access[z] >= 0, `${where}: access`);
      TC.TRACKERS.forEach((tr) => {
        const v = t.zones[z][tr.key];
        assert.ok(v >= 1 && v <= 7, `${where}: ${team} ${z} ${tr.key}=${v}`);
      });
    });
    const rff = E.rffInTheater(s, team);
    assert.ok(rff.caps.length + rff.cmds.length <= E.RFF_LIMIT, `${where}: RFF over limit`);
    const secwar = E.capIds(s, team).filter((id) => s.cards[id].origin === "secwar" && s.cards[id].zone !== "GFM");
    assert.ok(secwar.length <= 3, `${where}: secwar ${secwar.length}`);
  });
  Object.entries(s.cards).forEach(([id, c]) => assert.ok(["A", "B", "C", "GFM"].includes(c.zone), `${where}: card ${id} zone ${c.zone}`));
}

function playGame(seed, turns, extra = {}) {
  const s = E.newGame({ seed, settings: Object.assign({ turns }, extra), controllers: { fourth: "ai", tenth: "ai" } });
  let steps = 0;
  while (s.phase !== "gameOver") {
    if (++steps > 5000) throw new Error(`seed ${seed}: stuck in ${s.phase}`);
    const where = `seed ${seed} turn ${s.turn} ${s.phase}`;
    switch (s.phase) {
      case "taskLimit":
        E.rollTaskLimit(s);
        break;
      case "asos":
        TC.TEAMS.forEach((t) => AI.allocateAsos(s, t));
        assert.ok(E.beginPlanning(s), `${where}: could not begin planning`);
        break;
      case "planning":
        TC.TEAMS.forEach((t) => AI.plan(s, t));
        assert.ok(E.beginImplementation(s), `${where}: could not begin implementation`);
        break;
      case "implementation":
        if (s.impl.done) E.beginCrisis(s);
        else assert.ok(AI.takeInitiative(s, s.impl.active), `${where}: AI could not act`);
        break;
      case "crisis": {
        const cur = s.crisis.current;
        if (cur.stage === "intel") E.chooseIntel(s, cur.intelTeam, AI.intelChoice(s, cur.intelTeam));
        else if (cur.stage === "ready") E.resolveZone(s);
        else E.nextCrisisZone(s);
        break;
      }
      case "tailoring":
        E.forceTailoring(s);
        E.cleanup(s);
        break;
      default:
        throw new Error(`${where}: unexpected phase`);
    }
    checkInvariants(s, where);
  }
  return s;
}

const games = Number(process.argv[2] || 200);
const tally = { fourth: 0, tenth: 0, draw: 0 };
const crisis = { SQ: 0, SOF: 0, LIM: 0, LSCO: 0 };
let tasksDone = 0;
let tasksTotal = 0;
let scoreSum = 0;
test(`${games} full AI-vs-AI campaigns complete with invariants intact`, () => {
  for (let seed = 1; seed <= games; seed++) {
    const s = playGame(seed, 6);
    tally[s.winner || "draw"]++;
    s.history.forEach((h) => h.crisis.forEach((c) => crisis[c.type]++));
    scoreSum += s.teams.fourth.score + s.teams.tenth.score;
    s.log.forEach((l) => {
      if (/succeeds|takes effect|RSOI complete|DISRUPTION/.test(l.text)) tasksDone++;
      if (/succeeds|takes effect|RSOI complete|DISRUPTION|FAILS/.test(l.text)) tasksTotal++;
    });
  }
});
test("neither army is favoured when both are played by the Regular AI", () => {
  if (games < 100) return; // too few games to tell
  const decided = tally.fourth + tally.tenth;
  const share = Math.max(tally.fourth, tally.tenth) / decided;
  // 200 games put the share within about +-7 points. Since the Nov 2026 ASOS ruling
  // Fourth Army wins about 60%; this guards against sliding back to the old 2:1.
  assert.ok(share < 0.65, `one army wins ${Math.round(share * 100)}% of decided games: ${JSON.stringify(tally)}`);
});
test("zone win chance is a probability and moves with the trackers", () => {
  const s = E.newGame({ seed: 3 });
  const before = AI.winChance(s, "fourth", "B");
  assert.ok(before > 0 && before < 1);
  s.teams.fourth.zones.B.infrastructure = 7;
  s.teams.fourth.zones.B.partnerCap = 7;
  assert.ok(AI.winChance(s, "fourth", "B") > before, "more and bigger dice must raise the chance");
  assert.ok(Math.abs(AI.winChance(s, "fourth", "B") + AI.winChance(s, "tenth", "B") - 1) < 1e-9);
});
test("ASOS needs a card of every listed type, not just the points", () => {
  const s = E.newGame({ seed: 4 });
  const byCode = (code) => Object.keys(s.cards).filter((id) => R.cap(id) && R.cap(id).code === code && R.cap(id).points > 0).sort((a, b) => R.cap(b).points - R.cap(a).points);
  const req = { points: 3, types: ["SUST", "MP"] };
  const sust = byCode("SUST");
  const mp = byCode("MP");
  assert.ok(sust.length >= 2 && mp.length >= 1, "test needs SUST and MP cards");
  const onlySust = R.checkAsos(sust.slice(0, 2), req);
  assert.ok(onlySust.total >= 3 && !onlySust.ok, "Sustainment alone must not satisfy Sustainment + Military Police");
  assert.deepStrictEqual(onlySust.missing, ["MP"]);
  assert.ok(R.checkAsos([sust[0], mp[0]], req).ok || R.cap(sust[0]).points + R.cap(mp[0]).points < 3);
  const auto = R.autoAsos(sust.concat(mp), req);
  assert.ok(auto && R.checkAsos(auto, req).ok, "auto-select must find a valid mix");
  assert.ok(auto.some((id) => R.cap(id).code === "MP") && auto.some((id) => R.cap(id).code === "SUST"));
  assert.strictEqual(R.autoAsos(sust, req), null, "no MP available means the request cannot be met");
});
test("each finished turn stores a record for the adjudicator export", () => {
  const s = playGame(9, 2);
  assert.strictEqual(s.history.length, 2);
  const r = s.history[0].record;
  assert.ok(r && r.taskLimit >= 3 && r.crisis.length === 3 && Array.isArray(r.tasks.fourth) && r.trackers.tenth.zones.B);
  r.tasks.fourth.forEach((t) => assert.ok(t.num && t.zone && t.status));
});

test("rules.json is valid and rules.generated.js is up to date", () => {
  const { build } = require(path.join(__dirname, "..", "tools", "build_rules.js"));
  const r = build();
  assert.deepStrictEqual(r.errors, []);
  const onDisk = require("fs").readFileSync(path.join(__dirname, "..", "js", "rules.generated.js"), "utf8").replace(/\r\n/g, "\n");
  assert.strictEqual(onDisk, r.text, "run: node game/tools/build_rules.js");
});
test("the rules schema catches typos and impossible values", () => {
  const fs = require("fs");
  const { validate } = require(path.join(__dirname, "..", "tools", "build_rules.js"));
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "rules.schema.json"), "utf8"));
  const good = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "rules.json"), "utf8"));
  const check = (change) => {
    const d = JSON.parse(JSON.stringify(good));
    change(d);
    const errors = [];
    validate(schema, d, schema, "rules", errors);
    return errors;
  };
  assert.strictEqual(check(() => {}).length, 0);
  assert.ok(check((d) => (d.tasks[0].staff = ["PLANZ"])).length, "unknown staff code");
  assert.ok(check((d) => (d.tasks[3].effects.intell = 1)).length, "misspelt tracker");
  assert.ok(check((d) => (d.start.fourth.zones.A.assurance = 9)).length, "tracker value above 7");
  assert.ok(check((d) => delete d.tasks[5].points).length, "missing field");
});
test("a campaign record has the fields the analysis tool reads", () => {
  const rec = E.campaignRecord(playGame(11, 2));
  assert.strictEqual(rec.format, "theatercomplex-campaign-record");
  assert.strictEqual(rec.turns.length, 2);
  assert.deepStrictEqual(rec.players, { fourth: "ai:normal", tenth: "ai:normal" });
  const t = rec.turns[0];
  ["taskLimit", "tasks", "crisis", "trackers", "rffArrived", "scoreAfter"].forEach((k) => assert.ok(k in t, `turn record lacks ${k}`));
  assert.ok(rec.scoreBySource.fourth.some((r) => r.key === "wins"));
});
test("same seed replays identically", () => {
  const a = playGame(42, 3);
  const b = playGame(42, 3);
  assert.deepStrictEqual(a.log, b.log);
});

// ---------------------------------------------------------------- AI difficulty
// Each level faces a Regular AI from both sides; a harder AI must win more.
const levelStats = {};
["easy", "hard"].forEach((level) => {
  test(`${level} AI plays complete campaigns`, () => {
    let wins = 0;
    let losses = 0;
    for (let seed = 1; seed <= 60; seed++) {
      TC.TEAMS.forEach((team) => {
        const s = playGame(1000 + seed, 6, { aiLevelByTeam: { [team]: level, [TC.other(team)]: "normal" } });
        if (s.winner === team) wins++;
        else if (s.winner) losses++;
      });
    }
    levelStats[level] = { wins, losses };
  });
});
test("Recruit is easier than Regular", () => {
  assert.ok(levelStats.easy.wins < levelStats.easy.losses, `Recruit should lose more than it wins vs Regular: ${JSON.stringify(levelStats.easy)}`);
});
test("Aggressive is clearly stronger than Regular", () => {
  // Measured 84-28 over these 120 games once Aggressive started managing its
  // deterrence posture; 1.5:1 leaves room for noise.
  assert.ok(levelStats.hard.wins >= levelStats.hard.losses * 1.5, `Aggressive should beat Regular at least 3 games in 5: ${JSON.stringify(levelStats.hard)}`);
});
test("posture value rewards being one above the enemy in an evenly matched zone", () => {
  const s = E.newGame({ seed: 6 });
  const theirs = R.deterrence(s, "tenth", "B");
  const v = (d) => AI.postureValue(s, "fourth", "B", d);
  assert.ok(Number.isFinite(v(theirs)));
  assert.ok(v(theirs + 1) > v(theirs), "one above the enemy earns the calm-crisis point");
});
test("the optional head start gives Tenth Army points and shows in the breakdown", () => {
  const s = E.newGame({ seed: 8, settings: { tenthHeadStart: 2 } });
  assert.strictEqual(s.teams.tenth.score, 2);
  assert.strictEqual(s.teams.fourth.score, 0);
  assert.strictEqual(E.scoreBreakdown(s, "tenth").find((r) => r.key === "headStart").pts, 2);
  assert.strictEqual(E.newGame({ seed: 8 }).teams.tenth.score, 0, "off by default");
});
test("decision events are recorded and left out of a record until their turn is over", () => {
  const s = E.newGame({ seed: 8 });
  E.logEvent(s, "fourth", "plan-add", { task: 3, zone: "B" });
  assert.strictEqual(s.events.length, 1);
  assert.deepStrictEqual([s.events[0].turn, s.events[0].army, s.events[0].action, s.events[0].task], [1, "fourth", "plan-add", 3]);
  assert.strictEqual(E.campaignRecord(s).events.length, 0, "turn 1 is still being played");
  s.turn = 2;
  assert.strictEqual(E.campaignRecord(s).events.length, 1);
});
test("Aggressive AI uses Disruption", () => {
  const s = playGame(7, 6, { aiLevel: "hard" });
  assert.ok(s.log.some((l) => /DISRUPTION/.test(l.text)), "no Disruption played in a whole campaign");
});
test("suggestions are read-only and point at feasible tasks", () => {
  const s = E.newGame({ seed: 5 });
  E.rollTaskLimit(s);
  TC.TEAMS.forEach((t) => AI.allocateAsos(s, t));
  E.beginPlanning(s);
  const rng = s.rng;
  const sugg = AI.suggestions(s, "fourth");
  assert.strictEqual(s.rng, rng, "suggestions must not consume dice");
  assert.ok(sugg.length > 0, "no suggestions on turn 1");
  sugg.forEach((x) => assert.ok(E.evaluateTask(s, "fourth", { num: x.num, zone: x.zone }).ok || TC.taskByNum(x.num).branches, `task ${x.num} in ${x.zone} not feasible`));
  AI.planTasks(s, "fourth", { noise: 0, limit: s.taskLimit });
  assert.strictEqual(s.rng, rng, "a zero-noise plan must not consume dice");
  assert.ok(s.plans.fourth.tasks.length > 0);
});

console.log(`AI difficulty vs Regular (wins-losses over 120 games): Recruit ${levelStats.easy?.wins}-${levelStats.easy?.losses}, Aggressive ${levelStats.hard?.wins}-${levelStats.hard?.losses}`);
console.log(`${passed} tests passed${process.exitCode ? " (with failures)" : ""}.`);
console.log(`Balance over ${games} AI games: Fourth ${tally.fourth}, Tenth ${tally.tenth}, draws ${tally.draw}; avg combined score ${(scoreSum / games).toFixed(1)}`);
console.log(`Crisis types: ${JSON.stringify(crisis)}; tasks executed ${tasksDone}/${tasksTotal} (${(tasksDone / games / 6).toFixed(1)} per game-turn for both armies)`);
