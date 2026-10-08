import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, readyDial, waitForScreen,
  postsTo, firstBody, USER_ID, ROUTE, GRADE, TERRAIN
} from './harness.mjs';

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {}, async function(page, recorded){
      await page.waitForFunction(function(){
        return typeof window.startLogFlow === 'function' && typeof window.selectLogResult === 'function';
      }, null, { timeout: 30000 });
      await page.evaluate(function(userId){
        window._authUser = { id: userId };
        window._authToken = 'test-token';
        window.loadClimbLog = function(){ return Promise.resolve(); };
        window.loadHomeScreen = function(){ return Promise.resolve(); };
        startLogFlow();
      }, USER_ID);
      await waitForScreen(page, 'screen-log-act');
      await page.waitForTimeout(80);
      await readyDial(page);
      await tap(page, '#log-act-continue');
      await waitForScreen(page, 'screen-log-result');
      await tap(page, '#btn-sent');
      await tap(page, '#log-result-continue');
      await page.waitForTimeout(300);
      var catalogOn = await page.evaluate(function(){
        var el = document.getElementById('screen-log-catalog');
        return !!(el && el.classList.contains('active'));
      });
      if(catalogOn) await tap(page, '#gym-catalog-skip');
      await waitForScreen(page, 'screen-log-terrain');
      await tap(page, '.terrain-chips .chip:has-text("Overhang")');
      await tap(page, '#log-terrain-continue');
      await waitForScreen(page, 'screen-log-details');
      await tap(page, '#log-details-continue');
      await waitForScreen(page, 'screen-log-grade');
      await tap(page, '#grade-grid .grade-btn:has-text("5.11a")');
      await tap(page, '#log-grade-continue');
      await waitForScreen(page, 'screen-log-name');
      await page.fill('#log-rname-input', ROUTE);
      await tap(page, '#log-name-save');
      await page.waitForTimeout(700);
      var posts = postsTo(recorded, 'sessions', 'POST');
      assert.ok(posts.length, 'log climb did not POST /rest/v1/sessions');
      var body = firstBody(posts);
      assert.strictEqual(body.baseline_zone, 'sent');
      assert.strictEqual(body.grade_value, GRADE);
      assert.strictEqual(body.climbing_type, TERRAIN);
      assert.strictEqual(body.route_name, ROUTE);
      console.log('ok - log-climb POST sent/5.11a/Overhang/' + ROUTE);
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
