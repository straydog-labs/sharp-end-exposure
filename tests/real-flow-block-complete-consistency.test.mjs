import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { startStaticServer, launchChromium, withPage, USER_ID } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index330'/.test(index));
assert.ok(/APP_VERSION = 'index330'/.test(sw));

async function boot(page){
  await page.waitForFunction(function(){
    return typeof window.trainAddBlock === 'function' && typeof window.isWkOn === 'function' && window.isWkOn();
  }, null, { timeout: 30000 });
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    try{ localStorage.removeItem('see_train_draft_' + userId); }catch(e){}
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

function readSig(page, id){
  return page.evaluate(function(blockId){
    var b = (trainSessionState.blocks || []).find(function(x){ return x.id === blockId; });
    var card = document.querySelector('[data-block-id="'+blockId+'"]');
    var btn = card ? card.querySelector('.wk-blk-actions > .train-section-complete') : null;
    var row = card ? card.querySelector('.wk-blk-row') : null;
    var slot = card ? card.querySelector('.wk-notice-slot') : null;
    var toggle = card ? card.querySelector('[data-wk-toggle]') : null;
    return {
      shape: b && b.shape,
      title: b && b.title,
      complete: !!(b && b.complete),
      btn: btn ? String(btn.textContent || '').trim() : '',
      on: !!(btn && btn.classList.contains('on')),
      cardOn: !!(card && card.classList.contains('is-complete')),
      expanded: toggle ? toggle.getAttribute('aria-expanded') : '',
      noticeAfterHeader: !!(slot && row && slot.previousElementSibling === row),
      link: !!(slot && slot.querySelector('.wk-notice-link')),
      cardOpen: !!(slot && slot.querySelector('.wk-notice-card')),
      skip: !!(slot && slot.querySelector('.wk-notice-skip')),
      strayNotice: !!(card && card.querySelector('.wk-notice-link, .wk-notice-card') && !slot)
    };
  }, id);
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
    var ids = await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Block consistency', '', { session_running: true });
      trainSessionState.session_running = true;
      function add(shape, title, prep){
        trainAddBlock(shape);
        var b = trainSessionState.blocks[trainSessionState.blocks.length - 1];
        b.title = title;
        if(prep) prep(b);
        return b.id;
      }
      var warm = add('check', 'Warm up', function(b){
        b.items = [{ id: 'wu1', text: 'hips', complete: false }, { id: 'wu2', text: 'shoulders', complete: false }];
      });
      var emom = add('emom', 'EMOM', function(b){
        b.rounds = [{
          boulders: [{ id: 'e1', text: 'V2', complete: false }],
          notes: '', rest_after_sec: 90, complete: false, rest_started_at: null
        }];
      });
      var circuit = add('circuit', 'Circuit', function(b){
        b.rounds = 1;
        b.round_complete = [false];
        b.exercises = [{ name: 'Squat', weight: '40kg', reps: '8' }];
      });
      var hang = add('rep_pass_fail', 'Hangboard', function(b){
        b.sets = [{ reps: [{ ok: null }] }];
      });
      var interval = add('interval', 'Interval', function(b){
        b.work_sec = 10; b.rest_sec = 5; b.target_sets = 2;
      });
      var rest = add('rest', 'Rest', function(b){
        b.duration_sec = 60; b.rest_after_sec = 60;
      });
      renderTrainSessionBuilder();
      showScreen('screen-train-session');
      return { warm: warm, emom: emom, circuit: circuit, hang: hang, interval: interval, rest: rest };
    });

    async function complete(id){
      var loc = page.locator('[data-block-id="'+id+'"] .wk-blk-actions > .train-section-complete');
      await loc.scrollIntoViewIfNeeded();
      await loc.click();
    }

    await complete(ids.warm);
    var warm = await readSig(page, ids.warm);
    assert.strictEqual(warm.complete, true, 'warm up complete');
    assert.strictEqual(warm.btn, 'Complete');
    assert.strictEqual(warm.on, true);
    assert.strictEqual(warm.cardOn, true);
    assert.strictEqual(warm.expanded, 'true', 'warm up stays expanded');
    assert.strictEqual(warm.noticeAfterHeader, true, 'warm up notice sits under the header');
    assert.strictEqual(warm.link, true, 'warm up notice starts collapsed');
    assert.strictEqual(warm.cardOpen, false, 'warm up notice is not auto-opened');
    assert.strictEqual(warm.strayNotice, false);

    await page.locator('[data-block-id="'+ids.warm+'"] .wk-notice-link').click();
    var opened = await readSig(page, ids.warm);
    assert.strictEqual(opened.cardOpen, true, 'tap expands the notice');
    assert.strictEqual(opened.skip, true, 'notice is skippable');
    assert.strictEqual(opened.noticeAfterHeader, true);
    await page.locator('[data-block-id="'+ids.warm+'"] .wk-notice-skip').click();
    var skipped = await readSig(page, ids.warm);
    assert.strictEqual(skipped.cardOpen, false, 'skip collapses the notice');
    assert.strictEqual(skipped.link, true);
    assert.strictEqual(skipped.complete, true, 'skip does not uncomplete the block');

    var shapes = [
      ['emom', ids.emom],
      ['circuit', ids.circuit],
      ['rep_pass_fail', ids.hang],
      ['interval', ids.interval]
    ];
    for(var i = 0; i < shapes.length; i++){
      var name = shapes[i][0];
      var id = shapes[i][1];
      await complete(id);
      var sig = await readSig(page, id);
      assert.strictEqual(sig.complete, warm.complete, name + ' complete flag');
      assert.strictEqual(sig.btn, warm.btn, name + ' button label');
      assert.strictEqual(sig.on, warm.on, name + ' button class');
      assert.strictEqual(sig.cardOn, warm.cardOn, name + ' card class');
      assert.strictEqual(sig.expanded, warm.expanded, name + ' collapse/expand');
      assert.strictEqual(sig.noticeAfterHeader, true, name + ' notice under header');
      assert.strictEqual(sig.link, true, name + ' notice collapsed');
      assert.strictEqual(sig.cardOpen, false, name + ' notice not auto-opened');
      assert.strictEqual(sig.strayNotice, false, name + ' notice not elsewhere');
    }

    await complete(ids.rest);
    var rest = await readSig(page, ids.rest);
    assert.strictEqual(rest.complete, true);
    assert.strictEqual(rest.btn, 'Complete');
    assert.strictEqual(rest.on, true);
    assert.strictEqual(rest.cardOn, true);
    assert.strictEqual(rest.expanded, warm.expanded, 'rest collapse/expand matches warm up');
    assert.strictEqual(rest.noticeAfterHeader, false, 'rest has no notice slot');
    assert.strictEqual(rest.link, false);
    assert.strictEqual(rest.cardOpen, false);
    var restPrompt = await page.evaluate(function(id){
      var card = document.querySelector('[data-block-id="'+id+'"]');
      return !!(card && card.querySelector('.wk-notice-link, .wk-notice-card, .wk-notice-slot'));
    }, ids.rest);
    assert.strictEqual(restPrompt, false, 'rest has Complete only');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){
      window.__vib = [];
      navigator.vibrate = function(pattern){ window.__vib.push(pattern); return true; };
      trainSessionState = newTrainSessionState('Boulders', 'EMOM rest', '', {});
      trainSessionState.session_running = true;
      trainAddBlock('emom');
      var b = trainSessionState.blocks[0];
      b.title = 'EMOM rest';
      b.rounds = [
        { boulders: [{ id: 'r1', text: 'V3', complete: false }], notes: '', rest_after_sec: 60, complete: false, rest_started_at: null },
        { boulders: [{ id: 'r2', text: 'V4', complete: false }, { id: 'r2b', text: 'V5', complete: false }], notes: '', rest_after_sec: 60, complete: false, rest_started_at: null }
      ];
      renderTrainSessionBuilder();
      showScreen('screen-train-session');
    });
    await page.locator('.train-emom-round .wk-boulder').nth(0).click();
    var counting = await page.evaluate(function(){
      var wrap = document.querySelector('[data-emom-rest-phase="Counting"]');
      var b = trainSessionState.blocks[0];
      return {
        phase: wrap ? wrap.getAttribute('data-emom-rest-phase') : '',
        text: wrap ? wrap.textContent : '',
        started: !!(b.rounds[0].rest_started_at),
        round2Locked: !!document.querySelectorAll('.train-emom-round')[1]
          && document.querySelectorAll('.train-emom-round')[1].classList.contains('is-locked')
      };
    });
    assert.strictEqual(counting.phase, 'Counting', 'tick round 1 starts rest');
    assert.ok(/Rest/.test(counting.text) && !/Rest over/.test(counting.text), counting.text);
    assert.strictEqual(counting.started, true);

    await page.locator('.train-emom-round .wk-boulder').nth(1).click({ timeout: 4000 });
    var stopped = await page.evaluate(function(){
      var counting = document.querySelector('[data-emom-rest-phase="Counting"]');
      var b = trainSessionState.blocks[0];
      return {
        counting: !!counting,
        round2: !!b.rounds[1].boulders[0].complete,
        prior: b.rounds[0].rest_started_at
      };
    });
    assert.strictEqual(stopped.round2, true, 'round 2 tick landed');
    assert.strictEqual(stopped.counting, false, 'tick round 2 stops the countdown');
    assert.ok(!stopped.prior, 'prior rest is not still counting');

    await page.evaluate(function(){
      var b = trainSessionState.blocks[0];
      b.rounds[0].complete = false;
      b.rounds[0].rest_started_at = null;
      b.rounds[0].boulders[0].complete = false;
      b.rounds[1].boulders[0].complete = false;
      b.rounds[1].complete = false;
      wkDeriveEmom(b);
      renderTrainSessionBuilder();
    });
    await page.locator('.train-emom-round .wk-boulder').nth(0).click();
    await page.locator('.train-emom-skip-rest').click({ timeout: 4000 });
    var skipped = await page.evaluate(function(){
      var b = trainSessionState.blocks[0];
      return {
        counting: !!document.querySelector('[data-emom-rest-phase="Counting"]'),
        started: b.rounds[0].rest_started_at
      };
    });
    assert.strictEqual(skipped.counting, false, 'Skip rest stops the countdown');
    assert.ok(!skipped.started, 'Skip rest clears the running rest');

    await page.evaluate(function(){
      var b = trainSessionState.blocks[0];
      b.rounds[0].complete = true;
      b.rounds[0].boulders[0].complete = true;
      b.rounds[0].rest_skipped = false;
      b.rounds[0].rest_after_sec = 30;
      b.rounds[0].rest_started_at = new Date().toISOString();
      b.rounds[1].boulders.forEach(function(bo){ bo.complete = false; });
      b.rounds[1].complete = false;
      b.rounds[1].rest_started_at = null;
      window.__vib = [];
      renderTrainSessionBuilder();
      b.rounds[0].rest_started_at = new Date(Date.now() - 30000).toISOString();
      paintTrainEmomRestTimers(b);
    });
    var over = await page.evaluate(function(){
      var wrap = document.querySelector('[data-emom-rest-phase="Done"]');
      return { text: wrap ? wrap.textContent : '', vib: window.__vib.slice() };
    });
    assert.ok(/Rest over/.test(over.text), 'at 0 shows Rest over, got ' + over.text);
    assert.ok(over.vib.length >= 1, 'vibrate when rest hits 0');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await boot(page);
    await page.evaluate(function(){
      populateTrainDoneScreen({
        title: 'Night session',
        started_at: new Date(Date.now() - 600000).toISOString(),
        ended_at: new Date().toISOString(),
        blockCount: 2
      }, true);
      showScreen('screen-train-done');
    });
    var fonts = await page.evaluate(function(){
      var title = document.getElementById('train-done-title');
      var screen = document.querySelector('#screen-train-done .screen-title');
      var ts = getComputedStyle(title);
      var ss = getComputedStyle(screen);
      return {
        text: title.textContent,
        titleFamily: ts.fontFamily,
        screenFamily: ss.fontFamily,
        titleSize: ts.fontSize,
        screenSize: ss.fontSize,
        titleWeight: ts.fontWeight,
        screenWeight: ss.fontWeight
      };
    });
    assert.strictEqual(fonts.text, 'Night session');
    assert.strictEqual(fonts.titleFamily, fonts.screenFamily, 'workout title font ' + fonts.titleFamily + ' vs ' + fonts.screenFamily);
    assert.strictEqual(fonts.titleSize, fonts.screenSize, 'workout title size ' + fonts.titleSize + ' vs ' + fonts.screenSize);
    assert.strictEqual(fonts.titleWeight, fonts.screenWeight);
    assert.ok(!/mono/i.test(fonts.titleFamily), fonts.titleFamily);
  });
}finally{
  server.close();
  await browser.close();
}

console.log('block-complete-consistency ok');
