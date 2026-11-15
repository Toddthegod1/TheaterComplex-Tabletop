// Hand-maintained game data that is NOT in the workbook: task-card requirements
// (transcribed from assets/tasks/*_front.png and *_back.png), starting tracker
// values (Rulebook Enclosure 2), scoring and the Crisis Assessment table.
(function () {
  const TC = (globalThis.TC = globalThis.TC || {});

  TC.TEAMS = ["fourth", "tenth"];
  TC.ZONES = ["A", "B", "C"];
  TC.TEAM_INFO = {
    fourth: { name: "Fourth Army", short: "4th", prefix: "4a", marker: "black", homeZone: "A", objectiveZone: "C" },
    tenth: { name: "Tenth Army", short: "10th", prefix: "10a", marker: "white", homeZone: "C", objectiveZone: "A" },
  };
  TC.other = (team) => (team === "fourth" ? "tenth" : "fourth");

  // Zone trackers (1–7 on the printed cards). Influence/Access are holding boxes.
  TC.TRACKERS = [
    { key: "assurance", label: "Assurance", short: "ASR" },
    { key: "partnerCap", label: "Partner Capability", short: "PCAP" },
    { key: "infrastructure", label: "Infrastructure Capacity", short: "INFRA" },
    { key: "interop", label: "Partner Interoperability", short: "INTOP" },
    { key: "intel", label: "Intelligence", short: "INTEL" },
    { key: "stockage", label: "Stockage Levels", short: "STOCK" },
    { key: "comms", label: "Communications", short: "COMMS" },
    { key: "protection", label: "Protection", short: "PROT" },
  ];
  TC.TRACKER_MIN = 1;
  TC.TRACKER_MAX = 7;
  TC.INFLUENCE_MAX = 10;
  TC.ACCESS_MAX = 10;

  TC.EFFECT_LABELS = {
    influence: "Influence", access: "Access", assurance: "Assurance",
    partnerCap: "Partner Capability", infrastructure: "Infrastructure Capacity",
    interop: "Partner Interoperability", intel: "Intelligence", stockage: "Stockage",
    comms: "Communications", protection: "Protection",
  };

  // Rulebook Enclosure 2 — Initial Tracker Values. (Deterrence is not listed
  // here because the game computes it from the capability cards in each zone;
  // the computed values reproduce Enclosure 2 exactly: 4th 3/6/5, 10th 5/6/3.)
  // The values live in game/data/rules.json ("start").
  TC.START = TC.RULES_DATA.start;

  TC.STAFF_CELLS = [
    { code: "ENG", name: "Engineer" }, { code: "FIRES", name: "Fires" },
    { code: "INTEL", name: "Intelligence" }, { code: "MED", name: "Medical" },
    { code: "OPS", name: "Operations" }, { code: "PLANS", name: "Plans" },
    { code: "PROT", name: "Protection" }, { code: "SIG", name: "Signal" },
    { code: "SUST", name: "Sustainment" },
  ];

  TC.CAPABILITY_TYPES = {
    AMD: "Air & Missile Defense", AR: "Armor", AV: "Aviation", CA: "Civil Affairs",
    CBRN: "CBRN", "DIG LN": "Digital Liaison", ENG: "Engineer", FIRES: "Fires",
    IN: "Infantry", "IN-AASLT": "Air Assault", "IN-ABN": "Airborne", "IN-STRY": "Stryker",
    IO: "Information Ops", MED: "Medical", MI: "Military Intelligence", MP: "Military Police",
    "MULT DOM": "Multi-Domain", SFA: "Security Force Assistance", SIG: "Signal",
    SUST: "Sustainment", TBX: "Transportation (Exped.)", TRANS: "Transportation",
  };
  // Expeditionary transportation satisfies a Transportation requirement.
  TC.CAPABILITY_ALIASES = { TBX: ["TRANS"] };

  TC.COMMAND_TYPES = {
    TSC: "Theater Sustainment (21st TSC)", ESC: "Expeditionary Sustainment (3d ESC)",
    SPT: "Mission Support (7th MSC)", SIG: "Signal (2d Sig Bde)", MI: "Military Intel (66th MI Bde)",
    FIRES: "Artillery (56th Arty Cmd)", ENG: "Engineer (412th TEC)", MED: "Medical (68th Med Cmd)",
    MP: "Military Police (200th MP Cmd)", CBRN: "CBRNE (20th CBRNE Cmd)",
    AMD: "Air & Missile Defense (10th AAMDC)", CA: "Civil Affairs (353d CA Cmd)",
  };

  // MSC bandwidth: two free slots, then three red "overtasked" slots (card art).
  TC.MSC_FREE_SLOTS = 2;
  TC.MSC_MAX_TASKS = 5;

  // Tasks whose card shows the T×T icon: unavailable at Assurance 6–7.
  // staff: list of staff cells, or "ALL" (one marker on every staff card).
  // commands / caps: one entry per box on the card; "ANY" is a dotted box.
  // branches: choose exactly one (card shows "OR"). options: dashed "(opt.)" boxes.
  // The cards themselves live in game/data/rules.json ("tasks"), transcribed from
  // the card art; game/tools/build_rules.js checks them and writes rules.generated.js.
  TC.TASKS = TC.RULES_DATA.tasks;
  TC.TASKS.forEach((t) => {
    t.mode = t.mode || "N";
    t.cost = t.cost || {};
    t.art = {
      fourth: { front: `img/tasks/4a_cards_task_${t.num}a_front.webp`, back: `img/tasks/4a_cards_task_${t.num}b_back.webp` },
      tenth: { front: `img/tasks/10a_cards_task_${t.num}a_front.webp`, back: `img/tasks/10a_cards_task_${t.num}b_back.webp` },
    };
  });
  TC.taskByNum = (n) => TC.TASKS[n - 1];

  // ----------------------------------------------------------------------
  // CRISIS ASSESSMENT TABLE ("Determine Escalation"), from the adjudicator
  // sheet (docs/img/crisis-assessment-sheet.png).
  // Each row covers an Instability band (min..max; the last row has no max)
  // and gives the highest d10 result for Status Quo, Show of Force and
  // Limited Operation. Anything above `lim` is LSCO.
  // ----------------------------------------------------------------------
  // The numbers live in game/data/rules.json ("crisisTable").
  TC.CRISIS_TABLE = { rows: TC.RULES_DATA.crisisRows };
  TC.CRISIS_BANDS = ["calm", "tense", "volatile"];
  TC.crisisRowLabel = (row) => (row.max == null ? `${row.min}+` : row.max === row.min ? `${row.min}` : `${row.min}–${row.max}`);

  TC.CRISIS_TYPES = TC.RULES_DATA.crisisTypes; // game/data/rules.json ("crisisTypes")

  TC.DIE_STEPS = [4, 6, 8, 10, 12];

  TC.DEFAULT_SETTINGS = {
    turns: 6,
    capsMustBeInTaskZone: true,
    commandsCountTowardRff: true,
    planTimerMinutes: 0,
    aiSpeed: 1,
    aiLevel: "normal",
  };
})();
