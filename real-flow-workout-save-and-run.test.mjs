import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, waitForScreen, postsTo, firstBody, USER_ID
} from './harness.mjs';

// Athlete with no coach: Build session -> add EMOM + Hangboard -> Save workout
// -> Start now -> tick boulders. Also: the save must not send training_focus ''
// (rejected by the custom_workouts CHECK, which was the Save as workout 400).
function fulfillJson(route, status, body){
  return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) });
}
let failNext = false;
function stub(){
  return async function(route, info){
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
      if(failNext){
        failNext = false;
        await fulfillJson(route, 400, { code: '23514', message: 'new row violates check constraint "custom_workouts_training_focus_check"' });
        return true;
      }
      await fulfillJson(route, 201, [Object.assign({ id: 'cw-saved-1' }, info.body || {})]);
      return true;
    }
    if(info.method === 'GET' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
      await fulfillJson(route, 200, []);
      return true;
    }
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: 'sess-run-1' }, info.body || {})]);
      return true;
    }
    return false;
  };
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 1400 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await page.waitForFunction(function(){ return typeof window.startSessionNoCategory === 'function' && typeof window.isWkOn === 'function'; }, null, { timeout: 30000 });
    await page.waitForFunction(function(){
      var h = document.getElementById('screen-home');
      return !!(h && h.classList.contains('active'));
    }, null, { timeout: 15000 }).catch(function(){});
    await page.evaluate(function(userId){
      window._authUser = { id: userId };
      window._authToken = 'test-token';
      window._seeTestsRunning = true;
      window.loadClimbLog = function(){ return Promise.resolve(); };
      window.loadHomeScreen = function(){ return Promise.resolve(); };
      window.prompt = function(){ return 'Jess EMOM + Repeaters'; };
      try{ localStorage.removeItem('see_train_session_draft'); }catch(e){}
      startSessionNoCategory();   // the real "Build session" entry: energy_type is ''
    }, USER_ID);
    await waitForScreen(page, 'screen-train-session');
    await page.evaluate(function(){ var sk = document.getElementById('route-loading-skeleton'); if(sk) sk.style.display = 'none'; });
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.energy_type; }), '', 'Build session starts with no type');

    // build: EMOM (3 boulders with details, 2 laps via Same round again) + Repeaters
    await page.evaluate(function(){ trainAddBlock('emom'); trainAddBlock('rep_pass_fail'); });
    const emomId = await page.evaluate(function(){ return trainSessionState.blocks[0].id; });
    await page.fill('#tb-' + emomId + '-r0-b0', 'V4-6 blue cave');
    await page.fill('#tb-' + emomId + '-r0-b1', 'V4-6 green left');
    await page.selectOption('#tb-' + emomId + '-r0-rest-u', 'min');
    await page.fill('#tb-' + emomId + '-r0-rest', '10');
    await page.click('[onclick="trainAddEmomRound(\'' + emomId + '\',\'repeat\')"]');
    const hbId = await page.evaluate(function(){ return trainSessionState.blocks[1].id; });
    await page.fill('#tb-' + hbId + '-grip', 'half crimp');
    await page.fill('#tb-' + hbId + '-assist', '+35 lb');

    // first failure shows the real reason
    failNext = true;
    await page.click('#train-sess-save-workout');
    await page.waitForFunction(function(){
      var t = document.getElementById('error-toast-el');
      return !!(t && /400/.test(t.textContent || '') && /check constraint/.test(t.textContent || ''));
    }, null, { timeout: 5000 });

    // save for real
    await page.click('#train-sess-save-workout');
    await page.waitForFunction(function(){
      var el = document.getElementById('train-sess-saved-workout');
      return !!(el && el.style.display === 'block');
    }, null, { timeout: 5000 });
    const posts = postsTo(recorded, 'custom_workouts', 'POST');
    assert.strictEqual(posts.length, 2, 'two save attempts');
    const cw = firstBody(posts.slice(1));
    assert.strictEqual(cw.name, 'Jess EMOM + Repeaters');
    assert.strictEqual(cw.training_focus, 'Boulders', 'type inferred from the first block, never ""');
    assert.notStrictEqual(firstBody(posts).training_focus, '', 'first attempt never sends an empty type');
    assert.deepStrictEqual(cw.sections.map(function(b){ return b.shape; }), ['emom', 'rep_pass_fail']);
    assert.strictEqual(cw.sections[0].rounds.length, 2);
    assert.strictEqual(cw.sections[0].rounds[0].rest_after_sec, 600);
    assert.strictEqual(cw.sections[0].rounds[1].boulders[0].text, 'V4-6 blue cave');

    // run it later: Start now opens the saved workout fresh, boulders tickable with fixed labels
    await page.click('#train-sess-saved-start-now');
    await waitForScreen(page, 'screen-train-session');
    const seeded = await page.evaluate(function(){
      var b = trainSessionState.blocks[0];
      return {
        shapes: trainSessionState.blocks.map(function(x){ return x.shape; }),
        rounds: b.rounds.length,
        ticked: b.rounds.some(function(r){ return r.boulders.some(function(x){ return x.complete; }); }),
        src: trainSessionState.custom_workout_item_id || (trainSessionState.source && trainSessionState.source.custom_workout_item_id) || null,
        grip: trainSessionState.blocks[1].grip
      };
    });
    assert.deepStrictEqual(seeded.shapes, ['emom', 'rep_pass_fail']);
    assert.strictEqual(seeded.rounds, 2);
    assert.strictEqual(seeded.ticked, false, 'a started workout begins unticked');
    assert.strictEqual(seeded.grip, 'half crimp');
    const labels = await page.$$eval('#train-blocks-wrap .train-block-card:first-child .wk-boulder .wk-check-text', function(ns){ return ns.slice(0, 2).map(function(n){ return n.textContent.trim(); }); });
    assert.deepStrictEqual(labels, ['Boulder 1 · V4-6 blue cave', 'Boulder 2 · V4-6 green left']);
    await page.locator('#train-blocks-wrap .train-block-card:first-child .wk-boulder').first().click();
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.blocks[0].rounds[0].boulders[0].complete; }), true, 'tick works in the run');
    await page.click('#train-sess-save');
    await page.waitForTimeout(400);
    const run = firstBody(postsTo(recorded, 'training_sessions', 'POST'));
    assert.ok(run, 'session saved');
    assert.strictEqual(run.blocks[0].rounds[0].boulders[0].complete, true);
  });
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
console.log('real-flow-workout-save-and-run: ok');
