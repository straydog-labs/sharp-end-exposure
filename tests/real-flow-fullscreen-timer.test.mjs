import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { startStaticServer, launchChromium, withPage, waitForScreen, USER_ID } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index346'/.test(index));
assert.ok(/APP_VERSION = 'index346'/.test(sw));

async function boot(page){
  await page.waitForFunction(function(){
    return typeof window.newTrainSessionState === 'function' && typeof window.isWkOn === 'function' && window.isWkOn();
  }, null, { timeout: 30000 });
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window._hasRoutedAfterSignIn = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window.routeSignedInHome = function(){};
    try{ localStorage.removeItem('see_train_draft_' + userId); }catch(e){}
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

function seed(){
  trainSessionState = newTrainSessionState('Boulders', 'Timer test', '', { session_running: true });
  trainSessionState.blocks = [];
  trainAddBlock('emom');
  trainAddBlock('circuit');
  trainAddBlock('rep_pass_fail');
  trainAddBlock('section'); // Custom
  var warmup = newTrainBlock('check');
  warmup.title = 'Warm up';
  warmup.is_warmup = true;
  warmup.items = [{ id: uid(), text: 'Easy traverse', complete: false }];
  trainSessionState.blocks.unshift(warmup);
  showScreen('screen-train-session');
  renderTrainSessionBuilder();
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await boot(page);
    await page.evaluate(seed);
    await waitForScreen(page, 'screen-train-session');
    var ids = await page.evaluate(function(){
      return trainSessionState.blocks.map(function(b){ return { id: b.id, shape: b.shape }; });
    });

    // Every work block type has the Timer toggle (incl. Warm up, which lacked
    // one before this change), and opening Full screen works from each.
    for(var i = 0; i < ids.length; i++){
      var info = ids[i];
      var hasToggle = await page.evaluate(function(id){
        var card = document.querySelector('[data-block-id="' + id + '"]');
        return !!(card && card.querySelector('.train-block-timer-toggle'));
      }, info.id);
      assert.strictEqual(hasToggle, true, info.shape + ' has a Timer toggle');

      await page.click('[data-block-id="' + info.id + '"] .train-block-timer-toggle');
      await page.click('[data-block-id="' + info.id + '"] .train-block-timer-fullscreen');
      var open = await page.evaluate(function(){
        var el = document.getElementById('train-fullscreen-timer');
        return { hidden: el.hidden, clock: document.getElementById('train-fullscreen-timer-clock').textContent };
      });
      assert.strictEqual(open.hidden, false, info.shape + ' opens full screen');
      assert.strictEqual(open.clock, '00:00', info.shape + ' starts at 00:00');

      await page.click('#train-fullscreen-timer-close');
      var closed = await page.evaluate(function(){ return document.getElementById('train-fullscreen-timer').hidden; });
      assert.strictEqual(closed, true, info.shape + ' closes back to the block');

      // leave the toggle off again for the next block in this loop
      await page.click('[data-block-id="' + info.id + '"] .train-block-timer-toggle');
    }

    // --- Running time, Pause, Reset, and toggling full screen repeatedly ---
    var emomId = ids.find(function(x){ return x.shape === 'emom'; }).id;
    await page.click('[data-block-id="' + emomId + '"] .train-block-timer-toggle');
    await page.click('[data-block-id="' + emomId + '"] .train-block-timer-fullscreen');
    await page.click('#train-fullscreen-timer-start');
    var startedAtMs = await page.evaluate(function(id){
      var b = trainSessionState.blocks.find(function(x){ return x.id === id; });
      return new Date(b.timer_started_at).getTime();
    }, emomId);

    await page.click('#train-fullscreen-timer-close'); // collapse: keeps running
    await page.waitForTimeout(1200);
    var reopened = await page.evaluate(function(id){
      var b = trainSessionState.blocks.find(function(x){ return x.id === id; });
      return { running: !b.timer_ended_at, started: b.timer_started_at };
    }, emomId);
    assert.ok(reopened.running, 'timer keeps running while the full-screen view is collapsed');

    await page.click('[data-block-id="' + emomId + '"] .train-block-timer-fullscreen');
    var elapsedText = await page.evaluate(function(){
      return document.getElementById('train-fullscreen-timer-clock').textContent;
    });
    assert.ok(/00:0[1-9]/.test(elapsedText) || /00:1\d/.test(elapsedText), 'elapsed reflects wall-clock time while collapsed: ' + elapsedText);

    await page.click('#train-fullscreen-timer-pause');
    var paused = await page.evaluate(function(id){
      var b = trainSessionState.blocks.find(function(x){ return x.id === id; });
      return !!b.timer_ended_at;
    }, emomId);
    assert.strictEqual(paused, true, 'Pause stops the wall-clock timer');

    await page.click('#train-fullscreen-timer-reset');
    var resetState = await page.evaluate(function(id){
      var b = trainSessionState.blocks.find(function(x){ return x.id === id; });
      return { started: b.timer_started_at, ended: b.timer_ended_at, clock: document.getElementById('train-fullscreen-timer-clock').textContent };
    }, emomId);
    assert.strictEqual(resetState.started, null, 'Reset clears the stamp');
    assert.strictEqual(resetState.ended, null);
    assert.strictEqual(resetState.clock, '00:00');
    await page.click('#train-fullscreen-timer-close');

    // --- Reload with a draft resumes the timer state ---
    await page.click('[data-block-id="' + emomId + '"] .train-block-timer-fullscreen');
    await page.click('#train-fullscreen-timer-start');
    await page.waitForTimeout(700);
    await page.evaluate(function(){ writeTrainUserDraft(true); });
    var before = await page.evaluate(function(id){
      return trainSessionState.blocks.find(function(x){ return x.id === id; }).timer_started_at;
    }, emomId);
    // A real page reload would also reset the (client-side only) overlay
    // chrome; this lighter resume simulation doesn't, so close it first.
    await page.click('#train-fullscreen-timer-close');
    await page.evaluate(function(){ trainSessionState = null; resumeTrainDraft(); });
    await waitForScreen(page, 'screen-train-session');
    var after = await page.evaluate(function(id){
      var b = trainSessionState.blocks.find(function(x){ return x.id === id; });
      return { started: b.timer_started_at, running: !b.timer_ended_at };
    }, emomId);
    assert.strictEqual(after.started, before, 'draft resume keeps the running timer stamp');
    assert.ok(after.running);

    // --- No horizontal scroll at the two required viewports ---
    await page.click('[data-block-id="' + emomId + '"] .train-block-timer-fullscreen');
    for(var size of [{ width: 390, height: 667 }, { width: 390, height: 844 }]){
      await page.setViewportSize(size);
      var box = await page.evaluate(function(){
        var el = document.getElementById('train-fullscreen-timer');
        var closeBtn = document.getElementById('train-fullscreen-timer-close');
        var r = el.getBoundingClientRect();
        var cr = closeBtn.getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          coversViewport: r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1,
          closeW: cr.width,
          closeH: cr.height
        };
      });
      assert.ok(box.scrollWidth <= box.innerWidth + 1, 'no horizontal scroll at ' + size.width + 'x' + size.height);
      assert.strictEqual(box.coversViewport, true, 'full-screen view covers the viewport at ' + size.width + 'x' + size.height);
      assert.ok(box.closeW >= 44 && box.closeH >= 44, 'Close is at least 44px: ' + box.closeW + 'x' + box.closeH);
    }
  });

  console.log('real-flow-fullscreen-timer: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
