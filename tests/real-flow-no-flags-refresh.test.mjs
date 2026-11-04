import { readFileSync, existsSync, mkdirSync } from 'fs';
import { createServer } from 'http';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, waitForScreen,
  postsTo, firstBody, USER_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const SHOT_DIR = '/opt/cursor/artifacts/screenshots';
const htmlVer = (index.match(/var app_version = '([^']+)'/) || [])[1];

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(htmlVer, 'app_version pin');
assert.ok(new RegExp("APP_VERSION = '" + htmlVer + "'").test(sw));
assert.ok(/function isWkOn\(/.test(index));
assert.ok(/see_wk/.test(index));

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function stub(){
  return async function(route, info){
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: (info.body && info.body.id) || 'sess-flags' }, info.body || {})]);
      return true;
    }
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: 'cw-flags', sections: (info.body && info.body.sections) || [] }, info.body || {})]);
      return true;
    }
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/psyche_drills') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: 'aw-flags', deleted_at: null }, info.body || {})]);
      return true;
    }
    if(info.method === 'GET' && info.url.indexOf('/rest/v1/psyche_drills') !== -1){
      await fulfillJson(route, 200, []);
      return true;
    }
    return false;
  };
}

async function boot(page){
  await page.waitForFunction(function(){
    return typeof window.isWkOn === 'function' && typeof window.newTrainSessionState === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window.prompt = function(_msg, def){ return def || 'Flags workout'; };
    try{ localStorage.removeItem('see_train_notice_hint'); }catch(e){}
    try{ localStorage.removeItem('see_train_session_draft'); }catch(e){}
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

async function shot(page, name, selector){
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if(selector){
    await page.evaluate(function(sel){
      document.documentElement.style.scrollBehavior = 'auto';
      var el = document.querySelector(sel);
      if(!el) return;
      var node = el.parentElement;
      while(node && node !== document.body){
        var s = getComputedStyle(node);
        var oy = s.overflowY;
        if((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 2){
          var top = el.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop - 12;
          node.scrollTop = Math.max(0, top);
          return;
        }
        node = node.parentElement;
      }
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, selector);
  }
  await page.screenshot({ path: join(SHOT_DIR, name), animations: 'disabled' });
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await boot(page);
    var fresh = await page.evaluate(function(){
      return {
        on: isWkOn(),
        stored: localStorage.getItem('see_wk')
      };
    });
    assert.strictEqual(fresh.on, true, 'fresh profile (empty see_wk) gets the new builder');
    assert.strictEqual(fresh.stored, null, 'fresh profile does not write a flag');

    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Fresh');
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
      trainAddBlock('emom');
      var emom = trainSessionState.blocks[0];
      emom.rounds[0].boulders = [{ id: uid(), text: 'V3 blue', complete: false }];
      renderTrainSessionBuilder();
      toggleWkBoulder(emom.id, 0, emom.rounds[0].boulders[0].id);
    });
    await page.waitForSelector('#train-blocks-wrap .wk-notice-card', { timeout: 5000 });
    var menu = await page.evaluate(function(){
      return document.getElementById('train-block-menu').textContent;
    });
    assert.ok(menu.indexOf('Climbing (EMOM)') !== -1, 'fresh profile menu is the new builder');
    await shot(page, 'fresh-builder-awareness.png', '#train-blocks-wrap .wk-notice-card');

    await page.click('#train-sess-save');
    await page.waitForTimeout(400);
    assert.ok(firstBody(postsTo(recorded, 'training_sessions', 'POST')), 'empty awareness does not block Save');
    await waitForScreen(page, 'screen-train-done');
    var aw = postsTo(recorded, 'psyche_drills', 'POST').filter(function(r){
      var b = Array.isArray(r.body) ? r.body[0] : r.body;
      return b && b.drill_key === 'awareness';
    });
    assert.strictEqual(aw.length, 0, 'skipped notice writes no awareness row');
  });

  for(const q of ['?wk=1', '?wk=0', '?aw=1', '?wk=0&aw=1']){
    await withPage(browser, port, {
      path: '/index.html' + q,
      viewport: { width: 390, height: 844 }
    }, async function(page){
      await page.waitForFunction(function(){ return typeof window.isWkOn === 'function'; }, null, { timeout: 30000 });
      var r = await page.evaluate(function(){
        return { on: isWkOn(), stored: localStorage.getItem('see_wk') };
      });
      assert.strictEqual(r.on, true, q + ' leaves the builder on');
      assert.ok(r.stored !== '0' && r.stored !== '1', q + ' does not write see_wk, got ' + r.stored);
    });
  }

  await withPage(browser, port, {
    path: '/index.html?wk=1&aw=1',
    viewport: { width: 390, height: 844 },
    storage: { see_wk: '0' }
  }, async function(page){
    await boot(page);
    var legacy = await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Legacy hatch');
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
      var m = document.getElementById('train-block-menu');
      return {
        on: isWkOn(),
        menu: Array.prototype.map.call(m.querySelectorAll('button'), function(b){ return b.textContent.trim(); }),
        card: !!document.querySelector('.wk-notice-card, .wk-notice-link')
      };
    });
    assert.strictEqual(legacy.on, false, 'see_wk=0 is the legacy hatch even with ?wk=1');
    assert.deepStrictEqual(legacy.menu, ['Add section', 'EMOM', 'Weighted circuit', 'Rep-level pass/fail']);
    assert.strictEqual(legacy.card, false, 'legacy hatch hides the awareness prompt');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page){
    await boot(page);
    var opened = await page.evaluate(function(){
      var legacy = [
        { id: 'e1', shape: 'emom', title: 'Old EMOM', rounds: [{ boulders: [{ text: 'V3 saved' }], notes: '', rest_after_sec: 90, complete: false }] },
        { id: 'h1', shape: 'rep_pass_fail', title: 'Old hangs', grip: 'Half crimp', assistance: '15 lbs', sets: [{ reps: [{ ok: null }, { ok: null }] }], complete: false }
      ];
      trainSessionState = newTrainSessionState('Boulders', 'Saved legacy');
      trainSessionState.blocks = legacy;
      showScreen('screen-train-session');
      var threw = false;
      try{ renderTrainSessionBuilder(); }catch(e){ threw = true; }
      var html = document.getElementById('train-blocks-wrap').innerHTML;
      localStorage.setItem('see_train_session_draft', JSON.stringify({
        id: 'draft-legacy',
        title: 'Draft legacy',
        energy_type: 'Boulders',
        blocks: [{ id: 'd1', shape: 'emom', title: 'Draft EMOM', rounds: [{ boulders: [{ text: 'V2 draft' }], notes: '', rest_after_sec: 90, complete: false }] }],
        warm_up: '',
        cool_down: ''
      }));
      trainSessionState = null;
      showScreen('screen-home');
      showScreen('screen-train-session');
      var draftHtml = document.getElementById('train-blocks-wrap').innerHTML;
      return {
        threw: threw,
        saved: /V3 saved/.test(html),
        draft: /V2 draft/.test(draftHtml),
        on: isWkOn()
      };
    });
    assert.strictEqual(opened.threw, false, 'legacy saved JSON opens');
    assert.ok(opened.saved, 'legacy saved session renders');
    assert.ok(opened.draft, 'in-progress legacy draft opens');
    assert.strictEqual(opened.on, true);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){
      showScreen('screen-home');
      trainSessionState = null;
      var sheet = document.getElementById('edit-sheet');
      if(sheet) sheet.style.display = 'none';
      _seeHadController = true;
      _seeUpdateReloading = false;
      try{ sessionStorage.removeItem('see_update_later'); }catch(e){}
      window._seeReloads = 0;
      seeReloadForUpdate = function(){ window._seeReloads++; _seeUpdateReloading = true; };
    });
    var hub = await page.evaluate(function(){
      markSeeUpdatePending();
      markSeeUpdatePending();
      return { reloads: window._seeReloads, hub: seeOnCleanHub(), banner: document.getElementById('see-update-banner').hidden };
    });
    assert.strictEqual(hub.hub, true);
    assert.strictEqual(hub.reloads, 1, 'clean hub controllerchange reloads once');
    assert.strictEqual(hub.banner, true, 'clean hub does not leave the banner up');

    var mid = await page.evaluate(function(){
      window._seeReloads = 0;
      _seeUpdateReloading = false;
      trainSessionState = newTrainSessionState('Boulders', 'Mid flow');
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
      markSeeUpdatePending();
      var banner = document.getElementById('see-update-banner');
      var refresh = document.getElementById('see-update-refresh');
      var later = document.getElementById('see-update-later');
      var save = document.getElementById('train-sess-save');
      save.scrollIntoView({ block: 'end' });
      var sr = save.getBoundingClientRect();
      var br = banner.getBoundingClientRect();
      var rr = refresh.getBoundingClientRect();
      var lr = later.getBoundingClientRect();
      return {
        reloads: window._seeReloads,
        hidden: banner.hidden,
        text: (refresh.textContent || '').trim(),
        later: (later.textContent || '').trim(),
        refreshH: rr.height,
        laterH: lr.height,
        coversSave: sr.bottom > br.top + 1 && sr.top < br.bottom,
        sheet: seeEditSheetOpen()
      };
    });
    assert.strictEqual(mid.reloads, 0, 'mid-flow does not reload');
    assert.strictEqual(mid.hidden, false);
    assert.strictEqual(mid.text, 'Update ready · Refresh');
    assert.strictEqual(mid.later, 'Later');
    assert.ok(mid.refreshH >= 44 && mid.laterH >= 44, '44px hit area ' + mid.refreshH + '/' + mid.laterH);
    assert.strictEqual(mid.coversSave, false, 'banner does not cover Save');
    await shot(page, 'update-banner-midflow.png', '#train-sess-save');

    var later = await page.evaluate(function(){
      document.getElementById('see-update-later').click();
      return {
        hidden: document.getElementById('see-update-banner').hidden,
        flag: sessionStorage.getItem('see_update_later')
      };
    });
    assert.strictEqual(later.hidden, true, 'Later dismisses the banner');
    assert.strictEqual(later.flag, '1');

    var flows = await page.evaluate(function(){
      function check(screenId, setup){
        window._seeReloads = 0;
        _seeUpdateReloading = false;
        try{ sessionStorage.removeItem('see_update_later'); }catch(e){}
        hideSeeUpdateBanner();
        if(setup) setup();
        showScreen(screenId);
        markSeeUpdatePending();
        return window._seeReloads;
      }
      return {
        log: check('screen-log-act'),
        deeper: check('screen-deeper'),
        sheet: check('screen-home', function(){
          trainSessionState = null;
          document.getElementById('edit-sheet').style.display = 'flex';
        }),
        climb: check('screen-sessions', function(){
          trainSessionState = null;
          document.getElementById('edit-sheet').style.display = 'none';
        }),
        train: check('screen-train', function(){ trainSessionState = null; }),
        psyche: check('screen-drill', function(){ trainSessionState = null; })
      };
    });
    assert.strictEqual(flows.log, 0, 'log flow does not reload');
    assert.strictEqual(flows.deeper, 0, 'Go Deeper does not reload');
    assert.strictEqual(flows.sheet, 0, 'open edit sheet does not reload');
    assert.strictEqual(flows.climb, 1, 'Climb hub reloads');
    assert.strictEqual(flows.train, 1, 'Train hub reloads');
    assert.strictEqual(flows.psyche, 1, 'Psyche hub reloads');
  });

  await runServiceWorkerChecks(browser);
  assert.ok(/localStorage\.getItem\(WK_LS_KEY\) === '0'/.test(index));
  assert.ok(!/WK_DEFAULT_ON/.test(index), 'URL/default flag concept is gone');
  assert.ok(!/q\.get\('wk'\)/.test(index) && !/q\.get\('aw'\)/.test(index), 'wk and aw URL params are not read');
  assert.ok(!/_hangLoadSrc/.test(index), 'load forward-fill keeps no hidden source');
  assert.ok(/cache:\s*'no-cache'/.test(sw), 'app shell fetch bypasses the HTTP cache');
  assert.ok(/3000/.test(sw), 'app shell network timeout is 3 seconds');
  assert.ok(/skipWaiting\(/.test(sw) && /clients\.claim\(/.test(sw));
  assert.ok(/updateViaCache:\s*'none'/.test(index));
  assert.ok(/SEE_SW_UPDATE_MIN_MS = 600000/.test(index));
  assert.ok(/Update ready · Refresh/.test(index));
  assert.ok(/id="see-update-banner"/.test(index));
  console.log('real-flow-no-flags-refresh: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}

function htmlFor(version){
  return index.replace("var app_version = '" + htmlVer + "'", "var app_version = '" + version + "'");
}
function swFor(version){
  return sw.replace("var APP_VERSION = '" + htmlVer + "'", "var APP_VERSION = '" + version + "'");
}

function startVersionServer(state){
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
  };
  return new Promise(function(resolve){
    const server = createServer(function(req, res){
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if(urlPath === '/') urlPath = '/index.html';
      var body;
      var type;
      if(urlPath === '/index.html'){
        body = Buffer.from(htmlFor(state.version));
        type = MIME['.html'];
      } else if(urlPath === '/sw.js'){
        body = Buffer.from(swFor(state.version));
        type = MIME['.js'];
      } else {
        var filePath = join(root, urlPath);
        if(!filePath.startsWith(root) || !existsSync(filePath)){
          res.writeHead(404); res.end('not found'); return;
        }
        body = readFileSync(filePath);
        type = MIME[extname(filePath)] || 'application/octet-stream';
      }
      var send = function(){
        res.writeHead(200, {
          'Content-Type': type,
          'Cache-Control': 'public, max-age=86400'
        });
        res.end(body);
      };
      if(state.delayMs && urlPath === '/index.html') setTimeout(send, state.delayMs);
      else send();
    });
    server.listen(0, '127.0.0.1', function(){
      resolve({ server: server, port: server.address().port });
    });
  });
}

async function bootControlled(page){
  await page.addInitScript(function(){
    try{
      localStorage.setItem('see_consent_v1', JSON.stringify({ at: 1 }));
      localStorage.setItem('see_baseline_complete', '1');
      localStorage.setItem('see_auth_dismissed', '1');
      localStorage.setItem('see_tips_enabled', '0');
      localStorage.setItem('see_device_id', 'dev_sw');
    }catch(e){}
  });
  await page.route('**/*', async function(route){
    var url = route.request().url();
    if(url.indexOf('cdn.jsdelivr.net') !== -1){
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* cdn stub */' });
    }
    if(url.indexOf('supabase.co') !== -1){
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.continue();
  });
}

async function runServiceWorkerChecks(browser){
  const state = { version: 'index900', delayMs: 0 };
  const started = await startVersionServer(state);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try{
    await bootControlled(page);
    await page.goto('http://127.0.0.1:' + started.port + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(function(){
      var screen = document.querySelector('.screen.active');
      return !!(screen && navigator.serviceWorker && navigator.serviceWorker.controller);
    }, null, { timeout: 20000 });
    assert.strictEqual(await page.evaluate(function(){ return app_version; }), 'index900');

    state.version = 'index901';
    await page.evaluate(async function(){
      var reg = await navigator.serviceWorker.getRegistration();
      if(reg && reg.update) await reg.update();
    });
    await page.waitForFunction(function(){ return window.app_version === 'index901'; }, null, { timeout: 20000 });
    var keys = await page.evaluate(function(){ return caches.keys(); });
    assert.ok(keys.indexOf('see-shell-index901') !== -1, 'new cache exists: ' + keys.join(','));
    assert.ok(keys.indexOf('see-shell-index900') === -1, 'old cache deleted on activate: ' + keys.join(','));

    state.delayMs = 4000;
    var t0 = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    var elapsed = Date.now() - t0;
    assert.ok(elapsed < 3800, '3s timeout fell back to cache in ' + elapsed + 'ms');
    assert.strictEqual(await page.evaluate(function(){ return app_version; }), 'index901');
    state.delayMs = 0;

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    assert.strictEqual(await page.evaluate(function(){ return app_version; }), 'index901', 'offline reload uses the cache');
    await context.setOffline(false);
  } finally {
    await context.close();
    await new Promise(function(resolve){ started.server.close(resolve); });
  }
}
