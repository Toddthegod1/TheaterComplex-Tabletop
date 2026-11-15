// Table view: the current position drawn as it would look on the physical
// table, using the printed mats and tracker cards. Read-only.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = TC.rules;
  const E = TC.engine;
  const K = TC.kit;
  const esc = K.esc;
  const App = TC.app;
  const M = (TC.modals = TC.modals || {});
  const A = (TC.modalActions = TC.modalActions || {});

  // Where the value boxes sit on every tracker card, in % of the card (x, y).
  const BOX = { 1: [10.2, 84.6], 2: [10.2, 62.2], 3: [10.2, 38.1], 4: [10.2, 15.2], 5: [32.2, 15.2], 6: [55.0, 15.2], 7: [77.6, 15.2] };
  // Tracker cards in the order they are laid out on the table (3 x 3).
  const ARRAY = [
    ["deterrence", "deterrence", "Deterrence"],
    ["assurance", "assurance", "Assurance"],
    ["partnerCap", "partnerCapab", "Partner Capability"],
    ["infrastructure", "infrastructure", "Infrastructure Capacity"],
    ["interop", "partnerInterop", "Partner Interoperability"],
    ["stockage", "stockage", "Stockage Levels"],
    ["intel", "intelligence", "Intelligence"],
    ["comms", "communications", "Communications"],
    ["protection", "protection", "Protection"],
  ];
  const PREFIX = { fourth: "4a", tenth: "10a" };
  const at = (x, y, extra = "") => `style="left:${x}%;top:${y}%;${extra}"`;
  const disc = (team, x, y, title, label = "") => `<span class="tt-marker ${team === "fourth" ? "black" : "white"}" ${at(x, y)} title="${esc(title)}">${label}</span>`;

  // One tracker card with a black (Fourth) and a white (Tenth) marker.
  function trackerCard(s, zone, key, file, label) {
    const val = (team) => (key === "deterrence" ? R.deterrence(s, team, zone) : s.teams[team].zones[zone][key]);
    const box = (v) => (key === "deterrence" ? R.clamp(v - 3, 1, 7) : R.clamp(v, 1, 7));
    const v4 = val("fourth");
    const v10 = val("tenth");
    const same = box(v4) === box(v10);
    const mark = (team, v) => {
      const [x, y] = BOX[box(v)];
      const off = same ? (team === "fourth" ? -2.2 : 2.2) : 0;
      // Deterrence runs 4-10 on the card; outside that the marker carries the number.
      const outside = key === "deterrence" && (v < 4 || v > 10) ? v : "";
      return disc(team, x + off, y + (same ? (team === "fourth" ? -2 : 2) : 0), `${TC.TEAM_INFO[team].name}: ${label} ${v}`, outside);
    };
    return `<div class="tt-card" title="${esc(label)}: Fourth Army ${v4}, Tenth Army ${v10}"><img src="img/trackers/tracker_${file}_zone${zone}.webp" alt="${esc(label)}" loading="lazy">${mark("fourth", v4)}${mark("tenth", v10)}</div>`;
  }

  // A capability mat with the army's cards in their category columns.
  function mat(s, team, zone) {
    const ids = R.capsInZone(s, team, zone);
    const centre = { 1: 12.5, 2: 37.5, 3: 62.5, 4: 87.3 };
    let cards = "";
    [1, 2, 3, 4].forEach((cat) => {
      const col = ids.filter((id) => R.cap(id).cat === cat).sort((a, b) => R.cap(b).points - R.cap(a).points);
      const per = col.length > 8 ? 3 : 2;
      const w = per === 3 ? 6.6 : 9.2; // card width in % of the mat
      const h = w * 1.4 * (900 / 540); // card height in % of the mat height
      const rows = Math.ceil(col.length / per);
      const step = rows > 1 ? Math.min(h + 1.5, (61 - h) / (rows - 1)) : 0;
      col.forEach((id, i) => {
        const c = R.cap(id);
        const st = s.cards[id];
        const r = Math.floor(i / per);
        const k = i % per;
        const x = centre[cat] + (k - (per - 1) / 2) * (w + 1);
        const sideways = st.status === "asos" || st.status === "used";
        cards += `<img class="tt-cap ${sideways ? "side" : ""}" src="${c.art}" data-art="${c.art}" alt="" loading="lazy" ${at(x, 35 + r * step, `width:${w}%;z-index:${r + 1}`)} title="${esc(c.name)}: ${c.points ? c.points + " pts" : "combat unit"}${sideways ? " (committed this turn: turned sideways)" : ""}">`;
      });
    });
    const br = R.deterrenceBreakdown(s, team, zone);
    const totals = br.parts.map((p) => `<span class="tt-total" ${at(centre[p.cat] + (p.cat === 4 ? 7.8 : 7.4), 16.5)} title="Category ${p.cat}: ${p.count} cards give +${p.value} deterrence">${p.value}</span>`).join("");
    return `<div class="tt-mat"><img src="img/mats/${PREFIX[team]}_mats_zone${zone}.webp" alt="${TC.TEAM_INFO[team].name} Zone ${zone} capability mat" loading="lazy">${totals}${cards}</div>`;
  }

  // The Defense Readiness mat with the dice the army would roll right now.
  function readiness(s, team, zone) {
    const p = R.readiness(s, team, zone);
    const die = (d, x, y) => `<span class="tt-die" ${at(x, y)}>${K.die(d.sides, { size: 30, title: `${d.src}: d${d.sides}` })}</span>`;
    // The two armies' mats are laid out differently. Spots are the printed dice
    // boxes (approximate: the number of boxes varies a little from zone to zone).
    const spots =
      team === "fourth"
        ? { Deterrence: [[11.5, 75.4]], Infrastructure: [[69, 75.4], [69, 82.4], [69, 89.3], [86, 82.4]], "Partner Capability": [[14.1, 31]], Interoperability: [[69, 34.1], [69, 41.1], [86, 37.6]] }
        : { Deterrence: [[61.5, 30.6]], Infrastructure: [[17.5, 27.2], [17.5, 34.1], [17.5, 41.1], [17.5, 48]], "Partner Capability": [[66.5, 76.8]], Interoperability: [[17.5, 79], [17.5, 86], [34, 82.5]] };
    const used = {};
    const dice = p.theater.concat(p.partner).map((d) => {
      const n = (used[d.src] = (used[d.src] || 0) + 1);
      const spot = (spots[d.src] || [[50, 50]])[n - 1] || [50, 50];
      return die(d, spot[0], spot[1]);
    });
    const drm = p.drm ? `<span class="tt-drm" ${at(50, 96)} title="Stockage modifier on each Theater Army die">${p.drm > 0 ? "+" : ""}${p.drm} each</span>` : "";
    return `<div class="tt-ready" title="${TC.TEAM_INFO[team].name}: Defense Readiness dice for Zone ${zone}"><img src="img/mats/${PREFIX[team]}_mats_defRdns_zone${zone}.webp" alt="" loading="lazy">${dice.join("")}${drm}</div>`;
  }

  // This turn's task cards for one army in one zone. Unplayed cards stay face
  // down unless they are the viewer's own.
  function tasks(s, team, zone) {
    const humans = App.humans();
    const mine = humans.length === 0 || (humans.length === 1 && humans[0] === team);
    const list = s.plans[team].tasks.filter((t) => t.zone === zone);
    if (!list.length) return "";
    return `<div class="tt-tasks">${list
      .map((t) => {
        const task = TC.taskByNum(t.num);
        const shown = t.status !== "planned" || mine;
        if (!shown) return `<span class="tt-task down" title="${TC.TEAM_INFO[team].name}: a task card, face down until it is played"></span>`;
        const art = task.art[team][t.status === "done" ? "back" : "front"];
        return `<img class="tt-task ${t.status}" src="${art}" data-art="${art}" alt="" title="${esc(task.name)}${t.status === "done" ? " (executed: flipped to its effects side)" : t.status === "failed" ? " (failed)" : t.disrupt ? " (played as Disruption)" : " (planned)"}">`;
      })
      .join("")}</div>`;
  }

  function zoneView(s, zone) {
    const side = (team) => `<div class="tt-side ${K.teamCls(team)}"><div class="tt-h">${K.teamChip(team)} <span class="muted">Deterrence ${R.deterrence(s, team, zone)} · Access ${s.teams[team].access[zone]}</span></div>${mat(s, team, zone)}
      <div class="tt-under">${readiness(s, team, zone)}<div><div class="tt-lab">Task cards played here</div>${tasks(s, team, zone) || '<div class="faint" style="font-size:12px">none this turn</div>'}</div></div></div>`;
    const inst = R.instabilityBreakdown(s, zone);
    return `<div class="tt-zone">${side("fourth")}
      <div class="tt-mid"><div class="tt-h" style="justify-content:center"><b>Zone ${zone} tracker array</b> <span class="muted">Instability ${inst.total}</span></div>
        <div class="tt-array">${ARRAY.map(([key, file, label]) => trackerCard(s, zone, key, file, label)).join("")}</div>
        <div class="tt-legend"><span><i class="tt-marker black"></i> Fourth Army marker</span><span><i class="tt-marker white"></i> Tenth Army marker</span><span>Sideways card = committed this turn</span></div></div>
      ${side("tenth")}</div>`;
  }

  // Points and turn tracker, plus each army's Influence, Access, MSCs and staff.
  function theaterView(s) {
    const px = (n) => 14 + ((n - 1) % 10) * 8;
    const score = (team) => {
      const v = s.teams[team].score;
      const off = s.teams.fourth.score === s.teams.tenth.score ? (team === "fourth" ? -1.6 : 1.6) : 0;
      if (v < 1) return disc(team, (team === "fourth" ? 17.4 : 82.9), 23.5, `${TC.TEAM_INFO[team].name}: ${v} points`, v < 0 ? v : "");
      const n = ((v - 1) % 20) + 1;
      return disc(team, px(n) + off, n <= 10 ? 38.3 : 52.4, `${TC.TEAM_INFO[team].name}: ${v} points`, v > 20 ? "+" + Math.floor((v - 1) / 20) * 20 : "");
    };
    const turn = Math.min(s.turn, 10);
    const army = (team) => {
      const t = s.teams[team];
      const load = E.commandLoad(s, team);
      const tokens = (n) => Array.from({ length: n }, () => `<i class="tt-marker ${team === "fourth" ? "black" : "white"}"></i>`).join("");
      const cmds = E.theaterCommands(s, team)
        .map((id) => {
          const c = R.cmd(id);
          const n = load[id] || 0;
          return `<div class="tt-cmd" title="${esc(c.name)}: ${n} task${n === 1 ? "" : "s"} this turn"><img src="${c.art}" data-art="${c.art}" alt="" loading="lazy">${Array.from({ length: n }, (_, i) => `<i class="tt-brown" style="left:${18 + i * 16}%"></i>`).join("")}</div>`;
        })
        .join("");
      const free = E.staffFree(s, team);
      const staff = TC.STAFF_CELLS.map((c) => `<span class="chip" title="${esc(c.name)} staff: ${free[c.code]} planning slot${free[c.code] === 1 ? "" : "s"} still free this turn">${c.code} ${free[c.code]}</span>`).join("");
      return `<div class="tt-army ${K.teamCls(team)}"><div class="tt-h">${K.teamChip(team)}</div>
        <div class="tt-pair"><div class="tt-card" title="Influence: ${t.influence}"><img src="img/trackers/${PREFIX[team]}_tracker_influence.webp" alt="Influence"><div class="tt-tokens" ${at(50, 62)}>${tokens(t.influence)}</div></div>
          <div class="tt-card" title="Access: Zone A ${t.access.A}, Zone B ${t.access.B}, Zone C ${t.access.C}"><img src="img/trackers/${PREFIX[team]}_tracker_access.webp" alt="Access">${TC.ZONES.map((z, i) => `<div class="tt-tokens" ${at(16.7 + i * 33.3, 62)}>${tokens(t.access[z])}</div>`).join("")}</div></div>
        <div class="tt-lab">Major subordinate commands in theater <span class="faint">(brown square = one task this turn)</span></div><div class="tt-cmds">${cmds}</div>
        <div class="tt-lab">Staff planning slots still free</div><div style="display:flex;gap:4px;flex-wrap:wrap">${staff}</div></div>`;
    };
    return `<div class="tt-theater">${army("fourth")}
      <div class="tt-mid"><div class="tt-h" style="justify-content:center"><b>Points and turn tracker</b></div>
        <div class="tt-card big"><img src="img/trackers/tracker_points-turn.webp" alt="Points and turn tracker">${score("fourth")}${score("tenth")}<span class="tt-marker yellow" ${at(px(turn), 83.3)} title="Turn ${s.turn}"></span></div>
        <div class="tt-legend"><span><i class="tt-marker black"></i> Fourth Army</span><span><i class="tt-marker white"></i> Tenth Army</span><span><i class="tt-marker yellow"></i> Turn marker</span></div></div>
      ${army("tenth")}</div>`;
  }

  M.tabletop = function (m) {
    const s = App.state;
    const tabs = [["A", "Zone A"], ["B", "Zone B"], ["C", "Zone C"], ["T", "Theater: points, Influence, commands"]];
    return `<div class="modal wide tabletop"><div class="modal-head"><h2>Table view</h2><span class="muted">This position as it would look on the physical table</span>
        <div class="seg" style="margin-left:14px">${tabs.map(([k, l]) => `<button class="btn sm ${m.tab === k ? "on" : ""}" data-act="tt-tab" data-k="${k}">${l}</button>`).join("")}</div>
        <button class="btn ghost x" data-act="close-modal">✕</button></div>
      <div class="modal-body">${m.tab === "T" ? theaterView(s) : zoneView(s, m.tab)}</div></div>`;
  };
  A["tt-tab"] = (el) => {
    App.ui.modal.tab = el.dataset.k;
    App.ui.tableTab = el.dataset.k;
    App.render();
  };
  App.actions.tabletop = () => {
    if (!App.state) return;
    App.ui.overlay = App.ui.overlay && App.ui.overlay.type === "menu" ? null : App.ui.overlay;
    App.openModal({ type: "tabletop", tab: App.ui.tableTab || "A" });
  };
})();
