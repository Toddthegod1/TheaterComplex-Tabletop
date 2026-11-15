"""Browser play-through: clicks through whole campaigns in a real (headless) browser.

    pip install playwright && playwright install chromium
    python game/tests/playthrough.py                 # all four modes, 4 turns each
    python game/tests/playthrough.py fourth,hotseat  # only these modes
    python game/tests/playthrough.py all 390x844     # at phone size

Modes: fourth (you vs AI), tenth, hotseat (two players), watch (AI vs AI).
For each mode it starts a seeded 4-turn campaign and presses whatever the game
is waiting for until the after-action review appears. It fails (exit code 1) if
the page logs an error, if the game stops responding, or if a campaign does not
reach the end. The rules themselves are covered by run.js; this covers the screens.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

GAME = (pathlib.Path(__file__).resolve().parent.parent / "index.html").as_uri()
ALL_MODES = ["fourth", "tenth", "hotseat", "watch"]
modes = sys.argv[1].split(",") if len(sys.argv) > 1 and sys.argv[1] != "all" else ALL_MODES
width, height = (int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else "1366x768").split("x"))

# First-time tips and sound would only get in the way here.
QUIET = 'try{localStorage.setItem("theatercomplex.tips","off");localStorage.setItem("theatercomplex.sound","off")}catch(e){}'

# Tried in order on every step; the first one that is on screen gets clicked.
BUTTONS = [
    "#confirm .btn.primary",                 # "Submit anyway" and similar confirmations
    "[data-act=curtain-ok]",                 # hot-seat hand-off
    "#btn-roll",                             # roll for the task limit
    "#btn-continue",                         # overlays: limit result, initiative, tailoring
    "#as-confirm:not([disabled])",           # ASOS: commit forces
    "[data-act=as-auto]:not([disabled])",    # ASOS: auto-select
    "[data-act=as-unmet]",                   # ASOS: cannot be met
    "[data-act=asos-open].primary",          # ASOS: open the next request
    "[data-act=asos-done]:not([disabled])",  # ASOS: proceed to planning
    "SUGGEST",                               # planning: "Suggest a plan", once per planner
    "#btn-submit:not([disabled])",           # planning: submit
    "[data-act=exec]:not([disabled])",       # implementation: execute the first task
    "#btn-crisis",                           # proceed to Crisis Assessment
    "[data-act=cr-intel]",                   # crisis: use the Intelligence advantage
    "#btn-crisis-roll",
    "#btn-crisis-next",
]
STATE = "() => { const s = TC.app.state; return s ? [s.phase, s.turn, s.log.length, !!TC.app.ui.modal, !!TC.app.ui.overlay, TC.app.ui.curtain] : null }"


def play(browser, mode):
    errors = []
    page = browser.new_page(viewport={"width": width, "height": height})
    page.add_init_script(QUIET)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.goto(GAME)
    page.wait_for_timeout(400)
    page.click("[data-act=setup]")
    page.wait_for_timeout(200)
    key = {"fourth": "ai4", "tenth": "ai10", "hotseat": "hotseat", "watch": "aiai"}[mode]
    page.click(f"[data-act=setup-set][data-key=mode][data-val='\"{key}\"']")
    page.click("[data-act=setup-set][data-key=turns][data-val='4']")
    page.click("[data-act=setup-set][data-key=aiSpeed][data-val='0.4']")
    page.fill("[data-act=setup-seed]", "123")
    page.click("[data-act=start]")
    page.wait_for_timeout(500)

    idle = 0
    last = None
    suggested = None
    state = None
    for _ in range(1200):
        state = page.evaluate(STATE)
        if not state or state[0] == "gameOver":
            break
        clicked = None
        for sel in BUTTONS:
            try:
                if sel == "SUGGEST":
                    who = (state[1], page.evaluate("() => TC.app.me()"))
                    if state[0] == "planning" and suggested != who and page.query_selector("#btn-suggest"):
                        suggested = who
                        page.click("#btn-suggest", timeout=1500)
                        clicked = sel
                        break
                    continue
                el = page.query_selector(sel)
                if el and el.is_visible():
                    el.click(timeout=1500)
                    clicked = sel
                    break
            except Exception:
                pass  # covered or re-rendered mid-click: try again next step
        page.wait_for_timeout(250 if clicked else 500)
        idle = idle + 1 if state == last else 0
        last = state
        if idle > 40:
            errors.append(f"game stopped responding at {state} (last click: {clicked})")
            break
    final = page.evaluate("() => { const s = TC.app.state; return s ? [s.phase, s.turn, s.teams.fourth.score, s.teams.tenth.score] : null }")
    if not final or final[0] != "gameOver":
        errors.append(f"campaign did not finish: {final}")
    elif not page.query_selector(".endstage"):
        errors.append("after-action review is not on screen")
    page.close()
    return final, errors


failed = False
with sync_playwright() as p:
    browser = p.chromium.launch()
    for mode in modes:
        final, errors = play(browser, mode)
        print(f"{mode:8} {'FAIL' if errors else 'ok  '} final {final}")
        for e in errors[:5]:
            print("   ", e)
        failed = failed or bool(errors)
    browser.close()
sys.exit(1 if failed else 0)
