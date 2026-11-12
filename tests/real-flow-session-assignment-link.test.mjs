import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, waitForScreen,
  postsTo, firstBody, tap, USER_ID
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
assert.strictEqual(index.indexOf('id="screen-train-run"'), -1, 'no run screen');

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function nightWorkout(){
  return {
    id: 'cw-night',
    name: 'Night session',
    description: 'coach night',
    training_focus: 'Boulders',
    created_by: 'coach-1',
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

function libraryWorkout(){
  return {
    id: 'lib-free',
    name: 'Library density',
    description: 'not an assignment',
    training_focus: 'Hangboard',
    sections: [{ shape: 'check', title: 'Openers', notes: '', items: [{ text: 'hang', complete: false }] }]
  };
}

function assignmentRow(id, title, due){
  return {
    id: id,
    title: title,
    athlete_id: USER_ID,
    coach_id: 'coach-1',
    custom_workout_item_id: 'cw-night',
    library_item_id: null,
    due_date: due,
    completed_at: null,
    description: '',
    deleted_at: null
  };
}

function makeWorld(){
  return {
    assignments: [
      assignmentRow('asg-due', 'Due night', '2026-11-11'),
      assignmentRow('asg-later', 'Later night', '2026-11-13')
    ],
    sessions: [],
    workouts: [nightWorkout()],
    library: [libraryWorkout()]
  };
}

function stub(world){
  return async function(route, info){
    var url = info.url;
    var method = info.method;
    if(method === 'GET' && url.indexOf('/rest/v1/assignments') !== -1){
      await fulfillJson(route, 200, world.assignments.filter(function(a){ return !a.deleted_at; }));
      return true;
    }
    if(method === 'PATCH' && url.indexOf('/rest/v1/assignments') !== -1){
      var idMatch = url.match(/id=eq\.([^&]+)/);
      var id = idMatch ? decodeURIComponent(idMatch[1]) : '';
      var row = world.assignments.filter(function(a){ return String(a.id) === id; })[0];
      if(row && info.body){
        if(Object.prototype.hasOwnProperty.call(info.body, 'completed_at')) row.completed_at = info.body.completed_at;
      }
      await fulfillJson(route, 200, row ? [row] : []);
      return true;
    }
    if(method === 'GET' && url.indexOf('/rest/v1/custom_workouts') !== -1){
      await fulfillJson(route, 200, world.workouts);
      return true;
    }
    if(method === 'GET' && url.indexOf('/rest/v1/workout_library') !== -1){
      await fulfillJson(route, 200, world.library);
      return true;
    }
    if(method === 'GET' && url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 200, world.sessions);
      return true;
    }
    if(method === 'POST' && url.indexOf('/rest/v1/training_sessions') !== -1){
      var saved = Object.assign({ id: (info.body && info.body.id) || 'sess-new' }, info.body || {});
      world.sessions = [saved].concat(world.sessions);
      await fulfillJson(route, 201, [saved]);
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
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

async function completeHeaders(page, limit){
  var n = await page.evaluate(function(){
    return document.querySelectorAll('#screen-train-session .train-block-card').length;
  });
  if(limit != null) n = Math.min(n, limit);
  var i;
  for(i = 0; i < n; i++){
    await page.evaluate(function(idx){
      var cards = document.querySelectorAll('#screen-train-session .train-block-card');
      var btn = cards[idx] && cards[idx].querySelector('.train-section-complete');
      if(btn) btn.click();
    }, i);
  }
  return n;
}

function sessionPosts(recorded){
  return postsTo(recorded, 'training_sessions', 'POST');
}

function completionPatches(recorded){
  return postsTo(recorded, 'assignments', 'PATCH').filter(function(r){
    return r.body && r.body.completed_at;
  });
}

async function openTrain(page){
  await page.evaluate(function(){ showScreen('screen-train'); });
  await waitForScreen(page, 'screen-train');
  await page.waitForSelector('#train-hub-due-list .home-due-start', { timeout: 8000 });
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page, recorded){
    await boot(page);
    await openTrain(page);
    var screenBefore = await page.evaluate(function(){
      return {
        run: !!document.getElementById('screen-train-run'),
        active: (document.querySelector('.screen.active') || {}).id
      };
    });
    assert.strictEqual(screenBefore.run, false);
    assert.strictEqual(screenBefore.active, 'screen-train');
    await tap(page, '#train-hub-due-list .home-due-start');
    await waitForScreen(page, 'screen-train-session');
    var linked = await page.evaluate(function(){
      return {
        screen: (document.querySelector('.screen.active') || {}).id,
        assignment: trainSessionState && trainSessionState.source_assignment_id,
        blocks: (trainSessionState && trainSessionState.blocks || []).map(function(b){ return b.shape; })
      };
    });
    assert.strictEqual(linked.screen, 'screen-train-session', 'assignment Start lands on the session screen');
    assert.strictEqual(linked.assignment, 'asg-due');
    assert.deepStrictEqual(linked.blocks, ['check', 'emom', 'rest', 'rep_pass_fail']);
    var marked = await completeHeaders(page);
    assert.strictEqual(marked, 4);
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    var body = firstBody(sessionPosts(recorded));
    assert.ok(body, 'session saved');
    assert.strictEqual(body.assignment_id, 'asg-due');
    await page.waitForFunction(function(){
      var el = document.getElementById('train-hub-due-list');
      return el && el.textContent.indexOf('Due night') === -1;
    }, null, { timeout: 8000 });
    assert.ok(completionPatches(recorded).length >= 1, 'full complete marks the assignment');
    var promptHidden = await page.evaluate(function(){
      var el = document.getElementById('train-done-assign-prompt');
      return !el || el.hidden;
    });
    assert.strictEqual(promptHidden, true, 'full complete does not ask');
    var laterStill = await page.evaluate(function(){
      return (document.getElementById('train-hub-due-list').textContent || '').indexOf('Later night') !== -1;
    });
    assert.strictEqual(laterStill, true, 'a different open assignment stays due');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page, recorded){
    await boot(page);
    await openTrain(page);
    await tap(page, '#train-hub-due-list .home-due-start');
    await waitForScreen(page, 'screen-train-session');
    await completeHeaders(page, 1);
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    var body = firstBody(sessionPosts(recorded));
    assert.strictEqual(body.assignment_id, 'asg-due', 'partial save still writes assignment_id');
    await page.waitForFunction(function(){
      var el = document.getElementById('train-done-assign-prompt');
      return el && !el.hidden;
    }, null, { timeout: 8000 });
    assert.strictEqual(completionPatches(recorded).length, 0, 'partial does not complete the assignment');
    var prompt = await page.evaluate(function(){
      var el = document.getElementById('train-done-assign-prompt');
      return el && !el.hidden && (document.getElementById('train-done-assign-prompt-text').textContent || '');
    });
    assert.ok(/Mark .+ complete\?/.test(prompt), prompt);
    var stillDue = await page.evaluate(function(){
      return (document.getElementById('train-hub-due-list').textContent || '').indexOf('Due night') !== -1;
    });
    assert.strictEqual(stillDue, true);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 1280, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(function(){ showScreen('screen-train-assignments'); });
    await waitForScreen(page, 'screen-train-assignments');
    await page.waitForSelector('#train-list button', { timeout: 8000 });
    await page.locator('#train-list button', { hasText: 'Start' }).first().evaluate(function(el){ el.click(); });
    await waitForScreen(page, 'screen-train-session');
    var id = await page.evaluate(function(){ return trainSessionState && trainSessionState.source_assignment_id; });
    assert.strictEqual(id, 'asg-due', 'My plan / See all Start');
    await completeHeaders(page);
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    assert.strictEqual(firstBody(sessionPosts(recorded)).assignment_id, 'asg-due');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(function(){ return loadHomeDueList(); });
    await page.waitForFunction(function(){
      var el = document.getElementById('home-today-start');
      return el && !el.hidden && el.dataset.id === 'asg-due';
    }, null, { timeout: 8000 });
    await tap(page, '#home-today-start');
    await waitForScreen(page, 'screen-train-session');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.source_assignment_id; }), 'asg-due');
    await completeHeaders(page);
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    assert.strictEqual(firstBody(sessionPosts(recorded)).assignment_id, 'asg-due', 'Home Up next');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(function(){ return loadHomeDueList(); });
    await page.waitForFunction(function(){
      return !!document.querySelector('#home-due-list .home-due-start');
    }, null, { timeout: 8000 });
    await page.evaluate(function(){
      document.querySelector('#home-due-list .home-due-start').click();
    });
    await waitForScreen(page, 'screen-train-session');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.source_assignment_id; }), 'asg-later');
    await completeHeaders(page);
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    assert.strictEqual(firstBody(sessionPosts(recorded)).assignment_id, 'asg-later', 'Home due row');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(function(){ showScreen('screen-home'); });
    await waitForScreen(page, 'screen-home');
    await page.evaluate(function(){ return loadHomeDueList(); });
    await page.evaluate(function(){
      openHomeDaySheet('2026-11-11');
    });
    await page.waitForFunction(function(){
      var sheet = document.getElementById('home-day-sheet');
      return sheet && !sheet.hidden && !!document.querySelector('#home-day-sheet-body .home-due-start');
    }, null, { timeout: 8000 });
    await tap(page, '#home-day-sheet-body .home-due-start');
    await waitForScreen(page, 'screen-train-session');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.source_assignment_id; }), 'asg-due');
    await completeHeaders(page);
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    assert.strictEqual(firstBody(sessionPosts(recorded)).assignment_id, 'asg-due', 'Home day sheet');
  });

  await withPage(browser, port, {
    path: '/index.html?wk=0',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    storage: { see_wk: '0' },
    stub: stub(makeWorld())
  }, async function(page, recorded){
    await boot(page);
    var flag = await page.evaluate(function(){ return isWkOn(); });
    assert.strictEqual(flag, false, 'legacy builder hatch');
    await openTrain(page);
    await tap(page, '#train-hub-due-list .home-due-start');
    await waitForScreen(page, 'screen-train-session');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.source_assignment_id; }), 'asg-due');
    await completeHeaders(page);
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    assert.strictEqual(firstBody(sessionPosts(recorded)).assignment_id, 'asg-due', 'legacy builder keeps assignment_id');
  });

  var resumeWorld = makeWorld();
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(resumeWorld)
  }, async function(page, recorded){
    await boot(page);
    await openTrain(page);
    await tap(page, '#train-hub-due-list .home-due-start');
    await waitForScreen(page, 'screen-train-session');
    await completeHeaders(page, 1);
    await page.waitForFunction(function(userId){
      var raw = localStorage.getItem('see_train_draft_' + userId);
      if(!raw) return false;
      var env = JSON.parse(raw);
      return env && env.state && env.state.source_assignment_id === 'asg-due';
    }, USER_ID, { timeout: 4000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await boot(page);
    await page.evaluate(function(){ paintTrainDraftCards(); });
    await tap(page, '#home-train-draft-card .train-draft-resume');
    await waitForScreen(page, 'screen-train-session');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.source_assignment_id; }), 'asg-due');
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    assert.strictEqual(firstBody(sessionPosts(recorded)).assignment_id, 'asg-due', 'Resume keeps assignment_id');
  });

  var repeatWorld = makeWorld();
  repeatWorld.sessions = [{
    id: 'sess-prev',
    user_id: USER_ID,
    notes: 'Repeated night',
    energy_type: 'Boulders',
    started_at: '2026-11-10T15:00:00.000Z',
    ended_at: '2026-11-10T16:00:00.000Z',
    assignment_id: 'asg-due',
    blocks: nightWorkout().sections,
    deleted_at: null
  }];
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(repeatWorld)
  }, async function(page, recorded){
    await boot(page);
    await openTrain(page);
    await page.waitForSelector('#train-hub-recent-mini .train-hub-duplicate-btn', { timeout: 8000 });
    await tap(page, '#train-hub-recent-mini .train-hub-duplicate-btn');
    await waitForScreen(page, 'screen-train-session');
    var carried = await page.evaluate(function(){
      return {
        screen: (document.querySelector('.screen.active') || {}).id,
        assignment: trainSessionState && trainSessionState.source_assignment_id
      };
    });
    assert.strictEqual(carried.screen, 'screen-train-session');
    assert.strictEqual(carried.assignment, 'asg-due', 'Repeat copies assignment_id onto the session');
    await completeHeaders(page);
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    assert.strictEqual(firstBody(sessionPosts(recorded)).assignment_id, 'asg-due', 'Repeat save writes assignment_id');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub(makeWorld())
  }, async function(page, recorded){
    await boot(page);
    await openTrain(page);
    await tap(page, '#train-hub-card-build');
    await waitForScreen(page, 'screen-train-session');
    assert.strictEqual(await page.evaluate(function(){ return (document.querySelector('.screen.active') || {}).id; }), 'screen-train-session');
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    var blank = firstBody(sessionPosts(recorded));
    assert.ok(blank);
    assert.ok(!Object.prototype.hasOwnProperty.call(blank, 'assignment_id'), 'blank save omits assignment_id');

    await page.evaluate(function(){ showScreen('screen-train'); });
    await waitForScreen(page, 'screen-train');
    await page.waitForSelector('#train-pinned-strip .quick-attempt-btn', { timeout: 8000 });
    await tap(page, '#train-pinned-strip .quick-attempt-btn');
    await waitForScreen(page, 'screen-train-session');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.source_assignment_id; }), null);
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    var pinned = sessionPosts(recorded)[1].body;
    assert.ok(!Object.prototype.hasOwnProperty.call(pinned, 'assignment_id'), 'pinned save omits assignment_id');

    await page.evaluate(function(){
      var item = (_trainWorkoutCatalog || []).filter(function(x){ return x && x.id === 'lib-free'; })[0];
      openTrainCatalogItem(item, 'screen-train');
    });
    await waitForScreen(page, 'screen-workout-library-detail');
    await tap(page, '#wl-start-now-btn');
    await waitForScreen(page, 'screen-train-session');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.source_assignment_id; }), null);
    await tap(page, '#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    var library = sessionPosts(recorded)[2].body;
    assert.ok(!Object.prototype.hasOwnProperty.call(library, 'assignment_id'), 'library save omits assignment_id');
  });

  console.log('session-assignment-link ok');
}finally{
  server.close();
  await browser.close();
}
