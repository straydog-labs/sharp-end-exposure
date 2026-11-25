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

function fulfillJson(route, status, body){
  return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) });
}

function trainSessionStub(store){
  store.patches = store.patches || [];
  return async function(route, info){
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      var row = Object.assign({ id: 'sess-polish-1' }, info.body || {});
      store.saved = row;
      await fulfillJson(route, 201, [row]);
      return true;
    }
    if(info.method === 'PATCH' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      store.patches.push(info.body);
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

function seedBlocks(){
  trainSessionState = newTrainSessionState('Boulders', 'Polish', '', { session_running: true });
  trainSessionState.blocks = [];
  trainAddBlock('emom');
  trainAddBlock('rep_pass_fail');
  trainAddBlock('circuit');
  var circuit = trainSessionState.blocks[2];
  circuit.exercises = [{ name: 'Back squat', weight: '', reps: '' }];
  showScreen('screen-train-session');
  renderTrainSessionBuilder();
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  // ── A1: Strength (and EMOM/Hangboard) block input rows never overflow ──
  await withPage(browser, port, {
    path: '/index.html',
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await boot(page);
    await page.evaluate(seedBlocks);
    await waitForScreen(page, 'screen-train-session');

    var viewports = [
      { width: 390, height: 667 },
      { width: 390, height: 844 },
      { width: 360, height: 740 }
    ];
    for(var i = 0; i < viewports.length; i++){
      await page.setViewportSize(viewports[i]);
      var res = await page.evaluate(function(){
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth
        };
      });
      assert.ok(res.scrollWidth <= res.innerWidth + 1,
        'no horizontal page scroll at ' + viewports[i].width + 'x' + viewports[i].height
        + ' (scrollWidth=' + res.scrollWidth + ' innerWidth=' + res.innerWidth + ')');

      var rows = await page.evaluate(function(){
        var out = [];
        document.querySelectorAll('.screen.active [data-block-id]').forEach(function(card){
          var cardBox = card.getBoundingClientRect();
          card.querySelectorAll('input').forEach(function(inp){
            var box = inp.getBoundingClientRect();
            out.push({ right: box.right, cardRight: cardBox.right, left: box.left, width: box.width });
          });
        });
        return out;
      });
      assert.ok(rows.length > 0, 'found input rows to check');
      rows.forEach(function(r){
        assert.ok(r.right <= r.cardRight + 1, 'input stays inside the card box ' + JSON.stringify(r));
        assert.ok(r.width > 0, 'input is not collapsed to zero width ' + JSON.stringify(r));
      });
    }
  });

  // ── A2: unified "What did you notice?" card (Save/Skip, one summary line) ──
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Notice polish', '', { session_running: true });
      trainAddBlock('emom');
      var emom = trainSessionState.blocks[0];
      emom.rounds[0].boulders = [{ id: uid(), text: 'V3 blue', complete: true, result: 'sent' }];
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
    });
    await waitForScreen(page, 'screen-train-session');
    var id = await page.evaluate(function(){ return trainSessionState.blocks[0].id; });

    // Save with scale + text collapses to one line, with an Edit link (no
    // duplicate "Edit note" link + separate preview).
    await page.click('[data-notice-link="' + id + '"]');
    await page.click('[data-notice="' + id + '"] .wk-notice-chip[data-notice-att="3"]');
    await page.fill('#tb-' + id + '-notice', 'Felt tightness in left shoulder');
    await page.click('[data-notice-save="' + id + '"]');
    var saved = await page.evaluate(function(bid){
      return {
        cardOpen: !!document.querySelector('[data-notice="' + bid + '"].wk-notice-card'),
        summary: (document.querySelector('[data-notice="' + bid + '"] .wk-notice-summary') || {}).textContent || '',
        editLabel: (document.querySelector('[data-notice="' + bid + '"] .wk-notice-edit') || {}).textContent || '',
        extraPreview: !!document.querySelector('[data-notice-preview="' + bid + '"]')
      };
    }, id);
    assert.strictEqual(saved.cardOpen, false, 'card collapses after Save');
    assert.ok(/^Present 3\/5 - Felt tightness/.test(saved.summary), saved.summary);
    assert.strictEqual(saved.editLabel, 'Edit');
    assert.strictEqual(saved.extraPreview, false, 'no second, duplicate preview element');

    // Edit reopens prefilled, with the question/title shown exactly once.
    await page.click('[data-notice-link="' + id + '"]');
    var reopened = await page.evaluate(function(bid){
      var card = document.querySelector('[data-notice="' + bid + '"].wk-notice-card');
      return {
        note: (document.getElementById('tb-' + bid + '-notice') || {}).value || '',
        att: (card.querySelector('.wk-notice-chip.selected') || {}).getAttribute('data-notice-att'),
        titleCount: card.querySelectorAll('.wk-notice-title').length,
        questionCount: card.querySelectorAll('.wk-notice-q').length
      };
    }, id);
    assert.strictEqual(reopened.note, 'Felt tightness in left shoulder');
    assert.strictEqual(reopened.att, '3');
    assert.strictEqual(reopened.titleCount, 1, 'no duplicate title label');
    assert.strictEqual(reopened.questionCount, 1, 'no duplicate question label');

    // Skip clears any entered data and collapses with nothing shown.
    await page.click('[data-notice="' + id + '"] .wk-notice-chip[data-notice-att="5"]');
    await page.fill('#tb-' + id + '-notice', 'should not persist');
    await page.click('[data-notice-skip="' + id + '"]');
    var skipped = await page.evaluate(function(bid){
      var b = trainSessionState.blocks.find(function(x){ return x.id === bid; });
      return { notice: b.notice, anyCardOrCollapsed: !!document.querySelector('[data-notice="' + bid + '"]') };
    }, id);
    assert.strictEqual(skipped.notice, null, 'Skip discards any entered scale/note');
    assert.strictEqual(skipped.anyCardOrCollapsed, false, 'Skip collapses with no data shown');

    // Save with nothing entered behaves exactly like Skip.
    await page.click('[data-notice-link="' + id + '"]');
    await page.click('[data-notice-save="' + id + '"]');
    var emptySave = await page.evaluate(function(bid){
      var b = trainSessionState.blocks.find(function(x){ return x.id === bid; });
      return { notice: b.notice, anyCardOrCollapsed: !!document.querySelector('[data-notice="' + bid + '"]') };
    }, id);
    assert.strictEqual(emptySave.notice, null, 'empty Save behaves as Skip');
    assert.strictEqual(emptySave.anyCardOrCollapsed, false);
  });

  // ── A3: Session logged screen reflection persists ──
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: trainSessionStub({})
  }, async function(page, recorded){
    await boot(page);
    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'A3 session', '', { session_running: true });
      trainAddBlock('emom');
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
    });
    await waitForScreen(page, 'screen-train-session');
    await page.evaluate(function(){ return saveTrainSession(); });
    await waitForScreen(page, 'screen-train-done');

    await page.click('[data-done-att="4"]');
    await page.fill('#train-done-notice-note', 'Quad burn on the last set');
    await page.click('#train-done-notice-save');
    await page.waitForFunction(function(){
      var el = document.getElementById('train-done-notice-collapsed');
      return !!(el && !el.hidden);
    }, null, { timeout: 4000 });

    var patched = recorded.filter(function(r){
      return r.method === 'PATCH' && r.url.indexOf('/rest/v1/training_sessions') !== -1;
    });
    assert.ok(patched.length >= 1, 'Save PATCHes the just-saved training session');
    var notes = patched[patched.length - 1].body.notes || '';
    assert.ok(/How present were you: 4/.test(notes), notes);
    assert.ok(/Quad burn on the last set/.test(notes), notes);

    // Unsaved input is written before leaving by a route other than the
    // screen's own Log another session / Train buttons (A3.3).
    await page.evaluate(function(){ populateTrainDoneScreen({ title: 'A3 session 2' }, true); });
    await page.fill('#train-done-notice-note', 'typed but never saved');
    await page.evaluate(function(){ showScreen('screen-home'); });
    await page.waitForTimeout(300);
    var afterNav = recorded.filter(function(r){
      return r.method === 'PATCH' && r.url.indexOf('/rest/v1/training_sessions') !== -1;
    });
    var lastNotes = afterNav[afterNav.length - 1].body.notes || '';
    assert.ok(/typed but never saved/.test(lastNotes), 'navigating Home still saves the typed reflection: ' + lastNotes);
  });

  // ── A4: generic Attempts control removed from self-tracking block types ──
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await boot(page);
    await page.evaluate(seedBlocks);
    await waitForScreen(page, 'screen-train-session');
    var controls = await page.evaluate(function(){
      var out = {};
      trainSessionState.blocks.forEach(function(b){
        var card = document.querySelector('[data-block-id="' + b.id + '"]');
        out[b.shape] = !!(card && card.querySelector('.train-attempt-btn'));
      });
      return out;
    });
    assert.strictEqual(controls.emom, false, 'EMOM has no + Attempt control');
    assert.strictEqual(controls.rep_pass_fail, false, 'Hangboard has no + Attempt control');
    assert.strictEqual(controls.circuit, false, 'Strength has no + Attempt control');

    // A block type without its own tracking (interval) keeps the control.
    var interval = await page.evaluate(function(){
      trainAddBlock('interval');
      renderTrainSessionBuilder();
      var b = trainSessionState.blocks[trainSessionState.blocks.length - 1];
      var card = document.querySelector('[data-block-id="' + b.id + '"]');
      return { hasBtn: !!(card && card.querySelector('.train-attempt-btn')), id: b.id };
    });
    assert.strictEqual(interval.hasBtn, true, 'interval (no self-tracking) keeps + Attempt');

    // A saved block with attempts > 0 still shows the count, read-only.
    var readOnly = await page.evaluate(function(){
      var emom = trainSessionState.blocks[0];
      emom.attempts = [{ at: new Date().toISOString(), note: 'attempt 1' }];
      renderTrainSessionBuilder();
      var card = document.querySelector('[data-block-id="' + emom.id + '"]');
      return {
        text: card ? card.textContent : '',
        hasBtn: !!(card && card.querySelector('.train-attempt-btn'))
      };
    });
    assert.ok(/Attempts logged/.test(readOnly.text) && /1/.test(readOnly.text), readOnly.text);
    assert.strictEqual(readOnly.hasBtn, false, 'existing attempts are read-only, no way to add more');
  });

  console.log('real-flow-train-session-polish: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
