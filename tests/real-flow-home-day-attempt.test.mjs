import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, readyDial, waitForScreen,
  postsTo, firstBody, sessionRow, climbRow, USER_ID, ROUTE, CLIMB_ID, GRADE, TERRAIN
} from './harness.mjs';

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      session: { user: { id: USER_ID }, access_token: 'test-token' },
      climbs: [climbRow()],
      sessions: [sessionRow({ created_at: new Date().toISOString() })]
    }, async function(page, recorded){
      await page.waitForFunction(function(){
        var home = document.getElementById('screen-home');
        var dots = document.getElementById('home-week-dots');
        return !!(home && home.classList.contains('active')
          && window._homeDataReady === true && window._homeLoadsFinished === true
          && dots && dots.querySelector('button.home-week-dot'));
      }, null, { timeout: 30000 });

      var display = await page.evaluate(function(){
        var dots = document.getElementById('home-week-dots');
        var cs = dots ? getComputedStyle(dots) : null;
        return cs ? cs.display : '';
      });
      assert.notStrictEqual(display, 'none', 'week dots must be visible to tap, display=' + display);

      var btnCount = await page.locator('#home-week-dots button.home-week-dot').count();
      assert.ok(btnCount >= 1, 'filled week-dot button missing');
      await tap(page, '#home-week-dots button.home-week-dot');

      await page.waitForFunction(function(){
        var sheet = document.getElementById('home-day-sheet');
        return !!(sheet && !sheet.hidden);
      }, null, { timeout: 8000 });
      var sheetText = await page.evaluate(function(){
        var body = document.getElementById('home-day-sheet-body');
        return body ? body.textContent : '';
      });
      assert.ok(sheetText.indexOf(ROUTE) !== -1, 'home-day sheet should list ' + ROUTE + ' after tapping a week dot');

      var hasBtn = await page.locator('#home-day-sheet-body button:has-text("+ Attempt")').count();
      assert.ok(hasBtn, '+ Attempt missing from day sheet after week-dot tap');
      await tap(page, '#home-day-sheet-body button:has-text("+ Attempt")');

      await waitForScreen(page, 'screen-log-act');
      await page.waitForTimeout(80);
      await readyDial(page);
      await tap(page, '#log-act-continue');
      await waitForScreen(page, 'screen-log-result');
      await tap(page, '#btn-sent');
      await tap(page, '#log-result-continue');
      await page.waitForTimeout(700);

      var posts = postsTo(recorded, 'sessions', 'POST');
      assert.ok(posts.length, 'home-day-attempt did not POST /rest/v1/sessions');
      var body = firstBody(posts);
      assert.strictEqual(body.route_name, ROUTE);
      assert.strictEqual(body.climb_id, CLIMB_ID);
      assert.strictEqual(body.baseline_zone, 'sent');
      console.log('ok - home-day-attempt TAP week-dot then +Attempt POST route_name+climb_id');
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
