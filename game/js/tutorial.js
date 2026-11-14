// Guided tutorial: a real game (Fourth Army vs AI) with a coach that
// spotlights the UI and advances when the player completes each action.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const E = TC.engine;
  const App = TC.app;
  const esc = TC.kit.esc;

  const SEED = 20241;
  const S = () => App.state;
  const modalType = () => App.ui.modal && App.ui.modal.type;
  const crisisCur = () => S().crisis && S().crisis.current;

  const STEPS = [
    { title: "Welcome, Commander", board: true, body: "<p>You command <b class='c4'>Fourth Army</b>, a Theater Army in Europe. Across the table, an AI commands <b class='c10'>Tenth Army</b>.</p><p>Each turn is one year. You plan a campaign of tasks, execute it, then find out whether your preparations deter, or win, a crisis in each of the three zones.</p>", next: true },
    { title: "The score", board: true, target: ".scorebox", body: "<p>Points come mostly from <b>winning crises</b> in each zone. You also gain from higher Influence, and lose for over-tasking your commands.</p><p>Your Influence (◆) also pays for agreements.</p>", next: true },
    { title: "A zone at a glance", board: true, target: "#zone-B .zone-head", place: "below", body: "<p>Three zones, three columns. Zone A is near your homeland; <b>Zone C is your objective</b>, worth a bonus point when you win it.</p>", next: true },
    { title: "Deterrence & Instability", board: true, target: "#zone-B .faceoff", place: "below", body: "<p>Your capability cards in a zone generate <b>Deterrence</b>, which sets the size of your main die (d4 → d12).</p><p>The <b>gap</b> between the two armies' deterrence is <b>Instability</b>. The bar below shows how likely each crisis type is: more instability means more violent crises.</p>", next: true },
    { title: "Trackers", board: true, target: "#zone-B .trk", place: "right", body: "<p>Blue pips are yours and orange are Tenth Army's. Each tracker feeds the crisis dice:</p><ul><li><b>Partner Capability / Infrastructure / Interoperability</b> add dice or make them bigger.</li><li><b>Stockage</b> adds a modifier to your dice.</li><li><b>Intel, Comms, Protection</b> give an edge to whoever is higher.</li></ul><p>Hover a label to see the exact breakpoints for this zone.</p>", next: true },
    { title: "Defense readiness", board: true, target: "#zone-B .readiness", place: "right", body: "<p>These are the dice each army would roll if a crisis struck Zone B <b>right now</b>. Your whole campaign is about improving this pool, in the right zones.</p>", next: true },
    { title: "Roll for the task limit", target: "#btn-roll", place: "below", body: "<p>Every turn starts with the adjudicator rolling a d6 for how many tasks each army may plan (minimum 3).</p>", do: "Click <b>Roll for task limit</b>.", when: () => S().phase !== "taskLimit" },
    { title: "Task limit & ASOS", target: "#btn-continue", place: "above", body: "<p>That's your task budget for the year. The brown cards are <b>ASOS</b> requests: the Air Force, Navy and Marines need Army support, and you must supply it before planning.</p>", do: "Click <b>Continue</b>.", when: () => !App.ui.overlay },
    { title: "Support the other Services", target: ".dock", place: "above", body: "<p>Commit capability cards from any zone, at least one of every requested type. They're unavailable for tasks this turn, but they still count for deterrence.</p>", do: "Click <b>Allocate forces</b>, then <b>Auto-select</b> and <b>Commit forces</b>. Repeat for each request.",
      // While the ASOS window is open, point at its next button instead of the bar behind it.
      modalTarget: () => (document.querySelector("#as-confirm:not([disabled])") ? "#as-confirm" : document.querySelector("[data-act='as-auto']:not([disabled])") ? "[data-act='as-auto']" : "[data-act='as-unmet']"), when: () => E.asosComplete(S(), "fourth") && !modalType() },
    { title: "On to planning", target: "[data-act='asos-done']", place: "above", body: "<p>All requests supported.</p>", do: "Click <b>Proceed to planning</b>.", when: () => S().phase === "planning" },
    { title: "Your task cards", target: "#hand", place: "above", body: "<p>These are your 21 task cards. Each shows its <b>effects</b> and cost, and the <b>A B C</b> letters turn green where you can plan it right now. No green letter means a capability or MSC is missing, so you'd need to request it.</p><p>Cards with a gold <b>★</b> are your operations officer's suggestions, with the best zone. Use the filter buttons to find tasks by effect (for example, <b>Intel</b>). Hover a card to see the full art.</p>", next: true },
    { title: "Staff & commands", target: "#boards", place: "left", body: "<p>Every task uses <b>staff</b> slots (left) and <b>MSC</b> slots (right). An MSC's first two tasks are free. A 3rd, 4th or 5th task is <b>over-tasked</b> (red): it needs a d6 roll to succeed and costs you a point.</p>", next: true },
    { title: "Plan a task", target: "#hand", place: "above", body: "<p>Military Engagement (task 12) builds Access, Influence and Partner Capability. Civil Affairs in Zone B can carry it.</p>", do: "Click the <b>Military engagement (12)</b> card, or any card with a green zone letter.", when: () => modalType() === "planner" || S().plans.fourth.tasks.length > 0 },
    { title: "The task planner", target: "#pl-confirm", place: "above", body: "<p>The planner checks every requirement: zone, staff, MSCs and capabilities. It auto-assigns sensible choices, and you can click cards to change them. The left side previews the tracker gains.</p><p>Green dots mark zones where the task is feasible, and <b>★ best</b> marks where it pays off most. The list under the effects tells you what changes for the crisis dice.</p>", do: "Click <b>Add to campaign</b>.", when: () => S().plans.fourth.tasks.length > 0 && modalType() !== "planner" },
    { title: "Build your campaign", target: "#hand", place: "above", body: "<p>Add more tasks, up to your limit. Aim for:</p><ul><li>trackers that <b>flip an advantage</b> (Intel, Comms, Protection) in a zone,</li><li>trackers that cross a <b>die breakpoint</b>,</li><li>your objective, <b>Zone C</b>.</li></ul><p>Not sure? <b>✨ Suggest a plan</b> fills the empty slots for you, and you can still change them.</p>", do: "Plan more tasks, then click <b>Next</b>.", modalTarget: () => "#pl-confirm", next: true },
    { title: "Force management", target: "#btn-forces", place: "above", body: "<p>Tasks need capabilities <b>in the right zone</b>. Force Management lets you request forces from the global pool (RFF, max 10 in theater), move units between zones, and pick RSOI arrivals. Everything arrives at the <b>end</b> of the turn, ready for next year.</p>", do: "Open <b>Force management</b>.", when: () => modalType() === "forces" || S().plans.fourth.ready },
    { title: "Requests for forces", target: ".modal-foot .btn.primary", place: "above", body: "<p>Click a zone letter under a GFM card to request it there. Combat units (0 pts) only add deterrence. Support units also carry capability points for tasks.</p><p>Watch the deterrence gap: closing it lowers Instability, but towering over the enemy raises it.</p>", do: "Request something if you like, then click <b>Done</b>.", when: () => modalType() !== "forces" },
    { title: "Submit the plan", target: "#btn-submit", place: "above", body: "<p>Once you submit, your plan is locked. Tenth Army has been planning in secret too.</p>", do: "Click <b>Submit plan</b>.", when: () => S().plans.fourth.ready },
    { title: "Initiative", target: "#btn-continue", place: "above", body: "<p>Both armies roll a d10; the higher roll plays the first task, then they alternate. Plan-only tasks have already taken effect.</p>", do: "Click <b>Begin execution</b>.", when: () => S().phase === "implementation" && !App.ui.overlay },
    { title: "Execute your tasks", target: ".dock", place: "above", body: "<p>When you hold initiative, execute one task. Its effects hit the trackers immediately. Also worth knowing:</p><ul><li><b>⚡ Disruption</b> (once per turn): subtract a task's effects from the enemy instead.</li><li>Spend <b>3 Influence</b> to cut a zone's Instability by 1.</li></ul>", do: "Execute your tasks until both campaigns are done.", when: () => S().phase === "implementation" && S().impl && S().impl.done },
    { title: "Crisis time", target: "#btn-crisis", place: "above", body: "<p>Every year ends with a crisis in each zone. Let's see whether your preparations hold.</p>", do: "Click <b>Proceed to Crisis Assessment</b>.", when: () => S().phase === "crisis" },
    { title: "Reading the crisis", target: "#crisis .ctable", place: "right", body: "<p>Instability selects a <b>row</b> of the Crisis table and a d10 selects the <b>column</b>, giving Status Quo, Show of Force, Limited Operation or LSCO.</p><p>Violent crises pay more, but the army with <b>higher deterrence loses 3 points</b> for provoking them.</p>", next: true, skipIf: () => S().phase !== "crisis" },
    { title: "Intelligence advantage", target: "#crisis .trays", place: "above", body: "<p>You have more Intelligence here. Before rolling, choose to <b>promote</b> one of your dice or <b>demote</b> one of Tenth Army's.</p>", do: "Click a highlighted die.", skipIf: () => !crisisCur() || crisisCur().stage !== "intel" || crisisCur().intelTeam !== "fourth", when: () => !crisisCur() || crisisCur().stage !== "intel" },
    { title: "Roll the dice", target: "#btn-crisis-roll", place: "above", body: "<p>Both armies roll their Defense Readiness dice. Then Communications and Protection advantages trigger re-rolls.</p>", do: "Click <b>Roll Defense Readiness</b>.", skipIf: () => !crisisCur(), when: () => !crisisCur() || crisisCur().stage === "done" },
    { title: "Scoring the zone", target: "#btn-crisis-next", place: "left", body: "<p>The higher total wins the zone's victor points. Then the deterrence factor rewards or punishes the army with the larger deterrence.</p>", do: "Click <b>Next</b> at the bottom to move through Zones B and C.", skipIf: () => !crisisCur(), when: () => S().phase !== "crisis" },
    { title: "Force tailoring", target: "#btn-continue", place: "above", body: "<p>SecWar forces rotate home and three new ones arrive. Your RFF lands and zone transfers happen. On even years, Assurance and Interoperability decay, so you must keep investing in them.</p>", do: "Click to begin the next turn.", when: () => S().phase !== "tailoring" },
    { title: "You're ready", body: "<p>That's a full year of TheaterComplex. You can keep playing this short campaign, or start a full one: hot-seat against a colleague, or against the AI.</p><p>The <b>📖 Rules</b> button opens the Codex any time, including every task card and the die legend.</p>", finish: true },
  ];

  // Chapters group the steps (by index into STEPS) for the progress header.
  const CHAPTERS = [
    { name: "The board", from: 0 },
    { name: "Turn start & ASOS", from: 6 },
    { name: "Planning", from: 10 },
    { name: "Execution", from: 18 },
    { name: "Crisis Assessment", from: 21 },
    { name: "Wrap-up", from: 25 },
  ];
  const chapterOf = (i) => CHAPTERS.reduce((c, ch, k) => (i >= ch.from ? k : c), 0);

  // "Show me": performs the step's action for a stuck player.
  const R = TC.rules;
  // Do whatever the current crisis zone is waiting for (intel choice, roll, next).
  function advanceCrisis() {
    const s = S();
    const cur = crisisCur();
    if (!cur) return;
    if (cur.stage === "intel" && cur.intelTeam === "fourth") {
      E.chooseIntel(s, "fourth", TC.ai.intelChoice(s, "fourth"));
      App.render();
      App.flow();
    } else if (cur.stage === "ready") TC.crisisUI.actions["cr-roll"]();
    else if (cur.stage === "done") TC.crisisUI.actions["cr-next"]();
  }
  const SHOW_ME = {
    "Roll for the task limit": () => App.actions["roll-limit"](),
    "Task limit & ASOS": () => App.actions["overlay-close"](),
    "Support the other Services": () => {
      const s = S();
      s.asos.current.forEach((aid) => {
        if (s.asos.alloc.fourth[aid]) return;
        const ids = R.autoAsos(E.asosAvailable(s, "fourth", aid), TC.ASOS_BY_ID[aid]);
        if (ids) E.allocateAsos(s, "fourth", aid, ids);
        else E.declareAsosUnmet(s, "fourth", aid);
      });
      App.ui.modal = null;
      App.render();
    },
    "On to planning": () => App.actions["asos-done"](),
    "Plan a task": () => {
      const s = S();
      const ok = (num) => TC.ZONES.some((z) => E.evaluateTask(s, "fourth", { num, zone: z }).ok);
      TC.planner.open(ok(12) ? 12 : TC.TASKS.find((t) => !t.branches && ok(t.num)).num);
    },
    "The task planner": () => TC.modalActions["pl-confirm"](),
    "Force management": () => App.actions.forces(),
    "Requests for forces": () => App.closeModal(),
    "Submit the plan": () => App.actions.submit(),
    Initiative: () => App.actions["overlay-close"](),
    "Execute your tasks": () => {
      const s = S();
      const t = s.impl && s.impl.active === "fourth" && E.remainingTasks(s, "fourth")[0];
      if (t) App.actions.exec({ dataset: { uid: String(t.uid) } });
    },
    "Crisis time": () => App.actions["to-crisis"](),
    "Intelligence advantage": () => {
      const s = S();
      E.chooseIntel(s, "fourth", TC.ai.intelChoice(s, "fourth"));
      App.render();
      App.flow();
    },
    "Roll the dice": () => advanceCrisis(),
    "Scoring the zone": () => advanceCrisis(),
    "Force tailoring": () => App.actions.cleanup(),
  };

  // view: null while following along; a step index while reviewing earlier steps.
  const T = (TC.tutorial = { active: false, i: 0, view: null });

  T.start = function () {
    T.active = true;
    T.i = 0;
    T.view = null;
    App.startGame({ seed: SEED, tutorial: true, settings: { turns: 2, aiSpeed: 1.2, planTimerMinutes: 0 }, controllers: { fourth: "human", tenth: "ai" } });
  };
  T.stop = function () {
    T.active = false;
    T.view = null;
    document.getElementById("coach-root").innerHTML = "";
  };

  function current() {
    while (T.i < STEPS.length && STEPS[T.i].skipIf && STEPS[T.i].skipIf()) T.i++;
    return STEPS[T.i];
  }

  T.update = function () {
    if (!T.active || !App.state || !App.state.tutorial) return;
    let st = current();
    let guard = 0;
    while (st && st.when && st.when() && guard++ < 10) {
      T.i++;
      st = current();
    }
    if (T.view !== null && T.view >= T.i) T.view = null;
    requestAnimationFrame(draw);
  };

  T.next = function () {
    if (T.view !== null) {
      T.view++;
      if (T.view >= T.i) T.view = null;
      return requestAnimationFrame(draw);
    }
    T.i++;
    App.render();
  };
  T.back = function () {
    const from = T.view === null ? T.i : T.view;
    T.view = Math.max(0, from - 1);
    requestAnimationFrame(draw);
  };
  T.resume = function () {
    T.view = null;
    requestAnimationFrame(draw);
  };
  T.showMe = async function () {
    const st = current();
    const target = st && st.target && document.querySelector(st.target);
    if (target) {
      target.classList.add("hint-pulse");
      await TC.kit.sleep(650);
      target.classList.remove("hint-pulse");
    }
    const fn = st && SHOW_ME[st.title];
    if (fn && current() === st) fn();
  };

  // While touring the board, keep the turn-start stage out of the way.
  T.holdOverlay = () => T.active && !!App.state && App.state.tutorial && !!(current() || {}).board;

  function draw() {
    const root = document.getElementById("coach-root");
    const reviewing = T.view !== null;
    const st = reviewing ? STEPS[T.view] : current();
    if (!T.active || !st) {
      root.innerHTML = "";
      return;
    }
    const idx = STEPS.indexOf(st);
    let target = st.target ? document.querySelector(st.target) : null;
    // A window (modal or overlay) on top of the target would be darkened by the
    // spotlight. Point at something inside that window instead, or at nothing.
    const layer = document.querySelector("#modal-root .veil") || document.querySelector("#overlay-root .veil");
    const covered = !!layer && (!target || !layer.contains(target));
    if (covered) {
      const sel = st.modalTarget && st.modalTarget();
      const inner = sel && layer.querySelector(sel);
      target = inner || null;
    }
    const r = target ? target.getBoundingClientRect() : null;
    const visible = r && r.width > 0 && r.height > 0;
    const ch = chapterOf(idx);
    const chapters = CHAPTERS.map((c, k) => `<i class="${k < ch ? "done" : k === ch ? "now" : ""}" title="${esc(c.name)}"></i>`).join("");
    const pct = Math.round(((idx + 1) / STEPS.length) * 100);
    let foot;
    if (st.finish && !reviewing) {
      foot = `<button class="btn sm ghost" data-act="tut-back">← Back</button><span class="sp"></span><button class="btn sm" data-act="tut-keep">Keep playing</button><button class="btn sm primary" data-act="setup">Full campaign</button>`;
    } else if (reviewing) {
      foot = `<button class="btn sm ghost" data-act="tut-back" ${idx === 0 ? "disabled" : ""}>← Back</button><button class="btn sm ghost" data-act="tut-next">Forward →</button><span class="sp"></span><button class="btn sm primary" data-act="tut-resume">Return to current step</button>`;
    } else {
      const canShow = !!st.do && (SHOW_ME[st.title] || visible);
      foot = `<button class="btn sm ghost" data-act="tut-back" ${idx === 0 ? "disabled" : ""}>← Back</button><span class="sp"></span>
        ${canShow ? '<button class="btn sm" data-act="tut-show" title="Do this step for me">👉 Show me</button>' : ""}
        ${st.next ? '<button class="btn sm primary" data-act="tut-next">Next →</button>' : ""}
        <button class="btn sm ghost" data-act="tut-skip" title="Hide the coach and play on">Skip</button>`;
    }
    const doLine = st.do ? `<div class="do ${reviewing ? "done" : ""}">${reviewing ? "✔ " : "▶ "}${st.do}</div>` : "";
    root.innerHTML = `${visible ? `<div class="spot ${layer ? "light" : ""}" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>` : ""}
      <div class="coach ${reviewing ? "reviewing" : ""}" style="left:0;top:0;visibility:hidden">
        <div class="chead"><span class="k">Chapter ${ch + 1} of ${CHAPTERS.length} · ${esc(CHAPTERS[ch].name)}</span><span class="k">${idx + 1} / ${STEPS.length}</span></div>
        <div class="cprog"><b style="width:${pct}%"></b></div><div class="cchap">${chapters}</div>
        ${reviewing ? '<div class="revtag">Reviewing an earlier step</div>' : ""}
        <h3>${esc(st.title)}</h3><div class="b">${st.body}</div>${doLine}<div class="f">${foot}</div></div>`;
    const coach = root.querySelector(".coach");
    const pos = placeCoach(coach.offsetWidth, coach.offsetHeight, visible ? r : null, st.place || "right");
    coach.style.left = `${pos.left}px`;
    coach.style.top = `${pos.top}px`;
    coach.style.visibility = "visible";
  }

  // Put the coach next to its target without ever covering it: try the
  // preferred side, then the others, then the viewport corners.
  function placeCoach(w, h, r, preferred) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const m = 12;
    const clampX = (x) => Math.max(m, Math.min(x, vw - w - m));
    const clampY = (y) => Math.max(m, Math.min(y, vh - h - m));
    if (!r) return { left: clampX((vw - w) / 2), top: clampY((vh - h) / 2) };
    const cx = r.left + r.width / 2 - w / 2;
    const cy = r.top + r.height / 2 - h / 2;
    const sides = {
      below: { left: clampX(cx), top: r.bottom + 16 },
      above: { left: clampX(cx), top: r.top - 16 - h },
      right: { left: r.right + 16, top: clampY(cy) },
      left: { left: r.left - 16 - w, top: clampY(cy) },
    };
    const order = [preferred, "below", "above", "right", "left"].filter((k, i, a) => sides[k] && a.indexOf(k) === i);
    const fits = (p) => p.left >= m && p.top >= m && p.left + w <= vw - m && p.top + h <= vh - m;
    const overlap = (p) => {
      const x = Math.max(0, Math.min(p.left + w, r.right + 8) - Math.max(p.left, r.left - 8));
      const y = Math.max(0, Math.min(p.top + h, r.bottom + 8) - Math.max(p.top, r.top - 8));
      return x * y;
    };
    for (const k of order) if (fits(sides[k]) && !overlap(sides[k])) return sides[k];
    const corners = [
      { left: vw - w - m, top: vh - h - m },
      { left: m, top: vh - h - m },
      { left: vw - w - m, top: 60 },
      { left: m, top: 60 },
    ].map((p) => ({ left: clampX(p.left), top: clampY(p.top) }));
    return corners.sort((a, b) => overlap(a) - overlap(b))[0];
  }

  window.addEventListener("resize", () => T.active && requestAnimationFrame(draw));
  document.addEventListener("scroll", () => T.active && requestAnimationFrame(draw), true);

  Object.assign(TC.modalActions, {
    "tut-next": () => T.next(),
    "tut-back": () => T.back(),
    "tut-resume": () => T.resume(),
    "tut-show": () => T.showMe(),
    "tut-skip": () => {
      T.stop();
      App.render();
    },
    "tut-keep": () => {
      T.stop();
      App.render();
    },
  });
})();
