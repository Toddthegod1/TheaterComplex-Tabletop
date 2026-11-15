// Classify players and techniques from exported campaign records.
//
//   node game/tools/analyze.js <file-or-folder> [more...] [--csv players.csv]
//
// Input: the "Campaign record (data)" files the game exports (menu or end
// screen). Each record yields one row per army: what that player did, how it
// compares with the AI baseline, and plain labels for where and how they played.
// The labels are simple, documented thresholds (see LABELS below), meant as a
// starting point for discussion, not a verdict on a student.
const fs = require("fs");
const path = require("path");
const { TC, taskGroups } = require("./sim");
try {
  require("../js/baseline.generated.js");
} catch (e) {
  /* no baseline yet: run game/tools/baseline.js to get par comparisons */
}

// ---------------------------------------------------------------- the labels
const LABELS = {
  focus: [
    ["Home defender", "at least half of all tasks in the army's home zone", (f) => f.zone.home >= 0.5],
    ["Centre fighter", "at least half of all tasks in Zone B", (f) => f.zone.B >= 0.5],
    ["Objective pusher", "at least 40% of tasks in the enemy's home zone (the army's objective)", (f) => f.zone.objective >= 0.4],
    ["Spread out", "no zone gets half the tasks", () => true],
  ],
  technique: [
    ["Dice builder", "at least 45% of tracker changes add or enlarge dice (Partner Capability, Infrastructure, Interoperability, Stockage)", (f) => f.effect.dice >= 0.45],
    ["Advantage seeker", "at least 45% go to Intelligence, Communications or Protection", (f) => f.effect.advantage >= 0.45],
    ["Shaper", "at least 40% go to Influence and Access", (f) => f.effect.shaping >= 0.4],
    ["Mixed", "no single kind dominates", () => true],
  ],
  // Any number of these can apply.
  traits: [
    ["Disruptor", "plays a task as Disruption in at least half the turns", (f) => f.disruptionsPerTurn >= 0.5],
    ["Force builder", "brings in 3 or more requested forces per turn on average", (f) => f.rffPerTurn >= 3],
    ["Leaves slots empty", "uses under 75% of the task slots", (f) => f.slotsUsed < 0.75],
    ["Escalation risk", "lost a point or more per turn, on average, for holding the higher deterrence in violent crises", (f) => f.points.detDown / f.turns <= -1],
    ["Over-tasker", "over-tasked an MSC in at least one turn in three", (f) => f.points.overtask / f.turns <= -1 / 3],
    ["Unreliable execution", "more than one task in ten failed", (f) => f.failedShare > 0.1],
  ],
};

// ---------------------------------------------------------------- read the records
const args = process.argv.slice(2);
const csvAt = args.indexOf("--csv");
const csvPath = csvAt >= 0 ? args[csvAt + 1] : null;
const inputs = args.filter((a, i) => !(csvAt >= 0 && (i === csvAt || i === csvAt + 1)));
if (!inputs.length) {
  console.log("Usage: node game/tools/analyze.js <record.json or folder> [...] [--csv players.csv]");
  process.exit(1);
}
const files = [];
inputs.forEach((p) => {
  if (fs.statSync(p).isDirectory()) fs.readdirSync(p).filter((f) => f.endsWith(".json")).forEach((f) => files.push(path.join(p, f)));
  else files.push(p);
});

const share = (o) => {
  const total = Object.values(o).reduce((x, y) => x + y, 0);
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, total ? v / total : 0]));
};
const rows = [];
const skipped = [];
files.forEach((file) => {
  let rec;
  try {
    rec = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch (e) {
    return skipped.push(`${path.basename(file)}: not readable as JSON`);
  }
  if (rec.format !== "theatercomplex-campaign-record") return skipped.push(`${path.basename(file)}: not a campaign record (use "Export campaign record", not the save file)`);
  const turns = (rec.turns || []).filter((t) => t.tasks);
  if (!turns.length) return skipped.push(`${path.basename(file)}: no finished turn with task detail`);
  TC.TEAMS.forEach((team) => {
    const home = team === "fourth" ? "A" : "C";
    const objective = team === "fourth" ? "C" : "A";
    const zone = { A: 0, B: 0, C: 0 };
    const effect = { dice: 0, advantage: 0, shaping: 0, assurance: 0 };
    const taskCount = {};
    let tasks = 0, limit = 0, disrupt = 0, failed = 0, rff = 0;
    turns.forEach((t) => {
      limit += t.taskLimit;
      rff += (t.rffArrived || t.rffRequested || {})[team] || 0;
      t.tasks[team].forEach((k) => {
        tasks++;
        zone[k.zone]++;
        if (k.disruption) disrupt++;
        if (k.status === "failed") failed++;
        taskCount[k.name] = (taskCount[k.name] || 0) + 1;
        Object.entries(taskGroups(k)).forEach(([g, v]) => (effect[g] += v));
      });
    });
    const z = share(zone);
    const points = Object.fromEntries(((rec.scoreBySource || {})[team] || []).map((r) => [r.key, r.pts]));
    ["wins", "bonus", "detUp", "detDown", "influence", "overtask"].forEach((k) => (points[k] = points[k] || 0));
    const n = turns.length;
    const last = turns[n - 1];
    const score = last.scoreAfter[team];
    const par = TC.BASELINE && TC.BASELINE.armies[team].par[Math.min(last.turn, TC.BASELINE.turns) - 1];
    const f = {
      file: path.basename(file),
      army: TC.TEAM_INFO[team].name,
      player: (rec.players || {})[team] || "unknown",
      opponent: (rec.players || {})[TC.other(team)] || "unknown",
      turns: n,
      finished: !!rec.finished,
      result: !rec.finished ? "unfinished" : rec.winner === team ? "win" : rec.winner === "draw" ? "draw" : "loss",
      score,
      opponentScore: last.scoreAfter[TC.other(team)],
      par: par == null ? null : par,
      vsPar: par == null ? null : Math.round((score - par) * 10) / 10,
      tasksPerTurn: tasks / n,
      slotsUsed: limit ? tasks / limit : 0,
      zone: { A: z.A, B: z.B, C: z.C, home: z[home], objective: z[objective] },
      effect: share(effect),
      disruptionsPerTurn: disrupt / n,
      rffPerTurn: rff / n,
      failedShare: tasks ? failed / tasks : 0,
      points,
      favourite: Object.entries(taskCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} x${v}`).join("; "),
    };
    f.focus = LABELS.focus.find((l) => l[2](f))[0];
    f.technique = LABELS.technique.find((l) => l[2](f))[0];
    f.traits = LABELS.traits.filter((l) => l[2](f)).map((l) => l[0]);
    rows.push(f);
  });
});

// ---------------------------------------------------------------- report
const pct = (x) => `${Math.round(x * 100)}%`;
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(`${files.length - skipped.length} campaign record(s), ${rows.length} player rows.${TC.BASELINE ? ` Par is the ${TC.BASELINE.level} AI's average score at the same turn.` : " No baseline found: run game/tools/baseline.js for par comparisons."}`);
skipped.forEach((s) => console.log("  skipped " + s));
console.log("");
console.log([pad("Army", 12), pad("Player", 13), pad("Result", 10), pad("Score", 9), pad("vs par", 7), pad("Where", 17), pad("How", 17), "Also"].join(" "));
rows.forEach((f) =>
  console.log([pad(f.army, 12), pad(f.player, 13), pad(f.result, 10), pad(`${f.score}-${f.opponentScore}`, 9), pad(f.vsPar == null ? "" : (f.vsPar > 0 ? "+" : "") + f.vsPar, 7), pad(f.focus, 17), pad(f.technique, 17), f.traits.join(", ") || "-"].join(" "))
);

// Which ways of playing go with winning, across everything read.
const decided = rows.filter((f) => f.result === "win" || f.result === "loss");
const table = (title, key) => {
  const groups = {};
  decided.forEach((f) => [].concat(f[key]).forEach((v) => ((groups[v] = groups[v] || { n: 0, wins: 0, score: 0 }), groups[v].n++, (groups[v].wins += f.result === "win" ? 1 : 0), (groups[v].score += f.score))));
  const list = Object.entries(groups).sort((a, b) => b[1].n - a[1].n);
  if (!list.length) return;
  console.log(`\n${title}`);
  list.forEach(([k, g]) => console.log(`  ${pad(k, 22)} ${pad(g.n + " players", 12)} won ${pad(pct(g.wins / g.n), 5)} average score ${(g.score / g.n).toFixed(1)}`));
};
if (decided.length >= 4) {
  table("Where they played, and how it went", "focus");
  table("How they played, and how it went", "technique");
  table("Traits, and how it went", "traits");
  console.log("\nWith few records these win rates are anecdotes. Treat them as questions to ask, not findings.");
}
console.log("\nWhat the labels mean:");
Object.values(LABELS).forEach((group) => group.forEach(([name, meaning]) => console.log(`  ${pad(name, 22)} ${meaning}`)));

if (csvPath) {
  const cols = ["file", "army", "player", "opponent", "turns", "finished", "result", "score", "opponentScore", "par", "vsPar", "focus", "technique", "traits", "tasksPerTurn", "slotsUsed", "zoneA", "zoneB", "zoneC", "effectDice", "effectAdvantage", "effectShaping", "effectAssurance", "disruptionsPerTurn", "rffPerTurn", "failedShare", "ptsZoneWins", "ptsObjectiveBonus", "ptsDeterrenceCalm", "ptsDeterrenceViolent", "ptsInfluence", "ptsOvertask", "favouriteTasks"];
  const num = (x) => (typeof x === "number" ? Math.round(x * 1000) / 1000 : x);
  const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const line = (f) =>
    [f.file, f.army, f.player, f.opponent, f.turns, f.finished, f.result, f.score, f.opponentScore, f.par, f.vsPar, f.focus, f.technique, f.traits.join("; "), f.tasksPerTurn, f.slotsUsed, f.zone.A, f.zone.B, f.zone.C, f.effect.dice, f.effect.advantage, f.effect.shaping, f.effect.assurance, f.disruptionsPerTurn, f.rffPerTurn, f.failedShare, f.points.wins, f.points.bonus, f.points.detUp, f.points.detDown, f.points.influence, f.points.overtask, f.favourite]
      .map((v) => q(num(v)))
      .join(",");
  fs.writeFileSync(csvPath, "﻿" + [cols.join(",")].concat(rows.map(line)).join("\r\n"));
  console.log(`\nWrote ${rows.length} rows to ${csvPath}`);
}
