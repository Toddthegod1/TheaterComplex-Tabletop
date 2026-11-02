// App controller: screens, board rendering, phase docks, turn flow and saves.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = TC.rules;
  const E = TC.engine;
  const AI = TC.ai;
  const K = TC.kit;
  const esc = K.esc;

  const SAVE_KEY = "theatercomplex.save.v1";
  const App = (TC.app = {
    state: null,
    ui: { screen: "title", modal: null, overlay: null, toasts: [], busy: false, setup: null, lastPlanner: null, curtain: null, flashes: {}, snap: null, handFilter: "all" },
  });

  // ---------------------------------------------------------------- helpers
  App.humans = () => TC.TEAMS.filter((t) => App.state && App.state.controllers[t] === "human");
  App.isHuman = (team) => App.state && App.state.controllers[team] === "human";
  App.speed = () => (App.state ? App.state.settings.aiSpeed : 1);

  App.me = function () {
    const s = App.state;
    const humans = App.humans();
    if (!humans.length) return App.ui.spectate || "fourth";
    if (humans.length === 1) return humans[0];
    if (s.phase === "planning") return humans.find((t) => !s.plans[t].ready) || App.ui.lastPlanner || "fourth";
    if (s.phase === "asos") return humans.find((t) => !E.asosComplete(s, t)) || "fourth";
    if (s.phase === "implementation" && s.impl && !s.impl.done) return s.impl.active;
    return App.ui.lastMe || "fourth";
  };

  App.save = function () {
    if (!App.state || App.state.tutorial) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(App.state));
    } catch (e) {
      /* storage may be unavailable (private mode); the game still runs */
    }
  };
  App.loadSave = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  App.toast = function (html, team, ms = 4200) {
    const id = Math.random().toString(36).slice(2);
    App.ui.toasts.push({ id, html, team });
    renderToasts();
    setTimeout(() => {
      App.ui.toasts = App.ui.toasts.filter((t) => t.id !== id);
      renderToasts();
    }, ms / Math.max(0.5, App.speed() || 0.5));
  };

  App.do = function (fn) {
    const r = fn();
    App.save();
    App.render();
    App.flow();
    return r;
  };

  // ---------------------------------------------------------------- change highlighting
  // Every render compares a snapshot of the visible numbers with the previous
  // one; changed values flash and show a floating delta for FLASH_MS. Re-renders
  // during that window resume the animation via a negative animation-delay.
  const FLASH_MS = 2800;
  function snapshot(s) {
    const m = {};
    TC.TEAMS.forEach((team) => {
      const t = s.teams[team];
      m[`${team}.score`] = t.score;
      m[`${team}.influence`] = t.influence;
      TC.ZONES.forEach((z) => {
        m[`${team}.access.${z}`] = t.access[z];
        m[`${team}.det.${z}`] = R.deterrence(s, team, z);
        TC.TRACKERS.forEach((tr) => (m[`${team}.${z}.${tr.key}`] = t.zones[z][tr.key]));
      });
    });
    TC.ZONES.forEach((z) => (m[`inst.${z}`] = R.instability(s, z)));
    return m;
  }
  function updateFlashes(s) {
    const snap = snapshot(s);
    const now = Date.now();
    const prev = App.ui.snap;
    if (prev && App.ui.snapSeed === s.seed)
      Object.keys(snap).forEach((k) => {
        if (prev[k] !== undefined && prev[k] !== snap[k]) App.ui.flashes[k] = { delta: snap[k] - prev[k], start: now };
      });
    App.ui.snap = snap;
    App.ui.snapSeed = s.seed;
    Object.keys(App.ui.flashes).forEach((k) => now - App.ui.flashes[k].start > FLASH_MS && delete App.ui.flashes[k]);
  }
  // fx(key) -> { cls, style, html } decorating an element whose value just changed.
  function fx(key, badWhenUp) {
    const f = App.ui.flashes[key];
    if (!f) return { cls: "", html: "", style: "" };
    const ago = Date.now() - f.start;
    const good = badWhenUp ? f.delta < 0 : f.delta > 0;
    const dir = good ? "up" : "down";
    return {
      cls: ` flash ${dir}`,
      style: ` style="--ago:-${ago}ms"`,
      html: `<span class="delta ${dir}" style="--ago:-${ago}ms">${f.delta > 0 ? "+" : "−"}${Math.abs(f.delta)}</span>`,
    };
  }
  const zoneFlashing = (zone) => Object.keys(App.ui.flashes).some((k) => k.endsWith(`.${zone}`) || k.includes(`.${zone}.`));

  // ---------------------------------------------------------------- top-level render
  App.render = function () {
    if (App.ui.screen === "game" && App.state) updateFlashes(App.state);
    const root = document.getElementById("app");
    const handScroll = root.querySelector(".hand")?.scrollLeft;
    if (App.ui.screen === "title") root.innerHTML = renderTitle();
    else if (App.ui.screen === "setup") root.innerHTML = renderSetup();
    else root.innerHTML = renderGame();
    const hand = root.querySelector(".hand");
    if (hand && handScroll) hand.scrollLeft = handScroll;
    const log = root.querySelector(".logbox");
    if (log) log.scrollTop = log.scrollHeight;
    renderOverlay();
    renderModal();
    renderToasts();
    TC.tutorial && TC.tutorial.update();
  };

  function renderToasts() {
    const el = document.getElementById("toast-root");
    el.innerHTML = `<div class="toast-wrap">${App.ui.toasts.map((t) => `<div class="toast ${t.team ? K.teamCls(t.team) : ""}">${t.html}</div>`).join("")}</div>`;
  }

  function renderModal() {
    const el = document.getElementById("modal-root");
    const m = App.ui.modal;
    if (!m) {
      el.innerHTML = "";
      return;
    }
    const html = TC.modals[m.type] ? TC.modals[m.type](m) : "";
    el.innerHTML = `<div class="veil" data-act="veil">${html}</div>`;
  }
  App.openModal = (m) => {
    App.ui.modal = m;
    K.hidePreview();
    App.render();
  };
  App.closeModal = () => {
    App.ui.modal = null;
    App.render();
    App.flow();
  };

  // ---------------------------------------------------------------- title & setup
  function renderTitle() {
    const save = App.loadSave();
    const fan = [12, 9, 1, 17, 21].map((n) => `<img src="${K.taskArt("fourth", n)}" style="transform:rotate(${(n % 5) * 5 - 10}deg)" alt="">`).join("");
    return `<div class="screen title"><div class="title-inner">
      <img class="logo" src="img/logo.webp" alt="TheaterComplex">
      <div class="tag">A U.S. Army War College Wargame · Europe Edition · Digital</div>
      <div class="fan">${fan}</div>
      <div class="menu">
        <div class="card" data-act="tutorial"><div class="ico">🎓</div><h3>Tutorial</h3><p>Learn by playing one guided turn as Fourth Army against an AI Tenth Army. About 15 minutes.</p></div>
        <div class="card" data-act="setup"><div class="ico">⚔️</div><h3>New Campaign</h3><p>Two commanders on one screen (hot-seat), or command either army against the AI.</p></div>
        <div class="card" data-act="codex"><div class="ico">📖</div><h3>Rules Codex</h3><p>The full rules, die legend, crisis table, every task and capability card, and rules clarifications.</p></div>
      </div>
      <div class="btn-row" style="justify-content:center;margin-top:18px">
        ${save && save.phase !== "gameOver" ? `<button class="btn primary" data-act="continue">Continue campaign — Turn ${save.turn}, ${E.PHASES.find((p) => p.key === save.phase)?.label || ""}</button>` : ""}
        <button class="btn ghost" data-act="import">Load save file…</button>
        <a class="btn ghost" href="../index.html">Open free-form tabletop</a>
      </div>
    </div></div>`;
  }

  App.defaultSetup = () => ({ mode: "ai4", settings: Object.assign({}, TC.DEFAULT_SETTINGS), seed: "" });

  function renderSetup() {
    const s = App.ui.setup;
    const seg = (key, opts, val, path = "settings") =>
      `<div class="seg">${opts.map(([v, l]) => `<button class="btn sm ${val === v ? "on" : ""}" data-act="setup-set" data-path="${path}" data-key="${key}" data-val='${JSON.stringify(v)}'>${l}</button>`).join("")}</div>`;
    const tog = (key, label, hint) =>
      `<label class="toggle"><input type="checkbox" data-act="setup-toggle" data-key="${key}" ${s.settings[key] ? "checked" : ""}><div><b>${label}</b><div class="hint">${hint}</div></div></label>`;
    return `<div class="screen title"><div class="title-inner" style="max-width:900px;text-align:left">
      <h1 style="font-size:40px;margin-bottom:14px">New Campaign</h1>
      <div class="setup">
        <div>
          <div class="field"><label>Commanders</label>
            ${seg("mode", [["ai4", "You: Fourth Army vs AI"], ["ai10", "You: Tenth Army vs AI"], ["hotseat", "Two players (hot-seat)"], ["aiai", "Watch AI vs AI"]], s.mode, "root")}
            <div class="hint">Hot-seat keeps each staff's plan hidden behind a hand-off screen during planning.</div></div>
          <div class="field"><label>Campaign length (turns = years)</label>${seg("turns", [[4, "4"], [6, "6"], [8, "8"], [10, "10"]], s.settings.turns)}
            <div class="hint">The tabletop game runs for a set time (typically 4 hours). The turn track goes to 10.</div></div>
          <div class="field"><label>Planning timer</label>${seg("planTimerMinutes", [[0, "Off"], [10, "10 min"], [20, "20 min"], [30, "30 min (rules)"]], s.settings.planTimerMinutes)}</div>
          <div class="field"><label>AI pace</label>${seg("aiSpeed", [[2, "Deliberate"], [1, "Normal"], [0.4, "Fast"]], s.settings.aiSpeed)}</div>
          <div class="field"><label>Seed (optional)</label><input type="text" data-act="setup-seed" value="${esc(s.seed)}" placeholder="random"><div class="hint">Same seed = same dice and draws, for exercises and after-action review.</div></div>
        </div>
        <div>
          <div class="field"><label>Rules interpretations</label>
            ${tog("capsMustBeInTaskZone", "Capabilities must be in the task's zone", "Tasks are executed near a zone; their capability cards come from that zone's mat. Turn off to let tasks draw on any zone, as ASOS does.")}
            ${tog("commandsCountTowardRff", "Requested MSCs count toward the 10-force RFF cap", "The rulebook caps 'additional capabilities' at 10 and is silent on command cards.")}
          </div>
        </div>
      </div>
      <div class="btn-row" style="margin-top:8px"><button class="btn ghost" data-act="title">← Back</button><span style="flex:1"></span><button class="btn primary lg" data-act="start">Begin Campaign</button></div>
    </div></div>`;
  }

  App.startGame = function (opts) {
    App.state = E.newGame(opts);
    App.ui = Object.assign(App.ui, { screen: "game", modal: null, overlay: null, toasts: [], busy: false, lastPlanner: null, curtain: null, crisisAnim: null, flashes: {}, snap: null });
    App.save();
    App.render();
    App.flow();
  };

  // ---------------------------------------------------------------- game screen
  function renderGame() {
    const s = App.state;
    return `<div class="screen game">${renderHud(s)}<div class="main"><div class="board">${TC.ZONES.map((z) => renderZone(s, z)).join("")}</div>
      <aside class="side">${renderAdvisor(s)}${renderLog(s)}</aside></div>${renderDock(s)}</div>`;
  }

  function renderHud(s) {
    const me = App.me();
    const idx = E.phaseIndex(s);
    const phases = E.PHASES.map((p, i) => `<span class="ph ${i < idx || s.phase === "gameOver" ? "done" : ""} ${i === idx ? "now" : ""}">${p.label}</span>`).join('<span class="sep">›</span>');
    const track = Array.from({ length: s.settings.turns }, (_, i) => {
      const n = i + 1;
      return `<span class="${n % 2 === 0 ? "even" : ""} ${n < s.turn ? "past" : ""} ${n === s.turn ? "now" : ""}" title="Turn ${n}${n % 2 === 0 ? " — Assurance & Interoperability degrade" : ""}">${n}</span>`;
    }).join("");
    const side = (team) => {
      const t = s.teams[team];
      const you = App.humans().length === 1 && App.isHuman(team) ? '<span class="you">YOU</span>' : App.state.controllers[team] === "ai" ? '<span class="you" style="color:var(--muted)">AI</span>' : "";
      return `<div class="side ${K.teamCls(team)}"><span class="name"><span class="marker ${TC.TEAM_INFO[team].marker}"></span> ${TC.TEAM_INFO[team].name} ${you}</span>
        <span class="pts${fx(team + ".score").cls}"${fx(team + ".score").style}>${t.score}${fx(team + ".score").html}</span><span class="inf${fx(team + ".influence").cls}"${fx(team + ".influence").style} title="Theater-wide Influence (higher earns +1 point each turn)">◆ ${t.influence} infl.${fx(team + ".influence").html}</span></div>`;
    };
    return `<header class="hud">
      <img class="logo" src="img/logo.webp" alt="TheaterComplex">
      <div class="turn">TURN <b>${Math.min(s.turn, s.settings.turns)}</b> / ${s.settings.turns}</div>
      <div class="turntrack">${track}</div>
      <nav class="phases">${phases}</nav>
      <span class="spacer"></span>
      ${s.taskLimit ? `<span class="chip" title="Adjudicator's d6 roll (minimum 3)">Task limit ${s.taskLimit}</span>` : ""}
      <div class="scorebox">${side("fourth")}${side("tenth")}</div>
      <button class="btn sm ghost" data-act="codex" title="Rules Codex">📖 Rules</button>
      <button class="btn sm ghost" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  function legendTip(key, zone) {
    const table = TC.GENERATED.dieLegend[key][zone];
    const groups = [];
    Object.keys(table)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((v) => {
        const last = groups[groups.length - 1];
        if (last && last.val === table[v]) last.hi = v;
        else groups.push({ lo: v, hi: v, val: table[v] });
      });
    const fmt = (g) => {
      const range = g.lo === g.hi ? g.lo : `${g.lo}–${g.hi}`;
      if (key === "deterrence" || key === "partnerCap") return `${range}: d${g.val}`;
      if (key === "infrastructure") return `${range}: ${g.val}×d6`;
      if (key === "interop") return `${range}: ${g.val}×d4`;
      return `${range}: ${g.val > 0 ? "+" : ""}${g.val}`;
    };
    return `Zone ${zone} card — ${groups.map(fmt).join(" · ")}`;
  }
  App.legendTip = legendTip;

  const TRACKER_TIPS = {
    assurance: "Allies' confidence. At 1: capability requirements double. At 6–7: no agreements or security cooperation (tasks 1, 8, 9, 10, 12–15) and +1/+2 Instability. Degrades by 1 on even turns.",
    intel: "Higher Intelligence in the zone: before rolling, promote one friendly die or demote one enemy die by one size.",
    comms: "Higher Communications: re-roll your lowest die and keep the higher result.",
    protection: "Higher Protection: the opponent re-rolls its highest die and keeps the lower result.",
  };

  function renderZone(s, zone) {
    const me = App.me();
    const t4 = s.teams.fourth.zones[zone];
    const t10 = s.teams.tenth.zones[zone];
    const inst = R.instabilityBreakdown(s, zone);
    const odds = R.crisisOdds(inst.total);
    const p4 = R.readiness(s, "fourth", zone);
    const p10 = R.readiness(s, "tenth", zone);
    const sub = { A: "Fourth Army's near zone · Tenth Army objective", B: "Central zone · balanced forces", C: "Tenth Army's near zone · Fourth Army objective" }[zone];
    const row = (key, label, kind) => {
      const a = t4[key];
      const b = t10[key];
      let mid = esc(label);
      let va = a;
      let vb = b;
      let lead4 = false;
      let lead10 = false;
      let tip = TRACKER_TIPS[key] || "";
      if (kind === "cmp") {
        lead4 = a > b;
        lead10 = b > a;
      }
      if (kind === "die") {
        va = `${a}`;
        vb = `${b}`;
        mid = `${K.die(R.legend(key, zone, a), { size: 16, cls: "dieref" })} ${esc(label)} ${K.die(R.legend(key, zone, b), { size: 16, cls: "dieref" })}`;
        tip = legendTip(key, zone);
      }
      if (kind === "count") {
        const sides = key === "infrastructure" ? 6 : 4;
        mid = `<b class="c4">${R.legend(key, zone, a)}×</b>${K.die(sides, { size: 15, cls: "dieref" })} ${esc(label)} <b class="c10">${R.legend(key, zone, b)}×</b>${K.die(sides, { size: 15, cls: "dieref" })}`;
        tip = legendTip(key, zone);
      }
      if (kind === "drm") {
        const fa = R.legend(key, zone, a);
        const fb = R.legend(key, zone, b);
        mid = `<b class="c4">${fa > 0 ? "+" : ""}${fa}</b> ${esc(label)} <b class="c10">${fb > 0 ? "+" : ""}${fb}</b>`;
        tip = legendTip(key, zone);
      }
      const warn = key === "assurance" ? (i) => i === 1 || i >= 6 : null;
      const f4 = fx(`fourth.${zone}.${key}`);
      const f10 = fx(`tenth.${zone}.${key}`);
      return `<tr class="${f4.cls || f10.cls ? "rowflash" : ""}"${f4.style || f10.style}><td>${K.pips(a, "fourth", false, warn)}</td><td class="val ${lead4 ? "lead" : ""}${f4.cls}"${f4.style}>${va}${f4.html}</td>
        <td class="lab"><span title="${esc(tip)}">${mid}</span></td>
        <td class="val ${lead10 ? "lead" : ""}${f10.cls}"${f10.style}>${vb}${f10.html}</td><td>${K.pips(b, "tenth", true, warn)}</td></tr>`;
    };
    const dieBox = (team, pool) => {
      const d = K.pool(pool, 22);
      const ev = R.expectedDice(pool);
      return `<div class="${team === "fourth" ? "side4" : "side10"}">
        <div class="cap">Theater Army ${pool.drm ? `<span class="chip ${pool.drm > 0 ? "goodc" : "badc"}" style="padding:0 5px">${pool.drm > 0 ? "+" : ""}${pool.drm} each</span>` : ""}</div><div class="row">${d.theater}</div>
        <div class="cap">Partners</div><div class="row">${d.partner}</div>
        <div class="ev">Expected ≈ ${ev.toFixed(1)}</div></div>`;
    };
    const forces = (team) => {
      const ids = R.capsInZone(s, team, zone);
      const pts = ids.reduce((x, id) => x + R.cap(id).points, 0);
      return `<span class="chip ${K.teamCls(team)}" title="Cards / capability points in Zone ${zone}">${ids.length} cards · ${pts} pts</span>`;
    };
    const target = App.ui.zoneTarget && App.ui.zoneTarget.includes(zone);
    const tasks = zoneTasks(s, zone, me);
    const tag4 = zone === "C" ? '<span class="chip t4" title="Fourth Army scores +1 bonus for winning here">★ 4th objective</span>' : "";
    const tag10 = zone === "A" ? '<span class="chip t10" title="Tenth Army scores +1 bonus for winning here">★ 10th objective</span>' : "";
    return `<section class="zone ${target ? "target" : ""} ${zoneFlashing(zone) ? "zflash" : ""}" data-zone="${zone}" ${target ? `data-act="zone-target" data-z="${zone}"` : ""} id="zone-${zone}">
      <div class="zone-head"><h2>ZONE ${zone}</h2><div class="sub">${sub}</div><div class="tags">${tag4}${tag10}</div></div>
      <div class="zone-body">
        <div class="faceoff">
          <div class="det">${K.die(p4.theater[0].sides, { size: 30, title: "Fourth Army Deterrence die" })}<div><div class="num c4${fx(`fourth.det.${zone}`).cls}"${fx(`fourth.det.${zone}`).style}>${inst.d4}${fx(`fourth.det.${zone}`).html}</div><div class="lbl">Deterrence</div></div></div>
          <div class="instab" title="Instability = |deterrence gap| ${inst.base} + assurance ${inst.assurance}${inst.reduced ? " − influence " + inst.reduced : ""}. Higher Instability makes violent crises more likely." id="instab-${zone}">
            <div class="lbl">Instability</div><div class="v ${inst.total >= 4 ? "bad" : inst.total >= 2 ? "" : "good"}${fx(`inst.${zone}`, true).cls}"${fx(`inst.${zone}`, true).style}>${inst.total}${fx(`inst.${zone}`, true).html}</div></div>
          <div class="det right"><div style="text-align:right"><div class="num c10${fx(`tenth.det.${zone}`).cls}"${fx(`tenth.det.${zone}`).style}>${inst.d10}${fx(`tenth.det.${zone}`).html}</div><div class="lbl">Deterrence</div></div>${K.die(p10.theater[0].sides, { size: 30, title: "Tenth Army Deterrence die" })}</div>
        </div>
        <div title="Chance of each crisis type at this Instability ">
          <div class="oddsbar">${["SQ", "SOF", "LIM", "LSCO"].map((k) => `<i class="${k}" style="width:${odds[k]}%"></i>`).join("")}</div>
          <div class="oddslegend"><span>Status quo ${odds.SQ}%</span><span>Show of force ${odds.SOF}%</span><span>Ltd op ${odds.LIM}%</span><span>LSCO ${odds.LSCO}%</span></div>
        </div>
        <table class="trk">
          ${row("assurance", "Assurance", "cmp0")}
          <tr class="sect"><td colspan="5">Defense readiness</td></tr>
          ${row("partnerCap", "Partner Cap.", "die")}
          ${row("infrastructure", "Infrastructure", "count")}
          ${row("interop", "Interop.", "count")}
          ${row("stockage", "Stockage", "drm")}
          <tr class="sect"><td colspan="5">Advantages</td></tr>
          ${row("intel", "Intelligence", "cmp")}
          ${row("comms", "Communications", "cmp")}
          ${row("protection", "Protection", "cmp")}
          <tr><td></td><td class="val c4${fx(`fourth.access.${zone}`).cls}"${fx(`fourth.access.${zone}`).style}>${s.teams.fourth.access[zone]}${fx(`fourth.access.${zone}`).html}</td><td class="lab"><span title="Access in this zone — spent by agreements, stockage and police tasks">Access</span></td><td class="val c10${fx(`tenth.access.${zone}`).cls}"${fx(`tenth.access.${zone}`).style}>${s.teams.tenth.access[zone]}${fx(`tenth.access.${zone}`).html}</td><td></td></tr>
        </table>
        <div class="readiness">${dieBox("fourth", p4)}${dieBox("tenth", p10)}</div>
        <div class="forces">${forces("fourth")}${forces("tenth")}<span style="flex:1"></span><button class="btn sm" data-act="mat" data-z="${zone}">Capability mat</button></div>
        ${tasks ? `<div class="zone-tasks">${tasks}</div>` : ""}
      </div></section>`;
  }

  function zoneTasks(s, zone, me) {
    const out = [];
    TC.TEAMS.forEach((team) => {
      const plan = s.plans[team];
      plan.tasks
        .filter((t) => t.zone === zone)
        .forEach((t) => {
          const task = TC.taskByNum(t.num);
          const hidden = s.phase === "planning" && team !== me && App.humans().length > 0;
          if (hidden) {
            out.push(`<span class="taskchip hiddenplan ${K.teamCls(team)}">▣ ${TC.TEAM_INFO[team].short} task</span>`);
            return;
          }
          const cls = [K.teamCls(team), t.status, t.disrupt ? "disrupt" : ""].join(" ");
          const tip = `${TC.TEAM_INFO[team].name}: ${task.name}${t.status === "failed" ? " — FAILED" : ""}${t.disrupt ? " — DISRUPTION" : ""}`;
          out.push(`<span class="taskchip ${cls}" data-art="${K.taskArt(team, t.num, t.status === "done" ? "back" : "front")}" title="${esc(tip)}"><span class="n">${t.num}</span>${esc(task.name)}${t.disrupt ? " ⚡" : ""}</span>`);
        });
    });
    return out.join("");
  }

  // ---------------------------------------------------------------- advisor & log
  function renderAdvisor(s) {
    const me = App.me();
    const name = TC.TEAM_INFO[me].name;
    let title = "";
    let body = "";
    switch (s.phase) {
      case "taskLimit":
        title = `Turn ${s.turn}: a new year`;
        body = `<p>The adjudicator rolls a d6 to set how many task cards each army may plan this turn (minimum 3).</p><p>A limit of 3 also means <b>two</b> ASOS requests instead of one.</p>`;
        break;
      case "asos":
        title = "Army Support to Other Services";
        body = `<p>The other Services need Army capabilities. Commit cards of the listed types whose capability points reach the requirement. They come from <b>any</b> zone and are turned sideways for this turn, but still count for deterrence.</p><p>If you truly cannot meet a request, declare it unmet and cover it with GFM forces in your RFF this turn.</p>`;
        break;
      case "planning":
        title = `${name} — campaign planning`;
        body = `<p>Pick up to <b>${s.taskLimit}</b> task cards. Each needs staff to plan it, MSCs to command it and capability points in the zone to execute it.</p>
          <ul><li>An MSC handling a <b>3rd+</b> task is over-tasked: d6 roll to succeed, and −1 point.</li><li>Use <b>Force Management</b> to request forces (RFF), move units between zones and return last turn's RFF.</li><li>Watch the deterrence gap: it drives Instability.</li></ul>`;
        break;
      case "implementation":
        title = s.impl && !s.impl.done ? `${TC.TEAM_INFO[s.impl.active].name} holds initiative` : "Implementation complete";
        body = `<p>Armies alternate executing one task at a time. Effects hit the trackers immediately.</p><ul><li><b>Disruption</b> (once per turn): play a task against the enemy and subtract its effects from their trackers.</li><li>While holding initiative you may spend <b>3 Influence</b> to cut a zone's Instability by 1.</li></ul>`;
        break;
      case "crisis":
        title = "Crisis Assessment";
        body = `<p>Each zone faces a crisis. Instability sets how likely it is to turn violent. Both armies roll their Defense Readiness dice, and the higher total wins.</p><p>In a <b>Limited Operation</b> or <b>LSCO</b>, each army adds its Deterrence to the roll, but the army with the higher deterrence <b>loses 3 points</b> for provoking the escalation.</p>`;
        break;
      case "tailoring":
        title = "Force Tailoring";
        body = `<p>SecWar and RSOI forces redeploy, returned RFF goes home, zone transfers happen, and the new RFF arrives. SecWar then directs three fresh GFM capabilities into the theater.</p>`;
        break;
      case "gameOver":
        title = "After-action review";
        body = `<p>The campaign is over. Review the score history and the crisis outcomes.</p>`;
        break;
    }
    return `<div class="advisor"><div class="who"><div class="avatar">S3</div><div><h4>${esc(title)}</h4><div class="role">Operations officer · advising ${App.humans().length ? esc(name) : "observers"}</div></div></div><div class="msg">${body}</div></div>`;
  }

  function renderLog(s) {
    const items = s.log.slice(-160).map((l) => `<div class="l ${l.tone} ${l.team ? "t-" + l.team : ""}">${esc(l.text)}</div>`);
    return `<div class="logbox"><div class="h"><h4 style="font-size:13px;letter-spacing:.14em;color:var(--muted)">ADJUDICATOR LOG</h4></div>${items.join("")}</div>`;
  }

  // ---------------------------------------------------------------- dock
  function renderDock(s) {
    const me = App.me();
    switch (s.phase) {
      case "asos":
        return dockAsos(s, me);
      case "planning":
        return dockPlanning(s, me);
      case "implementation":
        return dockImplementation(s, me);
      default:
        return `<footer class="dock"><div class="col grow"><h3>${E.PHASES.find((p) => p.key === s.phase)?.label || "Campaign complete"}</h3><div class="muted">${s.phase === "gameOver" ? "The campaign has ended." : "Follow the adjudicator on the main stage."}</div></div>${commandBoards(s, me)}</footer>`;
    }
  }

  function dockAsos(s, me) {
    const items = s.asos.current
      .map((aid) => {
        const a = TC.ASOS_BY_ID[aid];
        const al = s.asos.alloc[me][aid];
        const status = !al ? '<span class="chip warnc">Awaiting support</span>' : al.unmet ? '<span class="chip badc">Unmet — cover via RFF</span>' : `<span class="chip goodc">Supported (${al.caps.length} card${al.caps.length > 1 ? "s" : ""})</span>`;
        return `<div style="display:flex;gap:10px;align-items:center"><img src="${a.art}" data-art="${a.art}" style="width:72px;border-radius:6px"><div><b style="font-family:var(--head);font-size:17px">${esc(a.name)}</b><div class="muted">${a.points} pts of ${a.types.map((t) => TC.CAPABILITY_TYPES[t] || t).join(" or ")}</div>${status}
          <div style="margin-top:6px"><button class="btn sm ${!al ? "primary" : ""}" data-act="asos-open" data-id="${aid}" ${!App.isHuman(me) ? "disabled" : ""}>${al ? "Change" : "Allocate forces"}</button></div></div></div>`;
      })
      .join("");
    const opp = TC.other(me);
    return `<footer class="dock"><div class="col grow"><h3>ASOS requests ${K.teamChip(me)}</h3><div style="display:flex;gap:24px;flex-wrap:wrap">${items}</div></div>
      <div class="col" style="justify-content:center;min-width:220px"><div class="muted">${TC.TEAM_INFO[opp].name}: ${E.asosComplete(s, opp) ? "✔ done" : "allocating…"}</div>
      <button class="btn primary" data-act="asos-done" ${E.asosComplete(s, me) ? "" : "disabled"}>Proceed to planning →</button></div></footer>`;
  }

  const EFFECT_SHORT = {
    influence: "Infl", access: "Access", assurance: "Assur", partnerCap: "P.Cap", infrastructure: "Infra",
    interop: "Interop", intel: "Intel", stockage: "Stock", comms: "Comms", protection: "Prot",
  };
  // Every tracker a task can touch, including its OR paths and optional additions.
  function taskEffectKeys(task) {
    const keys = new Set(Object.keys(task.effects));
    (task.branches || []).concat(task.options || []).forEach((p) => {
      Object.keys(p.effects || {}).forEach((k) => keys.add(k));
      Object.keys(p.oppEffects || {}).forEach((k) => keys.add(k));
    });
    return [...keys];
  }
  function effectSummary(task) {
    const fmt = (eff, opp) =>
      Object.entries(eff || {})
        .filter(([, v]) => v)
        .map(([k, v]) => `<span class="te ${opp ? "opp" : ""}">${opp ? "Foe " : ""}${EFFECT_SHORT[k]}${v > 0 ? "+" : "−"}${Math.abs(v)}</span>`)
        .join("");
    if (task.special === "rsoi") return `<span class="te">+3 GFM forces</span>`;
    let html = fmt(task.effects);
    if (task.branches) html += task.branches.map((b) => fmt(b.effects) + fmt(b.oppEffects, true)).join('<span class="tor">or</span>');
    if (task.options) html += task.options.map((o) => `<span class="te opt" title="${esc(o.label)}">opt ${EFFECT_SHORT[Object.keys(o.effects)[0]]}+</span>`).join("");
    return html;
  }

  function dockPlanning(s, me) {
    const plan = s.plans[me];
    if (!App.isHuman(me) || plan.ready) {
      return `<footer class="dock"><div class="col grow"><h3>Planning</h3><div class="muted">${plan.ready ? "Your plan is submitted. Waiting for the other staff…" : "The AI staff is planning…"}</div></div></footer>`;
    }
    const filter = App.ui.handFilter || "all";
    const hand = TC.TASKS.map((task) => {
      const planned = plan.tasks.find((t) => t.num === task.num);
      const zoneOk = TC.ZONES.map((z) => !planned && (task.branches || [{ key: null }]).some((b) => E.evaluateTask(s, me, { num: task.num, zone: z, branch: b.key }).ok));
      const anyOk = zoneOk.some(Boolean);
      const keys = taskEffectKeys(task);
      if (filter === "ready" && !anyOk) return "";
      if (filter !== "all" && filter !== "ready" && !keys.includes(filter)) return "";
      const mode = task.mode === "P" ? "Plan-only" : task.mode === "E" ? "Execute-only" : "";
      const dots = planned
        ? `<span class="chip goodc" style="padding:0 6px">✔ Zone ${planned.zone}</span>`
        : TC.ZONES.map((z, i) => `<span class="zdot ${zoneOk[i] ? "ok" : ""}" title="Zone ${z}: ${zoneOk[i] ? "can plan here" : "not possible now"}">${z}</span>`).join("");
      const cost = Object.entries(task.cost)
        .map(([k, v]) => `<span class="tcost">${k === "influence" ? "◆" : "Acc"}−${v}</span>`)
        .join("");
      return `<div class="taskcard tc2 ${planned ? "planned" : ""} ${!anyOk && !planned ? "blocked" : ""}" data-act="task-open" data-num="${task.num}" data-art="${task.art[me].front}" title="${esc(task.name)}${mode ? " (" + mode + ")" : ""} — click to plan">
        <img src="${task.art[me].front}" alt="" loading="lazy">
        <div class="tinfo"><div class="tname"><b>${task.num}</b> ${esc(task.name)}${task.mode !== "N" ? ` <span class="tmode">${task.mode}</span>` : ""}</div>
          <div class="teff">${effectSummary(task)}</div>
          <div class="tfoot">${dots}${cost}</div></div></div>`;
    }).join("");
    const filters = [["all", "All"], ["ready", "Ready"], ["intel", "Intel"], ["comms", "Comms"], ["protection", "Protection"], ["partnerCap", "Partner Cap"], ["infrastructure", "Infra"], ["interop", "Interop"], ["stockage", "Stockage"], ["assurance", "Assurance"], ["influence", "Influence"], ["access", "Access"]]
      .map(([k, l]) => `<button class="btn sm ${filter === k ? "on" : ""}" data-act="hand-filter" data-k="${k}">${l}</button>`)
      .join("");
    const list = plan.tasks
      .map((t) => {
        const task = TC.taskByNum(t.num);
        return `<div class="taskchip ${K.teamCls(me)}" data-act="task-edit" data-uid="${t.uid}" data-art="${task.art[me].front}" title="Click to edit"><span class="n">${t.num}</span>${esc(task.name)} <span class="chip">Zone ${t.zone}</span><button class="btn sm ghost" data-act="task-remove" data-uid="${t.uid}" title="Remove">✕</button></div>`;
      })
      .join("");
    const issues = E.planIssues(s, me);
    const rff = E.rffProjected(s, me);
    const timer = s.settings.planTimerMinutes ? `<span class="chip" id="plan-timer">⏱ --:--</span>` : "";
    return `<footer class="dock">
      <div class="col grow" style="min-width:0"><h3>Task cards <span class="chip">${plan.tasks.length} / ${s.taskLimit} planned</span>${timer}<span class="muted" style="text-transform:none;letter-spacing:0;font-size:12px">Click a card to plan it · hover to enlarge</span></h3>
        <div class="seg handfilters">${filters}</div>
        <div class="hand" id="hand">${hand || `<div class="muted" style="padding:20px">No task cards match this filter.</div>`}</div></div>
      <div class="col" style="width:290px"><h3>Campaign ${K.teamChip(me)}</h3><div class="col scroll" style="gap:6px;max-height:150px">${list || '<div class="muted">No tasks yet.</div>'}</div>
        <div class="btn-row" style="margin-top:auto"><button class="btn" data-act="forces" id="btn-forces">Force management <span class="chip">RFF ${rff}/${E.RFF_LIMIT}</span></button>
        <button class="btn primary ${plan.tasks.length ? "pulse" : ""}" data-act="submit" id="btn-submit" title="${esc(issues.join(" "))}">Submit plan</button></div>
        ${issues.length ? `<div class="bad" style="font-size:12px">${esc(issues[0])}</div>` : ""}</div>
      ${commandBoards(s, me)}
    </footer>`;
  }

  function commandBoards(s, me) {
    if (!me) return "";
    const used = E.staffUsed(s, me);
    const slots = TC.GENERATED.staffSlots[me];
    const staff = TC.STAFF_CELLS.map((c) => {
      let pips = "";
      for (let i = 0; i < slots[c.code]; i++) pips += `<i class="${i < used[c.code] ? "on" : ""}"></i>`;
      return `<div class="r"><b>${c.code}</b><span class="slots staff">${pips}</span></div>`;
    }).join("");
    const load = s.phase === "implementation" && s.impl ? s.impl.commandMarkers : E.commandLoad(s, me);
    const cmds = E.theaterCommands(s, me)
      .map((id) => {
        const n = load[id] || 0;
        let pips = "";
        for (let i = 0; i < TC.MSC_MAX_TASKS; i++) pips += `<i class="${i < n ? "on" : ""} ${i >= TC.MSC_FREE_SLOTS ? "red" : ""}"></i>`;
        return `<div class="r" data-art="${R.cmd(id).art}"><b>${esc(R.cmd(id).short)}</b><span class="slots">${pips}</span></div>`;
      })
      .join("");
    return `<div class="col" id="boards"><h3>Staff &amp; MSCs</h3><div class="boards"><div class="slotboard">${staff}</div><div class="slotboard">${cmds}</div></div></div>`;
  }

  function dockImplementation(s, me) {
    const impl = s.impl;
    if (!impl) return `<footer class="dock"></footer>`;
    if (impl.done) {
      return `<footer class="dock"><div class="col grow"><h3>All tasks resolved</h3><div class="muted">Both campaigns are complete for this year.</div></div>
        <div class="col" style="justify-content:center"><button class="btn primary lg pulse" data-act="to-crisis" id="btn-crisis">Proceed to Crisis Assessment →</button></div>${commandBoards(s, me)}</footer>`;
    }
    const active = impl.active;
    const mine = App.isHuman(active);
    const remaining = E.remainingTasks(s, active);
    const cards = mine
      ? remaining
          .map((t) => {
            const task = TC.taskByNum(t.num);
            const canD = E.canDisrupt(s, active, t.uid);
            const over = t.commands.filter((id) => (impl.commandMarkers[id] || 0) + 1 > TC.MSC_FREE_SLOTS);
            return `<div class="col" style="width:118px;gap:4px"><div class="taskcard" style="width:118px" data-art="${task.art[active].front}"><img src="${task.art[active].front}" alt="" style="aspect-ratio:3/3.4;object-position:top"></div>
            <div class="chip" style="justify-content:center">Zone ${t.zone}${over.length ? ` · <span class="bad">roll d6!</span>` : ""}</div>
            <button class="btn sm primary" data-act="exec" data-uid="${t.uid}">Execute</button>
            ${canD ? `<button class="btn sm danger" data-act="exec-disrupt" data-uid="${t.uid}" title="Subtract this task's effects from the enemy in Zone ${t.zone} instead">⚡ Play as Disruption</button>` : ""}
            <button class="btn sm ghost" data-act="standdown" data-uid="${t.uid}">Stand down</button></div>`;
          })
          .join("")
      : `<div class="muted" style="padding:20px">${TC.TEAM_INFO[active].name} is executing…</div>`;
    const spend = mine
      ? TC.ZONES.map((z) => `<button class="btn sm" data-act="spend" data-z="${z}" ${s.teams[active].influence >= 3 && R.instability(s, z) > 0 ? "" : "disabled"}>Zone ${z}: −1 Instability (3 ◆)</button>`).join("")
      : "";
    return `<footer class="dock">
      <div class="col grow" style="min-width:0"><h3>Initiative ${K.teamChip(active)} <span class="muted" style="text-transform:none;letter-spacing:0;font-size:12px">${remaining.length} task${remaining.length === 1 ? "" : "s"} left · Disruption ${s.teams[active].disruptionUsed ? "used" : "available"}</span></h3>
        <div class="hand" style="align-items:flex-start">${cards}</div></div>
      ${mine ? `<div class="col" style="width:240px"><h3>Influence</h3><div class="muted" style="font-size:12px">${s.teams[active].influence} Influence available</div>${spend}</div>` : ""}
      ${commandBoards(s, active)}
    </footer>`;
  }

  // ---------------------------------------------------------------- overlays
  function renderOverlay() {
    const el = document.getElementById("overlay-root");
    const s = App.state;
    if (!s || App.ui.screen !== "game") {
      el.innerHTML = "";
      return;
    }
    let html = "";
    const o = App.ui.overlay;
    if (App.ui.curtain) html = curtainHtml(App.ui.curtain);
    else if (o && TC.overlays[o.type]) html = TC.overlays[o.type](o);
    else if (s.phase === "taskLimit" && !(TC.tutorial && TC.tutorial.holdOverlay())) html = TC.overlays.turnStart({});
    else if (s.phase === "crisis" && TC.crisisUI) html = TC.crisisUI.render();
    else if (s.phase === "tailoring" && s.tailoring) html = TC.overlays.tailoring({});
    else if (s.phase === "gameOver") html = TC.overlays.gameOver({});
    el.innerHTML = html ? `<div class="veil">${html}</div>` : "";
  }

  function curtainHtml(team) {
    return `<div class="stage"><div class="kicker">Hand-off</div><h1>${TC.TEAM_INFO[team].name}</h1>
      <p>Pass the controls to the <b>${TC.TEAM_INFO[team].name}</b> commander. The ${TC.TEAM_INFO[TC.other(team)].name} staff should look away: planning is secret until execution.</p>
      <button class="btn primary lg" data-act="curtain-ok">I am the ${TC.TEAM_INFO[team].name} commander</button></div>`;
  }

  TC.overlays = {
    turnStart() {
      const s = App.state;
      const canRoll = App.humans().length > 0;
      const even = s.turn % 2 === 0;
      return `<div class="stage"><div class="kicker">Year ${s.turn} of ${s.settings.turns}</div><h1>TURN ${s.turn}</h1>
        <p>The adjudicator rolls a d6 for the <b>task card limit</b> (minimum 3), then draws Army Support to Other Services requests.</p>
        ${even ? '<p class="bad">Even turn: Assurance and Partner Interoperability will degrade by 1 at cleanup.</p>' : ""}
        <div class="bigdie">${K.die(6, { size: 84, value: "?", cls: App.ui.rolling ? "rolling" : "" })}</div>
        ${canRoll ? `<button class="btn primary lg" data-act="roll-limit" id="btn-roll" ${App.ui.rolling ? "disabled" : ""}>Roll for task limit</button>` : ""}</div>`;
    },
    limitResult(o) {
      const asos = o.asos.map((id) => `<img src="${TC.ASOS_BY_ID[id].art}" data-art="${TC.ASOS_BY_ID[id].art}" style="width:130px;border-radius:9px;box-shadow:var(--shadow)">`).join("");
      return `<div class="stage"><div class="kicker">Turn ${App.state.turn}</div><h1>${o.limit} TASKS</h1>
        <div class="bigdie">${K.die(6, { size: 84, value: o.roll, cls: "land" })}</div>
        <p>d6 = ${o.roll}${o.roll < 3 ? " → raised to the minimum of 3" : ""}. Each army may plan and execute <b>${o.limit}</b> task cards this turn.</p>
        <h3 style="margin:14px 0 8px">${o.asos.length} ASOS request${o.asos.length > 1 ? "s" : ""}</h3><div style="display:flex;gap:14px;justify-content:center">${asos}</div>
        <div style="margin-top:20px"><button class="btn primary lg" data-act="overlay-close" id="btn-continue">Continue</button></div></div>`;
    },
    initiative(o) {
      const s = App.state;
      const r = o.result;
      if (!r) o = Object.assign({}, o, { rolling: true });
      const plan = r && r.planOnly.length ? `<p>Plan-only tasks took effect first: ${r.planOnly.map((p) => `${K.teamChip(p.team, TC.taskByNum(s.plans[p.team].tasks.find((t) => t.uid === p.uid).num).name)}`).join(" ")}</p>` : "";
      return `<div class="stage"><div class="kicker">Campaign implementation</div><h1>INITIATIVE</h1>
        <div class="bigdie"><div>${K.die(10, { size: 80, value: o.rolling ? "?" : r.initiative.fourth, cls: o.rolling ? "rolling" : "land" })}<div class="who c4">Fourth Army</div></div>
        <div>${K.die(10, { size: 80, value: o.rolling ? "?" : r.initiative.tenth, cls: o.rolling ? "rolling" : "land" })}<div class="who c10">Tenth Army</div></div></div>
        ${o.rolling ? "<p>Both armies roll a d10…</p>" : `<p><b class="${K.teamCls(r.first) === "t4" ? "c4" : "c10"}">${TC.TEAM_INFO[r.first].name}</b> wins initiative and plays the first task card.</p>${plan}<button class="btn primary lg" data-act="overlay-close" id="btn-continue">Begin execution</button>`}</div>`;
    },
    tailoring() {
      const s = App.state;
      const t = s.tailoring;
      const names = (list) => list.map((x) => (s.commands[x.id || x] ? R.cmd(x.id || x).short : R.cap(x.id || x).name)).join(", ");
      const col = (team) => {
        const r = t[team];
        const line = (label, list, fmt) => (list.length ? `<div><b>${label}:</b> ${fmt ? list.map(fmt).join(", ") : names(list)}</div>` : "");
        return `<div class="tray ${K.teamCls(team)}" style="text-align:left"><h3>${K.teamChip(team)}</h3>
          ${line("Redeployed", r.redeployed)}
          ${line("Transferred", r.transferred, (x) => `${R.cap(x.id).name} ${x.from}→${x.to}`)}
          ${line("RFF arrivals", r.arrived, (x) => (s.commands[x.id] ? R.cmd(x.id).short : `${R.cap(x.id).name} → ${x.zone}`))}
          ${line("ASOS cover (arrive committed)", r.asosArrived, (x) => `${R.cap(x.id).name} → ${x.zone}`)}
          ${line("RSOI arrivals", r.rsoiArrived, (x) => `${R.cap(x.id).name} → ${x.zone}`)}
          <div><b>SecWar directs:</b> ${r.secwar.map((id, i) => `${R.cap(id).name} → ${TC.ZONES[i]}`).join(", ")}</div></div>`;
      };
      const even = s.turn % 2 === 0;
      return `<div class="modal" style="width:min(980px,94vw)"><div class="modal-head"><h2>Force Tailoring — Turn ${s.turn}</h2></div>
        <div class="modal-body"><div class="trays" style="margin-top:0">${col("fourth")}${col("tenth")}</div>
        <div class="banner info" style="margin-top:14px">Cleanup: sideways cards return upright, deterrence is recounted${even ? ", and <b>Assurance and Partner Interoperability drop by 1</b> in every zone (even turn)" : ""}.</div></div>
        <div class="modal-foot"><button class="btn primary lg" data-act="cleanup" id="btn-continue">${s.turn >= s.settings.turns ? "Final results" : `Begin turn ${s.turn + 1}`} →</button></div></div>`;
    },
    gameOver() {
      const s = App.state;
      const w = s.winner;
      const hist = s.history;
      const maxS = Math.max(4, ...hist.map((h) => Math.max(h.score.fourth, h.score.tenth)));
      const minS = Math.min(0, ...hist.map((h) => Math.min(h.score.fourth, h.score.tenth)));
      const W = 520;
      const H = 200;
      const x = (i) => 30 + (i * (W - 50)) / Math.max(1, hist.length);
      const y = (v) => H - 20 - ((v - minS) * (H - 40)) / (maxS - minS || 1);
      const line = (team, color) => `<polyline fill="none" stroke="${color}" stroke-width="3" points="${[`${x(0)},${y(0)}`].concat(hist.map((h, i) => `${x(i + 1)},${y(h.score[team])}`)).join(" ")}"/>` + hist.map((h, i) => `<circle cx="${x(i + 1)}" cy="${y(h.score[team])}" r="4" fill="${color}"/>`).join("");
      const rows = hist
        .map((h) => `<tr><td>${h.turn}</td>${h.crisis.map((c) => `<td><span class="chip ct-${c.type}" style="color:#fff;border:0">${c.type}</span> ${c.winner ? `<span class="${c.winner === "fourth" ? "c4" : "c10"}">${TC.TEAM_INFO[c.winner].short}</span>` : "tie"}</td>`).join("")}<td>${h.score.fourth}–${h.score.tenth}</td></tr>`)
        .join("");
      return `<div class="stage" style="max-width:1000px"><div class="kicker">After-action review</div><h1>${w ? TC.TEAM_INFO[w].name.toUpperCase() + " WINS" : "DRAW"}</h1>
        <p style="font-size:20px"><b class="c4">${s.teams.fourth.score}</b> — <b class="c10">${s.teams.tenth.score}</b></p>
        <div class="endgrid"><svg class="chart" viewBox="0 0 ${W} ${H}"><line x1="30" x2="${W - 10}" y1="${y(0)}" y2="${y(0)}" stroke="#3a4651"/>${line("fourth", "#5aa2ff")}${line("tenth", "#ff9f5a")}
          ${hist.map((h, i) => `<text x="${x(i + 1)}" y="${H - 4}" fill="#93a1ad" font-size="11" text-anchor="middle">T${h.turn}</text>`).join("")}</svg>
          <table class="hist"><tr><th>Turn</th><th>Zone A</th><th>Zone B</th><th>Zone C</th><th>Score</th></tr>${rows}</table></div>
        <div class="btn-row" style="justify-content:center;margin-top:20px"><button class="btn" data-act="title">Main menu</button><button class="btn primary lg" data-act="setup">New campaign</button></div></div>`;
    },
    menu() {
      return `<div class="modal narrow"><div class="modal-head"><h2>Menu</h2><button class="btn ghost x" data-act="overlay-close">✕</button></div>
        <div class="modal-body"><div class="col" style="display:flex;flex-direction:column;gap:8px">
          <button class="btn" data-act="codex">📖 Rules Codex</button>
          <button class="btn" data-act="export">💾 Download save file</button>
          <button class="btn" data-act="import">📂 Load save file</button>
          ${App.state.tutorial ? '<button class="btn" data-act="tutorial-exit">Leave tutorial</button>' : ""}
          <button class="btn danger" data-act="title">Quit to main menu (autosaved)</button></div>
          <p class="muted" style="font-size:12px;margin-top:12px">Seed ${App.state.seed} · Campaign autosaves in this browser after every action.</p></div></div>`;
    },
  };

  // ---------------------------------------------------------------- flow (AI + automation)
  App.flow = function () {
    if (App._flowPending) return;
    App._flowPending = true;
    setTimeout(() => {
      App._flowPending = false;
      step();
    }, 0);
  };

  async function step() {
    const s = App.state;
    if (!s || App.ui.screen !== "game" || App.ui.busy || App.ui.curtain) return;
    const humans = App.humans();
    const pace = (ms) => K.sleep(ms * App.speed());
    switch (s.phase) {
      case "taskLimit":
        if (!humans.length) await rollLimit();
        break;
      case "asos":
        if (App.ui.overlay) return;
        TC.TEAMS.forEach((t) => !App.isHuman(t) && !E.asosComplete(s, t) && AI.allocateAsos(s, t));
        if (TC.TEAMS.every((t) => E.asosComplete(s, t)) && (humans.length === 0 || App.ui.asosConfirmed)) {
          App.ui.asosConfirmed = false;
          E.beginPlanning(s);
          App.save();
          App.render();
          App.flow();
        } else App.render();
        break;
      case "planning": {
        TC.TEAMS.forEach((t) => !App.isHuman(t) && !s.plans[t].ready && AI.plan(s, t));
        if (E.bothReady(s)) {
          await startImplementation();
          return;
        }
        const me = App.me();
        if (humans.length === 2 && App.ui.lastPlanner !== me) {
          App.ui.curtain = me;
          App.ui.lastPlanner = me;
        }
        App.render();
        startPlanTimer();
        break;
      }
      case "implementation":
        if (App.ui.overlay) return;
        if (s.impl.done) {
          if (!humans.length) {
            await pace(600);
            E.beginCrisis(s);
            App.save();
            App.render();
            App.flow();
          }
          return;
        }
        if (!App.isHuman(s.impl.active)) {
          App.ui.busy = true;
          await pace(900);
          const res = AI.takeInitiative(s, s.impl.active);
          App.ui.busy = false;
          if (res) taskToast(res);
          App.save();
          App.render();
          App.flow();
        } else App.ui.lastMe = s.impl.active;
        break;
      case "crisis":
        TC.crisisUI && TC.crisisUI.auto();
        break;
      case "tailoring":
        if (!s.tailoring) {
          E.forceTailoring(s);
          App.save();
          App.render();
        }
        if (!humans.length) {
          await pace(1500);
          if (App.state === s && s.phase === "tailoring") App.cleanup();
        }
        break;
      default:
        break;
    }
  }

  async function rollLimit() {
    if (App.ui.rolling) return;
    App.ui.rolling = true;
    App.ui.busy = true;
    App.render();
    await K.sleep(900);
    App.ui.rolling = false;
    App.ui.busy = false;
    const res = E.rollTaskLimit(App.state);
    if (!res) return App.render();
    App.ui.overlay = { type: "limitResult", roll: res.roll, limit: res.limit, asos: res.asos };
    App.save();
    App.render();
    if (!App.humans().length) {
      await K.sleep(1400 * App.speed());
      App.ui.overlay = null;
      App.render();
      App.flow();
    }
  }

  async function startImplementation() {
    const s = App.state;
    // Lock the flow so a re-render during the roll can't start this twice.
    App.ui.busy = true;
    App.ui.overlay = { type: "initiative", rolling: true };
    App.render();
    await K.sleep(1000);
    const res = E.beginImplementation(s);
    App.ui.busy = false;
    if (!res) {
      App.ui.overlay = null;
      App.render();
      return;
    }
    App.ui.overlay = { type: "initiative", rolling: false, result: res };
    App.save();
    App.render();
    if (!App.humans().length) {
      await K.sleep(1400 * App.speed());
      App.ui.overlay = null;
      App.render();
      App.flow();
    }
  }

  function taskToast(res) {
    if (!res || res.ok === undefined) return;
    const task = TC.taskByNum(res.num);
    const team = res.team;
    const changes = res.changes.map((c) => `${TC.EFFECT_LABELS[c.key]} ${c.before}→${c.after}${c.team !== team ? " (enemy)" : ""}`).join(", ");
    const rolls = res.rolls.map((r) => `${R.cmd(r.command).short}: d6 ${r.roll} (need ${r.need}+)`).join("; ");
    App.toast(
      `<img src="${task.art[team][res.ok ? "back" : "front"]}" alt=""><div class="t"><b>${esc(task.name)}</b> · Zone ${res.zone}<br>${res.ok ? (res.disrupt ? '<span class="bad">⚡ Disruption: </span>' : '<span class="good">Success: </span>') + esc(changes || (task.special === "rsoi" ? "RSOI opens the door for 3 more GFM forces" : "no change")) : `<span class="bad">Failed — ${esc(res.reason)}</span>`}${rolls ? `<br><span class="muted">${esc(rolls)}</span>` : ""}</div>`,
      team
    );
  }
  App.taskToast = taskToast;

  App.cleanup = function () {
    const s = App.state;
    const even = s.turn % 2 === 0;
    E.cleanup(s);
    App.ui.lastPlanner = null;
    if (even && s.phase !== "gameOver") App.toast("<div class='t'><b>Even turn</b><br>Assurance and Partner Interoperability degraded by 1 in every zone.</div>", null);
    App.save();
    App.render();
    App.flow();
  };

  let timerHandle = null;
  function startPlanTimer() {
    const s = App.state;
    if (!s.settings.planTimerMinutes || s.phase !== "planning") return;
    if (!App.ui.planStart || App.ui.planTurn !== s.turn) {
      App.ui.planStart = Date.now();
      App.ui.planTurn = s.turn;
    }
    clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      const el = document.getElementById("plan-timer");
      if (!el || App.state.phase !== "planning") return clearInterval(timerHandle);
      const left = s.settings.planTimerMinutes * 60 - Math.floor((Date.now() - App.ui.planStart) / 1000);
      const m = Math.floor(Math.abs(left) / 60);
      const sec = String(Math.abs(left) % 60).padStart(2, "0");
      el.textContent = `⏱ ${left < 0 ? "-" : ""}${m}:${sec}`;
      el.className = `chip ${left < 60 ? "badc" : left < 300 ? "warnc" : ""}`;
    }, 500);
  }

  // ---------------------------------------------------------------- actions
  const actions = {
    title() {
      App.ui.screen = "title";
      App.ui.overlay = null;
      App.ui.modal = null;
      App.state && App.state.tutorial && TC.tutorial.stop();
      App.state = null;
      App.render();
    },
    setup() {
      App.ui.setup = App.defaultSetup();
      App.ui.screen = "setup";
      App.ui.overlay = null;
      App.ui.modal = null;
      if (App.state && App.state.tutorial) TC.tutorial.stop();
      App.state = null;
      App.render();
    },
    "setup-set"(el) {
      const val = JSON.parse(el.dataset.val);
      if (el.dataset.path === "root") App.ui.setup[el.dataset.key] = val;
      else App.ui.setup.settings[el.dataset.key] = val;
      App.render();
    },
    "setup-toggle"(el) {
      App.ui.setup.settings[el.dataset.key] = el.checked;
    },
    start() {
      const st = App.ui.setup;
      const seedInput = document.querySelector('[data-act="setup-seed"]');
      const seedTxt = seedInput ? seedInput.value.trim() : "";
      let seed;
      if (seedTxt) seed = /^\d+$/.test(seedTxt) ? Number(seedTxt) : [...seedTxt].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
      const controllers = { ai4: { fourth: "human", tenth: "ai" }, ai10: { fourth: "ai", tenth: "human" }, hotseat: { fourth: "human", tenth: "human" }, aiai: { fourth: "ai", tenth: "ai" } }[st.mode];
      App.startGame({ seed, settings: st.settings, controllers });
    },
    continue() {
      const save = App.loadSave();
      if (!save) return;
      R.indexCards();
      App.state = save;
      App.ui = Object.assign(App.ui, { screen: "game", modal: null, overlay: null, curtain: null, busy: false, lastPlanner: null });
      App.render();
      App.flow();
    },
    tutorial() {
      TC.tutorial.start();
    },
    "tutorial-exit"() {
      TC.tutorial.stop();
      actions.title();
    },
    codex() {
      App.ui.overlay = null;
      App.openModal({ type: "codex", tab: App.ui.codexTab || "overview" });
    },
    menu() {
      App.ui.overlay = { type: "menu" };
      App.render();
    },
    export() {
      const blob = new Blob([JSON.stringify(App.state, null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `theatercomplex-turn${App.state.turn}-${App.state.phase}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    import() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = async () => {
        try {
          const data = JSON.parse(await input.files[0].text());
          if (!data.teams || !data.cards) throw new Error("not a TheaterComplex save");
          R.indexCards();
          App.state = data;
          App.ui = Object.assign(App.ui, { screen: "game", modal: null, overlay: null, curtain: null, busy: false });
          App.save();
          App.render();
          App.flow();
        } catch (e) {
          alert("Could not load that file: " + e.message);
        }
      };
      input.click();
    },
    "overlay-close"() {
      App.ui.overlay = null;
      App.render();
      App.flow();
    },
    "curtain-ok"() {
      App.ui.curtain = null;
      App.render();
      App.flow();
    },
    "roll-limit"() {
      if (App.state.phase === "taskLimit" && !App.ui.rolling) rollLimit();
    },
    "asos-open"(el) {
      App.openModal({ type: "asos", id: el.dataset.id, team: App.me(), sel: (App.state.asos.alloc[App.me()][el.dataset.id]?.caps || []).slice() });
    },
    "asos-done"() {
      App.ui.asosConfirmed = true;
      const s = App.state;
      const other = App.humans().find((t) => !E.asosComplete(s, t));
      if (other) App.ui.asosConfirmed = false;
      App.flow();
    },
    "hand-filter"(el) {
      App.ui.handFilter = el.dataset.k;
      App.render();
    },
    "task-open"(el) {
      TC.planner.open(Number(el.dataset.num));
    },
    "task-edit"(el, e) {
      if (e.target.closest('[data-act="task-remove"]')) return;
      TC.planner.edit(Number(el.dataset.uid));
    },
    "task-remove"(el) {
      App.do(() => E.unplanTask(App.state, App.me(), Number(el.dataset.uid)));
    },
    forces() {
      App.openModal({ type: "forces", tab: E.unmetAsos(App.state, App.me()).length ? "asos" : "rff" });
    },
    mat(el) {
      App.openModal({ type: "mat", zone: el.dataset.z });
    },
    submit() {
      const s = App.state;
      const me = App.me();
      if (!s.plans[me].tasks.length && !confirm("Submit a plan with no tasks?")) return;
      const r = E.setReady(s, me, true);
      if (!r.ok) {
        alert(r.issues.join("\n"));
        return;
      }
      App.ui.lastPlanner = me;
      App.save();
      App.render();
      App.flow();
    },
    exec(el) {
      const r = E.executeTask(App.state, App.state.impl.active, Number(el.dataset.uid), { disrupt: false });
      taskToast(r);
      App.save();
      App.render();
      App.flow();
    },
    "exec-disrupt"(el) {
      const r = E.executeTask(App.state, App.state.impl.active, Number(el.dataset.uid), { disrupt: true });
      taskToast(r);
      App.save();
      App.render();
      App.flow();
    },
    standdown(el) {
      App.do(() => E.standDownTask(App.state, App.state.impl.active, Number(el.dataset.uid)));
    },
    spend(el) {
      const r = E.spendInfluence(App.state, App.state.impl.active, el.dataset.z);
      if (!r.ok) alert(r.error);
      App.save();
      App.render();
    },
    "to-crisis"() {
      App.do(() => E.beginCrisis(App.state));
    },
    cleanup() {
      App.cleanup();
    },
    veil(el, e) {
      if (e.target === el && App.ui.modal && App.ui.modal.type !== "planner") App.closeModal();
    },
    "close-modal"() {
      App.closeModal();
    },
  };
  App.actions = actions;

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const fn = actions[act] || (TC.modalActions && TC.modalActions[act]) || (TC.crisisUI && TC.crisisUI.actions[act]);
    if (!fn) return;
    if (el.tagName === "INPUT" && el.type === "text") return;
    if (act !== "veil") e.stopPropagation();
    fn(el, e);
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-change]");
    if (!el) return;
    const fn = TC.modalActions && TC.modalActions[el.dataset.change];
    if (fn) fn(el, e);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && App.ui.modal) App.closeModal();
  });

  App.init = function () {
    R.indexCards();
    K.installPreview();
    App.render();
  };
})();
