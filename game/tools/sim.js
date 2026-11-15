// Shared by the command-line tools: loads the game's rules and AI (the same
// files the browser uses) and plays whole campaigns without a screen.
const path = require("path");
["data.generated.js", "rules.generated.js", "data.js", "rules.js", "engine.js", "ai.js"].forEach((f) => require(path.join(__dirname, "..", "js", f)));
const { rules: R, engine: E, ai: AI } = TC;
R.indexCards();

// Plays one AI-vs-AI campaign and returns the final game state.
// settings: any game settings, e.g. { aiLevel: "hard" } or
// { aiLevelByTeam: { fourth: "hard", tenth: "normal" } }.
function playGame(seed, turns = 6, settings = {}) {
  const s = E.newGame({ seed, settings: Object.assign({ turns }, settings), controllers: { fourth: "ai", tenth: "ai" } });
  let steps = 0;
  while (s.phase !== "gameOver") {
    if (++steps > 5000) throw new Error(`seed ${seed}: stuck in ${s.phase}`);
    if (s.phase === "taskLimit") E.rollTaskLimit(s);
    else if (s.phase === "asos") {
      TC.TEAMS.forEach((t) => AI.allocateAsos(s, t));
      E.beginPlanning(s);
    } else if (s.phase === "planning") {
      TC.TEAMS.forEach((t) => AI.plan(s, t));
      E.beginImplementation(s);
    } else if (s.phase === "implementation") {
      if (s.impl.done) E.beginCrisis(s);
      else AI.takeInitiative(s, s.impl.active);
    } else if (s.phase === "crisis") {
      const cur = s.crisis.current;
      if (cur.stage === "intel") E.chooseIntel(s, cur.intelTeam, AI.intelChoice(s, cur.intelTeam));
      else if (cur.stage === "ready") E.resolveZone(s);
      else E.nextCrisisZone(s);
    } else if (s.phase === "tailoring") {
      E.forceTailoring(s);
      E.cleanup(s);
    } else throw new Error(`unexpected phase ${s.phase}`);
  }
  return s;
}

// What kind of thing a task card changes, for describing a player's technique.
const EFFECT_GROUP = {
  partnerCap: "dice", infrastructure: "dice", interop: "dice", stockage: "dice",
  intel: "advantage", comms: "advantage", protection: "advantage",
  influence: "shaping", access: "shaping",
  assurance: "assurance",
};
const GROUP_LABEL = { dice: "more or bigger dice", advantage: "Intelligence / Communications / Protection", shaping: "Influence and Access", assurance: "Assurance" };
// The effects of one played task, given its branch and options.
function taskGroups(t) {
  const task = TC.taskByNum(t.num);
  if (!task) return {};
  const req = R.taskRequirement(task, t.branch, t.options);
  const out = {};
  Object.entries(Object.assign({}, req.effects, req.oppEffects)).forEach(([k, v]) => {
    if (v && EFFECT_GROUP[k]) out[EFFECT_GROUP[k]] = (out[EFFECT_GROUP[k]] || 0) + Math.abs(v);
  });
  return out;
}

module.exports = { TC, R, E, AI, playGame, taskGroups, EFFECT_GROUP, GROUP_LABEL };
