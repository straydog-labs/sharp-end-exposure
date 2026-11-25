import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { startStaticServer, launchChromium, withPage, waitForScreen, postsTo, USER_ID } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index343'/.test(index));
assert.ok(/APP_VERSION = 'index343'/.test(sw));
assert.ok(/Tap to cycle: sent, failed, clear\./.test(index));
assert.ok(!/toggleWkBoulder/.test(index.slice(index.indexOf('function wkRenderCircuitBody'), index.indexOf('function wkRenderCheckBody'))));

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function stub(){
  return async function(route, info){
    var url = info.url;
    if(url.indexOf('/rest/v1/training_session_drafts') !== -1) return false;
    if(info.method === 'POST' && url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: (info.body && info.body.id) || 'sess-emom' }, info.body || {})]);
      return true;
    }
    return false;
  };
}

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
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

function seed(){
  trainSessionState = newTrainSessionState('Boulders', 'EMOM results', '', { session_running: true });
  trainSessionState.blocks = [
    {
      id: 'emom-1', shape: 'emom', title: 'EMOM', complete: false, attempts: [],
      rounds: [{
        boulders: [
          { id: 'bo-1', text: 'Orange', complete: false },
          { id: 'bo-2', text: 'Green', complete: false }
        ],
        notes: '', rest_after_sec: 60, complete: false
      }]
    },
    {
      id: 'chk-1', shape: 'check', title: 'Warm up', complete: false, attempts: [],
      items: [{ id: 'item-1', text: 'shoulders', complete: false }]
    },
    {
      id: 'circ-1', shape: 'circuit', title: 'Strength', complete: false, attempts: [],
      rounds: 1, round_complete: [false],
      exercises: [{ name: 'Squat', weight: '20kg', reps: '8' }]
    }
  ];
  trainSessionState.blocks.forEach(function(b){ normalizeWkBlock(b); });
  showScreen('screen-train-session');
  renderTrainSessionBuilder();
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(seed);
    await waitForScreen(page, 'screen-train-session');

    var hint = await page.locator('#train-blocks-wrap .wk-sent-hint').innerText();
    assert.strictEqual(hint, 'Tap to cycle: sent, failed, clear.');
    assert.strictEqual(await page.locator('#train-sess-progress-label').innerText(), '0 of 3 blocks complete');

    var hit = page.locator('#train-blocks-wrap .wk-boulder').first();
    async function boulder(){
      return page.evaluate(function(){
        var bo = trainSessionState.blocks[0].rounds[0].boulders[0];
        var el = document.querySelector('#train-blocks-wrap .wk-boulder');
        return {
          result: bo.result === undefined ? 'missing' : bo.result,
          complete: !!bo.complete,
          cls: el.className,
          aria: el.getAttribute('aria-label') || '',
          strip: document.getElementById('train-sess-progress-label').textContent
        };
      });
    }
    await hit.click();
    var sent = await boulder();
    assert.strictEqual(sent.result, 'sent');
    assert.strictEqual(sent.complete, true);
    assert.ok(/is-on/.test(sent.cls), sent.cls);
    assert.ok(/sent/.test(sent.aria), sent.aria);
    assert.strictEqual(sent.strip, '0 of 3 blocks complete');
    await hit.click();
    var failed = await boulder();
    assert.strictEqual(failed.result, 'failed');
    assert.strictEqual(failed.complete, false);
    assert.ok(/is-failed/.test(failed.cls), failed.cls);
    assert.ok(/failed/.test(failed.aria), failed.aria);
    assert.ok(!/is-on/.test(failed.cls), failed.cls);
    assert.strictEqual(failed.strip, '0 of 3 blocks complete');
    await hit.click();
    var clear = await boulder();
    assert.strictEqual(clear.result, null);
    assert.strictEqual(clear.complete, false);
    assert.ok(!/is-failed/.test(clear.cls) && !/is-on/.test(clear.cls), clear.cls);
    assert.ok(/unmarked/.test(clear.aria), clear.aria);
    assert.strictEqual(clear.strip, '0 of 3 blocks complete');

    await page.locator('.train-emom-round .train-section-complete').first().click();
    var marked = await page.evaluate(function(){
      var round = trainSessionState.blocks[0].rounds[0];
      return {
        round: !!round.complete,
        block: !!trainSessionState.blocks[0].complete,
        results: round.boulders.map(function(bo){ return bo.result === undefined ? 'missing' : bo.result; }),
        completes: round.boulders.map(function(bo){ return !!bo.complete; }),
        strip: document.getElementById('train-sess-progress-label').textContent
      };
    });
    assert.strictEqual(marked.round, true);
    assert.deepStrictEqual(marked.results, [null, null]);
    assert.deepStrictEqual(marked.completes, [false, false]);
    assert.strictEqual(marked.strip, '1 of 3 blocks complete');

    await page.evaluate(function(){
      document.querySelector('.train-block-card[data-block-id="chk-1"] .wk-blk-actions .train-section-complete').click();
    });
    var check = await page.evaluate(function(){
      var b = trainSessionState.blocks[1];
      return { block: !!b.complete, item: !!b.items[0].complete };
    });
    assert.strictEqual(check.item, true, 'check Mark complete still ticks its items');
    assert.strictEqual(check.block, true);

    await page.locator('#train-blocks-wrap .wk-circuit-round').first().click();
    var circuit = await page.evaluate(function(){
      var b = trainSessionState.blocks[2];
      return { round: !!b.round_complete[0], result: b.exercises[0].result };
    });
    assert.strictEqual(circuit.round, true);
    assert.strictEqual(circuit.result, undefined);

    await page.evaluate(function(){
      var round = trainSessionState.blocks[0].rounds[0];
      round.boulders = [
        { id: 'leg-sent', text: 'Legacy sent', complete: true },
        { id: 'leg-open', text: 'Legacy open', complete: false },
        { id: 'leg-fail', text: 'Legacy fail', complete: true, result: 'failed' }
      ];
      normalizeWkBlock(trainSessionState.blocks[0]);
      renderTrainSessionBuilder();
    });
    var legacy = await page.evaluate(function(){
      var bos = trainSessionState.blocks[0].rounds[0].boulders;
      var detail = renderTrainSessionBlockDetailHtml(trainSessionState.blocks[0], 1);
      return {
        results: bos.map(function(bo){ return bo.result; }),
        completes: bos.map(function(bo){ return !!bo.complete; }),
        detail: detail
      };
    });
    assert.deepStrictEqual(legacy.results, ['sent', null, 'failed']);
    assert.deepStrictEqual(legacy.completes, [true, false, false]);
    assert.ok(legacy.detail.indexOf('Legacy sent') !== -1 && /Legacy sent · sent/.test(legacy.detail));
    assert.ok(/Legacy fail · failed/.test(legacy.detail));
    assert.ok(!/Legacy fail · sent/.test(legacy.detail));
    assert.ok(!/Legacy open · sent/.test(legacy.detail) && !/Legacy open · failed/.test(legacy.detail));

    await page.locator('#train-sess-save').click();
    await waitForScreen(page, 'screen-train-done');
    var saved = postsTo(recorded, 'training_sessions', 'POST').filter(function(r){
      return r.url.indexOf('training_session_drafts') === -1;
    });
    assert.ok(saved.length, 'Finish posts the session');
    var body = saved[saved.length - 1].body;
    var savedBos = body.blocks[0].rounds[0].boulders;
    assert.deepStrictEqual(savedBos.map(function(bo){ return bo.result; }), ['sent', null, 'failed']);
    assert.ok(/1 sent/.test(await page.locator('#train-done-meta').innerText()));
    assert.ok(/1 failed/.test(await page.locator('#train-done-meta').innerText()));

    await page.evaluate(function(userId){
      trainSessionState = newTrainSessionState('Boulders', 'Draft results', '', { session_running: true });
      trainSessionState.blocks = [{
        id: 'emom-d', shape: 'emom', title: 'EMOM', complete: false, attempts: [],
        rounds: [{
          boulders: [{ id: 'bo-d', text: 'Red', complete: false, result: 'failed' }],
          notes: '', rest_after_sec: 60, complete: false
        }]
      }];
      showScreen('screen-train-session');
      writeTrainUserDraft(true);
      var raw = localStorage.getItem('see_train_draft_' + userId);
      trainSessionState = null;
      resumeTrainDraft();
      return raw;
    }, USER_ID);
    var restored = await page.evaluate(function(userId){
      var raw = localStorage.getItem('see_train_draft_' + userId);
      var bo = trainSessionState.blocks[0].rounds[0].boulders[0];
      return { raw: raw, result: bo.result, complete: !!bo.complete };
    }, USER_ID);
    assert.ok(restored.raw.indexOf('"result":"failed"') !== -1, 'draft payload keeps result');
    assert.strictEqual(restored.result, 'failed');
    assert.strictEqual(restored.complete, false);
  });
  console.log('emom-boulder-results ok');
}finally{
  await browser.close();
  server.close();
}
