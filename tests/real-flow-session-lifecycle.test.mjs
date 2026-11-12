import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, waitForScreen, postsTo, firstBody, USER_ID
} from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index329'/.test(index));
assert.ok(/APP_VERSION = 'index329'/.test(sw));

function fulfillJson(route, status, body){
  return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) });
}
function stub(){
  return async function(route, info){
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: (info.body && info.body.id) || 'sess-life' }, info.body || {})]);
      return true;
    }
    if(info.method === 'PATCH' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 200, [info.body || {}]);
      return true;
    }
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: 'cw-life', name: (info.body && info.body.name) || 'Workout' }, info.body || {})]);
      return true;
    }
    if(info.method === 'GET' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
      await fulfillJson(route, 200, []);
      return true;
    }
    return false;
  };
}

async function boot(page){
  await page.waitForFunction(function(){
    return typeof window.startSessionNoCategory === 'function' && typeof window.saveTrainSession === 'function';
  }, null, { timeout: 30000 });
  await page.waitForFunction(function(){
    var h = document.getElementById('screen-home');
    return !!(h && h.classList.contains('active'));
  }, null, { timeout: 15000 }).catch(function(){});
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    try{ localStorage.removeItem('see_train_session_draft'); }catch(e){}
    try{ localStorage.removeItem('see_train_draft_' + userId); }catch(e){}
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

function chrome(page){
  return page.evaluate(function(){
    function vis(id){
      var el = document.getElementById(id);
      if(!el) return false;
      return !el.hidden && getComputedStyle(el).display !== 'none';
    }
    return {
      running: !!(trainSessionState && trainSessionState.session_running !== false),
      started: trainSessionState && trainSessionState.started_at,
      dates: vis('train-sess-dates-card'),
      elapsed: vis('train-sess-elapsed'),
      elapsedText: (document.getElementById('train-sess-elapsed') || {}).textContent || '',
      finish: vis('train-sess-save'),
      finishText: ((document.getElementById('train-sess-save') || {}).textContent || '').trim(),
      buildSave: vis('train-sess-save-workout'),
      buildText: ((document.getElementById('train-sess-save-workout') || {}).textContent || '').trim(),
      more: vis('train-sess-more-wrap'),
      saveAs: !!document.getElementById('train-sess-save-as'),
      nameRow: vis('train-sess-workout-name-row'),
      warmNote: vis('train-sess-warmup'),
      warmCard: vis('train-warmup-card'),
      coolCard: vis('train-cooldown-card'),
      prompt: /window\.prompt/.test(String(saveTrainSessionAsWorkout))
    };
  });
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await boot(page);
    var opened = await page.evaluate(function(){ return Date.now(); });
    await page.waitForTimeout(1500);
    await page.evaluate(function(){ startSessionNoCategory(); });
    await waitForScreen(page, 'screen-train-session');
    var startedAt = await page.evaluate(function(){ return new Date(trainSessionState.started_at).getTime(); });
    assert.ok(startedAt >= opened + 1000, 'Start stamp is the tap, not page open: ' + (startedAt - opened));
    var ui = await chrome(page);
    assert.strictEqual(ui.running, true);
    assert.strictEqual(ui.finish, true);
    assert.strictEqual(ui.finishText, 'Finish session');
    assert.strictEqual(ui.buildSave, false, 'blank running session hides Save workout');
    assert.strictEqual(ui.more, true, 'blank session keeps Save as workout in the menu');
    assert.strictEqual(ui.dates, true);
    assert.strictEqual(ui.elapsed, true);
    assert.ok(/^Elapsed \d{2}:\d{2}:\d{2}$/.test(ui.elapsedText.trim()), ui.elapsedText);
    assert.strictEqual(ui.prompt, false, 'no window.prompt');

    await page.fill('#train-sess-title', 'Lifecycle draft');
    await page.waitForTimeout(800);
    var drafted = await page.evaluate(function(userId){
      var raw = localStorage.getItem('see_train_draft_' + userId);
      var env = raw ? JSON.parse(raw) : null;
      return {
        started: env && env.state && env.state.started_at,
        live: trainSessionState.started_at
      };
    }, USER_ID);
    assert.strictEqual(drafted.started, drafted.live, 'draft includes the Start stamp');

    await page.evaluate(function(){
      trainAddBlock('check');
      var b = trainSessionState.blocks[0];
      b.title = 'Custom';
      b.items = [{ id: 'i1', text: 'one move', complete: false }];
      renderTrainSessionBuilder();
    });
    await page.click('#train-blocks-wrap .train-block-card .train-section-complete');
    var notice = await page.evaluate(function(){
      return !!document.querySelector('#train-blocks-wrap .wk-notice-card, #train-blocks-wrap .wk-notice-link');
    });
    assert.strictEqual(notice, true, 'per-block notice stays');

    await page.evaluate(function(){
      trainSessionState.started_at = new Date(Date.now() - 50 * 60 * 1000).toISOString();
      trainSessionState.started_edited = false;
      trainSessionState.ended_edited = false;
      var s = document.getElementById('train-sess-start');
      if(s) s.value = '';
      renderTrainSessionBuilder();
    });
    await page.click('#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    var saved = firstBody(postsTo(recorded, 'training_sessions', 'POST'));
    var span = new Date(saved.ended_at).getTime() - new Date(saved.started_at).getTime();
    var mins = Math.round(span / 60000);
    assert.ok(mins >= 49 && mins <= 51, 'duration is End - Start, got ' + mins);
    assert.ok(Math.abs(new Date(saved.ended_at).getTime() - Date.now()) < 15000, 'Finish stamps End now');
    var meta = await page.textContent('#train-done-meta');
    assert.ok(meta.indexOf(mins + ' min') !== -1, meta);

    await page.click('#train-done-notice [data-done-att="4"]');
    await page.fill('#train-done-notice-note', 'quiet feet');
    await page.click('#screen-train-done button[onclick="trainDoneHome()"]');
    await page.waitForTimeout(500);
    var notePatch = postsTo(recorded, 'training_sessions', 'PATCH');
    assert.ok(notePatch.length >= 1, 'notice saves');
    var notes = String((notePatch[notePatch.length - 1].body || {}).notes || '');
    assert.ok(/How present were you: 4/.test(notes), notes);
    assert.ok(/quiet feet/.test(notes), notes);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await boot(page);
    var buildOnclick = await page.getAttribute('#train-hub-card-build', 'onclick');
    assert.ok(/startSessionNoCategory\(false\)/.test(buildOnclick || ''), buildOnclick);
    await page.evaluate(function(){ startSessionNoCategory(false); });
    await waitForScreen(page, 'screen-train-session');
    var build = await chrome(page);
    assert.strictEqual(build.running, false);
    assert.strictEqual(build.started, null);
    assert.strictEqual(build.dates, false, 'Build session has no Start/End');
    assert.strictEqual(build.elapsed, false);
    assert.strictEqual(build.finish, false, 'Build session has no Finish');
    assert.strictEqual(build.buildSave, true);
    assert.strictEqual(build.buildText, 'Save workout');
    assert.strictEqual(build.more, false);
    assert.strictEqual(build.nameRow, true);

    async function openAs(meta){
      await page.evaluate(function(sourceMeta){
        trainSessionState = newTrainSessionState('Boulders', 'Night', '', sourceMeta);
        showScreen('screen-train-session');
      }, meta);
      await waitForScreen(page, 'screen-train-session');
      return chrome(page);
    }
    var asg = await openAs({ source_assignment_id: 'asg-1' });
    assert.strictEqual(asg.finish, true);
    assert.strictEqual(asg.finishText, 'Finish session');
    assert.strictEqual(asg.more, false, 'assignment session hides Save as workout');
    assert.strictEqual(asg.buildSave, false);
    var lib = await openAs({ library_item_id: 'lib-1' });
    assert.strictEqual(lib.more, false, 'library session hides Save as workout');
    assert.strictEqual(lib.finishText, 'Finish session');
    var pinned = await openAs({ custom_workout_item_id: 'cw-1' });
    assert.strictEqual(pinned.more, false, 'pinned session hides Save as workout');

    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Notes', '');
      trainSessionState.blocks = [
        { id: 'w', shape: 'check', title: 'Warm up', items: [{ id: 'a', text: 'bands', complete: false }], complete: false },
        { id: 'c', shape: 'check', title: 'Cool down', items: [{ id: 'b', text: 'stretch', complete: false }], complete: false }
      ];
      trainSessionState.warm_up = '';
      trainSessionState.cool_down = '';
      renderTrainSessionBuilder();
    });
    var hiddenNotes = await chrome(page);
    assert.strictEqual(hiddenNotes.warmCard, false, 'empty warm-up note hides when a warm-up check exists');
    assert.strictEqual(hiddenNotes.coolCard, false, 'empty cool-down note hides when a cool-down check exists');

    await page.evaluate(function(){
      trainSessionState.blocks = [
        { id: 'w2', shape: 'check', title: 'Warm up', is_warmup: true, items: [{ id: 'a', text: 'bands', complete: false }], complete: false }
      ];
      trainSessionState.warm_up = 'easy laps';
      trainSessionState.cool_down = '';
      renderTrainSessionBuilder();
    });
    var shown = await chrome(page);
    assert.strictEqual(shown.warmCard, true, 'warm-up check still renders inside the card');
    assert.strictEqual(shown.warmNote, true, 'a filled warm-up note stays');
    assert.strictEqual(shown.coolCard, true, 'no cool-down check shows the legacy box');

    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('', 'Edited', '');
      showScreen('screen-train-session');
    });
    await page.fill('#train-sess-start', '2026-11-11T12:00');
    await page.fill('#train-sess-end', '2026-11-11T12:10');
    await page.click('#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    var edited = firstBody(postsTo(recorded, 'training_sessions', 'POST'));
    var editedMin = Math.round((new Date(edited.ended_at) - new Date(edited.started_at)) / 60000);
    assert.strictEqual(editedMin, 10, 'edited Start and End are the saved duration');
    assert.ok(String(edited.started_at).indexOf('2026-11-11T12:00') === 0, edited.started_at);
    assert.ok(String(edited.ended_at).indexOf('2026-11-11T12:10') === 0, edited.ended_at);

    var patchesBefore = postsTo(recorded, 'training_sessions', 'PATCH').length;
    await page.click('#train-done-notice-skip');
    var skippedHidden = await page.evaluate(function(){
      return document.getElementById('train-done-notice').hidden;
    });
    assert.strictEqual(skippedHidden, true);
    await page.click('#screen-train-done button[onclick="trainDoneHome()"]');
    await page.waitForTimeout(400);
    assert.strictEqual(postsTo(recorded, 'training_sessions', 'PATCH').length, patchesBefore, 'Skip writes no session note');
  });
}finally{
  server.close();
  await browser.close();
}
console.log('session-lifecycle ok');
