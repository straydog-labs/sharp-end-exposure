import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, waitForScreen, tap, USER_ID
} from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index340'/.test(index));
assert.ok(/APP_VERSION = 'index340'/.test(sw));

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function workout(id, name, focus){
  return {
    id: id,
    name: name,
    description: name,
    training_focus: focus || 'Boulders',
    created_by: 'coach-1',
    is_starred: false,
    sections: [{
      shape: 'check', title: 'Warm up', notes: '', complete: false, attempts: [],
      items: [{ text: 'easy', complete: false }]
    }]
  };
}

function assignment(id, title, due, customId){
  return {
    id: id,
    title: title,
    athlete_id: USER_ID,
    coach_id: 'coach-1',
    custom_workout_item_id: customId || 'cw-night',
    library_item_id: null,
    due_date: due,
    completed_at: null,
    description: '',
    deleted_at: null
  };
}

function makeWorld(extra){
  extra = extra || {};
  var night = workout('cw-night', 'Night session', 'Boulders');
  var pinned = workout('cw-pin', 'Pinned density', 'Hangboard');
  pinned.is_starred = true;
  return {
    assignments: extra.assignments || [
      assignment('asg-a', 'Alpha hang', '2026-11-11'),
      assignment('asg-b', 'Beta hang', '2026-11-20')
    ],
    sessions: extra.sessions || [],
    workouts: extra.workouts || [night, pinned],
    library: extra.library || [{
      id: 'lib-free',
      name: 'Library density',
      description: 'not an assignment',
      training_focus: 'Hangboard',
      sections: [{ shape: 'check', title: 'Openers', notes: '', items: [{ text: 'hang', complete: false }] }]
    }]
  };
}

function stub(world){
  return async function(route, info){
    var url = info.url;
    var method = info.method;
    function rowsFor(list){
      var idMatch = url.match(/[?&]id=eq\.([^&]+)/);
      if(!idMatch) return list;
      var id = decodeURIComponent(idMatch[1]);
      return list.filter(function(row){ return String(row.id) === id; });
    }
    if(method === 'GET' && url.indexOf('/rest/v1/assignments') !== -1){
      await fulfillJson(route, 200, world.assignments.filter(function(a){ return !a.deleted_at; }));
      return true;
    }
    if(method === 'GET' && url.indexOf('/rest/v1/custom_workouts') !== -1){
      await fulfillJson(route, 200, rowsFor(world.workouts));
      return true;
    }
    if(method === 'GET' && url.indexOf('/rest/v1/workout_library') !== -1){
      await fulfillJson(route, 200, rowsFor(world.library));
      return true;
    }
    if(method === 'POST' && url.indexOf('/rest/v1/workout_library') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: 'lib-seed' }, info.body || {})]);
      return true;
    }
    if(method === 'GET' && url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 200, world.sessions);
      return true;
    }
    if(method === 'GET' && url.indexOf('/rest/v1/training_block_sessions') !== -1){
      await fulfillJson(route, 200, []);
      return true;
    }
    return false;
  };
}

async function boot(page){
  await page.waitForFunction(function(){
    return typeof window.startTrainSessionFromAssignment === 'function'
      && typeof window.showScreen === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window._hasRoutedAfterSignIn = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.routeSignedInHome = function(){};
    try{ localStorage.removeItem('see_train_session_draft'); }catch(e){}
    try{ localStorage.removeItem('see_train_draft_' + userId); }catch(e){}
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

function shown(page, sel){
  return page.evaluate(function(selector){
    var el = document.querySelector(selector);
    if(!el) return false;
    var cs = getComputedStyle(el);
    if(cs.display === 'none' || cs.visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, sel);
}

async function assertNoSaveAs(page, label){
  await waitForScreen(page, 'screen-train-session');
  var more = await shown(page, '#train-sess-more');
  var saveAs = await shown(page, '#train-sess-save-as');
  assert.strictEqual(more, false, label + ' hides the ... button');
  assert.strictEqual(saveAs, false, label + ' hides Save as workout');
  var text = await page.evaluate(function(){
    var el = document.getElementById('train-sess-save-as');
    return el ? (el.textContent || '') : '';
  });
  assert.ok(/Save as workout/.test(text), label + ' menu item still exists for blank sessions');
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){ return loadHomeDueList(); });
    await page.waitForFunction(function(){
      var el = document.getElementById('home-today-start');
      return el && !el.hidden && el.dataset.id === 'asg-a';
    }, null, { timeout: 8000 });
    await tap(page, '#home-today-start');
    await assertNoSaveAs(page, 'Home Up next');
    var ids = await page.evaluate(function(){
      return {
        assignment: trainSessionState && trainSessionState.source_assignment_id,
        custom: trainSessionState && trainSessionState.custom_workout_item_id
      };
    });
    assert.strictEqual(ids.assignment, 'asg-a');
    assert.strictEqual(ids.custom, 'cw-night');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){ showScreen('screen-train-assignments'); });
    await waitForScreen(page, 'screen-train-assignments');
    await page.waitForSelector('#train-list .train-assign-card', { timeout: 8000 });
    await page.locator('#train-list .train-assign-card', { hasText: 'Alpha hang' }).locator('button', { hasText: 'Start' }).evaluate(function(el){ el.click(); });
    await assertNoSaveAs(page, 'Train Assignments');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.source_assignment_id; }), 'asg-a');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){ showScreen('screen-train'); });
    await waitForScreen(page, 'screen-train');
    await page.waitForSelector('#train-pinned-strip .quick-attempt-btn', { timeout: 8000 });
    await page.locator('#train-pinned-strip .quick-attempt-btn', { hasText: 'Start' }).evaluate(function(el){ el.click(); });
    await assertNoSaveAs(page, 'Pinned');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.custom_workout_item_id; }), 'cw-pin');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){ showScreen('screen-workout-library'); });
    await waitForScreen(page, 'screen-workout-library');
    await page.waitForSelector('#wl-list button', { timeout: 8000 });
    await page.locator('#wl-list button', { hasText: 'Library density' }).evaluate(function(el){ el.click(); });
    await waitForScreen(page, 'screen-workout-library-detail');
    await tap(page, '#wl-start-now-btn');
    await assertNoSaveAs(page, 'library');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.library_item_id; }), 'lib-free');
  });

  var repeatWorld = makeWorld({
    sessions: [{
      id: 'sess-prev',
      user_id: USER_ID,
      notes: 'Repeated night',
      energy_type: 'Boulders',
      started_at: '2026-11-14T15:00:00.000Z',
      ended_at: '2026-11-14T16:00:00.000Z',
      assignment_id: 'asg-a',
      blocks: [{ shape: 'check', title: 'Warm up', items: [{ text: 'easy', complete: false }] }],
      deleted_at: null
    }, {
      id: 'sess-template',
      user_id: USER_ID,
      notes: 'Repeated custom',
      energy_type: 'Hangboard',
      started_at: '2026-11-13T15:00:00.000Z',
      ended_at: '2026-11-13T16:00:00.000Z',
      assignment_id: null,
      template_id: 'cw-pin',
      blocks: [{ shape: 'check', title: 'Hangs', items: [{ text: 'hang', complete: false }] }],
      deleted_at: null
    }]
  });
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(repeatWorld)
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){ showScreen('screen-train'); });
    await waitForScreen(page, 'screen-train');
    await page.waitForSelector('#train-hub-recent-mini .train-hub-duplicate-btn', { timeout: 8000 });
    var repeatButtons = page.locator('#train-hub-recent-mini .train-session-row');
    await repeatButtons.nth(0).locator('.train-hub-duplicate-btn').evaluate(function(el){ el.click(); });
    await assertNoSaveAs(page, 'Repeat assignment');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.source_assignment_id; }), 'asg-a');
    await page.evaluate(function(){
      trainSessionState = null;
      showScreen('screen-train');
    });
    await waitForScreen(page, 'screen-train');
    await repeatButtons.nth(1).locator('.train-hub-duplicate-btn').evaluate(function(el){ el.click(); });
    await assertNoSaveAs(page, 'Repeat custom');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.custom_workout_item_id; }), 'cw-pin');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){ showScreen('screen-train-start'); });
    await waitForScreen(page, 'screen-train-start');
    await page.locator('#screen-train-start button', { hasText: 'Start blank session' }).evaluate(function(el){ el.click(); });
    await waitForScreen(page, 'screen-train-session');
    assert.strictEqual(await shown(page, '#train-sess-more'), true, 'blank session shows ...');
    await tap(page, '#train-sess-more');
    assert.strictEqual(await shown(page, '#train-sess-save-as'), true, 'blank session shows Save as workout');
    var label = ((await page.textContent('#train-sess-save-as')) || '').trim();
    assert.strictEqual(label, 'Save as workout');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionIsBlank(trainSessionState); }), true);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){ return loadHomeDueList(); });
    await page.waitForFunction(function(){
      var el = document.getElementById('home-today-start');
      return el && !el.hidden && el.dataset.id === 'asg-a' && (el.textContent || '').trim() === 'Start';
    }, null, { timeout: 8000 });
    await tap(page, '#home-today-start');
    await waitForScreen(page, 'screen-train-session');
    var draftId = await page.evaluate(function(){ return trainSessionState.id; });
    await page.fill('#train-sess-title', 'Alpha draft');
    await page.waitForFunction(function(userId){
      var raw = localStorage.getItem('see_train_draft_' + userId);
      if(!raw) return false;
      var env = JSON.parse(raw);
      return !!(env && env.state && env.state.title === 'Alpha draft' && env.state.source_assignment_id === 'asg-a' && env.state.id);
    }, USER_ID, { timeout: 4000 });
    await page.evaluate(function(){ showScreen('screen-home'); });
    await page.waitForFunction(function(){
      var draft = document.getElementById('home-train-draft-card');
      var today = document.getElementById('home-today-card');
      if(!draft || !today) return false;
      var draftCs = getComputedStyle(draft);
      var todayCs = getComputedStyle(today);
      var title = document.getElementById('home-train-draft-title');
      return draftCs.display !== 'none' && draft.getBoundingClientRect().height > 0
        && title && title.textContent === 'Alpha draft'
        && (today.hidden || todayCs.display === 'none');
    }, null, { timeout: 8000 });
    await tap(page, '#home-train-draft-card .train-draft-resume');
    await waitForScreen(page, 'screen-train-session');
    var resumed = await page.evaluate(function(){
      var choice = document.getElementById('train-draft-choice');
      return {
        id: trainSessionState && trainSessionState.id,
        title: trainSessionState && trainSessionState.title,
        assignment: trainSessionState && trainSessionState.source_assignment_id,
        choice: !!(choice && !choice.hidden && getComputedStyle(choice).display !== 'none')
      };
    });
    assert.strictEqual(resumed.id, draftId, 'Home Resume opens the same draft');
    assert.strictEqual(resumed.title, 'Alpha draft');
    assert.strictEqual(resumed.assignment, 'asg-a');
    assert.strictEqual(resumed.choice, false, 'matching assignment resumes without the choice');

    await page.evaluate(function(){ showScreen('screen-train-assignments'); });
    await waitForScreen(page, 'screen-train-assignments');
    await page.waitForFunction(function(){
      var cards = document.querySelectorAll('#train-list .train-assign-card');
      if(cards.length < 2) return false;
      function label(title){
        var i, buttons, b;
        for(i = 0; i < cards.length; i++){
          if((cards[i].textContent || '').indexOf(title) === -1) continue;
          buttons = cards[i].querySelectorAll('button');
          for(b = 0; b < buttons.length; b++){
            var t = (buttons[b].textContent || '').trim();
            if(t === 'Resume' || t === 'Start') return t;
          }
        }
        return '';
      }
      return label('Alpha hang') === 'Resume' && label('Beta hang') === 'Start';
    }, null, { timeout: 8000 });
    await page.locator('#train-list .train-assign-card', { hasText: 'Beta hang' }).locator('button', { hasText: 'Start' }).evaluate(function(el){ el.click(); });
    await page.waitForFunction(function(){
      var el = document.getElementById('train-draft-choice');
      if(!el || el.hidden) return false;
      var cs = getComputedStyle(el);
      if(cs.display === 'none') return false;
      var text = el.textContent || '';
      return text.indexOf('Resume session in progress') !== -1 && text.indexOf('Start new') !== -1;
    }, null, { timeout: 8000 });
    var stillDraft = await page.evaluate(function(userId){
      var raw = localStorage.getItem('see_train_draft_' + userId);
      var env = raw ? JSON.parse(raw) : null;
      return env && env.state && env.state.id;
    }, USER_ID);
    assert.strictEqual(stillDraft, draftId, 'the choice does not discard the draft');
  });
}finally{
  server.close();
  await browser.close();
}
console.log('session-run-fixes ok');
