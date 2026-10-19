// Heuristic AI commander. Uses only engine actions, so it plays by the same
// rules as a human. Good enough to teach against; not a grandmaster.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = TC.rules;
  const E = TC.engine;
  const AI = (TC.ai = {});

  const expectedDie = (sides) => (sides + 1) / 2;

  // How much a set of tracker changes is worth to `team` in `zone`.
  AI.effectValue = function (state, team, zone, effects) {
    const me = state.teams[team];
    const opp = state.teams[TC.other(team)];
    const z = me.zones[zone];
    const oz = opp.zones[zone];
    let v = 0;
    Object.entries(effects).forEach(([key, d]) => {
      if (!d) return;
      if (key === "influence") v += d * (me.influence < TC.INFLUENCE_MAX ? 1.3 : 0.1) + (me.influence + d > opp.influence && me.influence <= opp.influence ? 1 : 0);
      else if (key === "access") v += d * (me.access[zone] < 3 ? 0.9 : 0.4);
      else if (key === "assurance") {
        const after = R.clamp(z.assurance + d, 1, 7);
        if (after >= 6) v -= 2.5;
        else v += (after - z.assurance) * (z.assurance <= 2 ? 2.2 : 0.9);
      } else if (key === "partnerCap") {
        const after = R.clamp(z.partnerCap + d, 1, 7);
        v += (expectedDie(R.legend("partnerCap", zone, after)) - expectedDie(R.legend("partnerCap", zone, z.partnerCap))) * 1.5 + (after - z.partnerCap) * 0.4;
      } else if (key === "infrastructure") {
        const after = R.clamp(z.infrastructure + d, 1, 7);
        v += (R.legend("infrastructure", zone, after) - R.legend("infrastructure", zone, z.infrastructure)) * 3.5 * 1.2 + (after - z.infrastructure) * 0.5;
      } else if (key === "interop") {
        const after = R.clamp(z.interop + d, 1, 7);
        v += (R.legend("interop", zone, after) - R.legend("interop", zone, z.interop)) * 2.5 * 1.2 + (after - z.interop) * 0.5;
      } else if (key === "stockage") {
        const after = R.clamp(z.stockage + d, 1, 7);
        const nDice = 1 + R.legend("infrastructure", zone, z.infrastructure);
        v += (R.legend("stockage", zone, after) - R.legend("stockage", zone, z.stockage)) * nDice * 1.2 + (after - z.stockage) * 0.3;
      } else {
        // intel / comms / protection: only the comparison matters.
        const after = R.clamp(z[key] + d, 1, 7);
        if (z[key] <= oz[key] && after > oz[key]) v += 2.8;
        else if (after > z[key] && z[key] < oz[key]) v += 0.8;
        else if (after > z[key] && z[key] - oz[key] === 1) v += 0.5;
        else v += 0.15 * (after - z[key]);
      }
    });
    if (zone === TC.TEAM_INFO[team].objectiveZone) v *= 1.15;
    return v;
  };

  function* specVariants(task) {
    const branches = task.branches ? task.branches.map((b) => b.key) : [null];
    const opts = [[]].concat((task.options || []).map((o) => [o.key]));
    for (const b of branches) for (const o of opts) yield { branch: b, options: o };
  }

  AI.planTasks = function (state, team) {
    const plan = state.plans[team];
    let guard = 0;
    while (plan.tasks.length < state.taskLimit && guard++ < 30) {
      let best = null;
      TC.TASKS.forEach((task) => {
        if (plan.tasks.some((t) => t.num === task.num)) return;
        TC.ZONES.forEach((zone) => {
          for (const variant of specVariants(task)) {
            const spec = Object.assign({ num: task.num, zone }, variant);
            const ev = E.evaluateTask(state, team, spec);
            if (!ev.ok) continue;
            const load = E.commandLoad(state, team);
            if (ev.commands.some((id) => (load[id] || 0) >= TC.MSC_FREE_SLOTS)) continue; // avoid over-tasking
            let value;
            if (task.special === "rsoi") value = E.gfmCaps(state, team).length ? 2.2 : 0;
            else {
              value = AI.effectValue(state, team, zone, ev.req.effects);
              if (Object.keys(ev.req.oppEffects).length) value += state.teams[TC.other(team)].influence > 0 ? 1.4 : 0;
            }
            value -= (task.cost.influence || 0) * 0.9 + (task.cost.access || 0) * 0.35;
            value -= Math.max(0, ev.capTotal - ev.points) * 0.08 + ev.caps.length * 0.05;
            value += R.random(state) * 0.3; // a little personality
            if (!best || value > best.value) best = { value, spec };
          }
        });
      });
      if (!best || best.value <= 0.3) break;
      const r = E.planTask(state, team, best.spec);
      if (!r.ok) break;
    }
  };

  function supportPointsIn(state, team, zone) {
    return R.capsInZone(state, team, zone).reduce((s, id) => s + R.cap(id).points, 0);
  }

  AI.planForces = function (state, team) {
    const plan = state.plans[team];
    const gfm = () => E.gfmCaps(state, team).filter((id) => !plan.rffNew.some((r) => r.id === id) && !plan.rsoi.some((r) => r.id === id) && !plan.asosCover.some((r) => r.id === id));

    // Cover any ASOS request we could not meet in theater.
    E.unmetAsos(state, team).forEach((aid) => {
      const ids = R.autoAsos(gfm(), TC.ASOS_BY_ID[aid]);
      if (ids) ids.forEach((id) => E.toggleAsosCover(state, team, id, "B"));
    });

    // Bring in up to two missing MSCs per turn that unlock tasks
    // (ENG: tasks 11/14/15, ESC: 6, MP: 19, CBRN: 20).
    let newCmds = 0;
    ["ENG", "ESC", "MP", "CBRN"].forEach((code) => {
      const id = E.gfmCommands(state, team).find((x) => R.cmd(x).code === code);
      if (id && newCmds < 2 && E.rffProjected(state, team) < E.RFF_LIMIT - 4 && E.toggleRff(state, team, id).ok) newCmds++;
    });

    // Deterrence: aim to match the opponent (+1), never far above it.
    const opp = TC.other(team);
    TC.ZONES.forEach((zone) => {
      const mine = R.deterrence(state, team, zone);
      const theirs = R.deterrence(state, opp, zone);
      let need = theirs + 1 - mine;
      const combat = gfm()
        .filter((id) => R.cap(id).points === 0)
        .sort((a, b) => R.cap(a).cat - R.cap(b).cat);
      while (need > 0 && combat.length && E.rffProjected(state, team) < E.RFF_LIMIT - 2) {
        const id = combat.shift();
        if (E.toggleRff(state, team, id, zone).ok) need -= 1 / R.cap(id).cat;
      }
    });

    // Fill the rest with high-value support capabilities where support is thin.
    let guard = 0;
    while (E.rffProjected(state, team) < E.RFF_LIMIT && guard++ < 12) {
      const support = gfm()
        .filter((id) => R.cap(id).points > 0)
        .sort((a, b) => R.cap(b).points - R.cap(a).points);
      if (!support.length) break;
      const zone = TC.ZONES.slice().sort((a, b) => supportPointsIn(state, team, a) - supportPointsIn(state, team, b))[0];
      if (!E.toggleRff(state, team, support[0], zone).ok) break;
    }

    // RSOI picks.
    if (E.hasRsoiPlanned(state, team)) {
      gfm()
        .filter((id) => R.cap(id).points > 0)
        .sort((a, b) => R.cap(b).points - R.cap(a).points)
        .slice(0, 3)
        .forEach((id, i) => E.toggleRsoi(state, team, id, TC.ZONES[i]));
    }
  };

  AI.allocateAsos = function (state, team) {
    state.asos.current.forEach((aid) => {
      if (state.asos.alloc[team][aid]) return;
      const ids = R.autoAsos(E.asosAvailable(state, team, aid), TC.ASOS_BY_ID[aid]);
      if (ids) E.allocateAsos(state, team, aid, ids);
      else E.declareAsosUnmet(state, team, aid);
    });
  };

  AI.plan = function (state, team) {
    AI.planTasks(state, team);
    AI.planForces(state, team);
    const r = E.setReady(state, team, true);
    if (!r.ok) {
      // Drop ASOS cover/RFF that cannot be satisfied and try again.
      state.plans[team].asosCover = [];
      E.setReady(state, team, true);
      if (!state.plans[team].ready) state.plans[team].ready = true;
    }
  };

  // Implementation: maybe spend Influence, then play the next task.
  AI.takeInitiative = function (state, team) {
    const me = state.teams[team];
    const opp = TC.other(team);
    TC.ZONES.forEach((zone) => {
      if (me.influence >= 5 && R.instability(state, zone) >= 4 && R.deterrence(state, team, zone) > R.deterrence(state, opp, zone)) E.spendInfluence(state, team, zone);
    });
    const next = E.remainingTasks(state, team)[0];
    if (!next) return null;
    return E.executeTask(state, team, next.uid, { disrupt: false });
  };

  AI.intelChoice = function (state, team) {
    const cur = state.crisis.current;
    const oppPool = cur.pools[TC.other(team)];
    let best = null;
    ["theater", "partner"].forEach((group) =>
      oppPool[group].forEach((d, index) => {
        if (d.sides > 4 && (!best || d.sides > best.sides)) best = { kind: "demote", group, index, sides: d.sides };
      })
    );
    if (best) return best;
    const own = cur.pools[team];
    let pick = { kind: "promote", group: "theater", index: 0, sides: own.theater[0].sides };
    ["theater", "partner"].forEach((group) =>
      own[group].forEach((d, index) => {
        if (d.sides < 12 && d.sides >= pick.sides) pick = { kind: "promote", group, index, sides: d.sides };
      })
    );
    return pick;
  };
})();
