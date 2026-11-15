// Player-comfort features layered on top of the core UI: undo, first-time tips,
// score breakdown, end-of-campaign analysis, sound, save slots and touch support.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = TC.rules;
  const E = TC.engine;
  const AI = TC.ai;
  const K = TC.kit;
  const esc = K.esc;
  const App = TC.app;
  const M = (TC.modals = TC.modals || {});
  const A = (TC.modalActions = TC.modalActions || {});

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  // ================================================================ why a card is blocked
  // Turns an engine issue into a few words that fit on a card.
  function shortIssue(issue) {
    let m;
    if ((m = /^No (\S+) staff/.exec(issue))) return { kind: "staff", text: `needs ${m[1]} staff` };
    if ((m = /^Needs (.+?) — not in theater/.exec(issue))) return { kind: "command", text: `needs ${(/\(([^)]+)\)/.exec(m[1]) || [0, m[1]])[1]} (request it)` };
    if (/No MSC has bandwidth/.test(issue)) return { kind: "command", text: "no free MSC" };
    if (/maximum load/.test(issue)) return { kind: "command", text: "MSC at full load" };
    if ((m = /^Missing capability type: (.+)\.$/.exec(issue))) return { kind: "caps", text: `needs ${m[1]} in zone` };
    if ((m = /^Capabilities total (\d+) of (\d+)/.exec(issue))) return { kind: "caps", text: `short ${m[2] - m[1]} capability pts` };
    if (/^Assurance/.test(issue)) return { kind: "assurance", text: "Assurance too high" };
    if ((m = /^Needs (\d+) Influence/.exec(issue))) return { kind: "cost", text: `needs ◆${m[1]} Influence` };
    if ((m = /^Needs (\d+) Access/.exec(issue))) return { kind: "cost", text: `needs ${m[1]} Access` };
    return null;
  }
  // The smallest obstacle to planning `task` anywhere: { kind, text, all } or null.
  App.blockReason = function (s, me, task) {
    let best = null;
    TC.ZONES.forEach((z) =>
      (task.branches || [{ key: null }]).forEach((b) => {
        const ev = E.evaluateTask(s, me, { num: task.num, zone: z, branch: b.key });
        const issues = ev.issues.map(shortIssue).filter(Boolean);
        if (issues.length && (!best || issues.length < best.issues.length)) best = { issues, zone: z, full: ev.issues };
      })
    );
    return best ? Object.assign({ all: best.full.join(" "), zone: best.zone }, best.issues[0]) : null;
  };
  // One sentence on why "Suggest a plan" could not fill every slot.
  App.whyNotMore = function (s, me) {
    const counts = {};
    TC.TASKS.forEach((task) => {
      if (s.plans[me].tasks.some((t) => t.num === task.num)) return;
      const r = App.blockReason(s, me, task);
      if (r) counts[r.kind] = (counts[r.kind] || 0) + 1;
    });
    const names = {
      staff: "staff cells you have already used",
      command: "an MSC that is busy or not in theater",
      caps: "more capability points in a zone",
      assurance: "lower Assurance",
      cost: "more Influence or Access",
    };
    const parts = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${n} need ${names[k]}`);
    if (!parts.length) return "The cards that are left would over-task an MSC or are not worth their cost this year.";
    return `Other cards can't be played yet: ${parts.join("; ")}.${counts.command || counts.caps ? " Force management can request more for next year." : ""}`;
  };

  // ================================================================ score breakdown
  App.scoreBreakdown = E.scoreBreakdown;
  const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;
  App.scoreTip = function (s, team) {
    const rows = App.scoreBreakdown(s, team).filter((r) => r.pts);
    return `${TC.TEAM_INFO[team].name}: ${s.teams[team].score} points${rows.length ? " — " + rows.map((r) => `${r.label} ${signed(r.pts)}`).join(", ") : ""}. Click for details.`;
  };
  function breakdownCol(s, team) {
    const rows = App.scoreBreakdown(s, team);
    const turns = [];
    for (let t = 1; t <= s.turn; t++) {
      const ev = s.scoreEvents.filter((e) => e.team === team && e.turn === t);
      if (ev.length) turns.push(`<tr title="${esc(ev.map((e) => `${signed(e.pts)} ${e.reason}`).join("\n"))}"><td>Turn ${t}</td><td class="${ev.reduce((x, e) => x + e.pts, 0) < 0 ? "bad" : "good"}">${signed(ev.reduce((x, e) => x + e.pts, 0))}</td></tr>`);
    }
    return `<div class="tray ${K.teamCls(team)}" style="text-align:left"><h3>${K.teamChip(team)}<span style="margin-left:auto;font-size:26px">${s.teams[team].score}</span></h3>
      <table class="bd">${rows.map((r) => `<tr class="${r.pts ? "" : "zero"}"><td>${r.label}</td><td class="${r.pts < 0 ? "bad" : r.pts > 0 ? "good" : ""}">${r.pts ? signed(r.pts) : "0"}</td></tr>`).join("")}</table>
      ${turns.length ? `<div class="grp">By turn <span class="faint">(hover a row for details)</span></div><table class="bd">${turns.join("")}</table>` : ""}</div>`;
  }
  M.score = () => {
    const s = App.state;
    return `<div class="modal" style="width:min(820px,94vw)"><div class="modal-head"><h2>Where the points came from</h2><button class="btn ghost x" data-act="close-modal">✕</button></div>
      <div class="modal-body"><div class="trays" style="margin-top:0">${breakdownCol(s, "fourth")}${breakdownCol(s, "tenth")}</div>
      <p class="muted" style="font-size:12.5px;margin:12px 0 0">A negative total is possible: holding the higher deterrence during a Limited Operation or LSCO costs 3 points, and each over-tasked MSC costs 1.</p></div>
      <div class="modal-foot"><button class="btn primary" data-act="close-modal">Close</button></div></div>`;
  };
  App.actions.score = () => App.state && App.openModal({ type: "score" });

  // ================================================================ end-of-campaign analysis
  TC.endAnalysis = function (s) {
    const hist = s.history;
    if (!hist.length) return "";
    const name = (t) => TC.TEAM_INFO[t].name;
    const bullets = [];
    // 1. the scoring category with the widest gap
    const b4 = App.scoreBreakdown(s, "fourth");
    const b10 = App.scoreBreakdown(s, "tenth");
    const gaps = b4.map((r, i) => ({ label: r.label, f: r.pts, t: (b10[i] || { pts: 0 }).pts })).sort((a, b) => Math.abs(b.f - b.t) - Math.abs(a.f - a.t));
    if (gaps[0] && gaps[0].f !== gaps[0].t) {
      const g = gaps[0];
      const lead = g.f > g.t ? "fourth" : "tenth";
      bullets.push(`<b>${g.label}</b> made the biggest difference: ${name("fourth")} ${signed(g.f)}, ${name("tenth")} ${signed(g.t)} (${name(lead)} ahead by ${Math.abs(g.f - g.t)}).`);
    }
    // 2. the turn with the biggest swing
    let prev = { fourth: 0, tenth: 0 };
    let swing = null;
    hist.forEach((h) => {
      const d = h.score.fourth - prev.fourth - (h.score.tenth - prev.tenth);
      if (!swing || Math.abs(d) > Math.abs(swing.d)) swing = { turn: h.turn, d, h };
      prev = h.score;
    });
    if (swing && swing.d) {
      const who = swing.d > 0 ? "fourth" : "tenth";
      const big = swing.h.crisis.filter((c) => c.winner === who).map((c) => `${TC.CRISIS_TYPES[c.type].name} in Zone ${c.zone}`);
      bullets.push(`<b>Turn ${swing.turn}</b> was the turning point: ${name(who)} gained ${Math.abs(swing.d)} on the other side${big.length ? ` by winning ${big.join(" and ")}` : ""}.`);
    }
    // 3. violent crises
    const all = hist.flatMap((h) => h.crisis);
    const violent = all.filter((c) => TC.CRISIS_TYPES[c.type].violent);
    if (violent.length) {
      const w4 = violent.filter((c) => c.winner === "fourth").length;
      const w10 = violent.filter((c) => c.winner === "tenth").length;
      bullets.push(`<b>${violent.length} of ${all.length} crises turned violent</b> (worth 4 or 7 points): ${name("fourth")} won ${w4}, ${name("tenth")} won ${w10}.`);
    } else bullets.push("<b>No crisis turned violent</b>, so every zone win was worth only 1 or 2 points.");
    // 4. penalties
    TC.TEAMS.forEach((t) => {
      const rows = App.scoreBreakdown(s, t);
      const pen = rows.filter((r) => r.pts < 0).reduce((x, r) => x + r.pts, 0);
      if (pen <= -3) bullets.push(`${name(t)} gave away <b>${Math.abs(pen)} points</b> in penalties (higher deterrence in violent crises, over-tasked MSCs).`);
    });
    const zoneRow = (z) => {
      const cs = all.filter((c) => c.zone === z);
      const pts = (t) => s.scoreEvents.filter((e) => e.team === t && new RegExp(`Zone ${z}\\b`).test(e.reason)).reduce((x, e) => x + e.pts, 0);
      return `<tr><td>Zone ${z}</td><td class="c4">${cs.filter((c) => c.winner === "fourth").length}</td><td class="c10">${cs.filter((c) => c.winner === "tenth").length}</td><td>${cs.filter((c) => !c.winner).length}</td><td class="c4">${signed(pts("fourth")) || 0}</td><td class="c10">${signed(pts("tenth")) || 0}</td></tr>`;
    };
    return `<div class="endmore"><div class="banner tip" style="text-align:left;margin:0"><b>What decided the campaign</b><ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul></div>
      <div><table class="hist"><tr><th></th><th>4th wins</th><th>10th wins</th><th>Ties</th><th>4th pts</th><th>10th pts</th></tr>${TC.ZONES.map(zoneRow).join("")}</table>
      <div class="muted" style="font-size:12px;margin-top:4px">Points scored in each zone (wins, bonuses and deterrence).</div></div></div>`;
  };

  // ================================================================ undo
  // A snapshot taken before a commit. It stays valid until a die is rolled
  // (the dice are part of the saved state, so the seed tells us) or the phase ends.
  App.checkpoint = function (label) {
    const s = App.state;
    if (!s || s.tutorial) return;
    App.ui.undo = { snap: JSON.stringify(s), rng: s.rng, phase: s.phase, turn: s.turn, team: App.me(), label };
  };
  App.canUndo = function () {
    const u = App.ui.undo;
    const s = App.state;
    return !!(u && s && !s.tutorial && s.rng === u.rng && s.phase === u.phase && s.turn === u.turn && (App.humans().length < 2 || App.me() === u.team));
  };
  App.actions.undo = function () {
    if (!App.canUndo() || App.ui.modal) return;
    const u = App.ui.undo;
    App.ui.undo = null;
    App.state = JSON.parse(u.snap);
    Object.assign(App.ui, { toasts: [], flashes: {}, snap: null });
    App.save();
    App.render();
    App.toast(`<div class="t"><b>Undone</b><br>${esc(u.label)}</div>`, null, 2500);
    App.flow();
  };
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && App.canUndo()) {
      e.preventDefault();
      App.actions.undo();
    }
  });

  // ================================================================ first-time tips
  const TIPS = {
    evenTurn: {
      title: "Even year: your allies' confidence slips",
      body: "At the end of every even-numbered turn, <b>Assurance</b> and <b>Partner Interoperability</b> drop by 1 in every zone. Assurance at 1 doubles the capability points your tasks need there, and a lower Interoperability can cost you a partner die. Tasks that raise them this year cancel the drop.",
    },
    disruption: {
      title: "You can play one task as Disruption",
      body: "Once per turn, instead of executing a task for yourself you may <b>play it as Disruption</b>: its effects are <i>subtracted</i> from the enemy's trackers in that zone. It is worth it when it takes away an advantage (Intelligence, Communications, Protection) or drops them below a dice step. Hover a task card to see what it would do either way.",
    },
    disrupted: {
      title: "The enemy just disrupted you",
      body: "The other army played one of its tasks as <b>Disruption</b>, lowering your trackers instead of raising its own. Each army can do this once per turn. Check the highlighted rows on the board: if you lost an advantage or a dice step, one of your remaining tasks may win it back.",
    },
    arrivals: {
      title: "Your requested forces have arrived",
      body: "Forces you asked for through an <b>RFF</b> (Request for Forces) arrive now, at Force Tailoring, so they are ready for <b>next</b> turn's tasks. They stay until you return them in Force Management. At most 10 requested forces may be in theater. SecWar and RSOI forces come and go on their own.",
    },
    violent: {
      title: "This crisis is violent",
      body: "In a <b>Limited Operation</b> or <b>Large-Scale Combat Operation</b> each army adds its <b>Deterrence</b> to its dice, and the win is worth 4 or 7 points. But the army with the <i>higher</i> deterrence in the zone loses 3 points for escalating. A big deterrence gap is what makes violent crises likely in the first place: it raises Instability.",
    },
    overtask: {
      title: "That MSC is over-tasked",
      body: "A major subordinate command handles two tasks a turn comfortably. Its third (and later) task only happens on a <b>d6 roll</b>, and each over-tasked MSC costs you <b>1 point</b> at the end of the turn. Spread tasks across your MSCs, or request another MSC in Force Management.",
    },
  };
  const TIPS_KEY = "theatercomplex.tips";
  function tipsSeen() {
    const raw = store.get(TIPS_KEY, "{}");
    if (raw === "off") return null;
    try {
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }
  function tipDue(s, me) {
    const opp = TC.other(me);
    if (s.phase === "planning" && !s.plans[me].ready) {
      if (s.turn % 2 === 0) return "evenTurn";
      const load = E.commandLoad(s, me);
      if (Object.values(load).some((n) => n > TC.MSC_FREE_SLOTS)) return "overtask";
    }
    if (s.phase === "implementation" && s.impl && !s.impl.done && !App.ui.overlay) {
      if (s.log.some((l) => l.turn === s.turn && l.text.startsWith(`DISRUPTION against ${TC.TEAM_INFO[me].name}`))) return "disrupted";
      if (s.impl.active === me && E.remainingTasks(s, me).some((t) => E.canDisrupt(s, me, t.uid))) return "disruption";
    }
    if (s.phase === "crisis" && s.crisis && s.crisis.current && TC.CRISIS_TYPES[s.crisis.current.type].violent) return "violent";
    if (s.phase === "tailoring" && s.tailoring && s.tailoring[me].arrived.length) return "arrivals";
    return null;
  }
  App.checkTips = function () {
    const s = App.state;
    if (!s || App.ui.screen !== "game" || s.tutorial || App.ui.modal || App.ui.curtain || App.ui.busy || App.humans().length !== 1) return;
    const seen = tipsSeen();
    if (!seen) return;
    const order = [tipDue(s, App.humans()[0])].filter(Boolean);
    const key = order.find((k) => !seen[k]);
    if (!key) return;
    seen[key] = 1;
    store.set(TIPS_KEY, JSON.stringify(seen));
    App.openModal({ type: "tip", key });
  };
  M.tip = (m) => {
    const t = TIPS[m.key];
    return `<div class="modal narrow tipmodal"><div class="modal-head"><h2>💡 ${esc(t.title)}</h2></div>
      <div class="modal-body"><p style="margin:0">${t.body}</p></div>
      <div class="modal-foot"><button class="btn ghost left" data-act="tips-off" title="You can turn them back on in the menu">Don't show tips</button><button class="btn primary" data-act="close-modal" id="tip-ok">Got it</button></div></div>`;
  };
  A["tips-off"] = () => {
    store.set(TIPS_KEY, "off");
    App.closeModal();
  };
  App.actions["tips-toggle"] = () => {
    store.set(TIPS_KEY, tipsSeen() ? "off" : "{}");
    App.render();
  };
  App.tipsOn = () => !!tipsSeen();

  // ================================================================ sound
  // Short synthesised cues (no audio files). Off switch in the menu.
  const SOUND_KEY = "theatercomplex.sound";
  let ctx = null;
  App.soundOn = () => store.get(SOUND_KEY, "on") !== "off";
  function blip(freq, start, dur, type, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, ctx.currentTime + start);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol || 0.07, ctx.currentTime + start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur + 0.02);
  }
  const CUES = {
    roll: () => { for (let i = 0; i < 7; i++) blip(180 + Math.random() * 260, i * 0.085 + Math.random() * 0.02, 0.05, "square", 0.035); },
    land: () => blip(150, 0, 0.12, "triangle", 0.09),
    good: () => { blip(523, 0, 0.12); blip(784, 0.1, 0.18); },
    bad: () => { blip(330, 0, 0.14, "sawtooth", 0.04); blip(220, 0.12, 0.22, "sawtooth", 0.04); },
    win: () => { blip(523, 0, 0.12); blip(659, 0.11, 0.12); blip(784, 0.22, 0.26); },
    lose: () => { blip(392, 0, 0.16, "triangle"); blip(294, 0.15, 0.3, "triangle"); },
    tie: () => blip(440, 0, 0.2, "triangle"),
    plan: () => blip(660, 0, 0.07, "sine", 0.04),
    fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => blip(f, i * 0.14, i === 3 ? 0.5 : 0.14)); },
  };
  App.sfx = function (name) {
    if (!App.soundOn() || !CUES[name]) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      CUES[name]();
    } catch (e) {
      /* no audio device: stay silent */
    }
  };
  App.actions["sound-toggle"] = () => {
    store.set(SOUND_KEY, App.soundOn() ? "off" : "on");
    App.sfx("good");
    App.render();
  };

  // ================================================================ colour-blind friendly marks
  const CB_KEY = "theatercomplex.marks";
  App.marksOn = () => store.get(CB_KEY, "off") === "on";
  App.applyMarks = () => document.body.classList.toggle("cb", App.marksOn());
  App.actions["marks-toggle"] = () => {
    store.set(CB_KEY, App.marksOn() ? "off" : "on");
    App.applyMarks();
    App.render();
  };

  // ================================================================ save slots
  const SLOTS_KEY = "theatercomplex.slots.v1";
  const MAX_SLOTS = 6;
  const slots = () => {
    try {
      return JSON.parse(store.get(SLOTS_KEY, "[]")) || [];
    } catch (e) {
      return [];
    }
  };
  const describe = (s) => `Turn ${Math.min(s.turn, s.settings.turns)} of ${s.settings.turns} · ${(E.PHASES.find((p) => p.key === s.phase) || { label: "Finished" }).label} · 4th ${s.teams.fourth.score} – ${s.teams.tenth.score} 10th`;
  M.saves = (m) => {
    const list = slots();
    const inGame = App.ui.screen === "game" && App.state && !App.state.tutorial;
    const rows = list
      .map(
        (sl, i) => `<div class="slot"><div><b>${esc(sl.name)}</b><div class="muted" style="font-size:12px">${esc(sl.info)} · saved ${esc(new Date(sl.at).toLocaleString())}</div></div>
          <span style="flex:1"></span>${inGame ? `<button class="btn sm" data-act="slot-save" data-i="${i}" title="Replace this slot with the current campaign">Overwrite</button>` : ""}
          <button class="btn sm primary" data-act="slot-load" data-i="${i}">Load</button><button class="btn sm ghost" data-act="slot-del" data-i="${i}" title="Delete this slot">✕</button></div>`
      )
      .join("");
    return `<div class="modal" style="width:min(680px,94vw)"><div class="modal-head"><h2>Saved campaigns</h2><button class="btn ghost x" data-act="close-modal">✕</button></div>
      <div class="modal-body">${m.error ? `<div class="banner warn" style="margin-top:0">${esc(m.error)}</div>` : ""}
        ${inGame ? `<div class="slot new"><input type="text" id="slot-name" maxlength="40" placeholder="Name this save (optional)" value=""><button class="btn primary" data-act="slot-save" data-i="-1" ${list.length >= MAX_SLOTS ? "disabled" : ""}>Save current campaign</button></div>${list.length >= MAX_SLOTS ? `<div class="muted" style="font-size:12px">All ${MAX_SLOTS} slots are in use. Overwrite or delete one.</div>` : ""}` : ""}
        ${rows || '<p class="muted">No saved campaigns yet.</p>'}
        <p class="muted" style="font-size:12px;margin:12px 0 0">Slots live in this browser only and are lost if its site data is cleared. <b>Download save file</b> in the menu gives you a copy you can keep or send to someone.</p></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">Close</button></div></div>`;
  };
  App.actions.saves = () => {
    App.ui.overlay = null;
    App.openModal({ type: "saves" });
  };
  A["slot-save"] = (el) => {
    const s = App.state;
    if (!s) return;
    const list = slots();
    const i = Number(el.dataset.i);
    const typed = (document.getElementById("slot-name") || { value: "" }).value.trim();
    const entry = { name: typed || (i >= 0 ? list[i].name : `Campaign ${new Date().toLocaleDateString()}`), info: describe(s), at: Date.now(), data: JSON.stringify(s) };
    if (i >= 0) list[i] = entry;
    else list.unshift(entry);
    const ok = store.set(SLOTS_KEY, JSON.stringify(list));
    App.ui.modal = { type: "saves", error: ok ? "" : "The browser's storage is full. Delete a slot, or use Download save file instead." };
    App.render();
  };
  A["slot-del"] = (el) => {
    const list = slots();
    list.splice(Number(el.dataset.i), 1);
    store.set(SLOTS_KEY, JSON.stringify(list));
    App.render();
  };
  A["slot-load"] = (el) => {
    const sl = slots()[Number(el.dataset.i)];
    if (!sl) return;
    App.ui.modal = null;
    App.loadState(JSON.parse(sl.data));
  };
  App.hasSlots = () => slots().length > 0;

  // ================================================================ save files
  // Hot-seat saves hold both secret plans, so they are written in a form that
  // cannot be read by opening the file in a text editor.
  const MARK = "TCSAVE1:";
  App.encodeSave = function (state) {
    const json = JSON.stringify(state, null, 1);
    const secret = TC.TEAMS.every((t) => state.controllers[t] === "human") && state.phase === "planning";
    if (!secret) return json;
    const bytes = new TextEncoder().encode(json);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return MARK + btoa(bin);
  };
  App.decodeSave = function (text) {
    const t = text.trim();
    if (!t.startsWith(MARK)) return JSON.parse(t);
    const bin = atob(t.slice(MARK.length));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  // ================================================================ adjudicator log and campaign record
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const stamp = (s) => `seed${s.seed}-turn${Math.min(s.turn, s.settings.turns)}`;
  // One row per adjudicator log line. Opens directly in Excel.
  App.logCsv = function (s) {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const rows = [["line", "turn", "phase", "army", "kind", "text"].join(",")];
    s.log.forEach((l, i) => rows.push([i + 1, l.turn, q(l.phase), q(l.team ? TC.TEAM_INFO[l.team].name : ""), q(l.tone), q(l.text)].join(",")));
    return "\uFEFF" + rows.join("\r\n");
  };
  // The campaign as structured data. Field names are stable so records from
  // many games can be loaded into one table.
  App.campaignRecord = E.campaignRecord;
  // In a hot-seat game the current year's plans are still secret during planning;
  // the log only ever contains what both staffs have already seen.
  App.actions["export-log"] = () => App.state && download(`theatercomplex-log-${stamp(App.state)}.csv`, App.logCsv(App.state), "text/csv");
  App.actions["export-record"] = () => App.state && download(`theatercomplex-record-${stamp(App.state)}.json`, JSON.stringify(App.campaignRecord(App.state), null, 1), "application/json");

  // ================================================================ title-screen extras
  // The free-form tabletop lives outside the game folder; only offer the link
  // when it is really there (it is missing when just `game/` was shared).
  let tabletop = null;
  App.afterRender = function () {
    const link = document.getElementById("tabletop-link");
    if (!link) return;
    if (tabletop === true) link.hidden = false;
    if (tabletop !== null) return;
    tabletop = false;
    const probe = new Image();
    probe.onload = () => {
      tabletop = true;
      const l = document.getElementById("tabletop-link");
      if (l) l.hidden = false;
    };
    probe.src = "../assets/trackers/trackerArray_zoneA.svg";
  };

  // ================================================================ touch
  // No hover on a touch screen: the first tap on a card shows what it does,
  // the second tap acts. Tapping a tracker label or chip shows its tooltip.
  let lastTouch = 0;
  let armed = null;
  document.addEventListener("pointerdown", (e) => (lastTouch = e.pointerType === "touch" || e.pointerType === "pen" ? Date.now() : 0), true);
  App.isTouch = () => Date.now() - lastTouch < 800;
  document.addEventListener(
    "click",
    (e) => {
      if (!App.isTouch()) return;
      const hint = document.getElementById("touch-tip");
      if (hint) hint.remove();
      const card = e.target.closest("[data-inspect]");
      const button = e.target.closest("button");
      if (card && !button) {
        if (armed === card.dataset.num + "|" + card.dataset.uid && document.querySelector(".preview.inspector")) {
          armed = null;
          return; // second tap: let the normal action run
        }
        armed = card.dataset.num + "|" + card.dataset.uid;
        e.stopPropagation();
        e.preventDefault();
        card.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        const p = document.querySelector(".preview.inspector .ifoot");
        if (p && card.dataset.act) p.textContent = "Tap the card again to open it.";
        return;
      }
      armed = null;
      K.hidePreview();
      // Tooltips: show the title text of whatever was tapped, unless it is a control.
      const tipped = e.target.closest("[title]");
      if (tipped && !tipped.closest("button, a, input, [data-act]") && tipped.title) {
        const r = tipped.getBoundingClientRect();
        const d = document.createElement("div");
        d.id = "touch-tip";
        d.textContent = tipped.title;
        document.body.appendChild(d);
        d.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - d.offsetWidth - 8))}px`;
        d.style.top = `${r.bottom + 6 + d.offsetHeight > window.innerHeight ? Math.max(8, r.top - d.offsetHeight - 6) : r.bottom + 6}px`;
      }
    },
    true
  );

  // ================================================================ force suggestions
  // What the operations officer would request, given the plan so far.
  App.rffHints = function (s, me) {
    try {
      const sim = JSON.parse(JSON.stringify(s));
      const before = new Set(sim.plans[me].rffNew.map((r) => r.id));
      AI.planForces(sim, me);
      return sim.plans[me].rffNew.filter((r) => !before.has(r.id)).map((r) => ({ id: r.id, zone: r.zone }));
    } catch (e) {
      return [];
    }
  };
})();
