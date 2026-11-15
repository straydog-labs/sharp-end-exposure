import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { startStaticServer, launchChromium, withPage, USER_ID, waitForScreen } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index336'/.test(index));
assert.ok(/APP_VERSION = 'index336'/.test(sw));

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
    window.routeSignedInHome = function(){ try{ paintTrainDraftCards(); }catch(e){} };
    if(!args.keepDraft){
      try{ localStorage.removeItem('see_train_draft_' + args.userId); }catch(e){}
    }
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, { userId: USER_ID, keepDraft: !!keepDraft });
}

function six(marks){
  var reps = marks || [null, null, null, null, null, null];
  return reps.map(function(ok){ return { ok: ok }; });
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 346, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await boot(page);
    var hbId = await page.evaluate(function(reps){
      trainSessionState = newTrainSessionState('Hangboard', 'Compact hang', '', { session_running: true });
      trainSessionState.session_running = true;
      trainAddBlock('rep_pass_fail');
      var b = trainSessionState.blocks[0];
      b.title = 'Repeaters';
      b.editing = false;
      b.grip = '';
      b.assistance = '';
      b.on_sec = 7;
      b.off_sec = 3;
      b.sets = [
        { grip: 'Half crimp', load: '35 lb assist', rest_after_sec: 180, reps: reps[0] },
        { grip: 'Half crimp', load: '35 lb assist', rest_after_sec: 180, reps: reps[1] },
        { grip: 'Half crimp', load: '35 lb assist', rest_after_sec: 180, reps: reps[1] },
        { grip: '3-finger drag', load: '45 lb assist', rest_after_sec: 180, reps: reps[1] },
        { grip: '3-finger drag', load: '45 lb assist', rest_after_sec: 180, reps: reps[1] },
        { grip: '3-finger drag', load: '45 lb assist', rest_after_sec: 180, reps: reps[1] }
      ];
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
      return b.id;
    }, [six([true, false, null, null, null, null]), six()]);

    var compact = await page.evaluate(function(id){
      var card = document.querySelector('[data-block-id="' + id + '"]');
      var rows = card ? Array.prototype.slice.call(card.querySelectorAll('[data-hang-compact]')) : [];
      var onoff = card ? card.querySelector('[data-hang-onoff-text]') : null;
      var edit = card ? card.querySelector('[data-hang-edit-sets]') : null;
      return {
        rows: rows.length,
        innerWidth: window.innerWidth,
        lines: rows.map(function(row){
          var box = row.getBoundingClientRect();
          var main = row.querySelector('.wk-hang-compact-main');
          var reps = row.querySelector('.wk-hang-reps');
          var status = row.querySelector('.wk-hang-compact-status');
          var mainBox = main ? main.getBoundingClientRect() : null;
          var repsBox = reps ? reps.getBoundingClientRect() : null;
          var statusBox = status ? status.getBoundingClientRect() : null;
          return {
            text: String(row.textContent || '').replace(/\s+/g, ' ').trim(),
            width: Math.round(box.width),
            height: Math.round(box.height * 100) / 100,
            oneLine: box.height > 0 && box.height <= 90,
            labelAbove: !!(mainBox && repsBox && mainBox.bottom <= repsBox.top + 1),
            labelFull: !!(mainBox && mainBox.width >= box.width - 2),
            statusRight: !!(statusBox && repsBox && statusBox.left >= repsBox.right - 1 && Math.abs(statusBox.top - repsBox.top) < 8)
          };
        }),
        editorRows: card ? card.querySelectorAll('[data-hang-set]').length : 0,
        grip: !!document.getElementById('tb-' + id + '-grip'),
        load: !!document.getElementById('tb-' + id + '-assist'),
        onoff: onoff ? String(onoff.textContent || '').trim() : '',
        pressed: edit ? edit.getAttribute('aria-pressed') : ''
      };
    }, hbId);
    assert.strictEqual(compact.rows, 6, 'compact rows for a 6-set hangboard');
    assert.strictEqual(compact.innerWidth, 346, 'row heights measured at 346px');
    console.log('compact rows at 346px: ' + compact.lines.map(function(line){ return line.width + 'x' + line.height; }).join(', '));
    assert.ok(compact.lines.every(function(line){ return line.oneLine && line.labelAbove && line.labelFull && line.statusRight; }), 'each set is two lines and at most 90px at 346px ' + JSON.stringify(compact.lines));
    assert.ok(compact.lines[0].text.indexOf('180s rest') !== -1, compact.lines[0].text);
    assert.ok(compact.lines[0].text.indexOf('Half crimp') !== -1 && compact.lines[0].text.indexOf('35 lb assist') !== -1, compact.lines[0].text);
    assert.ok(/1 pass/.test(compact.lines[0].text) && /1 fail/.test(compact.lines[0].text), compact.lines[0].text);
    assert.ok(compact.lines[3].text.indexOf('3-finger drag') !== -1 && compact.lines[3].text.indexOf('45 lb assist') !== -1, compact.lines[3].text);
    assert.strictEqual(compact.editorRows, 0, 'editing layout stays collapsed');
    assert.strictEqual(compact.grip, false, 'empty block-level Grip is hidden');
    assert.strictEqual(compact.load, false, 'empty block-level Load is hidden');
    assert.strictEqual(compact.onoff, '7s on / 3s off');
    assert.strictEqual(compact.pressed, 'false');

    await page.click('[data-hang-edit-sets]');
    var open = await page.evaluate(function(id){
      var card = document.querySelector('[data-block-id="' + id + '"]');
      var edit = card.querySelector('[data-hang-edit-sets]');
      return {
        compact: card.querySelectorAll('[data-hang-compact]').length,
        editor: card.querySelectorAll('[data-hang-set]').length,
        grip: !!document.getElementById('tb-' + id + '-grip'),
        load: !!document.getElementById('tb-' + id + '-assist'),
        onoff: (card.querySelector('[data-hang-onoff-text]') || {}).textContent || '',
        pressed: edit ? edit.getAttribute('aria-pressed') : '',
        setLoad: (document.getElementById('tb-' + id + '-s0-load') || {}).value || ''
      };
    }, hbId);
    assert.strictEqual(open.compact, 0, 'Edit sets hides compact rows');
    assert.strictEqual(open.editor, 6, 'Edit sets expands the set editor');
    assert.strictEqual(open.pressed, 'true');
    assert.strictEqual(open.grip, false, 'empty Grip stays hidden in the editor');
    assert.strictEqual(open.load, false, 'empty Load stays hidden in the editor');
    assert.ok(/7s on \/ 3s off/.test(open.onoff));
    assert.strictEqual(open.setLoad, '35 lb assist');

    await page.click('[data-hang-edit-sets]');
    var closed = await page.evaluate(function(id){
      var card = document.querySelector('[data-block-id="' + id + '"]');
      return {
        compact: card.querySelectorAll('[data-hang-compact]').length,
        editor: card.querySelectorAll('[data-hang-set]').length,
        pressed: card.querySelector('[data-hang-edit-sets]').getAttribute('aria-pressed')
      };
    }, hbId);
    assert.strictEqual(closed.compact, 6, 'Edit sets collapses again');
    assert.strictEqual(closed.editor, 0);
    assert.strictEqual(closed.pressed, 'false');

    var populated = await page.evaluate(function(id){
      var b = trainSessionState.blocks[0];
      b.grip = 'Open hand';
      b.assistance = '';
      renderTrainSessionBuilder();
      var grip = document.getElementById('tb-' + id + '-grip');
      var load = document.getElementById('tb-' + id + '-assist');
      b.grip = '';
      b.assistance = '+10 lb';
      renderTrainSessionBuilder();
      var grip2 = document.getElementById('tb-' + id + '-grip');
      var load2 = document.getElementById('tb-' + id + '-assist');
      return {
        gripShown: !!(grip && grip.value === 'Open hand'),
        loadHidden: !load,
        gripHiddenAfter: !grip2,
        loadShown: !!(load2 && load2.value === '+10 lb'),
        stillCompact: document.querySelectorAll('[data-hang-compact]').length
      };
    }, hbId);
    assert.strictEqual(populated.gripShown, true, 'populated block-level Grip stays shown');
    assert.strictEqual(populated.loadHidden, true, 'empty Load stays hidden beside a populated Grip');
    assert.strictEqual(populated.gripHiddenAfter, true, 'empty Grip stays hidden beside a populated Load');
    assert.strictEqual(populated.loadShown, true, 'populated block-level Load stays shown');
    assert.strictEqual(populated.stillCompact, 6);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await boot(page);
    var ids = await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Progress night', '', { session_running: true });
      trainSessionState.session_running = true;
      trainSessionState.title = 'Progress night';
      function add(shape, title){
        trainAddBlock(shape);
        var b = trainSessionState.blocks[trainSessionState.blocks.length - 1];
        b.title = title;
        b.complete = false;
        if(shape === 'check') b.items = [];
        return b.id;
      }
      var check = add('check', 'Warm up');
      var rest = add('rest', 'Rest');
      var interval = add('interval', 'Intervals');
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
      return { check: check, rest: rest, interval: interval };
    });

    async function readStrip(){
      return page.evaluate(function(){
        var wrap = document.getElementById('train-sess-progress');
        var label = document.getElementById('train-sess-progress-label');
        var bar = document.getElementById('train-sess-progress-bar');
        var shapes = (trainSessionState.blocks || []).map(function(b){ return b.shape; });
        return {
          hidden: !wrap || wrap.hidden,
          text: label ? String(label.textContent || '').trim() : '',
          width: bar ? bar.style.width : '',
          n: (trainSessionState.blocks || []).length,
          shapes: shapes,
          restDone: !!(trainSessionState.blocks || []).filter(function(b){ return b.shape === 'rest'; })[0].complete
        };
      });
    }

    var start = await readStrip();
    assert.strictEqual(start.hidden, false, 'progress strip is on a running session');
    assert.strictEqual(start.text, '0 of 3 blocks complete');
    assert.strictEqual(start.width, '0%');
    assert.ok(start.shapes.indexOf('rest') !== -1, 'Rest is in the block count');

    await page.evaluate(function(id){
      document.querySelector('[data-block-id="' + id + '"] .train-section-complete').click();
    }, ids.check);
    await page.evaluate(function(id){
      document.querySelector('[data-block-id="' + id + '"] .train-section-complete').click();
    }, ids.rest);
    var mid = await readStrip();
    assert.strictEqual(mid.text, '2 of 3 blocks complete', 'completing Rest counts');
    assert.strictEqual(mid.width, '67%');
    assert.strictEqual(mid.restDone, true);

    await page.evaluate(function(id){
      document.querySelector('[data-block-id="' + id + '"] .train-section-complete').click();
    }, ids.rest);
    var after = await readStrip();
    assert.strictEqual(after.text, '1 of 3 blocks complete', 'uncomplete updates the strip');
    assert.strictEqual(after.width, '33%');
    assert.strictEqual(after.n, 3, 'Rest stays in N');

    await page.waitForFunction(function(userId){
      try{
        var raw = localStorage.getItem('see_train_draft_' + userId);
        if(!raw) return false;
        var env = JSON.parse(raw);
        var blocks = env && env.state && env.state.blocks;
        if(!blocks || blocks.length !== 3) return false;
        var rest = blocks.filter(function(b){ return b.shape === 'rest'; })[0];
        var check = blocks.filter(function(b){ return b.shape === 'check'; })[0];
        return !!(check && check.complete) && rest && rest.complete === false;
      }catch(e){ return false; }
    }, USER_ID, { timeout: 4000 });

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await boot(page, true);
    await page.evaluate(function(){
      showScreen('screen-train');
    });
    await page.waitForFunction(function(){
      var card = document.getElementById('train-hub-draft-card');
      return card && !card.hidden && card.querySelector('.train-draft-resume');
    }, null, { timeout: 8000 });
    await page.evaluate(function(){
      document.getElementById('train-hub-draft-card').querySelector('.train-draft-resume').click();
    });
    await waitForScreen(page, 'screen-train-session');
    var restored = await readStrip();
    assert.strictEqual(restored.text, '1 of 3 blocks complete', 'strip restores from the draft');
    assert.strictEqual(restored.width, '33%');
    assert.strictEqual(restored.n, 3, 'restored N still includes Rest');
    assert.ok(restored.shapes.indexOf('rest') !== -1);
    assert.strictEqual(restored.restDone, false);
  });
} finally {
  server.close();
  await browser.close();
}
