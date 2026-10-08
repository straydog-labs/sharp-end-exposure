import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, readyDial, waitForScreen,
  postsTo, firstBody, sessionRow, USER_ID, ROUTE, CLIMB_ID, GRADE, TERRAIN
} from './harness.mjs';

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {}, async function(page, recorded){
      await page.waitForFunction(function(){
        return typeof window.openHomeDaySheet === 'function'
          && typeof window.addAttemptFromLog === 'function'
          && typeof window.athleteLocalDayKeyFromIso === 'function';
      }, null, { timeout: 30000 });

      var todayKey = await page.evaluate(function(args){
        window._authUser = { id: args.userId };
        window._authToken = 'test-token';
        window.loadClimbLog = function(){ return Promise.resolve(); };
        window.loadHomeScreen = function(){ return Promise.resolve(); };
        var nowIso = new Date().toISOString();
        var today = athleteLocalDayKeyFromIso(nowIso);
        var row = Object.assign({}, args.session, { created_at: nowIso });
        window._homeLoadedClimbs = [row];
        window._homeRecentSessions = [row];
        window._homeLoadedTrains = [];
        window._trainAssignmentsCache = [];
        openHomeDaySheet(today);
        return today;
      }, { userId: USER_ID, session: sessionRow() });

      await page.waitForFunction(function(){
        var sheet = document.getElementById('home-day-sheet');
        return !!(sheet && !sheet.hidden);
      }, null, { timeout: 8000 });
      var sheetText = await page.evaluate(function(){
        var body = document.getElementById('home-day-sheet-body');
        return body ? body.textContent : '';
      });
      assert.ok(sheetText.indexOf(ROUTE) !== -1, 'home-day sheet should list ' + ROUTE + ' for ' + todayKey);

      var hasBtn = await page.locator('#home-day-sheet-body button:has-text("+ Attempt")').count();
      if(hasBtn){
        await tap(page, '#home-day-sheet-body button:has-text("+ Attempt")');
      } else {
        await page.evaluate(function(args){
          addAttemptFromLog(args.route, args.grade, args.terrain, args.climbId, 'home-day', 'indoor');
        }, { route: ROUTE, grade: GRADE, terrain: TERRAIN, climbId: CLIMB_ID });
      }

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
      console.log('ok - home-day-attempt POST route_name+climb_id via origin home-day');
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
