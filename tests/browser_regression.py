"""Run with Python + playwright (and `playwright install chromium`). No HA login needed."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = """<home-assistant></home-assistant><script>
const ha = document.querySelector('home-assistant').attachShadow({mode:'open'});
ha.innerHTML='<home-assistant-main></home-assistant-main>';
const main=ha.firstElementChild.attachShadow({mode:'open'});
main.innerHTML='<hui-root></hui-root>';
window.makeDashboard=()=>{
 const host=document.createElement('hui-root');
 const root=host.attachShadow({mode:'open'});
 root.innerHTML=`<div class="header"><div class="toolbar"><ha-menu-button></ha-menu-button><ha-tab-group><ha-tab-group-tab active>Home</ha-tab-group-tab></ha-tab-group><div class="action-items"></div></div></div><hui-view></hui-view>`;
 const view=root.querySelector('hui-view').attachShadow({mode:'open'});
 for(let i=0;i<300;i++){const card=document.createElement('audit-card');card.attachShadow({mode:'open'}).innerHTML='<span>state</span>';view.append(card)}
 main.replaceChildren(host);window.dashboard=root;window.cards=view;
 window.moves=0;new MutationObserver(r=>window.moves+=r.length).observe(root.querySelector('.toolbar'),{childList:true});
};makeDashboard();
</script>"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.route("http://ha-audit.test/**", lambda route: route.fulfill(
        content_type="text/javascript" if route.request.url.endswith(".js") else "text/html",
        body=(ROOT / "dist/ha-native-nav-position.js").read_text() if route.request.url.endswith(".js") else HTML,
    ))
    page.goto("http://ha-audit.test/lovelace/home")
    page.evaluate("import('/nav.js')")
    page.wait_for_timeout(1200)
    assert page.evaluate("moves") == 0, "An already positioned tab group must not be moved"
    assert page.evaluate("[...cards.children].every(c=>!c.shadowRoot.querySelector('style'))"), "Do not inject into card roots"
    baseline = page.evaluate("__haNativeNavPositionState.observers.size")
    assert baseline < 30
    for _ in range(8):
        page.evaluate("makeDashboard(); dispatchEvent(new Event('location-changed'))")
        page.wait_for_timeout(150)
    page.wait_for_timeout(1000)
    assert page.evaluate("__haNativeNavPositionState.observers.size") == baseline
    assert page.evaluate("__haNativeNavPositionState.tabScrollHandlers.size") == 1
    assert page.evaluate("moves") == 0
    page.evaluate("document.createElement('ha-native-nav-position').setConfig({enabled:false})")
    page.wait_for_timeout(200)
    assert page.evaluate("__haNativeNavPositionState.tabScrollHandlers.size") == 0
    assert page.evaluate("!dashboard.querySelector('[data-ha-native-nav-position-active]')")
    browser.close()
print("PASS: no observer feedback, no card injection, detached-root/listener cleanup, disable")
