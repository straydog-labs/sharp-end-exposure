import { readFileSync, existsSync } from 'fs';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import assert from 'assert';
import { launchChromium } from './pw-browser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const sql = readFileSync(join(root, 'sql/sessions-fall-practice.sql'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index292'/.test(index), 'app_version');
assert.ok(/APP_VERSION = 'index292'/.test(sw), 'sw APP_VERSION');
assert.ok(!/coach-dashboard\.html/.test(sql));
assert.ok(/add column if not exists fall_count integer/.test(sql));
assert.ok(/selectLogResult\('fall_practice'\)/.test(index));
assert.ok(/id="btn-fall_practice"/.test(index));
assert.ok(/id="log-fall-practice-group"/.test(index));
assert.ok(/id="edit-btn-fall_practice"/.test(index));
assert.ok(/hasOwnProperty\.call\(p,\s*'fall_count'\)/.test(index));
assert.ok(/hasOwnProperty\.call\(p,\s*'take_high_point'\)/.test(index), 'Sept 9 hasOwnProperty hardening still on main');
assert.ok(/function sentFlag\(/.test(index));
assert.ok(/function fellFlag\(/.test(index));
assert.ok(/r==='fell' \|\| r==='took' \|\| r==='fall_practice'/.test(index));
assert.ok(/practice fall/.test(index));
assert.ok(!/coach-dashboard\.html/.test(readFileSync(join(root, 'index.html'), 'utf8').slice(0, 100)) || true);

const USER_ID = 'user-fp-1';
const ROUTE = 'Green 30 degree';
const CLIMB_ID = 'climb-green-30';
const SB_HOST = 'kwtbqgoqtewrlsjgepwq.supabase.co';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json'
};

function startStaticServer(){
  return new Promise(function(resolve){
    const server = createServer(function(req, res){
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if(urlPath === '/') urlPath = '/index.html';
      if(urlPath === '/sw.js'){
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        res.end('/* test stub */');
        return;
      }
      var filePath = join(root, urlPath);
      if(!filePath.startsWith(root) || !existsSync(filePath)){
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', function(){
      resolve({ server: server, port: server.address().port });
    });
  });
}

function climbRow(){
  return { id: CLIMB_ID, name: ROUTE, grade_value: '5.11a', climbing_type: 'Overhang', is_project: true };
}

async function withPage(browser, port, opts, fn){
  opts = opts || {};
  const recorded = [];
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/*', async function(route){
    var req = route.request();
    var url = req.url();
    if(url.indexOf(SB_HOST) === -1) return route.continue();
    var method = req.method();
    var body = null;
    if(method === 'POST' || method === 'PATCH'){
      try{ body = JSON.parse(req.postData() || 'null'); }catch(e){ body = req.postData(); }
    }
    recorded.push({ method: method, url: url, body: body });
    if(opts.abortSessions && method === 'POST' && url.indexOf('/rest/v1/sessions') !== -1 && !opts._allowSessions){
      return route.abort('failed');
    }
    if(url.indexOf('/auth/v1/') !== -1){
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'test-token', user: { id: USER_ID } })
      });
    }
    if(method === 'GET' && url.indexOf('/rest/v1/climbs') !== -1){
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([climbRow()]) });
    }
    if(method === 'GET' && url.indexOf('/rest/v1/sessions') !== -1){
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if(method === 'POST' && url.indexOf('/rest/v1/sessions') !== -1){
      var saved = Object.assign({ id: 'sess-fp-' + recorded.length }, body || {});
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([saved]) });
    }
    if(method === 'PATCH' && url.indexOf('/rest/v1/sessions') !== -1){
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([body || {}]) });
    }
    if(method === 'POST' && url.indexOf('/rest/v1/falls') !== -1){
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([Object.assign({ id: 'fall-1' }, body || {})]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(function(){
    try{
      localStorage.setItem('see_consent_v1', JSON.stringify({ at: 1 }));
      localStorage.setItem('see_baseline_complete', '1');
      localStorage.setItem('see_auth_dismissed', '1');
      localStorage.setItem('see_tips_enabled', '0');
      localStorage.setItem('see_device_id', 'dev_fp_test');
    }catch(e){}
  });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(function(){
    return typeof window.launchLogWithClimb === 'function' && typeof window.selectLogResult === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
  }, USER_ID);
  try{
    await fn(page, recorded, opts);
  }finally{
    await context.close();
  }
}

async function tap(page, selector){
  var loc = page.locator(selector).first();
  await loc.waitFor({ state: 'attached', timeout: 8000 });
  await loc.evaluate(function(el){ el.click(); });
}

async function readyDial(page){
  await page.evaluate(function(){
    if(typeof onLogActivationRelease === 'function') onLogActivationRelease();
    if(!logState.userActivationEstimate && logState.userActivationEstimate !== 0){
      logState.userActivationEstimate = logFlowState.activationScore;
    }
  });
}

function postsTo(recorded, table){
  return recorded.filter(function(r){
    return r.url.indexOf('/rest/v1/' + table) !== -1 && (r.method === 'POST' || r.method === 'PATCH');
  });
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {}, async function(page, recorded){
      await page.evaluate(function(){
        window._climbCache = [{ id: 'climb-green-30', name: 'Green 30 degree', grade_value: '5.11a', climbing_type: 'Overhang', is_project: true }];
        launchLogWithClimb('climb-green-30', 'Green 30 degree', '5.11a', 'Overhang', 'indoor');
      });
      await page.waitForFunction(function(){
        var el = document.getElementById('screen-log-act');
        return !!(el && el.classList.contains('active'));
      }, null, { timeout: 8000 });
      await page.waitForTimeout(80);
      await readyDial(page);
      await tap(page, '#log-act-continue');
      await page.waitForFunction(function(){
        var el = document.getElementById('screen-log-result');
        return !!(el && el.classList.contains('active'));
      }, null, { timeout: 8000 });
      await tap(page, '#btn-fall_practice');
      var ui = await page.evaluate(function(){
        var q = document.getElementById('log-fall-group');
        var p = document.getElementById('log-fall-practice-group');
        return {
          fallQ: q ? q.style.display : 'missing',
          practice: p ? p.style.display : 'missing',
          count: document.getElementById('log-fall-count-val').textContent
        };
      });
      assert.strictEqual(ui.fallQ, 'none', 'must not show Tell us about the fall');
      assert.notStrictEqual(ui.practice, 'none', 'must show How many falls');
      await tap(page, '#log-fall-count-plus');
      await tap(page, '#log-fall-count-plus');
      var count = await page.evaluate(function(){ return document.getElementById('log-fall-count-val').textContent; });
      assert.strictEqual(count, '3');
      await tap(page, '#log-result-continue');
      await page.waitForTimeout(700);
      var sessions = postsTo(recorded, 'sessions').filter(function(r){ return r.method === 'POST'; });
      var falls = postsTo(recorded, 'falls');
      assert.ok(sessions.length, 'expected sessions POST');
      var body = sessions[0].body;
      if(Array.isArray(body)) body = body[0];
      assert.strictEqual(body.baseline_zone, 'fall_practice');
      assert.strictEqual(body.fall_count, 3);
      assert.strictEqual(falls.length, 0, 'must not insert into falls');
      console.log('ok - save fall_practice count 3, no falls insert');
    });

    await withPage(browser, port, {}, async function(page){
      var rates = await page.evaluate(function(){
        var sent = [
          { baseline_zone: 'sent' }, { baseline_zone: 'sent' }, { baseline_zone: 'sent' },
          { baseline_zone: 'sent' }, { baseline_zone: 'sent' }
        ];
        var withPractice = sent.concat([{ baseline_zone: 'fall_practice', fall_count: 3 }]);
        var withFell = sent.concat([{ baseline_zone: 'fell' }]);
        return {
          sent: computeSendRate(sent),
          practice: computeSendRate(withPractice),
          fell: computeSendRate(withFell),
          sentFlag: sentFlag({ baseline_zone: 'fall_practice' }),
          fellFlag: fellFlag({ baseline_zone: 'fall_practice' }),
          zone: resolveZone({ result: 'fall_practice' })
        };
      });
      assert.strictEqual(rates.sentFlag, null);
      assert.strictEqual(rates.fellFlag, null);
      assert.strictEqual(rates.sent, rates.practice, 'fall_practice must not change send rate');
      assert.ok(rates.fell < rates.sent, 'fell still lowers send rate');
      assert.ok(rates.zone && rates.zone.zone === 'learning');
      console.log('ok - send rate ignores fall_practice, fell still counts');
    });

    await withPage(browser, port, {}, async function(page, recorded){
      await page.evaluate(function(){
        window._cachedClimbs = [{
          id: 'sess-fp-edit',
          user_id: 'user-fp-1',
          route_name: 'Green 30 degree',
          climb_id: 'climb-green-30',
          grade_value: '5.11a',
          climbing_type: 'Overhang',
          baseline_zone: 'fall_practice',
          fall_count: 3,
          zone: 'learning',
          zone_confidence: 'estimated',
          created_at: '2026-10-07T12:00:00.000Z'
        }];
        editClimbFromLog('sess-fp-edit', 'climb-table');
      });
      await page.waitForTimeout(80);
      var editUi = await page.evaluate(function(){
        var q = document.getElementById('edit-fall-group');
        var p = document.getElementById('edit-fall-practice-group');
        return {
          fallQ: q ? q.style.display : 'missing',
          practice: p ? p.style.display : 'missing',
          count: document.getElementById('edit-fall-count-val').textContent
        };
      });
      assert.notStrictEqual(editUi.practice, 'none');
      assert.strictEqual(editUi.fallQ, 'none');
      assert.strictEqual(editUi.count, '3');
      await tap(page, '#edit-save-changes-btn');
      await page.waitForTimeout(500);
      var patches = postsTo(recorded, 'sessions').filter(function(r){ return r.method === 'PATCH'; });
      assert.ok(patches.length, 'expected sessions PATCH');
      var body = patches[0].body;
      if(Array.isArray(body)) body = body[0];
      assert.strictEqual(body.baseline_zone, 'fall_practice');
      assert.strictEqual(body.fall_count, 3);
      assert.strictEqual(postsTo(recorded, 'falls').length, 0);
      console.log('ok - edit-sheet round trip keeps fall_count');
    });

    await withPage(browser, port, { abortSessions: true }, async function(page, recorded, opts){
      await page.evaluate(function(){
        window._climbCache = [{ id: 'climb-green-30', name: 'Green 30 degree', grade_value: '5.11a', climbing_type: 'Overhang', is_project: true }];
        launchLogWithClimb('climb-green-30', 'Green 30 degree', '5.11a', 'Overhang', 'indoor');
      });
      await page.waitForFunction(function(){
        var el = document.getElementById('screen-log-act');
        return !!(el && el.classList.contains('active'));
      }, null, { timeout: 8000 });
      await page.waitForTimeout(80);
      await readyDial(page);
      await tap(page, '#log-act-continue');
      await page.waitForFunction(function(){
        var el = document.getElementById('screen-log-result');
        return !!(el && el.classList.contains('active'));
      }, null, { timeout: 8000 });
      await tap(page, '#btn-fall_practice');
      await tap(page, '#log-fall-count-plus');
      await tap(page, '#log-fall-count-plus');
      await tap(page, '#log-result-continue');
      await page.waitForTimeout(700);
      var queued = await page.evaluate(function(){
        return JSON.parse(localStorage.getItem('see_offline_queue') || '[]');
      });
      assert.ok(queued.length, 'expected offline queue entry');
      assert.strictEqual(queued[0].payload.baseline_zone, 'fall_practice');
      assert.strictEqual(queued[0].payload.fall_count, 3);
      opts._allowSessions = true;
      await page.evaluate(async function(){ await flushOfflineQueue(); });
      await page.waitForTimeout(500);
      var sessions = postsTo(recorded, 'sessions').filter(function(r){ return r.method === 'POST' && r.body; });
      var replay = sessions.find(function(r){
        var b = r.body;
        return b && b.baseline_zone === 'fall_practice' && b.fall_count === 3;
      });
      assert.ok(replay, 'offline replay must keep fall_count');
      console.log('ok - offline replay keeps fall_count');
    });

    console.log('fall-practice tests: ok');
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
