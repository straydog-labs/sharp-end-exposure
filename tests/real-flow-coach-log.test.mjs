import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, postsTo, firstBody,
  COACH_ID, ATHLETE_ID, TERRAIN
} from './harness.mjs';

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      session: {
        access_token: 'test-token',
        user: { id: COACH_ID, email: 'coach@test.local' }
      }
    }, async function(page, recorded){
      await page.waitForFunction(function(){
        return typeof window.CoachLogSession === 'object' && !!window.CoachLogSession.buildPayload;
      }, null, { timeout: 30000 });
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await page.waitForSelector('#coach-log-launch', { timeout: 8000 });
      await tap(page, '#coach-log-launch');
      await page.waitForFunction(function(){
        var el = document.getElementById('coach-log-overlay');
        return !!(el && el.classList.contains('open'));
      }, null, { timeout: 8000 });
      await page.waitForSelector('#clog-gauge .gauge-dial-target', { timeout: 8000 });
      var before = await page.evaluate(function(){
        var save = document.getElementById('clog-save');
        return {
          saveDisabled: !!(save && save.disabled),
          hasNumber: !!document.getElementById('clog-activation'),
          hasZoneChips: !!document.getElementById('clog-zone-chips')
        };
      });
      assert.strictEqual(before.hasNumber, false, 'no Activation number box');
      assert.strictEqual(before.hasZoneChips, false, 'no zone chips');
      assert.ok(before.saveDisabled, 'Save disabled until the dial is set');
      await page.evaluate(function(){
        var target = document.querySelector('#clog-gauge .gauge-dial-target');
        var wrap = document.querySelector('#clog-gauge .clog-gauge-wrap');
        if(!target || !wrap) throw new Error('gauge target missing');
        var rect = wrap.getBoundingClientRect();
        var x = rect.left + rect.width * 0.5;
        var y = rect.top + rect.height * 0.2;
        var opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y };
        target.dispatchEvent(new PointerEvent('pointerdown', opts));
        wrap.dispatchEvent(new PointerEvent('pointerdown', opts));
        target.dispatchEvent(new PointerEvent('pointermove', opts));
        wrap.dispatchEvent(new PointerEvent('pointermove', opts));
        target.dispatchEvent(new PointerEvent('pointerup', opts));
        wrap.dispatchEvent(new PointerEvent('pointerup', opts));
      });
      await page.waitForFunction(function(){
        var el = document.querySelector('.clog-gauge-readout');
        return !!(el && !/Drag to set/.test(el.textContent || ''));
      }, null, { timeout: 5000 });
      var terrains = page.locator('#clog-terrains button');
      if(await terrains.count()){
        await terrains.filter({ hasText: TERRAIN }).first().click({ force: true });
      }
      await tap(page, '#clog-save');
      await page.waitForTimeout(700);
      var posts = postsTo(recorded, 'sessions', 'POST');
      var postMsg = await page.evaluate(function(){
        var el = document.getElementById('clog-msg');
        return el ? el.textContent : '';
      });
      assert.ok(posts.length, 'coach log did not POST /rest/v1/sessions (' + postMsg + ')');
      var body = firstBody(posts);
      assert.strictEqual(body.user_id, ATHLETE_ID);
      assert.strictEqual(body.logged_by_coach, true);
      assert.strictEqual(body.logged_by, COACH_ID);
      assert.ok(body.zone === 'comfort' || body.zone === 'learning' || body.zone === 'panic', 'zone=' + body.zone);
      assert.ok(typeof body.coach_activation_score === 'number', 'dial must post coach_activation_score');
      if(body.coach_activation_score <= 4) assert.strictEqual(body.zone, 'comfort');
      else if(body.coach_activation_score <= 9) assert.strictEqual(body.zone, 'learning');
      else assert.strictEqual(body.zone, 'panic');
      assert.ok(body.device_id, 'device_id required');
      assert.ok(/Saved/.test(postMsg) || /logged/i.test(postMsg), 'visible save result: ' + postMsg);
      console.log('ok - coach-log POST logged_by_coach user_id=' + body.user_id + ' zone=' + body.zone + ' score=' + body.coach_activation_score);
    });
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
