import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  startStaticServer, launchChromium, withPage, tap, readyDial, waitForScreen,
  postsTo, firstBody, sessionRow, USER_ID, CLIMB_ID, ROUTE, GRADE, TERRAIN
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index306'/.test(index));
assert.ok(/APP_VERSION = 'index306'/.test(sw));

assert.ok(/id="screen-log-which"/.test(index), 'must add a Which climb? first screen');
assert.ok(/Which climb\?/.test(index), 'first screen title is Which climb?');
assert.ok(/id="log-new-climb-btn"/.test(index), 'full-width New climb button');
var actChunk = index.slice(index.indexOf('id="screen-log-act"'), index.indexOf('id="screen-log-result"'));
assert.ok(actChunk.indexOf('log-my-projects') === -1,
  'dial screen must not host My projects');
assert.ok(/function pickLogMyProject\(/.test(index) || /function pickLogWhichClimb\(/.test(index),
  'tap must go through a known-climb picker');
assert.ok(/pickLogMyProject[\s\S]{0,900}launchLogWithClimb\(|pickLogWhichClimb[\s\S]{0,900}launchLogWithClimb\(/.test(index),
  'picker must reuse launchLogWithClimb');
assert.ok(!/pickLogMyProject[\s\S]{0,900}skipToResult:\s*true/.test(index),
  'row tap must not skip the activation dial');
assert.ok(/function backFromLogActivation\(/.test(index), 'dial Back must go through backFromLogActivation');
assert.ok(/backFromLogActivation[\s\S]{0,500}_selectedClimbId = null/.test(index),
  'Back from dial must clear the selected climb');

const YELLOW = 'Yellow 30 degree';
const CLIMB_A = 'climb-yellow-overhang';
const CLIMB_B = 'climb-yellow-slab';
const REC_1 = 'climb-blue-vert';
const REC_2 = 'climb-green-arete';
const REC_3 = 'climb-pink-roof';
const REC_4 = 'climb-black-crack';
const BOTH = 'climb-in-both';

function daysAgo(n){
  return new Date(Date.now() - n * 86400000).toISOString();
}
function climbA(){
  return { id: CLIMB_A, name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', is_project: true, setting: 'indoor' };
}
function climbB(){
  return { id: CLIMB_B, name: YELLOW, grade_value: '5.10a', climbing_type: 'Slab', is_project: true, setting: 'outdoor' };
}
function climbDone(){
  return { id: 'climb-done', name: 'Finished Project', grade_value: '5.12a', climbing_type: 'Roof', is_project: false };
}
function climbNullGrade(){
  return { id: 'climb-null-grade', name: 'Mystery Roof', grade_value: null, climbing_type: 'Roof', is_project: true, setting: 'indoor' };
}
function climbNullTerrain(){
  return { id: 'climb-null-terrain', name: 'No Terrain', grade_value: '5.9', climbing_type: null, is_project: true, setting: 'indoor' };
}
function recentClimb(id, name, grade, terrain){
  return { id: id, name: name, grade_value: grade, climbing_type: terrain, is_project: false, setting: 'indoor' };
}

async function logPickState(page){
  return page.evaluate(function(){
    var el = document.querySelector('.screen.active');
    var cont = document.getElementById('log-act-continue');
    return {
      id: el ? el.id : null,
      routeName: window.logState && window.logState.routeName,
      grade: window.logState && window.logState.grade,
      terrain: window.logState && window.logState.terrain,
      climbId: window._selectedClimbId || null,
      continueReady: !!(cont && cont.classList.contains('ready')),
      activation: window.logState && window.logState.userActivationEstimate
    };
  });
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
    if(typeof paintLogWhichClimb === 'function') paintLogWhichClimb();
    else if(typeof paintLogMyProjects === 'function') paintLogMyProjects();
    if(typeof hasLogWhichClimbItems === 'function' && hasLogWhichClimbItems()){
      showScreen('screen-log-which');
    }
  }, { userId: USER_ID, climbs: climbs, sessions: sessions });
  await page.waitForTimeout(80);
}

function sectionItems(page, rootId){
  return page.evaluate(function(id){
    var root = document.getElementById(id);
    if(!root) return { missing: true, visible: false, items: [] };
    var hidden = root.hasAttribute('hidden') || root.style.display === 'none'
      || getComputedStyle(root).display === 'none';
    var items = Array.prototype.map.call(root.querySelectorAll('[data-cid]'), function(btn){
      return {
        id: btn.getAttribute('data-cid') || '',
        text: (btn.innerText || '').replace(/\s+/g, ' ').trim()
      };
    });
    return { missing: false, visible: !hidden, items: items };
  }, rootId);
}

async function saveThroughDial(page){
  await waitForScreen(page, 'screen-log-act');
  var before = await logPickState(page);
  assert.strictEqual(before.continueReady, false, 'activation continue must wait for the dial');
  await readyDial(page);
  await tap(page, '#log-act-continue');
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
        sessionRow({ id: 'sess-a1', climb_id: CLIMB_A, route_name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', created_at: daysAgo(1) }),
        sessionRow({ id: 'sess-a2', climb_id: CLIMB_A, route_name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', created_at: daysAgo(0) }),
        sessionRow({ id: 'sess-b1', climb_id: CLIMB_B, route_name: YELLOW, grade_value: '5.10a', climbing_type: 'Slab', setting: 'outdoor', created_at: daysAgo(4) })
      ]
    }, async function(page, recorded){
      await bootLog(page, [climbA(), climbB(), climbDone()], [
        sessionRow({ id: 'sess-a2', climb_id: CLIMB_A, route_name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', created_at: daysAgo(0) }),
        sessionRow({ id: 'sess-a1', climb_id: CLIMB_A, route_name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', created_at: daysAgo(1) }),
        sessionRow({ id: 'sess-b1', climb_id: CLIMB_B, route_name: YELLOW, grade_value: '5.10a', climbing_type: 'Slab', setting: 'outdoor', created_at: daysAgo(4) })
      ]);
      await waitForScreen(page, 'screen-log-which');
      var which = await logPickState(page);
      assert.strictEqual(which.id, 'screen-log-which', 'projects open Which climb?, got ' + which.id);
      var newBtn = await page.evaluate(function(){
        var b = document.getElementById('log-new-climb-btn');
        if(!b) return { missing: true };
        var r = b.getBoundingClientRect();
        return { missing: false, text: (b.innerText || '').trim(), width: r.width, top: r.top };
      });
      assert.strictEqual(newBtn.missing, false, 'New climb button present');
      assert.ok(/New climb/i.test(newBtn.text), 'New climb label');
      var projects = await sectionItems(page, 'log-my-projects');
      assert.strictEqual(projects.visible, true, 'My projects visible when open projects exist');
      var ids = projects.items.map(function(i){ return i.id; });
      assert.ok(ids.indexOf(CLIMB_A) !== -1 && ids.indexOf(CLIMB_B) !== -1,
        'both same-name projects appear, got ' + JSON.stringify(projects.items));
      assert.ok(ids.indexOf('climb-done') === -1, 'completed project must drop off');
      assert.ok(projects.items.some(function(i){ return /5\.11a/.test(i.text); }), 'items show grade');
      assert.ok(projects.items.some(function(i){ return /Overhang/.test(i.text); })
        && projects.items.some(function(i){ return /Slab/.test(i.text); }),
        'items show terrain');
      assert.ok(projects.items.some(function(i){ return /attempt/i.test(i.text); }), 'items show attempt count');

      await tap(page, '#log-my-projects [data-cid="' + CLIMB_A + '"]');
      await page.waitForTimeout(250);
      var afterTap = await logPickState(page);
      assert.strictEqual(afterTap.id, 'screen-log-act',
        'project tap must open the activation dial, got ' + afterTap.id);
      await saveThroughDial(page);
      var posts = postsTo(recorded, 'sessions', 'POST');
      assert.ok(posts.length, 'tap project must POST a session');
      var body = firstBody(posts);
      assert.strictEqual(body.climb_id, CLIMB_A, 'saves exact climb_id, got ' + body.climb_id);
      assert.strictEqual(body.route_name, YELLOW);
      assert.strictEqual(body.grade_value, '5.11a');
      assert.strictEqual(body.climbing_type, 'Overhang');
      assert.equal(typeof body.user_activation_estimate, 'number',
        'activation value is required, got ' + body.user_activation_estimate);
      console.log('ok - tap-project-saves-exact-climb-id-with-activation');
    });

    await withPage(browser, port, {
      climbs: [
        recentClimb(REC_1, 'Blue Vertical', '5.10a', 'Vertical'),
        recentClimb(REC_2, 'Green Arete', '5.11b', 'Arête')
      ],
      sessions: [
        sessionRow({ id: 's-r1', climb_id: REC_1, route_name: 'Blue Vertical', grade_value: '5.10a', climbing_type: 'Vertical', created_at: daysAgo(2) }),
        sessionRow({ id: 's-r2', climb_id: REC_2, route_name: 'Green Arete', grade_value: '5.11b', climbing_type: 'Arête', created_at: daysAgo(3) })
      ]
    }, async function(page, recorded){
      await bootLog(page, [
        recentClimb(REC_1, 'Blue Vertical', '5.10a', 'Vertical'),
        recentClimb(REC_2, 'Green Arete', '5.11b', 'Arête')
      ], [
        sessionRow({ id: 's-r1', climb_id: REC_1, route_name: 'Blue Vertical', grade_value: '5.10a', climbing_type: 'Vertical', created_at: daysAgo(2) }),
        sessionRow({ id: 's-r2', climb_id: REC_2, route_name: 'Green Arete', grade_value: '5.11b', climbing_type: 'Arête', created_at: daysAgo(3) })
      ]);
      await waitForScreen(page, 'screen-log-which');
      var recents = await sectionItems(page, 'log-recent-climbs');
      assert.strictEqual(recents.visible, true, 'Recent list visible');
      var rids = recents.items.map(function(i){ return i.id; });
      assert.ok(rids.indexOf(REC_1) !== -1 && rids.indexOf(REC_2) !== -1,
        'recent named climbs listed, got ' + JSON.stringify(recents.items));
      await tap(page, '#log-recent-climbs [data-cid="' + REC_2 + '"]');
      await page.waitForTimeout(250);
      var afterTap = await logPickState(page);
      assert.strictEqual(afterTap.id, 'screen-log-act', 'recent tap opens the dial, got ' + afterTap.id);
      await saveThroughDial(page);
      var body = firstBody(postsTo(recorded, 'sessions', 'POST'));
      assert.ok(body, 'recent tap must POST');
      assert.strictEqual(body.climb_id, REC_2, 'recent saves exact climb_id');
      assert.equal(typeof body.user_activation_estimate, 'number', 'activation value is required');
      console.log('ok - tap-recent-saves-exact-climb-id-with-activation');
    });

    await withPage(browser, port, {
      climbs: [climbA(), recentClimb(REC_1, 'Blue Vertical', '5.10a', 'Vertical')],
      sessions: [
        sessionRow({ id: 's-a', climb_id: CLIMB_A, route_name: YELLOW, created_at: daysAgo(1) }),
        sessionRow({ id: 's-r', climb_id: REC_1, route_name: 'Blue Vertical', created_at: daysAgo(2) })
      ]
    }, async function(page, recorded){
      await bootLog(page, [climbA(), recentClimb(REC_1, 'Blue Vertical', '5.10a', 'Vertical')], [
        sessionRow({ id: 's-a', climb_id: CLIMB_A, route_name: YELLOW, created_at: daysAgo(1) }),
        sessionRow({ id: 's-r', climb_id: REC_1, route_name: 'Blue Vertical', created_at: daysAgo(2) })
      ]);
      await waitForScreen(page, 'screen-log-which');
      await tap(page, '#log-new-climb-btn');
      await waitForScreen(page, 'screen-log-act');
      var st = await logPickState(page);
      assert.ok(!st.climbId, 'New climb must not pre-select a climb_id');
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
      var body = firstBody(postsTo(recorded, 'sessions', 'POST'));
      assert.ok(body, 'New climb path must POST');
      assert.strictEqual(body.route_name, ROUTE);
      assert.strictEqual(body.grade_value, GRADE);
      assert.strictEqual(body.climbing_type, TERRAIN);
      assert.notStrictEqual(body.climb_id, CLIMB_A, 'New climb must not reuse the project climb_id');
      console.log('ok - new-climb-path-unchanged');
    });

    await withPage(browser, port, {
      climbs: [{ id: CLIMB_ID, name: ROUTE, grade_value: GRADE, climbing_type: TERRAIN, is_project: false }],
      sessions: [sessionRow({ created_at: daysAgo(20), climb_id: CLIMB_ID, route_name: ROUTE })]
    }, async function(page){
      await bootLog(page, [
        { id: CLIMB_ID, name: ROUTE, grade_value: GRADE, climbing_type: TERRAIN, is_project: false }
      ], [sessionRow({ created_at: daysAgo(20), climb_id: CLIMB_ID, route_name: ROUTE })]);
      await waitForScreen(page, 'screen-log-act');
      var st = await logPickState(page);
      assert.strictEqual(st.id, 'screen-log-act', 'zero projects + zero recents skips Which climb?');
      var which = await page.evaluate(function(){
        var el = document.getElementById('screen-log-which');
        return !!(el && el.classList.contains('active'));
      });
      assert.strictEqual(which, false, 'Which climb? must not be active when empty');
      console.log('ok - empty-lists-skip-which-climb');
    });

    await withPage(browser, port, {
      climbs: [
        { id: BOTH, name: 'Shared Route', grade_value: '5.10c', climbing_type: 'Vertical', is_project: true },
        recentClimb(REC_1, 'Blue Vertical', '5.10a', 'Vertical')
      ],
      sessions: [
        sessionRow({ id: 's-both', climb_id: BOTH, route_name: 'Shared Route', created_at: daysAgo(1) }),
        sessionRow({ id: 's-r', climb_id: REC_1, route_name: 'Blue Vertical', created_at: daysAgo(2) })
      ]
    }, async function(page){
      await bootLog(page, [
        { id: BOTH, name: 'Shared Route', grade_value: '5.10c', climbing_type: 'Vertical', is_project: true },
        recentClimb(REC_1, 'Blue Vertical', '5.10a', 'Vertical')
      ], [
        sessionRow({ id: 's-both', climb_id: BOTH, route_name: 'Shared Route', created_at: daysAgo(1) }),
        sessionRow({ id: 's-r', climb_id: REC_1, route_name: 'Blue Vertical', created_at: daysAgo(2) })
      ]);
      await waitForScreen(page, 'screen-log-which');
      var projects = await sectionItems(page, 'log-my-projects');
      var recents = await sectionItems(page, 'log-recent-climbs');
      var pids = projects.items.map(function(i){ return i.id; });
      var rids = recents.items.map(function(i){ return i.id; });
      assert.ok(pids.indexOf(BOTH) !== -1, 'shared climb listed under My projects');
      assert.ok(rids.indexOf(BOTH) === -1, 'shared climb must not also appear under Recent');
      assert.ok(rids.indexOf(REC_1) !== -1, 'non-project recent still listed');
      console.log('ok - climb-in-both-lists-appears-once-under-projects');
    });

    await withPage(browser, port, {
      climbs: [
        climbA(),
        recentClimb(REC_1, 'Blue Vertical', '5.10a', 'Vertical'),
        recentClimb(REC_2, 'Green Arete', '5.11b', 'Arête'),
        recentClimb(REC_3, 'Pink Roof', '5.12a', 'Roof'),
        recentClimb(REC_4, 'Black Crack', '5.9', 'Crack'),
        recentClimb('climb-extra', 'Extra Oldish', '5.8', 'Slab'),
        recentClimb('climb-unnamed', '', '5.7', 'Vertical'),
        recentClimb('climb-stale', 'Stale Route', '5.6', 'Slab')
      ],
      sessions: [
        sessionRow({ id: 's-a', climb_id: CLIMB_A, route_name: YELLOW, created_at: daysAgo(1) }),
        sessionRow({ id: 's1', climb_id: REC_1, route_name: 'Blue Vertical', created_at: daysAgo(1) }),
        sessionRow({ id: 's2', climb_id: REC_2, route_name: 'Green Arete', created_at: daysAgo(2) }),
        sessionRow({ id: 's3', climb_id: REC_3, route_name: 'Pink Roof', created_at: daysAgo(3) }),
        sessionRow({ id: 's4', climb_id: REC_4, route_name: 'Black Crack', created_at: daysAgo(4) }),
        sessionRow({ id: 's5', climb_id: 'climb-extra', route_name: 'Extra Oldish', created_at: daysAgo(5) }),
        sessionRow({ id: 's6', climb_id: 'climb-unnamed', route_name: '', created_at: daysAgo(1) }),
        sessionRow({ id: 's7', climb_id: 'climb-stale', route_name: 'Stale Route', created_at: daysAgo(20) })
      ]
    }, async function(page){
      await bootLog(page, [
        climbA(),
        recentClimb(REC_1, 'Blue Vertical', '5.10a', 'Vertical'),
        recentClimb(REC_2, 'Green Arete', '5.11b', 'Arête'),
        recentClimb(REC_3, 'Pink Roof', '5.12a', 'Roof'),
        recentClimb(REC_4, 'Black Crack', '5.9', 'Crack'),
        recentClimb('climb-extra', 'Extra Oldish', '5.8', 'Slab'),
        recentClimb('climb-unnamed', '', '5.7', 'Vertical'),
        recentClimb('climb-stale', 'Stale Route', '5.6', 'Slab')
      ], [
        sessionRow({ id: 's-a', climb_id: CLIMB_A, route_name: YELLOW, created_at: daysAgo(1) }),
        sessionRow({ id: 's1', climb_id: REC_1, route_name: 'Blue Vertical', created_at: daysAgo(1) }),
        sessionRow({ id: 's2', climb_id: REC_2, route_name: 'Green Arete', created_at: daysAgo(2) }),
        sessionRow({ id: 's3', climb_id: REC_3, route_name: 'Pink Roof', created_at: daysAgo(3) }),
        sessionRow({ id: 's4', climb_id: REC_4, route_name: 'Black Crack', created_at: daysAgo(4) }),
        sessionRow({ id: 's5', climb_id: 'climb-extra', route_name: 'Extra Oldish', created_at: daysAgo(5) }),
        sessionRow({ id: 's6', climb_id: 'climb-unnamed', route_name: '', created_at: daysAgo(1) }),
        sessionRow({ id: 's7', climb_id: 'climb-stale', route_name: 'Stale Route', created_at: daysAgo(20) })
      ]);
      await waitForScreen(page, 'screen-log-which');
      var recents = await sectionItems(page, 'log-recent-climbs');
      var rids = recents.items.map(function(i){ return i.id; });
      assert.ok(rids.length <= 5, 'Recent shows at most 5, got ' + rids.length);
      assert.ok(rids.indexOf(CLIMB_A) === -1, 'project excluded from Recent');
      assert.ok(rids.indexOf('climb-unnamed') === -1, 'unnamed climbs skipped');
      assert.ok(rids.indexOf('climb-stale') === -1, 'attempts older than 14 days skipped');
      console.log('ok - recents-distinct-14d-exclude-projects-unnamed');
    });

    await withPage(browser, port, {
      climbs: [climbNullGrade()],
      sessions: []
    }, async function(page){
      await bootLog(page, [climbNullGrade()], []);
      await waitForScreen(page, 'screen-log-which');
      await tap(page, '#log-my-projects [data-cid="climb-null-grade"]');
      await page.waitForTimeout(250);
      var state = await logPickState(page);
      assert.notStrictEqual(state.id, 'screen-log-result',
        'null grade must not jump to result, got ' + state.id);
      assert.strictEqual(state.id, 'screen-log-act',
        'null grade still opens the dial first, got ' + state.id);
      await readyDial(page);
      await tap(page, '#log-act-continue');
      await waitForScreen(page, 'screen-log-result');
      await tap(page, '#btn-sent');
      await tap(page, '#log-result-continue');
      await page.waitForTimeout(250);
      state = await logPickState(page);
      assert.notStrictEqual(state.id, 'screen-log-result',
        'after result, null grade must open identity, still on ' + state.id);
      assert.strictEqual(state.id, 'screen-log-grade',
        'null grade opens the grade identity step, got ' + state.id);
      assert.strictEqual(state.routeName, 'Mystery Roof', 'known name pre-filled');
      assert.strictEqual(state.terrain, 'Roof', 'known terrain pre-filled');
      assert.ok(!state.grade, 'null grade stays empty, got ' + state.grade);
      console.log('ok - null-grade-dial-then-identity-not-blank-result');
    });

    await withPage(browser, port, {
      climbs: [climbNullTerrain()],
      sessions: []
    }, async function(page){
      await bootLog(page, [climbNullTerrain()], []);
      await waitForScreen(page, 'screen-log-which');
      await tap(page, '#log-my-projects [data-cid="climb-null-terrain"]');
      await page.waitForTimeout(250);
      var state = await logPickState(page);
      assert.strictEqual(state.id, 'screen-log-act', 'null terrain opens the dial first');
      await readyDial(page);
      await tap(page, '#log-act-continue');
      await waitForScreen(page, 'screen-log-result');
      await tap(page, '#btn-sent');
      await tap(page, '#log-result-continue');
      await page.waitForTimeout(250);
      state = await logPickState(page);
      assert.strictEqual(state.id, 'screen-log-terrain',
        'null terrain opens the terrain identity step, got ' + state.id);
      assert.strictEqual(state.routeName, 'No Terrain', 'known name pre-filled');
      assert.strictEqual(state.grade, '5.9', 'known grade pre-filled');
      assert.ok(!state.terrain, 'null terrain stays empty, got ' + state.terrain);
      console.log('ok - null-terrain-dial-then-identity-not-blank-result');
    });

    await withPage(browser, port, {
      climbs: [climbA(), climbB()],
      sessions: [
        sessionRow({ id: 'sess-a', climb_id: CLIMB_A, route_name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', created_at: daysAgo(1) }),
        sessionRow({ id: 'sess-b', climb_id: CLIMB_B, route_name: YELLOW, grade_value: '5.10a', climbing_type: 'Slab', created_at: daysAgo(2) })
      ]
    }, async function(page, recorded){
      await bootLog(page, [climbA(), climbB()], [
        sessionRow({ id: 'sess-a', climb_id: CLIMB_A, route_name: YELLOW, grade_value: '5.11a', climbing_type: 'Overhang', created_at: daysAgo(1) }),
        sessionRow({ id: 'sess-b', climb_id: CLIMB_B, route_name: YELLOW, grade_value: '5.10a', climbing_type: 'Slab', created_at: daysAgo(2) })
      ]);
      await waitForScreen(page, 'screen-log-which');
      await tap(page, '#log-my-projects [data-cid="' + CLIMB_A + '"]');
      await waitForScreen(page, 'screen-log-act');
      await page.waitForTimeout(250);
      var onDial = await logPickState(page);
      assert.strictEqual(onDial.climbId, CLIMB_A, 'row tap selects climb A');
      await tap(page, '#screen-log-act .back-btn');
      await waitForScreen(page, 'screen-log-which');
      var afterBack = await logPickState(page);
      assert.strictEqual(afterBack.id, 'screen-log-which', 'Back from dial returns to picker');
      assert.ok(!afterBack.climbId, 'Back from dial must clear selected climb, got ' + afterBack.climbId);
      assert.ok(!afterBack.routeName, 'Back from dial must clear pre-filled identity');
      await tap(page, '#log-my-projects [data-cid="' + CLIMB_B + '"]');
      await page.waitForTimeout(250);
      await saveThroughDial(page);
      var body = firstBody(postsTo(recorded, 'sessions', 'POST'));
      assert.ok(body, 'second row after Back must POST');
      assert.strictEqual(body.climb_id, CLIMB_B,
        'different row after Back must save B, not leftover A, got ' + body.climb_id);
      console.log('ok - back-from-dial-clears-then-other-row-saves-own-id');
    });

    await withPage(browser, port, {
      climbs: [climbA(), climbB()],
      sessions: [
        sessionRow({ id: 'sess-a', climb_id: CLIMB_A, route_name: YELLOW, created_at: daysAgo(1) })
      ]
    }, async function(page, recorded){
      await bootLog(page, [climbA(), climbB()], [
        sessionRow({ id: 'sess-a', climb_id: CLIMB_A, route_name: YELLOW, created_at: daysAgo(1) })
      ]);
      await waitForScreen(page, 'screen-log-which');
      await tap(page, '#log-my-projects [data-cid="' + CLIMB_A + '"]');
      await waitForScreen(page, 'screen-log-act');
      await page.waitForTimeout(250);
      await tap(page, '#screen-log-act .back-btn');
      await waitForScreen(page, 'screen-log-which');
      var afterBack = await logPickState(page);
      assert.ok(!afterBack.climbId, 'Back from dial clears climb before New climb');
      await tap(page, '#log-new-climb-btn');
      await waitForScreen(page, 'screen-log-act');
      var onNew = await logPickState(page);
      assert.ok(!onNew.climbId, 'New climb after Back must not keep the previous climb_id');
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
      var body = firstBody(postsTo(recorded, 'sessions', 'POST'));
      assert.ok(body, 'New climb after Back must POST');
      assert.notStrictEqual(body.climb_id, CLIMB_A,
        'New climb after Back must not save leftover project climb_id');
      assert.strictEqual(body.route_name, ROUTE);
      console.log('ok - back-from-dial-clears-then-new-climb-does-not-reuse-id');
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
