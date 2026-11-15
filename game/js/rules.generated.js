// GENERATED from game/data/rules.json by game/tools/build_rules.js. Do not edit: change rules.json and rebuild.
(globalThis.TC = globalThis.TC || {}).RULES_DATA = {
 "start": {
  "fourth": {
   "influence": 2,
   "access": {
    "A": 1,
    "B": 1,
    "C": 2
   },
   "zones": {
    "A": {
     "assurance": 3,
     "partnerCap": 3,
     "infrastructure": 3,
     "interop": 3,
     "intel": 3,
     "stockage": 3,
     "comms": 3,
     "protection": 3
    },
    "B": {
     "assurance": 4,
     "partnerCap": 2,
     "infrastructure": 2,
     "interop": 2,
     "intel": 2,
     "stockage": 2,
     "comms": 2,
     "protection": 2
    },
    "C": {
     "assurance": 5,
     "partnerCap": 1,
     "infrastructure": 1,
     "interop": 1,
     "intel": 1,
     "stockage": 1,
     "comms": 1,
     "protection": 1
    }
   }
  },
  "tenth": {
   "influence": 2,
   "access": {
    "A": 2,
    "B": 1,
    "C": 1
   },
   "zones": {
    "A": {
     "assurance": 2,
     "partnerCap": 1,
     "infrastructure": 1,
     "interop": 1,
     "intel": 1,
     "stockage": 1,
     "comms": 1,
     "protection": 1
    },
    "B": {
     "assurance": 4,
     "partnerCap": 2,
     "infrastructure": 2,
     "interop": 2,
     "intel": 2,
     "stockage": 2,
     "comms": 2,
     "protection": 2
    },
    "C": {
     "assurance": 4,
     "partnerCap": 3,
     "infrastructure": 3,
     "interop": 3,
     "intel": 3,
     "stockage": 3,
     "comms": 3,
     "protection": 3
    }
   }
  }
 },
 "crisisRows": [
  {
   "min": 0,
   "max": 1,
   "sq": 7,
   "sof": 9,
   "lim": 10
  },
  {
   "min": 2,
   "max": 4,
   "sq": 3,
   "sof": 6,
   "lim": 9
  },
  {
   "min": 5,
   "max": null,
   "sq": 1,
   "sof": 3,
   "lim": 7
  }
 ],
 "crisisTypes": {
  "SQ": {
   "key": "SQ",
   "name": "Status Quo",
   "victor": 1,
   "bonus": 1,
   "deterrence": 1,
   "violent": false
  },
  "SOF": {
   "key": "SOF",
   "name": "Show of Force",
   "victor": 2,
   "bonus": 1,
   "deterrence": 1,
   "violent": false
  },
  "LIM": {
   "key": "LIM",
   "name": "Limited Operation",
   "victor": 4,
   "bonus": 1,
   "deterrence": -3,
   "violent": true
  },
  "LSCO": {
   "key": "LSCO",
   "name": "Large-Scale Combat Operation",
   "victor": 7,
   "bonus": 1,
   "deterrence": -3,
   "violent": true
  }
 },
 "tasks": [
  {
   "id": "task_01",
   "num": 1,
   "name": "Access agreement",
   "fn": "Set and maintain the theater",
   "blocked": true,
   "staff": [
    "PLANS",
    "SIG"
   ],
   "commands": [
    "TSC",
    "SPT",
    "SIG"
   ],
   "caps": [
    "TRANS",
    "CA",
    "SIG"
   ],
   "points": 5,
   "cost": {
    "influence": 1
   },
   "effects": {
    "access": 3,
    "infrastructure": 1,
    "comms": 1
   }
  },
  {
   "id": "task_02",
   "num": 2,
   "name": "Threat monitoring",
   "fn": "Perform CCDOR",
   "mode": "E",
   "staff": [],
   "commands": [
    "MI",
    "SIG",
    "FIRES"
   ],
   "caps": [
    "MI",
    "SIG",
    "MULT DOM"
   ],
   "points": 8,
   "effects": {
    "intel": 2
   }
  },
  {
   "id": "task_03",
   "num": 3,
   "name": "Contingency planning",
   "fn": "Perform CCDOR",
   "mode": "P",
   "staff": "ALL",
   "commands": [],
   "caps": [],
   "points": 0,
   "effects": {
    "intel": 1,
    "comms": 1,
    "protection": 1
   }
  },
  {
   "id": "task_04",
   "num": 4,
   "name": "Intelligence support",
   "fn": "Set and maintain the theater",
   "staff": [
    "INTEL"
   ],
   "commands": [
    "MI"
   ],
   "caps": [
    "MI",
    "CA"
   ],
   "points": 7,
   "effects": {
    "influence": 1,
    "interop": 1,
    "intel": 1
   }
  },
  {
   "id": "task_05",
   "num": 5,
   "name": "Information operations",
   "fn": "Set and maintain the theater",
   "staff": [
    "FIRES",
    "INTEL"
   ],
   "commands": [
    "FIRES",
    "MI"
   ],
   "caps": [
    "IO",
    "CA"
   ],
   "points": 5,
   "effects": {},
   "branches": [
    {
     "key": "GAIN",
     "label": "Gain +1 Influence",
     "effects": {
      "influence": 1
     }
    },
    {
     "key": "DENY",
     "label": "Opponent −1 Influence (no Disruption card needed)",
     "oppEffects": {
      "influence": -1
     }
    }
   ]
  },
  {
   "id": "task_06",
   "num": 6,
   "name": "Theater distribution",
   "fn": "Set and maintain the theater",
   "mode": "E",
   "staff": [],
   "commands": [
    "TSC",
    "ESC"
   ],
   "caps": [
    "TRANS",
    "SUST"
   ],
   "points": 6,
   "effects": {
    "stockage": 1
   }
  },
  {
   "id": "task_07",
   "num": 7,
   "name": "RSOI",
   "fn": "Set and maintain the theater",
   "special": "rsoi",
   "staff": [
    "SUST",
    "OPS"
   ],
   "commands": [
    "TSC",
    "ANY"
   ],
   "caps": [
    "TRANS",
    "SUST",
    "ANY"
   ],
   "points": 5,
   "effects": {}
  },
  {
   "id": "task_08",
   "num": 8,
   "name": "SPP contact event",
   "fn": "Perform CCDOR",
   "blocked": true,
   "staff": [
    "OPS"
   ],
   "commands": [
    "SPT",
    "ANY"
   ],
   "caps": [
    "ANY"
   ],
   "points": 3,
   "effects": {
    "influence": 2,
    "partnerCap": 1,
    "intel": 1
   }
  },
  {
   "id": "task_09",
   "num": 9,
   "name": "Combined exercise",
   "fn": "Perform CCDOR",
   "blocked": true,
   "staff": [
    "OPS",
    "SUST"
   ],
   "commands": [
    "ANY",
    "TSC"
   ],
   "caps": [
    "ANY",
    "SUST"
   ],
   "points": 5,
   "effects": {
    "assurance": 1,
    "partnerCap": 1,
    "interop": 1
   }
  },
  {
   "id": "task_10",
   "num": 10,
   "name": "HNS agreement",
   "fn": "Set and maintain the theater",
   "blocked": true,
   "staff": [
    "SUST",
    "OPS"
   ],
   "commands": [
    "TSC",
    "SPT"
   ],
   "caps": [],
   "points": 5,
   "cost": {
    "influence": 1
   },
   "effects": {},
   "branches": [
    {
     "key": "SUST",
     "label": "Sustainment path: Stockage +1",
     "caps": [
      "SUST"
     ],
     "effects": {
      "stockage": 1
     }
    },
    {
     "key": "CA",
     "label": "Civil Affairs path: Infrastructure +1",
     "caps": [
      "CA"
     ],
     "effects": {
      "infrastructure": 1
     }
    }
   ],
   "options": [
    {
     "key": "MP",
     "label": "Add Military Police: Protection +1",
     "caps": [
      "MP"
     ],
     "effects": {
      "protection": 1
     }
    }
   ]
  },
  {
   "id": "task_11",
   "num": 11,
   "name": "Stockage adjustment",
   "fn": "Set and maintain the theater",
   "staff": [
    "SUST",
    "PLANS"
   ],
   "commands": [
    "TSC",
    "ENG"
   ],
   "caps": [
    "SUST",
    "ENG"
   ],
   "points": 7,
   "cost": {
    "access": 2
   },
   "effects": {
    "assurance": 1,
    "stockage": 1
   },
   "options": [
    {
     "key": "MED",
     "label": "Add Medical: Assurance +2 instead of +1",
     "commands": [
      "MED"
     ],
     "caps": [
      "MED"
     ],
     "effects": {
      "assurance": 1
     }
    }
   ]
  },
  {
   "id": "task_12",
   "num": 12,
   "name": "Military engagement",
   "fn": "Perform CCDOR",
   "blocked": true,
   "staff": [
    "PLANS",
    "OPS"
   ],
   "commands": [
    "SPT",
    "ANY"
   ],
   "caps": [
    "CA",
    "ANY"
   ],
   "points": 5,
   "effects": {
    "access": 1,
    "influence": 1,
    "partnerCap": 1
   }
  },
  {
   "id": "task_13",
   "num": 13,
   "name": "Security force assistance",
   "fn": "Perform CCDOR",
   "blocked": true,
   "staff": [
    "OPS",
    "INTEL"
   ],
   "commands": [
    "ANY"
   ],
   "caps": [
    "SFA",
    "DIG LN"
   ],
   "points": 7,
   "effects": {
    "access": 1,
    "partnerCap": 1,
    "interop": 1
   },
   "options": [
    {
     "key": "MI",
     "label": "Add Military Intelligence: Intelligence +1",
     "caps": [
      "MI"
     ],
     "effects": {
      "intel": 1
     }
    }
   ]
  },
  {
   "id": "task_14",
   "num": 14,
   "name": "Basing agreement",
   "fn": "Set and maintain the theater",
   "blocked": true,
   "staff": [
    "SUST",
    "ENG"
   ],
   "commands": [
    "ENG",
    "TSC"
   ],
   "caps": [
    "ENG",
    "SUST"
   ],
   "points": 4,
   "cost": {
    "influence": 2,
    "access": 3
   },
   "effects": {
    "assurance": 2,
    "infrastructure": 2
   }
  },
  {
   "id": "task_15",
   "num": 15,
   "name": "Storage agreement",
   "fn": "Set and maintain the theater",
   "blocked": true,
   "staff": [
    "SUST",
    "ENG"
   ],
   "commands": [
    "TSC"
   ],
   "caps": [
    "SUST"
   ],
   "points": 5,
   "cost": {
    "influence": 2,
    "access": 2
   },
   "effects": {},
   "branches": [
    {
     "key": "ENG",
     "label": "Engineer path: Stockage +2",
     "commands": [
      "ENG"
     ],
     "caps": [
      "ENG"
     ],
     "effects": {
      "stockage": 2
     }
    },
    {
     "key": "MED",
     "label": "Medical path: Assurance +2",
     "commands": [
      "MED"
     ],
     "caps": [
      "MED"
     ],
     "effects": {
      "assurance": 2
     }
    }
   ]
  },
  {
   "id": "task_16",
   "num": 16,
   "name": "Communications network development",
   "fn": "Set and maintain the theater",
   "staff": [
    "SIG"
   ],
   "commands": [
    "SIG"
   ],
   "caps": [
    "SIG",
    "MI"
   ],
   "points": 5,
   "cost": {
    "access": 1
   },
   "effects": {
    "comms": 2
   }
  },
  {
   "id": "task_17",
   "num": 17,
   "name": "Medical operations",
   "fn": "Set and support the operational area",
   "staff": [
    "MED"
   ],
   "commands": [
    "MED",
    "SPT"
   ],
   "caps": [
    "MED",
    "CA"
   ],
   "points": 5,
   "effects": {
    "infrastructure": 1,
    "interop": 1,
    "intel": 1
   }
  },
  {
   "id": "task_18",
   "num": 18,
   "name": "Force health protection",
   "fn": "Set and support the operational area",
   "staff": [
    "PROT",
    "MED",
    "INTEL"
   ],
   "commands": [
    "MED"
   ],
   "caps": [
    "MED"
   ],
   "points": 3,
   "effects": {
    "protection": 1
   }
  },
  {
   "id": "task_19",
   "num": 19,
   "name": "Police operations",
   "fn": "Set and support the operational area",
   "staff": [
    "PROT",
    "OPS",
    "INTEL"
   ],
   "commands": [
    "MP"
   ],
   "caps": [
    "MP",
    "MI"
   ],
   "points": 5,
   "cost": {
    "access": 2
   },
   "effects": {
    "assurance": 1,
    "protection": 1
   }
  },
  {
   "id": "task_20",
   "num": 20,
   "name": "CBRN operations",
   "fn": "Set and support the operational area",
   "staff": [
    "PROT",
    "MED",
    "OPS"
   ],
   "commands": [
    "CBRN"
   ],
   "caps": [
    "CBRN"
   ],
   "points": 5,
   "effects": {
    "protection": 2
   }
  },
  {
   "id": "task_21",
   "num": 21,
   "name": "AMD support",
   "fn": "Set and support the operational area",
   "staff": [
    "PROT",
    "OPS"
   ],
   "commands": [
    "AMD"
   ],
   "caps": [
    "AMD",
    "MI"
   ],
   "points": 5,
   "effects": {
    "protection": 2
   }
  }
 ]
};
