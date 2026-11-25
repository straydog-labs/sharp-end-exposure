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
assert.ok(/var app_version = 'index344'/.test(index));
assert.ok(/APP_VERSION = 'index344'/.test(sw));

function fulfillJson(route, status, body){
  return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) });
}

function draftStub(store){
  return async function(route, info){
    if(info.url.indexOf('/rest/v1/training_session_drafts') !== -1){
      if(info.method === 'POST' || info.method === 'PATCH'){
        store.draft = info.body;
        await fulfillJson(route, info.method === 'PATCH' ? 200 : 201, []);
        return true;
      }
    }
    if(info.method === 'PATCH' && info.url.indexOf('/rest/v1/assignments') !== -1){
      store.assignmentPatches = (store.assignmentPatches || 0) + 1;
      await fulfillJson(route, 200, [info.body || {}]);
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
    try{ localStorage.removeItem('see_train_draft_' + userId); }catch(e){}
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

function seed(sourceMeta){
  trainSessionState = newTrainSessionState('Boulders', 'Delete test', '', sourceMeta || { session_running: true });
  trainSessionState.blocks = [];
  trainAddBlock('emom');
  trainAddBlock('circuit');
  trainAddBlock('rep_pass_fail');
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
    stub: draftStub({})
  }, async function(page, recorded){
    await boot(page);

    // --- Repro: empty/blank-session blocks already remove fine (a, b, c, e) ---
    await page.evaluate(seed);
    await waitForScreen(page, 'screen-train-session');
    var ids = await page.evaluate(function(){ return trainSessionState.blocks.map(function(b){ return b.id; }); });

    // --- Repro (d): a COLLAPSED block has no Remove control at all today ---
    // (the fix: Remove must still render in the collapsed summary)
    await page.click('[data-wk-toggle="' + ids[0] + '"]'); // collapse block 1
    var collapsedHasRemove = await page.evaluate(function(id){
      var card = document.querySelector('[data-block-id="' + id + '"]');
      return !!(card && card.querySelector('.train-block-remove'));
    }, ids[0]);
    assert.strictEqual(collapsedHasRemove, true, 'collapsed block keeps a working Remove control');

    // Empty block (no ticks/marks yet): deletes immediately, no confirm dialog.
    await page.click('[data-block-id="' + ids[0] + '"] .train-block-remove');
    var afterEmptyDelete = await page.evaluate(function(){
      return {
        count: trainSessionState.blocks.length,
        confirmHidden: document.getElementById('train-block-delete-confirm').hidden
      };
    });
    assert.strictEqual(afterEmptyDelete.count, 2, 'empty block removed immediately');
    assert.strictEqual(afterEmptyDelete.confirmHidden, true, 'no confirm needed for an empty block');

    // Renumbering: with block 1 gone, the remaining two shift down to
    // Block 1 and Block 2.
    var kickers = await page.evaluate(function(){
      return Array.prototype.map.call(document.querySelectorAll('#train-blocks-wrap .train-block-kicker'), function(el){
        return el.textContent;
      });
    });
    assert.deepStrictEqual(kickers, ['Block 1 · ', 'Block 2 · '], 'remaining blocks renumber after delete');

    // --- Block with marks: confirm dialog, Keep leaves it intact ---
    await page.evaluate(function(id){
      var b = trainSessionState.blocks.find(function(x){ return x.id === id; });
      toggleWkCircuitRound(b.id, 0);
    }, ids[1]);
    await page.click('[data-block-id="' + ids[1] + '"] .train-block-remove');
    var confirmShown = await page.evaluate(function(){
      return {
        hidden: document.getElementById('train-block-delete-confirm').hidden,
        text: document.querySelector('#train-block-delete-confirm .train-draft-choice-panel').textContent,
        count: trainSessionState.blocks.length
      };
    });
    assert.strictEqual(confirmShown.hidden, false, 'a block with marks shows the confirm dialog');
    assert.ok(/Delete this block\? Its marks will be lost\./.test(confirmShown.text), confirmShown.text);
    assert.strictEqual(confirmShown.count, 2, 'not removed yet');

    await page.click('#train-block-delete-keep');
    var afterKeep = await page.evaluate(function(){
      return {
        count: trainSessionState.blocks.length,
        hidden: document.getElementById('train-block-delete-confirm').hidden
      };
    });
    assert.strictEqual(afterKeep.count, 2, 'Keep leaves the block intact');
    assert.strictEqual(afterKeep.hidden, true);

    // Delete confirmed: block is removed, draft (local + server) updates.
    await page.click('[data-block-id="' + ids[1] + '"] .train-block-remove');
    await page.click('#train-block-delete-do');
    await page.waitForTimeout(700);
    var afterDelete = await page.evaluate(function(userId){
      var raw = localStorage.getItem('see_train_draft_' + userId);
      var env = raw ? JSON.parse(raw) : null;
      return {
        count: trainSessionState.blocks.length,
        draftBlockCount: env && env.state && env.state.blocks ? env.state.blocks.length : -1
      };
    }, USER_ID);
    assert.strictEqual(afterDelete.count, 1, 'confirmed delete removes the block');
    assert.strictEqual(afterDelete.draftBlockCount, 1, 'local draft reflects the delete');
    assert.ok(recorded.some(function(r){
      return (r.method === 'POST' || r.method === 'PATCH') && r.url.indexOf('/rest/v1/training_session_drafts') !== -1;
    }), 'server draft updated too');

    assert.strictEqual((recorded.filter(function(r){ return r.method !== 'GET' && r.url.indexOf('/rest/v1/assignments') !== -1; })).length, 0,
      'deleting a block never touches the assignment');
  });

  // --- Case (a): an assigned session - delete is this athlete's session only ---
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: draftStub({})
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(seed, { source_assignment_id: 'asg-del-1', session_running: true });
    await waitForScreen(page, 'screen-train-session');
    var id = await page.evaluate(function(){ return trainSessionState.blocks[0].id; });
    await page.click('[data-block-id="' + id + '"] .train-block-remove');
    var removed = await page.evaluate(function(){ return trainSessionState.blocks.length; });
    assert.strictEqual(removed, 2, 'block removed from an assigned session too');
    var assignmentId = await page.evaluate(function(){ return trainSessionState.source_assignment_id; });
    assert.strictEqual(assignmentId, 'asg-del-1', 'the assignment link itself is untouched');
    assert.strictEqual(recorded.filter(function(r){ return r.method !== 'GET' && r.url.indexOf('/rest/v1/assignments') !== -1; }).length, 0,
      'no write to assignments from deleting a block');
  });

  console.log('real-flow-delete-block: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
