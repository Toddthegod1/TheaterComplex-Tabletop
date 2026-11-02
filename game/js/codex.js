// Rules Codex: the rulebook reorganised for play, with tables generated from
// the same data the engine uses (so the reference can never drift from play).
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = TC.rules;
  const K = TC.kit;
  const esc = K.esc;
  const App = TC.app;

  const TABS = [
    ["overview", "Overview"],
    ["sequence", "Turn sequence"],
    ["tasks", "Planning & tasks"],
    ["dice", "Trackers & dice"],
    ["crisis", "Crisis Assessment"],
    ["forces", "Forces: RFF, RSOI, SecWar"],
    ["taskcards", "Task card list"],
    ["caps", "Order of battle"],
    ["clar", "Clarifications & sources"],
    ["glossary", "Glossary"],
  ];

  function ranges(key, zone) {
    const table = TC.GENERATED.dieLegend[key][zone];
    const out = [];
    Object.keys(table)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((v) => {
        const last = out[out.length - 1];
        if (last && last.val === table[v]) last.hi = v;
        else out.push({ lo: v, hi: v, val: table[v] });
      });
    return out;
  }

  function legendTable(key, title, fmt) {
    const rows = TC.ZONES.map((z) => `<tr><th>Zone ${z}</th>${ranges(key, z).map((g) => `<td>${g.lo === g.hi ? g.lo : `${g.lo}–${g.hi}`}<br>${fmt(g.val)}</td>`).join("")}</tr>`).join("");
    return `<h3>${title}</h3><table class="t">${rows}</table>`;
  }

  const SECTIONS = {
    overview: () => `<h2>TheaterComplex</h2>
      <p>A two-sided competitive wargame from the U.S. Army War College. Each side is the commander and staff of a fictional Theater Army: <b class="c4">Fourth Army</b> (black markers) or <b class="c10">Tenth Army</b> (white markers). Over several years (turns) they campaign across three zones to build deterrence, partner capacity, infrastructure and readiness, while keeping the theater from escalating.</p>
      <h3>How to win</h3><ul>
        <li>Outperform the opponent in each zone's <b>Crisis Assessment</b> (1–8 points per zone per turn, counting the objective-zone bonus).</li>
        <li>Hold higher <b>deterrence</b> when crises stay peaceful (+1), but beware: in violent crises the higher-deterrence army <b>loses 3</b>.</li>
        <li>Hold more theater-wide <b>Influence</b> (+1 per turn).</li>
        <li>Never <b>over-task</b> an MSC (−1 each per turn).</li></ul>
      <p>The army with the most points after the final turn wins.</p>
      <h3>The theater</h3><table class="t"><tr><th>Zone</th><th>Character</th><th>Bonus</th></tr>
        <tr><td>A</td><td class="l">Closest to Fourth Army's homeland; Tenth Army's main deterrence objective</td><td>+1 to Tenth Army for winning A</td></tr>
        <tr><td>B</td><td class="l">Central; both armies have equal capabilities</td><td>—</td></tr>
        <tr><td>C</td><td class="l">Closest to Tenth Army's homeland; Fourth Army's main deterrence objective</td><td>+1 to Fourth Army for winning C</td></tr></table>
      <h3>The cards</h3><table class="t">
        <tr><td style="background:#5b6e2f;color:#fff">Task</td><td class="l">21 actions per army. The front lists requirements and the back lists effects.</td></tr>
        <tr><td style="background:#7a7a70;color:#fff">Staff</td><td class="l">9 staff cells plan tasks. Each has 1–3 slots per turn.</td></tr>
        <tr><td style="background:#f0a03a;color:#2a1702">Command</td><td class="l">12 MSCs (7 in theater at start, 5 in the GFM pool). 2 free slots, then 3 over-tasked slots.</td></tr>
        <tr><td style="background:#2f7590;color:#fff">Capability</td><td class="l">Units with capability points (support) or 0 points (combat units, which only generate deterrence).</td></tr>
        <tr><td style="background:#8e5a2b;color:#fff">ASOS</td><td class="l">Requests from the other Services for Army capabilities.</td></tr></table>`,

    sequence: () => `<h2>Turn sequence</h2><ol>
      <li><b>Task limit</b>: the adjudicator rolls a d6; each army may plan that many tasks (minimum 3).</li>
      <li><b>ASOS</b>: draw 2 ASOS cards if the limit is 3, otherwise 1. Each army commits capability cards of the listed types from any zone, totalling the points. They turn sideways for the turn (deterrence is unchanged). If an army can't, it covers the request through RFF.</li>
      <li><b>Planning</b> (30 minutes at the table): choose tasks; allocate staff, MSCs and capabilities; reserve Influence/Access; plan RFF, RSOI forces and zone transfers. Plans are locked when the phase ends.</li>
      <li><b>Implementation</b>: plan-only tasks take effect first. Both armies roll d10 for initiative; the higher roll plays first, then they alternate one task at a time. Over-tasked MSCs roll d6. Once per turn an army may play a task as <b>Disruption</b>. While holding initiative an army may spend 3 Influence for −1 Instability in a zone.</li>
      <li><b>Crisis Assessment</b>: zones A, B, C in order (see that page), then theater-wide points.</li>
      <li><b>Force tailoring</b>: redeploy SecWar and last turn's RSOI forces and any RFF you return; carry out zone transfers; deploy new RFF (ASOS cover first), then RSOI; draw 3 new SecWar capabilities into A, B, C.</li>
      <li><b>Cleanup</b>: sideways cards return upright; deterrence is recounted; on even turns Assurance and Partner Interoperability drop by 1 in every zone; Disruption resets; the ASOS card is discarded.</li></ol>`,

    tasks: () => `<h2>Planning &amp; tasks</h2>
      <p>To plan a task, meet every requirement on its card front:</p>
      <ul><li><b>Staff</b>: one slot on each listed staff card. "All staff" (Contingency planning) takes one slot on every card. Staff slots per army: ${TC.STAFF_CELLS.map((c) => `${c.code} ${TC.GENERATED.staffSlots.fourth[c.code]}`).join(", ")}.</li>
      <li><b>Command</b>: one MSC per box. A dotted box accepts any MSC in theater. Each MSC has 2 free slots; its 3rd, 4th and 5th tasks are <b>over-tasked</b>: during implementation that task executes only on a d6 roll greater than the number of tasks the MSC has handled so far this turn (3rd task: 4+, 4th: 5+, 5th: 6). Each over-tasked MSC also costs −1 point.</li>
      <li><b>Capabilities</b>: cards whose points total the big number. Every listed type must be represented; dotted boxes accept any type; "OR" boxes mean choose one path; dashed "(opt.)" boxes add a bonus effect. Combat units (0 points) cannot be used.</li>
      <li><b>Influence / Access</b>: costs are reserved at planning and refunded if the task does not execute.</li></ul>
      <p><b>P</b> (plan-only) tasks need only staff and take effect before any task is played. <b>E</b> (execute-only) tasks need no staff.</p>
      <h3>Assurance limits</h3><ul><li><b>Assurance 1</b>: capability point requirements double in that zone.</li>
      <li><b>Assurance 6–7</b>: no security cooperation (tasks 8, 9, 12, 13) or agreements (1, 10, 14, 15) in that zone. These cards carry the T×T icon. Instability rises (+1 at 6, +2 at 7, per army).</li></ul>
      <h3>Disruption</h3><p>Once per turn, play a task normally (paying all requirements) but <b>subtract</b> its effects from the opponent's trackers in that zone instead of adding them to your own. Information Operations can instead take −1 Influence from the opponent without using Disruption.</p>`,

    dice: () => `<h2>Trackers &amp; the Defense Readiness box</h2>
      <p>Four trackers build each army's dice for the Crisis Assessment. Deterrence uses the same legend in every zone; the other three use <b>different breakpoints in each zone</b> (as printed on the tracker cards).</p>
      ${legendTable("deterrence", "Deterrence → Theater Army die size", (v) => K.die(v, { size: 24 }))}
      <p class="muted">Deterrence below 4 (two zones start at 3) is off the printed track; the game uses a d4. Deterrence is computed from cards: +1 for every 1/2/3/4 cards of category 1/2/3/4 in the zone.</p>
      ${legendTable("infrastructure", "Infrastructure Capacity → number of Theater Army d6", (v) => `${v} × ${K.die(6, { size: 20 })}`)}
      ${legendTable("partnerCap", "Partner Capability → Partner die size", (v) => K.die(v, { size: 24 }))}
      ${legendTable("interop", "Partner Interoperability → number of Partner d4", (v) => `${v} × ${K.die(4, { size: 20 })}`)}
      ${legendTable("stockage", "Stockage → modifier to every Theater Army die", (v) => `<b class="${v > 0 ? "good" : v < 0 ? "bad" : ""}">${v > 0 ? "+" : ""}${v}</b>`)}
      <h3>Comparison trackers</h3><table class="t"><tr><th>Intelligence</th><td class="l">Higher: before rolling, promote one friendly die or demote one enemy die by one size (d4↔d6↔d8↔d10↔d12).</td></tr>
      <tr><th>Communications</th><td class="l">Higher: re-roll your lowest die, keep the higher result.</td></tr>
      <tr><th>Protection</th><td class="l">Higher: the opponent re-rolls its highest die and keeps the lower result.</td></tr></table>`,

    crisis: () => {
      const rows = TC.CRISIS_TABLE.rows
        .map((r) => {
          const cells = Array.from({ length: 10 }, (_, d) => {
            const t = R.crisisTypeFor(r.min, d + 1);
            return `<td class="ct-${t}" style="color:#fff">${t}</td>`;
          }).join("");
          return `<tr><th>${TC.crisisRowLabel(r)}</th>${cells}</tr>`;
        })
        .join("");
      return `<h2>Crisis Assessment</h2>
        <h3>1. Instability</h3><p>Instability = |Fourth Army deterrence − Tenth Army deterrence| + Assurance instability (+1 for each army at 6, +2 for each at 7) − Influence spent this turn (3 Influence per −1).</p>
        <h3>2. Crisis type (d10)</h3><table class="t"><tr><th>Instability</th>${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join("")}</tr>${rows}</table>
        <h3>3. Dice resolution</h3><ol><li><b>Intelligence advantage</b>: promote 1 friendly die or demote 1 enemy die.</li><li>Roll the Theater Army dice (deterrence die + infrastructure d6s) and apply the stockage modifier to each.</li><li>Roll the partner dice (partner capability die + interoperability d4s).</li>
        <li><b>Communications advantage</b>: re-roll own lowest die, keep higher.</li><li><b>Protection advantage</b>: the enemy re-rolls its highest die, keeps lower.</li><li>Sum all dice. <b>Limited Operation / LSCO only</b>: add the army's Deterrence, plus +1 at Assurance 6 or +2 at Assurance 7.</li><li>Higher total wins the zone (a tie has no victor).</li></ol>
        <h3>4. Points</h3><table class="t"><tr><th>Crisis</th><th>Victor</th><th>Zone bonus*</th><th>Deterrence factor</th></tr>
        ${Object.values(TC.CRISIS_TYPES).map((c) => `<tr><td class="l">${c.name}</td><td>+${c.victor}</td><td>+${c.bonus}</td><td>${c.deterrence > 0 ? "+" : ""}${c.deterrence} to army with higher deterrence</td></tr>`).join("")}</table>
        <p class="muted">*Only if Fourth Army wins Zone C or Tenth Army wins Zone A. Then, theater-wide: +1 to the army with more Influence; −1 per over-tasked MSC.</p>`;
    },

    forces: () => `<h2>Force management</h2>
      <h3>Request for Forces (RFF)</h3><p>During planning, pick GFM capabilities (and GFM MSCs) to arrive at the end of the turn, choosing each capability's zone. No more than <b>10</b> RFF forces may be in theater at once (SecWar forces don't count). During force tailoring you may return any RFF forces; the rest stay.</p>
      <h3>SecWar-directed forces</h3><p>Every turn 3 random GFM capabilities arrive (first to A, second to B, third to C), and they redeploy at the next force tailoring.</p>
      <h3>RSOI (task 7)</h3><p>If RSOI executes successfully, up to 3 more chosen GFM capabilities arrive this turn, beyond the RFF cap. They redeploy at the end of the following turn.</p>
      <h3>Zone transfers</h3><p>Planned during planning and carried out during force tailoring, before new arrivals.</p>
      <h3>ASOS</h3><p>Committed cards stay in their zone, sideways, and still count for deterrence. If you can't meet a request, GFM forces covering it are deployed first, count against the RFF cap, and stay sideways through the next turn.</p>`,

    taskcards: () => {
      const team = App.state ? App.me() : "fourth";
      const req = (t) => {
        const parts = [];
        parts.push(`<b>Staff</b> ${t.staff === "ALL" ? "all staff" : t.staff.join(", ") || "—"}`);
        parts.push(`<b>MSC</b> ${t.commands.join(", ") || "—"}`);
        parts.push(`<b>Caps</b> ${t.points ? `${t.points} pts: ${t.caps.join(" + ")}` : "—"}`);
        if (t.branches) parts.push(`<b>Choose</b> ${t.branches.map((b) => b.label).join(" / ")}`);
        if (t.options) parts.push(`<b>Optional</b> ${t.options.map((o) => o.label).join("; ")}`);
        const cost = Object.entries(t.cost).map(([k, v]) => `${TC.EFFECT_LABELS[k]} −${v}`);
        if (cost.length) parts.push(`<b>Cost</b> ${cost.join(", ")}`);
        const eff = R.formatEffects(t.effects);
        if (eff) parts.push(`<b>Effects</b> ${eff}`);
        return parts.join("<br>");
      };
      return `<h2>Task cards</h2><p class="muted">Transcribed from the card art. Hover to enlarge (front | back).</p><div class="taskgrid">${TC.TASKS.map(
        (t) => `<div class="tg"><img src="${t.art[team].front}" data-art="${t.art[team].front}" alt=""><img src="${t.art[team].back}" data-art="${t.art[team].back}" alt="" style="width:60px"><div class="d"><b>${t.num}. ${esc(t.name)}</b> ${t.mode !== "N" ? `<span class="chip">${t.mode}</span>` : ""}${t.blocked ? ' <span class="chip warnc">T×T</span>' : ""}<br>${req(t)}</div></div>`
      ).join("")}</div>`;
    },

    caps: () => {
      const caps = TC.GENERATED.capabilities;
      const table = (team) => {
        const codes = [...new Set(caps.filter((c) => c.team === team).map((c) => c.code))].sort();
        const rows = codes
          .map((code) => {
            const cell = (z) => {
              const list = caps.filter((c) => c.team === team && c.code === code && c.startZone === z);
              return list.length ? `${list.length} <span class="muted">(${list.reduce((s, c) => s + c.points, 0)} pts)</span>` : "";
            };
            const cat = caps.find((c) => c.code === code).cat;
            return `<tr><td class="l">${esc(TC.CAPABILITY_TYPES[code] || code)}</td><td>${cat}</td>${["A", "B", "C", "GFM"].map((z) => `<td>${cell(z)}</td>`).join("")}</tr>`;
          })
          .join("");
        return `<h3>${TC.TEAM_INFO[team].name}</h3><table class="t"><tr><th>Capability</th><th>Cat.</th><th>Zone A</th><th>Zone B</th><th>Zone C</th><th>GFM</th></tr>${rows}</table>`;
      };
      return `<h2>Order of battle</h2><p>Generated from <code>dig_game_database_master.xlsx</code> (190 capability cards). Cards: count (capability points).</p>${table("fourth")}${table("tenth")}`;
    },

    clar: () => `<h2>Clarifications &amp; source verification</h2>
      <p>The digital edition was built from the rulebook (v13 Europe), its 13 embedded figures, the card database workbook, and all card art. Where they disagree or are silent, this is what the game does:</p>
      <h3>Verified sources</h3><ul>
        <li>Die legend (deterrence, partner capability, infrastructure, interoperability, stockage): workbook <i>dig_trackers_min_max</i> = tracker card art (assets/trackers) = rulebook figures 5–7, for all three zones.</li>
        <li>Starting deterrence computed from the capability cards reproduces Enclosure 2 exactly (Fourth 3/6/5, Tenth 5/6/3).</li>
        <li>Capability cards: workbook = existing tabletop data (190 cards, exact match).</li></ul>
      <h3>Corrections to the draft Rules Reference Addendum</h3><ul>
        <li>Deterrence 11 and 12 rows ("+1/+2 Instability instead of a bigger die") are <b>not</b> on the card art or in the workbook. The printed track is 4–10. Its "Additional Instability" boxes hold the extra Assurance-driven instability cubes.</li>
        <li>The addendum omits Stockage, whose breakpoints also differ by zone (Zone A has no 0 band; Zone C's +1 starts at 6).</li></ul>
      <h3>Conflicts and gaps, with the rule this game applies</h3><ul>
        <li><b>Crisis Assessment table</b>: missing from the rulebook; taken from the adjudicator's Crisis Assessment sheet. Where the sheet's VP summary is shorter than the rulebook (it lists the +1 deterrence factor only under Status Quo), the rulebook's points table is used: Show of Force also gives +1 to the army with higher deterrence.</li>
        <li><b>Deterrence below 4</b>: Enclosure 2 starts two zones at 3, below the printed track. Uses a d4.</li>
        <li><b>Information Operations</b>: rulebook says opponent −1 Influence; card back shows "+1/−1"; workbook note says −2. Uses −1 (card and rulebook agree).</li>
        <li><b>MSC bandwidth</b>: rulebook says "three spaces"; the card art shows 2 white slots plus 3 red over-tasked slots, and §7 says the roll is needed for the 3rd and later tasks. Uses 2 free slots, at most 5 tasks, roll d6 &gt; number of tasks so far.</li>
        <li><b>HNS agreement</b>: workbook pairs requirement 1 with Capacity, but the card back says Infrastructure +1 "if CA" and Stockage +1 "if SUST". Follows the card.</li>
        <li><b>Capability zone</b>: the rulebook doesn't say whether a task's capabilities must sit in the task's zone. Default yes (toggle in setup).</li>
        <li><b>Command cards in RFF</b>: the 10-force cap names "capabilities". Default counts MSCs too (toggle).</li>
        <li><b>Expeditionary Transportation (TBX)</b> satisfies a Transportation requirement.</li>
        <li><b>Failed tasks</b> (over-tasked roll or Assurance changes mid-turn): Influence/Access refunded; capabilities stay committed for the turn, as the rulebook says.</li>
        <li><b>Instability reductions</b> bought with Influence last until cleanup.</li>
        <li><b>Ties</b> in a zone's dice total: no victor; the deterrence factor still applies.</li>
        <li><b>SecWar draws</b> take capability cards only (not GFM MSCs).</li>
        <li><b>Game length</b> is a number of turns (default 6) instead of a 4-hour clock.</li></ul>`,

    glossary: () => `<h2>Glossary</h2><table class="t">
      ${[
        ["Influence", "Intangible result of operations affecting adversary thinking. Gained by intelligence support, information operations, SPP contact events and military engagement. Spent on access, HNS, basing and storage agreements, or to reduce Instability."],
        ["Assurance", "Nations' confidence that the United States will meet its commitments. Gained by combined exercises, stockage adjustment, basing and storage agreements and police operations."],
        ["Partner Capability", "Partner nations' military effectiveness. Sets the partner die size."],
        ["Partner Interoperability", "Ability to operate within the coalition. Sets the number of partner d4s."],
        ["Access", "Use of other nations' resources and infrastructure, tracked per zone. Gained by access agreements, military engagement and SFA."],
        ["Infrastructure Capacity", "Ports and transport able to absorb the flow of forces. Sets the number of Theater Army d6s."],
        ["Stockage", "Materiel in place at the outset of a contingency (CL III(B), V, IX). Modifies Theater Army dice."],
        ["Deterrence", "One side's perceived strength. Computed from capabilities by category; sets the Theater Army die size."],
        ["Instability", "The deterrence gap plus assurance pressure: how threatened each side feels. Drives the crisis type."],
        ["GFM", "Global Force Management: the pool of forces outside the theater."],
        ["RFF", "Request for Forces from the GFM pool."],
        ["RSOI", "Reception, Staging, Onward movement and Integration."],
        ["ASOS", "Army Support to Other Services."],
        ["MSC", "Major Subordinate Command."],
        ["SecWar", "Secretary of War: directs three GFM capabilities into theater each turn."],
        ["LSCO", "Large-Scale Combat Operations."],
      ]
        .map(([k, v]) => `<tr><th style="text-align:left">${k}</th><td class="l">${v}</td></tr>`)
        .join("")}</table>`,
  };

  TC.modals = TC.modals || {};
  TC.modalActions = TC.modalActions || {};
  TC.modals.codex = function (m) {
    return `<div class="modal wide" style="height:90vh"><div class="modal-head"><h2>Rules Codex</h2><span class="muted">TheaterComplex v13 · Europe Edition</span><button class="btn ghost x" data-act="close-modal">✕</button></div>
      <div class="codex"><nav>${TABS.map(([k, l]) => `<button class="${m.tab === k ? "on" : ""}" data-act="codex-tab" data-k="${k}">${l}</button>`).join("")}</nav><div class="content">${SECTIONS[m.tab]()}</div></div></div>`;
  };
  TC.modalActions["codex-tab"] = (el) => {
    App.ui.modal.tab = el.dataset.k;
    App.ui.codexTab = el.dataset.k;
    App.render();
  };
})();
