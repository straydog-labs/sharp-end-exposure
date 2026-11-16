import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, waitForScreen,
  postsTo, USER_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index342'/.test(index));
assert.ok(/APP_VERSION = 'index342'/.test(sw));

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function envelope(title, savedAt, assignmentId){
  return {
    v: 1,
    saved_at: savedAt,
    user_id: USER_ID,
    screen: 'screen-train-session',
    state: {
      id: 'draft-' + title.replace(/\s+/g, '-').toLowerCase(),
      title: title,
      started_at: '2026-11-16T15:00:00.000Z',
      source_assignment_id: assignmentId || null,
      blocks: []
    }
  };
}

function serverRow(env){
  return {
    user_id: USER_ID,
    assignment_id: env.state.source_assignment_id,
    title: env.state.title,
    started_at: env.state.started_at,
    saved_at: env.saved_at,
    expires_at: new Date(Date.parse(env.saved_at) + 24 * 60 * 60 * 1000).toISOString(),
    explicit_save: false,
    payload: env
  };
}

function stub(state){
  return async function(route, info){
    var url = info.url;
    if(info.method === 'POST' && url.indexOf('/rest/v1/training_sessions') !== -1 && url.indexOf('/rest/v1/training_session_drafts') === -1){
      await fulfillJson(route, 201, [Object.assign({ id: (info.body && info.body.id) || 'sess-saved' }, info.body || {})]);
      return true;
    }
    if(url.indexOf('/rest/v1/training_session_drafts') === -1) return false;
    if(info.method === 'GET'){
      if(state.failGet){
        await fulfillJson(route, 500, { message: 'draft read failed' });
        return true;
      }
      await fulfillJson(route, 200, state.row ? [state.row] : []);
      return true;
    }
    if(info.method === 'POST'){
      if(state.failPost){
        await fulfillJson(route, 500, { message: 'draft write failed' });
        return true;
      }
      state.row = info.body;
      await fulfillJson(route, 201, []);
      return true;
    }
    if(info.method === 'DELETE'){
      state.deleteAttempts = (state.deleteAttempts || 0) + 1;
      if(state.failDelete){
        await fulfillJson(route, 500, { message: 'draft delete failed' });
        return true;
      }
      state.row = null;
      state.deletes = (state.deletes || 0) + 1;
      await fulfillJson(route, 200, []);
      return true;
    }
    return false;
  };
}

async function boot(page){
  await page.waitForFunction(function(){
    return typeof showScreen === 'function' && typeof readTrainDraftForUser === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

function localTitle(page){
  return page.evaluate(function(userId){
    var raw = localStorage.getItem('see_train_draft_' + userId);
    if(!raw) return null;
    var env = JSON.parse(raw);
    return env && env.state ? env.state.title : null;
  }, USER_ID);
}

function errorToast(page){
  return page.evaluate(function(){
    var el = document.getElementById('error-toast-el');
    if(!el) return '';
    return el.classList.contains('show') ? (el.textContent || '') : '';
  });
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  var restore = { row: serverRow(envelope('Server hang', new Date().toISOString(), 'asg-server')) };
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(restore)
  }, async function(page){
    await page.waitForFunction(function(){
      var title = document.getElementById('home-train-draft-title');
      var card = document.getElementById('home-train-draft-card');
      return !!(title && card && !card.hidden && title.textContent === 'Server hang');
    }, null, { timeout: 8000 });
    assert.strictEqual(await localTitle(page), 'Server hang');
    assert.strictEqual(await errorToast(page), '');
  });

  var newer = { row: serverRow(envelope('Old server', new Date(Date.now() - 60 * 60 * 1000).toISOString(), 'asg-old')) };
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(newer)
  }, async function(page, recorded){
    await boot(page);
    var localSaved = new Date().toISOString();
    await page.evaluate(function(args){
      localStorage.setItem('see_train_draft_' + args.userId, JSON.stringify({
        v: 1,
        saved_at: args.savedAt,
        user_id: args.userId,
        screen: 'screen-train-session',
        state: { id: 'local-1', title: 'Local hang', started_at: '2026-11-16T15:00:00.000Z', source_assignment_id: 'asg-local', blocks: [] }
      }));
    }, { userId: USER_ID, savedAt: localSaved });
    var before = postsTo(recorded, 'training_session_drafts', 'POST').length;
    await page.evaluate(function(){ return pullTrainDraftFromServer(); });
    for(var i = 0; i < 20 && postsTo(recorded, 'training_session_drafts', 'POST').length <= before; i++){
      await page.waitForTimeout(50);
    }
    assert.ok(postsTo(recorded, 'training_session_drafts', 'POST').length > before, 'newer local overwrites the server row');
    var body = postsTo(recorded, 'training_session_drafts', 'POST').slice(-1)[0].body;
    assert.strictEqual(body.title, 'Local hang');
    assert.strictEqual(body.saved_at, localSaved);
    assert.strictEqual(body.assignment_id, 'asg-local');
    assert.strictEqual(body.explicit_save, false);
    assert.strictEqual(body.payload.state.title, 'Local hang');
    var gap = Date.parse(body.expires_at) - Date.parse(body.saved_at);
    assert.ok(Math.abs(gap - 24 * 60 * 60 * 1000) < 2000, 'autosave expires in 24h, got ' + gap);
    assert.strictEqual(await localTitle(page), 'Local hang');

    newer.row = serverRow(envelope('Newer server', new Date(Date.now() + 5000).toISOString(), 'asg-new'));
    await page.evaluate(function(){ return pullTrainDraftFromServer(); });
    await page.waitForFunction(function(userId){
      var raw = localStorage.getItem('see_train_draft_' + userId);
      var env = raw ? JSON.parse(raw) : null;
      return !!(env && env.state && env.state.title === 'Newer server');
    }, USER_ID, { timeout: 4000 });
    assert.strictEqual(await localTitle(page), 'Newer server');

    await page.evaluate(function(args){
      localStorage.setItem('see_train_draft_' + args.userId, JSON.stringify({
        v: 1,
        saved_at: args.savedAt,
        user_id: args.userId,
        screen: 'screen-train-session',
        state: { id: 'open-1', title: 'Open local', started_at: '2026-11-16T15:00:00.000Z', blocks: [] }
      }));
      trainSessionState = { id: 'open-1', title: 'Open local', started_at: '2026-11-16T15:00:00.000Z', blocks: [], session_running: true };
      showScreen('screen-train-session');
    }, { userId: USER_ID, savedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    newer.row = serverRow(envelope('Underneath', new Date().toISOString(), 'asg-under'));
    await page.evaluate(function(){ return pullTrainDraftFromServer(); });
    await page.waitForTimeout(200);
    assert.strictEqual(await localTitle(page), 'Open local', 'open session is not swapped for a newer server draft');
  });

  var broken = { row: null, failGet: true, failPost: true };
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(broken)
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(function(userId){
      localStorage.setItem('see_train_draft_' + userId, JSON.stringify({
        v: 1,
        saved_at: new Date().toISOString(),
        user_id: userId,
        screen: 'screen-train-session',
        state: { id: 'keep-1', title: 'Keep local', started_at: '2026-11-16T15:00:00.000Z', blocks: [] }
      }));
      showScreen('screen-home');
    }, USER_ID);
    await page.evaluate(function(){ return pullTrainDraftFromServer(); });
    assert.strictEqual(await localTitle(page), 'Keep local');
    assert.strictEqual(await errorToast(page), '');
    var postsBefore = postsTo(recorded, 'training_session_drafts', 'POST').length;
    await page.evaluate(function(){
      trainSessionState = { id: 'keep-1', title: 'Keep local', started_at: '2026-11-16T15:00:00.000Z', blocks: [], session_running: true };
      _trainDraftDirty = true;
      _trainDraftBaselineId = 'keep-1';
      _trainDraftBaseline = '';
      flushTrainUserDraft();
    });
    for(var i = 0; i < 20 && postsTo(recorded, 'training_session_drafts', 'POST').length <= postsBefore; i++){
      await page.waitForTimeout(50);
    }
    assert.ok(postsTo(recorded, 'training_session_drafts', 'POST').length > postsBefore, 'a failed server write was still attempted');
    assert.strictEqual(await localTitle(page), 'Keep local');
    assert.strictEqual(await errorToast(page), '');
    var card = await page.evaluate(function(){
      var el = document.getElementById('home-train-draft-card');
      var title = document.getElementById('home-train-draft-title');
      return { shown: !!(el && !el.hidden), title: title ? title.textContent : '' };
    });
    assert.strictEqual(card.shown, true);
    assert.strictEqual(card.title, 'Keep local');
  });

  var cleared = { row: null, deletes: 0 };
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(cleared)
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(function(){
      trainSessionState = {
        id: 'fin-1',
        energy_type: 'Boulders',
        title: 'Finish me',
        started_at: new Date().toISOString(),
        ended_at: null,
        warm_up: '',
        cool_down: '',
        blocks: [{ id: 'b1', shape: 'section', title: 'Free', complete: true, notes: '' }],
        session_running: true
      };
      _trainDraftBaselineId = null;
      showScreen('screen-train-session');
      writeTrainUserDraft(true);
    });
    await page.waitForFunction(function(userId){
      return !!localStorage.getItem('see_train_draft_' + userId);
    }, USER_ID, { timeout: 4000 });
    var explicit = postsTo(recorded, 'training_session_drafts', 'POST').slice(-1)[0];
    assert.ok(explicit && explicit.body && explicit.body.explicit_save === true, 'Save progress upserts immediately');
    var explicitGap = Date.parse(explicit.body.expires_at) - Date.parse(explicit.body.saved_at);
    assert.ok(Math.abs(explicitGap - 7 * 24 * 60 * 60 * 1000) < 2000, 'explicit save expires in 7d');
    await page.click('#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    for(var i = 0; i < 20 && !postsTo(recorded, 'training_session_drafts', 'DELETE').length; i++){
      await page.waitForTimeout(50);
    }
    assert.ok(postsTo(recorded, 'training_session_drafts', 'DELETE').length >= 1, 'Finish deletes the server draft');
    assert.strictEqual(await localTitle(page), null);

    await page.evaluate(function(userId){
      localStorage.setItem('see_train_draft_' + userId, JSON.stringify({
        v: 1,
        saved_at: new Date().toISOString(),
        user_id: userId,
        screen: 'screen-train-session',
        state: { id: 'disc-1', title: 'Discard me', started_at: '2026-11-16T15:00:00.000Z', blocks: [] }
      }));
      trainSessionState = { id: 'disc-1', title: 'Discard me', started_at: '2026-11-16T15:00:00.000Z', blocks: [], session_running: true };
      showScreen('screen-train-session');
    }, USER_ID);
    var deletesBefore = postsTo(recorded, 'training_session_drafts', 'DELETE').length;
    await page.click('#train-sess-discard');
    await page.click('#train-discard-do');
    for(var j = 0; j < 20 && postsTo(recorded, 'training_session_drafts', 'DELETE').length <= deletesBefore; j++){
      await page.waitForTimeout(50);
    }
    assert.ok(postsTo(recorded, 'training_session_drafts', 'DELETE').length > deletesBefore, 'Discard session deletes the server draft');
    assert.strictEqual(await localTitle(page), null);
  });

  var offlineFinish = { row: null, failDelete: true, deletes: 0 };
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(offlineFinish)
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){
      trainSessionState = {
        id: 'off-1',
        energy_type: 'Boulders',
        title: 'Finished offline',
        started_at: new Date().toISOString(),
        ended_at: null,
        warm_up: '',
        cool_down: '',
        blocks: [{ id: 'b1', shape: 'section', title: 'Free', complete: true, notes: '' }],
        session_running: true
      };
      _trainDraftBaselineId = null;
      showScreen('screen-train-session');
      writeTrainUserDraft(true);
    });
    await page.waitForFunction(function(userId){
      return !!localStorage.getItem('see_train_draft_' + userId);
    }, USER_ID, { timeout: 4000 });
    assert.ok(offlineFinish.row && offlineFinish.row.title === 'Finished offline', 'server has the draft before the failed delete');
    await page.click('#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    await page.waitForFunction(function(userId){
      return !localStorage.getItem('see_train_draft_' + userId) && !!localStorage.getItem('see_train_pending_delete_' + userId);
    }, USER_ID, { timeout: 4000 });
    assert.strictEqual(offlineFinish.deletes || 0, 0, 'offline Finish does not clear the server row');
    assert.strictEqual(await errorToast(page), '');
    await page.evaluate(function(){ return pullTrainDraftFromServer(); });
    await page.waitForTimeout(250);
    assert.strictEqual(await localTitle(page), null, 'a failed delete is not restored while it is still pending');
    assert.strictEqual(await errorToast(page), '');
    offlineFinish.failDelete = false;
    await page.evaluate(function(){ return pullTrainDraftFromServer(); });
    await page.waitForFunction(function(userId){
      return !localStorage.getItem('see_train_pending_delete_' + userId);
    }, USER_ID, { timeout: 4000 });
    assert.ok(offlineFinish.deletes >= 1, 'reconnect deletes the finished server row');
    assert.strictEqual(offlineFinish.row, null);
    assert.strictEqual(await localTitle(page), null, 'reconnect does not restore the finished session');
    assert.strictEqual(await errorToast(page), '');
  });

  var devices = { row: null };
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(devices)
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(function(userId){
      localStorage.setItem('see_train_draft_' + userId, JSON.stringify({
        v: 1,
        saved_at: new Date(Date.now() - 60 * 1000).toISOString(),
        server_synced_at: new Date(Date.now() - 30 * 1000).toISOString(),
        user_id: userId,
        screen: 'screen-train-session',
        state: { id: 'synced-b', title: 'Synced on B', started_at: '2026-11-16T15:00:00.000Z', blocks: [] }
      }));
      showScreen('screen-home');
    }, USER_ID);
    var postsBefore = postsTo(recorded, 'training_session_drafts', 'POST').length;
    await page.evaluate(function(){ return pullTrainDraftFromServer(); });
    await page.waitForFunction(function(userId){
      return !localStorage.getItem('see_train_draft_' + userId);
    }, USER_ID, { timeout: 4000 });
    assert.strictEqual(postsTo(recorded, 'training_session_drafts', 'POST').length, postsBefore, 'a synced draft is not upserted when the server row is gone');
    assert.strictEqual(await localTitle(page), null);
    assert.strictEqual(await errorToast(page), '');

    await page.evaluate(function(userId){
      localStorage.setItem('see_train_draft_' + userId, JSON.stringify({
        v: 1,
        saved_at: new Date().toISOString(),
        user_id: userId,
        screen: 'screen-train-session',
        state: { id: 'unsynced-b', title: 'Unsynced on B', started_at: '2026-11-16T15:00:00.000Z', blocks: [] }
      }));
    }, USER_ID);
    var unsyncedBefore = postsTo(recorded, 'training_session_drafts', 'POST').length;
    await page.evaluate(function(){ return pullTrainDraftFromServer(); });
    for(var i = 0; i < 20 && postsTo(recorded, 'training_session_drafts', 'POST').length <= unsyncedBefore; i++){
      await page.waitForTimeout(50);
    }
    assert.ok(postsTo(recorded, 'training_session_drafts', 'POST').length > unsyncedBefore, 'an unsynced local draft is upserted');
    var pushed = postsTo(recorded, 'training_session_drafts', 'POST').slice(-1)[0].body;
    assert.strictEqual(pushed.title, 'Unsynced on B');
    assert.strictEqual(await localTitle(page), 'Unsynced on B');

    await page.evaluate(function(userId){
      localStorage.setItem('see_train_draft_' + userId, JSON.stringify({
        v: 1,
        saved_at: new Date(Date.now() - 60 * 1000).toISOString(),
        server_synced_at: new Date(Date.now() - 30 * 1000).toISOString(),
        user_id: userId,
        screen: 'screen-train-session',
        state: { id: 'open-b', title: 'Open on B', started_at: '2026-11-16T15:00:00.000Z', blocks: [] }
      }));
      trainSessionState = { id: 'open-b', title: 'Open on B', started_at: '2026-11-16T15:00:00.000Z', blocks: [], session_running: true };
      showScreen('screen-train-session');
    }, USER_ID);
    devices.row = null;
    await page.evaluate(function(){ return pullTrainDraftFromServer(); });
    await page.waitForTimeout(200);
    assert.strictEqual(await localTitle(page), 'Open on B', 'an open session is not cleared when the server row is gone');
    await page.evaluate(function(){
      trainSessionState = null;
      showScreen('screen-home');
    });
    await page.waitForFunction(function(userId){
      return !localStorage.getItem('see_train_draft_' + userId);
    }, USER_ID, { timeout: 4000 });
    assert.strictEqual(await localTitle(page), null, 'the synced draft is dropped on the next Home');
  });

  console.log('session-draft-sync ok');
}finally{
  await browser.close();
  server.close();
}
