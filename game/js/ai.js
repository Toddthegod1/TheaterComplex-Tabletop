// Heuristic AI commander. Uses only engine actions, so it plays by the same
// rules as a human. Good enough to teach against; not a grandmaster.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = TC.rules;
  const E = TC.engine;
  const AI = (TC.ai = {});

  const expectedDie = (sides) => (sides + 1) / 2;

  // Opponent styles. noise: random spread added to each option's value.
  // taskCut: plan this many fewer tasks than the limit. contest/base: weight
  // each option by how contested its zone is (base + contest at a 50:50 zone,
  // base alone where the zone is already won or lost). disrupt: play a task
  // as Disruption when it hurts the enemy clearly more than it helps itself.
  // Simulation, 200 games: without the contest weighting Fourth Army won 2:1,
  // because Tenth Army poured tasks into Zone A, which it cannot take. With it,
  // and with the Nov 2026 ASOS ruling (every listed type needed), Regular
  // against itself gives Fourth 334, Tenth 244 over 600 games (58% of decided
  // games; 200 games swing by +-7 points). What is left is the home zones:
  // Zone A pays Fourth slightly more than Zone C pays Tenth. posture: choose
  // each zone's deterrence by expected points and move combat units to match;
  // with it Aggressive beats Regular 84-28 over 120 games (it was level
  // before). Recruit loses about 3:1.
  AI.LEVELS = {
    easy: { label: "Recruit", noise: 1.6, taskCut: 2 },
    normal: { label: "Regular", noise: 0.3, taskCut: 0, contest: 1.5, base: 0.25 },
    hard: { label: "Aggressive", noise: 0.3, taskCut: 0, contest: 1.5, base: 0.25, disrupt: true, posture: true },
  };
  // The human player's operations officer always advises like a Regular.
  const ADVISOR = AI.LEVELS.normal;
  // settings.aiLevelByTeam (optional) gives each army its own level; tests use it.
  AI.level = (state, team) => AI.LEVELS[(state.settings.aiLevelByTeam || {})[team] || state.settings.aiLevel] || AI.LEVELS.normal;

  // How much a set of tracker changes is worth to `team` in `zone`.
  AI.effectValue = function (state, team, zone, effects) {
    const me = state.teams[team];
    const opp = state.teams[TC.other(team)];
    const z = me.zones[zone];
    const oz = opp.zones[zone];
    let v = 0;
    Object.entries(effects).forEach(([key, d]) => {
      if (!d) return;
      if (key === "influence") {
        v += d * (me.influence < TC.INFLUENCE_MAX ? 1.3 : 0.1) + (me.influence + d > opp.influence && me.influence <= opp.influence ? 1 : 0);
        if (me.influence > opp.influence && me.influence + d <= opp.influence) v -= 1; // loses the Influence lead
      }
      else if (key === "access") v += d * (me.access[zone] < 3 ? 0.9 : 0.4);
      else if (key === "assurance") {
        const after = R.clamp(z.assurance + d, 1, 7);
        if (after >= 6 && d > 0) v -= 2.5;
        else v += (after - z.assurance) * (Math.min(z.assurance, after) <= 2 ? 2.2 : 0.9);
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
        if (z[key] > oz[key] && after <= oz[key]) v -= 2.8; // loses the advantage
        else if (z[key] <= oz[key] && after > oz[key]) v += 2.8;
        else if (after > z[key] && z[key] < oz[key]) v += 0.8;
        else if (after > z[key] && z[key] - oz[key] === 1) v += 0.5;
        else v += 0.15 * (after - z[key]);
      }
    });
    if (zone === TC.TEAM_INFO[team].objectiveZone) v *= 1.15;
    return v;
  };

  // ---------------------------------------------------------------- zone outlook
  const phi = (x) => 1 / (1 + Math.exp(-1.702 * x)); // logistic stand-in for the normal CDF
  // Chance (0..1) that `team` out-rolls the enemy in `zone` in a non-violent crisis.
  AI.winChance = function (state, team, zone) {
    const opp = TC.other(team);
    const stats = (t) => {
      const p = R.readiness(state, t, zone);
      let mean = 0;
      let vr = 0;
      p.theater.forEach((d) => ((mean += expectedDie(d.sides) + p.drm), (vr += (d.sides * d.sides - 1) / 12)));
      p.partner.forEach((d) => ((mean += expectedDie(d.sides)), (vr += (d.sides * d.sides - 1) / 12)));
      return { mean, vr };
    };
    const a = stats(team);
    const b = stats(opp);
    const za = state.teams[team].zones[zone];
    const zb = state.teams[opp].zones[zone];
    let diff = a.mean - b.mean;
    [["intel", 1], ["comms", 1.2], ["protection", 1.4]].forEach(([k, w]) => (diff += za[k] > zb[k] ? w : zb[k] > za[k] ? -w : 0));
    return phi(diff / (Math.sqrt(a.vr + b.vr) || 1));
  };
  function* specVariants(task) {
    const branches = task.branches ? task.branches.map((b) => b.key) : [null];
    const opts = [[]].concat((task.options || []).map((o) => [o.key]));
    for (const b of branches) for (const o of opts) yield { branch: b, options: o };
  }

  // Value of one feasible way to play a task (no randomness), or null.
  function scoreSpec(state, team, task, spec, lvl) {
    const ev = E.evaluateTask(state, team, spec);
    if (!ev.ok) return null;
    const load = E.commandLoad(state, team);
    if (ev.commands.some((id) => (load[id] || 0) >= TC.MSC_FREE_SLOTS)) return null; // avoid over-tasking
    let value;
    if (task.special === "rsoi") value = E.gfmCaps(state, team).length ? 2.2 : 0;
    else {
      value = AI.effectValue(state, team, spec.zone, ev.req.effects);
      if (lvl && lvl.contest) {
        // Spend effort where the zone is still in play, less where it is already won or lost.
        const p = AI.winChance(state, team, spec.zone);
        value *= lvl.base + lvl.contest * 4 * p * (1 - p);
      }
      if (Object.keys(ev.req.oppEffects).length) value += state.teams[TC.other(team)].influence > 0 ? 1.4 : 0;
    }
    value -= (task.cost.influence || 0) * 0.9 + (task.cost.access || 0) * 0.35;
    value -= Math.max(0, ev.capTotal - ev.points) * 0.08 + ev.caps.length * 0.05;
    return value;
  }

  // opts.noise: random spread (0 = deterministic, uses no dice).
  // opts.limit: stop at this many tasks.
  AI.planTasks = function (state, team, opts = {}) {
    const plan = state.plans[team];
    const lvl = AI.level(state, team);
    const noise = opts.noise ?? lvl.noise;
    const limit = opts.limit ?? Math.max(Math.min(2, state.taskLimit), state.taskLimit - lvl.taskCut);
    let guard = 0;
    while (plan.tasks.length < limit && guard++ < 30) {
      let best = null;
      TC.TASKS.forEach((task) => {
        if (plan.tasks.some((t) => t.num === task.num)) return;
        TC.ZONES.forEach((zone) => {
          for (const variant of specVariants(task)) {
            const spec = Object.assign({ num: task.num, zone }, variant);
            let value = scoreSpec(state, team, task, spec, opts.advisor ? ADVISOR : lvl);
            if (value === null) continue;
            if (noise) value += R.random(state) * noise; // a little personality
            if (!best || value > best.value) best = { value, spec };
          }
        });
      });
      if (!best || best.value <= 0.3) break;
      const r = E.planTask(state, team, best.spec);
      if (!r.ok) break;
    }
  };

  // Planning hints for a human: the best zone and value for each unplanned
  // task card, keeping only the top `n` worthwhile ones. Read-only.
  AI.suggestions = function (state, team, n = 3) {
    const plan = state.plans[team];
    const out = [];
    TC.TASKS.forEach((task) => {
      if (plan.tasks.some((t) => t.num === task.num)) return;
      let best = null;
      TC.ZONES.forEach((zone) => {
        for (const variant of specVariants(task)) {
          const spec = Object.assign({ num: task.num, zone }, variant);
          const value = scoreSpec(state, team, task, spec, ADVISOR);
          if (value !== null && (!best || value > best.value)) best = { num: task.num, zone, value };
        }
      });
      if (best && best.value > 0.3) out.push(best);
    });
    return out.sort((a, b) => b.value - a.value).slice(0, n);
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

    const opp = TC.other(team);
    // Aggressive: work out which deterrence level pays best in each zone and move forces to match.
    if (AI.level(state, team).posture) AI.planPosture(state, team, gfm);
    // Otherwise: aim to match the opponent (+1), never far above it.
    else TC.ZONES.forEach((zone) => {
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

  // ---------------------------------------------------------------- force posture (Aggressive)
  // Expected points swing for `team` in `zone` at a Crisis Assessment if its
  // deterrence there were `det`: zone win and objective bonus by crisis type,
  // the +1 / -3 for holding the higher deterrence, and how the deterrence gap
  // moves Instability (and so how often the crisis turns violent).
  AI.postureValue = function (state, team, zone, det) {
    const opp = TC.other(team);
    const oppDet = R.deterrence(state, opp, zone);
    const stats = (t, d) => {
      const z = state.teams[t].zones[zone];
      const dice = [R.legend("deterrence", zone, d)];
      for (let i = 0; i < R.legend("infrastructure", zone, z.infrastructure); i++) dice.push(6);
      const drm = R.legend("stockage", zone, z.stockage);
      let mean = dice.reduce((x, sd) => x + expectedDie(sd) + drm, 0);
      let vr = dice.reduce((x, sd) => x + (sd * sd - 1) / 12, 0);
      const partner = [R.legend("partnerCap", zone, z.partnerCap)];
      for (let i = 0; i < R.legend("interop", zone, z.interop); i++) partner.push(4);
      partner.forEach((sd) => ((mean += expectedDie(sd)), (vr += (sd * sd - 1) / 12)));
      return { mean, vr, violent: d + R.assuranceInstability(z.assurance) };
    };
    const a = stats(team, det);
    const b = stats(opp, oppDet);
    const za = state.teams[team].zones[zone];
    const zb = state.teams[opp].zones[zone];
    let diff = a.mean - b.mean;
    [["intel", 1], ["comms", 1.2], ["protection", 1.4]].forEach(([k, w]) => (diff += za[k] > zb[k] ? w : zb[k] > za[k] ? -w : 0));
    const sd = Math.sqrt(a.vr + b.vr) || 1;
    const inst = Math.abs(det - oppDet) + R.assuranceInstability(za.assurance) + R.assuranceInstability(zb.assurance);
    const odds = R.crisisOdds(inst);
    const myBonus = zone === TC.TEAM_INFO[team].objectiveZone;
    const oppBonus = zone === TC.TEAM_INFO[opp].objectiveZone;
    let ev = 0;
    Object.keys(odds).forEach((type) => {
      const ct = TC.CRISIS_TYPES[type];
      const pWin = phi((diff + (ct.violent ? a.violent - b.violent : 0)) / sd);
      ev += (odds[type] / 100) * (pWin * (ct.victor + (myBonus ? ct.bonus : 0)) - (1 - pWin) * (ct.victor + (oppBonus ? ct.bonus : 0)) + (det > oppDet ? ct.deterrence : det < oppDet ? -ct.deterrence : 0));
    });
    return ev;
  };
  // Moves combat units (which fill no task or ASOS requirement) between zones,
  // requests them or sends requested ones home, one move at a time, while a
  // move still improves next year's expected points.
  AI.planPosture = function (state, team, gfm) {
    const plan = state.plans[team];
    const combat = (id) => R.cap(id).points === 0;
    // Category counts per zone as they will stand after Force Tailoring.
    const counts = {};
    TC.ZONES.forEach((z) => {
      counts[z] = { 1: 0, 2: 0, 3: 0, 4: 0 };
      R.capsInZone(state, team, z).forEach((id) => state.cards[id].origin !== "secwar" && !plan.rffReturn.includes(id) && counts[z][R.cap(id).cat]++);
    });
    plan.transfers.forEach((t) => (counts[state.cards[t.id].zone][R.cap(t.id).cat]--, counts[t.to][R.cap(t.id).cat]++));
    plan.rffNew.forEach((r) => r.zone && R.cap(r.id) && counts[r.zone][R.cap(r.id).cat]++);
    const det = (z) => [1, 2, 3, 4].reduce((x, cat) => x + Math.floor(counts[z][cat] / cat), 0);
    const total = () => TC.ZONES.reduce((x, z) => x + AI.postureValue(state, team, z, det(z)), 0);
    for (let step = 0; step < 6; step++) {
      const base = total();
      let best = null;
      const consider = (gain, apply) => {
        if (gain > 0.15 && (!best || gain > best.gain)) best = { gain, apply };
      };
      const tryWith = (changes, apply) => {
        changes.forEach(([z, cat, d]) => (counts[z][cat] += d));
        const gain = total() - base;
        changes.forEach(([z, cat, d]) => (counts[z][cat] -= d));
        consider(gain, () => (changes.forEach(([z, cat, d]) => (counts[z][cat] += d)), apply()));
      };
      // Move a combat unit already in theater to another zone, or send a requested one home.
      TC.ZONES.forEach((from) => {
        const seen = {};
        R.capsInZone(state, team, from)
          .filter((id) => combat(id) && state.cards[id].origin !== "secwar" && !plan.transfers.some((t) => t.id === id) && !plan.rffReturn.includes(id))
          .forEach((id) => {
            const cat = R.cap(id).cat;
            const rff = state.cards[id].origin === "rff";
            if (seen[`${cat}${rff}`]) return; // one of each kind is enough to evaluate
            seen[`${cat}${rff}`] = 1;
            TC.ZONES.filter((to) => to !== from).forEach((to) => tryWith([[from, cat, -1], [to, cat, 1]], () => E.setTransfer(state, team, id, to)));
            if (rff) tryWith([[from, cat, -1]], () => E.toggleRffReturn(state, team, id));
          });
      });
      // Request a combat unit from the global pool.
      if (E.rffProjected(state, team) < E.RFF_LIMIT - 2) {
        const seen = {};
        gfm()
          .filter(combat)
          .forEach((id) => {
            const cat = R.cap(id).cat;
            if (seen[cat]) return;
            seen[cat] = 1;
            TC.ZONES.forEach((to) => tryWith([[to, cat, 1]], () => E.toggleRff(state, team, id, to)));
          });
      }
      if (!best) break;
      best.apply();
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
    const remaining = E.remainingTasks(state, team);
    if (!remaining.length) return null;
    if (AI.level(state, team).disrupt) {
      const pick = AI.bestDisruption(state, team);
      if (pick) return E.executeTask(state, team, pick.uid, { disrupt: true });
    }
    return E.executeTask(state, team, remaining[0].uid, { disrupt: false });
  };

  // The remaining task that hurts the enemy most when played as Disruption,
  // compared with playing it normally. Null when no swap is worth it.
  AI.bestDisruption = function (state, team) {
    const opp = TC.other(team);
    let best = null;
    E.remainingTasks(state, team).forEach((t) => {
      if (!E.canDisrupt(state, team, t.uid)) return;
      const req = R.taskRequirement(TC.taskByNum(t.num), t.branch, t.options);
      const gain = AI.effectValue(state, team, t.zone, req.effects);
      const neg = Object.fromEntries(Object.entries(req.effects).map(([k, v]) => [k, -v]));
      const harm = -AI.effectValue(state, opp, t.zone, neg);
      const edge = harm - gain;
      if (edge > 1.5 && (!best || edge > best.edge)) best = { uid: t.uid, edge };
    });
    return best;
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
