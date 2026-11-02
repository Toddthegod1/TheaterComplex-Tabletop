// Pure rules functions. No DOM access, so they also run under Node for tests.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = (TC.rules = {});

  // ---------------------------------------------------------------- RNG
  // Seeded mulberry32 stored on the game state so saves replay identically.
  R.random = function (state) {
    let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  R.roll = (state, sides) => 1 + Math.floor(R.random(state) * sides);
  R.shuffle = function (state, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(R.random(state) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ---------------------------------------------------------------- lookups
  R.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  R.cap = (id) => TC.CAP_BY_ID[id];
  R.cmd = (id) => TC.CMD_BY_ID[id];

  R.indexCards = function () {
    TC.CAP_BY_ID = {};
    TC.GENERATED.capabilities.forEach((c) => (TC.CAP_BY_ID[c.id] = c));
    TC.CMD_BY_ID = {};
    TC.GENERATED.commands.forEach((c) => (TC.CMD_BY_ID[c.id] = c));
    TC.ASOS_BY_ID = {};
    TC.GENERATED.asos.forEach((c) => (TC.ASOS_BY_ID[c.id] = c));
  };

  // Value -> die lookup from the tracker cards. Deterrence below the printed
  // track (it starts at 3 in two zones) uses the lowest die on the card.
  R.legend = function (key, zone, value) {
    const table = TC.GENERATED.dieLegend[key][zone];
    const keys = Object.keys(table).map(Number);
    const v = R.clamp(value, Math.min(...keys), Math.max(...keys));
    return table[v];
  };

  R.stepDie = function (sides, delta) {
    const i = TC.DIE_STEPS.indexOf(sides);
    return TC.DIE_STEPS[R.clamp(i + delta, 0, TC.DIE_STEPS.length - 1)];
  };

  // ---------------------------------------------------------------- deterrence & instability
  R.capsInZone = (state, team, zone) =>
    Object.keys(state.cards).filter((id) => state.cards[id].team === team && state.cards[id].zone === zone);

  R.deterrenceBreakdown = function (state, team, zone) {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    R.capsInZone(state, team, zone).forEach((id) => counts[R.cap(id).cat]++);
    const parts = [1, 2, 3, 4].map((cat) => ({ cat, count: counts[cat], value: Math.floor(counts[cat] / cat) }));
    return { parts, total: parts.reduce((s, p) => s + p.value, 0) };
  };
  R.deterrence = (state, team, zone) => R.deterrenceBreakdown(state, team, zone).total;

  R.assuranceInstability = (a) => (a >= 7 ? 2 : a >= 6 ? 1 : 0);

  R.instabilityBreakdown = function (state, zone) {
    const d4 = R.deterrence(state, "fourth", zone);
    const d10 = R.deterrence(state, "tenth", zone);
    const base = Math.abs(d4 - d10);
    const assurance =
      R.assuranceInstability(state.teams.fourth.zones[zone].assurance) +
      R.assuranceInstability(state.teams.tenth.zones[zone].assurance);
    const reduced = state.instabilityReduction[zone] || 0;
    return { base, assurance, reduced, total: Math.max(0, base + assurance - reduced), d4, d10 };
  };
  R.instability = (state, zone) => R.instabilityBreakdown(state, zone).total;

  R.crisisRow = function (instability) {
    const rows = TC.CRISIS_TABLE.rows;
    const v = Math.max(0, instability);
    return rows.find((r) => v >= r.min && (r.max == null || v <= r.max)) || rows[rows.length - 1];
  };
  R.crisisTypeFor = function (instability, d10) {
    const row = R.crisisRow(instability);
    if (d10 <= row.sq) return "SQ";
    if (d10 <= row.sof) return "SOF";
    if (d10 <= row.lim) return "LIM";
    return "LSCO";
  };
  R.crisisOdds = function (instability) {
    const row = R.crisisRow(instability);
    return {
      SQ: row.sq * 10,
      SOF: (row.sof - row.sq) * 10,
      LIM: (row.lim - row.sof) * 10,
      LSCO: (10 - row.lim) * 10,
    };
  };

  // ---------------------------------------------------------------- defense readiness
  R.readiness = function (state, team, zone) {
    const z = state.teams[team].zones[zone];
    const det = R.deterrence(state, team, zone);
    const theater = [{ sides: R.legend("deterrence", zone, det), src: "Deterrence" }];
    const nInfra = R.legend("infrastructure", zone, z.infrastructure);
    for (let i = 0; i < nInfra; i++) theater.push({ sides: 6, src: "Infrastructure" });
    const partner = [{ sides: R.legend("partnerCap", zone, z.partnerCap), src: "Partner Capability" }];
    const nInterop = R.legend("interop", zone, z.interop);
    for (let i = 0; i < nInterop; i++) partner.push({ sides: 4, src: "Interoperability" });
    return { theater, partner, drm: R.legend("stockage", zone, z.stockage), deterrence: det };
  };

  R.expectedDice = function (pool) {
    const ev = (d) => (d.sides + 1) / 2;
    return pool.theater.reduce((s, d) => s + ev(d) + pool.drm, 0) + pool.partner.reduce((s, d) => s + ev(d), 0);
  };

  // ---------------------------------------------------------------- task requirements
  R.capMatches = function (code, req) {
    if (req === "ANY") return true;
    if (code === req) return true;
    return (TC.CAPABILITY_ALIASES[code] || []).includes(req);
  };

  // Merge base requirements with the chosen branch and options.
  R.taskRequirement = function (task, branchKey, optionKeys) {
    const req = {
      staff: task.staff === "ALL" ? TC.STAFF_CELLS.map((s) => s.code) : task.staff.slice(),
      commands: task.commands.slice(),
      caps: task.caps.slice(),
      points: task.points,
      effects: Object.assign({}, task.effects),
      oppEffects: {},
    };
    const parts = [];
    if (task.branches) {
      const b = task.branches.find((x) => x.key === branchKey) || task.branches[0];
      parts.push(b);
    }
    (task.options || []).forEach((o) => {
      if ((optionKeys || []).includes(o.key)) parts.push(o);
    });
    parts.forEach((p) => {
      (p.commands || []).forEach((c) => req.commands.push(c));
      (p.caps || []).forEach((c) => req.caps.push(c));
      Object.entries(p.effects || {}).forEach(([k, v]) => (req.effects[k] = (req.effects[k] || 0) + v));
      Object.entries(p.oppEffects || {}).forEach(([k, v]) => (req.oppEffects[k] = (req.oppEffects[k] || 0) + v));
    });
    return req;
  };

  R.pointsMultiplier = (state, team, zone) => (state.teams[team].zones[zone].assurance <= 1 ? 2 : 1);

  // Capability rule: every card must match a listed type, every listed type
  // must be represented, and the points must reach the requirement. Combat
  // units (0 points) cannot fulfil requirements.
  R.checkCaps = function (capIds, reqCaps, points) {
    const cards = capIds.map(R.cap);
    const total = cards.reduce((s, c) => s + c.points, 0);
    const invalid = cards.filter((c) => c.points <= 0 || !reqCaps.some((r) => R.capMatches(c.code, r))).map((c) => c.id);
    const missing = reqCaps.filter((r) => r !== "ANY" && !cards.some((c) => R.capMatches(c.code, r)));
    const needsAny = reqCaps.length > 0 && reqCaps.every((r) => r === "ANY") && cards.length === 0;
    if (needsAny) missing.push("ANY");
    return { ok: invalid.length === 0 && missing.length === 0 && total >= points, total, needed: points, invalid, missing };
  };

  // Greedy auto-fill: one card per listed type, then the cheapest set of
  // extra cards that closes the gap.
  R.autoCaps = function (availableIds, reqCaps, points) {
    const pool = availableIds.map(R.cap).filter((c) => c.points > 0 && reqCaps.some((r) => R.capMatches(c.code, r)));
    const chosen = [];
    const take = (c) => {
      chosen.push(c);
      pool.splice(pool.indexOf(c), 1);
    };
    reqCaps.filter((r) => r !== "ANY").forEach((r) => {
      if (chosen.some((c) => R.capMatches(c.code, r))) return;
      const options = pool.filter((c) => R.capMatches(c.code, r)).sort((a, b) => b.points - a.points);
      if (options.length) take(options[0]);
    });
    let total = chosen.reduce((s, c) => s + c.points, 0);
    while (total < points && pool.length) {
      const gap = points - total;
      const exact = pool.filter((c) => c.points >= gap).sort((a, b) => a.points - b.points)[0];
      const pick = exact || pool.slice().sort((a, b) => b.points - a.points)[0];
      take(pick);
      total += pick.points;
    }
    if (reqCaps.length && reqCaps.every((r) => r === "ANY") && !chosen.length && pool.length) take(pool[0]);
    const ids = chosen.map((c) => c.id);
    return R.checkCaps(ids, reqCaps, points).ok ? ids : null;
  };

  // ASOS: any combination of the listed types totalling the points.
  R.checkAsos = function (capIds, asos) {
    const cards = capIds.map(R.cap);
    const total = cards.reduce((s, c) => s + c.points, 0);
    const ok = cards.every((c) => c.points > 0 && asos.types.some((t) => R.capMatches(c.code, t))) && total >= asos.points;
    return { ok, total };
  };
  R.autoAsos = function (availableIds, asos) {
    const pool = availableIds
      .map(R.cap)
      .filter((c) => c.points > 0 && asos.types.some((t) => R.capMatches(c.code, t)))
      .sort((a, b) => a.points - b.points);
    const exact = pool.find((c) => c.points >= asos.points);
    if (exact) return [exact.id];
    const chosen = [];
    let total = 0;
    pool
      .slice()
      .reverse()
      .forEach((c) => {
        if (total < asos.points) {
          chosen.push(c.id);
          total += c.points;
        }
      });
    return total >= asos.points ? chosen : null;
  };

  // ---------------------------------------------------------------- effects
  R.applyEffects = function (state, team, zone, effects, sign) {
    const t = state.teams[team];
    const changes = [];
    Object.entries(effects).forEach(([key, raw]) => {
      const delta = raw * sign;
      if (!delta) return;
      let before, after;
      if (key === "influence") {
        before = t.influence;
        after = t.influence = R.clamp(before + delta, 0, TC.INFLUENCE_MAX);
      } else if (key === "access") {
        before = t.access[zone];
        after = t.access[zone] = R.clamp(before + delta, 0, TC.ACCESS_MAX);
      } else {
        before = t.zones[zone][key];
        after = t.zones[zone][key] = R.clamp(before + delta, TC.TRACKER_MIN, TC.TRACKER_MAX);
      }
      changes.push({ team, zone, key, before, after });
    });
    return changes;
  };

  R.formatEffects = function (effects) {
    return Object.entries(effects)
      .filter(([, v]) => v)
      .map(([k, v]) => `${TC.EFFECT_LABELS[k]} ${v > 0 ? "+" : "−"}${Math.abs(v)}`)
      .join(", ");
  };
})();
