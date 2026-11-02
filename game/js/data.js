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
  TC.START = {
    fourth: {
      influence: 2,
      access: { A: 1, B: 1, C: 2 },
      zones: {
        A: { assurance: 3, partnerCap: 3, infrastructure: 3, interop: 3, intel: 3, stockage: 3, comms: 3, protection: 3 },
        B: { assurance: 4, partnerCap: 2, infrastructure: 2, interop: 2, intel: 2, stockage: 2, comms: 2, protection: 2 },
        C: { assurance: 5, partnerCap: 1, infrastructure: 1, interop: 1, intel: 1, stockage: 1, comms: 1, protection: 1 },
      },
    },
    tenth: {
      influence: 2,
      access: { A: 2, B: 1, C: 1 },
      zones: {
        A: { assurance: 2, partnerCap: 1, infrastructure: 1, interop: 1, intel: 1, stockage: 1, comms: 1, protection: 1 },
        B: { assurance: 4, partnerCap: 2, infrastructure: 2, interop: 2, intel: 2, stockage: 2, comms: 2, protection: 2 },
        C: { assurance: 4, partnerCap: 3, infrastructure: 3, interop: 3, intel: 3, stockage: 3, comms: 3, protection: 3 },
      },
    },
  };

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
  TC.TASKS = [
    { num: 1, name: "Access agreement", fn: "Set and maintain the theater", blocked: true,
      staff: ["PLANS", "SIG"], commands: ["TSC", "SPT", "SIG"], caps: ["TRANS", "CA", "SIG"], points: 5,
      cost: { influence: 1 }, effects: { access: 3, infrastructure: 1, comms: 1 } },
    { num: 2, name: "Threat monitoring", fn: "Perform CCDOR", mode: "E",
      staff: [], commands: ["MI", "SIG", "FIRES"], caps: ["MI", "SIG", "MULT DOM"], points: 8,
      effects: { intel: 2 } },
    { num: 3, name: "Contingency planning", fn: "Perform CCDOR", mode: "P",
      staff: "ALL", commands: [], caps: [], points: 0,
      effects: { intel: 1, comms: 1, protection: 1 } },
    { num: 4, name: "Intelligence support", fn: "Set and maintain the theater",
      staff: ["INTEL"], commands: ["MI"], caps: ["MI", "CA"], points: 7,
      effects: { influence: 1, interop: 1, intel: 1 } },
    { num: 5, name: "Information operations", fn: "Set and maintain the theater",
      staff: ["FIRES", "INTEL"], commands: ["FIRES", "MI"], caps: ["IO", "CA"], points: 5,
      effects: {},
      branches: [
        { key: "GAIN", label: "Gain +1 Influence", effects: { influence: 1 } },
        { key: "DENY", label: "Opponent −1 Influence (no Disruption card needed)", oppEffects: { influence: -1 } },
      ] },
    { num: 6, name: "Theater distribution", fn: "Set and maintain the theater", mode: "E",
      staff: [], commands: ["TSC", "ESC"], caps: ["TRANS", "SUST"], points: 6,
      effects: { stockage: 1 } },
    { num: 7, name: "RSOI", fn: "Set and maintain the theater",
      staff: ["SUST", "OPS"], commands: ["TSC", "ANY"], caps: ["TRANS", "SUST", "ANY"], points: 5,
      effects: {}, special: "rsoi" },
    { num: 8, name: "SPP contact event", fn: "Perform CCDOR", blocked: true,
      staff: ["OPS"], commands: ["SPT", "ANY"], caps: ["ANY"], points: 3,
      effects: { influence: 2, partnerCap: 1, intel: 1 } },
    { num: 9, name: "Combined exercise", fn: "Perform CCDOR", blocked: true,
      staff: ["OPS", "SUST"], commands: ["ANY", "TSC"], caps: ["ANY", "SUST"], points: 5,
      effects: { assurance: 1, partnerCap: 1, interop: 1 } },
    { num: 10, name: "HNS agreement", fn: "Set and maintain the theater", blocked: true,
      staff: ["SUST", "OPS"], commands: ["TSC", "SPT"], caps: [], points: 5,
      cost: { influence: 1 }, effects: {},
      branches: [
        { key: "SUST", label: "Sustainment path: Stockage +1", caps: ["SUST"], effects: { stockage: 1 } },
        { key: "CA", label: "Civil Affairs path: Infrastructure +1", caps: ["CA"], effects: { infrastructure: 1 } },
      ],
      options: [{ key: "MP", label: "Add Military Police: Protection +1", caps: ["MP"], effects: { protection: 1 } }] },
    { num: 11, name: "Stockage adjustment", fn: "Set and maintain the theater",
      staff: ["SUST", "PLANS"], commands: ["TSC", "ENG"], caps: ["SUST", "ENG"], points: 7,
      cost: { access: 2 }, effects: { assurance: 1, stockage: 1 },
      options: [{ key: "MED", label: "Add Medical: Assurance +2 instead of +1", commands: ["MED"], caps: ["MED"], effects: { assurance: 1 } }] },
    { num: 12, name: "Military engagement", fn: "Perform CCDOR", blocked: true,
      staff: ["PLANS", "OPS"], commands: ["SPT", "ANY"], caps: ["CA", "ANY"], points: 5,
      effects: { access: 1, influence: 1, partnerCap: 1 } },
    { num: 13, name: "Security force assistance", fn: "Perform CCDOR", blocked: true,
      staff: ["OPS", "INTEL"], commands: ["ANY"], caps: ["SFA", "DIG LN"], points: 7,
      effects: { access: 1, partnerCap: 1, interop: 1 },
      options: [{ key: "MI", label: "Add Military Intelligence: Intelligence +1", caps: ["MI"], effects: { intel: 1 } }] },
    { num: 14, name: "Basing agreement", fn: "Set and maintain the theater", blocked: true,
      staff: ["SUST", "ENG"], commands: ["ENG", "TSC"], caps: ["ENG", "SUST"], points: 4,
      cost: { influence: 2, access: 3 }, effects: { assurance: 2, infrastructure: 2 } },
    { num: 15, name: "Storage agreement", fn: "Set and maintain the theater", blocked: true,
      staff: ["SUST", "ENG"], commands: ["TSC"], caps: ["SUST"], points: 5,
      cost: { influence: 2, access: 2 }, effects: {},
      branches: [
        { key: "ENG", label: "Engineer path: Stockage +2", commands: ["ENG"], caps: ["ENG"], effects: { stockage: 2 } },
        { key: "MED", label: "Medical path: Assurance +2", commands: ["MED"], caps: ["MED"], effects: { assurance: 2 } },
      ] },
    { num: 16, name: "Communications network development", fn: "Set and maintain the theater",
      staff: ["SIG"], commands: ["SIG"], caps: ["SIG", "MI"], points: 5,
      cost: { access: 1 }, effects: { comms: 2 } },
    { num: 17, name: "Medical operations", fn: "Set and support the operational area",
      staff: ["MED"], commands: ["MED", "SPT"], caps: ["MED", "CA"], points: 5,
      effects: { infrastructure: 1, interop: 1, intel: 1 } },
    { num: 18, name: "Force health protection", fn: "Set and support the operational area",
      staff: ["PROT", "MED", "INTEL"], commands: ["MED"], caps: ["MED"], points: 3,
      effects: { protection: 1 } },
    { num: 19, name: "Police operations", fn: "Set and support the operational area",
      staff: ["PROT", "OPS", "INTEL"], commands: ["MP"], caps: ["MP", "MI"], points: 5,
      cost: { access: 2 }, effects: { assurance: 1, protection: 1 } },
    { num: 20, name: "CBRN operations", fn: "Set and support the operational area",
      staff: ["PROT", "MED", "OPS"], commands: ["CBRN"], caps: ["CBRN"], points: 5,
      effects: { protection: 2 } },
    { num: 21, name: "AMD support", fn: "Set and support the operational area",
      staff: ["PROT", "OPS"], commands: ["AMD"], caps: ["AMD", "MI"], points: 5,
      effects: { protection: 2 } },
  ];
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
  TC.CRISIS_TABLE = {
    rows: [
      { min: 0, max: 1, sq: 7, sof: 9, lim: 10 },
      { min: 2, max: 4, sq: 3, sof: 6, lim: 9 },
      { min: 5, max: null, sq: 1, sof: 3, lim: 7 },
    ],
  };
  TC.CRISIS_BANDS = ["calm", "tense", "volatile"];
  TC.crisisRowLabel = (row) => (row.max == null ? `${row.min}+` : row.max === row.min ? `${row.min}` : `${row.min}–${row.max}`);

  TC.CRISIS_TYPES = {
    SQ: { key: "SQ", name: "Status Quo", victor: 1, bonus: 1, deterrence: 1, violent: false },
    SOF: { key: "SOF", name: "Show of Force", victor: 2, bonus: 1, deterrence: 1, violent: false },
    LIM: { key: "LIM", name: "Limited Operation", victor: 4, bonus: 1, deterrence: -3, violent: true },
    LSCO: { key: "LSCO", name: "Large-Scale Combat Operation", victor: 7, bonus: 1, deterrence: -3, violent: true },
  };

  TC.DIE_STEPS = [4, 6, 8, 10, 12];

  TC.DEFAULT_SETTINGS = {
    turns: 6,
    capsMustBeInTaskZone: true,
    commandsCountTowardRff: true,
    planTimerMinutes: 0,
    aiSpeed: 1,
  };
})();
