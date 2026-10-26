import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  startStaticServer, launchChromium, withPage, tap, waitForScreen,
  sessionRow, USER_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index319'/.test(index));
assert.ok(/APP_VERSION = 'index319'/.test(sw));

var startChunk = index.slice(index.indexOf('function startLogFlow'), index.indexOf('function _resetLogFlowContinueButtons'));
assert.ok(/hasLogWhichClimbItems/.test(index), 'startLogFlow still decides skip via hasLogWhichClimbItems');
assert.ok(/finishLogWhichOrAct/.test(startChunk),
  'startLogFlow must finish picker-or-dial after caches are ready');
assert.ok(/ensureLogWhichClimbData/.test(index),
  'startLogFlow must load climb/session data before skipping Which climb?');
assert.ok(/function logWhichClimbDataReady/.test(index),
  'skip is allowed only after climb and session caches are loaded arrays');
assert.ok(/id="sessions-card-log"/.test(index), 'Climb tab Log a climb needs a stable entry id');
assert.ok(/LOG_WHICH_LOAD_MS\s*=\s*2000/.test(index),
  'picker load must fail open after ~2s');
assert.ok(/setTimeout\(settle,\s*LOG_WHICH_LOAD_MS\)/.test(index),
  'hanging climb/session fetch must settle via the 2s timer');

const YELLOW = 'Yellow 30 degree';
const CLIMB_A = 'climb-yellow-overhang';
const CLIMB_B = 'climb-yellow-slab';
const REC_1 = 'climb-blue-vert';
const REC_2 = 'climb-green-arete';
const REC_3 = 'climb-pink-roof';
const REC_4 = 'climb-black-crack';

function daysAgo(n){
  return new Date(Date.now() - n * 86400000).toISOString();
}
function project(id, name, grade, terrain){
  return { id: id, name: name, grade_value: grade, climbing_type: terrain, is_project: true, setting: 'indoor' };
}
function recentClimb(id, name, grade, terrain){
  return { id: id, name: name, grade_value: grade, climbing_type: terrain, is_project: false, setting: 'indoor' };
}
function baselineRow(){
  return {
    id: 'base-1',
    user_id: USER_ID,
    is_baseline: true,
    is_checkin: false,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00.000Z'
  };
}

const TWO_PROJECTS = [
  project(CLIMB_A, YELLOW, '5.11a', 'Overhang'),
  project(CLIMB_B, YELLOW, '5.10a', 'Slab')
];
const FOUR_RECENTS = [
  recentClimb(REC_1, 'Blue Vertical', '5.10a', 'Vertical'),
  recentClimb(REC_2, 'Green Arete', '5.11b', 'Arête'),
  recentClimb(REC_3, 'Pink Roof', '5.12a', 'Roof'),
  recentClimb(REC_4, 'Black Crack', '5.9', 'Crack')
];
const FOUR_RECENT_SESSIONS = [
  sessionRow({ id: 's-r1', climb_id: REC_1, route_name: 'Blue Vertical', grade_value: '5.10a', climbing_type: 'Vertical', created_at: daysAgo(1) }),
  sessionRow({ id: 's-r2', climb_id: REC_2, route_name: 'Green Arete', grade_value: '5.11b', climbing_type: 'Arête', created_at: daysAgo(2) }),
  sessionRow({ id: 's-r3', climb_id: REC_3, route_name: 'Pink Roof', grade_value: '5.12a', climbing_type: 'Roof', created_at: daysAgo(3) }),
  sessionRow({ id: 's-r4', climb_id: REC_4, route_name: 'Black Crack', grade_value: '5.9', climbing_type: 'Crack', created_at: daysAgo(4) })
];
const PROJECT_SESSIONS = [
  sessionRow({ id: 's-a', climb_id: CLIMB_A, route_name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', created_at: daysAgo(1) }),
  sessionRow({ id: 's-b', climb_id: CLIMB_B, route_name: YELLOW, grade_value: '5.10a', climbing_type: 'Slab', created_at: daysAgo(2) })
];

function liveStubOpts(extra){
  extra = extra || {};
  return Object.assign({
    session: { user: { id: USER_ID }, access_token: 'test-token' },
    climbs: TWO_PROJECTS.concat(FOUR_RECENTS),
    sessions: [baselineRow()].concat(PROJECT_SESSIONS, FOUR_RECENT_SESSIONS)
  }, extra);
}

async function waitHome(page){
  await page.waitForFunction(function(){
    var home = document.getElementById('screen-home');
    var log = document.getElementById('home-card-log');
    return !!(home && home.classList.contains('active') && log && typeof startLogFlow === 'function' && window._homeDataReady === true);
  }, null, { timeout: 30000 });
}

async function waitHomeVisible(page){
  await page.waitForFunction(function(){
    var home = document.getElementById('screen-home');
    var log = document.getElementById('home-card-log');
    return !!(home && home.classList.contains('active') && log && typeof startLogFlow === 'function');
  }, null, { timeout: 30000 });
}

async function activeId(page){
  return page.evaluate(function(){
    var el = document.querySelector('.screen.active');
    return el ? el.id : null;
  });
}

async function cacheState(page){
  return page.evaluate(function(){
    return {
      climbCache: window._climbCache,
      climbInflight: !!window._climbCacheInflight,
      cachedClimbs: window._cachedClimbs
    };
  });
}

async function wipeCaches(page){
  await page.evaluate(function(){
    window._climbCache = null;
    window._climbCacheInflight = null;
    window._cachedClimbs = undefined;
    window._cachedSessions = undefined;
    window._homeSessRows = null;
    window._homeSessInflight = null;
  });
}

async function waitPicker(page){
  await waitForScreen(page, 'screen-log-which');
  await page.waitForFunction(function(){
    var root = document.getElementById('log-my-projects');
    return !!(root && !root.hidden && root.querySelector('[data-cid]'));
  }, null, { timeout: 8000 });
  await pickerVisible(page);
}

async function waitFailOpenDial(page, timeout){
  await page.waitForFunction(function(){
    var el = document.querySelector('.screen.active');
    var load = document.getElementById('log-which-loading');
    var loadingOn = !!(load && !load.hidden);
    return !!(el && el.id === 'screen-log-act' && !loadingOn);
  }, null, { timeout: timeout || 3500 });
  var id = await activeId(page);
  assert.strictEqual(id, 'screen-log-act', 'fail-open must go to the dial, got ' + id);
  var loading = await page.evaluate(function(){
    var load = document.getElementById('log-which-loading');
    return !!(load && !load.hidden);
  });
  assert.strictEqual(loading, false, 'must not stay on Loading your climbs');
}

async function pickerVisible(page){
  var id = await activeId(page);
  assert.strictEqual(id, 'screen-log-which', 'expected Which climb? picker, got ' + id);
  var projects = await page.evaluate(function(){
    var root = document.getElementById('log-my-projects');
    if(!root || root.hidden) return [];
    return Array.prototype.map.call(root.querySelectorAll('[data-cid]'), function(btn){
      return btn.getAttribute('data-cid');
    });
  });
  assert.ok(projects.indexOf(CLIMB_A) !== -1 && projects.indexOf(CLIMB_B) !== -1,
    'picker must list both projects, got ' + JSON.stringify(projects));
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
    await flow('a-home-log-a-climb-with-projects-shows-picker', async function(){
      await withPage(browser, port, liveStubOpts(), async function(page){
        await waitHome(page);
        await tap(page, '#home-card-log');
        await waitPicker(page);
      });
    });

    await flow('b-home-log-a-climb-unloaded-cache-loads-then-picker', async function(){
      var delayMs = 500;
      await withPage(browser, port, liveStubOpts({
        stub: async function(route, info){
          if(info.method === 'GET' && info.url.indexOf('/rest/v1/climbs') !== -1){
            await new Promise(function(resolve){ setTimeout(resolve, delayMs); });
          }
          return false;
        }
      }), async function(page){
        await waitHome(page);
        await wipeCaches(page);
        var before = await cacheState(page);
        assert.ok(before.climbCache == null, 'climb cache must be unloaded at tap, got ' + JSON.stringify(before.climbCache));
        assert.ok(!Array.isArray(before.cachedClimbs), 'session cache must be unloaded at tap, got ' + typeof before.cachedClimbs);
        await tap(page, '#home-card-log');
        var immediate = await activeId(page);
        assert.notStrictEqual(immediate, 'screen-log-act',
          'must not skip to the dial while caches are still loading, got ' + immediate);
        await waitPicker(page);
      });
    });

    await flow('c-climb-tab-log-a-climb-shows-picker', async function(){
      await withPage(browser, port, liveStubOpts(), async function(page){
        await waitHome(page);
        await tap(page, '#fnav-sessions');
        await waitForScreen(page, 'screen-sessions');
        await tap(page, '#sessions-card-log');
        await waitPicker(page);
      });
    });

    await flow('d-empty-lists-skip-to-dial', async function(){
      await withPage(browser, port, {
        session: { user: { id: USER_ID }, access_token: 'test-token' },
        climbs: [],
        sessions: [baselineRow()]
      }, async function(page){
        await waitHome(page);
        await wipeCaches(page);
        await tap(page, '#home-card-log');
        await waitForScreen(page, 'screen-log-act');
        var id = await activeId(page);
        assert.strictEqual(id, 'screen-log-act', 'truly empty lists skip to the dial, got ' + id);
        var which = await page.evaluate(function(){
          var el = document.getElementById('screen-log-which');
          return !!(el && el.classList.contains('active'));
        });
        assert.strictEqual(which, false, 'Which climb? must not stay active when lists are empty');
      });
    });

    await flow('e-fetch-rejects-fail-open-to-dial', async function(){
      var blockRest = { on: false };
      await withPage(browser, port, liveStubOpts({
        stub: async function(route, info){
          if(!blockRest.on || info.method !== 'GET') return false;
          if(info.url.indexOf('/rest/v1/climbs') !== -1 || info.url.indexOf('/rest/v1/sessions') !== -1){
            await route.abort();
            return true;
          }
          return false;
        }
      }), async function(page){
        await waitHome(page);
        await wipeCaches(page);
        blockRest.on = true;
        await tap(page, '#home-card-log');
        await waitFailOpenDial(page, 3500);
      });
    });

    await flow('f-fetch-hangs-fail-open-to-dial', async function(){
      var blockRest = { on: false };
      await withPage(browser, port, liveStubOpts({
        stub: async function(route, info){
          if(!blockRest.on || info.method !== 'GET') return false;
          if(info.url.indexOf('/rest/v1/climbs') !== -1 || info.url.indexOf('/rest/v1/sessions') !== -1){
            await new Promise(function(){});
            return true;
          }
          return false;
        }
      }), async function(page){
        await waitHome(page);
        await wipeCaches(page);
        blockRest.on = true;
        var t0 = Date.now();
        await tap(page, '#home-card-log');
        await waitFailOpenDial(page, 3500);
        var elapsed = Date.now() - t0;
        assert.ok(elapsed < 3500, 'hang must fail open before 3.5s, took ' + elapsed);
      });
    });

    await flow('g-tap-log-while-home-inflight-shows-picker', async function(){
      var delayMs = 1200;
      await withPage(browser, port, liveStubOpts({
        stub: async function(route, info){
          if(info.method === 'GET' && (info.url.indexOf('/rest/v1/climbs') !== -1 || info.url.indexOf('/rest/v1/sessions') !== -1)){
            await new Promise(function(resolve){ setTimeout(resolve, delayMs); });
          }
          return false;
        }
      }), async function(page){
        await waitHomeVisible(page);
        var mid = await page.evaluate(function(){
          return {
            ready: window._homeDataReady === true,
            climbCache: window._climbCache
          };
        });
        assert.ok(mid.ready !== true, 'must tap before Home settles, ready=' + mid.ready);
        assert.ok(!Array.isArray(mid.climbCache), 'climb cache still in flight at tap');
        await tap(page, '#home-card-log');
        var immediate = await activeId(page);
        assert.notStrictEqual(immediate, 'screen-log-act',
          'must not skip to the dial while Home caches are still loading, got ' + immediate);
        await waitPicker(page);
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
  console.log('log-which-load tests: ok');
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
