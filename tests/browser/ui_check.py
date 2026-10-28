"""Optional real-browser check (desktop + phone sizes). Uses a throwaway database.

Needs Python 3 with Playwright and a Chromium browser installed:
    pip install playwright && python -m playwright install chromium
Run from the project folder:  python3 tests/browser/ui_check.py
Screenshots are saved to a temporary folder that is printed at the end.
"""
import os, sqlite3, subprocess, sys, time, tempfile, urllib.request

PROJECT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHOTS = tempfile.mkdtemp(prefix="outreach-shots-")
PORT = os.environ.get("UI_CHECK_PORT", "3103")
BASE = f"http://127.0.0.1:{PORT}"
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


tmp = tempfile.mkdtemp(prefix="outreach-ui-")
db_path = os.path.join(tmp, "ui.db")
env = dict(os.environ, PORT=PORT, DATABASE_PATH=db_path)
server = subprocess.Popen(
    ["node", "--disable-warning=ExperimentalWarning", "src/server.js"],
    cwd=PROJECT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
)
try:
    for _ in range(40):
        try:
            urllib.request.urlopen(BASE + "/api/health", timeout=1)
            break
        except Exception:
            time.sleep(0.25)
    else:
        sys.exit("server did not start")

    # Add one hostile record to prove page text can't run as code.
    con = sqlite3.connect(db_path)
    cur = con.execute(
        "INSERT INTO prospects (business_name, website, industry, city, source, status, is_sample) "
        "VALUES (?, ?, 'Test', 'Testville', 'Manual entry', 'new', 1)",
        ('<img src=x onerror="window.__xss=1">Evil & Co', 'javascript:alert(1)'),
    )
    con.execute("INSERT INTO contacts (prospect_id, full_name, is_primary) VALUES (?, ?, 1)",
                (cur.lastrowid, '<b>Bold Name</b>'))
    con.commit(); con.close()

    from playwright.sync_api import sync_playwright, expect

    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- DESKTOP ----------
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()
        problems = []
        page.on("console", lambda m: problems.append(m.text) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: problems.append(str(e)))

        page.goto(BASE + "/#prospects")
        page.wait_for_selector("table.prospects-table tbody tr")
        check("desktop: badge shows dry-run", "Dry-run" in page.inner_text("#mode-badge"))
        check("desktop: 10 rows on page 1", page.locator("tbody tr").count() == 10)
        summary = page.inner_text(".summary")
        check("desktop: summary counts all 25 records (24 sample + 1 test)", "Showing 10 of 25" in summary, summary)
        check("desktop: table headers visible", page.locator("thead").is_visible())

        # hostile record displayed as plain text, nothing executed
        page.fill("#q", "evil")
        expect(page.locator('tbody tr')).to_have_count(1)
        row_text = page.inner_text("tbody tr")
        check("XSS: markup shown as literal text", "<img src=x" in row_text and "<b>Bold Name</b>" in row_text, row_text[:60])
        check("XSS: script did not run", page.evaluate("window.__xss") is None)
        check("XSS: javascript: link not made clickable", page.locator("tbody tr a").count() == 0)

        # search
        page.fill("#q", "dental")
        expect(page.locator('tbody tr')).to_contain_text("Bluegum")
        expect(page.locator('tbody tr')).to_have_count(1)
        check("search 'dental' -> Bluegum only", "Bluegum" in page.inner_text("tbody tr") and page.locator("tbody tr").count() == 1)
        page.fill("#q", "pharmacy")
        expect(page.locator('tbody tr')).to_contain_text("Orchard Road")
        page.fill("#q", "thandi")
        expect(page.locator('tbody tr')).to_contain_text("Bluegum")
        expect(page.locator('tbody tr')).to_have_count(1)
        check("search by contact name 'thandi' -> Bluegum only", "Bluegum" in page.inner_text("tbody tr") and page.locator("tbody tr").count() == 1)

        # empty state + clear
        page.fill("#q", "zzzznothing")
        page.wait_for_selector(".empty")
        check("empty state message shown", "Nothing matches" in page.inner_text(".empty"))
        page.click(".empty button")
        page.wait_for_selector("tbody tr")
        check("clear button restores full list", "of 25" in page.inner_text(".summary") and page.input_value("#q") == "")

        # filters
        page.select_option("#status", "follow_up")
        expect(page.locator('.summary')).to_contain_text('filtered')
        statuses = page.locator("tbody tr td[data-label='Status']").all_inner_texts()
        check("status filter shows only 'Follow-up due'", len(statuses) > 0 and all(s == "Follow-up due" for s in statuses), str(statuses))
        page.select_option("#city", "Johannesburg")
        page.wait_for_timeout(400)
        cities = page.locator("tbody tr td[data-label='City']").all_inner_texts()
        check("status + city filters combine", len(cities) > 0 and all(c == "Johannesburg" for c in cities), str(cities))
        page.click("button:has-text('Clear filters')")
        expect(page.locator('.summary')).to_contain_text('of 25'); expect(page.locator('.summary')).not_to_contain_text('filtered')
        check("clear filters resets", page.input_value("#status") == "" and page.input_value("#city") == "")

        # pagination
        check("Previous disabled on page 1", page.locator("button:has-text('Previous')").is_disabled())
        page.click("button:has-text('Next')")
        expect(page.locator('.pager')).to_contain_text('Page 2')
        check("pagination shows 'Page 2 of 3'", "Page 2 of 3" in page.inner_text(".pager"))
        page.click("button:has-text('Next')")
        expect(page.locator('.pager')).to_contain_text('Page 3')
        check("last page has 5 rows, Next disabled", page.locator("tbody tr").count() == 5 and page.locator("button:has-text('Next')").is_disabled())

        # sorting
        page.select_option("#sort", "newest")
        expect(page.locator('.pager')).to_contain_text('Page 1')
        check("sort newest puts test record first", "Evil" in page.inner_text("tbody tr:first-child"))

        # navigation
        page.click("a[href='#dashboard']")
        page.wait_for_selector("h1:has-text('Dashboard')")
        check("nav: dashboard placeholder + aria-current", page.get_attribute("a[href='#dashboard']", "aria-current") == "page")
        page.click("a[href='#prospects']")
        page.wait_for_selector("table.prospects-table")
        page.select_option("#sort", "name")
        page.wait_for_timeout(300)
        page.screenshot(path=f"{SHOTS}/desktop.png", full_page=False)

        check("desktop: no console errors or CSP violations", not problems, "; ".join(problems)[:200])
        ctx.close()

        # ---------- MOBILE ----------
        ctx = browser.new_context(viewport={"width": 375, "height": 812}, device_scale_factor=2, has_touch=True, is_mobile=True)
        page = ctx.new_page()
        mproblems = []
        page.on("console", lambda m: mproblems.append(m.text) if m.type in ("error", "warning") else None)
        page.goto(BASE + "/#prospects")
        page.wait_for_selector("tbody tr")
        no_scroll = page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
        check("mobile: no sideways scrolling", no_scroll, str(page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")))
        check("mobile: filter panel starts collapsed", page.evaluate("document.querySelector('.filter-panel').open") is False)
        first_top = page.evaluate("document.querySelector('tbody tr').getBoundingClientRect().top")
        check("mobile: first result visible without scrolling", first_top < 812, f"top={first_top:.0f}px of 812")
        nav_right = page.evaluate("Math.max(...[...document.querySelectorAll('.nav a')].map(a => a.getBoundingClientRect().right))")
        check("mobile: whole menu fits on screen", nav_right <= 375, f"rightmost edge={nav_right:.0f}px")
        page.click("summary:has-text('Filters')")
        expect(page.locator("#status")).to_be_visible()
        page.select_option("#status", "replied")
        expect(page.locator(".filter-panel summary")).to_contain_text("1 active")
        expect(page.locator("tbody tr")).to_have_count(4)
        rs = page.locator("tbody tr td[data-label='Status']").all_inner_texts()
        check("mobile: opening panel and filtering works", all(x == "Replied" for x in rs), str(rs))
        page.screenshot(path=f"{SHOTS}/mobile_filters.png", full_page=False)
        page.select_option("#status", "")
        expect(page.locator(".summary")).to_contain_text("of 25")
        page.click("summary:has-text('Filters')")
        check("mobile: table header hidden (card layout)", not page.locator("thead").is_visible())
        label = page.evaluate("getComputedStyle(document.querySelector(\"tbody td[data-label='Contact']\"), '::before').content")
        check("mobile: cells show their labels", "Contact" in label, label)
        small = page.evaluate("[...document.querySelectorAll('.nav a, .button, select, input')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 44).map(e => e.tagName + ':' + (e.textContent || e.id).trim().slice(0,15))")
        check("mobile: tap targets at least 44px tall", not small, str(small))
        page.screenshot(path=f"{SHOTS}/mobile.png", full_page=False)
        check("mobile: no console errors", not mproblems, "; ".join(mproblems)[:200])
        ctx.close()
        browser.close()
finally:
    server.terminate()
    try:
        server.wait(timeout=5)
    except Exception:
        server.kill()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed  (screenshots: {SHOTS})")
sys.exit(1 if failed else 0)
