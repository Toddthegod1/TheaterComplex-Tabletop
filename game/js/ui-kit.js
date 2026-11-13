// Small rendering helpers shared by all screens.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = TC.rules;
  const K = (TC.kit = {});

  K.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  K.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  K.teamCls = (team) => (team === "fourth" ? "t4" : "t10");
  K.teamName = (team) => TC.TEAM_INFO[team].name;
  K.teamChip = (team, label) => `<span class="chip ${K.teamCls(team)}"><span class="marker ${TC.TEAM_INFO[team].marker}"></span>${K.esc(label || K.teamName(team))}</span>`;

  // ---------------------------------------------------------------- dice
  const DIE = {
    4: { fill: "var(--d4)", ink: "#fff", shape: '<polygon points="20,2 38,36 2,36"/>', ty: 29 },
    6: { fill: "var(--d6)", ink: "#fff", shape: '<rect x="3" y="3" width="34" height="34" rx="7"/>', ty: 21 },
    8: { fill: "var(--d8)", ink: "#141414", shape: '<polygon points="20,1 39,20 20,39 1,20"/>', ty: 21 },
    10: { fill: "var(--d10)", ink: "#fff", shape: '<polygon points="20,1 37,11 37,29 20,39 3,29 3,11"/>', ty: 21 },
    12: {
      fill: "var(--d12)",
      ink: "#fff",
      shape: `<polygon points="${Array.from({ length: 10 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 10 - Math.PI / 2;
        return `${(20 + 19 * Math.cos(a)).toFixed(1)},${(20 + 19 * Math.sin(a)).toFixed(1)}`;
      }).join(" ")}"/>`,
      ty: 21,
    },
  };

  // opts: size, value (number or "" to show "dN"), cls, tag, mod, data (attr string), title
  K.die = function (sides, opts = {}) {
    const d = DIE[sides] || DIE[6];
    const size = opts.size || 30;
    const label = opts.value === undefined || opts.value === null ? sides : opts.value;
    const fs = String(label).length > 1 ? 15 : 18;
    return `<span class="die ${opts.cls || ""}" ${opts.data || ""} title="${K.esc(opts.title || "d" + sides)}">
      <svg width="${size}" height="${size}" viewBox="0 0 40 40"><g fill="${d.fill}" stroke="rgba(255,255,255,.35)" stroke-width="1.5">${d.shape}</g>
      <text class="face" x="20" y="${d.ty}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="${d.ink}">${K.esc(label)}</text></svg>
      ${opts.tag ? `<span class="tag">${K.esc(opts.tag)}</span>` : ""}${opts.mod ? `<span class="mod">${opts.mod > 0 ? "+" : ""}${opts.mod}</span>` : ""}</span>`;
  };

  K.pool = function (pool, size = 24) {
    const t = pool.theater.map((d) => K.die(d.sides, { size, title: `${d.src}: d${d.sides}` })).join("");
    const p = pool.partner.map((d) => K.die(d.sides, { size, title: `${d.src}: d${d.sides}` })).join("");
    return { theater: t, partner: p };
  };

  // ---------------------------------------------------------------- cards
  const BADGE = { secwar: ["SW", ""], rff: ["RFF", "rff"], rsoi: ["RSOI", "rsoi"], asos: ["ASOS", "asos"] };
  K.capMini = function (id, state, opts = {}) {
    const c = R.cap(id);
    const st = state && state.cards[id];
    const cls = ["mini", `cat${c.cat}`, opts.big ? "big" : "", opts.cls || ""];
    if (st && !opts.ignoreStatus) {
      if (st.status === "used") cls.push("used");
      if (st.status === "asos") cls.push("asos");
    }
    if (opts.sel) cls.push("sel");
    if (opts.pick) cls.push("pickable");
    if (opts.disabled) cls.push("disabled");
    const badge = st && st.zone !== "GFM" && BADGE[st.origin];
    const tip = `${c.name} — ${c.points} capability pts, deterrence ${c.cat === 1 ? "1" : "1/" + c.cat}${st ? ` · ${st.zone === "GFM" ? "GFM pool" : "Zone " + st.zone}` : ""}${st && st.origin ? ` · ${st.origin.toUpperCase()}` : ""}${st && st.status !== "ready" ? ` · ${st.status === "used" ? "committed this turn" : "supporting ASOS"}` : ""}`;
    return `<div class="${cls.join(" ")}" data-art="${c.art}" data-cap="${id}" ${opts.data || ""} title="${K.esc(tip)}">
      <div class="band">${K.esc(c.code)}</div>
      <div class="pts ${c.points ? "" : "zero"}">${c.points}</div>
      <div class="detv">${c.cat === 1 ? "1" : "1/" + c.cat}</div>
      ${badge ? `<span class="badge ${badge[1]}">${badge[0]}</span>` : ""}</div>`;
  };

  K.cmdMini = function (id, opts = {}) {
    const c = R.cmd(id);
    const cls = ["mini", "cmd", opts.big ? "big" : "", opts.cls || "", opts.sel ? "sel" : "", opts.pick ? "pickable" : "", opts.disabled ? "disabled" : ""];
    return `<div class="${cls.join(" ")}" data-art="${c.art}" ${opts.data || ""} title="${K.esc(c.name)}">
      <div class="band">MSC</div><div class="code" style="margin-top:6px">${K.esc(c.code)}</div>
      <div class="detv" style="color:#8a5a1a;font-size:9px">${K.esc(c.short.replace(/ (Cmd|Bde)$/, ""))}</div></div>`;
  };

  // Colour key for the crisis-type abbreviations used in tables.
  K.crisisLegend = () =>
    `<div class="clegend">${Object.values(TC.CRISIS_TYPES)
      .map((c) => `<span><i class="ct-${c.key}">${c.key}</i>${c.key === "LSCO" ? "Large-scale combat" : c.name}</span>`)
      .join("")}</div>`;

  K.taskArt = (team, num, side = "front") => TC.taskByNum(num).art[team][side];

  K.effectChips = function (effects, sign = 1) {
    return Object.entries(effects || {})
      .filter(([, v]) => v)
      .map(([k, v]) => {
        const val = v * sign;
        return `<span class="chip ${val > 0 ? "goodc" : "badc"}">${TC.EFFECT_LABELS[k]} ${val > 0 ? "+" : "−"}${Math.abs(val)}</span>`;
      })
      .join(" ");
  };

  K.pips = function (value, team, right, warnAt) {
    let s = "";
    for (let i = 1; i <= 7; i++) s += `<i class="${i <= value ? "on" : ""} ${warnAt && warnAt(i) ? "warn" : ""}"></i>`;
    return `<div class="pips ${K.teamCls(team)} ${right ? "right" : ""}">${s}</div>`;
  };

  // ---------------------------------------------------------------- tracker impact
  // What a set of tracker changes would mean for `me` in `zone`, in plain words.
  // Returns { lines: [{ tone, html }], before, after, theirs }: before/after are
  // this army's expected crisis roll there, theirs is the enemy's.
  K.impact = function (s, me, zone, effects) {
    const opp = TC.other(me);
    const oppName = TC.TEAM_INFO[opp].name;
    const z = s.teams[me].zones[zone];
    const oz = s.teams[opp].zones[zone];
    const lines = [];
    const add = (tone, html) => lines.push({ tone, html });
    const nextStep = (key, after) => {
      const cur = R.legend(key, zone, after);
      for (let v = after + 1; v <= TC.TRACKER_MAX; v++) if (R.legend(key, zone, v) !== cur) return v - after;
      return null;
    };
    Object.entries(effects || {}).forEach(([k, v]) => {
      if (!v) return;
      if (["partnerCap", "infrastructure", "interop", "stockage"].includes(k)) {
        const after = R.clamp(z[k] + v, TC.TRACKER_MIN, TC.TRACKER_MAX);
        const a = R.legend(k, zone, z[k]);
        const b = R.legend(k, zone, after);
        const what = { partnerCap: "Partner die", infrastructure: "Theater Army d6 dice", interop: "Partner d4 dice", stockage: "Bonus on each Theater Army die" }[k];
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
        else add("muted", `Extends the ${name} lead (${after} vs ${oz[k]}): already ahead`);
      } else if (k === "assurance") {
        const after = R.clamp(z.assurance + v, TC.TRACKER_MIN, TC.TRACKER_MAX);
        if (after >= 6) add("bad", `<b>Assurance reaches ${after}</b>: blocks agreements and security cooperation here, and adds +${after >= 7 ? 2 : 1} Instability`);
        else if (z.assurance <= 1) add("good", `<b>Ends doubled capability requirements</b> (Assurance 1 → ${after})`);
        else add("muted", `Assurance ${z.assurance} → ${after}: a buffer against even-turn decay`);
      } else if (k === "influence") {
        const after = R.clamp(s.teams[me].influence + v, 0, TC.INFLUENCE_MAX);
        const oi = s.teams[opp].influence;
        add(after > oi && s.teams[me].influence <= oi ? "good" : "muted", `Influence ${s.teams[me].influence} → ${after} (${oppName} has ${oi}; higher earns +1 point each turn)`);
      } else if (k === "access") {
        const after = R.clamp(s.teams[me].access[zone] + v, 0, TC.ACCESS_MAX);
        add("muted", `Access in Zone ${zone} ${s.teams[me].access[zone]} → ${after}: pays for agreements and some tasks here`);
      }
    });
    // Expected crisis roll before vs after, using a copy of this army's trackers.
    const sim = Object.assign({}, s, { teams: Object.assign({}, s.teams, { [me]: JSON.parse(JSON.stringify(s.teams[me])) }) });
    R.applyEffects(sim, me, zone, effects || {}, 1);
    return {
      lines,
      before: R.expectedDice(R.readiness(s, me, zone)),
      after: R.expectedDice(R.readiness(sim, me, zone)),
      theirs: R.expectedDice(R.readiness(s, opp, zone)),
    };
  };

  // ---------------------------------------------------------------- art preview on hover
  let previewEl = null;
  K.installPreview = function () {
    document.addEventListener("mouseover", (e) => {
      // Task cards get the impact inspector instead of a plain art preview.
      const ins = e.target.closest("[data-inspect]");
      if (ins && K.inspect) {
        if (ins === inspecting) return;
        const html = K.inspect(ins);
        if (html) {
          inspecting = ins;
          if (!previewEl) {
            previewEl = document.createElement("div");
            document.body.appendChild(previewEl);
          }
          previewEl.className = "preview inspector";
          previewEl.innerHTML = html;
          previewEl.style.left = previewEl.style.top = "";
          previewEl.style.display = "block";
          return;
        }
      }
      const el = e.target.closest("[data-art]");
      if (!el || el.closest(".preview")) return;
      const art = el.getAttribute("data-art");
      if (!art) return;
      if (!previewEl) {
        previewEl = document.createElement("div");
        previewEl.className = "preview";
        document.body.appendChild(previewEl);
      }
      if (inspecting && K.uninspect) K.uninspect();
      inspecting = null;
      previewEl.className = "preview";
      const isTask = art.includes("/tasks/");
      const w = isTask ? 240 : 220;
      previewEl.innerHTML = `<img src="${art}" width="${w}">`;
      const r = el.getBoundingClientRect();
      const h = isTask ? w * (5 / 3) : w * 1.4;
      let left = r.right + 12;
      if (left + w > window.innerWidth - 8) left = r.left - w - 12;
      let top = Math.min(Math.max(8, r.top + r.height / 2 - h / 2), window.innerHeight - h - 8);
      previewEl.style.left = `${Math.max(8, left)}px`;
      previewEl.style.top = `${top}px`;
      previewEl.style.display = "block";
    });
    document.addEventListener("mouseout", (e) => {
      const el = e.target.closest("[data-inspect],[data-art]");
      if (el && previewEl && !el.contains(e.relatedTarget)) K.hidePreview();
    });
    document.addEventListener("mousedown", () => K.hidePreview());
  };
  let inspecting = null;
  K.hidePreview = () => {
    if (previewEl) previewEl.style.display = "none";
    if (inspecting && K.uninspect) K.uninspect();
    inspecting = null;
  };
})();
