import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { startStaticServer, launchChromium, withPage, USER_ID, waitForScreen } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const htmlVer = (index.match(/var app_version = '([^']+)'/) || [])[1];
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(htmlVer, 'app_version pin');
assert.ok(new RegExp("APP_VERSION = '" + htmlVer + "'").test(sw));

async function boot(page, keepDraft){
  await page.waitForFunction(function(){
    return typeof window.trainAddBlock === 'function' && typeof window.isWkOn === 'function' && window.isWkOn();
  }, null, { timeout: 30000 });
  await page.evaluate(function(args){
    window._authUser = { id: args.userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window._hasRoutedAfterSignIn = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window.loadTrainHub = function(){ return Promise.resolve(); };
    window.routeSignedInHome = function(){ try{ paintTrainDraftCards(); }catch(e){} };
    if(!args.keepDraft){
      try{ localStorage.removeItem('see_train_draft_' + args.userId); }catch(e){}
      try{ localStorage.removeItem('see_train_session_draft'); }catch(e){}
    }
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, { userId: USER_ID, keepDraft: !!keepDraft });
}

function reps(n){
  var out = [];
  var i;
  for(i = 0; i < n; i++) out.push({ ok: null });
  return out;
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await boot(page);
    var hbId = await page.evaluate(function(blank){
      trainSessionState = newTrainSessionState('Hangboard', 'Inline hangs', '', { session_running: true });
      trainSessionState.session_running = true;
      trainSessionState.blocks = [];
      var b = newTrainBlock('rep_pass_fail');
      b.title = 'Repeaters';
      b.grip = '';
      b.assistance = '';
      b.sets = [
        { grip: 'Half crimp', load: '35 lb assist', rest_after_sec: 180, reps: blank },
        { grip: 'Half crimp', load: '35 lb assist', rest_after_sec: 180, reps: blank.map(function(){ return { ok: null }; }) }
      ];
      var rest = newTrainBlock('rest');
      rest.title = 'Rest';
      rest.complete = false;
      trainSessionState.blocks = [b, rest];
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
      return b.id;
    }, reps(2));

    var before = await page.evaluate(function(id){
      var card = document.querySelector('[data-block-id="' + id + '"]');
      var row = card.querySelector('[data-hang-compact="1"]');
      var edit = card.querySelector('[data-hang-edit-sets]');
      return {
        editPressed: edit ? edit.getAttribute('aria-pressed') : '',
        compact: card.querySelectorAll('[data-hang-compact]').length,
        inline: row ? row.querySelectorAll('[data-hang-rep]').length : 0,
        editorReps: card.querySelectorAll('[data-hang-set] [data-hang-rep]').length,
        strip: (document.getElementById('train-sess-progress-label') || {}).textContent || ''
      };
    }, hbId);
    assert.strictEqual(before.editPressed, 'false', 'ticks are available without opening Edit sets');
    assert.strictEqual(before.compact, 2);
    assert.strictEqual(before.inline, 2, 'each compact row has one button per rep');
    assert.strictEqual(before.editorReps, 0);
    assert.strictEqual(before.strip.trim(), '0 of 2 blocks complete');

    await page.click('[data-hang-compact="1"] [data-hang-rep]');
    var ticked = await page.evaluate(function(id){
      var card = document.querySelector('[data-block-id="' + id + '"]');
      var btn = card.querySelector('[data-hang-compact="1"] [data-hang-rep]');
      var b = trainSessionState.blocks[0];
      return {
        attr: btn ? btn.getAttribute('data-hang-rep') : '',
        ok: b.sets[0].reps[0].ok,
        editPressed: card.querySelector('[data-hang-edit-sets]').getAttribute('aria-pressed')
      };
    }, hbId);
    assert.strictEqual(ticked.editPressed, 'false', 'ticking does not open Edit sets');
    assert.strictEqual(ticked.attr, 'pass');
    assert.strictEqual(ticked.ok, true);

    await page.click('[data-hang-compact="1"] [data-hang-rep="untested"]');
    await page.click('[data-hang-compact="2"] [data-hang-rep="untested"]');
    await page.click('[data-hang-compact="2"] [data-hang-rep="untested"]');
    var done = await page.evaluate(function(id){
      var card = document.querySelector('[data-block-id="' + id + '"]');
      var b = trainSessionState.blocks[0];
      return {
        complete: trainBlockIsComplete(b),
        marked: trainHangboardAllRepsMarked(b),
        header: card.querySelector('.train-section-complete').textContent.trim(),
        strip: document.getElementById('train-sess-progress-label').textContent.trim()
      };
    }, hbId);
    assert.strictEqual(done.marked, true);
    assert.strictEqual(done.complete, true, 'inline ticks complete the block');
    assert.strictEqual(done.header, 'Complete');
    assert.strictEqual(done.strip, '1 of 2 blocks complete');

    await page.waitForFunction(function(userId){
      var raw = localStorage.getItem('see_train_draft_' + userId);
      if(!raw) return false;
      var env = JSON.parse(raw);
      var b = env && env.state && env.state.blocks && env.state.blocks[0];
      return !!(b && b.sets && b.sets[0].reps[0].ok === true && b.sets[1].reps[1].ok === true);
    }, USER_ID, { timeout: 4000 });

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await boot(page, true);
    await page.evaluate(function(){ showScreen('screen-home'); paintTrainDraftCards(); });
    await page.waitForFunction(function(){
      var card = document.getElementById('home-train-draft-card');
      return card && !card.hidden;
    }, null, { timeout: 8000 });
    await page.click('#home-train-draft-card .train-draft-resume');
    await waitForScreen(page, 'screen-train-session');
    var restored = await page.evaluate(function(){
      var b = trainSessionState.blocks[0];
      var card = document.querySelector('[data-block-id="' + b.id + '"]');
      return {
        ok0: b.sets[0].reps[0].ok,
        ok3: b.sets[1].reps[1].ok,
        attr: card.querySelector('[data-hang-compact="1"] [data-hang-rep]').getAttribute('data-hang-rep'),
        strip: document.getElementById('train-sess-progress-label').textContent.trim(),
        complete: trainBlockIsComplete(b)
      };
    });
    assert.strictEqual(restored.ok0, true, 'draft restores the ticked rep');
    assert.strictEqual(restored.ok3, true);
    assert.strictEqual(restored.attr, 'pass');
    assert.strictEqual(restored.complete, true);
    assert.strictEqual(restored.strip, '1 of 2 blocks complete');

    await page.click('[data-hang-edit-sets]');
    var editor = await page.evaluate(function(){
      var b = trainSessionState.blocks[0];
      var card = document.querySelector('[data-block-id="' + b.id + '"]');
      return {
        compact: card.querySelectorAll('[data-hang-compact]').length,
        ticksInEditor: card.querySelectorAll('[data-hang-set] [data-hang-rep]').length,
        grip: (document.getElementById('tb-' + b.id + '-s0-grip') || {}).value || '',
        loadId: 'tb-' + b.id + '-s0-load',
        restId: 'tb-' + b.id + '-s0-rest'
      };
    });
    assert.strictEqual(editor.compact, 0, 'Edit sets hides compact rows');
    assert.strictEqual(editor.ticksInEditor, 0, 'Edit sets does not host the rep ticks');
    assert.strictEqual(editor.grip, 'Half crimp');
    await page.fill('#' + editor.loadId, '40 lb assist');
    await page.selectOption('#' + editor.restId + '-u', 'sec');
    await page.fill('#' + editor.restId, '90');
    await page.locator('[data-hang-set="1"] button', { hasText: '+ Rep' }).click();
    var edited = await page.evaluate(function(){
      var b = trainSessionState.blocks[0];
      return {
        load: b.sets[0].load,
        rest: b.sets[0].rest_after_sec,
        reps: b.sets[0].reps.length
      };
    });
    assert.strictEqual(edited.load, '40 lb assist');
    assert.strictEqual(Number(edited.rest), 90);
    assert.strictEqual(edited.reps, 3, 'Edit sets still changes the rep count');
  });
}finally{
  server.close();
  await browser.close();
}
console.log('hangboard-inline-rep-ticks ok');
