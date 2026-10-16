import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, readyDial, waitForScreen,
  continueNewLogIfPicker, postsTo, firstBody, sessionRow, USER_ID, ROUTE, GRADE, TERRAIN, CLIMB_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const sql = readFileSync(join(root, 'sql/sessions-tick-type.sql'), 'utf8');
const SHOT_DIR = '/opt/cursor/artifacts/screenshots';

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index314'/.test(index));
assert.ok(/APP_VERSION = 'index314'/.test(sw));
assert.ok(!/coach-dashboard\.html/.test(sql));
assert.ok(/add column if not exists tick_type text/.test(sql));
assert.ok(/onsight.*flash.*redpoint/.test(sql.replace(/\s+/g, ' ')));
assert.ok(/id="log-tick-type-group"/.test(index));
assert.ok(/id="btn-tick-onsight"/.test(index));
assert.ok(/id="btn-tick-flash"/.test(index));
assert.ok(/id="btn-tick-redpoint"/.test(index));
assert.ok(/id="edit-tick-type-group"/.test(index));
assert.ok(/id="edit-btn-tick-onsight"/.test(index));
assert.ok(/hasOwnProperty\.call\(p,\s*'tick_type'\)/.test(index));
assert.ok(/hasOwnProperty\.call\(editPayload,\s*'tick_type'\)/.test(index));
assert.ok(/Onsight = first try, no beta\. Flash = first try, with beta\. Redpoint = send after previous attempts\./.test(index));
assert.ok(/id="log-flow-progress-2"[\s\S]*Step 2 of 6/.test(index));
assert.ok(!/id="screen-log-tick"/.test(index));
assert.ok((index.match(/class="log-flow-progress"/g) || []).length === 6);
assert.ok(!/tick_type/.test(readFileSync(join(root, 'coach-dashboard.html'), 'utf8')));

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

async function shot(page, name){
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  var dest = join(SHOT_DIR, name);
  var tmpDir = '/tmp/tick-type-shots';
  if(!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  var tmp = join(tmpDir, name);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(80);
  var lastErr = null;
  var i;
  for(i = 0; i < 3; i++){
    try{
      await page.screenshot({ path: tmp, fullPage: true });
      copyFileSync(tmp, dest);
      lastErr = null;
      break;
    }catch(e){
      lastErr = e;
      await page.waitForTimeout(120);
    }
  }
  if(lastErr) throw lastErr;
}

async function authPage(page, extra){
  extra = extra || {};
  await page.waitForFunction(function(){
    return typeof window.startLogFlow === 'function' && typeof window.selectLogResult === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(args){
    window._authUser = { id: args.userId };
    window._authToken = 'test-token';
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    if(args.unloaded){
      window._cachedClimbs = undefined;
    } else {
      window._cachedClimbs = args.sessions || [];
    }
  }, Object.assign({ userId: USER_ID }, extra));
}

async function toResultStep(page, extra){
  extra = extra || {};
  await authPage(page, extra);
  if(extra.lockedClimb){
    await page.evaluate(function(args){
      window._climbCache = [{
        id: args.climbId,
        name: args.route,
        grade_value: args.grade,
        climbing_type: args.terrain,
        is_project: false
      }];
      launchLogWithClimb(args.climbId, args.route, args.grade, args.terrain, 'indoor');
    }, { climbId: extra.climbId || CLIMB_ID, route: ROUTE, grade: GRADE, terrain: TERRAIN });
  } else {
    await page.evaluate(function(){ startLogFlow({ skipPick: true }); });
    await continueNewLogIfPicker(page);
  }
  await waitForScreen(page, 'screen-log-act');
  await page.waitForTimeout(80);
  await readyDial(page);
  await tap(page, '#log-act-continue');
  await waitForScreen(page, 'screen-log-result');
}

async function tickUi(page, isEdit){
  return page.evaluate(function(edit){
    var g = document.getElementById(edit ? 'edit-tick-type-group' : 'log-tick-type-group');
    function chip(id){
      var el = document.getElementById(id);
      if(!el) return { missing: true, visible: false };
      var cs = window.getComputedStyle(el);
      var groupHidden = !g || g.style.display === 'none';
      var hidden = groupHidden || el.style.display === 'none' || cs.display === 'none';
      return {
        missing: false,
        selected: el.classList.contains('selected'),
        visible: !hidden
      };
    }
    var prefix = edit ? 'edit-btn-tick-' : 'btn-tick-';
    var progress = document.getElementById('log-flow-progress-2');
    return {
      group: g ? g.style.display : 'missing',
      groupVisible: !!(g && g.style.display !== 'none' && g.style.display !== ''),
      defs: ((document.getElementById(edit ? 'edit-tick-type-defs' : 'log-tick-type-defs') || {}).textContent || '').trim(),
      onsight: chip(prefix + 'onsight'),
      flash: chip(prefix + 'flash'),
      redpoint: chip(prefix + 'redpoint'),
      stepLabel: progress ? (progress.querySelector('.log-flow-progress-label') || progress).textContent.trim() : '',
      stepCount: document.querySelectorAll('.log-flow-progress').length
    };
  }, !!isEdit);
}

function assertAllThree(ui, msg){
  assert.notStrictEqual(ui.group, 'none', msg + ': group hidden');
  assert.notStrictEqual(ui.group, 'missing', msg + ': group missing');
  assert.ok(ui.onsight.visible, msg + ': onsight hidden');
  assert.ok(ui.flash.visible, msg + ': flash hidden');
  assert.ok(ui.redpoint.visible, msg + ': redpoint hidden');
  assert.ok(!ui.onsight.selected && !ui.flash.selected && !ui.redpoint.selected, msg + ': preselected');
}

function assertRedpointOnly(ui, msg){
  assert.notStrictEqual(ui.group, 'none', msg + ': group hidden');
  assert.ok(!ui.onsight.visible, msg + ': onsight should hide');
  assert.ok(!ui.flash.visible, msg + ': flash should hide');
  assert.ok(ui.redpoint.visible, msg + ': redpoint should show');
  assert.ok(!ui.redpoint.selected, msg + ': redpoint preselected');
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  var results = {};
  try{
    await withPage(browser, port, {}, async function(page){
      await toResultStep(page);
      var before = await tickUi(page);
      assert.ok(before.group === 'none' || before.group === 'missing' || !before.onsight.visible, 'chips must not show before a result');
      assert.strictEqual(before.stepLabel, 'Step 2 of 6');
      assert.strictEqual(before.stepCount, 6);

      await tap(page, '#btn-sent');
      var sent = await tickUi(page);
      assertAllThree(sent, 'sent / no prior');
      assert.ok(/Onsight = first try, no beta/.test(sent.defs));
      results['chips-sent'] = 'PASS';
      await shot(page, 'tick-result-no-prior-390.png');

      await tap(page, '#btn-fell');
      var fell = await tickUi(page);
      assert.ok(fell.group === 'none' || !fell.onsight.visible, 'no chips on fell');
      results['no-chips-fell'] = 'PASS';

      await tap(page, '#btn-took');
      var took = await tickUi(page);
      assert.ok(took.group === 'none' || !took.onsight.visible, 'no chips on took');
      results['no-chips-took'] = 'PASS';

      await tap(page, '#btn-dna');
      var dna = await tickUi(page);
      assert.ok(dna.group === 'none' || !dna.onsight.visible, 'no chips on dna');
      results['no-chips-dna'] = 'PASS';

      await tap(page, '#btn-sent');
      await page.evaluate(function(){ logState.is_baseline = true; });
      await tap(page, '#btn-sent');
      var baseline = await tickUi(page);
      assert.ok(baseline.group === 'none' || !baseline.onsight.visible, 'no chips on baseline');
      results['no-chips-baseline'] = 'PASS';

      await page.evaluate(function(){ logState.is_baseline = false; logState.is_checkin = true; });
      await tap(page, '#btn-sent');
      var checkin = await tickUi(page);
      assert.ok(checkin.group === 'none' || !checkin.onsight.visible, 'no chips on check-in');
      results['no-chips-checkin'] = 'PASS';
    });
    console.log('ok - chips only on sent; hidden on fell/took/dna/baseline/check-in');

    await withPage(browser, port, {}, async function(page){
      await toResultStep(page, {
        lockedClimb: true,
        sessions: [sessionRow({ id: 'sess-prior-1', climb_id: CLIMB_ID, baseline_zone: 'fell' })]
      });
      await tap(page, '#btn-sent');
      var ui = await tickUi(page);
      assertRedpointOnly(ui, 'prior attempt');
      results['prior-hides-onsight-flash'] = 'PASS';
      await shot(page, 'tick-result-prior-390.png');
    });
    console.log('ok - prior attempt hides onsight and flash');

    await withPage(browser, port, {}, async function(page){
      await toResultStep(page, { sessions: [] });
      await tap(page, '#btn-sent');
      assertAllThree(await tickUi(page), 'no prior / empty history');
      results['all-three-no-prior'] = 'PASS';
    });

    await withPage(browser, port, {}, async function(page){
      await toResultStep(page, { sessions: [sessionRow({ climb_id: 'other-climb' })] });
      await tap(page, '#btn-sent');
      assertAllThree(await tickUi(page), 'null climb_id');
      results['all-three-null-climb'] = 'PASS';
    });

    await withPage(browser, port, {}, async function(page){
      await toResultStep(page, { unloaded: true, lockedClimb: true });
      await tap(page, '#btn-sent');
      assertAllThree(await tickUi(page), 'unloaded history');
      results['all-three-unloaded'] = 'PASS';
    });
    console.log('ok - all three with no prior, null climb_id, unloaded history');

    await withPage(browser, port, {}, async function(page, recorded){
      await toResultStep(page);
      await tap(page, '#btn-sent');
      await tap(page, '#btn-tick-flash');
      var picked = await tickUi(page);
      assert.ok(picked.flash.selected, 'flash chip should select via tap');
      assert.ok(!picked.onsight.selected && !picked.redpoint.selected);
      await tap(page, '#log-result-continue');
      await page.waitForTimeout(300);
      var catalogOn = await page.evaluate(function(){
        var el = document.getElementById('screen-log-catalog');
        return !!(el && el.classList.contains('active'));
      });
      if(catalogOn) await tap(page, '#gym-catalog-skip');
      await waitForScreen(page, 'screen-log-terrain');
      await tap(page, '.terrain-chips .chip:has-text("Overhang")');
      await tap(page, '#log-terrain-continue');
      await waitForScreen(page, 'screen-log-details');
      await tap(page, '#log-details-continue');
      await waitForScreen(page, 'screen-log-grade');
      await tap(page, '#grade-grid .grade-btn:has-text("5.11a")');
      await tap(page, '#log-grade-continue');
      await waitForScreen(page, 'screen-log-name');
      await page.fill('#log-rname-input', ROUTE);
      await tap(page, '#log-name-save');
      await page.waitForTimeout(700);
      var posts = postsTo(recorded, 'sessions', 'POST');
      assert.ok(posts.length, 'log climb did not POST /rest/v1/sessions');
      var body = firstBody(posts);
      assert.strictEqual(body.baseline_zone, 'sent');
      assert.strictEqual(body.tick_type, 'flash');
      results['real-flow-tap'] = 'PASS';
      results['save-column-present'] = 'PASS';
    });
    console.log('ok - real-flow tap flash saves tick_type');

    await withPage(browser, port, {}, async function(page, recorded){
      await toResultStep(page);
      await tap(page, '#btn-sent');
      await tap(page, '#log-result-continue');
      await page.waitForTimeout(300);
      var catalogOn = await page.evaluate(function(){
        var el = document.getElementById('screen-log-catalog');
        return !!(el && el.classList.contains('active'));
      });
      if(catalogOn) await tap(page, '#gym-catalog-skip');
      await waitForScreen(page, 'screen-log-terrain');
      await tap(page, '.terrain-chips .chip:has-text("Overhang")');
      await tap(page, '#log-terrain-continue');
      await waitForScreen(page, 'screen-log-details');
      await tap(page, '#log-details-continue');
      await waitForScreen(page, 'screen-log-grade');
      await tap(page, '#grade-grid .grade-btn:has-text("5.11a")');
      await tap(page, '#log-grade-continue');
      await waitForScreen(page, 'screen-log-name');
      await page.fill('#log-rname-input', ROUTE);
      await tap(page, '#log-name-save');
      await page.waitForTimeout(700);
      var body = firstBody(postsTo(recorded, 'sessions', 'POST'));
      assert.ok(body);
      assert.strictEqual(body.baseline_zone, 'sent');
      assert.strictEqual(body.tick_type, null);
      results['null-allowed'] = 'PASS';
    });
    console.log('ok - null tick_type allowed');

    await withPage(browser, port, {
      stub: async function(route, info){
        if(info.method === 'POST' && info.url.indexOf('/rest/v1/sessions') !== -1 && info.body && Object.prototype.hasOwnProperty.call(info.body, 'tick_type')){
          await fulfillJson(route, 400, {
            code: 'PGRST204',
            message: "Could not find the 'tick_type' column of 'sessions' in the schema cache",
            details: null,
            hint: null
          });
          return true;
        }
        return false;
      }
    }, async function(page, recorded){
      await toResultStep(page);
      await tap(page, '#btn-sent');
      await tap(page, '#btn-tick-onsight');
      await tap(page, '#log-result-continue');
      await page.waitForTimeout(300);
      var catalogOn = await page.evaluate(function(){
        var el = document.getElementById('screen-log-catalog');
        return !!(el && el.classList.contains('active'));
      });
      if(catalogOn) await tap(page, '#gym-catalog-skip');
      await waitForScreen(page, 'screen-log-terrain');
      await tap(page, '.terrain-chips .chip:has-text("Overhang")');
      await tap(page, '#log-terrain-continue');
      await waitForScreen(page, 'screen-log-details');
      await tap(page, '#log-details-continue');
      await waitForScreen(page, 'screen-log-grade');
      await tap(page, '#grade-grid .grade-btn:has-text("5.11a")');
      await tap(page, '#log-grade-continue');
      await waitForScreen(page, 'screen-log-name');
      await page.fill('#log-rname-input', ROUTE);
      await tap(page, '#log-name-save');
      await page.waitForTimeout(900);
      var posts = postsTo(recorded, 'sessions', 'POST');
      assert.ok(posts.length >= 2, 'expected strip+retry POST');
      var first = firstBody(posts);
      var last = posts[posts.length - 1].body;
      if(Array.isArray(last)) last = last[0];
      assert.ok(Object.prototype.hasOwnProperty.call(first, 'tick_type'));
      assert.ok(!Object.prototype.hasOwnProperty.call(last, 'tick_type'));
      results['save-column-absent'] = 'PASS';
    });
    console.log('ok - insert retries without tick_type if column missing');

    await withPage(browser, port, {}, async function(page, recorded){
      await authPage(page);
      await page.evaluate(function(args){
        window._cachedClimbs = [args.session];
        editClimbFromLog(args.session.id, 'climb-table');
      }, { session: sessionRow({ id: 'sess-tick-edit', climb_id: CLIMB_ID, baseline_zone: 'sent', tick_type: null }) });
      await page.waitForTimeout(80);
      var ui = await tickUi(page, true);
      assertAllThree(ui, 'edit sent');
      await tap(page, '#edit-btn-tick-redpoint');
      await tap(page, '#edit-save-changes-btn');
      await page.waitForTimeout(500);
      var patches = postsTo(recorded, 'sessions', 'PATCH');
      assert.ok(patches.length, 'edit sheet did not PATCH');
      var body = firstBody(patches);
      assert.strictEqual(body.tick_type, 'redpoint');
      results['edit-updates'] = 'PASS';
      await page.evaluate(function(args){
        window._cachedClimbs = [args.session];
        editClimbFromLog(args.session.id, 'climb-table');
      }, { session: sessionRow({ id: 'sess-tick-edit', climb_id: CLIMB_ID, baseline_zone: 'sent', tick_type: 'redpoint' }) });
      await page.waitForTimeout(80);
      await shot(page, 'tick-edit-sheet-390.png');
    });
    console.log('ok - edit updates tick_type');

    await withPage(browser, port, {}, async function(page){
      await authPage(page);
      await page.evaluate(function(){
        logState.result = 'sent';
        logState.grade = '5.11a';
        logState.terrain = 'Overhang';
        logState.tickType = 'onsight';
        populateLogDoneScreen();
        showScreen('screen-log-done');
      });
      await waitForScreen(page, 'screen-log-done');
      var meta = await page.evaluate(function(){
        var el = document.getElementById('log-done-meta');
        return el ? el.textContent : '';
      });
      assert.ok(/Onsight/.test(meta), 'session detail should show tick type, got: ' + meta);
      results['step-count-unchanged'] = 'PASS';
      await shot(page, 'tick-session-detail-390.png');
    });
    console.log('ok - session detail shows tick type');

    console.log('tick-type tests: ok');
    console.log(JSON.stringify(results));
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
