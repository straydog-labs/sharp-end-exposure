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
        return typeof window.startDeeper === 'function'
          && typeof window.afterQ4 === 'function'
          && typeof window.selectDeepChip === 'function';
      }, null, { timeout: 30000 });
      await page.evaluate(function(userId){
        window._authUser = { id: userId };
        window._authToken = 'test-token';
        window.loadClimbLog = function(){ return Promise.resolve(); };
        window.loadHomeScreen = function(){ return Promise.resolve(); };
        logState.sessId = 'sess-deeper-1';
        logState.grade = '5.11a';
        logState.terrain = 'Overhang';
        logState.zone = 'learning';
        logState.zoneConf = 'estimated';
        startDeeper();
      }, USER_ID);
      await waitForScreen(page, 'screen-deeper');

      await tap(page, '#screen-deeper .chip[data-dq="q1"]:has-text("Easy and steady")');
      await tap(page, '#screen-deeper .chip[data-dq="q2"]:has-text("Settled, neutral")');
      await tap(page, '#screen-deeper .chip[data-dq="q3"]:has-text("Yes — I paused")');
      await tap(page, '#screen-deeper .chip[data-dq="q4"]:has-text("Settled and in control")');
      await tap(page, '#deeper-confirm-btn');
      await page.waitForTimeout(700);

      var patches = postsTo(recorded, 'sessions', 'PATCH');
      assert.ok(patches.length, 'go-deeper did not PATCH /rest/v1/sessions');
      var confirm = patches.map(function(r){
        var b = r.body;
        if(Array.isArray(b)) b = b[0];
        return b;
      }).find(function(b){
        return b && b.zone_confidence === 'confirmed';
      });
      assert.ok(confirm, 'no PATCH with zone_confidence confirmed (patches=' + patches.length + ')');
      assert.strictEqual(confirm.breathing_post, 'Easy and steady');
      assert.strictEqual(confirm.gut_post, 'Settled, neutral');
      assert.strictEqual(confirm.crux_response, 'Yes — I paused');
      assert.strictEqual(confirm.body_state, 'Settled and in control');
      assert.ok(confirm.zone === 'comfort' || confirm.zone === 'learning' || confirm.zone === 'panic', 'zone=' + confirm.zone);
      console.log('ok - go-deeper-confirm PATCH zone_confidence confirmed zone=' + confirm.zone);
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
