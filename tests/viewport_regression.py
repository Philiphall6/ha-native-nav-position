"""Real layout tests for iOS dock drift, viewport changes and lifecycle cleanup."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('NAV_TEST_SOURCE', ROOT / 'dist/ha-native-nav-position.js'))
HTML = '''<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0}home-assistant{display:block} </style>
<home-assistant></home-assistant><script>
const ha=document.querySelector('home-assistant').attachShadow({mode:'open'});
ha.innerHTML='<style>home-assistant-main{display:block;height:100vh}</style><home-assistant-main></home-assistant-main>';
window.shell=ha.querySelector('home-assistant-main');
const main=shell.attachShadow({mode:'open'});
window.makeDashboard=()=>{
 main.innerHTML='<hui-root></hui-root>';
 const root=main.firstElementChild.attachShadow({mode:'open'});
 root.innerHTML='<div class="header"><div class="toolbar"><ha-menu-button></ha-menu-button><ha-tab-group><ha-tab-group-tab active>Home</ha-tab-group-tab><ha-tab-group-tab>Lights</ha-tab-group-tab></ha-tab-group><div class="action-items"></div></div></div><hui-view style="display:block;height:2200px"></hui-view>';
 window.header=root.querySelector('.header');window.dashboard=root;
};makeDashboard();
window.gap=()=>innerHeight-header.getBoundingClientRect().bottom;
window.configure=c=>document.createElement('ha-native-nav-position').setConfig(c);
</script>'''

with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        options = {}
        if engine == 'webkit' and os.environ.get('NAV_WEBKIT_EXECUTABLE'):
            options['executable_path'] = os.environ['NAV_WEBKIT_EXECUTABLE']
        browser = getattr(p, engine).launch(**options)
        for ios in [False, True]:
            context = browser.new_context(viewport={'width':390,'height':844},
                user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' if ios else None)
            page = context.new_page()
            page.route('http://nav.test/**', lambda route: route.fulfill(
                content_type='text/javascript' if route.request.url.endswith('.js') else 'text/html',
                body=SOURCE.read_text() if route.request.url.endswith('.js') else HTML))
            page.goto('http://nav.test/lovelace/home')
            page.evaluate("import('/nav.js')")
            page.wait_for_timeout(900)
            initial_gap = page.evaluate('gap()')
            page.evaluate('scrollTo(0,200)')
            page.wait_for_timeout(150)
            assert abs(page.evaluate('gap()')-initial_gap)<1, (engine,'ordinary scrolling')
            if not ios:
                assert page.evaluate('!__haNativeNavPositionState.viewportAnchor?.listening')
                context.close()
                continue
            # A containing block displaced by scrolling used to carry the dock away.
            page.evaluate("shell.style.transform='translateY(-68px)';dispatchEvent(new Event('scroll'))")
            page.wait_for_timeout(150)
            drift = page.evaluate('gap()')-initial_gap
            print(engine,'iOS containing-block drift after correction:',round(drift,2),flush=True)
            assert abs(drift)<1, (engine,'dock moved with its containing block',drift)
            for y in [450,700,250,0]:
                page.evaluate('(y)=>scrollTo(0,y)',y)
                page.wait_for_timeout(150)
                assert abs(page.evaluate('gap()')-initial_gap)<1, (engine,y,page.evaluate('({gap:gap(),scrollY,shift:header.style.cssText,vv:[visualViewport.height,visualViewport.offsetTop,visualViewport.scale],innerHeight})'))
            page.evaluate("shell.style.transform='none';dispatchEvent(new Event('scroll'))")
            page.wait_for_timeout(100)
            # Emulate a visual viewport changing independently of the layout viewport.
            page.evaluate('''() => {
              window.vv=new EventTarget();Object.assign(vv,{height:700,offsetTop:20,scale:1});
              Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});
              configure({enabled:false});
            }''')
            page.wait_for_timeout(100)
            page.evaluate('configure({enabled:true})');page.wait_for_timeout(150)
            assert abs(page.evaluate('header.getBoundingClientRect().bottom')-(720-initial_gap))<1
            for height, offset in [(620,0),(760,12),(844,0)]:
                page.evaluate('([height,offset])=>{vv.height=height;vv.offsetTop=offset;vv.dispatchEvent(new Event("resize"))}',[height,offset])
                page.wait_for_timeout(150)
                assert abs(page.evaluate('header.getBoundingClientRect().bottom')-(height+offset-initial_gap))<1
            # Duplicate events should not produce repeated style writes or feedback.
            page.evaluate('''() => {window.writes=0;window.mo=new MutationObserver(r=>writes+=r.length);
              mo.observe(header,{attributes:true,attributeFilter:['style']});
              for(let i=0;i<50;i++)vv.dispatchEvent(new Event('scroll'));
            }''')
            page.wait_for_timeout(200)
            assert page.evaluate('writes')==0, (engine,'unnecessary idle writes')
            # Pinch zoom yields to native positioning.
            page.evaluate("vv.scale=2;vv.dispatchEvent(new Event('resize'))")
            page.wait_for_timeout(100)
            assert page.evaluate("!header.style.getPropertyValue('--ha-native-nav-viewport-shift')")
            page.evaluate("vv.scale=1;configure({position:'top'})")
            page.wait_for_timeout(150)
            assert page.evaluate('!__haNativeNavPositionState.viewportAnchor.listening')
            page.evaluate("configure({position:'bottom'});window.oldHeader=header;makeDashboard();dispatchEvent(new Event('location-changed'))")
            page.wait_for_timeout(700)
            assert page.evaluate('__haNativeNavPositionState.viewportAnchor.headers.size')==1
            assert page.evaluate("!oldHeader.style.getPropertyValue('--ha-native-nav-viewport-shift')")
            # Editing/settings restore native layout and tear down the extra handlers.
            page.evaluate("dashboard.host.lovelace={editMode:true};dispatchEvent(new Event('location-changed'))")
            page.wait_for_timeout(150)
            assert page.evaluate('!__haNativeNavPositionState.viewportAnchor.listening')
            page.evaluate("dashboard.host.lovelace={editMode:false};dispatchEvent(new Event('location-changed'))")
            page.wait_for_timeout(200)
            page.evaluate("history.pushState({},'', '/config/dashboard');dispatchEvent(new Event('location-changed'))")
            page.wait_for_timeout(150)
            assert page.evaluate('!__haNativeNavPositionState.viewportAnchor.listening && !__haNativeNavPositionState.viewportAnchor.frame')
            context.close()
        browser.close()
print('PASS: Chromium/WebKit, drift, viewport resizing, scrolling, zoom, no idle writes, top/edit/settings cleanup')
