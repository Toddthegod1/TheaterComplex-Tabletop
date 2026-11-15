// AI-vs-AI baseline: what the game's AI does, and what winning sides do differently.
//
//   node game/tools/baseline.js [games] [level]        default: 300 games, Regular AI
//   node game/tools/baseline.js 300 normal --records out/records 20
//        also saves 20 campaign records (the same files the game exports) to try
//        game/tools/analyze.js on.
//
// Writes:
//   game/js/baseline.generated.js   "par" scores the game shows next to a player's own
//   docs/ai-baseline.md             the report, for people
//
// Read the results as "what this AI does", not "the best possible play": the AI
// is a one-year-ahead teaching opponent. Campaigns are 10 turns so the par
// covers every campaign length the game offers.
const fs = require("fs");
const path = require("path");
const { TC, E, playGame, taskGroups, GROUP_LABEL } = require("./sim");

const args = process.argv.slice(2);
const games = Number(args[0]) || 300;
const level = args[1] && !args[1].startsWith("--") ? args[1] : "normal";
const recAt = args.indexOf("--records");
const recDir = recAt >= 0 ? args[recAt + 1] : null;
const recCount = recAt >= 0 ? Number(args[recAt + 2]) || 20 : 0;
const TURNS = 10;
const ROOT = path.join(__dirname, "..", "..");

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (x) => `${Math.round(x * 100)}%`;
const blank = () => ({ games: 0, wins: 0, score: Array.from({ length: TURNS }, () => []), scoreWin: Array.from({ length: TURNS }, () => []), tasks: 0, limit: 0, zone: { A: 0, B: 0, C: 0 }, zoneWin: { A: 0, B: 0, C: 0 }, zoneLoss: { A: 0, B: 0, C: 0 }, group: {}, groupWin: {}, groupLoss: {}, disrupt: 0, rff: 0, failed: 0, sources: {}, task: {}, opening: {} });
const stats = { fourth: blank(), tenth: blank() };
let draws = 0;

for (let seed = 1; seed <= games; seed++) {
  const s = playGame(seed, TURNS, { aiLevel: level });
  if (!s.winner) draws++;
  if (recDir && seed <= recCount) {
    fs.mkdirSync(recDir, { recursive: true });
    fs.writeFileSync(path.join(recDir, `ai-${level}-seed${seed}.json`), JSON.stringify(E.campaignRecord(s), null, 1));
  }
  TC.TEAMS.forEach((team) => {
    const st = stats[team];
    const won = s.winner === team;
    const lost = s.winner && !won;
    st.games++;
    if (won) st.wins++;
    s.history.forEach((h, i) => {
      st.score[i].push(h.score[team]);
      if (won) st.scoreWin[i].push(h.score[team]);
      const rec = h.record;
      st.limit += rec.taskLimit;
      st.rff += rec.rffArrived[team];
      const played = rec.tasks[team];
      if (i === 0) {
        const key = played.map((t) => t.num).sort((a, b) => a - b).join("+");
        st.opening[key] = (st.opening[key] || 0) + 1;
      }
      played.forEach((t) => {
        st.tasks++;
        if (t.status === "failed") st.failed++;
        if (t.disruption) st.disrupt++;
        st.zone[t.zone]++;
        if (won) st.zoneWin[t.zone]++;
        if (lost) st.zoneLoss[t.zone]++;
        const row = (st.task[t.num] = st.task[t.num] || { win: 0, loss: 0, all: 0, zone: { A: 0, B: 0, C: 0 } });
        row.all++;
        row.zone[t.zone]++;
        if (won) row.win++;
        if (lost) row.loss++;
        Object.entries(taskGroups(t)).forEach(([g, v]) => {
          st.group[g] = (st.group[g] || 0) + v;
          if (won) st.groupWin[g] = (st.groupWin[g] || 0) + v;
          if (lost) st.groupLoss[g] = (st.groupLoss[g] || 0) + v;
        });
      });
    });
    E.scoreBreakdown(s, team).forEach((r) => (st.sources[r.key] = (st.sources[r.key] || 0) + r.pts));
  });
}

// ---------------------------------------------------------------- summarise
const share = (o) => {
  const total = Object.values(o).reduce((x, y) => x + y, 0) || 1;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round((v / total) * 100) / 100]));
};
const out = { level, games, turns: TURNS, draws, armies: {} };
TC.TEAMS.forEach((team) => {
  const st = stats[team];
  const losses = st.games - st.wins - draws;
  out.armies[team] = {
    winRate: Math.round((st.wins / st.games) * 100) / 100,
    par: st.score.map((a) => r1(mean(a))),
    parWhenWinning: st.scoreWin.map((a) => r1(mean(a))),
    tasksPerTurn: r1(st.tasks / st.games / TURNS),
    slotsUsed: Math.round((st.tasks / st.limit) * 100) / 100,
    zoneShare: share(st.zone),
    zoneShareWhenWinning: share(st.zoneWin),
    zoneShareWhenLosing: share(st.zoneLoss),
    effectShare: share(st.group),
    effectShareWhenWinning: share(st.groupWin),
    effectShareWhenLosing: share(st.groupLoss),
    disruptionsPerGame: r1(st.disrupt / st.games),
    rffPerTurn: r1(st.rff / st.games / TURNS),
    failedTasksPerGame: r1(st.failed / st.games),
    pointsBySource: Object.fromEntries(Object.entries(st.sources).map(([k, v]) => [k, r1(v / st.games)])),
    // How often each task is played per campaign by sides that went on to win or lose.
    tasks: Object.fromEntries(
      Object.entries(st.task).map(([num, r]) => [num, { perGame: r1(r.all / st.games), perWin: r1(r.win / Math.max(1, st.wins)), perLoss: r1(r.loss / Math.max(1, losses)), zone: share(r.zone) }])
    ),
    openings: Object.entries(st.opening).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => ({ tasks: k.split("+").map(Number), share: Math.round((n / st.games) * 100) / 100 })),
  };
});

fs.writeFileSync(
  path.join(ROOT, "game", "js", "baseline.generated.js"),
  `// GENERATED by game/tools/baseline.js (${games} AI-vs-AI campaigns, ${TC.ai.LEVELS[level].label} AI). Do not edit.\n(globalThis.TC = globalThis.TC || {}).BASELINE = ${JSON.stringify(out)};\n`
);

// ---------------------------------------------------------------- report
const name = (t) => TC.TEAM_INFO[t].name;
const taskName = (n) => `${n} ${TC.taskByNum(Number(n)).name}`;
const lines = [];
lines.push(`# AI-vs-AI baseline`, "");
lines.push(`${games} simulated ${TURNS}-turn campaigns, both armies played by the **${TC.ai.LEVELS[level].label}** AI. Regenerate with \`node game/tools/baseline.js\`.`, "");
lines.push(`Read this as "what the game's AI does and what its winning sides did differently", not as proven best play. The AI plans one year at a time. Differences between winners and losers are associations, not causes: a side that is already ahead can afford different tasks.`, "");
lines.push(`## Results`, "", `| | Fourth Army | Tenth Army |`, `|---|---|---|`);
const row = (label, f) => lines.push(`| ${label} | ${f("fourth")} | ${f("tenth")} |`);
row("Campaigns won", (t) => `${stats[t].wins} (${pct(out.armies[t].winRate)})`);
lines.push(`| Draws | ${draws} | |`);
row("Tasks played per turn", (t) => out.armies[t].tasksPerTurn);
row("Task slots used", (t) => pct(out.armies[t].slotsUsed));
row("Tasks played as Disruption, per campaign", (t) => out.armies[t].disruptionsPerGame);
row("Requested forces (RFF) arriving per turn", (t) => out.armies[t].rffPerTurn);
row("Tasks that failed, per campaign", (t) => out.armies[t].failedTasksPerGame);
lines.push("", `## Par: average score after each turn`, "", `The game shows this next to a player's own score. "When winning" is the average over campaigns that army went on to win.`, "");
lines.push(`| Turn | ${Array.from({ length: TURNS }, (_, i) => i + 1).join(" | ")} |`, `|---|${"---|".repeat(TURNS)}`);
TC.TEAMS.forEach((t) => {
  lines.push(`| ${name(t)} | ${out.armies[t].par.join(" | ")} |`);
  lines.push(`| ${name(t)}, when winning | ${out.armies[t].parWhenWinning.join(" | ")} |`);
});
lines.push("", `## Where the points come from (average per campaign)`, "", `| Source | Fourth Army | Tenth Army |`, `|---|---|---|`);
[["wins", "Zone wins"], ["bonus", "Objective-zone bonus"], ["detUp", "Deterrence lead in calm crises"], ["detDown", "Deterrence lead in violent crises"], ["influence", "Influence lead"], ["overtask", "Over-tasked MSCs"]].forEach(([k, l]) => row(l, (t) => out.armies[t].pointsBySource[k] || 0));
lines.push("", `## Where tasks are played`, "", `Share of all tasks by zone. Zone A is Fourth Army's home and Tenth Army's objective; Zone C is the reverse.`, "", `| | Zone A | Zone B | Zone C |`, `|---|---|---|---|`);
TC.TEAMS.forEach((t) => {
  const a = out.armies[t];
  lines.push(`| ${name(t)}, all campaigns | ${pct(a.zoneShare.A)} | ${pct(a.zoneShare.B)} | ${pct(a.zoneShare.C)} |`);
  lines.push(`| ${name(t)}, when winning | ${pct(a.zoneShareWhenWinning.A)} | ${pct(a.zoneShareWhenWinning.B)} | ${pct(a.zoneShareWhenWinning.C)} |`);
  lines.push(`| ${name(t)}, when losing | ${pct(a.zoneShareWhenLosing.A)} | ${pct(a.zoneShareWhenLosing.B)} | ${pct(a.zoneShareWhenLosing.C)} |`);
});
lines.push("", `## What the tasks are spent on`, "", `Share of tracker changes by kind.`, "", `| | ${Object.values(GROUP_LABEL).join(" | ")} |`, `|---|---|---|---|---|`);
TC.TEAMS.forEach((t) => {
  const a = out.armies[t];
  const cells = (o) => Object.keys(GROUP_LABEL).map((g) => pct(o[g] || 0)).join(" | ");
  lines.push(`| ${name(t)}, when winning | ${cells(a.effectShareWhenWinning)} |`);
  lines.push(`| ${name(t)}, when losing | ${cells(a.effectShareWhenLosing)} |`);
});
TC.TEAMS.forEach((t) => {
  const a = out.armies[t];
  const rows = Object.entries(a.tasks).sort((x, y) => y[1].perGame - x[1].perGame);
  lines.push("", `## ${name(t)}: task cards`, "", `Times played per campaign. "Best zone" is where it was played most.`, "", `| Task | Per campaign | When winning | When losing | Best zone |`, `|---|---|---|---|---|`);
  rows.forEach(([num, r]) => {
    const z = Object.entries(r.zone).sort((x, y) => y[1] - x[1])[0];
    lines.push(`| ${taskName(num)} | ${r.perGame} | ${r.perWin} | ${r.perLoss} | ${z[0]} (${pct(z[1])}) |`);
  });
  lines.push("", `Most common first-turn task sets: ${a.openings.map((o) => `${o.tasks.map((n) => TC.taskByNum(n).name).join(", ")} (${pct(o.share)})`).join("; ")}.`);
});
lines.push("");
fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "docs", "ai-baseline.md"), lines.join("\n"));

console.log(`${games} campaigns (${TC.ai.LEVELS[level].label} AI): Fourth ${stats.fourth.wins}, Tenth ${stats.tenth.wins}, draws ${draws}`);
console.log(`Par after 6 turns: Fourth ${out.armies.fourth.par[5]}, Tenth ${out.armies.tenth.par[5]}`);
console.log(`Wrote game/js/baseline.generated.js and docs/ai-baseline.md${recDir ? ` and ${Math.min(recCount, games)} records in ${recDir}` : ""}`);
