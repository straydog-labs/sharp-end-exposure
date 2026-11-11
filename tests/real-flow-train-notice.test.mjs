import { readFileSync, existsSync, mkdirSync } from 'fs';
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
const coach = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');
const insights = existsSync(join(root, 'js/coach-athlete-insights.js'))
  ? readFileSync(join(root, 'js/coach-athlete-insights.js'), 'utf8')
  : '';
const SHOT_DIR = '/opt/cursor/artifacts/screenshots';

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index327'/.test(index));
assert.ok(/APP_VERSION = 'index327'/.test(sw));
assert.ok(/PSYCHE_AWARENESS_CREDIT_PER = 'session'/.test(index));
assert.ok(/What did you notice\?/.test(index));
assert.ok(/How present were you\?/.test(index));
assert.ok(/1 Autopilot/.test(index) && /5 Dialed in/.test(index));
assert.ok(/Body, effort, attention\. What was different this time\?/.test(index));
assert.ok(/After each block, note what you noticed\./.test(index));
assert.ok(/see_train_notice_hint/.test(index));
assert.ok(/function trainStripBlockForLibrary\(/.test(index));
assert.ok(/function creditTrainingAwareness\(/.test(index));
assert.ok(/function creditClimbAwareness\(/.test(index));
assert.ok(/drill_key: 'awareness'|logPsycheDrill\('awareness'/.test(index));
assert.ok(/key: 'awareness', label: 'Awareness'/.test(index));
assert.ok(/d\.drill_key !== 'awareness'/.test(index));
assert.ok(!/What did you notice\?/.test(coach));
assert.ok(!/creditTrainingAwareness/.test(coach));
assert.ok(!/creditClimbAwareness/.test(insights));

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function awarenessStub(store){
  store.rows = store.rows || [];
  return async function(route, info){
    if(info.method === 'GET' && info.url.indexOf('/rest/v1/psyche_drills') !== -1){
      var live = store.rows.filter(function(r){ return !r.deleted_at; });
      await fulfillJson(route, 200, live);
      return true;
    }
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/psyche_drills') !== -1){
      var row = Object.assign({ id: 'aw-' + (store.rows.length + 1), deleted_at: null }, info.body || {});
      store.rows.push(row);
      await fulfillJson(route, 201, [row]);
      return true;
    }
    if(info.method === 'PATCH' && info.url.indexOf('/rest/v1/psyche_drills') !== -1){
      var idMatch = /id=eq\.([^&]+)/.exec(info.url);
      var id = idMatch ? decodeURIComponent(idMatch[1]) : null;
      var found = store.rows.find(function(r){ return String(r.id) === String(id); });
      if(found) Object.assign(found, info.body || {});
      await fulfillJson(route, 200, [found || Object.assign({ id: id }, info.body || {})]);
      return true;
    }
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: (info.body && info.body.id) || 'sess-notice' }, info.body || {})]);
      return true;
    }
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: 'cw-notice' }, info.body || {})]);
      return true;
    }
    return false;
  };
}

async function shot(page, name, selector){
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  var dest = join(SHOT_DIR, name);
  await page.setViewportSize({ width: 390, height: 844 });
  if(selector){
    await page.evaluate(function(sel){
      window.scrollTo(0, 0);
      var el = document.querySelector(sel);
      if(!el) return;
      var overlay = document.getElementById('see-shot-overlay');
      if(overlay) overlay.remove();
      overlay = document.createElement('div');
      overlay.id = 'see-shot-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg,#111);z-index:99999;padding:16px;overflow:auto;';
      overlay.appendChild(el.cloneNode(true));
      document.body.appendChild(overlay);
    }, selector);
    await page.waitForTimeout(80);
    await page.screenshot({ path: dest, animations: 'disabled' });
    await page.evaluate(function(){
      var overlay = document.getElementById('see-shot-overlay');
      if(overlay) overlay.remove();
    });
  } else {
    await page.screenshot({ path: dest, animations: 'disabled' });
  }
}

async function authTrain(page){
  await page.waitForFunction(function(){
    return typeof window.newTrainSessionState === 'function'
      && typeof window.isWkOn === 'function'
      && typeof window.trainAddBlock === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window.prompt = function(msg, def){ return def || 'Notice workout'; };
    try{ localStorage.removeItem('see_train_notice_hint'); }catch(e){}
    try{ localStorage.removeItem('see_train_session_draft'); }catch(e){}
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

async function seedNoticeSession(page){
  await authTrain(page);
  await page.evaluate(function(){
    trainSessionState = newTrainSessionState('Boulders', 'Notice session');
    trainAddBlock('emom');
    trainAddBlock('rep_pass_fail');
    trainAddBlock('circuit');
    trainAddBlock('rest');
    trainAddBlock('mental');
    var emom = trainSessionState.blocks[0];
    emom.rounds[0].boulders = [{ id: uid(), text: 'V3 blue', complete: false }];
    var circuit = trainSessionState.blocks[2];
    circuit.round_complete = [false];
    circuit.rounds = 1;
    circuit.exercises = [{ name: 'Squat', weight: '40kg', reps: '8' }];
    var mental = trainSessionState.blocks[4];
    mental.title = 'Mental';
    mental.items = [{ id: uid(), text: 'Breathe', complete: false }];
    showScreen('screen-train-session');
    renderTrainSessionBuilder();
  });
  await waitForScreen(page, 'screen-train-session');
}

async function completeEmom(page){
  await page.evaluate(function(){
    var emom = trainSessionState.blocks[0];
    toggleWkBoulder(emom.id, 0, emom.rounds[0].boulders[0].id);
  });
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
const store = { rows: [] };
try{
  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: awarenessStub(store)
  }, async function(page, recorded){
    await seedNoticeSession(page);
    var hint = await page.evaluate(function(){
      var el = document.getElementById('train-notice-hint');
      return el && !el.hidden && /After each block, note what you noticed/.test(el.textContent || '');
    });
    assert.ok(hint, 'first-time hint under session header');
    await page.evaluate(function(){ dismissTrainNoticeHint(); });
    assert.ok(await page.evaluate(function(){ return document.getElementById('train-notice-hint').hidden; }), 'hint dismisses');

    assert.ok(!(await page.$('#train-blocks-wrap .wk-notice-card')), 'no prompt before complete');
    await completeEmom(page);
    await page.waitForSelector('#train-blocks-wrap .wk-notice-card', { timeout: 5000 });
    var cardText = await page.textContent('#train-blocks-wrap .wk-notice-card');
    assert.ok(/What did you notice\?/.test(cardText));
    assert.ok(/How present were you\?/.test(cardText));
    assert.ok(/Autopilot/.test(cardText) && /Dialed in/.test(cardText));
    await shot(page, 'train-notice-prompt.png', '#train-blocks-wrap .wk-notice-card');

    var emomId = await page.evaluate(function(){ return trainSessionState.blocks[0].id; });
    await tap(page, '#train-blocks-wrap .wk-notice-chip[data-notice-att="4"]');
    await page.evaluate(function(id){
      var el = document.getElementById('tb-' + id + '-notice');
      if(el){
        el.scrollIntoView();
        el.value = 'Kept eyes on the next hold';
      }
      collectTrainBlockFields();
      renderTrainSessionBuilder();
    }, emomId);
    var notice = await page.evaluate(function(){ return trainSessionState.blocks[0].notice; });
    assert.strictEqual(notice.attention, 4);
    assert.ok(/Kept eyes/.test(notice.note));
    assert.ok(notice.at);
    await page.evaluate(function(){ trainSessionState.blocks[0]._noticeOpen = false; renderTrainSessionBuilder(); });
    var collapsed = await page.textContent('#train-blocks-wrap .wk-notice-collapsed');
    assert.ok(/Present 4\/5/.test(collapsed), 'collapsed summary Present 4/5');
    await shot(page, 'train-notice-collapsed.png', '[data-block-id="' + emomId + '"]');

    var restHas = await page.evaluate(function(){
      var rest = trainSessionState.blocks.find(function(b){ return b.shape === 'rest'; });
      toggleWkRestComplete(rest.id);
      return {
        complete: !!rest.complete,
        card: !!document.querySelector('[data-block-id="'+rest.id+'"] .wk-notice-card, [data-block-id="'+rest.id+'"] .wk-notice-link')
      };
    });
    assert.ok(restHas.complete);
    assert.ok(!restHas.card, 'rest never gets a notice prompt');

    await page.evaluate(function(){
      var hb = trainSessionState.blocks[1];
      hb.sets[0].reps.forEach(function(rp){ rp.ok = true; });
      trainMaybeOfferNotice(hb, false);
      var circ = trainSessionState.blocks[2];
      circ.round_complete = [true];
      trainMaybeOfferNotice(circ, false);
      var mental = trainSessionState.blocks[4];
      mental.items[0].complete = true;
      wkDeriveCheck(mental);
      trainMaybeOfferNotice(mental, false);
      circ.notice = { attention: 3, note: 'Legs quiet', at: new Date().toISOString() };
      mental.notice = { attention: 5, note: '', at: new Date().toISOString() };
      hb.notice = { attention: 2, note: 'Forearms', at: new Date().toISOString() };
      renderTrainSessionBuilder();
    });

    await page.evaluate(function(){ return saveTrainSessionAsWorkout(); });
    await page.waitForFunction(function(){
      var el = document.getElementById('train-sess-saved-workout');
      return !!(el && el.style.display === 'block');
    }, null, { timeout: 5000 });
    var cw = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
    assert.ok(cw && Array.isArray(cw.sections));
    cw.sections.forEach(function(b){
      assert.ok(!b.notice, 'Save workout strips notice');
      assert.strictEqual(b.complete, false);
    });

    await page.evaluate(function(){ return saveTrainSession(); });
    await waitForScreen(page, 'screen-train-done');
    var sess = firstBody(postsTo(recorded, 'training_sessions', 'POST'));
    assert.ok(sess.blocks[0].notice && sess.blocks[0].notice.attention === 4, 'Finish session keeps notice');
    var awPosts = postsTo(recorded, 'psyche_drills', 'POST').filter(function(r){
      var b = Array.isArray(r.body) ? r.body[0] : r.body;
      return b && b.drill_key === 'awareness';
    });
    assert.strictEqual(awPosts.length, 1, 'exactly one awareness row for 3+ answered blocks');
    var aw = Array.isArray(awPosts[0].body) ? awPosts[0].body[0] : awPosts[0].body;
    assert.strictEqual(aw.duration_seconds, null);
    assert.strictEqual(aw.metadata.source, 'training');
    assert.ok(aw.metadata.training_session_id);
    assert.ok(aw.metadata.blocks.length >= 3);

    await page.evaluate(async function(){
      var state = {
        id: _lastTrainSessionId,
        awarenessId: null,
        blocks: [{ shape: 'emom', title: 'EMOM', notice: { attention: 5, note: 'rewrote', at: new Date().toISOString() } }]
      };
      await creditTrainingAwareness(state);
    });
    var awPatch = postsTo(recorded, 'psyche_drills', 'PATCH');
    assert.ok(awPatch.length, 'resave PATCHes awareness, does not insert a second row');
    assert.strictEqual(postsTo(recorded, 'psyche_drills', 'POST').filter(function(r){
      var b = Array.isArray(r.body) ? r.body[0] : r.body;
      return b && b.drill_key === 'awareness';
    }).length, 1);

    await page.evaluate(function(row){
      paintTrainSessionDetail(row);
      showScreen('screen-train-session-detail');
    }, sess);
    await waitForScreen(page, 'screen-train-session-detail');
    var detail = await page.textContent('#train-session-detail-body');
    assert.ok(/What did you notice\?/.test(detail));
    assert.ok(/Present 4\/5/.test(detail));
    await shot(page, 'train-notice-history.png', '#train-session-detail-body');

    await page.evaluate(function(row){
      trainStartDuplicatedSession(row);
    }, sess);
    await waitForScreen(page, 'screen-train-session');
    var repeatNotice = await page.evaluate(function(){
      return (trainSessionState.blocks || []).some(function(b){ return !!b.notice; });
    });
    assert.ok(!repeatNotice, 'Repeat starts with notice cleared');

    await page.evaluate(function(){
      var wrap = document.getElementById('psyche-radar-wrap');
      if(wrap) wrap.closest('.insight-card') && (wrap.closest('.insight-card').style.display = 'block');
      buildPsycheRadar({ checkin: 1, breath: 1, exposure: 0, viz: 1, relax: 1, talk: 1, awareness: 2 });
      showScreen('screen-drill');
    });
    await waitForScreen(page, 'screen-drill');
    var radar = await page.evaluate(function(){
      var svg = document.querySelector('#psyche-radar-wrap svg');
      var texts = Array.prototype.map.call(document.querySelectorAll('#psyche-radar-wrap text'), function(t){ return t.textContent; });
      var vb = svg ? svg.getAttribute('viewBox') : '';
      var boxed = true;
      Array.prototype.forEach.call(document.querySelectorAll('#psyche-radar-wrap text'), function(t){
        var x = parseFloat(t.getAttribute('x'));
        var y = parseFloat(t.getAttribute('y'));
        if(!(x >= 0 && x <= 340 && y >= 0 && y <= 320)) boxed = false;
      });
      return { texts: texts, vb: vb, boxed: boxed, n: texts.length };
    });
    assert.ok(radar.texts.some(function(t){ return /Awareness/.test(t); }), 'radar has Awareness axis');
    assert.strictEqual(radar.n, 7, 'radar shows 7 axes');
    assert.ok(radar.boxed, 'radar labels inside viewBox');
    await shot(page, 'train-notice-radar.png', '#psyche-radar-wrap');

    var hist = await page.evaluate(function(){
      _psycheDrillsCache = [{
        created_at: new Date().toISOString(),
        drill_key: 'awareness',
        metadata: { source: 'training', blocks: [{ shape: 'emom', attention: 4, note: 'Kept eyes on the next hold' }] }
      }];
      renderPsycheHistoryList();
      var el = document.getElementById('psyche-recent-list');
      return el ? el.textContent : '';
    });
    assert.ok(/Awareness/.test(hist));
    assert.ok(/Training/.test(hist));
    assert.ok(/Kept eyes on the next hold/.test(hist));
    await shot(page, 'train-notice-psyche-history.png', '#psyche-recent-list');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page, recorded){
    await page.waitForFunction(function(){
      return typeof window.startDeeper === 'function' && typeof window.afterQ4 === 'function';
    }, null, { timeout: 30000 });
    await page.evaluate(function(userId){
      window._authUser = { id: userId };
      window._authToken = 'test-token';
      window.loadClimbLog = function(){ return Promise.resolve(); };
      window.loadHomeScreen = function(){ return Promise.resolve(); };
      logState.sessId = 'sess-climb-aw';
      logState.grade = '5.11a';
      logState.terrain = 'Overhang';
      logState.zone = 'learning';
      logState.zoneConf = 'estimated';
      startDeeper();
    }, USER_ID);
    await waitForScreen(page, 'screen-deeper');
    await tap(page, '#screen-deeper .chip[data-dq="q1"]:has-text("Easy and steady")');
    await tap(page, '#screen-deeper .chip[data-dq="q2"]:has-text("Settled, neutral")');
    await tap(page, '#screen-deeper .chip[data-dq="q3"]:has-text("Yes — I paused")');
    await tap(page, '#screen-deeper .chip[data-dq="q4"]:has-text("Settled and in control")');
    await tap(page, '#deeper-confirm-btn');
    await page.waitForTimeout(700);
    var climbAw = postsTo(recorded, 'psyche_drills', 'POST').filter(function(r){
      var b = Array.isArray(r.body) ? r.body[0] : r.body;
      return b && b.drill_key === 'awareness';
    });
    assert.strictEqual(climbAw.length, 1, 'Go Deeper body answers create one awareness row');
    var meta = (Array.isArray(climbAw[0].body) ? climbAw[0].body[0] : climbAw[0].body).metadata;
    assert.strictEqual(meta.source, 'climb');
    assert.ok(meta.answered.indexOf('breath') !== -1);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page, recorded){
    await page.waitForFunction(function(){
      return typeof window.startDeeper === 'function' && typeof window.selectEnjoyChip === 'function';
    }, null, { timeout: 30000 });
    await page.evaluate(function(userId){
      window._authUser = { id: userId };
      window._authToken = 'test-token';
      window.loadClimbLog = function(){ return Promise.resolve(); };
      window.loadHomeScreen = function(){ return Promise.resolve(); };
      logState.sessId = 'sess-enjoy-aw';
      logState.zone = 'learning';
      logState.zoneConf = 'estimated';
      startDeeper();
    }, USER_ID);
    await waitForScreen(page, 'screen-deeper');
    await tap(page, '#dq-enjoy-card .dq-chip[data-enjoy="4"]');
    await tap(page, '#deeper-confirm-btn');
    await waitForScreen(page, 'screen-log-done');
    var climbAw = postsTo(recorded, 'psyche_drills', 'POST').filter(function(r){
      var b = Array.isArray(r.body) ? r.body[0] : r.body;
      return b && b.drill_key === 'awareness';
    });
    assert.strictEqual(climbAw.length, 0, 'enjoyment-only does not create an awareness row');
  });

  await withPage(browser, port, {
    path: '/index.html?wk=0&aw=1',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    storage: { see_wk: '0' },
    stub: awarenessStub({ rows: [] })
  }, async function(page, recorded){
    await authTrain(page);
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Legacy');
      trainAddBlock('emom');
      trainSessionState.blocks[0].complete = true;
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
    });
    await waitForScreen(page, 'screen-train-session');
    var off = await page.evaluate(function(){
      return {
        wk: isWkOn(),
        card: !!document.querySelector('.wk-notice-card, .wk-notice-link'),
        hint: !document.getElementById('train-notice-hint').hidden
      };
    });
    assert.strictEqual(off.wk, false);
    assert.ok(!off.card, 'flag off: no notice prompt');
    assert.ok(!off.hint, 'flag off: no first-time hint');
    await page.evaluate(function(){ return saveTrainSession(); });
    await page.waitForTimeout(500);
    var aw = postsTo(recorded, 'psyche_drills', 'POST').filter(function(r){
      var b = Array.isArray(r.body) ? r.body[0] : r.body;
      return b && b.drill_key === 'awareness';
    });
    assert.strictEqual(aw.length, 0, 'flag off: no psych rows from training');
  });

  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await authTrain(page);
    var soft = await page.evaluate(async function(){
      var hidden = await lookupAwarenessRowId('training_session_id', 'gone');
      return hidden;
    });
    assert.strictEqual(soft, null, 'soft-deleted / missing awareness rows are ignored');
    var extra = await page.evaluate(function(){
      var counts = psycheRadarCounts([], [
        { created_at: '2026-09-08T12:00:00', drill_key: 'awareness' },
        { created_at: '2026-09-08T12:00:00', drill_key: 'awareness', deleted_at: '2026-09-08T13:00:00' },
        { created_at: '2026-09-08T12:00:00', drill_key: 'bee_humming' }
      ], 30, new Date('2026-09-09T12:00:00'));
      var now = new Date('2026-09-10T12:00:00');
      var checkins = [
        { created_at: '2026-09-10T10:00:00', is_checkin: true, zone: 'panic' },
        { created_at: '2026-09-09T10:00:00', is_checkin: true, zone: 'learning' },
        { created_at: '2026-09-08T10:00:00', is_checkin: true, zone: 'comfort' }
      ];
      var hub = computePsycheHubStats(checkins, [
        { created_at: '2026-09-10T11:00:00', drill_key: 'awareness' }
      ], now);
      var pinned = pickPsychePinned([
        { created_at: '2026-09-10', drill_key: 'awareness' },
        { created_at: '2026-09-09', drill_key: 'pmr' }
      ]);
      return { counts: counts, week: hub.week, pinned: pinned.map(function(p){ return p.row.drill_key; }) };
    });
    assert.strictEqual(extra.counts.awareness, 1, 'radar ignores soft-deleted awareness');
    assert.strictEqual(extra.counts.breath, 1);
    assert.notStrictEqual(extra.week, '—', 'hub week count includes awareness');
    assert.deepStrictEqual(extra.pinned, ['pmr'], 'pinned strip does not offer awareness');
  });
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
console.log('real-flow-train-notice: ok');
