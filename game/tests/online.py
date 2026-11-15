"""Online play test: two separate browsers connect and play whole turns against each other.

    python game/tests/online.py [turns]      (default 2)

One browser hosts as Fourth Army, the other joins with the invite and reply
codes exactly as two people would. Both then play: ASOS, planning (hidden until
both submit), implementation, crisis. After every phase the two browsers must
hold the same game. Exits 1 on any page error, stall or mismatch.
Needs: pip install playwright && playwright install chromium
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

GAME = (pathlib.Path(__file__).resolve().parent.parent / "index.html").as_uri()
TURNS = int(sys.argv[1]) if len(sys.argv) > 1 else 2
QUIET = 'try{localStorage.setItem("theatercomplex.tips","off");localStorage.setItem("theatercomplex.sound","off")}catch(e){}'
errors = []

# The shared part of the game (everything except who sits where and bookkeeping flags).
SHARED = """() => {
  const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).filter((k) => k !== "_s").sort().map((k) => [k, canon(v[k])])) : v;
  const s = canon(TC.app.state);
  delete s.controllers;
  s.log = s.log.map((l) => JSON.stringify(l)).sort();   // the order of simultaneous ASOS lines may differ
  return JSON.stringify(s);
}"""
PHASE = "() => TC.app.state ? [TC.app.state.turn, TC.app.state.phase] : null"


def page_for(browser, name):
    page = browser.new_context(viewport={"width": 1366, "height": 768}).new_page()
    page.add_init_script(QUIET)
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{name}: {m.text}"))
    page.goto(GAME)
    page.wait_for_timeout(400)
    return page


def wait_for(page, js, what, seconds=20):
    for _ in range(seconds * 5):
        if page.evaluate(js):
            return True
        page.wait_for_timeout(200)
    errors.append(f"timed out waiting for: {what}")
    return False


def same(host, guest, where):
    host.wait_for_timeout(500)
    a = json.loads(host.evaluate(SHARED))
    b = json.loads(guest.evaluate(SHARED))
    if a != b:
        diff = [k for k in a if a[k] != b.get(k)]
        errors.append(f"browsers disagree after {where}: {diff}")


def do_asos(page):
    for _ in range(4):
        if not page.query_selector("[data-act=asos-open].primary"):
            break
        page.click("[data-act=asos-open].primary")
        page.wait_for_timeout(300)
        if page.query_selector("[data-act=as-auto]:not([disabled])"):
            page.click("[data-act=as-auto]")
            page.wait_for_timeout(200)
            page.click("#as-confirm")
        else:
            page.click("[data-act=as-unmet]")
        page.wait_for_timeout(300)


def do_plan(page):
    page.click("#btn-suggest")
    page.wait_for_timeout(300)
    page.click("#btn-submit")
    page.wait_for_timeout(400)
    if page.query_selector("#confirm .btn.primary"):
        page.click("#confirm .btn.primary")
    page.wait_for_timeout(300)


with sync_playwright() as p:
    browser = p.chromium.launch()
    host = page_for(browser, "host")
    guest = page_for(browser, "guest")

    # ---- connect, the way two people would
    host.click("[data-act=setup]")
    host.wait_for_timeout(200)
    host.click("[data-act=setup-set][data-key=mode][data-val='\"online\"']")
    host.click(f"[data-act=setup-set][data-key=turns][data-val='4']")
    host.fill("[data-act=setup-seed]", "321")
    host.click("[data-act=start]")
    wait_for(host, "() => { const t = document.getElementById('net-invite'); return t && t.value.startsWith('TC') }", "invite code")
    invite = host.input_value("#net-invite")
    guest.click("[data-act=online-join]")
    guest.fill("#net-invite-in", invite)
    guest.click("#net-join")
    wait_for(guest, "() => !!document.getElementById('net-reply-out')", "reply code")
    reply = guest.input_value("#net-reply-out")
    host.fill("#net-reply", reply)
    host.click("#net-accept")
    ok = wait_for(guest, "() => TC.net.active && TC.app.state && TC.app.ui.screen === 'game'", "guest to receive the game", 30)
    print(f"invite code {len(invite)} characters, reply code {len(reply)} characters, connected: {ok}")
    if ok:
        print("host is", host.evaluate("() => TC.net.team"), "| guest is", guest.evaluate("() => TC.net.team"))
        for turn in range(1, TURNS + 1):
            # Only the host can roll; the guest's button does nothing but explain.
            host.click("#btn-roll")
            wait_for(guest, "() => TC.app.state.phase === 'asos'", "guest to see ASOS")
            host.click("#btn-continue")
            host.wait_for_timeout(300)
            # ASOS: both at once.
            do_asos(guest)
            do_asos(host)
            same(host, guest, f"turn {turn} ASOS")
            host.click("[data-act=asos-done]")
            wait_for(guest, "() => TC.app.state.phase === 'planning'", "guest to see planning")
            # Planning: the guest submits first; the host must not be able to see that plan yet.
            do_plan(guest)
            leaked = host.evaluate("() => TC.app.state.plans[TC.other(TC.net.team)].tasks.length")
            ready_seen = wait_for(host, "() => TC.app.state.plans[TC.other(TC.net.team)].ready", "host to see that the guest submitted")
            if leaked:
                errors.append("the guest's plan reached the host before the host submitted")
            do_plan(host)
            wait_for(guest, "() => TC.app.state.phase === 'implementation'", "guest to see implementation")
            host.click("#btn-continue")
            same(host, guest, f"turn {turn} start of implementation")
            # Implementation: whoever holds initiative acts.
            for _ in range(60):
                if host.evaluate("() => TC.app.state.impl && TC.app.state.impl.done"):
                    break
                for pg in (host, guest):
                    btn = pg.query_selector("[data-act=exec]:not([disabled])")
                    if btn:
                        btn.click()
                        pg.wait_for_timeout(350)
                        break
                else:
                    host.wait_for_timeout(300)
            same(host, guest, f"turn {turn} implementation")
            host.click("#btn-crisis")
            for zone in range(3):
                wait_for(guest, "() => TC.app.state.phase === 'crisis'", "guest to see the crisis")
                host.wait_for_timeout(400)
                for pg in (host, guest):  # whoever has the Intelligence advantage uses it
                    die = pg.query_selector("[data-act=cr-intel]")
                    if die:
                        die.click()
                        pg.wait_for_timeout(500)
                host.click("#btn-crisis-roll")
                wait_for(host, "() => !!document.getElementById('btn-crisis-next')", "crisis result", 30)
                same(host, guest, f"turn {turn} crisis zone {zone + 1}")
                host.click("#btn-crisis-next")
                host.wait_for_timeout(500)
            wait_for(guest, "() => TC.app.state.phase === 'tailoring' && !!TC.app.state.tailoring", "guest to see force tailoring")
            host.click("#btn-continue")
            wait_for(guest, f"() => TC.app.state.turn === {turn + 1} || TC.app.state.phase === 'gameOver'", "guest to see the next turn")
            same(host, guest, f"turn {turn} cleanup")
            print(f"turn {turn} ok: score", host.evaluate("() => [TC.app.state.teams.fourth.score, TC.app.state.teams.tenth.score]"))
    browser.close()

for e in errors[:10]:
    print("FAIL", e)
print("online play:", "FAILED" if errors else "ok")
sys.exit(1 if errors else 0)
