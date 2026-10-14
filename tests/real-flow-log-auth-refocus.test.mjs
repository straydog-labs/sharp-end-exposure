import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, readyDial, waitForScreen,
  USER_ID
} from './harness.mjs';

const OTHER_USER = 'user-regression-2';

async function authPage(page, userId){
  await page.waitForFunction(function(){
    return typeof window.startLogFlow === 'function'
      && typeof window.routeSignedInHome === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(id){
    window._authUser = { id: id };
    window._authToken = 'test-token';
    window._hasRoutedAfterSignIn = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window.loadHomeInsight = function(){ return Promise.resolve(); };
  }, userId || USER_ID);
}

async function finishLogToStep6(page){
  await page.evaluate(function(){ startLogFlow(); });
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
}

async function fireSignedIn(page, userId, fromSignedOut){
  await page.evaluate(function(args){
    if(args.fromSignedOut){
      window._authUser = null;
      window._authToken = null;
    }
    window._hasRoutedAfterSignIn = false;
    var session = args.userId
      ? { user: { id: args.userId }, access_token: 'test-token' }
      : null;
    if(typeof applyAuthStateChange === 'function'){
      applyAuthStateChange('SIGNED_IN', session);
      return;
    }
    // Current main: a late SIGNED_IN after the one-shot guard is cleared
    // always calls routeSignedInHome, including same-user refocus.
    if(session && session.user){
      window._authUser = session.user;
      window._authToken = session.access_token;
    }
    routeSignedInHome();
  }, { userId: userId, fromSignedOut: !!fromSignedOut });
  await page.waitForTimeout(200);
}

async function activeScreen(page){
  return page.evaluate(function(){
    var el = document.querySelector('.screen.active');
    return {
      id: el ? el.id : null,
      grade: window.logState && window.logState.grade,
      terrain: window.logState && window.logState.terrain,
      result: window.logState && window.logState.result
    };
  });
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  var failed = [];
  async function flow(name, fn){
    try{
      await fn();
      console.log('ok - ' + name);
    }catch(e){
      failed.push(name + ': ' + (e && e.message ? e.message : e));
      console.error('not ok - ' + name + ' ' + (e && e.stack ? e.stack : e));
    }
  }

  try{
    await flow('same-user-signed-in-keeps-log-step-6', async function(){
      await withPage(browser, port, {}, async function(page){
        await authPage(page, USER_ID);
        await finishLogToStep6(page);
        await fireSignedIn(page, USER_ID, false);
        var state = await activeScreen(page);
        assert.strictEqual(state.id, 'screen-log-name',
          'same-user SIGNED_IN must stay on log step 6, got ' + state.id);
        assert.strictEqual(state.grade, '5.11a', 'same-user SIGNED_IN must keep log grade');
        assert.strictEqual(state.terrain, 'Overhang', 'same-user SIGNED_IN must keep log terrain');
        assert.strictEqual(state.result, 'sent', 'same-user SIGNED_IN must keep log result');
      });
    });

    await flow('different-user-signed-in-routes-home', async function(){
      await withPage(browser, port, {}, async function(page){
        await authPage(page, USER_ID);
        await finishLogToStep6(page);
        await fireSignedIn(page, OTHER_USER, false);
        await page.waitForTimeout(400);
        var state = await activeScreen(page);
        assert.strictEqual(state.id, 'screen-home',
          'different user SIGNED_IN must route Home, got ' + state.id);
      });
    });

    await flow('signed-out-to-signed-in-routes-home', async function(){
      await withPage(browser, port, {}, async function(page){
        await authPage(page, USER_ID);
        await finishLogToStep6(page);
        await fireSignedIn(page, USER_ID, true);
        await page.waitForTimeout(400);
        var state = await activeScreen(page);
        assert.strictEqual(state.id, 'screen-home',
          'signed-out -> signed-in must route Home, got ' + state.id);
      });
    });
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }

  if(failed.length){
    console.error('\nFAILED\n' + failed.join('\n'));
    process.exit(1);
  }
  console.log('log-auth-refocus tests: ok');
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
