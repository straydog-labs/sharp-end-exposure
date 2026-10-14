import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  startStaticServer, launchChromium, withPage, tap, waitForScreen,
  postsTo, firstBody, sessionRow, USER_ID, CLIMB_ID, ROUTE, GRADE, TERRAIN
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index302'/.test(index));
assert.ok(/APP_VERSION = 'index302'/.test(sw));

assert.ok(/id="log-my-projects"/.test(index), 'screen-log-act must host #log-my-projects');
assert.ok(/function paintLogMyProjects\(/.test(index) || /function renderLogMyProjects\(/.test(index),
  'must paint My projects from startLogFlow');
assert.ok(/function pickLogMyProject\(/.test(index), 'tap must go through pickLogMyProject');
assert.ok(/pickLogMyProject[\s\S]{0,400}launchLogWithClimb\(/.test(index),
  'pickLogMyProject must reuse launchLogWithClimb, not a new select path');

const YELLOW = 'Yellow 30 degree';
const CLIMB_A = 'climb-yellow-overhang';
const CLIMB_B = 'climb-yellow-slab';

function climbA(){
  return { id: CLIMB_A, name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', is_project: true, setting: 'indoor' };
}
function climbB(){
  return { id: CLIMB_B, name: YELLOW, grade_value: '5.10a', climbing_type: 'Slab', is_project: true, setting: 'outdoor' };
}
function climbDone(){
  return { id: 'climb-done', name: 'Finished Project', grade_value: '5.12a', climbing_type: 'Roof', is_project: false };
}

async function bootLog(page, climbs, sessions){
  await page.waitForFunction(function(){
    return typeof window.startLogFlow === 'function'
      && typeof window.selectLogResult === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(args){
    window._authUser = { id: args.userId };
    window._authToken = 'test-token';
    window._climbCache = args.climbs;
    window._cachedClimbs = args.sessions;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window.loadClimbCache = function(){
      window._climbCache = args.climbs;
      return Promise.resolve(window._climbCache);
    };
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
    startLogFlow();
    window._climbCache = args.climbs;
    window._cachedClimbs = args.sessions;
    if(typeof paintLogMyProjects === 'function') paintLogMyProjects();
  }, { userId: USER_ID, climbs: climbs, sessions: sessions });
  await waitForScreen(page, 'screen-log-act');
  await page.waitForTimeout(80);
}

function projectRow(page){
  return page.evaluate(function(){
    var row = document.getElementById('log-my-projects');
    if(!row) return { missing: true, visible: false, items: [] };
    var hidden = row.hasAttribute('hidden') || row.style.display === 'none' || getComputedStyle(row).display === 'none';
    var items = Array.prototype.map.call(row.querySelectorAll('.log-my-project-item'), function(btn){
      return {
        id: btn.getAttribute('data-cid') || '',
        text: (btn.innerText || '').replace(/\s+/g, ' ').trim()
      };
    });
    return { missing: false, visible: !hidden, items: items };
  });
}

async function saveFromResult(page){
  await waitForScreen(page, 'screen-log-result');
  await tap(page, '#btn-sent');
  await tap(page, '#log-result-continue');
  await page.waitForTimeout(700);
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      climbs: [climbA(), climbB(), climbDone()],
      sessions: [
        sessionRow({ id: 'sess-a1', climb_id: CLIMB_A, route_name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', created_at: '2026-10-13T12:00:00.000Z' }),
        sessionRow({ id: 'sess-a2', climb_id: CLIMB_A, route_name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', created_at: '2026-10-14T12:00:00.000Z' }),
        sessionRow({ id: 'sess-b1', climb_id: CLIMB_B, route_name: YELLOW, grade_value: '5.10a', climbing_type: 'Slab', setting: 'outdoor', created_at: '2026-10-10T12:00:00.000Z' })
      ]
    }, async function(page, recorded){
      await bootLog(page, [climbA(), climbB(), climbDone()], [
        sessionRow({ id: 'sess-a2', climb_id: CLIMB_A, route_name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', created_at: '2026-10-14T12:00:00.000Z' }),
        sessionRow({ id: 'sess-a1', climb_id: CLIMB_A, route_name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', created_at: '2026-10-13T12:00:00.000Z' }),
        sessionRow({ id: 'sess-b1', climb_id: CLIMB_B, route_name: YELLOW, grade_value: '5.10a', climbing_type: 'Slab', setting: 'outdoor', created_at: '2026-10-10T12:00:00.000Z' })
      ]);
      var row = await projectRow(page);
      assert.strictEqual(row.missing, false, 'My projects row must exist on step 1');
      assert.strictEqual(row.visible, true, 'My projects row visible when open projects exist');
      var ids = row.items.map(function(i){ return i.id; });
      assert.ok(ids.indexOf(CLIMB_A) !== -1 && ids.indexOf(CLIMB_B) !== -1,
        'both same-name projects appear, got ' + JSON.stringify(row.items));
      assert.ok(ids.indexOf('climb-done') === -1, 'completed project must drop off');
      assert.ok(/5\.11a/.test(row.items[0].text || '') || row.items.some(function(i){ return /5\.11a/.test(i.text); }),
        'items show grade');
      assert.ok(row.items.some(function(i){ return /Overhang/.test(i.text); })
        && row.items.some(function(i){ return /Slab/.test(i.text); }),
        'items show terrain');

      await tap(page, '.log-my-project-item[data-cid="' + CLIMB_A + '"]');
      await saveFromResult(page);
      var posts = postsTo(recorded, 'sessions', 'POST');
      assert.ok(posts.length, 'tap project must POST a session');
      var body = firstBody(posts);
      assert.strictEqual(body.climb_id, CLIMB_A, 'saves exact climb_id, got ' + body.climb_id);
      assert.strictEqual(body.route_name, YELLOW);
      assert.strictEqual(body.grade_value, '5.11a');
      assert.strictEqual(body.climbing_type, 'Overhang');
      console.log('ok - tap-project-saves-exact-climb-id');
    });

    await withPage(browser, port, {
      climbs: [climbA(), climbB()],
      sessions: []
    }, async function(page, recorded){
      await bootLog(page, [climbA(), climbB()], []);
      var row = await projectRow(page);
      assert.ok(row.items.length >= 2, 'both same-name projects listed');
      await tap(page, '.log-my-project-item[data-cid="' + CLIMB_B + '"]');
      await saveFromResult(page);
      var body = firstBody(postsTo(recorded, 'sessions', 'POST'));
      assert.ok(body, 'second project must POST');
      assert.strictEqual(body.climb_id, CLIMB_B, 'second same-name project saves its own climb_id');
      assert.strictEqual(body.grade_value, '5.10a');
      assert.strictEqual(body.climbing_type, 'Slab');
      console.log('ok - same-name-projects-keep-own-climb-id');
    });

    await withPage(browser, port, {
      climbs: [{ id: CLIMB_ID, name: ROUTE, grade_value: GRADE, climbing_type: TERRAIN, is_project: false }],
      sessions: [sessionRow()]
    }, async function(page){
      await bootLog(page, [
        { id: CLIMB_ID, name: ROUTE, grade_value: GRADE, climbing_type: TERRAIN, is_project: false }
      ], [sessionRow()]);
      var row = await projectRow(page);
      assert.ok(row.missing || !row.visible, 'no My projects row when zero open projects');
      console.log('ok - no-row-with-zero-projects');
    });
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
  console.log('log-projects-pick tests: ok');
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
