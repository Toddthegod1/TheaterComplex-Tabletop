"""Generate game/js/data.generated.js from dig_game_database_master.xlsx.

The workbook is the designer's source of truth for card stats. Re-run this
script after editing the workbook so the digital game picks up the changes.

Usage:  python tools/build_data.py
"""

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "dig_game_database_master.xlsx"
ART_INDEX = ROOT / "tools" / "capability_art_index.csv"
OUT = ROOT / "game" / "js" / "data.generated.js"

TEAM_KEY = {"Fourth Army": "fourth", "Tenth Army": "tenth"}
TEAM_PREFIX = {"Fourth Army": "4a", "Tenth Army": "10a"}
ZONE_FOLDER = {"A": "zoneA", "B": "zoneB", "C": "zoneC", "GFM": "zoneGfm"}

# Command card name -> (art key, MSC code used by task requirements)
COMMANDS = {
    "10th Army Air and Missile Defense Command": ("10aamdc", "AMD"),
    "200th Military Police Command": ("200mp", "MP"),
    "20th Chemical Biological Radiological Nuclear Explosives Command": ("20cbrne", "CBRN"),
    "21st Sustainment Command": ("21tsc", "TSC"),
    "2d Signal Brigade": ("2sig", "SIG"),
    "353d Civil Affairs Command": ("353ca", "CA"),
    "3d Sustainment Command": ("3esc", "ESC"),
    "412th Engineer Command": ("412tec", "ENG"),
    "56th Artillery Command": ("56fires", "FIRES"),
    "66th Military Intelligence Brigade": ("66mi", "MI"),
    "68th Medical Command": ("68tmc", "MED"),
    "7th Mission Support Command": ("7msc", "SPT"),
}

SHORT_NAMES = {
    "10aamdc": "10th AAMDC", "200mp": "200th MP Cmd", "20cbrne": "20th CBRNE Cmd",
    "21tsc": "21st TSC", "2sig": "2d Signal Bde", "353ca": "353d CA Cmd",
    "3esc": "3d ESC", "412tec": "412th TEC", "56fires": "56th Artillery Cmd",
    "66mi": "66th MI Bde", "68tmc": "68th Medical Cmd", "7msc": "7th MSC",
}

STAFF_CODES = {
    "Engineer": "ENG", "Fires": "FIRES", "Intelligence": "INTEL", "Medical": "MED",
    "Operations": "OPS", "Plans": "PLANS", "Protection": "PROT", "Signal": "SIG",
    "Sustainment": "SUST",
}

MEASURE_KEYS = {
    "Deterrence": "deterrence",
    "Partner Capability": "partnerCap",
    "Infrastructure Capacity": "infrastructure",
    "Partner Interoperability": "interop",
    "Stockage Levels": "stockage",
}


def rows(ws):
    data = list(ws.iter_rows(values_only=True))
    header = data[0]
    return [dict(zip(header, r)) for r in data[1:] if any(v is not None for v in r)]


def build_capabilities(wb):
    pool = defaultdict(list)
    with open(ART_INDEX, newline="") as f:
        for r in csv.DictReader(f):
            key = (r["team"], r["capab"], r["start_zone"], int(r["capab_points"]), r["deterrence_value"])
            pool[key].append(r["art_id"])

    caps = []
    for r in rows(wb["dig_cards_capabilities"]):
        key = (r["Team"], r["Capab"], r["StartZone"], int(r["CapabPointValue"]), str(r["DeterrenceValue"]))
        if not pool[key]:
            raise SystemExit(f"No card art matches workbook row {key}; update {ART_INDEX.name}")
        art_id = pool[key].pop(0)
        army = "fourth_army" if r["Team"] == "Fourth Army" else "tenth_army"
        cat = int(str(r["DeterrenceValue"]).split("/")[-1])
        caps.append({
            "id": art_id,
            "team": TEAM_KEY[r["Team"]],
            "name": r["CapabilityLongName"],
            "code": r["Capab"],
            "startZone": r["StartZone"],
            "points": int(r["CapabPointValue"]),
            "cat": cat,
            "art": f"img/capabilities/{army}/{ZONE_FOLDER[r['StartZone']]}/{art_id}.webp",
        })
    leftover = [ids for ids in pool.values() if ids]
    if leftover:
        raise SystemExit(f"Card art without workbook rows: {leftover}")
    caps.sort(key=lambda c: c["id"])
    return caps


def build_commands(wb):
    cmds = []
    for r in rows(wb["dig_cards_command_usareuraf"]):
        key, code = COMMANDS[r["LONGDSCR"]]
        prefix = TEAM_PREFIX[r["Team"]]
        cmds.append({
            "id": f"{prefix}_{key}",
            "team": TEAM_KEY[r["Team"]],
            "name": r["LONGDSCR"],
            "short": SHORT_NAMES[key],
            "code": code,
            "startZone": "GFM" if r["StartZone"] == "GFM" else "THEATER",
            "art": f"img/commands/usareuraf/{prefix}_cards_command_usareuraf_{key}.webp",
        })
    return cmds


def build_staff(wb):
    staff = {"fourth": {}, "tenth": {}}
    for r in rows(wb["dig_cards_staff"]):
        staff[TEAM_KEY[r["Team"]]][STAFF_CODES[r["Cell"]]] = int(r["Count"])
    return staff


def build_asos(wb):
    cards = []
    for i, r in enumerate(rows(wb["dig_cards_ASOS"]), start=1):
        art = "img/asos/cards_asos_.webp" if i == 1 else f"img/asos/cards_asos_{i}.webp"
        types = [t for t in (r["ASOSRqmt1"], r["ASOSRqmt2"]) if t]
        cards.append({"id": f"asos_{i:02d}", "name": r["UnitNameNew"],
                      "points": int(r["ASOSCapabPointsRqmt"]), "types": types, "art": art})
    return cards


def build_legend(wb):
    """Turn the tracker min/max table into value -> die lookups per zone."""
    legend = {key: {z: {} for z in "ABC"} for key in MEASURE_KEYS.values()}
    seen = set()
    for r in rows(wb["dig_trackers_min_max"]):
        key = MEASURE_KEYS.get(r["Measure"])
        if not key:
            continue
        sig = (key, r["Zone"], r["MinValue"], r["MaxValue"])
        if sig in seen:  # the workbook repeats two Zone A deterrence rows
            continue
        seen.add(sig)
        effect = r["Effect"] or ""
        if key in ("deterrence", "partnerCap"):
            value = int(re.search(r"is d(\d+)", effect).group(1))
        elif key in ("infrastructure", "interop"):
            value = int(re.search(r"\+(\d+)d[46]", effect).group(1))
        else:
            m = re.match(r"([+-]\d+)", effect)
            value = int(m.group(1)) if m else 0
        for v in range(int(r["MinValue"]), int(r["MaxValue"]) + 1):
            legend[key][r["Zone"]][v] = value
    return legend


def main():
    wb = openpyxl.load_workbook(WORKBOOK, data_only=True)
    data = {
        "capabilities": build_capabilities(wb),
        "commands": build_commands(wb),
        "staffSlots": build_staff(wb),
        "asos": build_asos(wb),
        "dieLegend": build_legend(wb),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// GENERATED by tools/build_data.py from dig_game_database_master.xlsx. Do not edit by hand.\n"
        "globalThis.TC = globalThis.TC || {};\n"
        f"TC.GENERATED = {json.dumps(data, indent=1)};\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT.relative_to(ROOT)}: {len(data['capabilities'])} capabilities, "
          f"{len(data['commands'])} commands, {len(data['asos'])} ASOS cards")


if __name__ == "__main__":
    main()
