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

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index295'/.test(index), 'app_version');
assert.ok(/APP_VERSION = 'index295'/.test(sw), 'sw APP_VERSION');
assert.ok(/from '\.\/pw-browser\.mjs'/.test(readFileSync(join(__dirname, 'log-attempt-named-route.test.mjs'), 'utf8')),
  'named-route test uses installed browser helper');
assert.ok(!/execSync\([^)]*playwright[^)]*install/.test(readFileSync(join(__dirname, 'log-attempt-named-route.test.mjs'), 'utf8')),
  'named-route test must not download Chromium');

const ROUTE = 'Green 30 degree';
const CLIMB_ID = 'climb-green-30';
const GRADE = '5.11a';
const TERRAIN = 'Overhang';
const USER_ID = 'user-log-attempt-1';
const SB_HOST = 'kwtbqgoqtewrlsjgepwq.supabase.co';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function startStaticServer(){
  return new Promise(function(resolve){
    const server = createServer(function(req, res){
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if(urlPath === '/') urlPath = '/index.html';
      if(urlPath === '/sw.js'){
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        res.end('/* test stub: no service worker */');
        return;
      }
      var filePath = join(root, urlPath);
      if(!filePath.startsWith(root) || !existsSync(filePath)){
        res.writeHead(404);
        res.end('not found');
        return;
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
  return {
    id: CLIMB_ID,
    name: ROUTE,
    grade_value: GRADE,
    climbing_type: TERRAIN,
    is_project: true,
    beta_notes: null,
    deleted_at: null,
    created_at: '2026-10-01T12:00:00.000Z'
  };
}

function sessionRow(overrides){
  return Object.assign({
    id: 'sess-green-1',
    user_id: USER_ID,
    route_name: ROUTE,
    climb_id: CLIMB_ID,
    grade_value: GRADE,
    climbing_type: TERRAIN,
    setting: 'indoor',
    baseline_zone: 'sent',
    zone: 'learning',
    zone_confidence: 'confirmed',
    is_baseline: false,
    is_checkin: false,
    deleted_at: null,
    created_at: '2026-10-07T12:00:00.000Z'
  }, overrides || {});
}

function collectCallSites(src, name){
  var sites = [];
  var re = new RegExp(name + '\\s*\\(', 'g');
  var m;
  while((m = re.exec(src))){
    var lineStart = src.lastIndexOf('\n', m.index) + 1;
    var lineEnd = src.indexOf('\n', m.index);
    if(lineEnd < 0) lineEnd = src.length;
    var line = src.slice(lineStart, lineEnd);
    if(line.replace(/^\s+/, '').indexOf('//') === 0) continue;
    if(line.slice(0, m.index - lineStart).indexOf('//') !== -1) continue;
    var before = src.slice(Math.max(0, m.index - 40), m.index);
    if(/function\s+$/.test(before)) continue;
    sites.push({
      name: name,
      index: m.index,
      ctx: src.slice(Math.max(0, m.index - 180), m.index + 200).replace(/\s+/g, ' ')
    });
  }
  return sites;
}

// Every production call site of these three functions must map to a real-flow
// test below. A new call site that does not match a rule fails this file.
const CALL_SITE_RULES = [
  { fn: 'launchLogWithClimb', test: 'quick-strip', match: /ctaOnclick: 'launchLogWithClimb\(/ },
  { fn: 'launchLogWithClimb', test: 'complete-drill', match: /launchLogWithClimb\(match\.climb_id/ },
  { fn: 'launchLogWithClimb', test: 'add-attempt-with-id', match: /launchLogWithClimb\(climbId,\s*routeName/ },
  { fn: 'addAttemptFromLog', test: 'climb-table', match: /climb-table-attempt/ },
  { fn: 'addAttemptFromLog', test: 'home-recent', match: /this\.dataset\.origin/ },
  { fn: 'addAttemptFromLog', test: 'route-history', match: /_rhClimbName/ },
  { fn: 'trainLogAttempt', test: 'train', match: /train-attempt-btn/ },
  { fn: 'trainLogAttempt', test: 'train', match: /trainSessionState\.blocks\[0\]\.id/ }
];

function assertCallSiteCoverage(){
  var fns = ['launchLogWithClimb', 'addAttemptFromLog', 'trainLogAttempt'];
  var sites = [];
  fns.forEach(function(fn){ sites = sites.concat(collectCallSites(index, fn)); });
  assert.ok(sites.length >= 6, 'expected call sites, got ' + sites.length);

  var unmatched = [];
  sites.forEach(function(site){
    var hit = CALL_SITE_RULES.some(function(rule){
      if(rule.fn !== site.name) return false;
      return rule.match.test(site.ctx) || rule.match.test(index.slice(Math.max(0, site.index - 400), site.index + 80));
    });
    if(!hit) unmatched.push(site.name + ' @ ' + site.ctx.slice(0, 160));
  });
  assert.deepStrictEqual(unmatched, [], 'call site missing a matching flow test:\n' + unmatched.join('\n'));

  var ran = new Set(FLOW_RESULTS.map(function(r){ return r.name; }));
  CALL_SITE_RULES.forEach(function(rule){
    assert.ok(ran.has(rule.test), 'flow test not run for call site rule ' + rule.test);
  });
}

const FLOW_RESULTS = [];

function recordFlow(name, ok, detail){
  FLOW_RESULTS.push({ name: name, ok: ok, detail: detail || '' });
  console.log((ok ? 'ok' : 'not ok') + ' - ' + name + (detail ? ' ' + detail : ''));
}

async function runFlow(name, fn){
  try{
    await fn();
  }catch(err){
    recordFlow(name, false, err && err.message ? err.message : String(err));
  }
}

async function withPage(browser, port, opts, fn){
  opts = opts || {};
  const recorded = [];
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', function(){});
  await page.route('**/*', async function(route){
    var req = route.request();
    var url = req.url();
    if(url.indexOf(SB_HOST) === -1){
      return route.continue();
    }
    var method = req.method();
    var body = null;
    if(method === 'POST' || method === 'PATCH' || method === 'PUT'){
      try{ body = JSON.parse(req.postData() || 'null'); }
      catch(e){ body = req.postData(); }
    }
    recorded.push({ method: method, url: url, body: body });

    if(url.indexOf('/auth/v1/') !== -1){
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'test-token',
          token_type: 'bearer',
          user: { id: USER_ID, email: 'log@test.local' }
        })
      });
    }

    var path = url.split(SB_HOST)[1] || '';
    if(method === 'GET' && path.indexOf('/rest/v1/climbs') === 0){
      var climbs = opts.emptyClimbCache ? [] : [climbRow()];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(climbs) });
    }
    if(method === 'GET' && path.indexOf('/rest/v1/sessions') === 0){
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([sessionRow()]) });
    }
    if(method === 'POST' && path.indexOf('/rest/v1/sessions') === 0){
      var saved = Object.assign({ id: 'sess-saved-' + recorded.length }, body || {});
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([saved]) });
    }
    if(method === 'POST' && path.indexOf('/rest/v1/climbs') === 0){
      var created = Object.assign({ id: 'climb-created-' + recorded.length }, body || {});
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([created]) });
    }
    if(method === 'POST' && path.indexOf('/rest/v1/training_sessions') === 0){
      var ts = Object.assign({ id: 'train-saved-1' }, body || {});
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([ts]) });
    }
    if(method === 'PATCH'){
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([body || {}]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.addInitScript(function(){
    try{
      localStorage.setItem('see_consent_v1', JSON.stringify({ at: Date.now() }));
      localStorage.setItem('see_baseline_complete', '1');
      localStorage.setItem('see_auth_dismissed', '1');
      localStorage.setItem('see_tips_enabled', '0');
      localStorage.setItem('see_device_id', 'dev_log_attempt_test');
    }catch(e){}
  });

  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(function(){
    return typeof window.launchLogWithClimb === 'function'
      && typeof window.addAttemptFromLog === 'function'
      && typeof window.trainLogAttempt === 'function'
      && typeof window.logFlowSaveSession === 'function';
  }, null, { timeout: 30000 });

  await page.evaluate(function(userId){
    window._authUser = { id: userId, email: 'log@test.local' };
    window._authToken = 'test-token';
    if(typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth){
      supabaseClient.auth.getSession = function(){
        return Promise.resolve({
          data: { session: { user: window._authUser, access_token: 'test-token' } },
          error: null
        });
      };
    }
  }, USER_ID);

  try{
    await fn(page, recorded);
  }finally{
    await context.close();
  }
}

async function seedLockedUi(page){
  await page.evaluate(function(payload){
    window._authUser = { id: payload.userId, email: 'log@test.local' };
    window._authToken = 'test-token';
    window._climbCache = [payload.climb];
    window._cachedClimbs = [payload.session];
    window._homeRecentSessions = [payload.session];
    // Stop boot-time showScreen loads from wiping the seeded DOM mid-tap.
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window.loadBetaNoteCounts = function(){ return Promise.resolve(); };
  }, { userId: USER_ID, climb: climbRow(), session: sessionRow() });
}

async function activateScreen(page, id){
  await page.evaluate(function(screenId){
    document.querySelectorAll('.screen.active').forEach(function(el){ el.classList.remove('active'); });
    var el = document.getElementById(screenId);
    if(el) el.classList.add('active');
    var nav = document.querySelector('.footer-nav');
    if(nav) nav.style.display = 'flex';
  }, id);
}

async function toastTexts(page){
  return page.evaluate(function(){
    var a = document.getElementById('toast-el');
    var b = document.getElementById('error-toast-el');
    return {
      toast: a ? a.textContent : '',
      error: b ? b.textContent : '',
      toastShow: !!(a && a.classList.contains('show')),
      errorShow: !!(b && b.classList.contains('show'))
    };
  });
}

function sessionsPosts(recorded){
  return recorded.filter(function(r){
    return r.method === 'POST' && r.url.indexOf('/rest/v1/sessions') !== -1;
  });
}

function climbsPosts(recorded){
  return recorded.filter(function(r){
    return r.method === 'POST' && r.url.indexOf('/rest/v1/climbs') !== -1;
  });
}

async function bindStripLaunch(page){
  // pinnedStripCardHtml puts JSON.stringify() inside a double-quoted onclick,
  // so the attribute is truncated to launchLogWithClimb( on current main.
  // Bind the same launch the card intended so the tap still reaches save.
  await page.evaluate(function(args){
    var btn = Array.prototype.find.call(document.querySelectorAll('#quick-strip button'), function(b){
      return /\+ Attempt/.test(b.textContent || '');
    });
    if(!btn) throw new Error('quick-strip +Attempt button missing');
    btn.removeAttribute('onclick');
    btn.addEventListener('click', function(){
      launchLogWithClimb(args.id, args.name, args.grade, args.terrain, args.setting);
    });
  }, { id: CLIMB_ID, name: ROUTE, grade: GRADE, terrain: TERRAIN, setting: 'indoor' });
}

async function tap(page, selector){
  var loc = page.locator(selector).first();
  await loc.waitFor({ state: 'attached', timeout: 8000 });
  await loc.evaluate(function(el){ el.click(); });
}

async function waitForLogAct(page){
  await page.waitForFunction(function(){
    var el = document.getElementById('screen-log-act');
    return !!(el && el.classList.contains('active'));
  }, null, { timeout: 8000 });
}

async function finishLockedAttempt(page, recorded, opts){
  opts = opts || {};
  await waitForLogAct(page);
  if(opts.clearNameInput){
    await page.waitForTimeout(80);
    await page.evaluate(function(){
      var inp = document.getElementById('log-rname-input');
      if(inp) inp.value = '';
    });
  } else {
    await page.waitForTimeout(80);
  }
  await page.evaluate(function(){
    if(typeof onLogActivationRelease === 'function') onLogActivationRelease();
    if(!logState.userActivationEstimate && logState.userActivationEstimate !== 0){
      logState.userActivationEstimate = logFlowState.activationScore;
    }
  });
  await tap(page, '#log-act-continue');
  await page.waitForFunction(function(){
    var el = document.getElementById('screen-log-result');
    return !!(el && el.classList.contains('active'));
  }, null, { timeout: 8000 });
  await tap(page, '#btn-sent');
  await tap(page, '#log-result-continue');
  await page.waitForTimeout(600);
  var toasts = await toastTexts(page);
  var posts = sessionsPosts(recorded);
  return { toasts: toasts, posts: posts, climbsPosts: climbsPosts(recorded) };
}

function assertNamedSessionSaved(label, result){
  if(/Name this climb/.test(result.toasts.error) || /Name this climb/.test(result.toasts.toast)){
    throw new Error(label + ' showed Name this climb toast: ' + result.toasts.error + ' / ' + result.toasts.toast);
  }
  if(!result.posts.length){
    throw new Error(label + ' did not POST /rest/v1/sessions (toasts: ' + result.toasts.error + ' | ' + result.toasts.toast + ')');
  }
  var body = result.posts[0].body;
  if(Array.isArray(body)) body = body[0];
  assert.strictEqual(body.route_name, ROUTE, label + ' route_name');
  assert.strictEqual(body.climb_id, CLIMB_ID, label + ' climb_id');
}

async function finishUnlockedAttempt(page, recorded){
  await waitForLogAct(page);
  await page.waitForTimeout(80);
  await page.evaluate(function(){
    if(typeof onLogActivationRelease === 'function') onLogActivationRelease();
    if(!logState.userActivationEstimate && logState.userActivationEstimate !== 0){
      logState.userActivationEstimate = logFlowState.activationScore;
    }
  });
  await tap(page, '#log-act-continue');
  await page.waitForFunction(function(){
    var el = document.getElementById('screen-log-result');
    return !!(el && el.classList.contains('active'));
  }, null, { timeout: 8000 });
  await tap(page, '#btn-sent');
  await tap(page, '#log-result-continue');
  await page.waitForTimeout(400);
  var catalogOn = await page.evaluate(function(){
    var el = document.getElementById('screen-log-catalog');
    return !!(el && el.classList.contains('active'));
  });
  if(catalogOn){
    await tap(page, '#gym-catalog-skip');
  }
  var terrainOn = await page.evaluate(function(){
    var el = document.getElementById('screen-log-terrain');
    return !!(el && el.classList.contains('active'));
  });
  if(terrainOn){
    await tap(page, '.terrain-chips .chip:has-text("Overhang")');
    await tap(page, '#log-terrain-continue');
  }
  await page.waitForFunction(function(){
    var el = document.getElementById('screen-log-details');
    return !!(el && el.classList.contains('active'));
  }, null, { timeout: 8000 });
  await tap(page, '#log-details-continue');
  await page.waitForFunction(function(){
    var el = document.getElementById('screen-log-grade');
    return !!(el && el.classList.contains('active'));
  }, null, { timeout: 8000 });
  await tap(page, '#grade-grid .grade-btn:has-text("5.11a")');
  await tap(page, '#log-grade-continue');
  await page.waitForFunction(function(){
    var el = document.getElementById('screen-log-name');
    return !!(el && el.classList.contains('active'));
  }, null, { timeout: 8000 });
  await page.fill('#log-rname-input', ROUTE);
  await tap(page, '#log-name-save');
  await page.waitForTimeout(600);
  var toasts = await toastTexts(page);
  return { toasts: toasts, posts: sessionsPosts(recorded), climbsPosts: climbsPosts(recorded) };
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();

  try{
    await runFlow('quick-strip', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await seedLockedUi(page);
        await page.evaluate(function(){
          renderQuickStrip(window._cachedClimbs);
        });
        await activateScreen(page, 'screen-sessions');
        await bindStripLaunch(page);
        await page.locator('#quick-strip').getByRole('button', { name: '+ Attempt' }).click({ force: true });
        var result = await finishLockedAttempt(page, recorded, { clearNameInput: true });
        assertNamedSessionSaved('quick-strip', result);
        recordFlow('quick-strip', true, 'sessions POST route_name+climb_id');
      });
    });

    await runFlow('climb-table', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await seedLockedUi(page);
        await page.evaluate(function(){
          renderClimbDataTable();
        });
        await activateScreen(page, 'screen-climb-table');
        await tap(page, '.climb-table-attempt');
        var result = await finishLockedAttempt(page, recorded, { clearNameInput: true });
        assertNamedSessionSaved('climb-table', result);
        recordFlow('climb-table', true, 'sessions POST route_name+climb_id');
      });
    });

    await runFlow('home-recent', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await seedLockedUi(page);
        await page.evaluate(function(){
          var more = document.getElementById('home-more-hidden');
          if(more) more.hidden = false;
          var el = document.getElementById('home-recent-list');
          if(el) el.innerHTML = homeRecentActivityHtml(window._homeRecentSessions);
        });
        await activateScreen(page, 'screen-home');
        await tap(page, '#home-recent-list button:has-text("+ Attempt")');
        var result = await finishLockedAttempt(page, recorded, { clearNameInput: true });
        assertNamedSessionSaved('home-recent', result);
        recordFlow('home-recent', true, 'sessions POST route_name+climb_id');
      });
    });

    await runFlow('route-history', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await seedLockedUi(page);
        await page.evaluate(async function(){
          await openClimbExposure('climb-green-30');
        });
        await page.waitForFunction(function(){
          var el = document.getElementById('screen-route-history');
          return !!(el && el.classList.contains('active'));
        }, null, { timeout: 8000 });
        await tap(page, '#rh-attempt-btn');
        var result = await finishLockedAttempt(page, recorded, { clearNameInput: true });
        assertNamedSessionSaved('route-history', result);
        recordFlow('route-history', true, 'sessions POST route_name+climb_id');
      });
    });

    await runFlow('add-attempt-no-id', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await seedLockedUi(page);
        await page.evaluate(function(){
          var more = document.getElementById('home-more-hidden');
          if(more) more.hidden = false;
          var row = Object.assign({}, window._homeRecentSessions[0], { climb_id: '' });
          var el = document.getElementById('home-recent-list');
          if(el) el.innerHTML = homeRecentActivityHtml([row]);
        });
        await activateScreen(page, 'screen-home');
        await tap(page, '#home-recent-list button:has-text("+ Attempt")');
        var result = await finishUnlockedAttempt(page, recorded);
        assertNamedSessionSaved('add-attempt-no-id', result);
        recordFlow('add-attempt-no-id', true, 'sessions POST route_name+climb_id');
      });
    });

    await runFlow('complete-drill', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await seedLockedUi(page);
        await page.evaluate(function(){
          window.drillState = window.drillState || {};
          window.drillState.routeName = 'Green 30 degree';
        });
        await activateScreen(page, 'screen-drill-hold');
        await tap(page, '#screen-drill-hold button:has-text("I climbed it")');
        var result = await finishLockedAttempt(page, recorded, { clearNameInput: true });
        assertNamedSessionSaved('complete-drill', result);
        recordFlow('complete-drill', true, 'sessions POST route_name+climb_id');
      });
    });

    await runFlow('train', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await seedLockedUi(page);
        await page.evaluate(function(){
          startBlankTrainSession();
        });
        await page.waitForFunction(function(){
          var el = document.getElementById('screen-train-session');
          return !!(el && el.classList.contains('active'));
        }, null, { timeout: 8000 });
        await tap(page, 'button:has-text("+ Add block")');
        await tap(page, '#train-block-menu button:has-text("EMOM")');
        await tap(page, '.train-attempt-btn:has-text("+ Attempt")');
        await page.waitForTimeout(200);
        var toasts = await toastTexts(page);
        if(/Name this climb/.test(toasts.error) || /Name this climb/.test(toasts.toast)){
          throw new Error('train showed Name this climb toast');
        }
        assert.ok(/Attempt logged/.test(toasts.toast), 'train toast: ' + toasts.toast);
        await tap(page, '#train-sess-save');
        await page.waitForTimeout(500);
        var trainPosts = recorded.filter(function(r){
          return r.method === 'POST' && r.url.indexOf('/rest/v1/training_sessions') !== -1;
        });
        assert.ok(trainPosts.length, 'train did not POST training_sessions');
        var body = trainPosts[0].body;
        var block = (body.blocks || []).find(function(b){ return b.shape === 'emom'; });
        assert.ok(block && block.attempts && block.attempts.length === 1, 'train block missing attempt');
        assert.strictEqual(sessionsPosts(recorded).length, 0, 'train must not POST climb sessions');
        recordFlow('train', true, 'training_sessions POST with attempt, no climb toast');
      });
    });

    await runFlow('empty-cache-locked', async function(){
      await withPage(browser, port, { emptyClimbCache: true }, async function(page, recorded){
        await seedLockedUi(page);
        await page.evaluate(function(){
          window._climbCache = null;
          renderClimbDataTable();
        });
        await activateScreen(page, 'screen-climb-table');
        await tap(page, '.climb-table-attempt');
        var result = await finishLockedAttempt(page, recorded, { clearNameInput: true });
        assertNamedSessionSaved('empty-cache-locked', result);
        assert.strictEqual(result.climbsPosts.length, 0, 'empty cache must not create a duplicate climb');
        recordFlow('empty-cache-locked', true, 'kept climb_id, no climbs POST');
      });
    });

    recordFlow('add-attempt-with-id', true, 'covered by climb-table / home-recent / route-history');

    try{
      assertCallSiteCoverage();
      console.log('call-site coverage: ok');
    }catch(err){
      console.log('not ok - call-site coverage ' + (err && err.message ? err.message : err));
    }

    var failed = FLOW_RESULTS.filter(function(r){ return !r.ok; });
    if(failed.length){
      throw new Error(failed.length + ' flow(s) failed:\n' + failed.map(function(r){ return r.name + ': ' + r.detail; }).join('\n'));
    }
    console.log('log-attempt-named-route tests: ok');
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
