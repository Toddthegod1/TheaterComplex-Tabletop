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
  // "remote" is the other person in an online game: neither this player nor the AI.
  App.isAI = (team) => App.state && App.state.controllers[team] === "ai";
  const mayAdvance = () => !TC.net || TC.net.mayAdvance();
  const onlineGuest = () => !!(TC.net && TC.net.active && !TC.net.host);
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
    const st = App.ui.screen === "game" ? App.state : null;
    App.ui.toasts.push({ id, html, team, phase: st && st.phase, turn: st && st.turn });
    if (App.ui.toasts.length > 3) App.ui.toasts.splice(0, App.ui.toasts.length - 3);
    renderToasts();
    setTimeout(() => {
      App.ui.toasts = App.ui.toasts.filter((t) => t.id !== id);
      renderToasts();
    }, ms * Math.max(1, App.speed() || 1)); // a slower AI pace keeps messages up longer
  };

  // UI state that belongs to one game and must not leak into the next one
  // (a stale crisis animation could hide the crisis "Next" button).
  function resetGameUi() {
    Object.assign(App.ui, { screen: "game", modal: null, overlay: null, curtain: null, busy: false, rolling: false, lastPlanner: null, crisisAnim: null, asosConfirmed: false, toasts: [], flashes: {}, snap: null, undo: null });
  }
  // Replace the running campaign with a saved one (file, slot or autosave).
  App.loadState = function (data) {
    if (!data || !data.teams || !data.cards) throw new Error("not a TheaterComplex save");
    R.indexCards();
    if (TC.tutorial && TC.tutorial.active) TC.tutorial.stop();
    App.state = data;
    resetGameUi();
    App.save();
    App.render();
    App.flow();
  };

  // In-game replacements for alert() and confirm().
  App.notify = function (text, title = "Not allowed") {
    const lines = [].concat(text).filter(Boolean);
    App.toast(`<div class="t"><b class="bad">${esc(title)}</b><br>${lines.map(esc).join("<br>")}</div>`, null, 5000);
  };
  App.confirm = function (opts) {
    App.openModal(Object.assign({ type: "confirm" }, opts));
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
    const oldHand = root.querySelector(".hand");
    const handScroll = oldHand?.scrollLeft;
    const oldLog = root.querySelector(".logbox");
    const focusKey = focusKeyOf(document.activeElement);
    const html = App.ui.screen === "title" ? renderTitle() : App.ui.screen === "setup" ? renderSetup() : renderGame();
    const cur = root.firstElementChild;
    if (App.ui.screen === "game" && cur && cur.classList.contains("game")) {
      // Same screen as before: swap only the panels whose content changed, so
      // scroll positions, hover and running animations elsewhere are untouched.
      const tpl = document.createElement("template");
      tpl.innerHTML = html;
      morph(cur, tpl.content.firstElementChild, 3);
    } else root.innerHTML = html;
    const hand = root.querySelector(".hand");
    if (hand && hand !== oldHand && handScroll) hand.scrollLeft = handScroll;
    const log = root.querySelector(".logbox");
    if (log && log !== oldLog) log.scrollTop = log.scrollHeight;
    renderOverlay();
    renderModal();
    renderToasts();
    makeReachable();
    restoreFocus(focusKey);
    K.refreshPreview && K.refreshPreview();
    TC.tutorial && TC.tutorial.update();
    App.afterRender && App.afterRender();
    App.checkTips && App.checkTips();
  };

  // Replace `oldEl` with `newEl`, descending up to `depth` levels to find the
  // smallest changed panels.
  function morph(oldEl, newEl, depth) {
    if (oldEl.isEqualNode(newEl)) return;
    const n = oldEl.childElementCount;
    const plain = (el) => ![...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim());
    if (depth > 0 && n > 0 && n === newEl.childElementCount && plain(oldEl) && plain(newEl) && oldEl.cloneNode(false).isEqualNode(newEl.cloneNode(false))) {
      const a = [...oldEl.children];
      const b = [...newEl.children];
      a.forEach((c, i) => morph(c, b[i], depth - 1));
      return;
    }
    oldEl.replaceWith(newEl);
  }

  // Keyboard: every clickable thing can be reached with Tab, and focus is put
  // back on the same control after the screen is redrawn.
  function makeReachable() {
    document.querySelectorAll("[data-act]:not(button):not(a):not(input):not(label):not([tabindex]), [data-inspect]:not([tabindex])").forEach((el) => {
      if (el.dataset.act === "veil" || el.dataset.act === "toast-x") return;
      el.tabIndex = 0;
      if (el.dataset.act) el.setAttribute("role", "button");
    });
  }
  function focusKeyOf(el) {
    if (!App.ui.kbd || !el || el === document.body || !el.dataset) return null;
    const d = el.dataset;
    return el.id ? { id: el.id } : d.act || d.inspect ? { data: JSON.stringify(Object.assign({}, d)) } : null;
  }
  function restoreFocus(key) {
    if (!App.ui.kbd) return;
    const layer = document.querySelector("#modal-root .modal") || document.querySelector("#overlay-root .veil > *");
    const act = document.activeElement;
    if (act && act !== document.body && document.contains(act) && (!layer || layer.contains(act))) return;
    let el = null;
    if (key && key.id) el = document.getElementById(key.id);
    else if (key) el = [...document.querySelectorAll("[data-act], [data-inspect]")].find((x) => JSON.stringify(Object.assign({}, x.dataset)) === key.data);
    if (layer && (!el || !layer.contains(el))) el = layer.querySelector(".btn.primary:not([disabled])") || layer.querySelector("button:not([disabled]), [tabindex]");
    if (el && el.offsetParent !== null) el.focus({ preventScroll: true });
  }

  function renderToasts() {
    const el = document.getElementById("toast-root");
    // With a full-screen panel open, tuck toasts into the bottom-left corner
    // so they never cover dice, tables or buttons.
    const covered = !!(document.getElementById("overlay-root").innerHTML || document.getElementById("modal-root").innerHTML);
    // A message about an earlier phase is stale once the game has moved on.
    const st = App.ui.screen === "game" ? App.state : null;
    if (st) App.ui.toasts = App.ui.toasts.filter((t) => !t.phase || (st.phase !== "gameOver" && t.phase === st.phase && t.turn === st.turn));
    const side = !covered && document.querySelector(".game aside.side");
    const r = side && side.getBoundingClientRect();
    const docked = r && r.left > 500 && r.width >= 240; // the side panel is a right-hand column
    const pos = docked ? ` style="left:${Math.round(r.left + 8)}px;width:${Math.round(r.width - 16)}px;bottom:${Math.round(window.innerHeight - r.bottom + 8)}px"` : "";
    el.innerHTML = `<div class="toast-wrap ${covered ? "low" : ""} ${docked ? "inlog" : ""}"${pos}>${App.ui.toasts.map((t) => `<div class="toast ${t.team ? K.teamCls(t.team) : ""}" data-act="toast-x" data-id="${t.id}" title="Click to dismiss">${t.html}</div>`).join("")}</div>`;
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
        <div class="card" data-act="setup"><div class="ico">⚔️</div><h3>New Campaign</h3><p>Command either army against the AI, or play another person on one screen (hot-seat) or online.</p></div>
        <div class="card" data-act="codex"><div class="ico">📖</div><h3>Rules Codex</h3><p>The full rules, die legend, crisis table, every task and capability card, and rules clarifications.</p></div>
      </div>
      <div class="btn-row" style="justify-content:center;margin-top:18px">
        ${save && save.phase !== "gameOver" ? `<button class="btn primary" data-act="continue">Continue campaign — Turn ${save.turn}, ${E.PHASES.find((p) => p.key === save.phase)?.label || ""}</button>` : ""}
        <button class="btn ghost" data-act="online-join">Join online game…</button>
        <button class="btn ghost" data-act="import">Load save file…</button>
        ${App.hasSlots && App.hasSlots() ? '<button class="btn ghost" data-act="saves">Saved campaigns…</button>' : ""}
        <a class="btn ghost" id="tabletop-link" href="../tabletop.html" hidden>Open free-form tabletop</a>
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
            ${seg("mode", [["ai4", "You: Fourth Army vs AI"], ["ai10", "You: Tenth Army vs AI"], ["hotseat", "Two players (hot-seat)"], ["online", "Two players online"], ["aiai", "Watch AI vs AI"]], s.mode, "root")}
            ${s.mode === "online" ? `<div style="margin-top:6px">${seg("onlineTeam", [["fourth", "I command Fourth Army"], ["tenth", "I command Tenth Army"]], s.onlineTeam || "fourth", "root")}</div><div class="hint">You host. After Begin you get an invite code to send to your opponent, who chooses <b>Join online game</b> on their title screen.</div>` : ""}
            <div class="hint">Fourth Army starts strong in Zone A and Tenth Army in Zone C; the central Zone B usually decides the campaign. Hot-seat keeps each staff's plan hidden behind a hand-off screen during planning.</div></div>
          <div class="field"><label>Campaign length (turns = years)</label>${seg("turns", [[4, "4"], [6, "6"], [8, "8"], [10, "10"]], s.settings.turns)}
            <div class="hint">The tabletop game runs for a set time (typically 4 hours). The turn track goes to 10.</div></div>
          <div class="field"><label>Planning timer</label>${seg("planTimerMinutes", [[0, "Off"], [10, "10 min"], [20, "20 min"], [30, "30 min (rules)"]], s.settings.planTimerMinutes)}</div>
          ${s.mode !== "hotseat" && s.mode !== "online" ? `<div class="field"><label>AI opponent</label>${seg("aiLevel", Object.entries(AI.LEVELS).map(([k, l]) => [k, l.label]), s.settings.aiLevel)}
            <div class="hint">${{ easy: "Recruit plans fewer tasks and makes loose choices. Best for your first campaign.", normal: "Regular plays a full, sensible campaign.", hard: "Aggressive is the strongest opponent. It also turns tasks against you with Disruption and shifts its combat units to the deterrence level that pays best in each zone." }[s.settings.aiLevel] || ""}</div></div>` : ""}
          <div class="field"><label>AI pace</label>${seg("aiSpeed", [[2, "Deliberate"], [1, "Normal"], [0.4, "Fast"]], s.settings.aiSpeed)}</div>
          <div class="field"><label>Seed (optional)</label><input type="text" data-act="setup-seed" value="${esc(s.seed)}" placeholder="random"><div class="hint">Same seed = same dice and draws, for exercises and after-action review.</div></div>
        </div>
        <div>
          <div class="field"><label>Balance option (not in the rulebook)</label>
            ${seg("tenthHeadStart", [[0, "Off (rulebook)"], [1, "Tenth +1"], [2, "Tenth +2"], [3, "Tenth +3"]], s.settings.tenthHeadStart || 0)}
            <div class="hint">Tenth Army starts with these points. With the rulebook setup Fourth Army wins 58% of AI-vs-AI campaigns, because its home zone pays slightly more; a 2-point head start makes it even (286 to 290 over 600 simulated campaigns).</div></div>
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
    resetGameUi();
    App.save();
    App.render();
    App.flow();
  };

  // ---------------------------------------------------------------- game screen
  function renderGame() {
    const s = App.state;
    return `<div class="screen game ${App.ui.dockMin ? "dockmin" : ""}">${renderHud(s)}<div class="main"><div class="board">${TC.ZONES.map((z) => renderZone(s, z)).join("")}</div>
      <aside class="side">${renderAdvisor(s)}${renderLog(s)}</aside>
      <button class="docktoggle" data-act="dock-toggle" title="${App.ui.dockMin ? "Show the bottom bar again" : "Hide the bottom bar to see the whole board"}">${App.ui.dockMin ? "▴ Show bottom bar" : "▾ Hide bottom bar"}</button></div>${renderDock(s)}</div>`;
  }

  function renderHud(s) {
    const me = App.me();
    const idx = E.phaseIndex(s);
    const phases = E.PHASES.map((p, i) => `<span class="ph ${i < idx || s.phase === "gameOver" ? "done" : ""} ${i === idx ? "now" : ""}" title="${esc(p.label + " — " + p.tip)}"><span class="lf">${p.label}</span><span class="ls">${p.short}</span></span>`).join('<span class="sep">›</span>');
    const track = Array.from({ length: s.settings.turns }, (_, i) => {
      const n = i + 1;
      return `<span class="${n % 2 === 0 ? "even" : ""} ${n < s.turn ? "past" : ""} ${n === s.turn ? "now" : ""}" title="Turn ${n}${n % 2 === 0 ? " — Assurance & Interoperability degrade" : ""}">${n}</span>`;
    }).join("");
    const side = (team) => {
      const t = s.teams[team];
      const you = App.humans().length === 1 && App.isHuman(team) ? '<span class="you">YOU</span>' : App.state.controllers[team] === "ai" ? '<span class="you" style="color:var(--muted)">AI</span>' : App.state.controllers[team] === "remote" ? '<span class="you" style="color:var(--muted)">ONLINE</span>' : "";
      return `<div class="side ${K.teamCls(team)}" data-act="score" title="${esc(App.scoreTip ? App.scoreTip(s, team) : "")}"><span class="name"><span class="marker ${TC.TEAM_INFO[team].marker}"></span> <span class="lf">${TC.TEAM_INFO[team].name}</span><span class="ls">${TC.TEAM_INFO[team].short}</span> ${you}</span>
        <span class="pts${fx(team + ".score").cls}"${fx(team + ".score").style}>${t.score}<small>pts</small>${fx(team + ".score").html}</span><span class="inf${fx(team + ".influence").cls}"${fx(team + ".influence").style} title="Theater-wide Influence (higher earns +1 point each turn)">◆ ${t.influence} infl.${fx(team + ".influence").html}</span></div>`;
    };
    return `<header class="hud">
      <img class="logo" src="img/logo.webp" alt="TheaterComplex">
      <div class="turn">TURN <b>${Math.min(s.turn, s.settings.turns)}</b> / ${s.settings.turns}</div>
      <div class="turntrack">${track}</div>
      <nav class="phases">${phases}</nav>
      <span class="spacer"></span>
      ${TC.net ? TC.net.chip() : ""}${s.taskLimit ? `<span class="chip" title="Adjudicator's d6 roll (minimum 3)">Task limit ${s.taskLimit}</span>` : ""}
      <div class="scorebox">${side("fourth")}${side("tenth")}</div>
      <button class="btn sm ghost" data-act="tabletop" id="btn-table" title="Table view: see this position as it would look on the physical table, with the real mats, tracker cards and markers"><svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true" style="vertical-align:-2px"><g fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1" y="1" width="11" height="11" rx="1.5"/><path d="M1 5h11M1 8.5h11M5 1v11M8.5 1v11"/></g></svg> <span class="lf">Table</span></button>
      <button class="btn sm ghost" data-act="glossary" title="Glossary: what ASOS, RFF, MSC, LSCO and the other abbreviations mean">Aa <span class="lf">Glossary</span></button>
      <button class="btn sm ghost" data-act="codex" title="Rules Codex">📖 <span class="lf">Rules</span></button>
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
    const sub = { A: "Near Fourth Army's homeland", B: "Central · evenly matched", C: "Near Tenth Army's homeland" }[zone];
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
      return `<tr data-k="${key}" class="${f4.cls || f10.cls ? "rowflash" : ""}"${f4.style || f10.style}><td>${K.pips(a, "fourth", false, warn)}</td><td class="val ${lead4 ? "lead" : ""}${f4.cls}"${f4.style}>${va}${f4.html}</td>
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
          <div class="instab" title="Instability = |deterrence gap| ${inst.base} + assurance ${inst.assurance}${inst.reduced ? " − influence " + inst.reduced : ""}. The crisis table uses three bands: 0–1 calm, 2–4 tense, 5+ volatile." id="instab-${zone}">
            <div class="lbl">Instability</div><div class="v ${["good", "warn", "bad"][R.instabilityBand(inst.total)]}${fx(`inst.${zone}`, true).cls}"${fx(`inst.${zone}`, true).style}>${inst.total}${fx(`inst.${zone}`, true).html}</div><div class="bandlbl">${TC.CRISIS_BANDS[R.instabilityBand(inst.total)]}</div></div>
          <div class="det right"><div style="text-align:right"><div class="num c10${fx(`tenth.det.${zone}`).cls}"${fx(`tenth.det.${zone}`).style}>${inst.d10}${fx(`tenth.det.${zone}`).html}</div><div class="lbl">Deterrence</div></div>${K.die(p10.theater[0].sides, { size: 30, title: "Tenth Army Deterrence die" })}</div>
        </div>
        <div title="Chance of each crisis type at this Instability ">
          <div class="oddsbar">${["SQ", "SOF", "LIM", "LSCO"].map((k) => `<i class="${k}" style="width:${odds[k]}%"></i>`).join("")}</div>
          <div class="oddslegend"><span>Status quo ${odds.SQ}%</span><span>Show of force ${odds.SOF}%</span><span>Limited op ${odds.LIM}%</span><span>LSCO ${odds.LSCO}%</span></div>
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
          <tr data-k="access"><td></td><td class="val c4${fx(`fourth.access.${zone}`).cls}"${fx(`fourth.access.${zone}`).style}>${s.teams.fourth.access[zone]}${fx(`fourth.access.${zone}`).html}</td><td class="lab"><span title="Access in this zone — spent by agreements, stockage and police tasks">Access</span></td><td class="val c10${fx(`tenth.access.${zone}`).cls}"${fx(`tenth.access.${zone}`).style}>${s.teams.tenth.access[zone]}${fx(`tenth.access.${zone}`).html}</td><td></td></tr>
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
  // One line telling the player exactly what to click next.
  function yourMove(s, me) {
    const human = App.isHuman(me);
    const other = (t) => TC.TEAM_INFO[t].name;
    switch (s.phase) {
      case "taskLimit":
        return App.humans().length ? "Click <b>Roll for task limit</b>." : "";
      case "asos": {
        if (!human) return "";
        const left = s.asos.current.filter((id) => !s.asos.alloc[me][id]).length;
        return left ? `Click <b>Allocate forces</b> on ${left === 1 ? "the ASOS request" : `each of the ${left} ASOS requests`} in the bottom bar.` : "Click <b>Proceed to planning</b>.";
      }
      case "planning": {
        const plan = s.plans[me];
        if (!human || plan.ready) return { wait: `Waiting for ${other(TC.other(me))} to finish planning…` };
        const n = plan.tasks.length;
        const issues = E.planIssues(s, me).filter((i) => i.startsWith("Select GFM") ? E.asosCoverPossible(s, me) : true);
        if (issues.length) return `Open <b>Force management</b>: ${esc(issues[0])}`;
        if (n >= s.taskLimit) return "Your campaign is full. Click <b>Submit plan</b>.";
        return `Plan task <b>${n + 1} of ${s.taskLimit}</b>: click a card in your hand. Cards marked <b class="gold">★</b> are good picks, or press <b>Suggest a plan</b>.${n ? " Or click <b>Submit plan</b> when you're happy." : ""}`;
      }
      case "implementation":
        if (!s.impl) return "";
        if (s.impl.done) return "Click <b>Proceed to Crisis Assessment</b>.";
        return App.isHuman(s.impl.active) ? `Your initiative: click <b>Execute</b> on one task card below.` : { wait: `${other(s.impl.active)} is executing a task…` };
      case "tailoring":
        return "Review the year, then click <b>Begin turn</b> to continue.";
      default:
        return "";
    }
  }

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
        title = "Army Support to Other Services (ASOS)";
        body = `<p>The other Services need Army capabilities. Commit at least one card of <b>every</b> listed type, with capability points that reach the requirement. They come from <b>any</b> zone and are turned sideways for this turn, but still count for deterrence.</p><p>If you truly cannot meet a request, declare it unmet and cover it with GFM forces in your RFF this turn.</p>`;
        break;
      case "planning":
        title = `${name} — campaign planning`;
        body = `<p>Pick up to <b>${s.taskLimit}</b> task cards. Each needs staff to plan it, MSCs to command it and capability points in the zone to execute it.</p>
          <ul><li><b>MSCs</b> (major subordinate commands, the orange cards) command your tasks. An MSC's <b>3rd+</b> task is over-tasked: it needs a d6 roll to succeed, and costs −1 point.</li><li>Use <b>Force Management</b> to request forces from the global pool (an <b>RFF</b>, Request for Forces), move units between zones and send last turn's RFF home.</li><li>Watch the deterrence gap: a big gap raises Instability, which makes violent crises more likely.</li></ul>`;
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
    const move = yourMove(s, me);
    return `<div class="advisor"><div class="who"><div class="avatar">S3</div><div><h4>${esc(title)}</h4><div class="role">Operations officer · advising ${App.humans().length ? esc(name) : "observers"}</div></div></div>${move ? `<div class="yourmove ${move.wait ? "wait" : ""}" id="yourmove"><span class="k">${move.wait ? "⏳ Please wait" : "▶ Your move"}</span>${move.wait || move}</div>` : ""}${App.canUndo && App.canUndo() ? `<button class="btn sm undo" data-act="undo" id="btn-undo" title="Take back your last commitment (Ctrl+Z). Available until the next dice roll.">↶ Undo: ${esc(App.ui.undo.label)}</button>` : ""}<div class="msg">${body}</div></div>`;
  }

  function renderLog(s) {
    const items = s.log.slice(-160).map((l) => `<div class="l ${l.tone} ${l.team ? "t-" + l.team : ""}">${esc(l.text)}</div>`);
    return `<div class="logbox"><div class="h"><h4 style="font-size:13px;letter-spacing:.14em;color:var(--muted)">ADJUDICATOR LOG</h4></div>${items.join("")}</div>`;
  }

  // ---------------------------------------------------------------- card inspector
  // Hovering a task card explains, zone by zone, what it would change and what
  // that means for the crisis dice. The matching rows on the board light up
  // with the new value next to the current one.
  K.inspect = function (el) {
    const s = App.state;
    const team = el.dataset.team;
    if (!s || App.ui.screen !== "game" || App.ui.modal || !team) return null;
    const plan = s.plans[team];
    const entry = el.dataset.uid ? plan.tasks.find((t) => t.uid === Number(el.dataset.uid)) : plan.tasks.find((t) => t.num === Number(el.dataset.num));
    const task = TC.taskByNum(entry ? entry.num : Number(el.dataset.num));
    if (!task) return null;
    const branch = entry ? entry.branch : task.branches ? task.branches[0].key : null;
    const req = R.taskRequirement(task, branch, entry ? entry.options : []);
    const zones = entry ? [entry.zone] : TC.ZONES;
    const opp = TC.other(team);
    const executing = el.dataset.inspect === "task" && s.phase === "implementation";
    if (el.dataset.inspect === "plan" && App.noteInspect) App.noteInspect(team, task.num);

    const chips = Object.entries(req.effects)
      .filter(([, v]) => v)
      .map(([k, v]) => `<span class="chip goodc">${v > 0 ? "+" : "−"}${Math.abs(v)} ${TC.EFFECT_LABELS[k]}</span>`)
      .concat(Object.entries(req.oppEffects).filter(([, v]) => v).map(([k, v]) => `<span class="chip badc">Enemy ${TC.EFFECT_LABELS[k]} ${v > 0 ? "+" : "−"}${Math.abs(v)}</span>`));
    if (task.special === "rsoi") chips.push('<span class="chip goodc">Up to 3 extra forces arrive at year end</span>');
    const cost = Object.entries(task.cost).map(([k, v]) => (k === "influence" ? `◆${v} Influence` : `${v} Access in the zone`)).join(" + ");
    const branchNote = task.branches ? `<div class="inote">Shown: “${esc(task.branches.find((b) => b.key === branch).label)}”. ${entry ? "" : "The other option is in the planner."}</div>` : "";

    const hasEffects = Object.values(req.effects).some(Boolean);
    const blocks = zones.map((z) => {
      const ok = !!entry || E.evaluateTask(s, team, { num: task.num, zone: z, branch }).ok;
      const im = K.impact(s, team, z, req.effects);
      // Important lines first, then the quieter ones ("no dice change yet"), up to four.
      const shown = im.lines.filter((l) => l.tone !== "muted").concat(im.lines.filter((l) => l.tone === "muted")).slice(0, 4);
      return { z, ok, im, gain: im.after - im.before, shown };
    });
    const ranked = blocks.filter((b) => b.ok && b.gain > 0.01).sort((a, b) => b.gain - a.gain);
    const best = el.dataset.z || (zones.length > 1 && ranked[0] ? ranked[0].z : null);
    const zoneHtml = hasEffects
      ? blocks
          .map((b) => {
            const up = b.gain > 0.01;
            const star = best === b.z ? '<span class="sugg-inline">★ best here</span>' : "";
            return `<div class="iz ${b.ok ? "" : "off"} ${best === b.z ? "best" : ""}">
              <div class="izh"><b>Zone ${b.z}</b>${star}${b.ok ? "" : '<span class="faint">can\'t plan here now</span>'}
                <span class="izroll ${up ? "up" : ""}" title="Your expected crisis roll in Zone ${b.z} (enemy ≈ ${b.im.theirs.toFixed(1)})">🎲 ${b.im.before.toFixed(1)}${up ? ` → <b>${b.im.after.toFixed(1)}</b>` : ""} <span class="faint">vs ${b.im.theirs.toFixed(1)}</span></span></div>
              <ul class="impact">${b.shown.map((l) => `<li class="${l.tone}">${l.html}</li>`).join("") || '<li class="muted">No change to the trackers here.</li>'}</ul></div>`;
          })
          .join("")
      : "";
    let foot;
    if (executing) foot = `Execute applies these now.${E.canDisrupt(s, team, entry.uid) ? ` ⚡ As Disruption, ${TC.TEAM_INFO[opp].name} loses them instead.` : ""}`;
    else if (entry) foot = `In your campaign for Zone ${entry.zone}. Click to change it.`;
    else foot = "Click the card to plan it.";

    App.boardPreview(team, zones, req.effects);
    return `<div class="ihead"><img src="${task.art[team].front}" alt=""><div><div class="iname"><b>${task.num}</b> ${esc(task.name)}</div>
        <div class="ichips">${chips.join("") || '<span class="muted">No tracker change</span>'}</div>${cost ? `<div class="inote">Costs ${cost}.</div>` : ""}</div></div>
      ${branchNote}
      ${hasEffects ? `<div class="ilabel">What it does ${zones.length > 1 ? "in each zone" : `in Zone ${zones[0]}`} <span class="faint">· 🎲 = your expected crisis roll</span></div>${zoneHtml}` : ""}
      <div class="ifoot">${foot}</div>`;
  };

  // Light up the tracker rows a task would change, with the new value beside the old.
  App.boardPreview = function (team, zones, effects) {
    K.uninspect();
    const s = App.state;
    const col = team === "fourth" ? 1 : 3;
    Object.entries(effects || {}).forEach(([k, v]) => {
      if (!v) return;
      if (k === "influence") {
        const el = document.querySelector(`.scorebox .side.${K.teamCls(team)} .inf`);
        if (el) el.classList.add("pv-hl");
        return;
      }
      zones.forEach((z) => {
        const tr = document.querySelector(`#zone-${z} tr[data-k="${k}"]`);
        if (!tr) return;
        const cur = k === "access" ? s.teams[team].access[z] : s.teams[team].zones[z][k];
        const after = R.clamp(cur + v, k === "access" ? 0 : TC.TRACKER_MIN, k === "access" ? TC.ACCESS_MAX : TC.TRACKER_MAX);
        tr.classList.add("pv-hl");
        if (after !== cur) tr.children[col].insertAdjacentHTML("beforeend", `<span class="pv-ghost ${col === 1 ? "r" : "l"}">→${after}</span>`);
      });
    });
    if (zones.length === 1) document.getElementById(`zone-${zones[0]}`)?.classList.add("pv-zone");
  };
  K.uninspect = function () {
    document.querySelectorAll(".pv-ghost").forEach((g) => g.remove());
    document.querySelectorAll(".pv-hl, .pv-zone").forEach((x) => x.classList.remove("pv-hl", "pv-zone"));
  };

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
        return `<div style="display:flex;gap:10px;align-items:center"><img src="${a.art}" data-art="${a.art}" style="width:72px;border-radius:6px"><div><b style="font-family:var(--head);font-size:17px">${esc(a.name)}</b><div class="muted">${a.points} pts of ${a.types.map((t) => TC.CAPABILITY_TYPES[t] || t).join(" + ")}</div>${status}
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
    const sugg = new Map(plan.tasks.length < s.taskLimit ? AI.suggestions(s, me).map((x, i) => [x.num, Object.assign({ rank: i }, x)]) : []);
    // Suggested cards first (best first), then the rest in card order.
    const rank = (t) => (sugg.has(t.num) ? sugg.get(t.num).rank : 99);
    const hand = TC.TASKS.slice().sort((a, b) => rank(a) - rank(b)).map((task) => {
      const planned = plan.tasks.find((t) => t.num === task.num);
      const zoneOk = TC.ZONES.map((z) => !planned && (task.branches || [{ key: null }]).some((b) => E.evaluateTask(s, me, { num: task.num, zone: z, branch: b.key }).ok));
      const anyOk = zoneOk.some(Boolean);
      const keys = taskEffectKeys(task);
      const tip = sugg.get(task.num);
      if (filter === "ready" && !anyOk) return "";
      if (filter === "suggested" && !tip) return "";
      if (filter !== "all" && filter !== "ready" && !keys.includes(filter)) return "";
      const mode = task.mode === "P" ? "Plan-only" : task.mode === "E" ? "Execute-only" : "";
      const dots = planned
        ? `<span class="chip goodc" style="padding:0 6px">✔ Zone ${planned.zone}</span>`
        : TC.ZONES.map((z, i) => `<span class="zdot ${zoneOk[i] ? "ok" : ""}" title="Zone ${z}: ${zoneOk[i] ? "can plan here" : "not possible now"}">${z}</span>`).join("");
      const cost = Object.entries(task.cost)
        .map(([k, v]) => `<span class="tcost">${k === "influence" ? "◆" : "Acc"}−${v}</span>`)
        .join("");
      const blocked = !anyOk && !planned && plan.tasks.length < s.taskLimit && App.blockReason ? App.blockReason(s, me, task) : null;
      const why = blocked ? `<span class="twhy" title="${esc(blocked.all)}">${esc(blocked.text)}</span>` : "";
      const star = tip ? `<span class="sugg" title="${tip.rank === 0 ? "Top suggestion" : "Suggested"}: a strong pick in Zone ${tip.zone} right now">★ ${tip.zone}</span>` : "";
      return `<div class="taskcard tc2 ${planned ? "planned" : ""} ${!anyOk && !planned ? "blocked" : ""} ${tip ? "suggested" : ""}" data-act="task-open" data-num="${task.num}" ${tip ? `data-z="${tip.zone}"` : ""} data-inspect="plan" data-team="${me}" data-art="${task.art[me].front}">${star}
        <img src="${task.art[me].front}" alt="" loading="lazy">
        <div class="tinfo"><div class="tname"><b>${task.num}</b> ${esc(task.name)}${task.mode !== "N" ? ` <span class="tmode">${task.mode}</span>` : ""}</div>
          <div class="teff">${effectSummary(task)}</div>
          <div class="tfoot">${why || dots}${cost}</div></div></div>`;
    }).join("");
    const filterList = [["all", "All"], ["suggested", "★ Suggested"], ["ready", "Plannable now"], ["intel", "Intel"], ["comms", "Comms"], ["protection", "Protection"], ["partnerCap", "Partner Cap"], ["infrastructure", "Infra"], ["interop", "Interop"], ["stockage", "Stockage"], ["assurance", "Assurance"], ["influence", "Influence"], ["access", "Access"]];
    const filterSelect = `<select class="handfilter-select" data-change="hand-filter-select" title="Show only some task cards">${filterList.map(([k, l]) => `<option value="${k}" ${filter === k ? "selected" : ""}>${k === "all" ? "Show: all cards" : l}</option>`).join("")}</select>`;
    const filters = filterList
      .map(([k, l]) => `<button class="btn sm ${filter === k ? "on" : ""}" data-act="hand-filter" data-k="${k}">${l}</button>`)
      .join("");
    const list = plan.tasks
      .map((t) => {
        const task = TC.taskByNum(t.num);
        return `<div class="taskchip ${K.teamCls(me)}" data-act="task-edit" data-uid="${t.uid}" data-inspect="task" data-team="${me}" data-art="${task.art[me].front}"><span class="n">${t.num}</span>${esc(task.name)} <span class="chip">Zone ${t.zone}</span><button class="btn sm ghost" data-act="task-remove" data-uid="${t.uid}" title="Remove">✕</button></div>`;
      })
      .join("");
    const issues = E.planIssues(s, me);
    const rff = E.rffProjected(s, me);
    const timer = s.settings.planTimerMinutes ? `<span class="chip" id="plan-timer">⏱ --:--</span>` : "";
    return `<footer class="dock">
      <div class="col grow" style="min-width:0"><h3>Task cards <span class="chip">${plan.tasks.length} / ${s.taskLimit} planned</span>${timer}${filterSelect}<span class="muted dockhint" style="text-transform:none;letter-spacing:0;font-size:12px">Hover a card to see what it changes · click to plan it · scroll for more</span></h3>
        <div class="seg handfilters">${filters}</div>
        <div class="hand" id="hand">${hand || `<div class="muted" style="padding:20px">No task cards match this filter.</div>`}</div></div>
      <div class="col" style="width:290px"><h3>Campaign ${K.teamChip(me)}</h3><div class="col scroll" style="gap:6px;max-height:150px">${list || '<div class="muted">No tasks yet.</div>'}</div>
        <div class="btn-row" style="margin-top:auto">${plan.tasks.length < s.taskLimit && sugg.size ? '<button class="btn" data-act="suggest-plan" id="btn-suggest" title="Your operations officer fills the empty task slots with sensible picks. You can still edit or remove them.">✨ Suggest a plan</button>' : ""}<button class="btn" data-act="forces" id="btn-forces">Force management <span class="chip">RFF ${rff}/${E.RFF_LIMIT}</span></button>
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
            const req = R.taskRequirement(task, t.branch, t.options);
            const fmt = (eff, opp) =>
              Object.entries(eff)
                .filter(([, v]) => v)
                .map(([k, v]) => `<span class="te ${opp ? "opp" : ""}">${opp ? "Foe " : ""}${EFFECT_SHORT[k]}${v > 0 ? "+" : "−"}${Math.abs(v)}</span>`)
                .join("");
            const eff = task.special === "rsoi" ? '<span class="te">+3 GFM forces</span>' : fmt(req.effects) + fmt(req.oppEffects, true);
            const n = over.length ? (impl.commandMarkers[over[0]] || 0) + 1 : 0;
            return `<div class="col execcard"><div class="taskcard tc2" data-inspect="task" data-team="${active}" data-uid="${t.uid}" data-art="${task.art[active].front}">
              <img src="${task.art[active].front}" alt="" loading="lazy">
              <div class="tinfo"><div class="tname"><b>${task.num}</b> ${esc(task.name)}</div><div class="teff">${eff || '<span class="muted" style="font-size:11px">no tracker change</span>'}</div>
              <div class="tfoot"><span class="tzone">Zone ${t.zone}</span></div></div></div>
            ${over.length ? `<div class="chip badc" style="justify-content:center" title="${esc(R.cmd(over[0]).short)} is over-tasked: this task only happens on a d6 roll of ${n + 1}+">Over-tasked: needs d6 ${n + 1}+</div>` : ""}
            <button class="btn sm primary" data-act="exec" data-uid="${t.uid}">Execute</button>
            ${canD ? `<button class="btn sm danger" data-act="exec-disrupt" data-uid="${t.uid}" title="Subtract this task's effects from the enemy in Zone ${t.zone} instead">⚡ Play as Disruption</button>` : ""}
            <button class="btn sm ghost" data-act="standdown" data-uid="${t.uid}" title="Skip this task this year. Its Influence and Access are refunded.">Stand down</button></div>`;
          })
          .join("")
      : `<div class="muted" style="padding:20px">${TC.TEAM_INFO[active].name} is executing…</div>`;
    const spend = mine
      ? TC.ZONES.map((z) => {
          // The crisis table only cares about bands, so say whether a spend changes anything.
          const inst = R.instability(s, z);
          const can = s.teams[active].influence >= 3 && inst > 0;
          const b0 = R.instabilityBand(inst);
          const b1 = R.instabilityBand(Math.max(0, inst - 1));
          const note = !inst ? "already 0" : b1 < b0 ? `→ ${TC.CRISIS_BANDS[b1]}` : `stays ${TC.CRISIS_BANDS[b0]}`;
          const tip = !inst ? "Instability is already 0." : b1 < b0 ? `Moves Zone ${z} into the ${TC.CRISIS_BANDS[b1]} row of the crisis table: fewer violent crises.` : `Zone ${z} stays in the ${TC.CRISIS_BANDS[b0]} row (${TC.crisisRowLabel(R.crisisRow(inst))}), so the crisis odds don't change.`;
          return `<button class="btn sm spendbtn ${can && b1 < b0 ? "useful" : ""}" data-act="spend" data-z="${z}" title="${esc(tip)}" ${can ? "" : "disabled"}><span>Zone ${z}: ${inst} → ${Math.max(0, inst - 1)}</span><span class="note">${note}</span></button>`;
        }).join("")
      : "";
    return `<footer class="dock">
      <div class="col grow" style="min-width:0"><h3>Initiative ${K.teamChip(active)} <span class="muted" style="text-transform:none;letter-spacing:0;font-size:12px">${remaining.length} task${remaining.length === 1 ? "" : "s"} left · Disruption ${s.teams[active].disruptionUsed ? "used" : "available"}</span></h3>
        <div class="hand">${cards}</div></div>
      ${mine ? `<div class="col" style="width:240px"><h3>Reduce Instability</h3><div class="muted" style="font-size:12px">${s.teams[active].influence} Influence available · 3 ◆ cuts a zone's Instability by 1 until year end</div>${spend}</div>` : ""}
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
      <p>Pass the controls to the <b>${TC.TEAM_INFO[team].name}</b> commander.${App.state.phase === "planning" ? ` The ${TC.TEAM_INFO[TC.other(team)].name} staff should look away: planning is secret until execution.` : " It's your turn to support this year's ASOS requests."}</p>
      <button class="btn primary lg" data-act="curtain-ok">I am the ${TC.TEAM_INFO[team].name} commander</button></div>`;
  }

  // Points scored this turn, and a few plain-language lessons for the human.
  function yearReview(s) {
    const ev = s.scoreEvents.filter((e) => e.turn === s.turn);
    const col = (team) => {
      const mine = ev.filter((e) => e.team === team);
      const total = mine.reduce((x, e) => x + e.pts, 0);
      return `<div class="yr ${K.teamCls(team)}"><div class="yrh">${K.teamChip(team)}<span class="yrt ${total > 0 ? "good" : total < 0 ? "bad" : "muted"}">${total > 0 ? "+" : ""}${total} this year</span></div>
        ${mine.map((e) => `<div class="yrl"><b class="${e.pts > 0 ? "good" : "bad"}">${e.pts > 0 ? "+" : ""}${e.pts}</b> ${esc(e.reason)}</div>`).join("") || '<div class="muted">No points this year.</div>'}</div>`;
    };
    const tips = [];
    const humans = App.humans();
    if (humans.length === 1 && s.crisis) {
      const me = humans[0];
      const opp = TC.other(me);
      s.crisis.results.forEach((r) => {
        const ct = TC.CRISIS_TYPES[r.type];
        if (r.points[me].some((p) => p.pts < 0))
          tips.push(`<b>Zone ${r.zone}:</b> your deterrence was higher during a ${ct.name}, which cost 3 points. In tense zones, keep your deterrence close to the enemy's instead of far above it.`);
        else if (r.winner === opp && r.teams[opp].diceSum > r.teams[me].diceSum + 3)
          tips.push(`<b>Zone ${r.zone}:</b> ${TC.TEAM_INFO[opp].name}'s dice pool was much stronger. Tasks that raise Partner Capability, Infrastructure, Interoperability or Stockage there add dice or bigger dice.`);
      });
      const th = s.crisis.theater;
      if (th && th.influence === opp) tips.push(`${TC.TEAM_INFO[opp].name} had more Influence (◆) and scored +1. Military engagement, SPP contact events and Intelligence support raise yours.`);
      if (th && th.overtasked[me] && th.overtasked[me].length) tips.push("An over-tasked MSC cost you a point. Spread tasks so no MSC handles more than two.");
      const par = TC.BASELINE && TC.BASELINE.armies[me].par[Math.min(s.turn, TC.BASELINE.turns) - 1];
      if (par != null) {
        const mine = s.teams[me].score;
        const d = Math.round((mine - par) * 10) / 10;
        tips.push(`<b>Against par:</b> the AI playing ${TC.TEAM_INFO[me].name} averages <b>${par}</b> points after turn ${s.turn}. You have <b>${mine}</b> (${d >= 0 ? "+" : "−"}${Math.abs(d)}).`);
      }
      if (tips.length < 2 && s.crisis.results.some((r) => r.winner === me)) tips.push("Good year. Keep investing in your objective, Zone " + TC.TEAM_INFO[me].objectiveZone + ", where wins score a bonus point.");
    }
    return `<h3 class="yrtitle">Year ${s.turn} in review</h3><div class="trays" style="margin-top:0">${col("fourth")}${col("tenth")}</div>
      ${tips.length ? `<div class="banner tip"><b>💡 Lessons for next year</b><ul>${tips.slice(0, 3).map((t) => `<li>${t}</li>`).join("")}</ul></div>` : ""}`;
  }

  TC.overlays = {
    turnStart() {
      const s = App.state;
      const canRoll = App.humans().length > 0 && !onlineGuest();
      const even = s.turn % 2 === 0;
      return `<div class="stage"><div class="kicker">Year ${s.turn} of ${s.settings.turns}</div><h1>TURN ${s.turn}</h1>
        <p>The adjudicator rolls a d6 for the <b>task card limit</b> (minimum 3), then draws Army Support to Other Services requests.</p>
        ${even ? '<p class="bad">Even turn: Assurance and Partner Interoperability will degrade by 1 at cleanup.</p>' : ""}
        <div class="bigdie">${K.die(6, { size: 84, value: "?", cls: App.ui.rolling ? "rolling" : "" })}</div>
        ${canRoll ? `<button class="btn primary lg" data-act="roll-limit" id="btn-roll" ${App.ui.rolling ? "disabled" : ""}>Roll for task limit</button>` : onlineGuest() ? '<p class="muted">Waiting for the host to roll…</p>' : ""}</div>`;
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
        <div class="modal-body">${yearReview(s)}<h3 class="yrtitle">Forces on the move</h3><div class="trays" style="margin-top:0">${col("fourth")}${col("tenth")}</div>
        <div class="banner info" style="margin-top:14px">Cleanup: sideways cards return upright, deterrence is recounted${even ? ", and <b>Assurance and Partner Interoperability drop by 1</b> in every zone (even turn)" : ""}.</div></div>
        <div class="modal-foot"><button class="btn ghost left" data-act="export" title="The campaign autosaves in this browser only. A save file is a copy you can keep or send.">💾 Download save file</button><button class="btn primary lg" data-act="cleanup" id="btn-continue">${s.turn >= s.settings.turns ? "Final results" : `Begin turn ${s.turn + 1}`} →</button></div></div>`;
    },
    gameOver() {
      const s = App.state;
      const w = s.winner;
      const hist = s.history;
      const maxS = Math.max(4, ...hist.map((h) => Math.max(h.score.fourth, h.score.tenth)));
      const minS = Math.min(0, ...hist.map((h) => Math.min(h.score.fourth, h.score.tenth)));
      const W = 520;
      const H = 200;
      const x = (i) => 30 + (i * (W - 70)) / Math.max(1, hist.length);
      const y = (v) => H - 20 - ((v - minS) * (H - 40)) / (maxS - minS || 1);
      const last = hist.length ? hist[hist.length - 1].score : { fourth: 0, tenth: 0 };
      const line = (team, color) => {
        // Final score label, nudged apart when both lines end close together.
        const gap = Math.abs(y(last.fourth) - y(last.tenth)) < 14;
        const ly = y(last[team]) + (gap ? (last[team] >= last[TC.other(team)] ? -8 : 10) : 4);
        return `<polyline fill="none" stroke="${color}" stroke-width="3" points="${[`${x(0)},${y(0)}`].concat(hist.map((h, i) => `${x(i + 1)},${y(h.score[team])}`)).join(" ")}"/>` +
          hist.map((h, i) => `<circle cx="${x(i + 1)}" cy="${y(h.score[team])}" r="4" fill="${color}"><title>${TC.TEAM_INFO[team].name}, turn ${h.turn}: ${h.score[team]}</title></circle>`).join("") +
          `<text x="${x(hist.length) + 8}" y="${ly}" fill="${color}" font-size="13" font-weight="700">${last[team]}</text>`;
      };
      // Par: what the AI averages with the human player's army (one human only).
      const solo = App.humans().length === 1 ? App.humans()[0] : null;
      const parVals = solo && TC.BASELINE ? hist.map((h) => TC.BASELINE.armies[solo].par[Math.min(h.turn, TC.BASELINE.turns) - 1]) : null;
      const parLine = parVals ? `<polyline fill="none" stroke="#f3c768" stroke-width="2" stroke-dasharray="5 4" points="${[`${x(0)},${y(0)}`].concat(parVals.map((v, i) => `${x(i + 1)},${y(Math.min(maxS, v))}`)).join(" ")}"><title>AI par for ${TC.TEAM_INFO[solo].name}</title></polyline>` : "";
      const parEnd = parVals ? parVals[parVals.length - 1] : null;
      const parNote = parVals ? `<div class="muted" style="font-size:12.5px;margin-top:4px"><span class="gold">- - -</span> Par: the AI playing ${TC.TEAM_INFO[solo].name} averages <b>${parEnd}</b> after ${hist.length} turns. You scored <b>${last[solo]}</b> (${last[solo] - parEnd >= 0 ? "+" : "−"}${Math.abs(Math.round((last[solo] - parEnd) * 10) / 10)}).</div>` : "";
      const ticks = [minS, Math.round((minS + maxS) / 2), maxS].filter((v, i, a) => a.indexOf(v) === i);
      const grid = ticks.map((v) => `<line x1="30" x2="${W - 30}" y1="${y(v)}" y2="${y(v)}" stroke="#26313b" stroke-dasharray="3 4"/><text x="24" y="${y(v) + 4}" fill="#93a1ad" font-size="11" text-anchor="end">${v}</text>`).join("");
      const rows = hist
        .map((h) => `<tr><td>${h.turn}</td>${h.crisis.map((c) => `<td><span class="chip ct-${c.type}" style="color:#fff;border:0">${c.type}</span> ${c.winner ? `<span class="${c.winner === "fourth" ? "c4" : "c10"}">${TC.TEAM_INFO[c.winner].short}</span>` : "tie"}</td>`).join("")}<td>${h.score.fourth}–${h.score.tenth}</td></tr>`)
        .join("");
      return `<div class="stage endstage" style="max-width:1000px"><div class="kicker">After-action review</div><h1>${w ? TC.TEAM_INFO[w].name.toUpperCase() + " WINS" : "DRAW"}</h1>
        <p style="font-size:20px"><b class="c4">${s.teams.fourth.score}</b> — <b class="c10">${s.teams.tenth.score}</b></p>
        <div class="endgrid"><div><div class="chartlegend"><span class="c4">● Fourth Army</span><span class="c10">● Tenth Army</span><span class="muted">score after each turn</span></div><svg class="chart" viewBox="0 0 ${W} ${H}">${grid}<line x1="30" x2="${W - 30}" y1="${y(0)}" y2="${y(0)}" stroke="#3a4651"/>${line("fourth", "#5aa2ff")}${line("tenth", "#ff9f5a")}
          ${hist.map((h, i) => `<text x="${x(i + 1)}" y="${H - 4}" fill="#93a1ad" font-size="11" text-anchor="middle">T${h.turn}</text>`).join("")}${parLine}</svg>
          ${parNote}
          </div><div><table class="hist"><tr><th>Turn</th><th>Zone A</th><th>Zone B</th><th>Zone C</th><th>Score</th></tr>${rows}</table>${K.crisisLegend()}</div></div>
        ${TC.endAnalysis ? TC.endAnalysis(s) : ""}
        <div class="btn-row" style="justify-content:center;margin-top:20px"><button class="btn" data-act="title">Main menu</button><button class="btn" data-act="score">Score breakdown</button><button class="btn" data-act="export-log">📜 Adjudicator log</button><button class="btn" data-act="export-record">📊 Campaign record</button><button class="btn" data-act="export">💾 Download save file</button><button class="btn primary lg" data-act="setup">New campaign</button></div></div>`;
    },
    menu() {
      return `<div class="modal narrow"><div class="modal-head"><h2>Menu</h2><button class="btn ghost x" data-act="overlay-close">✕</button></div>
        <div class="modal-body"><div class="col" style="display:flex;flex-direction:column;gap:8px">
          <button class="btn" data-act="codex">📖 Rules Codex</button>
          ${Object.values(App.state.controllers).includes("remote") ? '<button class="btn" data-act="online">🌐 Online play: invite or reconnect</button>' : ""}
          <button class="btn" data-act="tabletop"><svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true" style="vertical-align:-2px"><g fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1" y="1" width="11" height="11" rx="1.5"/><path d="M1 5h11M1 8.5h11M5 1v11M8.5 1v11"/></g></svg>&nbsp; Table view (how it looks on the real table)</button>
          <button class="btn" data-act="export">💾 Download save file</button>
          <button class="btn" data-act="import">📂 Load save file</button>
          <button class="btn" data-act="export-log" title="Every adjudicator log line as a spreadsheet (CSV): turn, phase, army, text">📜 Export adjudicator log (spreadsheet)</button>
          <button class="btn" data-act="export-record" title="The whole campaign as structured data (JSON) for analysis: settings, every turn's tasks, crises, scores and trackers, plus the log">📊 Export campaign record (data)</button>
          ${App.state.tutorial ? "" : '<button class="btn" data-act="saves">🗂 Saved campaigns (slots)</button>'}
          <button class="btn" data-act="sound-toggle">${App.soundOn() ? "🔊 Sound: on" : "🔇 Sound: off"}</button>
          <button class="btn" data-act="tips-toggle">💡 First-time tips: ${App.tipsOn() ? "on" : "off"}</button>
          <button class="btn" data-act="marks-toggle" title="Adds arrows and shapes so nothing depends on telling red from green or blue from orange">◐ Colour-blind marks: ${App.marksOn() ? "on" : "off"}</button>
          ${App.state.tutorial ? '<button class="btn" data-act="tutorial-exit">Leave tutorial</button>' : ""}
          <button class="btn danger" data-act="title">Quit to main menu (autosaved)</button></div>
          <p class="muted" style="font-size:12px;margin-top:12px">Seed ${App.state.seed} · Campaign autosaves in this browser after every action. Clearing the browser's data erases it, so download a save file if the campaign matters.</p></div></div>`;
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
        TC.TEAMS.forEach((t) => App.isAI(t) && !E.asosComplete(s, t) && AI.allocateAsos(s, t));
        if (TC.TEAMS.every((t) => E.asosComplete(s, t)) && (humans.length === 0 || App.ui.asosConfirmed) && mayAdvance()) {
          App.ui.asosConfirmed = false;
          E.beginPlanning(s);
          App.save();
          App.render();
          App.flow();
        } else {
          // Hot-seat: show a hand-off screen whenever ASOS passes to the other commander.
          const key = `${s.turn}:${App.me()}`;
          if (humans.length === 2 && App.ui.asosHandoff !== key) {
            App.ui.asosHandoff = key;
            App.ui.curtain = App.me();
          }
          App.render();
        }
        break;
      case "planning": {
        TC.TEAMS.forEach((t) => App.isAI(t) && !s.plans[t].ready && AI.plan(s, t));
        if (E.bothReady(s) && mayAdvance()) {
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
            if (App.state !== s) return;
            App.ui.toasts = [];
            E.beginCrisis(s);
            App.save();
            App.render();
            App.flow();
          }
          return;
        }
        if (App.isAI(s.impl.active)) {
          App.ui.busy = true;
          await pace(900);
          App.ui.busy = false;
          if (App.state !== s) return App.flow(); // e.g. the player used Undo meanwhile
          const res = AI.takeInitiative(s, s.impl.active);
          if (res) taskToast(res);
          App.save();
          App.render();
          App.flow();
        } else if (App.isHuman(s.impl.active)) App.ui.lastMe = s.impl.active;
        break;
      case "crisis":
        TC.crisisUI && TC.crisisUI.auto();
        break;
      case "tailoring":
        if (!s.tailoring && mayAdvance()) {
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
    App.sfx && App.sfx("roll");
    const s = App.state;
    await K.sleep(900);
    App.ui.rolling = false;
    App.ui.busy = false;
    if (App.state !== s) return; // the player left this game mid-roll
    const res = E.rollTaskLimit(s);
    if (!res) return App.render();
    App.ui.overlay = { type: "limitResult", roll: res.roll, limit: res.limit, asos: res.asos };
    App.save();
    App.render();
    if (!App.humans().length) {
      await K.sleep(1400 * App.speed());
      if (App.state !== s) return;
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
    App.sfx && App.sfx("roll");
    await K.sleep(1000);
    App.ui.busy = false;
    if (App.state !== s) return;
    const res = E.beginImplementation(s);
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
      if (App.state !== s) return;
      App.ui.overlay = null;
      App.render();
      App.flow();
    }
  }

  function taskToast(res) {
    if (!res || res.ok === undefined) return;
    const task = TC.taskByNum(res.num);
    const team = res.team;
    if (App.sfx) {
      const mine = App.isHuman(team) || !App.humans().length;
      App.sfx(!res.ok ? "bad" : res.disrupt && !mine ? "bad" : mine ? "good" : "plan");
    }
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
    if (s.phase === "gameOver" && App.sfx) App.sfx("fanfare");
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
  const taskName = (el) => {
    const t = App.state.plans[App.state.impl.active].tasks.find((x) => x.uid === Number(el.dataset.uid));
    return t ? TC.taskByNum(t.num).name : "task";
  };
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
      if (st.mode === "online") return TC.net.hostSetup({ seed, settings: st.settings, team: st.onlineTeam || "fourth" });
      const controllers = { ai4: { fourth: "human", tenth: "ai" }, ai10: { fourth: "ai", tenth: "human" }, hotseat: { fourth: "human", tenth: "human" }, aiai: { fourth: "ai", tenth: "ai" } }[st.mode];
      App.startGame({ seed, settings: st.settings, controllers });
    },
    continue() {
      const save = App.loadSave();
      if (!save) return;
      R.indexCards();
      App.state = save;
      resetGameUi();
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
    "dock-toggle"() {
      App.ui.dockMin = !App.ui.dockMin;
      App.render();
    },
    glossary() {
      App.ui.overlay = null;
      App.openModal({ type: "codex", tab: "glossary" });
    },
    menu() {
      App.ui.overlay = { type: "menu" };
      App.render();
    },
    export() {
      if (App.humans().length === 2 && App.state.phase === "planning") {
        return App.notify("A save file made now would contain both staffs' secret plans. It is available again once both plans are submitted. The campaign is autosaved in the meantime.", "Not during hot-seat planning");
      }
      const blob = new Blob([App.encodeSave(App.state)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `theatercomplex-turn${App.state.turn}-${App.state.phase}.json`;
      App.ui.exported = true;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    import() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,.tcsave,application/json";
      input.onchange = async () => {
        try {
          App.loadState(App.decodeSave(await input.files[0].text()));
        } catch (e) {
          App.notify("Could not load that file: " + e.message, "Load failed");
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
      TC.planner.open(Number(el.dataset.num), el.dataset.z);
    },
    "suggest-plan"() {
      const s = App.state;
      const me = App.me();
      const before = new Set(s.plans[me].tasks.map((t) => t.uid));
      AI.planTasks(s, me, { noise: 0, limit: s.taskLimit, advisor: true });
      const added = s.plans[me].tasks.filter((t) => !before.has(t.uid));
      App.save();
      App.render();
      if (!added.length) return App.notify(App.whyNotMore(s, me), "Nothing to add");
      if (s.plans[me].tasks.length < s.taskLimit) App.notify(App.whyNotMore(s, me), `${s.taskLimit - s.plans[me].tasks.length} slot${s.taskLimit - s.plans[me].tasks.length > 1 ? "s" : ""} still empty`);
      App.toast(`<div class="t"><b>${added.length} task${added.length > 1 ? "s" : ""} added</b><br>${added.map((t) => `${esc(TC.taskByNum(t.num).name)} (Zone ${t.zone})`).join("<br>")}<br><span class="muted">Click a task in your campaign list to change or remove it.</span></div>`, me, 6000);
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
      const confirming = App.ui.modal && App.ui.modal.type === "confirm";
      if (!s.plans[me].tasks.length && !confirming) {
        return App.confirm({ title: "Submit an empty plan?", body: "You haven't planned any tasks, so your army will do nothing this year.", yes: "Submit anyway", act: "submit" });
      }
      const open = s.taskLimit - s.plans[me].tasks.length;
      if (open > 0 && !confirming && !(TC.tutorial && TC.tutorial.active) && TC.ai.suggestions(s, me, 1).length) {
        return App.confirm({ title: `Submit with ${open} empty task slot${open > 1 ? "s" : ""}?`, body: `You can plan up to ${s.taskLimit} tasks this year and still have cards you could play. "Suggest a plan" fills the empty slots for you.`, yes: "Submit anyway", act: "submit" });
      }
      App.ui.modal = null;
      const r = E.setReady(s, me, true);
      if (!r.ok) {
        App.render();
        return App.notify(r.issues, "Plan not ready");
      }
      App.ui.lastPlanner = me;
      App.save();
      App.render();
      App.flow();
    },
    exec(el) {
      App.checkpoint(`Execute ${taskName(el)}`);
      const r = E.executeTask(App.state, App.state.impl.active, Number(el.dataset.uid), { disrupt: false });
      taskToast(r);
      App.save();
      App.render();
      App.flow();
    },
    "exec-disrupt"(el) {
      App.checkpoint(`Disruption with ${taskName(el)}`);
      const r = E.executeTask(App.state, App.state.impl.active, Number(el.dataset.uid), { disrupt: true });
      taskToast(r);
      App.save();
      App.render();
      App.flow();
    },
    standdown(el) {
      if (!(App.ui.modal && App.ui.modal.type === "confirm")) {
        const t = App.state.plans[App.state.impl.active].tasks.find((x) => x.uid === Number(el.dataset.uid));
        return App.confirm({ title: "Stand this task down?", body: `${t ? TC.taskByNum(t.num).name : "This task"} will not be executed this year. Its Influence and Access costs are refunded, but it has no effect.`, yes: "Stand down", act: "standdown", uid: el.dataset.uid });
      }
      App.ui.modal = null;
      App.checkpoint(`Stand down ${taskName(el)}`);
      App.do(() => E.standDownTask(App.state, App.state.impl.active, Number(el.dataset.uid)));
    },
    spend(el) {
      App.checkpoint(`Spend Influence in Zone ${el.dataset.z}`);
      const r = E.spendInfluence(App.state, App.state.impl.active, el.dataset.z);
      if (!r.ok) App.notify(r.error);
      App.save();
      App.render();
    },
    "to-crisis"() {
      App.ui.toasts = [];
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
    "toast-x"(el) {
      App.ui.toasts = App.ui.toasts.filter((t) => t.id !== el.dataset.id);
      renderToasts();
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
    if (["Tab", "Enter", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) App.ui.kbd = true;
    if (e.key === "Escape" && App.ui.modal) return App.closeModal();
    if (e.key === "Escape") return K.hidePreview();
    const t = e.target;
    // A focused card, chip or zone acts like a button.
    if ((e.key === "Enter" || e.key === " ") && t.getAttribute && t.getAttribute("role") === "button" && !e.repeat) {
      e.preventDefault();
      return t.click();
    }
    // Arrow keys walk along a row of cards.
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && t.parentElement && t.parentElement.classList.contains("hand")) {
      let sib = t;
      do sib = e.key === "ArrowRight" ? sib.nextElementSibling : sib.previousElementSibling;
      while (sib && sib.tabIndex < 0 && !sib.querySelector("[tabindex]"));
      const target = sib && (sib.tabIndex >= 0 ? sib : sib.querySelector("[tabindex]"));
      if (target) {
        e.preventDefault();
        target.focus();
      }
      return;
    }
    if (e.key !== "Enter" || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)) return;
    const btn = App.primaryButton();
    if (btn) {
      e.preventDefault();
      btn.click();
    }
  });
  // The button Enter presses: the tutorial's Next, else the highlighted (or only)
  // primary button of the top-most layer.
  App.primaryButton = function () {
    const tut = document.querySelector('[data-act="tut-next"].primary:not([disabled])');
    if (tut) return tut;
    const layers = ["modal-root", "overlay-root", "app"].map((id) => document.getElementById(id));
    const scope = layers.find((l) => l && l.innerHTML.trim());
    if (!scope) return null;
    const all = [...scope.querySelectorAll(".btn.primary:not([disabled])")].filter((b) => b.offsetParent !== null);
    return all.find((b) => b.classList.contains("pulse")) || (all.length === 1 ? all[0] : null);
  };
  document.addEventListener("mousedown", () => (App.ui.kbd = false), true);
  // Keyboard focus on a card shows the same preview a mouse hover does.
  document.addEventListener("focusin", (e) => {
    if (!App.ui.kbd || !e.target.closest) return;
    const src = e.target.closest("[data-inspect],[data-art]");
    if (src) src.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    else K.hidePreview();
  });
  window.addEventListener("resize", () => App.ui.screen === "game" && renderToasts());
  // The mouse wheel scrolls the hand of task cards sideways.
  document.addEventListener(
    "wheel",
    (e) => {
      const hand = e.target.closest && e.target.closest(".hand, .handfilters");
      if (!hand || hand.scrollWidth <= hand.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      hand.scrollLeft += e.deltaY;
      e.preventDefault();
    },
    { passive: false }
  );

  App.init = function () {
    R.indexCards();
    K.installPreview();
    App.render();
  };
})();
