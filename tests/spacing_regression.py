"""Check single-container spacing, hidden dock, resizing and editor restoration."""
from pathlib import Path
from playwright.sync_api import sync_playwright
SOURCE = Path(__file__).resolve().parents[1] / 'dist/ha-native-nav-position.js'
HTML = '''<style>body{margin:0}</style><home-assistant></home-assistant><script>
const root=document.querySelector('home-assistant').attachShadow({mode:'open'});
root.innerHTML='<hui-root></hui-root>';
const host=root.firstElementChild;window.dash=host.attachShadow({mode:'open'});
dash.innerHTML=`<style>.header{height:56px;position:fixed;top:0}hui-view-container{display:block;box-sizing:border-box;min-height:100vh;padding-top:56px}.edit-mode hui-view-container{padding-top:112px}hui-view{display:block}</style><div class="layout"><div class="header"><div class="toolbar"><ha-tab-group><ha-tab-group-tab active>Home</ha-tab-group-tab></ha-tab-group></div></div><hui-view-container><hui-view><div style="height:100px">Cards</div></hui-view></hui-view-container></div>`;
window.header=dash.querySelector('.header');window.view=dash.querySelector('hui-view-container');
window.configure=c=>document.createElement('ha-native-nav-position').setConfig(c);
window.metrics=()=>({top:parseFloat(getComputedStyle(view).paddingTop),bottom:parseFloat(getComputedStyle(view).paddingBottom),inner:parseFloat(getComputedStyle(view.firstElementChild).paddingBottom),height:view.getBoundingClientRect().height,header:header.getBoundingClientRect().height,gap:parseFloat(getComputedStyle(header).bottom)});
</script>'''
with sync_playwright() as p:
 b=p.chromium.launch();page=b.new_page(viewport={'width':1200,'height':800})
 page.route('http://spacing.test/**',lambda r:r.fulfill(content_type='text/javascript' if r.request.url.endswith('.js') else 'text/html',body=SOURCE.read_text() if r.request.url.endswith('.js') else HTML))
 page.goto('http://spacing.test/lovelace/home');page.evaluate("import('/nav.js')");page.wait_for_timeout(900)
 m=page.evaluate('metrics()');print('bottom',m);assert m['top']==0 and m['inner']==0;assert abs(m['bottom']-(m['header']+m['gap']+12))<2;assert m['height']==800
 page.evaluate("for(const p of ['height','min-height','max-height','block-size','min-block-size','max-block-size'])header.style.setProperty(p,'100px','important')");page.wait_for_timeout(300)
 m=page.evaluate('metrics()');assert m['bottom']>=112,m
 page.evaluate("header.style.setProperty('display','none','important')");page.wait_for_timeout(300);assert page.evaluate('metrics().bottom')==0
 page.evaluate("header.style.cssText='';dash.querySelector('.layout').classList.add('edit-mode');dispatchEvent(new Event('location-changed'))")
 page.wait_for_timeout(350);m=page.evaluate('metrics()');print('editing',m);assert m['top']==112 and m['bottom']==0
 page.evaluate("dash.querySelector('.layout').classList.remove('edit-mode');dispatchEvent(new Event('location-changed'))");page.wait_for_timeout(300);assert page.evaluate('metrics().top')==0
 page.evaluate("configure({position:'top'})");page.wait_for_timeout(300);m=page.evaluate('metrics()');assert m['top']>=m['header'] and m['bottom']==0
 page.evaluate('configure({enabled:false})');page.wait_for_timeout(300);m=page.evaluate('metrics()');assert m['top']==56 and m['bottom']==0
 assert page.evaluate("!view.style.getPropertyValue('--ha-nav-content-top')")
 b.close()
print('PASS: single clearance, content-sized scrolling, resize/hidden dock, editing/top/disable restoration')
