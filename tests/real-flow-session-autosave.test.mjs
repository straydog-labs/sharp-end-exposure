import { readFileSync } from 'fs';
import { dirname, join } from 'path';
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
const htmlVer = (index.match(/var app_version = '([^']+)'/) || [])[1];

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(htmlVer, 'app_version pin');
assert.ok(new RegExp("APP_VERSION = '" + htmlVer + "'").test(sw));
assert.ok(/see_train_draft_/.test(index), 'per-user draft key');
assert.ok(/Session in progress/.test(index));
assert.ok(/Resume session in progress/.test(index));
assert.ok(/Start new \(discards the old one\)/.test(index));
assert.ok(!/window\.confirm\(/.test(index.slice(index.indexOf('function resumeTrainDraft'), index.indexOf('function renderTrainSessionBuilder'))));

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function assignmentItem(){
  return {
    id: 'lib-asg-night',
    name: 'Assignment night',
    description: 'due session',
    training_focus: 'Boulders',
    sections: [
      {
        shape: 'check', title: 'Warm up', notes: '', complete: false, attempts: [],
        items: [
          { text: 'shoulder rolls', complete: false },
          { text: 'easy climbing', complete: false }
        ]
      },
      {
        shape: 'emom', title: 'EMOM', complete: false, attempts: [], round_count: 2,
        rounds: [
          { boulders: [{ text: 'Blue' }, { text: 'Green' }], notes: '', rest_after_sec: 60, complete: false },
          { boulders: [{ text: 'Yellow' }], notes: '', rest_after_sec: 60, complete: false }
        ]
      },
      { shape: 'rest', title: 'Rest', duration_sec: 180, rest_after_sec: 180, complete: false, attempts: [] },
      {
        shape: 'rep_pass_fail', title: 'Hangboard', grip: '', assistance: '', complete: false, attempts: [],
        sets: [
          { grip: 'Half crimp', load: '35 lb assist', rest_after_sec: 180, reps: [{ ok: null }, { ok: null }] },
          { grip: 'Open hand', load: '20 lb assist', rest_after_sec: 180, reps: [{ ok: null }, { ok: null }] }
        ]
      }
    ]
  };
}

function stub(state){
  return async function(route, info){
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      if(state.failSave){
        await fulfillJson(route, 400, { message: 'save failed' });
        return true;
      }
      await fulfillJson(route, 201, [Object.assign({ id: (info.body && info.body.id) || 'sess-draft' }, info.body || {})]);
      return true;
    }
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/assignments') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: 'asg-created' }, info.body || {})]);
      return true;
    }
    return false;
  };
}

async function boot(page, keepDraft){
  await page.waitForFunction(function(){
    return typeof window.seedTrainSessionFromItem === 'function'
      && typeof window.paintTrainDraftCards === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(args){
    window._authUser = { id: args.userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window._hasRoutedAfterSignIn = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.routeSignedInHome = function(){ try{ paintTrainDraftCards(); }catch(e){} };
    try{ localStorage.removeItem('see_train_session_draft'); }catch(e){}
    if(!args.keepDraft){
      try{ localStorage.removeItem('see_train_draft_' + args.userId); }catch(e){}
    }
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, { userId: USER_ID, keepDraft: !!keepDraft });
}

function draftKey(userId){
  return 'see_train_draft_' + (userId || USER_ID);
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
const saveState = { failSave: false };
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(saveState)
  }, async function(page){
    await boot(page);
    var started = await page.evaluate(function(args){
      var userId = args.userId;
      seedTrainSessionFromItem(args.item, {
        source_assignment_id: 'asg-night',
        library_item_id: 'lib-asg-night'
      });
      var blocks = trainSessionState.blocks;
      var check = blocks.filter(function(b){ return b.shape === 'check'; })[0];
      var emom = blocks.filter(function(b){ return b.shape === 'emom'; })[0];
      var rest = blocks.filter(function(b){ return b.shape === 'rest'; })[0];
      var hang = blocks.filter(function(b){ return b.shape === 'rep_pass_fail'; })[0];
      toggleWkCheckItem(check.id, check.items[0].id);
      toggleWkBoulder(emom.id, 0, emom.rounds[0].boulders[0].id);
      toggleWkBoulder(emom.id, 0, emom.rounds[0].boulders[1].id);
      trainToggleRep(hang.id, 0, 0);
      trainToggleRep(hang.id, 0, 1);
      trainToggleRep(hang.id, 0, 1);
      trainToggleRep(hang.id, 1, 0);
      var note = document.getElementById('tb-' + check.id + '-chknotes');
      note.value = 'held the breath';
      note.dispatchEvent(new Event('input', { bubbles: true }));
      rest.interval_started_at = new Date(Date.now() - 30000).toISOString();
      rest.timer_started_at = new Date(Date.now() - 90000).toISOString();
      emom.rounds[0].rest_started_at = new Date(Date.now() - 10000).toISOString();
      markTrainDraftIfChanged();
      var before = localStorage.getItem('see_train_draft_' + userId);
      return {
        before: before,
        started_at: trainSessionState.started_at,
        title: trainSessionState.title,
        shapes: trainSessionState.blocks.map(function(b){ return b.shape; })
      };
    }, { userId: USER_ID, item: assignmentItem() });
    assert.strictEqual(started.before, null, 'draft is debounced, not written on the same turn');
    assert.deepStrictEqual(started.shapes, ['check', 'emom', 'rest', 'rep_pass_fail']);
    await page.waitForFunction(function(userId){
      return !!localStorage.getItem('see_train_draft_' + userId);
    }, USER_ID, { timeout: 2000 });
    var early = await page.evaluate(function(userId){
      var note = document.querySelector('#train-blocks-wrap textarea');
      note.value = 'pagehide note';
      note.dispatchEvent(new Event('input', { bubbles: true }));
      var mid = localStorage.getItem('see_train_draft_' + userId);
      window.dispatchEvent(new Event('pagehide'));
      var raw = localStorage.getItem('see_train_draft_' + userId);
      var env = JSON.parse(raw);
      return { mid: mid, note: env.state.blocks[0].notes, screen: env.screen, user: env.user_id, v: env.v };
    }, USER_ID);
    assert.ok(early.note === 'pagehide note', 'pagehide flushes the latest note, got ' + early.note);
    assert.strictEqual(early.screen, 'screen-train-session');
    assert.strictEqual(early.user, USER_ID);
    assert.strictEqual(early.v, 1);

    var expected = await page.evaluate(function(userId){
      return JSON.parse(localStorage.getItem('see_train_draft_' + userId)).state;
    }, USER_ID);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await boot(page, true);
    await page.evaluate(function(){
      showScreen('screen-home');
      paintTrainDraftCards();
    });
    var home = await page.evaluate(function(){
      var card = document.getElementById('home-train-draft-card');
      var active = document.querySelector('.screen.active');
      return {
        hidden: !card || card.hidden,
        text: card ? card.textContent : '',
        screen: active ? active.id : ''
      };
    });
    assert.strictEqual(home.screen, 'screen-home', 'resume card is on Home, got ' + home.screen);
    assert.strictEqual(home.hidden, false, 'Home shows the session card');
    assert.ok(home.text.indexOf('Session in progress') !== -1, home.text);
    assert.ok(home.text.indexOf('Assignment night') !== -1, home.text);
    assert.ok(/Resume/.test(home.text) && /Discard/.test(home.text));

    await page.evaluate(function(){ showScreen('screen-train'); });
    await page.waitForFunction(function(){
      var el = document.getElementById('train-signed-in-content');
      var card = document.getElementById('train-hub-draft-card');
      return el && el.style.display !== 'none' && card && !card.hidden;
    }, null, { timeout: 8000 });
    await page.evaluate(function(){
      document.getElementById('train-hub-draft-card').querySelector('.train-draft-resume').click();
    });
    await waitForScreen(page, 'screen-train-session');
    var restored = await page.evaluate(function(){
      var rest = trainSessionState.blocks.filter(function(b){ return b.shape === 'rest'; })[0];
      var emom = trainSessionState.blocks.filter(function(b){ return b.shape === 'emom'; })[0];
      var hang = trainSessionState.blocks.filter(function(b){ return b.shape === 'rep_pass_fail'; })[0];
      var check = trainSessionState.blocks.filter(function(b){ return b.shape === 'check'; })[0];
      var countdown = emomRoundCountdownState(emom.rounds[0], Date.now());
      var restLeft = computeCountdownState(new Date(rest.interval_started_at).getTime(), rest.duration_sec, Date.now());
      return {
        title: trainSessionState.title,
        started_at: trainSessionState.started_at,
        assignment: trainSessionState.source_assignment_id,
        library: trainSessionState.library_item_id,
        check: check.items[0].complete === true && check.items[1].complete === false,
        note: check.notes,
        boulder: emom.rounds[0].boulders[0].complete === true && emom.rounds[1].boulders[0].complete === false,
        reps: hang.sets[0].reps.map(function(r){ return r.ok; }).concat(hang.sets[1].reps.map(function(r){ return r.ok; })),
        elapsed: trainBlockTimerElapsedMs(rest),
        restLeft: restLeft.remainingMs,
        emomLeft: countdown.remainingMs,
        screen: (document.querySelector('.screen.active') || {}).id
      };
    });
    assert.strictEqual(restored.title, expected.title);
    assert.strictEqual(restored.started_at, expected.started_at);
    assert.strictEqual(restored.assignment, 'asg-night');
    assert.strictEqual(restored.library, 'lib-asg-night');
    assert.strictEqual(restored.check, true);
    assert.strictEqual(restored.note, 'pagehide note');
    assert.strictEqual(restored.boulder, true);
    assert.deepStrictEqual(restored.reps, [true, false, true, null]);
    assert.ok(restored.elapsed >= 80000, 'wall-clock block timer continues, got ' + restored.elapsed);
    assert.ok(restored.restLeft < 180000 && restored.restLeft > 100000, 'rest countdown continues from timestamp, got ' + restored.restLeft);
    assert.ok(restored.emomLeft < 60000 && restored.emomLeft > 30000, 'EMOM rest continues, got ' + restored.emomLeft);
    assert.strictEqual(restored.screen, 'screen-train-session');

    var reloadGuard = await page.evaluate(function(){
      window._seeReloads = 0;
      _seeHadController = true;
      _seeUpdateReloading = false;
      try{ sessionStorage.removeItem('see_update_later'); }catch(e){}
      seeReloadForUpdate = function(){ window._seeReloads++; };
      markSeeUpdatePending();
      return {
        reloads: window._seeReloads,
        banner: document.getElementById('see-update-banner').hidden,
        open: trainDraftSessionIsOpen()
      };
    });
    assert.strictEqual(reloadGuard.open, true);
    assert.strictEqual(reloadGuard.reloads, 0, 'open draft session does not auto-reload');
    assert.strictEqual(reloadGuard.banner, false, 'update stays on the banner');

    await page.evaluate(function(){ showScreen('screen-home'); paintTrainDraftCards(); });
    var discardAsk = await page.evaluate(function(){
      document.querySelector('#home-train-draft-card .train-draft-discard').click();
      var confirm = document.getElementById('home-train-draft-confirm');
      return { hidden: confirm.hidden, text: confirm.innerText };
    });
    assert.strictEqual(discardAsk.hidden, false);
    assert.ok(/Discard this session/.test(discardAsk.text));
    await page.evaluate(function(userId){
      document.querySelector('#home-train-draft-confirm .train-draft-discard').click();
      return localStorage.getItem('see_train_draft_' + userId);
    }, USER_ID);
    var afterDiscard = await page.evaluate(function(userId){
      var card = document.getElementById('home-train-draft-card');
      return {
        key: localStorage.getItem('see_train_draft_' + userId),
        hidden: card.hidden
      };
    }, USER_ID);
    assert.strictEqual(afterDiscard.key, null, 'Discard deletes the draft');
    assert.strictEqual(afterDiscard.hidden, true);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(saveState)
  }, async function(page, recorded){
    await boot(page);
    saveState.failSave = false;
    await page.evaluate(function(){
      seedTrainSessionFromItem({
        id: 'lib-save', name: 'Save me', training_focus: 'Hangboard',
        sections: [{ shape: 'check', title: 'Warm up', items: [{ text: 'arms', complete: false }] }]
      }, { source_assignment_id: 'asg-save', library_item_id: 'lib-save' });
      var check = trainSessionState.blocks[0];
      toggleWkCheckItem(check.id, check.items[0].id);
      var note = document.getElementById('tb-' + check.id + '-chknotes');
      note.value = 'save note';
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(600);
    await page.evaluate(function(){ document.getElementById('train-sess-save').click(); });
    await waitForScreen(page, 'screen-train-done');
    var saved = await page.evaluate(function(userId){
      return {
        draft: localStorage.getItem('see_train_draft_' + userId),
        legacy: localStorage.getItem('see_train_session_draft')
      };
    }, USER_ID);
    assert.strictEqual(saved.draft, null, 'successful save clears the draft');
    assert.strictEqual(saved.legacy, null);
    assert.ok(firstBody(postsTo(recorded, 'training_sessions', 'POST')));

    await page.evaluate(function(){
      showScreen('screen-train');
      seedTrainSessionFromItem({
        id: 'lib-fail', name: 'Keep me', training_focus: 'Hangboard',
        sections: [{ shape: 'rest', title: 'Rest', duration_sec: 60, rest_after_sec: 60 }]
      }, { source_assignment_id: 'asg-fail', library_item_id: 'lib-fail' });
      trainSessionState.blocks[0].complete = true;
      markTrainDraftIfChanged();
      scheduleTrainDraftSave();
    });
    await page.waitForTimeout(600);
    saveState.failSave = true;
    recorded.length = 0;
    await page.evaluate(function(){ document.getElementById('train-sess-save').click(); });
    await page.waitForTimeout(400);
    var kept = await page.evaluate(function(userId){
      var raw = localStorage.getItem('see_train_draft_' + userId);
      return {
        screen: (document.querySelector('.screen.active') || {}).id,
        title: raw ? JSON.parse(raw).state.title : null
      };
    }, USER_ID);
    assert.strictEqual(kept.screen, 'screen-train-session');
    assert.strictEqual(kept.title, 'Keep me', 'failed save keeps the draft');
    saveState.failSave = false;

    await page.evaluate(function(){
      trainSessionState.blocks[0].notes = 'cancel me';
      markTrainDraftIfChanged();
      scheduleTrainDraftSave();
    });
    await page.waitForTimeout(600);
    await page.click('#screen-train-session .back-btn');
    await page.click('#screen-train-session .back-btn');
    await waitForScreen(page, 'screen-train');
    var cancelled = await page.evaluate(function(userId){
      return localStorage.getItem('see_train_draft_' + userId);
    }, USER_ID);
    assert.strictEqual(cancelled, null, 'cancel clears the draft');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(saveState)
  }, async function(page){
    await boot(page);
    var ignored = await page.evaluate(function(userId){
      var key = 'see_train_draft_' + userId;
      var old = {
        v: 1, saved_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        user_id: userId, screen: 'screen-train-session', state: { title: 'old', blocks: [] }
      };
      localStorage.setItem(key, JSON.stringify(old));
      var errs = [];
      try{ paintTrainDraftCards(); }catch(e){ errs.push('old ' + e.message); }
      var oldGone = localStorage.getItem(key) == null;
      var oldCard = document.getElementById('home-train-draft-card').hidden;
      localStorage.setItem(key, JSON.stringify({
        v: 1, saved_at: new Date().toISOString(), user_id: 'someone-else',
        screen: 'screen-train-session', state: { title: 'other', blocks: [] }
      }));
      try{ paintTrainDraftCards(); }catch(e){ errs.push('other ' + e.message); }
      var otherGone = localStorage.getItem(key) == null;
      localStorage.setItem('see_train_draft_other-user', JSON.stringify({
        v: 1, saved_at: new Date().toISOString(), user_id: 'other-user',
        screen: 'screen-train-session', state: { title: 'foreign', blocks: [] }
      }));
      try{ paintTrainDraftCards(); }catch(e){ errs.push('foreign ' + e.message); }
      var foreignGone = localStorage.getItem('see_train_draft_other-user') == null;
      localStorage.setItem(key, '{not json');
      try{ paintTrainDraftCards(); }catch(e){ errs.push('bad ' + e.message); }
      var badGone = localStorage.getItem(key) == null;
      var cardHidden = document.getElementById('home-train-draft-card').hidden;
      var proto = Storage.prototype;
      var origGet = proto.getItem;
      var origSet = proto.setItem;
      proto.getItem = function(){ throw new Error('storage blocked'); };
      proto.setItem = function(){ throw new Error('storage blocked'); };
      var threw = false;
      try{
        paintTrainDraftCards();
        trainSessionState = newTrainSessionState('Boulders', 'Nope');
        _trainDraftBaselineId = trainSessionState.id;
        _trainDraftBaseline = '';
        _trainDraftDirty = true;
        flushTrainUserDraft();
      }catch(e){ threw = true; }
      proto.getItem = origGet;
      proto.setItem = origSet;
      return {
        errs: errs, oldGone: oldGone, oldCard: oldCard, otherGone: otherGone,
        foreignGone: foreignGone, badGone: badGone, cardHidden: cardHidden, threw: threw
      };
    }, USER_ID);
    assert.deepStrictEqual(ignored.errs, []);
    assert.strictEqual(ignored.oldGone, true);
    assert.strictEqual(ignored.oldCard, true);
    assert.strictEqual(ignored.otherGone, true);
    assert.strictEqual(ignored.foreignGone, true);
    assert.strictEqual(ignored.badGone, true);
    assert.strictEqual(ignored.cardHidden, true);
    assert.strictEqual(ignored.threw, false, 'blocked storage does not throw');

    var unchanged = await page.evaluate(function(userId){
      localStorage.removeItem('see_train_draft_' + userId);
      seedTrainSessionFromItem({
        id: 'lib-same', name: 'Untouched', training_focus: 'Boulders',
        sections: [{ shape: 'check', title: 'Warm up', items: [{ text: 'a', complete: false }] }]
      }, { source_assignment_id: 'asg-same', library_item_id: 'lib-same' });
      return localStorage.getItem('see_train_draft_' + userId);
    }, USER_ID);
    assert.strictEqual(unchanged, null);
    await page.waitForTimeout(700);
    var still = await page.evaluate(function(userId){
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
      return localStorage.getItem('see_train_draft_' + userId);
    }, USER_ID);
    assert.strictEqual(still, null, 'unchanged session writes no draft');

    var choice = await page.evaluate(function(userId){
      var env = {
        v: 1, saved_at: new Date().toISOString(), user_id: userId,
        screen: 'screen-train-session',
        state: { id: 'draft-old', title: 'Still going', blocks: [{ id: 'b', shape: 'rest', title: 'Rest' }], started_at: '2026-11-11T12:00:00.000Z' }
      };
      localStorage.setItem('see_train_draft_' + userId, JSON.stringify(env));
      startSessionNoCategory();
      var panel = document.getElementById('train-draft-choice');
      return {
        hidden: panel.hidden,
        text: panel.innerText,
        screen: (document.querySelector('.screen.active') || {}).id,
        title: trainSessionState ? trainSessionState.title : null
      };
    }, USER_ID);
    assert.strictEqual(choice.hidden, false);
    assert.ok(choice.text.indexOf('Resume session in progress') !== -1, choice.text);
    assert.ok(choice.text.indexOf('Start new (discards the old one)') !== -1, choice.text);
    assert.strictEqual(choice.title, 'Untouched');
    await page.evaluate(function(){ trainDraftChoiceResume(); });
    await waitForScreen(page, 'screen-train-session');
    var resumedChoice = await page.evaluate(function(){
      return trainSessionState && trainSessionState.title;
    });
    assert.strictEqual(resumedChoice, 'Still going');

    await page.evaluate(function(){ startBlankTrainSession(); });
    var choice2 = await page.evaluate(function(){
      return document.getElementById('train-draft-choice').hidden;
    });
    assert.strictEqual(choice2, false, 'starting another session prompts again');
    await page.evaluate(function(userId){ trainDraftChoiceNew(); }, USER_ID);
    var replaced = await page.evaluate(function(userId){
      return {
        key: localStorage.getItem('see_train_draft_' + userId),
        screen: (document.querySelector('.screen.active') || {}).id,
        title: trainSessionState && trainSessionState.title,
        choice: document.getElementById('train-draft-choice').hidden
      };
    }, USER_ID);
    assert.strictEqual(replaced.key, null, 'Start new discards the old draft');
    assert.strictEqual(replaced.screen, 'screen-train-session');
    assert.strictEqual(replaced.choice, true);
    assert.notStrictEqual(replaced.title, 'Still going');
  });

  console.log('real-flow-session-autosave: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
