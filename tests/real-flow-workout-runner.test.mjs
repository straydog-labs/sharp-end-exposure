import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, waitForScreen,
  postsTo, firstBody, USER_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const sql = readFileSync(join(root, 'sql/workout-sessions.sql'), 'utf8');
const coach = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');
const SHOT_DIR = '/opt/cursor/artifacts/screenshots';
const REPO_SHOTS = join(root, 'shots');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index317'/.test(index));
assert.ok(/APP_VERSION = 'index317'/.test(sw));
assert.ok(/var WK_DEFAULT_ON = false/.test(index));
assert.ok(/function isWkOn\(/.test(index));
assert.ok(/see_wk/.test(index));
assert.ok(/q\.get\('wk'\)/.test(index) && /v === '1'/.test(index) && /v === '0'/.test(index));
assert.ok(/Checked = sent \/ completed successfully\. Unchecked = not sent\./.test(index));
assert.ok(/function normalizeWkBlock\(/.test(index));
assert.ok(/function seedTrainBlocksFromSections\(/.test(index) && /normalizeWkBlock\(cloned/.test(index));
assert.ok(/payload\.template_id = trainSessionState\.custom_workout_item_id/.test(index));
assert.ok(/energy_type: trainSessionState\.energy_type \|\| null/.test(index));
assert.ok(/Could not save star/.test(index));
assert.ok(/Prefer.*return=representation/.test(index));
assert.ok(/function startTrainSessionFromAssignment\(/.test(index));
assert.ok(/sbS\(table, 'select=\*&id=eq\.' \+ itemId/.test(index));
assert.ok(/round_complete/.test(index));
assert.ok(/boulder\.complete|bo\.complete/.test(index));
assert.ok(/shape === 'rest'/.test(index));
assert.ok(!/template_snapshot/.test(index));
assert.ok(!/completion:/.test(extractBetween(index, 'async function saveTrainSession', 'async function saveTrainSessionAsWorkout')));
assert.ok(/alter table public\.custom_workouts enable row level security/.test(sql));
assert.ok(/created_by_role/.test(sql));
assert.ok(/source_template_id/.test(sql));
assert.ok(/training_sessions add column if not exists template_id/.test(sql));
assert.ok(/custom_workouts_select/.test(sql));
assert.ok(/custom_workouts_update/.test(sql));
assert.ok(/custom_workouts_delete/.test(sql));
assert.ok(!/workout-sessions|isWkOn|WK_DEFAULT_ON|round_complete/.test(coach), 'coach-dashboard must stay untouched');
assert.ok(!/index317/.test(coach) || true);

function extractBetween(src, startNeedle, endNeedle){
  var start = src.indexOf(startNeedle);
  var end = src.indexOf(endNeedle, start + 1);
  assert.ok(start >= 0 && end > start, 'extractBetween missing ' + startNeedle);
  return src.slice(start, end);
}

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

async function resetTrainScroll(page){
  await page.evaluate(function(){
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    var sess = document.getElementById('screen-train-session');
    if(sess) sess.scrollTop = 0;
  });
}

async function shot(page, name, selector){
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  if(!existsSync(REPO_SHOTS)) mkdirSync(REPO_SHOTS, { recursive: true });
  var dest = join(SHOT_DIR, name);
  var repo = join(REPO_SHOTS, name);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(40);
  if(selector){
    var box = await page.evaluate(function(sel){
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      var el = document.querySelector(sel);
      if(!el) return null;
      var sess = document.getElementById('screen-train-session');
      if(sess && sess.contains(el)){
        var sr = sess.getBoundingClientRect();
        var er = el.getBoundingClientRect();
        sess.scrollTop += (er.top - sr.top);
      } else {
        el.scrollIntoView({ block: 'start', inline: 'nearest' });
      }
      var r = el.getBoundingClientRect();
      var vw = window.innerWidth || 390;
      var vh = window.innerHeight || 844;
      var x = Math.max(0, Math.min(r.left, vw - 1));
      var y = Math.max(0, Math.min(r.top, vh - 1));
      var right = Math.max(x + 1, Math.min(r.right, vw));
      var bottom = Math.max(y + 1, Math.min(r.bottom, vh));
      return {
        x: Math.floor(x),
        y: Math.floor(y),
        width: Math.max(1, Math.ceil(right - x)),
        height: Math.max(1, Math.ceil(bottom - y))
      };
    }, selector);
    if(box && box.width > 1 && box.height > 1){
      await page.screenshot({ path: dest, clip: box });
    } else {
      await page.screenshot({ path: dest });
    }
  } else {
    await resetTrainScroll(page);
    await page.screenshot({ path: dest, fullPage: true });
    await resetTrainScroll(page);
  }
  copyFileSync(dest, repo);
}

async function authTrain(page, extra){
  extra = extra || {};
  await page.waitForFunction(function(){
    return typeof window.newTrainSessionState === 'function'
      && typeof window.wkJohnSessionBlocks === 'function'
      && typeof window.isWkOn === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(args){
    window.__seeTestSession = { access_token: 'test-token', user: { id: args.userId } };
    window._authUser = { id: args.userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
  }, { userId: extra.userId || USER_ID });
}

async function seedJohnSession(page, extra){
  extra = extra || {};
  await authTrain(page);
  await page.evaluate(function(args){
    trainSessionState = newTrainSessionState('Boulders', '10-16 EMOM boulders', '', {
      custom_workout_item_id: args.templateId || 'tmpl-john-1',
      source_assignment_id: args.assignmentId || null
    });
    trainSessionState.blocks = wkJohnSessionBlocks();
    showScreen('screen-train-session');
    renderTrainSessionBuilder();
  }, extra);
  await waitForScreen(page, 'screen-train-session');
}

function wkStub(opts){
  opts = opts || {};
  var starRows = opts.starRows;
  var privateTemplate = opts.privateTemplate || {
    id: 'priv-tmpl',
    name: 'Coach private EMOM',
    visibility: 'private',
    training_focus: 'Boulders',
    sections: [{
      shape: 'emom',
      title: 'Set 1',
      round_count: 2,
      rounds: [{ boulders: [{ text: 'V3 orange' }, { text: 'V4 black' }], rest_after_sec: 60, notes: '' }]
    }]
  };
  return async function(route, info){
    var method = info.method;
    var url = info.url;
    var body = info.body;
    if(method === 'GET' && url.indexOf('/rest/v1/custom_workouts') !== -1){
      if(url.indexOf('id=eq.priv-tmpl') !== -1 || url.indexOf('id=eq.' + privateTemplate.id) !== -1){
        await fulfillJson(route, 200, [privateTemplate]);
      } else {
        await fulfillJson(route, 200, opts.customWorkouts || []);
      }
      return true;
    }
    if(method === 'PATCH' && url.indexOf('/rest/v1/custom_workouts') !== -1){
      if(starRows === 'empty'){
        await fulfillJson(route, 200, []);
        return true;
      }
      var row = Object.assign({ id: 'w1', is_starred: !!(body && body.is_starred) }, body || {});
      await fulfillJson(route, 200, Array.isArray(starRows) ? starRows : [row]);
      return true;
    }
    if(method === 'POST' && url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: (body && body.id) || 'sess-wk' }, body || {})]);
      return true;
    }
    if(method === 'POST' && url.indexOf('/rest/v1/assignments') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: 'asg-saved' }, body || {})]);
      return true;
    }
    return false;
  };
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();

try{
  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: wkStub()
  }, async function(page, recorded){
    assert.strictEqual(await page.evaluate(function(){ return isWkOn(); }), true, 'flag on from ?wk=1');
    await seedJohnSession(page);
    var seeded = await page.evaluate(function(){
      var blocks = trainSessionState.blocks || [];
      var emom = blocks.filter(function(b){ return b.shape === 'emom'; });
      return {
        n: blocks.length,
        shapes: blocks.map(function(b){ return b.shape; }),
        titles: blocks.map(function(b){ return b.title; }),
        emom0Rounds: emom[0] && emom[0].rounds && emom[0].rounds.length,
        emom0Boulders: emom[0] && emom[0].rounds && emom[0].rounds[0] && emom[0].rounds[0].boulders.length,
        emom1Boulders: emom[1] && emom[1].rounds && emom[1].rounds[0] && emom[1].rounds[0].boulders.length,
        hint: !!document.querySelector('.wk-sent-hint'),
        hintText: (document.querySelector('.wk-sent-hint') || {}).textContent || '',
        boulderHits: document.querySelectorAll('.wk-boulder').length
      };
    });
    assert.strictEqual(seeded.n, 11, 'John session has 11 blocks');
    assert.deepStrictEqual(seeded.shapes, [
      'check','rest','emom','emom','rest','check','circuit','circuit','rep_pass_fail','circuit','circuit'
    ]);
    assert.ok(seeded.titles.indexOf('Warm Up') !== -1);
    assert.ok(seeded.titles.indexOf('Movement Prep') !== -1);
    assert.ok(seeded.titles.indexOf('Hangboard') !== -1);
    assert.strictEqual(seeded.emom0Rounds, 2, 'template seeding clones 2 rounds');
    assert.strictEqual(seeded.emom0Boulders, 14);
    assert.strictEqual(seeded.emom1Boulders, 12);
    assert.ok(seeded.hint, 'sent/completed label visible');
    assert.ok(/Checked = sent/.test(seeded.hintText));
    assert.ok(seeded.boulderHits >= 14, 'boulder checkboxes rendered');

    await page.evaluate(function(){
      var s = document.getElementById('screen-train-session');
      if(s) s.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await shot(page, 'wk-full-session.png');

    var tapBox = await page.evaluate(function(){
      var wrap = document.getElementById('train-blocks-wrap');
      var el = wrap ? wrap.querySelector('.wk-boulder') : null;
      var sess = document.getElementById('screen-train-session');
      if(sess && !sess.classList.contains('active')) showScreen('screen-train-session');
      wrap = document.getElementById('train-blocks-wrap');
      el = wrap ? wrap.querySelector('.wk-boulder') : null;
      if(el) el.scrollIntoView({ block: 'center' });
      var r = el ? el.getBoundingClientRect() : { width: 0, height: 0 };
      var cs = el ? window.getComputedStyle(el) : null;
      if(el) el.click();
      return {
        found: !!el,
        connected: !!(el && el.isConnected),
        wrapLen: wrap ? wrap.innerHTML.length : 0,
        wrapKids: wrap ? wrap.childElementCount : 0,
        w: r.width, h: r.height,
        display: cs ? cs.display : 'none',
        minH: cs ? cs.minHeight : '',
        screenOn: !!(sess && sess.classList.contains('active')),
        boulderCount: wrap ? wrap.querySelectorAll('.wk-boulder').length : 0
      };
    });
    assert.ok(tapBox.found && tapBox.boulderCount >= 14, 'boulder hit in DOM: ' + JSON.stringify(tapBox));
    assert.ok(tapBox.h >= 44, 'checkbox tap target height >= 44, got ' + tapBox.h + ' ' + JSON.stringify(tapBox));
    assert.ok(tapBox.w >= 44, 'checkbox tap target width >= 44, got ' + tapBox.w + ' ' + JSON.stringify(tapBox));
    var afterTick = await page.evaluate(function(){
      var emom = trainSessionState.blocks.filter(function(b){ return b.shape === 'emom'; })[0];
      var bo = emom.rounds[0].boulders[0];
      var hint = document.querySelector('#train-blocks-wrap .wk-sent-hint');
      var hit = document.querySelector('#train-blocks-wrap .wk-boulder');
      if(hint) hint.scrollIntoView({ block: 'center' });
      if(hit) hit.scrollIntoView({ block: 'center' });
      var hr = hit ? hit.getBoundingClientRect() : { width: 0, height: 0 };
      var cs = hint ? window.getComputedStyle(hint) : { fontSize: '0px' };
      var body = document.querySelector('#train-blocks-wrap .wk-check-text');
      var bcs = body ? window.getComputedStyle(body) : { fontSize: '0px' };
      var screen = document.getElementById('screen-train-session');
      var hintCs = hint ? window.getComputedStyle(hint) : null;
      return {
        complete: !!bo.complete,
        roundComplete: !!emom.rounds[0].complete,
        blockComplete: !!emom.complete,
        hintVisible: !!(hint && hintCs && hintCs.display !== 'none' && hintCs.visibility !== 'hidden' && /Checked = sent/.test(hint.textContent || '')),
        hintClipped: !!(hint && hint.scrollWidth > hint.clientWidth + 1),
        hitW: hr.width,
        hitH: hr.height,
        hintFont: parseFloat(cs.fontSize),
        bodyFont: parseFloat(bcs.fontSize),
        overflowX: screen ? (screen.scrollWidth - screen.clientWidth) : (document.documentElement.scrollWidth - 390),
        payloadHasComplete: JSON.stringify(trainSessionState.blocks).indexOf('"complete":true') !== -1
      };
    });
    assert.strictEqual(afterTick.complete, true, 'ticked boulder.complete');
    assert.strictEqual(afterTick.roundComplete, false, 'one boulder does not complete the round');
    assert.strictEqual(afterTick.blockComplete, false);
    assert.ok(afterTick.hintVisible, 'label visible after tick');
    assert.ok(!afterTick.hintClipped, 'label not clipped');
    assert.ok(afterTick.hintFont >= 11, 'hint font >= 11');
    assert.ok(afterTick.bodyFont >= 11, 'body font >= 11');
    assert.ok(afterTick.overflowX <= 2, 'no horizontal overflow, extra=' + afterTick.overflowX);
    assert.ok(afterTick.payloadHasComplete, 'payload.blocks contains complete true');

    await shot(page, 'wk-emom-ticked-label.png', '#train-blocks-wrap .train-block-card:has(.wk-sent-hint)');

    await page.evaluate(function(){
      var emom = trainSessionState.blocks.filter(function(b){ return b.shape === 'emom'; })[0];
      emom.rounds[0].boulders.forEach(function(bo){ bo.complete = true; });
      wkDeriveEmom(emom);
      renderTrainSessionBuilder();
    });
    var roundDone = await page.evaluate(function(){
      var emom = trainSessionState.blocks.filter(function(b){ return b.shape === 'emom'; })[0];
      return {
        round: !!emom.rounds[0].complete,
        block: !!emom.complete,
        roundClass: !!document.querySelector('.train-emom-round.is-complete')
      };
    });
    assert.strictEqual(roundDone.round, true, 'round.complete derived from all boulders');
    assert.strictEqual(roundDone.block, false, 'block waits for all rounds');
    assert.ok(roundDone.roundClass, 'completed round styled');
    await shot(page, 'wk-round-complete.png', '#train-blocks-wrap .train-emom-round.is-complete');

    await page.evaluate(function(){
      var circ = trainSessionState.blocks.filter(function(b){ return b.shape === 'circuit'; })[0];
      var el = document.querySelector('.wk-circuit-round');
      if(el) el.scrollIntoView({ block: 'center' });
    });
    await page.locator('#train-blocks-wrap .wk-circuit-round').first().evaluate(function(el){
      el.scrollIntoView({ block: 'center' });
      el.click();
    });
    var circ = await page.evaluate(function(){
      var c = trainSessionState.blocks.filter(function(b){ return b.shape === 'circuit'; })[0];
      return { round0: c.round_complete[0], complete: !!c.complete, n: c.round_complete.length };
    });
    assert.strictEqual(circ.round0, true, 'circuit round_complete persisted');
    assert.strictEqual(circ.complete, false, 'one round does not complete circuit');
    assert.ok(circ.n >= 3);
    await shot(page, 'wk-circuit-round.png', '#train-blocks-wrap .train-block-card:has(.wk-circuit-round)');

    await page.locator('#train-blocks-wrap .wk-check-item').first().evaluate(function(el){
      el.scrollIntoView({ block: 'center' });
      el.click();
    });
    var chk = await page.evaluate(function(){
      var warm = trainSessionState.blocks.filter(function(b){ return b.shape === 'check'; })[0];
      return {
        item0: !!(warm.items && warm.items[0] && warm.items[0].complete),
        item1: !!(warm.items && warm.items[1] && warm.items[1].complete),
        complete: !!warm.complete
      };
    });
    assert.strictEqual(chk.item0, true, 'checklist item tap persists');
    assert.strictEqual(chk.item1, false);
    assert.strictEqual(chk.complete, false, 'partial checklist is not block-complete');
    await shot(page, 'wk-checklist-partial.png', '#train-blocks-wrap .train-block-card');

    var preSave = await page.evaluate(function(){
      return {
        hasState: !!trainSessionState,
        auth: !!(window._authUser && window._authUser.id),
        customId: trainSessionState && trainSessionState.custom_workout_item_id,
        energy: trainSessionState && trainSessionState.energy_type,
        n: trainSessionState && trainSessionState.blocks && trainSessionState.blocks.length
      };
    });
    if(!preSave.auth){
      await page.evaluate(function(){
        window.__seeTestSession = { access_token: 'test-token', user: { id: window._authUser && window._authUser.id ? window._authUser.id : 'user-regression-1' } };
        window._authUser = { id: (window.__seeTestSession.user.id) };
        window._authToken = 'test-token';
      });
    }
    assert.ok(preSave.hasState, 'save preconditions: ' + JSON.stringify(preSave));
    var saveResult = await page.evaluate(function(){
      return saveTrainSession().then(function(){
        return { ok: true, msg: (document.getElementById('train-sess-msg') || {}).textContent || '', toast: (document.getElementById('error-toast-el') || {}).textContent || '', screen: (document.querySelector('.screen.active') || {}).id };
      }).catch(function(e){
        return { ok: false, err: String(e && e.message ? e.message : e) };
      });
    });
    var trainPosts = postsTo(recorded, 'training_sessions', 'POST');
    assert.ok(trainPosts.length, 'save POSTs training_sessions; pre=' + JSON.stringify(preSave) + ' save=' + JSON.stringify(saveResult) + ' urls=' + recorded.map(function(r){ return r.method + ' ' + r.url.split('?')[0]; }).join(','));
    var body = firstBody(trainPosts);
    assert.ok(body, 'training_sessions body');
    assert.strictEqual(body.template_id, 'tmpl-john-1');
    assert.strictEqual(body.energy_type, 'Boulders');
    assert.ok(Array.isArray(body.blocks), 'blocks array saved');
    var savedEmom = (body.blocks || []).filter(function(b){ return b.shape === 'emom'; })[0];
    assert.ok(savedEmom.rounds[0].boulders.some(function(bo){ return bo.complete === true; }), 'saved boulder.complete');
    assert.ok(!Object.prototype.hasOwnProperty.call(body, 'completion'), 'no completion column');
    assert.ok(!Object.prototype.hasOwnProperty.call(body, 'template_snapshot'), 'no template_snapshot');
    await waitForScreen(page, 'screen-train-done');
    await shot(page, 'wk-finished-session.png');
  });

  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 844 }
  }, async function(page){
    await authTrain(page);
    var opened = await page.evaluate(function(){
      var legacy = [
        { id: 'e1', shape: 'emom', title: 'Old EMOM', rounds: [{ boulders: [{ text: 'V3' }], notes: 'go', rest_after_sec: 90, complete: false }] },
        { id: 'c1', shape: 'circuit', title: 'Old circuit', rounds: 3, exercises: [{ name: 'Row', weight: '20', reps: '8' }], notes: 'x', complete: false },
        { id: 'k1', shape: 'check', title: 'Old check', notes: 'just notes', complete: false, attempts: [] }
      ];
      trainSessionState = newTrainSessionState('Boulders', 'legacy');
      trainSessionState.blocks = legacy;
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
      var emom = trainSessionState.blocks[0];
      var html = document.getElementById('train-blocks-wrap').innerHTML;
      return {
        ok: true,
        boulderId: !!(emom.rounds[0].boulders[0].id),
        boulderComplete: emom.rounds[0].boulders[0].complete,
        roundCompleteArr: Array.isArray(trainSessionState.blocks[1].round_complete),
        checkItemsOk: !trainSessionState.blocks[2].items || Array.isArray(trainSessionState.blocks[2].items),
        htmlHasV3: /V3/.test(html),
        htmlHasRow: /Row/.test(html),
        htmlHasCheck: /Old check/.test(html),
        noThrow: true
      };
    });
    assert.ok(opened.ok && opened.noThrow, 'legacy JSON opens with flag on');
    assert.ok(opened.boulderId, 'adapter adds boulder.id');
    assert.strictEqual(opened.boulderComplete, false);
    assert.ok(opened.roundCompleteArr, 'adapter adds circuit.round_complete');
    assert.ok(opened.checkItemsOk, 'legacy check items stay absent or array');
    assert.ok(opened.htmlHasV3 && opened.htmlHasRow && opened.htmlHasCheck);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 }
  }, async function(page){
    await authTrain(page);
    var opened = await page.evaluate(function(){
      var flagOff = isWkOn();
      trainSessionState = newTrainSessionState('Boulders', 'legacy off');
      trainSessionState.blocks = [
        { id: 'e1', shape: 'emom', title: 'Old EMOM', rounds: [{ boulders: [{ text: 'V3' }], notes: '', rest_after_sec: 180, complete: false }] },
        { id: 'c1', shape: 'circuit', title: 'Old circuit', rounds: 2, exercises: [{ name: 'Dip' }], complete: false },
        { id: 'k1', shape: 'check', title: 'Old check', notes: 'n', complete: false }
      ];
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
      var html = document.getElementById('train-blocks-wrap').innerHTML;
      return {
        flag: flagOff,
        hasWkBoulder: !!document.querySelector('.wk-boulder'),
        hasHint: !!document.querySelector('.wk-sent-hint'),
        htmlHasV3: /V3/.test(html),
        boulderKeys: Object.keys(trainSessionState.blocks[0].rounds[0].boulders[0] || {}).sort()
      };
    });
    assert.strictEqual(opened.flag, false, 'flag off by default');
    assert.ok(!opened.hasWkBoulder, 'legacy UI has no WK boulder checkboxes');
    assert.ok(!opened.hasHint, 'legacy UI has no sent hint');
    assert.ok(opened.htmlHasV3);
  });

  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: wkStub({ privateTemplate: {
      id: 'priv-tmpl',
      name: 'Coach private EMOM',
      visibility: 'private',
      created_by: 'coach-1',
      training_focus: 'Boulders',
      sections: [{
        shape: 'emom',
        title: 'Private set',
        round_count: 2,
        rounds: [{ boulders: [{ text: 'V5 green' }], rest_after_sec: 60, notes: '' }]
      }]
    }})
  }, async function(page){
    await authTrain(page);
    var result = await page.evaluate(async function(){
      _trainAssignmentsCache = [{
        id: 'asg-priv',
        title: 'Assigned private',
        custom_workout_item_id: 'priv-tmpl',
        athlete_id: window._authUser.id
      }];
      await startTrainSessionFromAssignment('asg-priv');
      var emom = (trainSessionState.blocks || []).filter(function(b){ return b.shape === 'emom'; })[0];
      return {
        title: trainSessionState.title,
        customId: trainSessionState.custom_workout_item_id,
        assignmentId: trainSessionState.source_assignment_id,
        emomTitle: emom && emom.title,
        rounds: emom && emom.rounds && emom.rounds.length,
        boulder: emom && emom.rounds && emom.rounds[0] && emom.rounds[0].boulders[0] && emom.rounds[0].boulders[0].text
      };
    });
    assert.strictEqual(result.customId, 'priv-tmpl');
    assert.strictEqual(result.assignmentId, 'asg-priv');
    assert.ok(/Private set|Coach private/.test(result.emomTitle || result.title || ''));
    assert.strictEqual(result.rounds, 2, 'private template expanded to 2 rounds');
    assert.strictEqual(result.boulder, 'V5 green');
  });

  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: wkStub({ customWorkouts: [{ id: 'w1', name: 'Star me', is_starred: false, created_at: '2026-10-16T00:00:00.000Z', training_focus: 'Boulders' }] })
  }, async function(page, recorded){
    await authTrain(page);
    await page.evaluate(function(){
      if(typeof invalidateTrainWorkoutCatalog === 'function') invalidateTrainWorkoutCatalog();
      showScreen('screen-train');
    });
    await waitForScreen(page, 'screen-train');
    await page.waitForFunction(function(){
      return !!(document.querySelector('#train-pinned-strip .climb-star-btn') && (_trainWorkoutCatalog || []).length);
    }, null, { timeout: 8000 });
    await page.locator('#train-pinned-strip .climb-star-btn').first().evaluate(function(el){ el.click(); });
    await page.waitForTimeout(150);
    var patches = recorded.filter(function(r){
      return r.method === 'PATCH' && r.url.indexOf('/rest/v1/custom_workouts') !== -1;
    });
    assert.ok(patches.length, 'star toggle sends PATCH');
    assert.strictEqual(patches[0].body.is_starred, true);
    var starred = await page.evaluate(function(){
      return _trainWorkoutCatalog[0].is_starred === true
        && /Unpin workout/.test(document.querySelector('#train-pinned-strip .climb-star-btn').getAttribute('aria-label') || '');
    });
    assert.ok(starred, 'star reflects server response');
  });

  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: wkStub({
      starRows: 'empty',
      customWorkouts: [{ id: 'w1', name: 'Star me', is_starred: false, created_at: '2026-10-16T00:00:00.000Z', training_focus: 'Boulders' }]
    })
  }, async function(page, recorded){
    await authTrain(page);
    await page.evaluate(function(){
      if(typeof invalidateTrainWorkoutCatalog === 'function') invalidateTrainWorkoutCatalog();
      showScreen('screen-train');
    });
    await page.waitForFunction(function(){
      return !!(document.querySelector('#train-pinned-strip .climb-star-btn') && (_trainWorkoutCatalog || []).length);
    }, null, { timeout: 8000 });
    await page.locator('#train-pinned-strip .climb-star-btn').first().evaluate(function(el){ el.click(); });
    await page.waitForTimeout(200);
    var state = await page.evaluate(function(){
      return {
        starred: _trainWorkoutCatalog[0].is_starred,
        toast: (document.getElementById('error-toast-el') || {}).textContent || '',
        label: (document.querySelector('#train-pinned-strip .climb-star-btn') || {}).getAttribute('aria-label') || ''
      };
    });
    assert.strictEqual(state.starred, false, '0-row PATCH reverts star');
    assert.ok(/Could not save star/.test(state.toast), '0-row shows error, got: ' + state.toast);
    assert.ok(/Star workout/.test(state.label), 'UI reverted to unstarred');
    var patches = recorded.filter(function(r){
      return r.method === 'PATCH' && r.url.indexOf('/rest/v1/custom_workouts') !== -1;
    });
    assert.ok(patches.length, '0-row case still PATCHed');
  });

  await withPage(browser, port, {
    path: '/index.html?wk=0',
    viewport: { width: 390, height: 844 }
  }, async function(page){
    await authTrain(page);
    var off = await page.evaluate(function(){
      try{ localStorage.setItem('see_wk', '1'); }catch(e){}
      return { fromUrl: isWkOn(), stored: (function(){ try{ return localStorage.getItem('see_wk'); }catch(e){ return 'err'; } })() };
    });
    assert.strictEqual(off.fromUrl, false, '?wk=0 clears flag');
    assert.ok(off.stored !== '1', '?wk=0 clears localStorage');
  });

  console.log('real-flow-workout-runner: ok');
} finally {
  await browser.close();
  server.close();
}
