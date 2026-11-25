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
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
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
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'D1 rest preview', '', { session_running: true });
      trainAddBlock('emom');
      var b = trainSessionState.blocks[0];
      b.title = 'EMOM';
      b.editing = false;
      b.rounds[0].rest_after_sec = 90;
      b.rounds[0].boulders = [{ id: uid(), text: 'V3 blue', complete: false }];
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
    });
    await waitForScreen(page, 'screen-train-session');
    var id = await page.evaluate(function(){ return trainSessionState.blocks[0].id; });

    // D1: the configured "Rest after round" value is visible to the athlete
    // before the round is ever completed (previously only shown once editing
    // or once the countdown was already running/done).
    var preview = await page.textContent('[data-block-id="' + id + '"] .train-emom-rest-preview');
    assert.ok(/Rest after round: 01:30/.test(preview), preview);

    // Once the round is actually complete, the live countdown replaces the
    // preview rather than showing both. (The round-level Mark complete, not
    // the block-level one in the header - both share the same button class.)
    await page.click('[data-block-id="' + id + '"] .train-emom-round-head .train-section-complete');
    var afterComplete = await page.evaluate(function(id){
      var card = document.querySelector('[data-block-id="' + id + '"]');
      return {
        preview: !!card.querySelector('.train-emom-rest-preview'),
        counting: !!card.querySelector('[data-emom-rest-phase="Counting"]')
      };
    }, id);
    assert.strictEqual(afterComplete.counting, true, 'live rest countdown shows once the round completes');
    assert.strictEqual(afterComplete.preview, false, 'no duplicate preview once the live countdown is showing');
  });

  console.log('real-flow-emom-rest-preview: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
