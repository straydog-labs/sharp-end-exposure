import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { startStaticServer, launchChromium, withPage, USER_ID } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index338'/.test(index));
assert.ok(/APP_VERSION = 'index338'/.test(sw));

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function assignment(id, title, due){
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

function stub(){
  var rows = [
    assignment('asg-a', 'Alpha hang', '2026-11-11'),
    assignment('asg-b', 'Beta hang', '2026-11-20')
  ];
  return async function(route, info){
    if(info.method === 'GET' && info.url.indexOf('/rest/v1/assignments') !== -1){
      await fulfillJson(route, 200, rows);
      return true;
    }
    return false;
  };
}

function sessionState(title, assignmentId){
  return {
    id: 'sess-' + title.replace(/\s+/g, '-').toLowerCase(),
    title: title,
    started_at: new Date().toISOString(),
    source_assignment_id: assignmentId || null,
    assignment_id: null,
    library_item_id: null,
    custom_workout_item_id: assignmentId ? null : 'cw-other',
    blocks: []
  };
}

async function boot(page){
  await page.waitForFunction(function(){
    return typeof window.showScreen === 'function' && typeof window.loadHomeDueList === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window._hasRoutedAfterSignIn = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.routeSignedInHome = function(){};
    try{ localStorage.removeItem('see_train_draft_' + userId); }catch(e){}
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

async function showHomeWithDraft(page, state){
  await page.evaluate(async function(args){
    var envelope = {
      v: 1,
      saved_at: new Date().toISOString(),
      user_id: args.userId,
      screen: 'screen-train-session',
      state: args.state
    };
    try{ localStorage.setItem('see_train_draft_' + args.userId, JSON.stringify(envelope)); }catch(e){}
    showScreen('screen-home');
    if(typeof _homeScreenLoadPromise !== 'undefined' && _homeScreenLoadPromise) await _homeScreenLoadPromise;
  }, { userId: USER_ID, state: state });
}

function cards(page){
  return page.evaluate(function(){
    function vis(id){
      var el = document.getElementById(id);
      if(!el || el.hidden) return false;
      var cs = getComputedStyle(el);
      if(cs.display === 'none' || cs.visibility === 'hidden') return false;
      var box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    }
    var title = document.getElementById('home-train-draft-title');
    var started = document.getElementById('home-train-draft-started');
    var today = document.getElementById('home-today-title');
    return {
      draft: vis('home-train-draft-card'),
      today: vis('home-today-card'),
      draftTitle: title ? title.textContent : '',
      started: started ? started.textContent : '',
      todayTitle: today ? today.textContent : ''
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
  }, async function(page){
    await boot(page);

    await showHomeWithDraft(page, sessionState('Alpha hang', 'asg-a'));
    await page.waitForFunction(function(){
      var draft = document.getElementById('home-train-draft-title');
      var today = document.getElementById('home-today-card');
      if(!draft || draft.textContent !== 'Alpha hang' || !today) return false;
      var cs = getComputedStyle(today);
      return today.hidden || cs.display === 'none' || today.getBoundingClientRect().height === 0;
    }, null, { timeout: 8000 });
    var matching = await cards(page);
    assert.strictEqual(matching.draft, true, 'matching draft shows Session in progress');
    assert.strictEqual(matching.draftTitle, 'Alpha hang', 'Session in progress shows the assignment title');
    assert.ok(/^Started /.test(matching.started), matching.started);
    assert.strictEqual(matching.today, false, 'matching draft hides Up next ' + JSON.stringify(matching));

    await showHomeWithDraft(page, sessionState('Other workout', null));
    await page.waitForFunction(function(){
      var title = document.getElementById('home-today-title');
      var draft = document.getElementById('home-train-draft-title');
      return title && /Up next: Alpha hang/.test(title.textContent || '')
        && draft && draft.textContent === 'Other workout';
    }, null, { timeout: 8000 });
    var blank = await cards(page);
    assert.strictEqual(blank.draft, true, 'draft with no assignment still shows Session in progress');
    assert.strictEqual(blank.today, true, 'draft with no assignment still shows Up next ' + JSON.stringify(blank));
    assert.ok(/Up next: Alpha hang/.test(blank.todayTitle), blank.todayTitle);

    await showHomeWithDraft(page, sessionState('Beta session', 'asg-b'));
    await page.waitForFunction(function(){
      var draft = document.getElementById('home-train-draft-title');
      var today = document.getElementById('home-today-card');
      if(!draft || draft.textContent !== 'Beta session' || !today) return false;
      var cs = getComputedStyle(today);
      return !today.hidden && cs.display !== 'none' && today.getBoundingClientRect().height > 0;
    }, null, { timeout: 8000 });
    var other = await cards(page);
    assert.strictEqual(other.draft, true, 'different assignment draft shows Session in progress');
    assert.strictEqual(other.draftTitle, 'Beta session');
    assert.strictEqual(other.today, true, 'different assignment still shows Up next ' + JSON.stringify(other));
    assert.ok(/Up next: Alpha hang/.test(other.todayTitle), other.todayTitle);
  });
  console.log('home-draft-up-next ok');
}finally{
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
