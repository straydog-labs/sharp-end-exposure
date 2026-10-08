import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, waitForScreen,
  postsTo, firstBody, USER_ID
} from './harness.mjs';

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {}, async function(page, recorded){
      await page.waitForFunction(function(){
        return typeof window.startPrepareFlow === 'function'
          && typeof window.computeResult === 'function'
          && Array.isArray(window.Qs);
      }, null, { timeout: 30000 });
      await page.evaluate(function(userId){
        window._authUser = { id: userId };
        window._authToken = 'test-token';
        window.loadClimbLog = function(){ return Promise.resolve(); };
        window.loadHomeScreen = function(){ return Promise.resolve(); };
        startPrepareFlow();
      }, USER_ID);
      await waitForScreen(page, 's-assess');

      await tap(page, '#q-wrap .chip:has-text("Easy and steady")');
      await tap(page, '#btn-next');
      await page.waitForTimeout(80);

      await tap(page, '#q-wrap .chip:has-text("Settled, neutral")');
      await tap(page, '#btn-next');
      await waitForScreen(page, 's-pause');
      await tap(page, '#s-pause button:has-text("Ready")');
      await waitForScreen(page, 's-assess');

      await tap(page, '#q-wrap .chip:has-text("No change")');
      await tap(page, '#btn-next');
      await page.waitForTimeout(80);

      await tap(page, '#q-wrap .chip:has-text("Same as before")');
      await tap(page, '#btn-next');
      await page.waitForTimeout(80);

      await tap(page, '#btn-next');
      await page.waitForTimeout(80);

      await tap(page, '#q-wrap .chip:has-text("Genuine curiosity")');
      await tap(page, '#btn-next');
      await page.waitForTimeout(700);

      var posts = postsTo(recorded, 'sessions', 'POST');
      assert.ok(posts.length, 'prepare-checkin did not POST /rest/v1/sessions');
      var body = firstBody(posts);
      assert.strictEqual(body.is_checkin, true);
      assert.strictEqual(body.baseline_zone, 'checkin');
      assert.strictEqual(body.zone_confidence, 'confirmed');
      assert.strictEqual(body.zone, 'comfort');
      assert.strictEqual(body.prepare_breath, 'Easy and steady');
      assert.strictEqual(body.prepare_gut, 'Settled, neutral');
      assert.strictEqual(body.prepare_breath_post, 'No change — same');
      assert.strictEqual(body.prepare_gut_post, 'Same as before');
      assert.strictEqual(body.prepare_motivation, 'Genuine curiosity');
      assert.ok(body.prepare_answers, 'prepare_answers JSON');
      console.log('ok - prepare-checkin POST is_checkin checkin/comfort');
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
