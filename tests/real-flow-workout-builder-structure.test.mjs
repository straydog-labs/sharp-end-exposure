import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, waitForScreen,
  postsTo, firstBody, USER_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index319'/.test(index));
assert.ok(/APP_VERSION = 'index319'/.test(sw));

// Optional screenshot output (outside the repo). Unset in CI.
const SHOT_OUT = process.env.SEE_SHOT_OUT || '';
async function shot(page, name, selector){
  if(!SHOT_OUT) return;
  if(!existsSync(SHOT_OUT)) mkdirSync(SHOT_OUT, { recursive: true });
  var dest = join(SHOT_OUT, name);
  if(selector){
    await page.evaluate(function(sel){
      var el = document.querySelector(sel);
      if(el) el.scrollIntoView({ block: 'start' });
    }, selector);
    await page.waitForTimeout(60);
  }
  await page.screenshot({ path: dest });
}

function fulfillJson(route, status, body){
  return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) });
}
function stub(){
  return async function(route, info){
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: (info.body && info.body.id) || 'sess-a2a' }, info.body || {})]);
      return true;
    }
    if(info.method === 'GET' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
      await fulfillJson(route, 200, []);
      return true;
    }
    return false;
  };
}

async function openBuilder(page){
  await page.waitForFunction(function(){
    return typeof window.newTrainSessionState === 'function' && typeof window.isWkOn === 'function';
  }, null, { timeout: 30000 });
  // Let boot routing finish (it lands on Home), otherwise it navigates away mid-test.
  await page.waitForFunction(function(){
    var h = document.getElementById('screen-home');
    return !!(h && h.classList.contains('active'));
  }, null, { timeout: 15000 }).catch(function(){});
  await page.evaluate(function(userId){
    window.__seeTestSession = { access_token: 'test-token', user: { id: userId } };
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    try{ localStorage.removeItem('see_train_session_draft'); }catch(e){}
    trainSessionState = newTrainSessionState('strength');
    showScreen('screen-train-session');
    renderTrainSessionBuilder();
  }, USER_ID);
  await waitForScreen(page, 'screen-train-session');
  // The boot skeleton can still cover the page in the harness; real clicks need it gone.
  await page.evaluate(function(){
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  });
}
async function addViaMenu(page, label, where){
  var openSel = where === 'bottom' ? '#train-add-block-bottom' : '#screen-train-session button[onclick="trainAddBlockMenu()"]';
  await page.click(openSel);
  var menu = where === 'bottom' ? '#train-block-menu-bottom' : '#train-block-menu';
  await page.click(menu + ' button:has-text("' + label + '")');
}
function order(page){
  return page.evaluate(function(){
    return trainSessionState.blocks.map(function(b){ return b.title || b.shape; });
  });
}
function cardTitles(page){
  return page.evaluate(function(){
    return Array.prototype.map.call(document.querySelectorAll('#train-blocks-wrap .train-block-card .train-block-title'), function(n){ return n.textContent; });
  });
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  // ---------- flag ON ----------
  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    assert.strictEqual(await page.evaluate(function(){ return isWkOn(); }), true);
    await openBuilder(page);

    // 1. menu names + order, top and bottom
    await page.click('#screen-train-session button[onclick="trainAddBlockMenu()"]');
    var topNames = await page.$$eval('#train-block-menu button', function(bs){ return bs.map(function(b){ return b.textContent.trim(); }); });
    assert.deepStrictEqual(topNames, ['Climbing (EMOM)', 'Strength', 'Hangboard / repeaters', 'Mental', 'Rest', 'Custom']);
    await shot(page, 'a2a-1-menu.png', '#train-block-menu');
    await page.click('#screen-train-session button[onclick="trainAddBlockMenu()"]');
    var bottomVisible = await page.isVisible('#train-add-block-bottom');
    assert.ok(bottomVisible, 'bottom + Add block visible with flag on');
    await page.click('#train-add-block-bottom');
    var botNames = await page.$$eval('#train-block-menu-bottom button', function(bs){ return bs.map(function(b){ return b.textContent.trim(); }); });
    assert.deepStrictEqual(botNames, topNames);
    assert.ok(!(await page.isVisible('#train-block-menu')), 'only one menu open at a time');
    await page.click('#train-block-menu-bottom button:has-text("Climbing (EMOM)")');
    assert.ok(!(await page.isVisible('#train-block-menu-bottom')), 'menu closes after add');

    // add the other block types through the menu
    await addViaMenu(page, 'Strength', 'top');
    await addViaMenu(page, 'Hangboard / repeaters', 'bottom');
    await addViaMenu(page, 'Mental', 'top');
    await addViaMenu(page, 'Rest', 'bottom');
    await addViaMenu(page, 'Custom', 'top');
    var shapes = await page.evaluate(function(){ return trainSessionState.blocks.map(function(b){ return b.shape + ':' + (b.title || ''); }); });
    assert.deepStrictEqual(shapes, ['emom:', 'circuit:', 'rep_pass_fail:', 'section:Mental', 'rest:Rest', 'section:']);
    var titles = await cardTitles(page);
    assert.deepStrictEqual(titles, ['Climbing (EMOM)', 'Strength', 'Hangboard / repeaters', 'Mental', 'Rest', 'Custom']);
    var kickers = await page.$$eval('#train-blocks-wrap .train-block-kicker', function(ns){ return ns.map(function(n){ return n.textContent; }); });
    assert.strictEqual(kickers[0].indexOf('Block 1'), 0);
    assert.strictEqual(kickers[5].indexOf('Block 6'), 0);
    await shot(page, 'a2a-2-all-blocks.png');

    // Mental block takes typed notes
    await page.evaluate(function(){
      var m = trainSessionState.blocks[3];
      var btn = document.getElementById('tb-' + m.id + '-secnotes-add');
      if(btn) btn.click();
    });
    await page.fill('#tb-' + (await page.evaluate(function(){ return trainSessionState.blocks[3].id; })) + '-secnotes', 'Box breathing 4 min before hangboard');

    // 2. EMOM live label + tick + collapse summary
    var emomId = await page.evaluate(function(){ return trainSessionState.blocks[0].id; });
    var firstInput = '#tb-' + emomId + '-r0-b0';
    var labelSel = '#train-blocks-wrap .train-block-card[data-block-id="' + emomId + '"] .wk-boulder .wk-check-text';
    assert.strictEqual((await page.locator(labelSel).first().textContent()).trim(), 'Boulder 1');
    await page.fill(firstInput, 'V4 orange');
    assert.strictEqual((await page.locator(labelSel).first().textContent()).trim(), 'Boulder 1 \u00b7 V4 orange', 'label keeps Boulder N and adds the detail while typing');
    await page.fill(firstInput, '');
    assert.strictEqual((await page.locator(labelSel).first().textContent()).trim(), 'Boulder 1', 'empty falls back to Boulder N');
    await page.fill(firstInput, 'V4 orange');
    assert.strictEqual(await page.locator(firstInput).getAttribute('placeholder'), 'Details (grade \u00b7 color \u00b7 wall)');

    // rest takes minutes or seconds: unit menu, typed suffix, and m:ss
    var restSel = '#tb-' + emomId + '-r0-rest';
    var restNow = function(){ return page.evaluate(function(){ collectTrainBlockFields(); return trainSessionState.blocks[0].rounds[0].rest_after_sec; }); };
    assert.strictEqual(await page.inputValue(restSel), '3', 'default 180s shows as 3');
    assert.strictEqual(await page.inputValue(restSel + '-u'), 'min', 'default unit is min');
    await page.selectOption(restSel + '-u', 'sec');
    assert.strictEqual(await page.inputValue(restSel), '180', 'switching unit converts the number');
    await page.fill(restSel, '90');
    assert.strictEqual(await restNow(), 90, '90 sec');
    await page.selectOption(restSel + '-u', 'min');
    assert.strictEqual(await page.inputValue(restSel), '1.5', '90 sec shows as 1.5 min');
    await page.fill(restSel, '10');
    assert.strictEqual(await restNow(), 600, '10 min');
    await page.fill(restSel, '45 sec');
    assert.strictEqual(await restNow(), 45, 'typed sec wins over the menu');
    await page.fill(restSel, '1:30');
    assert.strictEqual(await restNow(), 90, 'm:ss');
    await page.fill(restSel, '2 min');
    assert.strictEqual(await restNow(), 120, 'typed min');
    await page.fill(restSel, 'abc');
    assert.strictEqual(await restNow(), 120, 'junk keeps the previous value');
    await page.selectOption(restSel + '-u', 'min');
    await page.fill(restSel, '10');
    assert.strictEqual(await restNow(), 600);

    await page.locator('#train-blocks-wrap .train-block-card[data-block-id="' + emomId + '"] .wk-boulder').first().click();
    await page.click('[data-wk-toggle="' + emomId + '"]');
    var coll = await page.evaluate(function(id){
      var card = document.querySelector('.train-block-card[data-block-id="' + id + '"]');
      return {
        summary: (card.querySelector('[data-wk-summary]') || {}).textContent,
        hasBoulders: !!card.querySelector('.wk-boulder'),
        expanded: card.querySelector('[data-wk-toggle]').getAttribute('aria-expanded'),
        json: JSON.stringify(trainSessionState).indexOf('ollapse')
      };
    }, emomId);
    assert.strictEqual(coll.summary, '1 of 4 sent');
    assert.strictEqual(coll.hasBoulders, false, 'collapsed hides the body');
    assert.strictEqual(coll.expanded, 'false');
    assert.strictEqual(coll.json, -1, 'collapse state is not saved in the session JSON');
    // collapse the rest too and read summaries
    var ids = await page.evaluate(function(){ return trainSessionState.blocks.map(function(b){ return b.id; }); });
    for(var k = 1; k < ids.length; k++){
      await page.click('[data-wk-toggle="' + ids[k] + '"]');
    }
    var sums = await page.$$eval('[data-wk-summary]', function(ns){ return ns.map(function(n){ return n.textContent; }); });
    assert.deepStrictEqual(sums, ['1 of 4 sent', '3 rounds', '1 set', 'Box breathing 4 min before hangboard', '10 min', 'Empty']);
    await shot(page, 'a2a-3-collapsed.png');
    // expand again: typed text and tick preserved
    await page.click('[data-wk-toggle="' + emomId + '"]');
    var kept = await page.evaluate(function(id){
      var b = trainSessionState.blocks.find(function(x){ return x.id === id; });
      return { text: b.rounds[0].boulders[0].text, done: !!b.rounds[0].boulders[0].complete, val: document.getElementById('tb-' + id + '-r0-b0').value };
    }, emomId);
    assert.deepStrictEqual(kept, { text: 'V4 orange', done: true, val: 'V4 orange' });
    for(var k2 = 1; k2 < ids.length; k2++){
      await page.click('[data-wk-toggle="' + ids[k2] + '"]');
    }

    // 3. reorder with buttons: move Rest (index 4) up twice
    var before = await order(page);
    assert.deepStrictEqual(before, ['emom', 'circuit', 'rep_pass_fail', 'Mental', 'Rest', 'section']);
    var restId = ids[4];
    await page.click('.train-block-card[data-block-id="' + restId + '"] [data-wk-move="up"]');
    await page.click('.train-block-card[data-block-id="' + restId + '"] [data-wk-move="up"]');
    assert.deepStrictEqual(await order(page), ['emom', 'circuit', 'Rest', 'rep_pass_fail', 'Mental', 'section']);
    var upDisabled = await page.evaluate(function(){
      var first = document.querySelector('#train-blocks-wrap .train-block-card [data-wk-move="up"]');
      var cards = document.querySelectorAll('#train-blocks-wrap .train-block-card');
      var last = cards[cards.length - 1].querySelector('[data-wk-move="down"]');
      return [first.disabled, last.disabled];
    });
    assert.deepStrictEqual(upDisabled, [true, true], 'first has no up, last has no down');
    assert.deepStrictEqual(await cardTitles(page), ['Climbing (EMOM)', 'Strength', 'Rest', 'Hangboard / repeaters', 'Mental', 'Custom']);
    var kicks = await page.$$eval('#train-blocks-wrap .train-block-kicker', function(ns){ return ns.map(function(n){ return n.textContent; }); });
    assert.ok(kicks[2].indexOf('Block 3') === 0, 'Block N renumbers live');
    var tickKept = await page.evaluate(function(){ return trainSessionState.blocks[0].rounds[0].boulders[0].complete === true; });
    assert.ok(tickKept, 'ticks survive reorder');

    // 3b. reorder with real pointer drag: drag Custom (last) to above Strength (index 1)
    var handle = page.locator('.train-block-card[data-block-id="' + ids[5] + '"] .wk-drag-handle');
    var target = page.locator('.train-block-card[data-block-id="' + ids[1] + '"]');
    await handle.scrollIntoViewIfNeeded();
    // work with a scrolled-to-top viewport so both cards are on screen
    await page.evaluate(function(){ window.scrollTo(0, 0); var s = document.getElementById('screen-train-session'); if(s) s.scrollTop = 0; });
    await page.setViewportSize({ width: 390, height: 3200 });
    // let the resize reflow settle before measuring (slow CI runners)
    await page.evaluate(function(){ return new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(function(){ setTimeout(r, 150); }); }); }); });
    // wait until scroll position is stable (smooth-scroll can still be running)
    await page.evaluate(function(){ return new Promise(function(res){ window.scrollTo(0, 0); var last = -1, n = 0; (function tick(){ var y = window.scrollY; if(y === last && y === 0){ if(++n >= 5) return res(); } else { n = 0; last = y; window.scrollTo(0, 0); } requestAnimationFrame(tick); })(); }); });
    var hb = await handle.boundingBox();
    var tb = await target.boundingBox();
    assert.ok(hb && tb && hb.y + hb.height < 3200, 'handle and target are on screen');
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 8 });
    // re-measure the target now, aim at its top half, and wait for the drop marker before releasing
    tb = await target.boundingBox();
    await page.mouse.move(tb.x + tb.width / 2, tb.y + 4, { steps: 3 });
    await page.waitForSelector('.train-block-card[data-block-id="' + ids[1] + '"].wk-drop-before', { timeout: 3000 });
    await page.mouse.up();
    assert.deepStrictEqual(await order(page), ['emom', 'section', 'circuit', 'Rest', 'rep_pass_fail', 'Mental'], 'drag drops Custom before Strength');
    await page.setViewportSize({ width: 390, height: 844 });

    // order is what gets saved
    await page.click('#train-sess-save');
    await page.waitForFunction(function(){ return true; });
    await page.waitForTimeout(300);
    var saved = firstBody(postsTo(recorded, 'training_sessions', 'POST'));
    assert.ok(saved, 'training_sessions POST made');
    assert.deepStrictEqual(saved.blocks.map(function(b){ return b.shape; }), ['emom', 'section', 'circuit', 'rest', 'rep_pass_fail', 'section']);
    assert.strictEqual(saved.blocks[0].rounds[0].boulders[0].complete, true);
    assert.ok(JSON.stringify(saved).indexOf('ollapse') === -1);
  });

  // ---------- EMOM rounds, dates, labels (flag on) ----------
  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page){
    await openBuilder(page);
    await page.click('#screen-train-session button[onclick="trainAddBlockMenu()"]');
    await page.click('#train-block-menu button:has-text("Climbing (EMOM)")');
    var id = await page.evaluate(function(){ return trainSessionState.blocks[0].id; });
    var card = '.train-block-card[data-block-id="' + id + '"]';
    assert.strictEqual(await page.locator(card + ' .wk-round-remove').count(), 0, 'single round has no Remove round');
    await page.click(card + ' button:has-text("+ Same round again")');
    await page.click(card + ' button:has-text("+ Same round again")');
    assert.strictEqual(await page.locator(card + ' .train-emom-round').count(), 3);
    assert.strictEqual(await page.locator(card + ' .wk-round-remove').count(), 3);
    await shot(page, 'a2a-4a-remove-round.png', card + ' .train-emom-round-head');

    // round 2 (index 1) is empty: removes right away; rounds renumber
    await page.locator(card + ' .wk-round-remove').nth(1).click();
    var labels = await page.$$eval(card + ' .train-emom-round-label', function(ns){ return ns.map(function(n){ return n.textContent; }); });
    assert.strictEqual(labels.length, 2);
    assert.ok(/^Round 1/.test(labels[0]) && /^Round 2/.test(labels[1]), 'renumbered: ' + labels.join('|'));

    // round with content asks for confirmation first
    await page.fill('#tb-' + id + '-r1-b0', 'V5 black');
    await page.locator(card + ' .wk-round-remove').nth(1).click();
    assert.strictEqual(await page.locator(card + ' .train-emom-round').count(), 2, 'first tap only arms');
    assert.ok(/Confirm remove round/.test(await page.locator(card + ' .wk-round-remove').nth(1).textContent()));
    assert.strictEqual(await page.evaluate(function(id){
      var b = trainSessionState.blocks[0];
      return b.rounds[1].boulders[0].text;
    }, id), 'V5 black', 'typed text kept when arming');
    await page.locator(card + ' .wk-round-remove').nth(1).click();
    assert.strictEqual(await page.locator(card + ' .train-emom-round').count(), 1);
    assert.strictEqual(await page.locator(card + ' .wk-round-remove').count(), 0, 'last round cannot be removed');
    var derive = await page.evaluate(function(){
      var b = trainSessionState.blocks[0];
      return { complete: b.complete, rounds: b.rounds.length };
    });
    assert.strictEqual(derive.rounds, 1);
    assert.strictEqual(derive.complete, false);

    // removing a ticked round re-derives block complete
    await page.click(card + ' button:has-text("+ Same round again")');
    await page.evaluate(function(){
      var b = trainSessionState.blocks[0];
      b.rounds[0].boulders.forEach(function(bo){ bo.complete = true; });
      wkDeriveEmom(b);
      renderTrainSessionBuilder();
    });
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.blocks[0].complete; }), false, 'round 2 not done');
    await page.locator(card + ' .wk-round-remove').nth(1).click();
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.blocks[0].complete; }), true, 'block complete re-derives after removal');

    // dates: stacked full-width rows
    var dates = await page.evaluate(function(){
      var s = document.getElementById('train-sess-start').getBoundingClientRect();
      var e = document.getElementById('train-sess-end').getBoundingClientRect();
      return { sw: s.width, ew: e.width, stacked: e.top > s.bottom - 1, sx: s.left, ex: e.left };
    });
    assert.ok(dates.stacked, 'End sits below Start');
    assert.ok(dates.sw >= 300 && dates.ew >= 300, 'full width: ' + JSON.stringify(dates));
    assert.ok(Math.abs(dates.sx - dates.ex) < 1);

    // button label
    assert.strictEqual((await page.textContent('#train-sess-save-workout')).trim(), 'Save workout');
    assert.strictEqual((await page.textContent('#train-sess-save')).trim(), 'Save session');
    await shot(page, 'a2a-4-dates-and-emom.png');
    await page.evaluate(function(){ window.scrollTo(0, 0); });
    await shot(page, 'a2a-5-top.png');
  });

  // ---------- flag OFF: legacy ----------
  await withPage(browser, port, {
    path: '/index.html?wk=0',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page){
    assert.strictEqual(await page.evaluate(function(){ return isWkOn(); }), false);
    await openBuilder(page);
    var legacy = await page.evaluate(function(){
      var m = document.getElementById('train-block-menu');
      return {
        menu: Array.prototype.map.call(m.querySelectorAll('button'), function(b){ return b.textContent.trim(); }),
        bottom: getComputedStyle(document.getElementById('train-block-bottom')).display,
        dates: document.getElementById('train-sess-dates').style.gridTemplateColumns,
        label: document.getElementById('train-sess-save-workout').textContent.trim()
      };
    });
    assert.deepStrictEqual(legacy.menu, ['Add section', 'EMOM', 'Weighted circuit', 'Rep-level pass/fail']);
    assert.strictEqual(legacy.bottom, 'none');
    assert.strictEqual(legacy.dates, '1fr 1fr');
    assert.strictEqual(legacy.label, 'Save as workout');
    await page.click('#screen-train-session button[onclick="trainAddBlockMenu()"]');
    await page.click('#train-block-menu button:has-text("EMOM")');
    var legacyCard = await page.evaluate(function(){
      var c = document.querySelector('#train-blocks-wrap .train-block-card');
      return {
        handle: !!c.querySelector('.wk-drag-handle'),
        toggle: !!c.querySelector('[data-wk-toggle]'),
        title: c.querySelector('.train-block-title').textContent,
        removeRound: !!c.querySelector('.wk-round-remove')
      };
    });
    assert.deepStrictEqual(legacyCard, { handle: false, toggle: false, title: 'EMOM', removeRound: false });
  });

  // ---------- flag toggles menu back and forth in one page ----------
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page){
    await openBuilder(page);
    var r = await page.evaluate(function(){
      localStorage.setItem('see_wk', '1');
      renderTrainSessionBuilder();
      var m = document.getElementById('train-block-menu');
      var on1 = m.textContent.indexOf('Climbing (EMOM)') !== -1;
      localStorage.setItem('see_wk', '0');
      renderTrainSessionBuilder();
      var off = m.textContent.indexOf('Add section') !== -1 && m.textContent.indexOf('Climbing') === -1;
      localStorage.setItem('see_wk', '1');
      renderTrainSessionBuilder();
      var on2 = m.textContent.indexOf('Climbing (EMOM)') !== -1;
      return [on1, off, on2];
    });
    assert.deepStrictEqual(r, [true, true, true]);
  });

  console.log('real-flow-workout-builder-structure: ok');
} finally {
  await browser.close();
  server.close();
}
