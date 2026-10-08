import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, postsTo, firstBody,
  sessionRow, USER_ID, CLIMB_ID
} from './harness.mjs';

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {}, async function(page, recorded){
      await page.waitForFunction(function(){
        return typeof window.editClimbFromLog === 'function' && typeof window.saveEditedClimb === 'function';
      }, null, { timeout: 30000 });
      await page.evaluate(function(args){
        window._authUser = { id: args.userId };
        window._authToken = 'test-token';
        window.loadClimbLog = function(){ return Promise.resolve(); };
        window.loadHomeScreen = function(){ return Promise.resolve(); };
        window._cachedClimbs = [args.session];
        editClimbFromLog(args.session.id, 'climb-table');
      }, { userId: USER_ID, session: sessionRow({ id: 'sess-edit-1', climb_id: CLIMB_ID }) });
      await page.waitForTimeout(80);
      var sheet = await page.evaluate(function(){
        var el = document.getElementById('edit-sheet');
        return el ? el.style.display : 'missing';
      });
      assert.notStrictEqual(sheet, 'none', 'edit sheet should open');
      await tap(page, '#edit-btn-fell');
      await tap(page, '#edit-save-changes-btn');
      await page.waitForTimeout(500);
      var patches = postsTo(recorded, 'sessions', 'PATCH');
      assert.ok(patches.length, 'edit sheet did not PATCH /rest/v1/sessions');
      var body = firstBody(patches);
      assert.strictEqual(body.baseline_zone, 'fell');
      assert.strictEqual(postsTo(recorded, 'falls', 'POST').length, 0, 'empty fall questionnaire must not insert falls');
      console.log('ok - edit-sheet PATCH baseline_zone fell, no falls insert');
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
