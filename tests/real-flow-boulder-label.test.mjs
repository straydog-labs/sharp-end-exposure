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

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
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
      var sk = document.getElementById('route-loading-skeleton');
      if(sk) sk.style.display = 'none';
      trainSessionState = newTrainSessionState('Boulders', 'Labels', '', { session_running: true });
      trainSessionState.blocks = [{
        id: 'emom-1', shape: 'emom', title: '', complete: false, attempts: [],
        rounds: [{
          boulders: [
            { id: 'bo-1', text: 'V4 orange', complete: false },
            { id: 'bo-2', text: '', complete: false }
          ],
          notes: '', note: '', rest_after_sec: 60, complete: false
        }]
      }];
      normalizeWkBlock(trainSessionState.blocks[0]);
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
    }, USER_ID);
    await waitForScreen(page, 'screen-train-session');

    var editor = await page.evaluate(function(){
      var card = document.querySelector('[data-block-id="emom-1"]');
      var inputs = card ? Array.prototype.slice.call(card.querySelectorAll('input[id*="-r0-b"]')) : [];
      var checkText = card ? Array.prototype.slice.call(card.querySelectorAll('.wk-boulder .wk-check-text')).map(function(n){ return n.textContent.trim(); }) : [];
      return {
        values: inputs.map(function(el){ return el.value; }),
        placeholders: inputs.map(function(el){ return el.getAttribute('placeholder'); }),
        checkText: checkText
      };
    });
    assert.deepStrictEqual(editor.values, ['V4 orange', '']);
    assert.deepStrictEqual(editor.placeholders, ['Boulder 1', 'Boulder 2']);
    assert.deepStrictEqual(editor.checkText, [], 'the check control does not repeat the name');

    var readOnly = await page.evaluate(function(){
      var block = {
        shape: 'emom', title: 'EMOM', complete: false,
        rounds: [{
          boulders: [{ text: 'V4 orange', result: 'sent', complete: true }, { text: 'V2 blue', result: 'failed', complete: false }],
          note: '', notes: '', rest_after_sec: 60, complete: false
        }]
      };
      var detail = renderTrainSessionBlockDetailHtml(block, 1);
      var saved = trainSessionState.blocks[0].title;
      trainSessionState.blocks[0].title = 'EMOM';
      trainSessionState.blocks[0].editing = false;
      renderTrainSessionBuilder();
      var card = document.querySelector('[data-block-id="emom-1"]');
      var labels = card ? Array.prototype.slice.call(card.querySelectorAll('.wk-boulder .wk-check-text')).map(function(n){ return n.textContent.trim(); }) : [];
      var inputs = card ? card.querySelectorAll('input[id*="-r0-b"]').length : 0;
      trainSessionState.blocks[0].title = saved;
      renderTrainSessionBuilder();
      return { detail: detail, labels: labels, inputs: inputs };
    });
    assert.ok(readOnly.detail.indexOf('V4 orange · sent') !== -1, readOnly.detail);
    assert.ok(readOnly.detail.indexOf('V2 blue · failed') !== -1, readOnly.detail);
    assert.ok(readOnly.detail.indexOf('Boulder 1') === -1, 'history detail does not add a Boulder N prefix');
    assert.deepStrictEqual(readOnly.labels, ['Boulder 1 · V4 orange', 'Boulder 2']);
    assert.strictEqual(readOnly.inputs, 0, 'a titled session row is one label, not a second field');

    await page.fill('#tb-emom-1-r0-b0', 'Boulder 1 - Green');
    var after = await page.evaluate(function(){
      collectTrainBlockFields();
      var card = document.querySelector('[data-block-id="emom-1"]');
      var field = document.getElementById('tb-emom-1-r0-b0');
      return {
        text: trainSessionState.blocks[0].rounds[0].boulders[0].text,
        value: field ? field.value : '',
        outside: card ? card.innerText : ''
      };
    });
    assert.strictEqual(after.text, 'Boulder 1 - Green');
    assert.strictEqual(after.value, 'Boulder 1 - Green');
    assert.ok(after.outside.indexOf('Boulder 1') === -1, 'the check row does not repeat the field: ' + after.outside);
  });
  console.log('boulder-label ok');
}finally{
  await browser.close();
  server.close();
}
