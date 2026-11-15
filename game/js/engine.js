// Game state machine. Every player decision is an exported action that
// validates input and mutates the state; the UI and AI only call these.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = TC.rules;
  const E = (TC.engine = {});

  // Cleanup is instant (it runs when Force Tailoring is confirmed), so the
  // phase bar shows it as part of tailoring.
  E.PHASES = [
    { key: "taskLimit", label: "Task Limit", short: "Limit", tip: "a d6 sets how many tasks each army may plan this year" },
    { key: "asos", label: "ASOS", short: "ASOS", tip: "Army Support to Other Services: lend cards to the Air Force, Navy and Marines" },
    { key: "planning", label: "Planning", short: "Plan", tip: "choose task cards and request forces, in secret" },
    { key: "implementation", label: "Implementation", short: "Execute", tip: "armies take turns executing their tasks" },
    { key: "crisis", label: "Crisis Assessment", short: "Crisis", tip: "a crisis hits each zone; both armies roll dice and score points" },
    { key: "tailoring", label: "Tailoring & Cleanup", short: "Tailor", tip: "forces arrive and leave; the next year begins" },
  ];

  const emptyPlan = () => ({ tasks: [], rffNew: [], rffReturn: [], transfers: [], rsoi: [], asosCover: [], ready: false });

  function log(state, text, opts = {}) {
    state.log.push({ turn: state.turn, phase: state.phase, team: opts.team || null, tone: opts.tone || "info", text });
  }
  E.log = log;

  function addScore(state, team, pts, reason) {
    if (!pts) return;
    state.teams[team].score += pts;
    state.scoreEvents.push({ turn: state.turn, team, pts, reason });
    log(state, `${TC.TEAM_INFO[team].name} ${pts > 0 ? "+" : ""}${pts} pt — ${reason}`, { team, tone: pts > 0 ? "good" : "bad" });
  }

  // ---------------------------------------------------------------- new game
  E.newGame = function (opts = {}) {
    R.indexCards();
    const settings = Object.assign({}, TC.DEFAULT_SETTINGS, opts.settings || {});
    const state = {
      version: 1,
      rng: (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0,
      seed: opts.seed ?? null,
      settings,
      controllers: Object.assign({ fourth: "human", tenth: "ai" }, opts.controllers || {}),
      tutorial: !!opts.tutorial,
      turn: 1,
      phase: "taskLimit",
      teams: {},
      cards: {},
      commands: {},
      taskLimit: null,
      asos: { deck: [], current: [], discard: [], alloc: { fourth: {}, tenth: {} } },
      plans: { fourth: emptyPlan(), tenth: emptyPlan() },
      impl: null,
      crisis: null,
      tailoring: null,
      instabilityReduction: { A: 0, B: 0, C: 0 },
      rsoiApproved: { fourth: false, tenth: false },
      log: [],
      scoreEvents: [],
      history: [],
      uid: 1,
    };
    state.seed = state.rng;
    TC.TEAMS.forEach((team) => {
      const s = TC.START[team];
      state.teams[team] = {
        influence: s.influence,
        access: Object.assign({}, s.access),
        zones: JSON.parse(JSON.stringify(s.zones)),
        score: 0,
        disruptionUsed: false,
      };
    });
    TC.GENERATED.capabilities.forEach((c) => {
      state.cards[c.id] = { team: c.team, zone: c.startZone, status: "ready", origin: null, arrived: 0, lockedThrough: 0 };
    });
    TC.GENERATED.commands.forEach((c) => {
      state.commands[c.id] = { team: c.team, location: c.startZone === "GFM" ? "GFM" : "THEATER", origin: null, arrived: 0 };
    });
    state.asos.deck = R.shuffle(state, TC.GENERATED.asos.map((a) => a.id));
    log(state, "Theater campaign begins. Fourth Army (black) and Tenth Army (white) take their posts.", { tone: "head" });
    secWarDraw(state);
    return state;
  };

  // ---------------------------------------------------------------- queries
  E.capIds = (state, team) => Object.keys(state.cards).filter((id) => state.cards[id].team === team);
  E.gfmCaps = (state, team) => E.capIds(state, team).filter((id) => state.cards[id].zone === "GFM");
  E.theaterCommands = (state, team) =>
    Object.keys(state.commands).filter((id) => state.commands[id].team === team && state.commands[id].location === "THEATER");
  E.gfmCommands = (state, team) =>
    Object.keys(state.commands).filter((id) => state.commands[id].team === team && state.commands[id].location === "GFM");

  E.committedCaps = function (state, team, exceptUid) {
    const set = new Set();
    state.plans[team].tasks.forEach((t) => t.uid !== exceptUid && t.caps.forEach((id) => set.add(id)));
    return set;
  };

  // Ready capability cards that can still be put toward a task (zone null = any zone).
  E.availableCaps = function (state, team, zone, exceptUid) {
    const committed = E.committedCaps(state, team, exceptUid);
    return E.capIds(state, team).filter((id) => {
      const c = state.cards[id];
      if (c.zone === "GFM" || c.status !== "ready" || committed.has(id)) return false;
      if (R.cap(id).points <= 0) return false;
      return zone == null || c.zone === zone;
    });
  };

  E.staffUsed = function (state, team, exceptUid) {
    const used = {};
    TC.STAFF_CELLS.forEach((s) => (used[s.code] = 0));
    state.plans[team].tasks.forEach((t) => t.uid !== exceptUid && t.staff.forEach((s) => used[s]++));
    return used;
  };
  E.staffFree = function (state, team, exceptUid) {
    const used = E.staffUsed(state, team, exceptUid);
    const slots = TC.GENERATED.staffSlots[team];
    const free = {};
    Object.keys(slots).forEach((k) => (free[k] = slots[k] - used[k]));
    return free;
  };

  E.commandLoad = function (state, team, exceptUid) {
    const load = {};
    E.theaterCommands(state, team).forEach((id) => (load[id] = 0));
    state.plans[team].tasks.forEach((t) => t.uid !== exceptUid && t.commands.forEach((id) => (load[id] = (load[id] || 0) + 1)));
    return load;
  };
  E.overtaskedCommands = (state, team) =>
    Object.entries(E.commandLoad(state, team))
      .filter(([, n]) => n > TC.MSC_FREE_SLOTS)
      .map(([id]) => id);

  E.reservedInfluence = (state, team) => state.plans[team].tasks.reduce((s, t) => s + (t.status === "planned" ? t.reserved.influence : 0), 0);

  E.rffInTheater = function (state, team) {
    const caps = E.capIds(state, team).filter((id) => ["rff", "asos"].includes(state.cards[id].origin) && state.cards[id].zone !== "GFM");
    const cmds = Object.keys(state.commands).filter(
      (id) => state.commands[id].team === team && state.commands[id].origin === "rff" && state.commands[id].location === "THEATER"
    );
    return { caps, cmds };
  };

  // RFF count after this turn's force tailoring if the plan is carried out.
  E.rffProjected = function (state, team) {
    const plan = state.plans[team];
    const cur = E.rffInTheater(state, team);
    let current = cur.caps.length + (state.settings.commandsCountTowardRff ? cur.cmds.length : 0);
    plan.rffReturn.forEach((id) => {
      if (state.commands[id] && !state.settings.commandsCountTowardRff) return;
      current--;
    });
    const incoming = plan.rffNew.filter((r) => state.settings.commandsCountTowardRff || !state.commands[r.id]).length + plan.asosCover.length;
    return current + incoming;
  };
  E.RFF_LIMIT = 10;

  // ---------------------------------------------------------------- phase: task limit + ASOS
  E.rollTaskLimit = function (state) {
    if (state.phase !== "taskLimit") return null;
    const roll = R.roll(state, 6);
    state.taskLimit = Math.max(3, roll);
    state.taskLimitRoll = roll;
    log(state, `Turn ${state.turn}: adjudicator rolls d6 = ${roll} → each army may plan ${state.taskLimit} tasks.`, { tone: "roll" });
    const n = state.taskLimit === 3 ? 2 : 1;
    state.asos.current = [];
    for (let i = 0; i < n; i++) {
      if (!state.asos.deck.length) {
        state.asos.deck = R.shuffle(state, state.asos.discard);
        state.asos.discard = [];
      }
      state.asos.current.push(state.asos.deck.pop());
    }
    state.asos.alloc = { fourth: {}, tenth: {} };
    state.asos.current.forEach((id) => {
      const a = TC.ASOS_BY_ID[id];
      log(state, `ASOS request: ${a.name} needs ${a.points} pts of ${a.types.join(" / ")}.`);
    });
    state.phase = "asos";
    return { roll, limit: state.taskLimit, asos: state.asos.current.slice() };
  };

  E.asosAvailable = function (state, team, exceptAsos) {
    const used = new Set();
    Object.entries(state.asos.alloc[team]).forEach(([aid, a]) => aid !== exceptAsos && (a.caps || []).forEach((id) => used.add(id)));
    return E.capIds(state, team).filter((id) => {
      const c = state.cards[id];
      return c.zone !== "GFM" && (c.status === "ready" || (c.status === "asos" && state.asos.alloc[team][exceptAsos]?.caps?.includes(id))) && !used.has(id) && R.cap(id).points > 0;
    });
  };

  E.allocateAsos = function (state, team, asosId, capIds) {
    const a = TC.ASOS_BY_ID[asosId];
    E.clearAsos(state, team, asosId);
    const avail = new Set(E.asosAvailable(state, team, asosId));
    if (!capIds.every((id) => avail.has(id))) return { ok: false, error: "Some cards are not available." };
    const chk = R.checkAsos(capIds, a);
    if (!chk.ok) return { ok: false, error: chk.missing.length ? `Every listed type is needed: add ${chk.missing.map((t) => TC.CAPABILITY_TYPES[t] || t).join(" and ")}.` : `Need ${a.points} pts of ${a.types.join(" + ")}; selected ${chk.total}.` };
    capIds.forEach((id) => (state.cards[id].status = "asos"));
    state.asos.alloc[team][asosId] = { caps: capIds.slice() };
    log(state, `${TC.TEAM_INFO[team].name} supports ${a.name} with ${capIds.map((id) => R.cap(id).name + " (" + state.cards[id].zone + ")").join(", ")}.`, { team });
    return { ok: true };
  };

  E.clearAsos = function (state, team, asosId) {
    const cur = state.asos.alloc[team][asosId];
    if (cur && cur.caps) cur.caps.forEach((id) => (state.cards[id].status = "ready"));
    delete state.asos.alloc[team][asosId];
  };

  E.canMeetAsos = (state, team, asosId) => !!R.autoAsos(E.asosAvailable(state, team, asosId), TC.ASOS_BY_ID[asosId]);

  E.declareAsosUnmet = function (state, team, asosId) {
    if (E.canMeetAsos(state, team, asosId)) return { ok: false, error: "You can meet this request with forces in theater." };
    E.clearAsos(state, team, asosId);
    state.asos.alloc[team][asosId] = { unmet: true };
    log(state, `${TC.TEAM_INFO[team].name} cannot meet ${TC.ASOS_BY_ID[asosId].name} in theater — must cover it through RFF.`, { team, tone: "bad" });
    return { ok: true };
  };

  E.asosComplete = (state, team) => state.asos.current.every((id) => state.asos.alloc[team][id]);
  E.unmetAsos = (state, team) => state.asos.current.filter((id) => state.asos.alloc[team][id]?.unmet);

  E.beginPlanning = function (state) {
    if (state.phase !== "asos" || !TC.TEAMS.every((t) => E.asosComplete(state, t))) return false;
    state.phase = "planning";
    state.plans = { fourth: emptyPlan(), tenth: emptyPlan() };
    log(state, `Planning phase — each staff has ${state.settings.planTimerMinutes ? state.settings.planTimerMinutes + " minutes" : "as long as it needs"} to build its annual campaign.`, { tone: "head" });
    return true;
  };

  // ---------------------------------------------------------------- phase: planning
  E.autoCommands = function (state, team, reqCommands, exceptUid) {
    const load = E.commandLoad(state, team, exceptUid);
    const inTheater = E.theaterCommands(state, team);
    const chosen = [];
    const missing = [];
    reqCommands
      .filter((c) => c !== "ANY")
      .forEach((code) => {
        const id = inTheater.find((x) => R.cmd(x).code === code && !chosen.includes(x));
        if (id) chosen.push(id);
        else missing.push(code);
      });
    reqCommands
      .filter((c) => c === "ANY")
      .forEach(() => {
        const id = inTheater
          .filter((x) => !chosen.includes(x) && (load[x] || 0) < TC.MSC_MAX_TASKS)
          .sort((a, b) => (load[a] || 0) - (load[b] || 0))[0];
        if (id) chosen.push(id);
        else missing.push("ANY");
      });
    return { chosen, missing };
  };

  // Validate a task spec; returns the resolved assignment plus a list of issues.
  E.evaluateTask = function (state, team, spec, exceptUid) {
    const task = TC.taskByNum(spec.num);
    const zone = spec.zone;
    const req = R.taskRequirement(task, spec.branch, spec.options);
    const issues = [];
    const plan = state.plans[team];
    const others = plan.tasks.filter((t) => t.uid !== exceptUid);
    if (others.some((t) => t.num === task.num)) issues.push("This task card is already in your campaign.");
    if (others.length >= state.taskLimit) issues.push(`Task limit reached (${state.taskLimit}).`);
    const z = state.teams[team].zones[zone];
    if (task.blocked && z.assurance >= 6) issues.push(`Assurance ${z.assurance} in Zone ${zone} blocks agreements and security cooperation.`);

    const free = E.staffFree(state, team, exceptUid);
    req.staff.forEach((s) => {
      if (free[s] <= 0) issues.push(`No ${s} staff capacity left.`);
    });

    let commands = spec.commands;
    const load = E.commandLoad(state, team, exceptUid);
    if (!commands) {
      const auto = E.autoCommands(state, team, req.commands, exceptUid);
      commands = auto.chosen;
      auto.missing.forEach((m) =>
        issues.push(m === "ANY" ? "No MSC has bandwidth left." : `Needs ${TC.COMMAND_TYPES[m]} — not in theater (request it through RFF).`)
      );
    } else {
      const inTheater = E.theaterCommands(state, team);
      if (!commands.every((id) => inTheater.includes(id))) issues.push("Assigned MSCs must be in theater.");
      const fixed = req.commands.filter((c) => c !== "ANY");
      fixed.forEach((code) => {
        if (!commands.some((id) => R.cmd(id).code === code)) issues.push(`Needs ${TC.COMMAND_TYPES[code]}.`);
      });
      if (commands.length !== req.commands.length || new Set(commands).size !== commands.length) issues.push("Assign one distinct MSC per command box.");
    }
    commands.forEach((id) => {
      if ((load[id] || 0) >= TC.MSC_MAX_TASKS) issues.push(`${R.cmd(id).short} is at maximum load.`);
    });

    const mult = R.pointsMultiplier(state, team, zone);
    const points = req.points * mult;
    const capZone = state.settings.capsMustBeInTaskZone ? zone : null;
    const avail = E.availableCaps(state, team, capZone, exceptUid);
    let caps = spec.caps;
    if (!caps) caps = req.caps.length ? R.autoCaps(avail, req.caps, points) || [] : [];
    const capCheck = R.checkCaps(caps, req.caps, points);
    if (req.caps.length) {
      if (!caps.every((id) => avail.includes(id))) issues.push("Some selected capabilities are not available in this zone.");
      if (!capCheck.ok) {
        if (capCheck.missing.length) issues.push(`Missing capability type: ${capCheck.missing.map((m) => (m === "ANY" ? "any" : m)).join(", ")}.`);
        if (capCheck.total < points) issues.push(`Capabilities total ${capCheck.total} of ${points} pts${mult > 1 ? " (doubled: Assurance 1)" : ""}.`);
        if (capCheck.invalid.length) issues.push("Some selected capabilities do not match this task.");
      }
    }

    // Costs are already reserved for planned tasks; when editing, credit back this task's own reservation.
    const self = plan.tasks.find((t) => t.uid === exceptUid);
    const haveInf = state.teams[team].influence + (self ? self.reserved.influence : 0);
    const haveAcc = state.teams[team].access[zone] + (self && self.zone === zone ? self.reserved.access : 0);
    const inf = task.cost.influence || 0;
    const acc = task.cost.access || 0;
    if (inf && haveInf < inf) issues.push(`Needs ${inf} Influence (have ${haveInf}).`);
    if (acc && haveAcc < acc) issues.push(`Needs ${acc} Access in Zone ${zone} (have ${haveAcc}).`);

    return { ok: issues.length === 0, issues, task, req, commands, caps, points, capTotal: capCheck.total, multiplier: mult };
  };

  E.planTask = function (state, team, spec) {
    if (state.phase !== "planning" || state.plans[team].ready) return { ok: false, issues: ["Not in planning."] };
    const ev = E.evaluateTask(state, team, spec);
    if (!ev.ok) return ev;
    const task = ev.task;
    const entry = {
      uid: state.uid++,
      num: task.num,
      zone: spec.zone,
      branch: task.branches ? spec.branch || task.branches[0].key : null,
      options: (spec.options || []).slice(),
      staff: ev.req.staff.slice(),
      commands: ev.commands.slice(),
      caps: ev.caps.slice(),
      reserved: { influence: task.cost.influence || 0, access: task.cost.access || 0 },
      status: "planned",
      disrupt: false,
    };
    state.teams[team].influence -= entry.reserved.influence;
    state.teams[team].access[spec.zone] -= entry.reserved.access;
    state.plans[team].tasks.push(entry);
    return { ok: true, entry };
  };

  function refund(state, team, t) {
    state.teams[team].influence = R.clamp(state.teams[team].influence + t.reserved.influence, 0, TC.INFLUENCE_MAX);
    state.teams[team].access[t.zone] = R.clamp(state.teams[team].access[t.zone] + t.reserved.access, 0, TC.ACCESS_MAX);
    t.reserved = { influence: 0, access: 0 };
  }

  E.unplanTask = function (state, team, uid) {
    const plan = state.plans[team];
    const i = plan.tasks.findIndex((t) => t.uid === uid);
    if (i < 0 || plan.ready) return false;
    refund(state, team, plan.tasks[i]);
    plan.tasks.splice(i, 1);
    if (!plan.tasks.some((t) => TC.taskByNum(t.num).special === "rsoi")) plan.rsoi = [];
    return true;
  };

  E.replanTask = function (state, team, uid, spec) {
    const plan = state.plans[team];
    const old = plan.tasks.find((t) => t.uid === uid);
    if (!old) return { ok: false, issues: ["Unknown task."] };
    const ev = E.evaluateTask(state, team, spec, uid);
    if (!ev.ok) return ev;
    E.unplanTask(state, team, uid);
    return E.planTask(state, team, spec);
  };

  // Force management selections (all validated against limits on toggle).
  function gfmTaken(plan) {
    return new Set([...plan.rffNew.map((r) => r.id), ...plan.rsoi.map((r) => r.id), ...plan.asosCover.map((r) => r.id)]);
  }

  E.toggleRff = function (state, team, id, zone) {
    const plan = state.plans[team];
    const i = plan.rffNew.findIndex((r) => r.id === id);
    if (i >= 0) {
      if (zone && plan.rffNew[i].zone !== zone) plan.rffNew[i].zone = zone;
      else plan.rffNew.splice(i, 1);
      return { ok: true };
    }
    const isCmd = !!state.commands[id];
    if (isCmd ? state.commands[id].location !== "GFM" : state.cards[id].zone !== "GFM") return { ok: false, error: "Not in the GFM pool." };
    if (gfmTaken(plan).has(id)) return { ok: false, error: "Already selected for another purpose." };
    plan.rffNew.push({ id, zone: isCmd ? null : zone || "B" });
    if (E.rffProjected(state, team) > E.RFF_LIMIT) {
      plan.rffNew.pop();
      return { ok: false, error: `No more than ${E.RFF_LIMIT} RFF forces may be in theater.` };
    }
    return { ok: true };
  };

  E.toggleRffReturn = function (state, team, id) {
    const plan = state.plans[team];
    const i = plan.rffReturn.indexOf(id);
    if (i >= 0) {
      plan.rffReturn.splice(i, 1);
      if (E.rffProjected(state, team) > E.RFF_LIMIT) {
        plan.rffReturn.splice(i, 0, id);
        return { ok: false, error: "Keeping it would exceed the RFF limit." };
      }
    } else plan.rffReturn.push(id);
    return { ok: true };
  };

  E.hasRsoiPlanned = (state, team) => state.plans[team].tasks.some((t) => TC.taskByNum(t.num).special === "rsoi");

  E.toggleRsoi = function (state, team, id, zone) {
    const plan = state.plans[team];
    const i = plan.rsoi.findIndex((r) => r.id === id);
    if (i >= 0) {
      if (zone && plan.rsoi[i].zone !== zone) plan.rsoi[i].zone = zone;
      else plan.rsoi.splice(i, 1);
      return { ok: true };
    }
    if (!E.hasRsoiPlanned(state, team)) return { ok: false, error: "Plan the RSOI task first." };
    if (plan.rsoi.length >= 3) return { ok: false, error: "RSOI brings at most 3 capabilities." };
    if (state.cards[id]?.zone !== "GFM" || gfmTaken(plan).has(id)) return { ok: false, error: "Not available." };
    plan.rsoi.push({ id, zone: zone || "B" });
    return { ok: true };
  };

  E.toggleAsosCover = function (state, team, id, zone) {
    const plan = state.plans[team];
    const i = plan.asosCover.findIndex((r) => r.id === id);
    if (i >= 0) {
      if (zone && plan.asosCover[i].zone !== zone) plan.asosCover[i].zone = zone;
      else plan.asosCover.splice(i, 1);
      return { ok: true };
    }
    if (state.cards[id]?.zone !== "GFM" || gfmTaken(plan).has(id)) return { ok: false, error: "Not available." };
    plan.asosCover.push({ id, zone: zone || "B" });
    if (E.rffProjected(state, team) > E.RFF_LIMIT) {
      plan.asosCover.pop();
      return { ok: false, error: `No more than ${E.RFF_LIMIT} RFF forces may be in theater.` };
    }
    return { ok: true };
  };

  // Does the ASOS-cover selection meet every unmet request?
  E.asosCoverStatus = function (state, team) {
    const unmet = E.unmetAsos(state, team);
    const pool = state.plans[team].asosCover.map((r) => r.id);
    const status = [];
    const used = new Set();
    unmet.forEach((aid) => {
      const a = TC.ASOS_BY_ID[aid];
      const ids = R.autoAsos(
        pool.filter((id) => !used.has(id)),
        a
      );
      if (ids) ids.forEach((id) => used.add(id));
      status.push({ asosId: aid, ok: !!ids });
    });
    return status;
  };

  E.setTransfer = function (state, team, capId, to) {
    const plan = state.plans[team];
    plan.transfers = plan.transfers.filter((t) => t.id !== capId);
    const c = state.cards[capId];
    if (!c || c.team !== team || c.zone === "GFM") return { ok: false };
    if (to && to !== c.zone) plan.transfers.push({ id: capId, to });
    return { ok: true };
  };

  E.planIssues = function (state, team) {
    const issues = [];
    const plan = state.plans[team];
    E.asosCoverStatus(state, team).forEach((s) => {
      if (!s.ok) issues.push(`Select GFM forces to cover ASOS request ${TC.ASOS_BY_ID[s.asosId].name}.`);
    });
    if (E.rffProjected(state, team) > E.RFF_LIMIT) issues.push(`RFF over limit (${E.rffProjected(state, team)}/${E.RFF_LIMIT}).`);
    if (plan.rsoi.length && !E.hasRsoiPlanned(state, team)) issues.push("RSOI forces selected without the RSOI task.");
    return issues;
  };

  E.setReady = function (state, team, ready = true) {
    if (state.phase !== "planning") return { ok: false };
    if (ready) {
      const issues = E.planIssues(state, team);
      // Unmet ASOS coverage is a soft requirement when the GFM simply cannot cover it.
      const hard = issues.filter((i) => !i.startsWith("Select GFM forces") || E.asosCoverPossible(state, team));
      if (hard.length) return { ok: false, issues: hard };
    }
    state.plans[team].ready = ready;
    if (ready) log(state, `${TC.TEAM_INFO[team].name} staff reports its campaign plan complete (${state.plans[team].tasks.length} task${state.plans[team].tasks.length === 1 ? "" : "s"}).`, { team });
    return { ok: true };
  };

  E.asosCoverPossible = function (state, team) {
    const unmet = E.unmetAsos(state, team);
    if (!unmet.length) return false;
    const gfm = E.gfmCaps(state, team);
    return unmet.every((aid) => !!R.autoAsos(gfm, TC.ASOS_BY_ID[aid]));
  };

  E.bothReady = (state) => TC.TEAMS.every((t) => state.plans[t].ready);

  // ---------------------------------------------------------------- phase: implementation
  E.beginImplementation = function (state) {
    if (state.phase !== "planning" || !E.bothReady(state)) return null;
    state.phase = "implementation";
    log(state, "Campaign Implementation — task cards move to the execution area.", { tone: "head" });
    const planOnly = [];
    TC.TEAMS.forEach((team) => {
      state.plans[team].tasks.forEach((t) => {
        const task = TC.taskByNum(t.num);
        if (task.mode === "P") {
          const req = R.taskRequirement(task, t.branch, t.options);
          const changes = R.applyEffects(state, team, t.zone, req.effects, 1);
          t.status = "done";
          t.result = { ok: true, changes, planOnly: true };
          planOnly.push({ team, uid: t.uid });
          log(state, `${TC.TEAM_INFO[team].name}: ${task.name} (plan-only) takes effect in Zone ${t.zone}: ${R.formatEffects(req.effects)}.`, { team, tone: "good" });
        }
      });
    });
    let r4, r10;
    do {
      r4 = R.roll(state, 10);
      r10 = R.roll(state, 10);
    } while (r4 === r10);
    const first = r4 > r10 ? "fourth" : "tenth";
    state.impl = { initiative: { fourth: r4, tenth: r10 }, first, active: first, order: [], commandMarkers: {} };
    log(state, `Initiative: Fourth Army d10 = ${r4}, Tenth Army d10 = ${r10}. ${TC.TEAM_INFO[first].name} plays first.`, { tone: "roll" });
    advanceInitiative(state, true);
    return { planOnly, initiative: state.impl.initiative, first };
  };

  E.remainingTasks = (state, team) => state.plans[team].tasks.filter((t) => t.status === "planned");

  function advanceInitiative(state, keep) {
    const cur = state.impl.active;
    const opp = TC.other(cur);
    if (!keep && E.remainingTasks(state, opp).length) state.impl.active = opp;
    else if (!E.remainingTasks(state, cur).length && E.remainingTasks(state, opp).length) state.impl.active = opp;
    if (!E.remainingTasks(state, "fourth").length && !E.remainingTasks(state, "tenth").length) state.impl.done = true;
  }

  E.canDisrupt = function (state, team, uid) {
    const t = state.plans[team].tasks.find((x) => x.uid === uid);
    if (!t || state.teams[team].disruptionUsed) return false;
    const task = TC.taskByNum(t.num);
    const req = R.taskRequirement(task, t.branch, t.options);
    return task.mode !== "P" && Object.keys(req.effects).length > 0;
  };

  E.executeTask = function (state, team, uid, opts = {}) {
    if (state.phase !== "implementation" || state.impl.done || state.impl.active !== team) return { ok: false, error: "Not your initiative." };
    const t = state.plans[team].tasks.find((x) => x.uid === uid && x.status === "planned");
    if (!t) return { ok: false, error: "Task not available." };
    const task = TC.taskByNum(t.num);
    const req = R.taskRequirement(task, t.branch, t.options);
    const disrupt = !!opts.disrupt && E.canDisrupt(state, team, uid);
    const result = { ok: false, team, uid, num: t.num, zone: t.zone, rolls: [], changes: [], disrupt };
    const name = TC.TEAM_INFO[team].name;

    // Commanders re-place markers one task at a time; the 3rd+ task on an MSC
    // needs a d6 roll greater than the markers now on that card.
    const markers = state.impl.commandMarkers;
    let failedRoll = false;
    t.commands.forEach((id) => {
      markers[id] = (markers[id] || 0) + 1;
      if (markers[id] > TC.MSC_FREE_SLOTS) {
        const roll = R.roll(state, 6);
        const pass = roll > markers[id];
        result.rolls.push({ command: id, roll, need: markers[id] + 1, pass });
        log(state, `${R.cmd(id).short} is over-tasked (${markers[id]} tasks): d6 = ${roll}, needs ${markers[id] + 1}+ → ${pass ? "executes" : "fails"}.`, { team, tone: "roll" });
        if (!pass) failedRoll = true;
      }
    });

    const zoneState = state.teams[team].zones[t.zone];
    let blockReason = null;
    if (task.blocked && zoneState.assurance >= 6) blockReason = `Assurance ${zoneState.assurance} now blocks this task`;
    else if (req.caps.length) {
      const pts = req.points * R.pointsMultiplier(state, team, t.zone);
      if (!R.checkCaps(t.caps, req.caps, pts).ok) blockReason = "Assurance fell to 1 — capability requirement doubled";
    }

    t.caps.forEach((id) => (state.cards[id].status = "used"));
    state.impl.order.push({ team, uid });

    if (failedRoll || blockReason) {
      t.status = "failed";
      refund(state, team, t);
      result.reason = blockReason || "Over-tasked MSC failed its roll";
      log(state, `${name}: ${task.name} in Zone ${t.zone} FAILS — ${result.reason}. Capabilities stay committed this turn.`, { team, tone: "bad" });
    } else {
      t.status = "done";
      result.ok = true;
      t.reserved = { influence: 0, access: 0 };
      const opp = TC.other(team);
      if (disrupt) {
        state.teams[team].disruptionUsed = true;
        t.disrupt = true;
        result.changes = R.applyEffects(state, opp, t.zone, req.effects, -1);
        log(state, `${name} plays ${task.name} as DISRUPTION against ${TC.TEAM_INFO[opp].name} in Zone ${t.zone}: ${R.formatEffects(Object.fromEntries(Object.entries(req.effects).map(([k, v]) => [k, -v])))}.`, { team, tone: "bad" });
      } else {
        result.changes = R.applyEffects(state, team, t.zone, req.effects, 1);
        result.changes.push(...R.applyEffects(state, opp, t.zone, req.oppEffects, 1));
        if (task.special === "rsoi") {
          state.rsoiApproved[team] = true;
          log(state, `${name}: RSOI complete — up to 3 additional GFM capabilities will arrive this turn.`, { team, tone: "good" });
        } else {
          const all = Object.assign({}, req.effects);
          const oppTxt = Object.keys(req.oppEffects).length ? `; ${TC.TEAM_INFO[opp].name} ${R.formatEffects(req.oppEffects)}` : "";
          log(state, `${name}: ${task.name} in Zone ${t.zone} succeeds — ${R.formatEffects(all) || "no tracker change"}${oppTxt}.`, { team, tone: "good" });
        }
      }
    }
    t.result = result;
    advanceInitiative(state, false);
    return result;
  };

  E.standDownTask = function (state, team, uid) {
    if (state.phase !== "implementation" || state.impl.active !== team) return false;
    const t = state.plans[team].tasks.find((x) => x.uid === uid && x.status === "planned");
    if (!t) return false;
    t.status = "unplayed";
    refund(state, team, t);
    log(state, `${TC.TEAM_INFO[team].name} stands down ${TC.taskByNum(t.num).name}; it returns to the planning area.`, { team });
    advanceInitiative(state, true);
    return true;
  };

  E.spendInfluence = function (state, team, zone) {
    if (state.phase !== "implementation" || state.impl.done || state.impl.active !== team) return { ok: false, error: "Only while holding initiative." };
    if (state.teams[team].influence < 3) return { ok: false, error: "Needs 3 Influence." };
    if (R.instability(state, zone) <= 0) return { ok: false, error: "Instability is already 0." };
    state.teams[team].influence -= 3;
    state.instabilityReduction[zone]++;
    log(state, `${TC.TEAM_INFO[team].name} expends 3 Influence to reduce Instability in Zone ${zone} by 1.`, { team, tone: "good" });
    return { ok: true };
  };

  // ---------------------------------------------------------------- phase: crisis assessment
  E.beginCrisis = function (state) {
    if (state.phase !== "implementation" || !state.impl.done) return false;
    TC.TEAMS.forEach((team) =>
      state.plans[team].tasks.forEach((t) => {
        if (t.status === "planned") {
          t.status = "unplayed";
          refund(state, team, t);
        }
      })
    );
    state.phase = "crisis";
    state.crisis = { zoneIndex: 0, results: [], theater: null };
    log(state, "Crisis Assessment — resolving Zone A, then B, then C.", { tone: "head" });
    prepareZone(state);
    return true;
  };

  function prepareZone(state) {
    const zone = TC.ZONES[state.crisis.zoneIndex];
    const inst = R.instabilityBreakdown(state, zone);
    const roll = R.roll(state, 10);
    const type = R.crisisTypeFor(inst.total, roll);
    const pools = {};
    TC.TEAMS.forEach((team) => {
      const p = R.readiness(state, team, zone);
      pools[team] = { theater: p.theater.map((d) => Object.assign({}, d)), partner: p.partner.map((d) => Object.assign({}, d)), drm: p.drm, deterrence: p.deterrence };
    });
    const i4 = state.teams.fourth.zones[zone].intel;
    const i10 = state.teams.tenth.zones[zone].intel;
    const intelTeam = i4 > i10 ? "fourth" : i10 > i4 ? "tenth" : null;
    state.crisis.current = { zone, instability: inst, roll, type, pools, intelTeam, intelChoice: null, stage: intelTeam ? "intel" : "ready" };
    log(state, `Zone ${zone}: Instability ${inst.total} (deterrence gap ${inst.base}${inst.assurance ? `, +${inst.assurance} assurance` : ""}${inst.reduced ? `, −${inst.reduced} influence` : ""}); d10 = ${roll} → ${TC.CRISIS_TYPES[type].name}.`, { tone: "roll" });
    return state.crisis.current;
  }

  // choice: { kind: "promote"|"demote", group: "theater"|"partner", index }
  E.chooseIntel = function (state, team, choice) {
    const cur = state.crisis?.current;
    if (!cur || cur.stage !== "intel" || cur.intelTeam !== team) return { ok: false };
    const target = choice.kind === "promote" ? team : TC.other(team);
    const die = cur.pools[target][choice.group][choice.index];
    if (!die) return { ok: false };
    const before = die.sides;
    die.sides = R.stepDie(die.sides, choice.kind === "promote" ? 1 : -1);
    die.intel = choice.kind;
    cur.intelChoice = Object.assign({ before, after: die.sides, target }, choice);
    cur.stage = "ready";
    log(state, `${TC.TEAM_INFO[team].name} has the Intelligence advantage: ${choice.kind}s ${TC.TEAM_INFO[target].name}'s ${die.src} die d${before} → d${die.sides}.`, { team, tone: "roll" });
    return { ok: true };
  };

  E.resolveZone = function (state) {
    const cur = state.crisis?.current;
    if (!cur || cur.stage !== "ready") return null;
    const zone = cur.zone;
    const res = { zone, type: cur.type, instability: cur.instability.total, typeRoll: cur.roll, intel: cur.intelChoice, intelTeam: cur.intelTeam, teams: {} };
    TC.TEAMS.forEach((team) => {
      const p = cur.pools[team];
      const dice = [];
      p.theater.forEach((d) => {
        const raw = R.roll(state, d.sides);
        dice.push({ group: "theater", sides: d.sides, src: d.src, raw, mod: p.drm, value: Math.max(0, raw + p.drm), intel: d.intel });
      });
      p.partner.forEach((d) => {
        const raw = R.roll(state, d.sides);
        dice.push({ group: "partner", sides: d.sides, src: d.src, raw, mod: 0, value: raw, intel: d.intel });
      });
      res.teams[team] = { dice, drm: p.drm, deterrence: p.deterrence };
    });
    const reroll = (d) => {
      const raw = R.roll(state, d.sides);
      return { raw, value: Math.max(0, raw + d.mod) };
    };
    // Communications advantage: re-roll own lowest die, keep the higher.
    const c4 = state.teams.fourth.zones[zone].comms;
    const c10 = state.teams.tenth.zones[zone].comms;
    if (c4 !== c10) {
      const team = c4 > c10 ? "fourth" : "tenth";
      const dice = res.teams[team].dice;
      const d = dice.reduce((m, x) => (x.value < m.value ? x : m), dice[0]);
      const r = reroll(d);
      res.comms = { team, sides: d.sides, before: d.value, after: Math.max(d.value, r.value), rolled: r.value };
      d.comms = { before: d.value, rolled: r.value };
      d.value = Math.max(d.value, r.value);
    }
    // Protection advantage: opponent re-rolls its highest die, keeps the lower.
    const p4 = state.teams.fourth.zones[zone].protection;
    const p10 = state.teams.tenth.zones[zone].protection;
    if (p4 !== p10) {
      const team = p4 > p10 ? "fourth" : "tenth";
      const victim = TC.other(team);
      const dice = res.teams[victim].dice;
      const d = dice.reduce((m, x) => (x.value > m.value ? x : m), dice[0]);
      const r = reroll(d);
      res.protection = { team, victim, sides: d.sides, before: d.value, after: Math.min(d.value, r.value), rolled: r.value };
      d.protection = { before: d.value, rolled: r.value };
      d.value = Math.min(d.value, r.value);
    }
    const violent = TC.CRISIS_TYPES[cur.type].violent;
    TC.TEAMS.forEach((team) => {
      const tr = res.teams[team];
      tr.diceSum = tr.dice.reduce((s, d) => s + d.value, 0);
      tr.detBonus = violent ? tr.deterrence : 0;
      const a = state.teams[team].zones[zone].assurance;
      tr.assuranceBonus = violent ? (a >= 7 ? 2 : a >= 6 ? 1 : 0) : 0;
      tr.total = tr.diceSum + tr.detBonus + tr.assuranceBonus;
    });
    const t4 = res.teams.fourth.total;
    const t10 = res.teams.tenth.total;
    res.winner = t4 > t10 ? "fourth" : t10 > t4 ? "tenth" : null;
    const ct = TC.CRISIS_TYPES[cur.type];
    res.points = { fourth: [], tenth: [] };
    if (res.winner) {
      res.points[res.winner].push({ pts: ct.victor, reason: `won Zone ${zone} (${ct.name})` });
      const bonus = (res.winner === "fourth" && zone === "C") || (res.winner === "tenth" && zone === "A");
      if (bonus) res.points[res.winner].push({ pts: ct.bonus, reason: `zone bonus — Zone ${zone} is its objective` });
    }
    const d4 = res.teams.fourth.deterrence;
    const d10 = res.teams.tenth.deterrence;
    if (d4 !== d10) {
      const hi = d4 > d10 ? "fourth" : "tenth";
      res.points[hi].push({ pts: ct.deterrence, reason: `higher deterrence in Zone ${zone} during ${ct.name}` });
    }
    log(state, `Zone ${zone} ${ct.name}: Fourth ${t4} vs Tenth ${t10} → ${res.winner ? TC.TEAM_INFO[res.winner].name + " wins" : "tie, no victor"}.`, { tone: "head" });
    TC.TEAMS.forEach((team) => res.points[team].forEach((p) => addScore(state, team, p.pts, p.reason)));
    state.crisis.results.push(res);
    cur.stage = "done";
    cur.result = res;
    return res;
  };

  E.nextCrisisZone = function (state) {
    const cur = state.crisis?.current;
    if (!cur || cur.stage !== "done") return false;
    state.crisis.zoneIndex++;
    if (state.crisis.zoneIndex < TC.ZONES.length) {
      prepareZone(state);
      return true;
    }
    // Theater-wide adjudication.
    const th = { influence: null, overtasked: {} };
    const i4 = state.teams.fourth.influence;
    const i10 = state.teams.tenth.influence;
    if (i4 !== i10) {
      th.influence = i4 > i10 ? "fourth" : "tenth";
      addScore(state, th.influence, 1, "higher theater-wide Influence");
    }
    TC.TEAMS.forEach((team) => {
      const over = E.overtaskedCommands(state, team);
      th.overtasked[team] = over;
      over.forEach((id) => addScore(state, team, -1, `${R.cmd(id).short} over-tasked`));
    });
    state.crisis.theater = th;
    state.crisis.current = null;
    state.phase = "tailoring";
    state.tailoring = null;
    return true;
  };

  // ---------------------------------------------------------------- phase: force tailoring + cleanup
  function secWarDraw(state) {
    const drawn = {};
    TC.TEAMS.forEach((team) => {
      const deck = R.shuffle(state, E.gfmCaps(state, team));
      drawn[team] = [];
      TC.ZONES.forEach((zone, i) => {
        const id = deck[i];
        if (!id) return;
        Object.assign(state.cards[id], { zone, status: "ready", origin: "secwar", arrived: state.turn });
        drawn[team].push(id);
      });
      log(state, `SecWar directs to ${TC.TEAM_INFO[team].name}: ${drawn[team].map((id, i) => `${R.cap(id).name} → Zone ${TC.ZONES[i]}`).join(", ")}.`, { team });
    });
    return drawn;
  }

  function sendHome(state, id) {
    Object.assign(state.cards[id], { zone: "GFM", status: "ready", origin: null, lockedThrough: 0 });
  }

  E.forceTailoring = function (state) {
    if (state.phase !== "tailoring" || state.tailoring) return state.tailoring;
    const summary = {};
    TC.TEAMS.forEach((team) => {
      const plan = state.plans[team];
      const s = (summary[team] = { redeployed: [], transferred: [], arrived: [], asosArrived: [], rsoiArrived: [], secwar: [] });
      // 1. Redeployments.
      E.capIds(state, team).forEach((id) => {
        const c = state.cards[id];
        if (c.zone === "GFM") return;
        if (c.origin === "secwar" || (c.origin === "rsoi" && c.arrived < state.turn) || ((c.origin === "rff" || c.origin === "asos") && plan.rffReturn.includes(id))) {
          s.redeployed.push({ id, from: c.zone });
          sendHome(state, id);
        }
      });
      plan.rffReturn.forEach((id) => {
        if (state.commands[id]?.location === "THEATER") {
          Object.assign(state.commands[id], { location: "GFM", origin: null });
          s.redeployed.push({ id, from: "THEATER" });
        }
      });
      // 2. Zone transfers.
      plan.transfers.forEach((tr) => {
        const c = state.cards[tr.id];
        if (c && c.zone !== "GFM" && c.zone !== tr.to) {
          s.transferred.push({ id: tr.id, from: c.zone, to: tr.to });
          c.zone = tr.to;
        }
      });
      // 3. New deployments: ASOS cover first (arrive sideways), then RFF, then RSOI.
      plan.asosCover.forEach((r) => {
        Object.assign(state.cards[r.id], { zone: r.zone, status: "asos", origin: "asos", arrived: state.turn, lockedThrough: state.turn + 1 });
        s.asosArrived.push(r);
      });
      plan.rffNew.forEach((r) => {
        if (state.commands[r.id]) Object.assign(state.commands[r.id], { location: "THEATER", origin: "rff", arrived: state.turn });
        else Object.assign(state.cards[r.id], { zone: r.zone, status: "ready", origin: "rff", arrived: state.turn });
        s.arrived.push(r);
      });
      if (state.rsoiApproved[team])
        plan.rsoi.forEach((r) => {
          Object.assign(state.cards[r.id], { zone: r.zone, status: "ready", origin: "rsoi", arrived: state.turn });
          s.rsoiArrived.push(r);
        });
      const parts = [];
      if (s.redeployed.length) parts.push(`${s.redeployed.length} redeployed`);
      if (s.transferred.length) parts.push(`${s.transferred.length} transferred`);
      if (s.arrived.length + s.asosArrived.length) parts.push(`${s.arrived.length + s.asosArrived.length} arrive via RFF`);
      if (s.rsoiArrived.length) parts.push(`${s.rsoiArrived.length} via RSOI`);
      log(state, `${TC.TEAM_INFO[team].name} force tailoring: ${parts.join(", ") || "no changes"}.`, { team });
    });
    const drawn = secWarDraw(state);
    TC.TEAMS.forEach((team) => (summary[team].secwar = drawn[team]));
    state.tailoring = summary;
    return summary;
  };

  E.cleanup = function (state) {
    if (state.phase !== "tailoring" || !state.tailoring) return false;
    state.phase = "cleanup";
    const next = state.turn + 1;
    Object.values(state.cards).forEach((c) => {
      if (c.status === "asos" && c.lockedThrough >= next) return;
      c.status = "ready";
      if (c.lockedThrough < next) c.lockedThrough = 0;
    });
    const even = state.turn % 2 === 0;
    if (even) {
      TC.TEAMS.forEach((team) =>
        TC.ZONES.forEach((z) => {
          const zs = state.teams[team].zones[z];
          zs.assurance = Math.max(TC.TRACKER_MIN, zs.assurance - 1);
          zs.interop = Math.max(TC.TRACKER_MIN, zs.interop - 1);
        })
      );
      log(state, "Even turn: Assurance and Partner Interoperability degrade by 1 in every zone.", { tone: "bad" });
    }
    TC.TEAMS.forEach((team) => (state.teams[team].disruptionUsed = false));
    state.asos.discard.push(...state.asos.current);
    state.asos.current = [];
    state.asos.alloc = { fourth: {}, tenth: {} };
    state.instabilityReduction = { A: 0, B: 0, C: 0 };
    state.rsoiApproved = { fourth: false, tenth: false };
    state.history.push({
      turn: state.turn,
      score: { fourth: state.teams.fourth.score, tenth: state.teams.tenth.score },
      crisis: state.crisis.results.map((r) => ({ zone: r.zone, type: r.type, winner: r.winner })),
      // Everything an after-action review or data analysis needs about this turn.
      record: {
        taskLimit: state.taskLimit,
        asos: state.asos.current.slice(),
        initiative: state.impl ? state.impl.first || null : null,
        tasks: Object.fromEntries(
          TC.TEAMS.map((team) => [team, state.plans[team].tasks.map((t) => ({ num: t.num, name: TC.taskByNum(t.num).name, zone: t.zone, branch: t.branch || null, options: t.options || [], status: t.status, disruption: !!t.disrupt }))])
        ),
        rffArrived: Object.fromEntries(TC.TEAMS.map((team) => [team, state.tailoring && state.tailoring[team] ? state.tailoring[team].arrived.length : 0])),
        crisis: state.crisis.results.map((r) => ({
          zone: r.zone,
          type: r.type,
          instability: r.instability,
          typeRoll: r.typeRoll,
          winner: r.winner,
          totals: { fourth: r.teams.fourth.total, tenth: r.teams.tenth.total },
          dice: { fourth: r.teams.fourth.diceSum, tenth: r.teams.tenth.diceSum },
          deterrence: { fourth: r.teams.fourth.deterrence, tenth: r.teams.tenth.deterrence },
          points: { fourth: r.points.fourth.reduce((x, p) => x + p.pts, 0), tenth: r.points.tenth.reduce((x, p) => x + p.pts, 0) },
        })),
        trackers: Object.fromEntries(TC.TEAMS.map((team) => [team, { influence: state.teams[team].influence, access: Object.assign({}, state.teams[team].access), zones: JSON.parse(JSON.stringify(state.teams[team].zones)) }])),
      },
    });
    state.lastTurn = { plans: state.plans, crisis: state.crisis, tailoring: state.tailoring };
    state.plans = { fourth: emptyPlan(), tenth: emptyPlan() };
    state.impl = null;
    state.crisis = null;
    state.tailoring = null;
    state.taskLimit = null;
    if (state.turn >= state.settings.turns) {
      state.phase = "gameOver";
      const s4 = state.teams.fourth.score;
      const s10 = state.teams.tenth.score;
      state.winner = s4 > s10 ? "fourth" : s10 > s4 ? "tenth" : null;
      log(state, `Campaign ends. ${state.winner ? TC.TEAM_INFO[state.winner].name + " wins" : "The theater ends in a draw"}, ${s4}–${s10}.`, { tone: "head" });
      return true;
    }
    state.turn = next;
    state.phase = "taskLimit";
    log(state, `— Turn ${state.turn} —`, { tone: "head" });
    return true;
  };

  E.phaseIndex = (state) => E.PHASES.findIndex((p) => p.key === state.phase);

  // ---------------------------------------------------------------- records for review and analysis
  const SCORE_SOURCES = [
    ["wins", "Zone wins", (e) => /^won Zone/.test(e.reason)],
    ["bonus", "Objective-zone bonus", (e) => /^zone bonus/.test(e.reason)],
    ["detUp", "Deterrence lead in calm crises", (e) => /^higher deterrence/.test(e.reason) && e.pts > 0],
    ["detDown", "Deterrence lead in violent crises", (e) => /^higher deterrence/.test(e.reason) && e.pts < 0],
    ["influence", "Influence lead", (e) => /Influence/.test(e.reason)],
    ["overtask", "Over-tasked MSCs", (e) => /over-tasked/.test(e.reason)],
  ];
  // Points by source for one army: [{ key, label, pts }].
  E.scoreBreakdown = function (state, team) {
    const mine = state.scoreEvents.filter((e) => e.team === team);
    const rows = SCORE_SOURCES.map(([key, label, test]) => ({ key, label, pts: mine.filter(test).reduce((x, e) => x + e.pts, 0) }));
    const other = mine.filter((e) => !SCORE_SOURCES.some((c) => c[2](e))).reduce((x, e) => x + e.pts, 0);
    if (other) rows.push({ key: "other", label: "Other", pts: other });
    return rows;
  };
  // The campaign as structured data. Field names are stable so records from
  // many games can be loaded into one table (see game/tools/analyze.js).
  E.campaignRecord = function (state) {
    const s = state;
    const level = (t) => (s.controllers[t] === "human" ? "human" : s.controllers[t] === "remote" ? "human-online" : `ai:${(s.settings.aiLevelByTeam || {})[t] || s.settings.aiLevel}`);
    return {
      format: "theatercomplex-campaign-record",
      version: 1,
      exportedAt: new Date().toISOString(),
      seed: s.seed,
      settings: s.settings,
      players: { fourth: level("fourth"), tenth: level("tenth") },
      finished: s.phase === "gameOver",
      winner: s.phase === "gameOver" ? s.winner || "draw" : null,
      score: { fourth: s.teams.fourth.score, tenth: s.teams.tenth.score },
      scoreBySource: { fourth: E.scoreBreakdown(s, "fourth"), tenth: E.scoreBreakdown(s, "tenth") },
      turns: s.history.map((h) => Object.assign({ turn: h.turn, scoreAfter: h.score }, h.record || { crisis: h.crisis })),
      scoreEvents: s.scoreEvents,
      log: s.log.map((l, i) => ({ line: i + 1, turn: l.turn, phase: l.phase, army: l.team, kind: l.tone, text: l.text })),
    };
  };
})();
