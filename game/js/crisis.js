// Crisis Assessment stage: table lookup, intelligence choice, dice trays.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});
  const R = TC.rules;
  const E = TC.engine;
  const AI = TC.ai;
  const K = TC.kit;
  const esc = K.esc;
  const App = TC.app;

  const C = (TC.crisisUI = { actions: {} });
  const anim = () => (App.ui.crisisAnim = App.ui.crisisAnim || { reveal: 3 });

  function crisisTable(cur, showHit) {
    const head = `<tr><th></th>${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join("")}</tr>`;
    const rows = TC.CRISIS_TABLE.rows
      .map((row) => {
        const isRow = R.crisisRow(cur.instability.total) === row;
        const cells = Array.from({ length: 10 }, (_, i) => {
          const type = R.crisisTypeFor(row.min, i + 1);
          const hit = isRow && showHit && cur.roll === i + 1;
          return `<td class="ct-${type} ${hit ? "hit" : ""}" title="${TC.CRISIS_TYPES[type].name}">${type === "LSCO" ? "LSCO" : type}</td>`;
        }).join("");
        const label = TC.crisisRowLabel(row);
        return `<tr class="${isRow ? "row" : ""}"><td class="rl">${label}</td>${cells}</tr>`;
      })
      .join("");
    return `<table class="ctable"><caption class="muted" style="caption-side:top;text-align:left;font-size:11px;padding-bottom:4px">Instability ↓ · d10 →</caption>${head}${rows}</table>`;
  }

  function trayDice(cur, team, res, a) {
    const pool = cur.pools[team];
    const intelTeam = cur.stage === "intel" && App.isHuman(cur.intelTeam) ? cur.intelTeam : null;
    const groups = ["theater", "partner"].map((group) => {
      let dice;
      if (res) {
        dice = res.teams[team].dice
          .filter((d) => d.group === group)
          .map((d) => {
            let value = d.value;
            let tag = d.intel ? "I" : "";
            let cls = a.rolling ? "rolling" : "land";
            if (d.comms) {
              if (a.reveal < 1) value = d.comms.before;
              else {
                tag = "C";
                cls += " hl";
              }
            }
            if (d.protection) {
              if (a.reveal < 2) value = d.protection.before;
              else {
                tag = "P";
                cls += " hl";
              }
            }
            const title = `d${d.sides} rolled ${d.raw}${d.mod ? ` ${d.mod > 0 ? "+" : ""}${d.mod} stockage` : ""}${d.comms ? `; comms re-roll ${d.comms.rolled}` : ""}${d.protection ? `; protection re-roll ${d.protection.rolled}` : ""}`;
            return K.die(d.sides, { size: 46, value: a.rolling ? "?" : value, cls, tag, mod: group === "theater" ? d.mod : 0, title });
          });
      } else {
        dice = pool[group].map((d, index) => {
          let act = "";
          let cls = a.rolling ? "rolling" : "";
          if (intelTeam) {
            const canPromote = team === intelTeam && d.sides < 12;
            const canDemote = team !== intelTeam && d.sides > 4;
            if (canPromote || canDemote) {
              act = `data-act="cr-intel" data-kind="${canPromote ? "promote" : "demote"}" data-group="${group}" data-index="${index}"`;
              cls += " pick";
            } else cls += " dim";
          }
          return K.die(d.sides, { size: 46, value: a.rolling ? "?" : `d${d.sides}`, cls, tag: d.intel ? "I" : "", data: act, title: `${d.src} die${act ? (team === intelTeam ? " — click to promote" : " — click to demote") : ""}` });
        });
      }
      return `<div class="grp">${group === "theater" ? `Theater Army ${pool.drm ? `(${pool.drm > 0 ? "+" : ""}${pool.drm} stockage each)` : ""}` : "Partners"}</div><div class="dice">${dice.join("")}</div>`;
    });
    return groups.join("");
  }

  C.render = function () {
    const s = App.state;
    const cur = s.crisis && s.crisis.current;
    if (!cur) return "";
    const a = anim();
    const res = cur.result;
    const ct = TC.CRISIS_TYPES[cur.type];
    const humans = App.humans();
    const z = cur.zone;
    const zs4 = s.teams.fourth.zones[z];
    const zs10 = s.teams.tenth.zones[z];
    const adv = (key, label, desc) => {
      const a4 = zs4[key];
      const a10 = zs10[key];
      if (a4 === a10) return `<span class="chip" title="${desc}">${label}: tied ${a4}–${a10}</span>`;
      const t = a4 > a10 ? "fourth" : "tenth";
      return `<span class="chip ${K.teamCls(t)}" title="${desc}">${label}: ${TC.TEAM_INFO[t].short} ${Math.max(a4, a10)}–${Math.min(a4, a10)}</span>`;
    };
    const tray = (team) => {
      const win = res && a.reveal >= 3 && res.winner === team;
      let sum = "";
      if (res && a.reveal >= 3) {
        const tr = res.teams[team];
        sum = `<div class="sum"><span>Dice ${tr.diceSum}</span>${ct.violent ? `<span>+ Deterrence ${tr.detBonus}</span>${tr.assuranceBonus ? `<span>+ Assurance ${tr.assuranceBonus}</span>` : ""}` : ""}<span class="total">${tr.total}</span></div>
          <div class="pointsline">${res.points[team].map((p) => `<span class="chip ${p.pts > 0 ? "goodc" : "badc"}">${p.pts > 0 ? "+" : ""}${p.pts} · ${esc(p.reason)}</span>`).join("")}</div>`;
      } else {
        const ev = R.expectedDice(cur.pools[team]) + (ct.violent ? cur.pools[team].deterrence : 0);
        sum = `<div class="sum"><span class="muted">Expected ≈ ${ev.toFixed(1)}${ct.violent ? ` (incl. deterrence ${cur.pools[team].deterrence})` : ""}</span></div>`;
      }
      return `<div class="tray ${K.teamCls(team)} ${win ? "win" : ""}"><h3>${K.teamChip(team)} ${win ? '<span class="chip goodc">VICTOR</span>' : ""}</h3>${trayDice(cur, team, res, a)}${sum}</div>`;
    };
    let notes = "";
    if (cur.stage === "intel") {
      notes = App.isHuman(cur.intelTeam)
        ? `<b class="${cur.intelTeam === "fourth" ? "c4" : "c10"}">${TC.TEAM_INFO[cur.intelTeam].name}</b> has the Intelligence advantage. Click one of your dice to <b>promote</b> it, or one enemy die to <b>demote</b> it (one size).`
        : `${TC.TEAM_INFO[cur.intelTeam].name} weighs its Intelligence advantage…`;
    } else if (cur.intelChoice) {
      const ic = cur.intelChoice;
      notes = `Intelligence: ${TC.TEAM_INFO[cur.intelTeam].name} ${ic.kind}d ${TC.TEAM_INFO[ic.target].name}'s die d${ic.before} → d${ic.after}. `;
    } else notes = "Intelligence tied: no die is modified. ";
    if (res && a.reveal >= 1 && res.comms) notes += `Communications: ${TC.TEAM_INFO[res.comms.team].name} re-rolls its lowest die (${res.comms.before} → rolled ${res.comms.rolled}, keeps ${res.comms.after}). `;
    if (res && a.reveal >= 2 && res.protection) notes += `Protection: ${TC.TEAM_INFO[res.protection.team].name} forces a re-roll of the enemy's highest die (${res.protection.before} → rolled ${res.protection.rolled}, keeps ${res.protection.after}). `;
    if (res && a.reveal >= 3) notes += res.winner ? `<b>${TC.TEAM_INFO[res.winner].name} wins Zone ${z}.</b>` : "<b>Tie — no victor.</b>";

    let foot = "";
    if (cur.stage === "ready" && !a.rolling && humans.length) foot = `<button class="btn primary lg pulse" data-act="cr-roll" id="btn-crisis-roll">🎲 Roll Defense Readiness</button>`;
    else if (cur.stage === "done" && a.reveal >= 3 && humans.length) foot = `<button class="btn primary lg" data-act="cr-next" id="btn-crisis-next">${s.crisis.zoneIndex < 2 ? `Next: Zone ${TC.ZONES[s.crisis.zoneIndex + 1]} →` : "Theater-wide results →"}</button>`;

    const inst = cur.instability;
    return `<div class="modal crisis" id="crisis"><div class="modal-head"><span class="kicker" style="font-family:var(--head);letter-spacing:.24em;color:var(--gold2)">CRISIS ASSESSMENT</span><h2>Zone ${z}</h2>
        <span class="muted">${s.crisis.zoneIndex + 1} of 3</span><span style="flex:1"></span><span class="stamp ${cur.type}" style="font-size:24px">${ct.name.toUpperCase()}</span></div>
      <div class="modal-body">
        <div class="top"><div>
            <div style="display:flex;gap:16px;align-items:center;margin-bottom:10px">${K.die(10, { size: 56, value: cur.roll, cls: "land" })}
              <div><div style="font-family:var(--head);font-size:30px;line-height:1">Instability ${inst.total}</div>
              <div class="muted" style="font-size:12.5px">Deterrence ${inst.d4} vs ${inst.d10} → gap ${inst.base}${inst.assurance ? ` · +${inst.assurance} from Assurance 6–7` : ""}${inst.reduced ? ` · −${inst.reduced} Influence spent` : ""}</div>
              <div class="muted" style="font-size:12.5px">d10 roll ${cur.roll} on row ${Math.min(inst.total, 6)}${inst.total >= 6 ? "+" : ""}</div></div></div>
            ${crisisTable(cur, true)}</div>
          <div><div class="banner ${ct.violent ? "warn" : "info"}" style="margin-top:0"><b>${ct.name}</b>: winner +${ct.victor}; zone bonus +${ct.bonus} if Fourth Army wins C or Tenth Army wins A; army with higher deterrence <b>${ct.deterrence > 0 ? "+" : ""}${ct.deterrence}</b>.${ct.violent ? " Each army adds its Deterrence to its roll (+1/+2 at Assurance 6/7)." : ""}</div>
            <div class="advbar">${adv("intel", "Intelligence", "Promote 1 own die or demote 1 enemy die before rolling")}${adv("comms", "Communications", "Re-roll own lowest die, keep higher")}${adv("protection", "Protection", "Enemy re-rolls its highest die, keeps lower")}</div>
            <div class="notes">${notes}</div></div></div>
        <div class="trays">${tray("fourth")}${tray("tenth")}</div>
      </div><div class="modal-foot">${foot}</div></div>`;
  };

  async function roll() {
    const a = anim();
    a.rolling = true;
    a.reveal = 0;
    App.render();
    await K.sleep(1100);
    a.rolling = false;
    E.resolveZone(App.state);
    App.save();
    App.render();
    const cur = App.state.crisis.current;
    const res = cur.result;
    for (let step = 1; step <= 3; step++) {
      const need = (step === 1 && res.comms) || (step === 2 && res.protection) || step === 3;
      if (need) await K.sleep(900 * Math.max(0.6, App.speed()));
      a.reveal = step;
      App.render();
    }
    App.flow();
  }

  function next() {
    const s = App.state;
    App.ui.crisisAnim = { reveal: 3 };
    const last = s.crisis.zoneIndex >= 2;
    E.nextCrisisZone(s);
    if (last) {
      const th = s.crisis.theater;
      const parts = [];
      if (th.influence) parts.push(`${TC.TEAM_INFO[th.influence].name} +1 (higher Influence)`);
      TC.TEAMS.forEach((t) => th.overtasked[t].length && parts.push(`${TC.TEAM_INFO[t].name} −${th.overtasked[t].length} (over-tasked MSC)`));
      App.toast(`<div class="t"><b>Theater-wide adjudication</b><br>${parts.join("<br>") || "No theater-wide points this turn."}</div>`, null, 6000);
    }
    App.save();
    App.render();
    App.flow();
  }

  C.actions["cr-intel"] = (el) => {
    const cur = App.state.crisis.current;
    E.chooseIntel(App.state, cur.intelTeam, { kind: el.dataset.kind, group: el.dataset.group, index: Number(el.dataset.index) });
    App.save();
    App.render();
    App.flow();
  };
  C.actions["cr-roll"] = () => {
    if (App.state.crisis.current.stage === "ready" && !anim().rolling) roll();
  };
  C.actions["cr-next"] = () => next();

  let autoBusy = false;
  C.auto = async function () {
    const s = App.state;
    const cur = s.crisis && s.crisis.current;
    if (!cur || autoBusy || anim().rolling) return;
    const humans = App.humans();
    if (cur.stage === "intel" && !App.isHuman(cur.intelTeam)) {
      autoBusy = true;
      await K.sleep(800 * App.speed());
      autoBusy = false;
      if (App.state !== s || s.crisis.current !== cur) return;
      E.chooseIntel(s, cur.intelTeam, AI.intelChoice(s, cur.intelTeam));
      App.save();
      App.render();
      App.flow();
    } else if (cur.stage === "ready" && !humans.length) {
      autoBusy = true;
      await K.sleep(500 * App.speed());
      autoBusy = false;
      roll();
    } else if (cur.stage === "done" && !humans.length && anim().reveal >= 3) {
      autoBusy = true;
      await K.sleep(1600 * App.speed());
      autoBusy = false;
      if (App.state === s && s.crisis && s.crisis.current === cur) next();
    }
  };
})();
