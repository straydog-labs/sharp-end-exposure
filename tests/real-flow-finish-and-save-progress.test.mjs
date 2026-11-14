import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, waitForScreen,
  postsTo, firstBody, USER_ID
} from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const htmlVer = (index.match(/var app_version = '([^']+)'/) || [])[1];

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(htmlVer, 'app_version pin');
assert.ok(new RegExp("APP_VERSION = '" + htmlVer + "'").test(sw));

function fulfillJson(route, status, body){
  return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) });
}
function stub(){
  return async function(route, info){
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: (info.body && info.body.id) || 'sess-fin' }, info.body || {})]);
      return true;
    }
    if(info.method === 'PATCH' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 200, [info.body || {}]);
      return true;
    }
    if(info.method === 'PATCH' && info.url.indexOf('/rest/v1/assignments') !== -1){
      await fulfillJson(route, 200, [Object.assign({ id: 'asg-1', completed_at: (info.body && info.body.completed_at) || null }, info.body || {})]);
      return true;
    }
    if(info.method === 'GET' && info.url.indexOf('/rest/v1/assignments') !== -1){
      await fulfillJson(route, 200, []);
      return true;
    }
    return false;
  };
}

async function boot(page){
  await page.waitForFunction(function(){
    return typeof window.newTrainSessionState === 'function' && typeof window.saveTrainSession === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window.loadTrainAssignments = function(){ return Promise.resolve(); };
    window.loadTrainHub = function(){ return Promise.resolve(); };
    try{ localStorage.removeItem('see_train_session_draft'); }catch(e){}
    try{ localStorage.removeItem('see_train_draft_' + userId); }catch(e){}
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

function sessionPosts(recorded){
  return postsTo(recorded, 'training_sessions', 'POST');
}
function completionPatches(recorded){
  return postsTo(recorded, 'assignments', 'PATCH').filter(function(r){
    return r.body && r.body.completed_at;
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
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'All done', '', { source_assignment_id: 'asg-1' });
      trainSessionState.blocks = [
        { id: 'b1', shape: 'section', title: 'One', complete: true, notes: '' },
        { id: 'b2', shape: 'section', title: 'Two', complete: true, notes: '' }
      ];
      _trainDraftBaselineId = null;
      showScreen('screen-train-session');
    });
    await waitForScreen(page, 'screen-train-session');
    var label = (await page.textContent('#train-sess-save')).trim();
    assert.strictEqual(label, 'Finish workout');
    var saveProgress = await page.evaluate(function(){
      var el = document.getElementById('train-sess-save-progress');
      return el && !el.hidden && el.textContent.trim();
    });
    assert.strictEqual(saveProgress, 'Save progress');
    await page.click('#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    var saved = firstBody(sessionPosts(recorded));
    assert.strictEqual(saved.assignment_id, 'asg-1');
    for(var i = 0; i < 30 && !completionPatches(recorded).length; i++) await page.waitForTimeout(100);
    assert.ok(completionPatches(recorded).length >= 1, 'all blocks complete marks the assignment');
    var prompt = await page.evaluate(function(){
      var oldP = document.getElementById('train-done-assign-prompt');
      var check = document.getElementById('train-finish-check');
      var notice = document.getElementById('train-done-notice');
      return {
        oldHidden: !oldP || oldP.hidden,
        checkHidden: !check || check.hidden,
        notice: notice && !notice.hidden
      };
    });
    assert.strictEqual(prompt.oldHidden, true, 'no Mark complete prompt');
    assert.strictEqual(prompt.checkHidden, true, 'no inline check when every block is done');
    assert.strictEqual(prompt.notice, true, 'What did you notice stays');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Partial', '', { source_assignment_id: 'asg-1' });
      trainSessionState.blocks = [
        { id: 'b1', shape: 'section', title: 'One', complete: true, notes: '' },
        { id: 'b2', shape: 'section', title: 'Two', complete: false, notes: '' }
      ];
      _trainDraftBaselineId = null;
      showScreen('screen-train-session');
    });
    await waitForScreen(page, 'screen-train-session');
    await page.click('#train-sess-save');
    var check = await page.evaluate(function(){
      var el = document.getElementById('train-finish-check');
      var text = document.getElementById('train-finish-check-text');
      return {
        open: !!(el && !el.hidden),
        text: text ? text.textContent : '',
        screen: (document.querySelector('.screen.active') || {}).id
      };
    });
    assert.strictEqual(check.screen, 'screen-train-session');
    assert.strictEqual(check.open, true);
    assert.strictEqual(check.text, '1 of 2 blocks not done. Finish anyway?');
    assert.strictEqual(sessionPosts(recorded).length, 0, 'incomplete does not save yet');
    await page.click('#train-finish-keep');
    var kept = await page.evaluate(function(){
      var el = document.getElementById('train-finish-check');
      return {
        open: !!(el && !el.hidden),
        screen: (document.querySelector('.screen.active') || {}).id
      };
    });
    assert.strictEqual(kept.open, false, 'Keep going closes the check');
    assert.strictEqual(kept.screen, 'screen-train-session');
    assert.strictEqual(sessionPosts(recorded).length, 0);
    await page.click('#train-sess-save');
    await page.click('#train-finish-anyway');
    await waitForScreen(page, 'screen-train-done');
    assert.strictEqual(firstBody(sessionPosts(recorded)).assignment_id, 'asg-1');
    for(var j = 0; j < 30 && !completionPatches(recorded).length; j++) await page.waitForTimeout(100);
    assert.ok(completionPatches(recorded).length >= 1, 'Finish anyway marks the assignment complete');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Blank', '');
      trainSessionState.blocks = [
        { id: 'b1', shape: 'section', title: 'Free', complete: false, notes: '' }
      ];
      _trainDraftBaselineId = null;
      showScreen('screen-train-session');
    });
    await waitForScreen(page, 'screen-train-session');
    await page.click('#train-sess-save');
    await waitForScreen(page, 'screen-train-done');
    var saved = firstBody(sessionPosts(recorded));
    assert.ok(saved, 'blank session saves');
    assert.ok(!saved.assignment_id, 'blank session has no assignment');
    assert.strictEqual(completionPatches(recorded).length, 0, 'blank session does not complete an assignment');
    var check = await page.evaluate(function(){
      var el = document.getElementById('train-finish-check');
      return !el || el.hidden;
    });
    assert.strictEqual(check, true);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Hangboard', 'Hold this', '', { source_assignment_id: 'asg-1' });
      trainSessionState.blocks = [
        { id: 'hb', shape: 'rep_pass_fail', title: 'Hangs', complete: false, sets: [{ grip: 'half', load: '20', reps: [{ ok: true }, { ok: null }] }] }
      ];
      _trainDraftBaselineId = null;
      showScreen('screen-train-session');
    });
    await waitForScreen(page, 'screen-train-session');
    await page.click('#train-sess-save-progress');
    await waitForScreen(page, 'screen-home');
    var card = await page.evaluate(function(userId){
      var el = document.getElementById('home-train-draft-card');
      var raw = localStorage.getItem('see_train_draft_' + userId);
      var env = raw ? JSON.parse(raw) : null;
      return {
        shown: !!(el && !el.hidden),
        kicker: el ? el.textContent : '',
        toast: (document.getElementById('toast-el') || {}).textContent || '',
        explicit: !!(env && env.explicit),
        title: env && env.state && env.state.title,
        rep: env && env.state && env.state.blocks[0].sets[0].reps[0].ok
      };
    }, USER_ID);
    assert.strictEqual(card.shown, true, 'Session in progress card');
    assert.ok(card.kicker.indexOf('Session in progress') !== -1, card.kicker);
    assert.strictEqual(card.toast, 'Progress saved. Resume from Home or Train.');
    assert.strictEqual(card.explicit, true);
    assert.strictEqual(card.title, 'Hold this');
    assert.strictEqual(card.rep, true);
    assert.strictEqual(sessionPosts(recorded).length, 0, 'Save progress does not POST');
    var ages = await page.evaluate(function(userId){
      var key = 'see_train_draft_' + userId;
      var env = JSON.parse(localStorage.getItem(key));
      env.saved_at = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
      localStorage.setItem(key, JSON.stringify(env));
      var six = readTrainDraftForUser(userId);
      env.saved_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      localStorage.setItem(key, JSON.stringify(env));
      var eight = readTrainDraftForUser(userId);
      localStorage.setItem(key, JSON.stringify({
        v: 1,
        saved_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        user_id: userId,
        screen: 'screen-train-session',
        state: { id: 'old', title: 'Stale', blocks: [] }
      }));
      var day = readTrainDraftForUser(userId);
      return { six: !!(six && six.explicit), eight: eight, day: day };
    }, USER_ID);
    assert.strictEqual(ages.six, true, 'explicit draft lasts 7 days');
    assert.strictEqual(ages.eight, null, 'explicit draft expires after 7 days');
    assert.strictEqual(ages.day, null, 'other drafts expire after 24 h');
    await page.evaluate(function(userId){
      var key = 'see_train_draft_' + userId;
      var env = {
        v: 1,
        explicit: true,
        saved_at: new Date().toISOString(),
        user_id: userId,
        screen: 'screen-train-session',
        state: {
          id: 'resume-1',
          energy_type: 'Hangboard',
          title: 'Hold this',
          started_at: '2026-11-14T12:00:00.000Z',
          session_running: true,
          blocks: [{ id: 'hb', shape: 'rep_pass_fail', title: 'Hangs', complete: false, sets: [{ grip: 'half', load: '20', reps: [{ ok: true }, { ok: null }] }] }]
        }
      };
      localStorage.setItem(key, JSON.stringify(env));
    }, USER_ID);
    await page.click('#home-train-draft-card .train-draft-resume');
    await waitForScreen(page, 'screen-train-session');
    var restored = await page.evaluate(function(){
      var b = trainSessionState && trainSessionState.blocks && trainSessionState.blocks[0];
      return {
        title: trainSessionState && trainSessionState.title,
        ok: b && b.sets && b.sets[0].reps[0].ok
      };
    });
    assert.strictEqual(restored.title, 'Hold this');
    assert.strictEqual(restored.ok, true, 'resume restores rep state');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){ startSessionNoCategory(); });
    await waitForScreen(page, 'screen-train-session');
    await page.fill('#train-sess-title', 'Keep me');
    await page.waitForFunction(function(userId){
      return !!localStorage.getItem('see_train_draft_' + userId);
    }, USER_ID, { timeout: 4000 });
    var discardLabel = (await page.textContent('#train-sess-discard')).trim();
    assert.strictEqual(discardLabel, 'Discard session');
    await page.click('#train-sess-discard');
    var ask = await page.evaluate(function(){
      var el = document.getElementById('train-discard-confirm');
      return el && !el.hidden ? el.textContent : '';
    });
    assert.ok(ask.indexOf('Discard this session? Progress will be lost.') !== -1, ask);
    await page.click('#train-discard-keep');
    var kept = await page.evaluate(function(userId){
      var el = document.getElementById('train-discard-confirm');
      var raw = localStorage.getItem('see_train_draft_' + userId);
      return {
        open: !!(el && !el.hidden),
        screen: (document.querySelector('.screen.active') || {}).id,
        title: raw ? JSON.parse(raw).state.title : null
      };
    }, USER_ID);
    assert.strictEqual(kept.open, false);
    assert.strictEqual(kept.screen, 'screen-train-session');
    assert.strictEqual(kept.title, 'Keep me');
    await page.click('#train-sess-discard');
    await page.click('#train-discard-do');
    await waitForScreen(page, 'screen-train');
    var cleared = await page.evaluate(function(userId){
      return localStorage.getItem('see_train_draft_' + userId);
    }, USER_ID);
    assert.strictEqual(cleared, null);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page){
    await boot(page);
    function vis(id){
      return page.evaluate(function(elId){
        var el = document.getElementById(elId);
        if(!el) return false;
        return !el.hidden && getComputedStyle(el).display !== 'none';
      }, id);
    }
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Assigned', '', { source_assignment_id: 'asg-9' });
      showScreen('screen-train-session');
    });
    await waitForScreen(page, 'screen-train-session');
    assert.strictEqual(await vis('train-sess-more-wrap'), false, 'assigned session hides Save as workout');
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Library', '', { library_item_id: 'lib-1' });
      showScreen('screen-train-session');
    });
    assert.strictEqual(await vis('train-sess-more-wrap'), false, 'library session hides Save as workout');
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Custom', '', { custom_workout_item_id: 'cw-1' });
      showScreen('screen-train-session');
    });
    assert.strictEqual(await vis('train-sess-more-wrap'), false, 'custom session hides Save as workout');
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Blank menu', '');
      showScreen('screen-train-session');
    });
    assert.strictEqual(await vis('train-sess-more-wrap'), true, 'blank session shows the menu');
    await page.click('#train-sess-more');
    var saveAs = await page.evaluate(function(){
      var menu = document.getElementById('train-sess-more-menu');
      var btn = document.getElementById('train-sess-save-as');
      return !!(menu && !menu.hidden && btn && /Save as workout/.test(btn.textContent || ''));
    });
    assert.strictEqual(saveAs, true);

    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Has blocks', '', { source_assignment_id: 'asg-9' });
      trainSessionState.blocks = [{ id: 's1', shape: 'section', title: 'Work', complete: false, notes: '' }];
      trainSessionState.warm_up = '';
      trainSessionState.cool_down = '';
      renderTrainSessionBuilder();
    });
    assert.strictEqual(await vis('train-warmup-card'), false, 'empty warm-up box hides when the session has blocks');
    assert.strictEqual(await vis('train-cooldown-card'), false, 'empty cool-down box hides when the session has blocks');
    await page.evaluate(function(){
      trainSessionState.warm_up = 'easy laps';
      trainSessionState.cool_down = '';
      renderTrainSessionBuilder();
    });
    assert.strictEqual(await vis('train-warmup-card'), true, 'a warm-up box with content stays');
    assert.strictEqual(await vis('train-sess-warmup'), true);
    assert.strictEqual(await vis('train-cooldown-card'), false);
    await page.evaluate(function(){
      trainSessionState.cool_down = 'stretch';
      renderTrainSessionBuilder();
    });
    assert.strictEqual(await vis('train-cooldown-card'), true, 'a cool-down box with content stays');

    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Blank boxes', '');
      trainSessionState.blocks = [{ id: 's2', shape: 'section', title: 'Free', complete: false, notes: '' }];
      trainSessionState.warm_up = '';
      trainSessionState.cool_down = '';
      renderTrainSessionBuilder();
    });
    assert.strictEqual(await vis('train-warmup-card'), true, 'blank session still shows the warm-up box');
    assert.strictEqual(await vis('train-cooldown-card'), true, 'blank session still shows the cool-down box');
  });
}finally{
  server.close();
  await browser.close();
}
console.log('finish-and-save-progress ok');
