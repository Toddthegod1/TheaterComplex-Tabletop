// Modals: task planner, ASOS allocation, force management, capability mat.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = TC.rules;
  const E = TC.engine;
  const K = TC.kit;
  const esc = K.esc;
  const App = TC.app;

  TC.modals = TC.modals || {};
  TC.modalActions = TC.modalActions || {};
  const M = TC.modals;
  const A = TC.modalActions;
  const modal = () => App.ui.modal;
  const rerender = () => App.render();

  // ================================================================ task planner
  TC.planner = {
    open(num, preferZone) {
      const s = App.state;
      const me = App.me();
      const task = TC.taskByNum(num);
      if (s.plans[me].tasks.some((t) => t.num === num)) {
        const t = s.plans[me].tasks.find((x) => x.num === num);
        return TC.planner.edit(t.uid);
      }
      const branch = task.branches ? task.branches[0].key : null;
      const ok = (z) => E.evaluateTask(s, me, { num, zone: z, branch }).ok;
      const zone = (preferZone && ok(preferZone) && preferZone) || TC.ZONES.find(ok) || TC.ZONES.slice().sort((a, b) => E.evaluateTask(s, me, { num, zone: a, branch }).issues.length - E.evaluateTask(s, me, { num, zone: b, branch }).issues.length)[0];
      App.openModal({ type: "planner", num, zone, branch, options: [], commands: null, caps: null, uid: null });
    },
    edit(uid) {
      const t = App.state.plans[App.me()].tasks.find((x) => x.uid === uid);
      if (!t) return;
      App.openModal({ type: "planner", num: t.num, zone: t.zone, branch: t.branch, options: t.options.slice(), commands: t.commands.slice(), caps: t.caps.slice(), uid });
    },
  };

  function plannerSpec(m) {
    return { num: m.num, zone: m.zone, branch: m.branch, options: m.options, commands: m.commands || undefined, caps: m.caps || undefined };
  }

  // Map assigned MSC ids onto the requirement boxes in card order.
  function commandSlots(req, assigned) {
    const left = assigned.slice();
    const slots = req.commands.map((code) => ({ code, id: null }));
    slots.forEach((sl) => {
      if (sl.code === "ANY") return;
      const i = left.findIndex((id) => R.cmd(id).code === sl.code);
      if (i >= 0) sl.id = left.splice(i, 1)[0];
    });
    slots.forEach((sl) => {
      if (sl.code === "ANY" && left.length) sl.id = left.shift();
    });
    return slots;
  }

  // What the tracker changes mean for the next Crisis Assessment in this zone.
  function impactHtml(s, me, zone, req) {
    const opp = TC.other(me);
    const oppName = TC.TEAM_INFO[opp].name;
    const z = s.teams[me].zones[zone];
    const oz = s.teams[opp].zones[zone];
    const lines = [];
    const add = (tone, text) => lines.push(`<li class="${tone}">${text}</li>`);
    const nextStep = (key, after) => {
      const cur = R.legend(key, zone, after);
      for (let v = after + 1; v <= TC.TRACKER_MAX; v++) if (R.legend(key, zone, v) !== cur) return v - after;
      return null;
    };
    Object.entries(req.effects).forEach(([k, v]) => {
      if (!v) return;
      if (["partnerCap", "infrastructure", "interop", "stockage"].includes(k)) {
        const after = R.clamp(z[k] + v, TC.TRACKER_MIN, TC.TRACKER_MAX);
        const a = R.legend(k, zone, z[k]);
        const b = R.legend(k, zone, after);
        const what = { partnerCap: "Partner die", infrastructure: "Theater Army d6 dice", interop: "Partner d4 dice", stockage: "Modifier on each Theater Army die" }[k];
        const show = (x) => (k === "partnerCap" ? `d${x}` : k === "stockage" ? `${x > 0 ? "+" : ""}${x}` : `×${x}`);
        if (a !== b) add("good", `<b>${what}: ${show(a)} → ${show(b)}</b>`);
        else {
          const n = nextStep(k, after);
          add("muted", `${TC.EFFECT_LABELS[k]} ${z[k]} → ${after}: no dice change yet${n ? ` (${n} more for the next step)` : " (already at the top)"}`);
        }
      } else if (["intel", "comms", "protection"].includes(k)) {
        const after = R.clamp(z[k] + v, TC.TRACKER_MIN, TC.TRACKER_MAX);
        const name = TC.EFFECT_LABELS[k];
        if (z[k] <= oz[k] && after > oz[k]) add("good", `<b>Takes the ${name} advantage</b> (${after} vs ${oz[k]})`);
        else if (after === oz[k]) add("warn", `Ties ${oppName} on ${name} (${after}–${oz[k]}): neither side gets the advantage`);
        else if (after < oz[k]) add("muted", `Still behind on ${name} (${after} vs ${oz[k]})`);
        else add("muted", `Extends the ${name} lead (${after} vs ${oz[k]})`);
      } else if (k === "assurance") {
        const after = R.clamp(z.assurance + v, TC.TRACKER_MIN, TC.TRACKER_MAX);
        if (after >= 6) add("bad", `<b>Assurance reaches ${after}</b>: blocks agreements and security cooperation here, and adds +${after >= 7 ? 2 : 1} Instability`);
        else if (z.assurance <= 1) add("good", `<b>Ends doubled capability requirements</b> (Assurance 1 → ${after})`);
        else add("muted", `Assurance ${z.assurance} → ${after}: a buffer against even-turn decay`);
      } else if (k === "influence") {
        const after = R.clamp(s.teams[me].influence + v, 0, TC.INFLUENCE_MAX);
        const oi = s.teams[opp].influence;
        add(after > oi && s.teams[me].influence <= oi ? "good" : "muted", `Influence ${s.teams[me].influence} → ${after} (${oppName} has ${oi}; higher earns +1 point each turn)`);
      }
    });
    // Expected crisis roll before vs after, using a copy of this army's trackers.
    const sim = Object.assign({}, s, { teams: Object.assign({}, s.teams, { [me]: JSON.parse(JSON.stringify(s.teams[me])) }) });
    R.applyEffects(sim, me, zone, req.effects, 1);
    const before = R.expectedDice(R.readiness(s, me, zone));
    const after = R.expectedDice(R.readiness(sim, me, zone));
    const theirs = R.expectedDice(R.readiness(s, opp, zone));
    if (Math.abs(after - before) > 0.01) add("good", `Expected crisis roll in Zone ${zone}: <b>${before.toFixed(1)} → ${after.toFixed(1)}</b> (${oppName} ≈ ${theirs.toFixed(1)})`);
    else if (lines.length) add("muted", `Expected crisis roll in Zone ${zone} stays ≈ ${before.toFixed(1)} (${oppName} ≈ ${theirs.toFixed(1)})`);
    return lines.length ? `<ul class="impact">${lines.join("")}</ul>` : "";
  }

  M.planner = function (m) {
    const s = App.state;
    const me = App.me();
    const task = TC.taskByNum(m.num);
    const ev = E.evaluateTask(s, me, plannerSpec(m), m.uid || undefined);
    const req = ev.req;
    // Feasibility per zone, and which feasible zone the effects help most
    // (scored with the same heuristic the AI uses).
    const zoneInfo = TC.ZONES.map((z) => {
      const ok = E.evaluateTask(s, me, { num: m.num, zone: z, branch: m.branch, options: m.options }, m.uid || undefined).ok;
      return { z, ok, value: ok ? TC.ai.effectValue(s, me, z, req.effects) : -Infinity };
    });
    const best = zoneInfo.filter((x) => x.ok && Object.keys(req.effects).length).sort((a, b) => b.value - a.value)[0];
    const zoneBtns = zoneInfo
      .map(({ z, ok }) => {
        const star = best && best.z === z && zoneInfo.filter((x) => x.ok).length > 1;
        return `<button class="btn sm ${m.zone === z ? "on" : ""}" data-act="pl-zone" data-z="${z}" title="${ok ? "Feasible" : "Not possible now"}${star ? " — biggest payoff of the feasible zones" : ""}">Zone ${z} ${ok ? '<span class="good">●</span>' : '<span class="bad">●</span>'}${star ? ' <span class="beststar">★ best</span>' : ""}</button>`;
      })
      .join("");
    const modeNote = task.mode === "P" ? '<div class="banner info">Plan-only task: needs staff only. Its effects apply at the very start of implementation, before any other task.</div>' : task.mode === "E" ? '<div class="banner info">Execute-only task: no staff needed, just the MSCs and capabilities.</div>' : "";
    const branches = task.branches
      ? `<div class="req"><h4>Choose one</h4>${task.branches.map((b) => `<label class="opt ${m.branch === b.key ? "on" : ""}" data-act="pl-branch" data-k="${b.key}"><input type="radio" ${m.branch === b.key ? "checked" : ""}> ${esc(b.label)}</label>`).join("")}</div>`
      : "";
    const options = task.options
      ? `<div class="req"><h4>Optional additions</h4>${task.options.map((o) => `<label class="opt ${m.options.includes(o.key) ? "on" : ""}" data-act="pl-opt" data-k="${o.key}"><input type="checkbox" ${m.options.includes(o.key) ? "checked" : ""}> ${esc(o.label)}</label>`).join("")}</div>`
      : "";

    // Staff
    const free = E.staffFree(s, me, m.uid || undefined);
    const staff = req.staff.length
      ? req.staff.map((c) => `<span class="chip ${free[c] > 0 ? "" : "badc"}">${c} <span class="muted">${free[c]} free</span></span>`).join(" ")
      : '<span class="muted">No staff needed.</span>';

    // Commands
    const load = E.commandLoad(s, me, m.uid || undefined);
    const inTheater = E.theaterCommands(s, me);
    const slots = commandSlots(req, ev.commands);
    const cmdHtml = slots.length
      ? slots
          .map((sl, i) => {
            const eligible = inTheater.filter((id) => sl.code === "ANY" || R.cmd(id).code === sl.code);
            if (!eligible.length) return `<span class="cmdslot"><b>${sl.code}</b> <span class="bad">not in theater — request via RFF</span></span>`;
            const opts = eligible.map((id) => {
              const n = load[id] || 0;
              return `<option value="${id}" ${sl.id === id ? "selected" : ""}>${esc(R.cmd(id).short)} — ${n} task${n === 1 ? "" : "s"}${n >= TC.MSC_FREE_SLOTS ? " ⚠ over-tasked" : ""}</option>`;
            });
            const n = sl.id ? (load[sl.id] || 0) + 1 : 0;
            return `<span class="cmdslot" ${sl.id ? `data-art="${R.cmd(sl.id).art}"` : ""}><b>${sl.code === "ANY" ? "Any MSC" : sl.code}</b>
              <select data-change="pl-cmd" data-i="${i}">${sl.id ? "" : '<option value="">—</option>'}${opts.join("")}</select>${n > TC.MSC_FREE_SLOTS ? `<span class="chip badc" title="Task #${n} for this MSC: needs d6 > ${n} and costs −1 point">task #${n}: roll ${n + 1}+</span>` : ""}</span>`;
          })
          .join("")
      : '<span class="muted">No command needed.</span>';

    // Capabilities
    const capZone = s.settings.capsMustBeInTaskZone ? m.zone : null;
    const avail = E.availableCaps(s, me, capZone, m.uid || undefined);
    const pool = avail.filter((id) => req.caps.some((r) => R.capMatches(R.cap(id).code, r)));
    const chosen = new Set(ev.caps);
    let capsHtml = "";
    if (req.caps.length) {
      const groups = {};
      pool.forEach((id) => {
        const key = capZone ? R.cap(id).code : s.cards[id].zone;
        (groups[key] = groups[key] || []).push(id);
      });
      const order = Object.keys(groups).sort();
      const pct = Math.min(100, (ev.capTotal / Math.max(1, ev.points)) * 100);
      const zoneCards = R.capsInZone(s, me, m.zone).filter((id) => R.cap(id).points > 0 && req.caps.some((r) => R.capMatches(R.cap(id).code, r)) && !avail.includes(id));
      capsHtml = `<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><div class="meter ${ev.capTotal >= ev.points ? "ok" : ""}" style="flex:1"><i style="width:${pct}%"></i></div>
          <b>${ev.capTotal} / ${ev.points} pts</b>${ev.multiplier > 1 ? '<span class="chip badc" title="Assurance 1 doubles capability requirements">×2 Assurance 1</span>' : ""}
          <button class="btn sm" data-act="pl-auto">Auto-fill</button><button class="btn sm ghost" data-act="pl-clear">Clear</button></div>
        <div class="muted" style="font-size:12px;margin-bottom:6px">Types: ${req.caps.map((c) => (c === "ANY" ? "<b>any</b>" : `<b>${c}</b>`)).join(" + ")} — every listed type must be represented. Click cards to select.</div>
        <div class="grouped flow">${order.map((k) => `<div class="g"><div class="gl">${capZone ? esc(TC.CAPABILITY_TYPES[k] || k) : "Zone " + k}</div><div class="cards">${groups[k].map((id) => K.capMini(id, s, { big: true, pick: true, sel: chosen.has(id), data: `data-act="pl-cap" data-id="${id}"` })).join("")}</div></div>`).join("") || '<div class="bad">No matching capabilities available' + (capZone ? ` in Zone ${capZone}` : "") + ". Request them through RFF or transfer them in for next turn.</div>"}</div>
        ${zoneCards.length ? `<div class="muted" style="font-size:12px;margin-top:6px">${zoneCards.length} matching card(s) in Zone ${m.zone} are already committed to ASOS or other tasks.</div>` : ""}`;
    } else capsHtml = '<span class="muted">No capabilities needed.</span>';

    // Costs & effects preview
    const cost = [];
    if (task.cost.influence) cost.push(`<span class="chip ${s.teams[me].influence + (m.uid ? task.cost.influence : 0) >= task.cost.influence ? "" : "badc"}">Influence −${task.cost.influence} (have ${s.teams[me].influence + (m.uid ? task.cost.influence : 0)})</span>`);
    if (task.cost.access) {
      // When editing, this task's own reservation counts as available again.
      const self = m.uid && s.plans[me].tasks.find((t) => t.uid === m.uid);
      const have = s.teams[me].access[m.zone] + (self && self.zone === m.zone ? self.reserved.access : 0);
      cost.push(`<span class="chip ${have >= task.cost.access ? "" : "badc"}">Zone ${m.zone} Access −${task.cost.access} (have ${have})</span>`);
    }
    const zs = s.teams[me].zones[m.zone];
    const eff = Object.entries(req.effects)
      .filter(([, v]) => v)
      .map(([k, v]) => {
        const cur = k === "influence" ? s.teams[me].influence : k === "access" ? s.teams[me].access[m.zone] : zs[k];
        const max = k === "influence" ? TC.INFLUENCE_MAX : k === "access" ? TC.ACCESS_MAX : 7;
        return `<span class="chip goodc">${TC.EFFECT_LABELS[k]} ${cur} → ${Math.min(max, cur + v)}</span>`;
      });
    Object.entries(req.oppEffects).forEach(([k, v]) => eff.push(`<span class="chip badc">Enemy ${TC.EFFECT_LABELS[k]} ${v}</span>`));
    if (task.special === "rsoi") eff.push('<span class="chip goodc">Up to +3 GFM capabilities arrive this turn (choose them in Force Management)</span>');
    const issues = ev.issues.length ? `<ul class="issues">${ev.issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : '<div class="good">✔ Ready to add to your campaign.</div>';

    return `<div class="modal wide" id="planner"><div class="modal-head"><span class="chip" style="background:var(--task);border:0;color:#fff;font-size:15px">${task.num}</span><h2>${esc(task.name)}</h2><span class="muted">${esc(task.fn)}</span>
        ${task.blocked ? '<span class="chip warnc" title="Agreements and security cooperation (the T×T icon on the card) are not allowed in a zone at Assurance 6–7">Blocked at Assurance 6–7</span>' : ""}<button class="btn ghost x" data-act="close-modal">✕</button></div>
      <div class="modal-body"><div class="planner">
        <div class="art"><div class="pair"><img src="${task.art[me].front}" data-art="${task.art[me].front}" alt="front"><img src="${task.art[me].back}" data-art="${task.art[me].back}" alt="effects"></div>
          <div class="req"><h4>Effects on success</h4><div class="effects-line">${eff.join(" ") || '<span class="muted">—</span>'}</div>
            ${impactHtml(s, me, m.zone, req)}</div>
          ${cost.length ? `<div class="req cost"><h4>Cost</h4><div class="effects-line">${cost.join(" ")}</div></div>` : ""}</div>
        <div>
          <div class="req"><h4>Zone</h4><div class="zonepick">${zoneBtns}</div></div>
          ${modeNote}${branches}${options}
          <div class="req staff"><h4>Plan · staff</h4>${staff}</div>
          <div class="req cmd"><h4>Execute · command (MSCs)</h4><div class="pickrow">${cmdHtml}</div></div>
          <div class="req capr"><h4>Execute · capabilities</h4>${capsHtml}</div>
          ${issues}
        </div></div></div>
      <div class="modal-foot">${m.uid ? '<button class="btn danger left" data-act="pl-remove">Remove from campaign</button>' : ""}<button class="btn ghost" data-act="close-modal">Cancel</button>
        <button class="btn primary" data-act="pl-confirm" id="pl-confirm" ${ev.ok ? "" : "disabled"}>${m.uid ? "Update task" : "Add to campaign"}</button></div></div>`;
  };

  const resetAssign = (m) => {
    m.commands = null;
    m.caps = null;
  };
  A["pl-zone"] = (el) => {
    const m = modal();
    m.zone = el.dataset.z;
    resetAssign(m);
    rerender();
  };
  A["pl-branch"] = (el, e) => {
    e.preventDefault();
    const m = modal();
    m.branch = el.dataset.k;
    resetAssign(m);
    rerender();
  };
  A["pl-opt"] = (el, e) => {
    e.preventDefault();
    const m = modal();
    const k = el.dataset.k;
    m.options = m.options.includes(k) ? m.options.filter((x) => x !== k) : m.options.concat(k);
    resetAssign(m);
    rerender();
  };
  A["pl-cmd"] = (el) => {
    const m = modal();
    const s = App.state;
    const ev = E.evaluateTask(s, App.me(), plannerSpec(m), m.uid || undefined);
    const slots = commandSlots(ev.req, ev.commands);
    slots[Number(el.dataset.i)].id = el.value || null;
    m.commands = slots.map((sl) => sl.id).filter(Boolean);
    rerender();
  };
  A["pl-cap"] = (el) => {
    const m = modal();
    const s = App.state;
    if (!m.caps) m.caps = E.evaluateTask(s, App.me(), plannerSpec(m), m.uid || undefined).caps.slice();
    const id = el.dataset.id;
    m.caps = m.caps.includes(id) ? m.caps.filter((x) => x !== id) : m.caps.concat(id);
    rerender();
  };
  A["pl-auto"] = () => {
    modal().caps = null;
    rerender();
  };
  A["pl-clear"] = () => {
    modal().caps = [];
    rerender();
  };
  A["pl-confirm"] = () => {
    const m = modal();
    const s = App.state;
    const me = App.me();
    const ev = E.evaluateTask(s, me, plannerSpec(m), m.uid || undefined);
    const spec = { num: m.num, zone: m.zone, branch: m.branch, options: m.options, commands: ev.commands, caps: ev.caps };
    const r = m.uid ? E.replanTask(s, me, m.uid, spec) : E.planTask(s, me, spec);
    if (!r.ok) return App.notify(r.issues || [r.error], "Can't plan this task");
    App.ui.modal = null;
    App.save();
    App.render();
    if (TC.taskByNum(m.num).special === "rsoi") App.toast("<div class='t'><b>RSOI planned</b><br>Choose up to 3 GFM capabilities in Force Management → RSOI.</div>", me);
  };
  A["pl-remove"] = () => {
    E.unplanTask(App.state, App.me(), modal().uid);
    App.ui.modal = null;
    App.save();
    App.render();
  };

  // ================================================================ confirm dialog
  M.confirm = (m) => `<div class="modal narrow" id="confirm"><div class="modal-head"><h2>${esc(m.title)}</h2><button class="btn ghost x" data-act="close-modal">✕</button></div>
      <div class="modal-body"><p style="margin:0">${esc(m.body)}</p></div>
      <div class="modal-foot"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" data-act="${m.act}">${esc(m.yes || "OK")}</button></div></div>`;

  // ================================================================ ASOS allocation
  M.asos = function (m) {
    const s = App.state;
    const a = TC.ASOS_BY_ID[m.id];
    const avail = E.asosAvailable(s, m.team, m.id).filter((id) => a.types.some((t) => R.capMatches(R.cap(id).code, t)));
    const groups = { A: [], B: [], C: [] };
    avail.forEach((id) => groups[s.cards[id].zone].push(id));
    const chk = R.checkAsos(m.sel, a);
    const canMeet = E.canMeetAsos(s, m.team, m.id);
    const pct = Math.min(100, (chk.total / a.points) * 100);
    return `<div class="modal" id="asos-modal"><div class="modal-head"><h2>ASOS · ${esc(a.name)}</h2><button class="btn ghost x" data-act="close-modal">✕</button></div>
      <div class="modal-body"><div class="planner"><div class="art"><img src="${a.art}" alt=""><div class="muted" style="font-size:12.5px">Requires a combination of <b>${a.types.join(" / ")}</b> capability cards totalling <b>${a.points}</b> points or more, from any zone. Committed cards turn sideways for this turn. Deterrence is not reduced.</div></div>
      <div><div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><div class="meter ${chk.ok ? "ok" : ""}" style="flex:1"><i style="width:${pct}%"></i></div><b>${chk.total} / ${a.points}</b>
        <button class="btn sm" data-act="as-auto" ${canMeet ? "" : "disabled"}>Auto-select</button></div>
        <div class="grouped flow">${TC.ZONES.map((z) => `<div class="g"><div class="gl">Zone ${z}</div><div class="cards">${groups[z].map((id) => K.capMini(id, s, { big: true, pick: true, sel: m.sel.includes(id), ignoreStatus: true, data: `data-act="as-cap" data-id="${id}"` })).join("") || '<span class="muted" style="padding-top:18px">none</span>'}</div></div>`).join("")}</div>
        ${canMeet ? "" : '<div class="banner warn" style="margin-top:12px">You cannot meet this request with forces in theater. Declare it unmet, then pick GFM forces to cover it under Force Management → ASOS cover. They arrive committed (sideways) for next turn.</div>'}
      </div></div></div>
      <div class="modal-foot">${canMeet ? "" : '<button class="btn danger left" data-act="as-unmet">Declare unmet</button>'}<button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn primary" data-act="as-confirm" id="as-confirm" ${chk.ok ? "" : "disabled"}>Commit forces</button></div></div>`;
  };
  A["as-cap"] = (el) => {
    const m = modal();
    const id = el.dataset.id;
    m.sel = m.sel.includes(id) ? m.sel.filter((x) => x !== id) : m.sel.concat(id);
    rerender();
  };
  A["as-auto"] = () => {
    const m = modal();
    m.sel = R.autoAsos(E.asosAvailable(App.state, m.team, m.id), TC.ASOS_BY_ID[m.id]) || [];
    rerender();
  };
  A["as-confirm"] = () => {
    const m = modal();
    const r = E.allocateAsos(App.state, m.team, m.id, m.sel);
    if (!r.ok) return App.notify(r.error);
    App.ui.modal = null;
    App.save();
    App.render();
    App.flow();
  };
  A["as-unmet"] = () => {
    const m = modal();
    const r = E.declareAsosUnmet(App.state, m.team, m.id);
    if (!r.ok) return App.notify(r.error);
    App.ui.modal = null;
    App.save();
    App.render();
    App.flow();
  };

  // ================================================================ force management
  function zoneButtons(act, id, current, extra = "") {
    return `<div style="display:flex;gap:2px;justify-content:center;margin-top:3px">${TC.ZONES.map((z) => `<button class="btn sm ${current === z ? "primary" : ""}" style="padding:1px 6px;font-size:11px" data-act="${act}" data-id="${id}" data-z="${z}" ${extra}>${z}</button>`).join("")}</div>`;
  }

  function gfmGrid(s, me, act, selected, filter) {
    const plan = s.plans[me];
    const taken = new Map();
    plan.rffNew.forEach((r) => taken.set(r.id, "RFF"));
    plan.rsoi.forEach((r) => taken.set(r.id, "RSOI"));
    plan.asosCover.forEach((r) => taken.set(r.id, "ASOS"));
    const ids = E.gfmCaps(s, me).filter((id) => !filter || filter(id));
    const groups = {};
    ids.forEach((id) => (groups[R.cap(id).code] = groups[R.cap(id).code] || []).push(id));
    return Object.keys(groups)
      .sort((a, b) => (TC.CAPABILITY_TYPES[a] || a).localeCompare(TC.CAPABILITY_TYPES[b] || b))
      .map((code) => {
        const cards = groups[code]
          .sort((a, b) => R.cap(b).points - R.cap(a).points || R.cap(a).cat - R.cap(b).cat)
          .map((id) => {
            const sel = selected.find((r) => r.id === id);
            const other = !sel && taken.get(id);
            return `<div style="display:flex;flex-direction:column;align-items:center">${K.capMini(id, s, { big: true, sel: !!sel, disabled: !!other })}${other ? `<span class="muted" style="font-size:10px">${other}</span>` : zoneButtons(act, id, sel && sel.zone)}</div>`;
          })
          .join("");
        return `<div class="g"><div class="gl" style="font-size:11px">${esc(TC.CAPABILITY_TYPES[code] || code)}</div><div class="cards">${cards}</div></div>`;
      })
      .join("");
  }

  M.forces = function (m) {
    const s = App.state;
    const me = App.me();
    const plan = s.plans[me];
    const unmet = E.unmetAsos(s, me);
    const rsoi = E.hasRsoiPlanned(s, me);
    const tabs = [["rff", "Requests for Forces"], ["transfers", "Zone transfers"]];
    if (rsoi) tabs.push(["rsoi", `RSOI (${plan.rsoi.length}/3)`]);
    if (unmet.length) tabs.push(["asos", "ASOS cover"]);
    const projected = E.rffProjected(s, me);
    let body = "";
    if (m.tab === "rff") {
      const cur = E.rffInTheater(s, me);
      const keep = cur.caps
        .map((id) => `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">${K.capMini(id, s, { big: true, ignoreStatus: true, disabled: plan.rffReturn.includes(id) })}<button class="btn sm ${plan.rffReturn.includes(id) ? "danger" : ""}" data-act="ff-return" data-id="${id}">${plan.rffReturn.includes(id) ? "Returning" : "Keep"}</button><span class="faint" style="font-size:10px">Zone ${s.cards[id].zone}</span></div>`)
        .concat(cur.cmds.map((id) => `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">${K.cmdMini(id, { big: true, disabled: plan.rffReturn.includes(id) })}<button class="btn sm ${plan.rffReturn.includes(id) ? "danger" : ""}" data-act="ff-return" data-id="${id}">${plan.rffReturn.includes(id) ? "Returning" : "Keep"}</button></div>`))
        .join("");
      const cmds = E.gfmCommands(s, me)
        .map((id) => {
          const sel = plan.rffNew.some((r) => r.id === id);
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">${K.cmdMini(id, { big: true, sel })}<button class="btn sm ${sel ? "primary" : ""}" data-act="ff-rff-cmd" data-id="${id}">${sel ? "Requested" : "Request"}</button></div>`;
        })
        .join("");
      body = `<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><b>RFF forces in theater after tailoring:</b><div class="meter ${projected <= E.RFF_LIMIT ? "ok" : ""}" style="width:220px"><i style="width:${(projected / E.RFF_LIMIT) * 100}%"></i></div><b>${projected} / ${E.RFF_LIMIT}</b>
          <span class="muted" style="font-size:12px">SecWar and RSOI forces do not count${s.settings.commandsCountTowardRff ? "" : "; MSCs do not count (variant)"}.</span></div>
        <div class="banner info">Requested forces arrive during Force Tailoring at the end of this turn, so they are available <b>next</b> turn. SecWar forces redeploy automatically each turn.</div>
        ${keep ? `<h3 style="margin:10px 0 6px">Already in theater via RFF — keep or return</h3><div style="display:flex;gap:10px;flex-wrap:wrap">${keep}</div>` : ""}
        <h3 style="margin:16px 0 6px">GFM major subordinate commands</h3><div style="display:flex;gap:10px;flex-wrap:wrap">${cmds || '<span class="muted">All MSCs are in theater.</span>'}</div>
        <h3 style="margin:16px 0 6px">GFM capabilities — click a zone to request a card there</h3><div class="grouped flow">${gfmGrid(s, me, "ff-rff", plan.rffNew)}</div>`;
    } else if (m.tab === "transfers") {
      body = `<div class="banner info">Capabilities move between zones during Force Tailoring at the end of this turn. They still serve this turn's tasks and ASOS in their current zone. SecWar cards redeploy instead of transferring.</div>
        ${TC.ZONES.map((z) => {
          const ids = R.capsInZone(s, me, z).sort((a, b) => R.cap(a).cat - R.cap(b).cat || R.cap(b).points - R.cap(a).points);
          return `<h3 style="margin:12px 0 6px">From Zone ${z} <span class="muted" style="font-size:13px">deterrence ${R.deterrence(s, me, z)} vs ${R.deterrence(s, TC.other(me), z)}</span></h3><div style="display:flex;gap:8px;flex-wrap:wrap">${ids
            .map((id) => {
              const tr = plan.transfers.find((t) => t.id === id);
              const secwar = s.cards[id].origin === "secwar";
              return `<div style="display:flex;flex-direction:column;align-items:center">${K.capMini(id, s, { big: true, sel: !!tr, ignoreStatus: true })}${secwar ? '<span class="faint" style="font-size:10px">redeploys</span>' : zoneButtons("ff-move", id, tr ? tr.to : z)}</div>`;
            })
            .join("")}</div>`;
        }).join("")}`;
    } else if (m.tab === "rsoi") {
      body = `<div class="banner info">If the RSOI task executes successfully, up to 3 additional GFM capabilities arrive during this turn's Force Tailoring, beyond the RFF cap. They redeploy at the end of next turn.</div><div class="grouped flow">${gfmGrid(s, me, "ff-rsoi", plan.rsoi)}</div>`;
    } else if (m.tab === "asos") {
      const status = E.asosCoverStatus(s, me);
      const types = new Set(unmet.flatMap((aid) => TC.ASOS_BY_ID[aid].types));
      body = `<div class="banner warn">Unmet ASOS requests must be covered by GFM forces. They are deployed first, count against the RFF cap, and stay committed (sideways) through next turn.</div>
        ${status.map((st) => `<div style="margin-bottom:6px">${st.ok ? '<span class="chip goodc">covered</span>' : '<span class="chip badc">not covered</span>'} <b>${esc(TC.ASOS_BY_ID[st.asosId].name)}</b> — ${TC.ASOS_BY_ID[st.asosId].points} pts of ${TC.ASOS_BY_ID[st.asosId].types.join("/")}</div>`).join("")}
        <div class="grouped flow" style="margin-top:10px">${gfmGrid(s, me, "ff-asos", plan.asosCover, (id) => R.cap(id).points > 0 && [...types].some((t) => R.capMatches(R.cap(id).code, t)))}</div>`;
    }
    return `<div class="modal wide"><div class="modal-head"><h2>Force Management</h2>${K.teamChip(me)}<div class="seg" style="margin-left:14px">${tabs.map(([k, l]) => `<button class="btn sm ${m.tab === k ? "on" : ""}" data-act="ff-tab" data-k="${k}">${l}</button>`).join("")}</div><button class="btn ghost x" data-act="close-modal">✕</button></div>
      <div class="modal-body">${body}</div><div class="modal-foot"><button class="btn primary" data-act="close-modal">Done</button></div></div>`;
  };
  const ffResult = (r) => {
    if (r && !r.ok && r.error) App.toast(`<div class="t"><b>Not allowed</b><br>${esc(r.error)}</div>`, null, 3000);
    App.save();
    rerender();
  };
  A["ff-tab"] = (el) => {
    modal().tab = el.dataset.k;
    rerender();
  };
  A["ff-rff"] = (el) => ffResult(E.toggleRff(App.state, App.me(), el.dataset.id, el.dataset.z));
  A["ff-rff-cmd"] = (el) => ffResult(E.toggleRff(App.state, App.me(), el.dataset.id));
  A["ff-return"] = (el) => ffResult(E.toggleRffReturn(App.state, App.me(), el.dataset.id));
  A["ff-rsoi"] = (el) => ffResult(E.toggleRsoi(App.state, App.me(), el.dataset.id, el.dataset.z));
  A["ff-asos"] = (el) => ffResult(E.toggleAsosCover(App.state, App.me(), el.dataset.id, el.dataset.z));
  A["ff-move"] = (el) => ffResult(E.setTransfer(App.state, App.me(), el.dataset.id, el.dataset.z));

  // ================================================================ capability mat
  M.mat = function (m) {
    const s = App.state;
    const zone = m.zone;
    const army = (team) => {
      const br = R.deterrenceBreakdown(s, team, zone);
      const cols = br.parts
        .map((p) => {
          const ids = R.capsInZone(s, team, zone).filter((id) => R.cap(id).cat === p.cat);
          return `<div class="catcol"><div class="ch"><span>CAT ${p.cat} · ${p.cat === 1 ? "1" : "1/" + p.cat}</span><span>${p.count} → +${p.value}</span></div><div class="cards">${ids.map((id) => K.capMini(id, s)).join("")}</div></div>`;
        })
        .join("");
      return `<div class="army"><h3>${K.teamChip(team)} <span class="muted" style="font-size:14px">Deterrence ${br.total} → ${K.die(R.legend("deterrence", zone, br.total), { size: 20 })}</span></h3><div class="cols">${cols}</div></div>`;
    };
    return `<div class="modal wide"><div class="modal-head"><h2>Zone ${zone} capability mats</h2><span class="muted">+1 deterrence for every 1 / 2 / 3 / 4 cards of category 1 / 2 / 3 / 4. Sideways cards are committed this turn but still deter.</span><button class="btn ghost x" data-act="close-modal">✕</button></div>
      <div class="modal-body"><div class="mat">${army("fourth")}${army("tenth")}</div>
      <div class="btn-row" style="margin-top:12px"><span class="chip">SW = SecWar-directed</span><span class="chip">RFF = requested</span><span class="chip">RSOI</span><span class="chip">ASOS = arrived to cover an ASOS request</span></div></div></div>`;
  };
})();
