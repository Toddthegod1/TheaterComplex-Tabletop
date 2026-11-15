// Online play for two people on two computers.
//
// The browsers talk to each other directly (WebRTC data channel). There is no
// game server: the host makes an invite code, the guest answers with a reply
// code, and the two are exchanged by any chat or email. A public STUN server
// is asked only "what is my address?" so the browsers can find a route; game
// data never goes through it.
//
// Who decides what:
//  - The host advances the game (task-limit roll, moving between phases,
//    crisis rolls, force tailoring), so the dice are only ever rolled once.
//  - Each player changes only their own army. During ASOS both work at once
//    and exchange just their own army's part. During planning nothing is sent
//    but "I have submitted"; the plans are exchanged only after both have
//    submitted, so neither browser holds the other's plan while it can still
//    be changed.
//  - In implementation and crisis one side acts at a time and sends the whole
//    game state after each action.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = TC.rules;
  const E = TC.engine;
  const K = TC.kit;
  const esc = K.esc;
  const App = TC.app;
  const M = (TC.modals = TC.modals || {});
  const A = (TC.modalActions = TC.modalActions || {});

  const Net = (TC.net = { active: false, host: false, team: null, status: "off", pending: null, key: "", readySent: false, planSent: "", gotPlan: "", applying: false });
  const ICE = [{ urls: "stun:stun.l.google.com:19302" }];
  let pc = null;
  let ch = null;

  // ---------------------------------------------------------------- codes
  // Invite and reply codes are the connection description, squeezed and
  // written in letters and digits so they survive being pasted into a chat.
  const b64 = {
    enc: (bytes) => {
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    dec: (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
  };
  async function pipe(bytes, stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function pack(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === "undefined") return "TC0." + b64.enc(raw);
    return "TC1." + b64.enc(await pipe(raw, new CompressionStream("deflate-raw")));
  }
  async function unpack(code) {
    const text = String(code || "").replace(/\s+/g, "");
    const kind = text.slice(0, 4);
    if (kind !== "TC0." && kind !== "TC1.") throw new Error("That is not a TheaterComplex code. Copy the whole code, starting with TC.");
    let bytes = b64.dec(text.slice(4));
    if (kind === "TC1.") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // ---------------------------------------------------------------- connection
  function hangUp() {
    try {
      if (ch) ch.onclose = null;
      if (pc) pc.onconnectionstatechange = null;
      if (ch) ch.close();
      if (pc) pc.close();
    } catch (e) {
      /* already closed */
    }
    ch = pc = null;
  }
  function newPeer() {
    hangUp();
    pc = new RTCPeerConnection({ iceServers: ICE });
    const mine = pc;
    pc.onconnectionstatechange = () => {
      if (pc === mine && ["failed", "disconnected", "closed"].includes(mine.connectionState)) dropped();
    };
    return pc;
  }
  // Wait until the browser has listed the ways it can be reached.
  const gathered = (p) =>
    new Promise((resolve) => {
      if (p.iceGatheringState === "complete") return resolve();
      const done = () => p.iceGatheringState === "complete" && resolve();
      p.addEventListener("icegatheringstatechange", done);
      setTimeout(resolve, 5000);
    });
  function wire(channel) {
    ch = channel;
    const parts = {};
    ch.onopen = () => opened();
    ch.onclose = () => ch === channel && dropped();
    ch.onmessage = (e) => {
      // Long messages arrive in numbered pieces.
      const p = JSON.parse(e.data);
      const buf = (parts[p.id] = parts[p.id] || []);
      buf[p.i] = p.d;
      if (buf.filter((x) => x !== undefined).length < p.n) return;
      delete parts[p.id];
      let msg;
      try {
        msg = JSON.parse(buf.join(""));
      } catch (err) {
        return;
      }
      receive(msg);
    };
  }
  Net.open = () => !!(ch && ch.readyState === "open");
  let msgId = 0;
  function send(msg) {
    if (!Net.open()) return false;
    const text = JSON.stringify(msg);
    const size = 12000;
    const n = Math.ceil(text.length / size) || 1;
    const id = ++msgId;
    for (let i = 0; i < n; i++) ch.send(JSON.stringify({ id, i, n, d: text.slice(i * size, (i + 1) * size) }));
    return true;
  }

  Net.hostInvite = async function () {
    const p = newPeer();
    wire(p.createDataChannel("theatercomplex", { ordered: true }));
    await p.setLocalDescription(await p.createOffer());
    await gathered(p);
    return pack({ k: "offer", sdp: p.localDescription.sdp });
  };
  Net.hostAccept = async function (code) {
    const a = await unpack(code);
    if (a.k !== "answer") throw new Error("That is an invite code. Paste the reply code your opponent sent back.");
    if (!pc) throw new Error("Make an invite code first.");
    await pc.setRemoteDescription({ type: "answer", sdp: a.sdp });
  };
  Net.join = async function (code) {
    const o = await unpack(code);
    if (o.k !== "offer") throw new Error("That is a reply code. Paste the invite code the host sent you.");
    const p = newPeer();
    p.ondatachannel = (e) => wire(e.channel);
    await p.setRemoteDescription({ type: "offer", sdp: o.sdp });
    await p.setLocalDescription(await p.createAnswer());
    await gathered(p);
    return pack({ k: "answer", sdp: p.localDescription.sdp });
  };

  // ---------------------------------------------------------------- shared state
  const other = () => TC.other(Net.team);
  const keyOf = (s) => `${s.turn}:${s.phase}`;
  const localize = (s) => (s.controllers = { [Net.team]: "human", [other()]: "remote" });
  const markSent = (s) => (s.log.forEach((l) => (l._s = 1)), (s.events || []).forEach((e) => (e._s = 1)));

  // My army's part of the game: what I am allowed to change.
  function slice(withPlan) {
    const s = App.state;
    const me = Net.team;
    const mine = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v.team === me));
    const lines = s.log.filter((l) => !l._s);
    const events = (s.events || []).filter((e) => !e._s);
    const out = { team: me, alloc: s.asos.alloc[me], teamState: s.teams[me], cards: mine(s.cards), commands: mine(s.commands), uid: s.uid, log: lines.map((l) => Object.assign({}, l)), events: events.map((e) => Object.assign({}, e)) };
    lines.forEach((l) => (l._s = 1));
    events.forEach((e) => (e._s = 1));
    if (withPlan) out.plan = s.plans[me];
    return out;
  }
  function merge(sl) {
    const s = App.state;
    const t = sl.team;
    s.asos.alloc[t] = sl.alloc;
    s.teams[t] = sl.teamState;
    Object.assign(s.cards, sl.cards);
    Object.assign(s.commands, sl.commands);
    s.uid = Math.max(s.uid, sl.uid);
    sl.log.forEach((l) => s.log.push(Object.assign(l, { _s: 1 })));
    (sl.events || []).forEach((e) => (s.events = s.events || []).push(Object.assign(e, { _s: 1 })));
    if (sl.plan) s.plans[t] = sl.plan;
  }
  function sendState() {
    const s = App.state;
    send({ type: "state", state: s });
    markSent(s);
    Net.key = keyOf(s);
  }
  function sendPlanIfLocked() {
    const s = App.state;
    if (Net.host || s.phase !== "planning" || !E.bothReady(s) || Net.planSent === keyOf(s)) return;
    Net.planSent = keyOf(s);
    send({ type: "plan", slice: slice(true) });
  }

  // Called after every local change (App.save is the game's "something changed" hook).
  Net.afterChange = function () {
    const s = App.state;
    if (!Net.active || Net.applying || !s || !Net.open()) return;
    if (keyOf(s) !== Net.key) {
      // The phase moved on (only the host does that): everyone gets the new position.
      Net.readySent = false;
      return sendState();
    }
    if (s.phase === "asos") return send({ type: "slice", slice: slice(false) });
    if (s.phase === "planning") {
      const ready = !!s.plans[Net.team].ready;
      if (ready !== Net.readySent) {
        Net.readySent = ready;
        send({ type: "ready", ready });
      }
      return sendPlanIfLocked();
    }
    sendState();
  };
  // May this browser move the game on to the next step?
  Net.mayAdvance = function () {
    if (!Net.active) return true;
    if (!Net.host || !Net.open()) return false;
    const s = App.state;
    return s.phase !== "planning" || Net.gotPlan === keyOf(s);
  };

  function receive(msg) {
    if (msg.type === "hello") {
      Net.active = true;
      Net.host = false;
      Net.team = msg.team;
      Net.status = "on";
      localize(msg.state);
      markSent(msg.state);
      Net.applying = true;
      try {
        App.loadState(msg.state);
      } finally {
        Net.applying = false;
      }
      Net.key = keyOf(App.state);
      Net.readySent = !!App.state.plans[Net.team].ready;
      App.toast(`<div class="t"><b>Connected</b><br>You command ${TC.TEAM_INFO[Net.team].name}. The host advances the game between phases.</div>`, null, 6000);
      return;
    }
    const s = App.state;
    if (!Net.active || !s) return;
    if (msg.type === "state") {
      const seen = s.log.length;
      const st = msg.state;
      localize(st);
      markSent(st);
      App.state = st;
      if (keyOf(st) !== Net.key) {
        Net.readySent = false;
        // A new step: drop dialogs that belonged to the old one.
        App.ui.modal = null;
        App.ui.crisisAnim = null;
      }
      Net.key = keyOf(st);
      // Tell the player what the other side just did.
      st.log
        .slice(seen)
        .filter((l) => l.team === other() && l.phase === "implementation")
        .slice(-2)
        .forEach((l) => App.toast(`<div class="t"><b>${TC.TEAM_INFO[other()].name}</b><br>${esc(l.text)}</div>`, other(), 5000));
    } else if (msg.type === "slice") merge(msg.slice);
    else if (msg.type === "ready") {
      s.plans[other()].ready = !!msg.ready;
      sendPlanIfLocked();
    } else if (msg.type === "plan" && Net.host) {
      merge(msg.slice);
      Net.gotPlan = keyOf(s);
    } else return;
    App.render();
    App.flow();
  }

  function opened() {
    if (Net.pendingJoin) return; // guest: wait for the host's hello
    // Host: start the campaign that was set up, or carry on with the one in progress.
    if (Net.pending) {
      const p = Net.pending;
      Net.pending = null;
      Net.active = false;
      App.startGame({ seed: p.seed, settings: p.settings, controllers: { [p.team]: "human", [TC.other(p.team)]: "remote" } });
    }
    const s = App.state;
    if (!s) return;
    Net.active = true;
    Net.host = true;
    Net.team = TC.TEAMS.find((t) => s.controllers[t] === "human") || "fourth";
    Net.status = "on";
    Net.gotPlan = "";
    send({ type: "hello", team: other(), state: s });
    markSent(s);
    Net.key = keyOf(s);
    Net.readySent = !!s.plans[Net.team].ready;
    if (App.ui.modal && App.ui.modal.type === "online") App.ui.modal = null;
    App.render();
    App.toast(`<div class="t"><b>Opponent connected</b><br>You command ${TC.TEAM_INFO[Net.team].name} and advance the game between phases.</div>`, null, 6000);
    App.flow();
  }
  function dropped() {
    if (Net.status !== "on") return;
    Net.status = "lost";
    App.render();
    App.notify(Net.host ? "Your opponent's connection dropped. Menu → Online play makes a new invite; the campaign carries on where it stopped." : "The connection to the host dropped. Ask the host for a new invite, then use Join online game on the title screen.", "Connection lost");
  }
  Net.leave = function () {
    hangUp();
    Object.assign(Net, { active: false, host: false, team: null, status: "off", pending: null, pendingJoin: false, key: "" });
  };

  // A small status chip for the top bar.
  Net.chip = function () {
    const s = App.state;
    if (!s || !Object.values(s.controllers).includes("remote")) return "";
    if (Net.status === "on" && Net.open()) return `<span class="chip goodc" title="Connected directly to your opponent's browser. ${Net.host ? "You are the host: you advance the game between phases." : "The host advances the game between phases."}">● Online</span>`;
    return `<span class="chip badc" data-act="online" title="Not connected to your opponent. Click to ${Net.host || !Net.active ? "make a new invite" : "see how to reconnect"}.">● Offline: reconnect</span>`;
  };

  // ---------------------------------------------------------------- what the guest may not press
  const HOST_ONLY = { "roll-limit": App.actions, "asos-done": App.actions, "to-crisis": App.actions, cleanup: App.actions, "cr-roll": TC.crisisUI.actions, "cr-next": TC.crisisUI.actions };
  Object.entries(HOST_ONLY).forEach(([name, table]) => {
    const fn = table[name];
    table[name] = function () {
      if (Net.active && !Net.host) return App.notify("The host presses this one. It moves the game on for both of you.", "Waiting for the host");
      if (Net.active && Net.host && !Net.open()) return App.notify("Your opponent is not connected. Menu → Online play makes a new invite.", "Opponent offline");
      return fn.apply(this, arguments);
    };
  });
  // The game's "something changed" hook.
  const save = App.save;
  App.save = function () {
    if (!(Net.active && !Net.host)) save.apply(this, arguments); // only the host keeps the autosave
    Net.afterChange();
  };
  // Undo would have to un-send moves, so it is off online.
  const checkpoint = App.checkpoint;
  App.checkpoint = function () {
    if (Net.active) return (App.ui.undo = null);
    return checkpoint.apply(this, arguments);
  };
  // Leaving the game hangs up.
  ["title", "setup"].forEach((name) => {
    const fn = App.actions[name];
    App.actions[name] = function () {
      if (Net.active || Net.pending || Net.pendingJoin) Net.leave();
      return fn.apply(this, arguments);
    };
  });

  // ---------------------------------------------------------------- dialogs
  const box = (id, value, ro, ph) => `<textarea id="${id}" class="codebox" rows="4" ${ro ? "readonly" : ""} placeholder="${esc(ph || "")}" spellcheck="false">${esc(value || "")}</textarea>`;
  M.online = function (m) {
    const err = m.error ? `<div class="banner warn">${esc(m.error)}</div>` : "";
    const note = `<p class="muted" style="font-size:12px;margin:12px 0 0">The two browsers connect directly; there is no game server. A public address-lookup (STUN) server is contacted to find a route. Some networks block direct connections; if it never connects, try another network. Planning stays private: plans are only exchanged after both players have submitted.</p>`;
    let body;
    if (m.role === "host") {
      body = `<ol class="steps"><li><b>Send this invite code</b> to your opponent (chat or email).${box("net-invite", m.code || "Making the code…", true)}
          <button class="btn sm" data-act="net-copy" data-from="net-invite" ${m.code ? "" : "disabled"}>Copy invite code</button></li>
        <li><b>Paste the reply code</b> they send back.${box("net-reply", m.reply || "", false, "Paste the reply code here")}
          <button class="btn primary" data-act="net-accept" id="net-accept" ${m.code ? "" : "disabled"}>Connect</button> <span class="muted">${esc(m.note || "")}</span></li></ol>`;
    } else {
      body = `<ol class="steps"><li><b>Paste the invite code</b> the host sent you.${box("net-invite-in", m.invite || "", !!m.code, "Paste the invite code here")}
          ${m.code ? "" : '<button class="btn primary" data-act="net-join" id="net-join">Make my reply code</button>'}</li>
        ${m.code ? `<li><b>Send this reply code back</b> to the host. The game starts when they enter it.${box("net-reply-out", m.code, true)}<button class="btn sm" data-act="net-copy" data-from="net-reply-out">Copy reply code</button> <span class="muted">Waiting for the host…</span></li>` : ""}</ol>`;
    }
    return `<div class="modal" style="width:min(640px,94vw)" id="online"><div class="modal-head"><h2>${m.role === "host" ? "Host an online game" : "Join an online game"}</h2><button class="btn ghost x" data-act="net-cancel">✕</button></div>
      <div class="modal-body">${err}${body}${note}</div></div>`;
  };
  const fail = (e) => {
    if (App.ui.modal && App.ui.modal.type === "online") {
      App.ui.modal.error = e.message || String(e);
      App.render();
    }
  };
  const makeInvite = () =>
    Net.hostInvite()
      .then((code) => {
        if (App.ui.modal && App.ui.modal.type === "online") {
          App.ui.modal.code = code;
          App.render();
        }
      })
      .catch(fail);
  // Host a new campaign (from the setup screen).
  Net.hostSetup = function (opts) {
    Net.leave();
    Net.pending = opts;
    App.openModal({ type: "online", role: "host" });
    makeInvite();
  };
  // Menu / chip: invite again into the campaign in progress, or explain.
  App.actions.online = function () {
    const s = App.state;
    App.ui.overlay = null;
    if (s && Net.active && !Net.host) return App.notify("Ask the host for a new invite code, then use Join online game on the title screen.", "Reconnecting");
    if (!s) return;
    if (!Object.values(s.controllers).includes("remote")) return App.notify("This campaign was not started as an online game. Start one from New Campaign → Play online.", "Not an online game");
    Net.pending = null;
    Net.pendingJoin = false;
    App.openModal({ type: "online", role: "host" });
    makeInvite();
  };
  App.actions["online-join"] = function () {
    Net.leave();
    App.openModal({ type: "online", role: "guest" });
  };
  A["net-join"] = () => {
    const m = App.ui.modal;
    m.invite = document.getElementById("net-invite-in").value;
    m.error = "";
    Net.pendingJoin = true;
    Net.join(m.invite)
      .then((code) => {
        m.code = code;
        App.render();
      })
      .catch((e) => {
        Net.pendingJoin = false;
        fail(e);
      });
  };
  A["net-accept"] = () => {
    const m = App.ui.modal;
    m.error = "";
    m.note = "Connecting…";
    const code = (m.reply = document.getElementById("net-reply").value);
    App.render();
    Net.hostAccept(code)
      .then(() => waitForLink(m))
      .catch((e) => {
        m.note = "";
        fail(e);
      });
  };
  // If the two browsers cannot reach each other, say so instead of waiting forever.
  function waitForLink(m) {
    setTimeout(() => {
      if (Net.open() || App.ui.modal !== m) return;
      m.note = "";
      m.error = "The two browsers could not reach each other. This usually means one of the networks blocks direct connections (common on work, school and military networks). Try again with a new invite, or have one player use another network such as a phone hotspot.";
      m.code = "";
      App.render();
      makeInvite();
    }, 25000);
  }
  A["net-copy"] = (el) => {
    const t = document.getElementById(el.dataset.from);
    t.select();
    const done = () => (el.textContent = "Copied ✓");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, () => document.execCommand("copy") && done());
    else if (document.execCommand("copy")) done();
  };
  A["net-cancel"] = () => {
    if (!Net.active) Net.leave();
    App.closeModal();
  };
})();
