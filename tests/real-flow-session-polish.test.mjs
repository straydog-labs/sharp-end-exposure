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

function seedEmom(){
  trainSessionState = newTrainSessionState('Boulders', 'Polish', '', { session_running: true });
  trainSessionState.blocks = [{
    id: 'emom-1', shape: 'emom', title: 'EMOM', complete: false, attempts: [],
    rounds: [{
      boulders: [{ id: 'bo-1', text: 'Orange', complete: false }],
      notes: '', rest_after_sec: 60, complete: false
    }]
  }];
  normalizeWkBlock(trainSessionState.blocks[0]);
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
    await page.evaluate(seedEmom);
    await waitForScreen(page, 'screen-train-session');

    var place = await page.evaluate(function(){
      var btn = document.getElementById('train-sess-discard');
      var header = document.querySelector('#screen-train-session .page-header');
      var save = document.getElementById('train-sess-save-progress');
      var finish = document.getElementById('train-sess-save');
      return {
        inHeader: !!(header && btn && header.contains(btn)),
        sameRow: !!(btn && save && finish && btn.parentElement === save.parentElement && btn.parentElement === finish.parentElement),
        secondary: btn ? btn.className : ''
      };
    });
    assert.strictEqual(place.inHeader, false);
    assert.strictEqual(place.sameRow, true);
    assert.ok(/train-btn-secondary/.test(place.secondary), place.secondary);

    await page.click('#tb-emom-1-r0-note-add');
    await page.fill('#tb-emom-1-r0-note', 'quiet feet');
    await page.evaluate(function(userId){
      collectTrainBlockFields();
      writeTrainUserDraft(true);
      var raw = localStorage.getItem('see_train_draft_' + userId);
      trainSessionState = null;
      resumeTrainDraft();
      return raw;
    }, USER_ID);
    var noted = await page.evaluate(function(userId){
      var raw = localStorage.getItem('see_train_draft_' + userId);
      var round = trainSessionState.blocks[0].rounds[0];
      var detail = renderTrainSessionBlockDetailHtml(trainSessionState.blocks[0], 1);
      return { raw: raw, note: round.note, detail: detail };
    }, USER_ID);
    assert.strictEqual(noted.note, 'quiet feet');
    assert.ok(noted.raw.indexOf('"note":"quiet feet"') !== -1, 'draft payload keeps round.note');
    assert.ok(noted.detail.indexOf('quiet feet') !== -1, 'history detail shows the round note');

    await page.evaluate(seedEmom);
    await page.click('[data-notice-link="emom-1"]');
    await page.click('.wk-notice-chip[data-notice-att="4"]');
    await page.fill('#tb-emom-1-notice', 'held the breath');
    await page.click('[data-notice-save="emom-1"]');
    // Save collapses the card to one summary line with an Edit link - no
    // separate "Edit note" link/preview duplicating the same text (A2).
    var collapsed = await page.evaluate(function(){
      var summary = document.querySelector('[data-notice="emom-1"] .wk-notice-summary');
      var edit = document.querySelector('[data-notice="emom-1"] .wk-notice-edit');
      var card = document.querySelector('[data-notice="emom-1"].wk-notice-card');
      return { summary: summary ? summary.textContent : '', editLabel: edit ? edit.textContent : '', cardStillOpen: !!card };
    });
    assert.strictEqual(collapsed.cardStillOpen, false);
    assert.strictEqual(collapsed.editLabel, 'Edit');
    assert.ok(/Present 4\/5/.test(collapsed.summary), collapsed.summary);
    assert.ok(/held the breath/.test(collapsed.summary), collapsed.summary);

    await page.click('[data-notice-link="emom-1"]');
    var reopened = await page.evaluate(function(){
      var ta = document.getElementById('tb-emom-1-notice');
      var selected = document.querySelector('[data-notice="emom-1"] .wk-notice-chip.selected');
      return { note: ta ? ta.value : '', att: selected ? selected.getAttribute('data-notice-att') : null };
    });
    assert.strictEqual(reopened.note, 'held the breath');
    assert.strictEqual(reopened.att, '4');

    await page.click('#train-sess-discard');
    await page.click('#train-discard-do');
    await waitForScreen(page, 'screen-home');

    await page.evaluate(function(userId){
      var env = {
        v: 1,
        saved_at: new Date().toISOString(),
        user_id: userId,
        screen: 'screen-train-session',
        state: { id: 'draft-1', title: 'In progress', started_at: new Date().toISOString(), blocks: [] }
      };
      localStorage.setItem('see_train_draft_' + userId, JSON.stringify(env));
      paintTrainDraftCards();
      paintHomePrompt({ state: 's6-train', cta: 'start-train' });
    }, USER_ID);
    var withDraft = await page.evaluate(function(){
      var card = document.getElementById('home-today-card');
      var draft = document.getElementById('home-train-draft-card');
      return {
        todayHidden: !card || card.hidden,
        today: card ? card.textContent : '',
        draftHidden: !draft || draft.hidden,
        draftTitle: (document.getElementById('home-train-draft-title') || {}).textContent || ''
      };
    });
    assert.strictEqual(withDraft.todayHidden, true);
    assert.ok(!/Keep training/.test(withDraft.today));
    assert.strictEqual(withDraft.draftHidden, false);
    assert.strictEqual(withDraft.draftTitle, 'In progress');

    await page.evaluate(function(userId){
      localStorage.removeItem('see_train_draft_' + userId);
      paintTrainDraftCards();
      paintHomePrompt({ state: 's6-train', cta: 'start-train' });
    }, USER_ID);
    var noDraft = await page.evaluate(function(){
      var card = document.getElementById('home-today-card');
      return { hidden: !card || card.hidden, text: card ? card.textContent : '' };
    });
    assert.strictEqual(noDraft.hidden, false);
    assert.ok(/Keep training/.test(noDraft.text), noDraft.text);
  });
  console.log('session-polish ok');
}finally{
  await browser.close();
  server.close();
}
