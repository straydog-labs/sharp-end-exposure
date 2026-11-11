import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, postsTo, firstBody,
  COACH_ID, ATHLETE_ID
} from './harness.mjs';

const ALLOWED = [
  'Boulders', 'Routes', 'Boards', 'Hangboard', 'Strength & Weights',
  'Mobility & Flexibility', 'Technique & Footwork', 'Cardio & Capacity',
  'Mental/Other', 'Warm-Ups'
];
const A_ID = 'athlete-a';
const B_ID = 'athlete-b';

function coachSession(){
  return { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } };
}

function asg(extra){
  return Object.assign({
    coach_id: COACH_ID, athlete_id: ATHLETE_ID, description: '', due_date: null,
    completed_at: null, deleted_at: null, library_item_id: null, custom_workout_item_id: null
  }, extra);
}

const LIB = [
  { id: 'lib-1', name: 'Repeaters', training_focus: 'Hangboard' },
  { id: 'lib-2', name: 'Campus', training_focus: 'Boards' },
  { id: 'lib-3', name: 'ARC', training_focus: 'Cardio & Capacity' },
  { id: 'lib-4', name: 'Silent Feet', training_focus: 'Routes' },
  { id: 'lib-5', name: 'Hip CARs', training_focus: 'Mobility & Flexibility' }
];
const CUSTOM = [
  { id: 'cw-1', name: 'Night EMOM', training_focus: 'Boulders', created_by: COACH_ID, sections: [] }
];
const RECENT_ASG = [
  asg({ id: 'task-1', title: 'Pick a project', created_at: '2026-11-10T12:00:00Z' }),
  asg({ id: 'dup-old', title: 'Repeaters old', library_item_id: 'lib-1', created_at: '2026-11-01T12:00:00Z' }),
  asg({ id: 'lib-1-new', title: 'Repeaters new', library_item_id: 'lib-1', created_at: '2026-11-09T12:00:00Z' }),
  asg({ id: 'lib-2', title: 'Campus', library_item_id: 'lib-2', created_at: '2026-11-08T12:00:00Z' }),
  asg({ id: 'lib-3', title: 'ARC', library_item_id: 'lib-3', created_at: '2026-11-07T12:00:00Z' }),
  asg({ id: 'lib-4', title: 'Silent Feet', library_item_id: 'lib-4', created_at: '2026-11-06T12:00:00Z' }),
  asg({ id: 'cw-1', title: 'Night EMOM', custom_workout_item_id: 'cw-1', created_at: '2026-11-05T12:00:00Z' }),
  asg({ id: 'lib-5', title: 'Hip CARs', library_item_id: 'lib-5', created_at: '2026-11-04T12:00:00Z' })
];

function libraryStub(route, req, assignments){
  if(req.method === 'GET' && req.url.indexOf('/rest/v1/workout_library') !== -1){
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIB) }).then(function(){ return true; });
  }
  if(req.method === 'GET' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CUSTOM) }).then(function(){ return true; });
  }
  if(req.method === 'GET' && req.url.indexOf('/rest/v1/assignments') !== -1){
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assignments) }).then(function(){ return true; });
  }
  if(req.method === 'POST' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([Object.assign({ id: 'cw-new' }, req.body || {})]) }).then(function(){ return true; });
  }
  if(req.method === 'POST' && req.url.indexOf('/rest/v1/assignments') !== -1){
    var row = Object.assign({ id: 'asg-new', created_at: '2026-11-11T15:00:00Z' }, req.body || {});
    assignments.push(row);
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([row]) }).then(function(){ return true; });
  }
  return Promise.resolve(false);
}

async function openWorkoutStep(page){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  if(await page.locator('#athlete-header-assign').count() === 0) await tap(page, '.roster-row');
  await page.waitForSelector('#athlete-header-assign', { timeout: 8000 });
  await tap(page, '#athlete-header-assign');
  await page.waitForSelector('#assign-kind-workout', { timeout: 8000 });
  await tap(page, '#assign-kind-workout');
  await page.waitForSelector('#wiz-create-custom', { timeout: 8000 });
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      stub: function(route, req){ return libraryStub(route, req, RECENT_ASG.slice()); }
    }, async function(page, recorded){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await page.waitForSelector('#athlete-header-assign', { timeout: 8000 });
      const header = await page.evaluate(function(){
        function bg(id){ var el = document.getElementById(id); return el ? getComputedStyle(el).backgroundColor : ''; }
        function left(id){ var el = document.getElementById(id); return el ? el.getBoundingClientRect().left : 0; }
        return {
          labels: ['athlete-header-assign', 'coach-log-launch', 'coach-train-log-launch'].map(function(id){
            return (document.getElementById(id).textContent || '').trim();
          }),
          bgs: ['athlete-header-assign', 'coach-log-launch', 'coach-train-log-launch'].map(bg),
          lefts: ['athlete-header-assign', 'coach-log-launch', 'coach-train-log-launch'].map(left)
        };
      });
      assert.deepStrictEqual(header.labels, ['Assign', 'Log a climb', 'Log training']);
      assert.strictEqual(header.bgs[0], header.bgs[1]);
      assert.strictEqual(header.bgs[1], header.bgs[2]);
      assert.ok(header.bgs[0].indexOf('232') !== -1, 'orange primary, got ' + header.bgs[0]);
      assert.ok(header.lefts[0] < header.lefts[1] && header.lefts[1] < header.lefts[2]);

      await tap(page, '#athlete-header-assign');
      await page.waitForSelector('#assign-kind-workout', { timeout: 8000 });
      assert.match(await page.locator('#aw-hero-sub').innerText(), /Test Athlete/);
      await tap(page, '#aw-cancel');

      await openWorkoutStep(page);
      const order = await page.evaluate(function(){
        function top(sel){ var el = document.querySelector(sel); return el ? el.getBoundingClientRect().top : -1; }
        return { create: top('#wiz-create-custom'), recent: top('#wiz-recent-label'), search: top('#new-a-lib-search') };
      });
      assert.ok(order.create < order.recent && order.recent < order.search, 'create, then Recent, then search');
      const recent = await page.locator('#wiz-recent-list .wiz-recent-row').allTextContents();
      assert.deepStrictEqual(recent.map(function(t){ return t.replace(/\s+/g, ' ').trim().split(/Assigned/)[0].trim(); }), [
        'Repeaters', 'Campus', 'ARC', 'Silent Feet', 'Night EMOM'
      ]);
      assert.ok(!recent.some(function(t){ return /Pick a project|Hip CARs/.test(t); }), 'tasks and the 6th workout stay out');
      await tap(page, '#wiz-recent-list .wiz-recent-row');
      await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
      assert.strictEqual(await page.inputValue('#new-a-name-edit'), 'Repeaters');
      await tap(page, '#aw-cancel');

      await openWorkoutStep(page);
      await tap(page, '#wiz-create-custom');
      await page.waitForSelector('#new-a-name', { timeout: 8000 });
      assert.strictEqual(await page.locator('#new-a-focus-chips').count(), 0);
      assert.ok(!/Training focus/.test(await page.locator('#wiz-body').innerText()));
      const derived = await page.evaluate(function(){
        var d = window.__assignFlowTest.derive;
        return {
          emom: d([{ shape: 'emom' }]),
          hang: d([{ shape: 'rep_pass_fail' }]),
          tieEarly: d([{ shape: 'emom' }, { shape: 'rep_pass_fail' }]),
          tieHang: d([{ shape: 'rep_pass_fail' }, { shape: 'emom' }]),
          warm: d([{ shape: 'check', title: 'Warm up' }]),
          strength: d([{ shape: 'circuit' }]),
          psyche: d([{ shape: 'section', title: 'Psyche' }]),
          none: d([])
        };
      });
      assert.strictEqual(derived.emom, 'Boulders');
      assert.strictEqual(derived.hang, 'Hangboard');
      assert.strictEqual(derived.tieEarly, 'Boulders');
      assert.strictEqual(derived.tieHang, 'Hangboard');
      assert.strictEqual(derived.warm, 'Warm-Ups');
      assert.strictEqual(derived.strength, 'Strength & Weights');
      assert.strictEqual(derived.psyche, 'Mental/Other');
      assert.strictEqual(derived.none, 'Mental/Other');
      Object.keys(derived).forEach(function(k){
        assert.ok(ALLOWED.indexOf(derived[k]) !== -1, k);
      });
      await page.fill('#new-a-name', 'EMOM only');
      await tap(page, '#cwb-root [data-act="add"][data-shape="emom"]');
      await tap(page, '#wiz-next');
      await page.waitForSelector('#wiz-next', { timeout: 8000 });
      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      await tap(page, '#new-a-submit');
      await page.waitForTimeout(400);
      const cw = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
      assert.strictEqual(cw.training_focus, 'Boulders');
      assert.ok(ALLOWED.indexOf(cw.training_focus) !== -1);
    });

    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      stub: function(route, req){
        return libraryStub(route, req, [asg({ id: 'task-only', title: 'Homework', created_at: '2026-11-02T00:00:00Z' })]);
      }
    }, async function(page){
      await openWorkoutStep(page);
      assert.strictEqual(await page.locator('#wiz-recent-label').count(), 0, 'Recent hides when empty');
      const tops = await page.evaluate(function(){
        function top(sel){ return document.querySelector(sel).getBoundingClientRect().top; }
        return top('#wiz-create-custom') < top('#new-a-lib-search');
      });
      assert.strictEqual(tops, true);
    });

    const navRows = [
      asg({ id: 'asg-old', title: 'Older plan', athlete_id: B_ID, created_at: '2026-10-01T00:00:00Z' }),
      asg({ id: 'asg-new', title: 'Newer plan', athlete_id: B_ID, created_at: '2026-11-01T00:00:00Z' })
    ];
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      stub: async function(route, req){
        if(req.method === 'POST' && req.url.indexOf('/rest/v1/rpc/coach_list_roster') !== -1){
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            ok: true,
            roster: [
              { athlete_id: A_ID, athlete_email: 'a@test.local', athlete_first_name: 'Ada', athlete_last_name: 'A', status: 'active', linked_at: '2026-01-01' },
              { athlete_id: B_ID, athlete_email: 'b@test.local', athlete_first_name: 'Bea', athlete_last_name: 'B', status: 'active', linked_at: '2026-01-02' }
            ]
          }) });
          return true;
        }
        if(req.method === 'GET' && req.url.indexOf('/rest/v1/assignments') !== -1){
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(navRows) });
          return true;
        }
        if(req.method === 'POST' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([Object.assign({ id: 'cw-b' }, req.body || {})]) });
          return true;
        }
        if(req.method === 'POST' && req.url.indexOf('/rest/v1/assignments') !== -1){
          var created = Object.assign({ id: 'asg-from-b', created_at: '2026-11-11T16:00:00Z', completed_at: null, deleted_at: null }, req.body || {});
          navRows.push(created);
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([created]) });
          return true;
        }
        if(req.method === 'PATCH' && req.url.indexOf('/rest/v1/assignments') !== -1){
          var id = (req.url.match(/id=eq\.([^&]+)/) || [])[1];
          var row = navRows.filter(function(r){ return r.id === id; })[0];
          if(row && req.body) Object.assign(row, req.body);
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([row || req.body]) });
          return true;
        }
        return false;
      }
    }, async function(page, recorded){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row[data-athlete-id="' + A_ID + '"]');
      await page.waitForSelector('.detail-title', { timeout: 8000 });
      assert.match(await page.locator('.detail-title').innerText(), /Ada A/);
      await tap(page, '.roster-row[data-athlete-id="' + B_ID + '"] .roster-assign-btn');
      await page.waitForSelector('#aw-cancel', { timeout: 8000 });
      await tap(page, '#aw-cancel');
      await page.waitForFunction(function(){
        var el = document.querySelector('.detail-title');
        return el && /Bea B/.test(el.textContent || '');
      }, null, { timeout: 8000 });

      await tap(page, '.roster-row[data-athlete-id="' + A_ID + '"]');
      await page.waitForFunction(function(){
        var el = document.querySelector('.detail-title');
        return el && /Ada A/.test(el.textContent || '');
      }, null, { timeout: 8000 });
      await tap(page, '.roster-row[data-athlete-id="' + B_ID + '"] .roster-assign-btn');
      await page.waitForSelector('#assign-kind-workout', { timeout: 8000 });
      await tap(page, '#assign-kind-workout');
      await page.waitForSelector('#wiz-create-custom', { timeout: 8000 });
      await tap(page, '#wiz-create-custom');
      await page.waitForSelector('#new-a-name', { timeout: 8000 });
      await page.fill('#new-a-name', 'From B');
      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      await tap(page, '#new-a-submit');
      await page.waitForSelector('.assign-inline-success', { timeout: 8000 });
      assert.strictEqual((await page.locator('.assign-inline-success').innerText()).trim(), 'Assignment saved.');
      assert.match(await page.locator('.detail-title').innerText(), /Bea B/);
      assert.strictEqual((await page.locator('.assign-title').first().innerText()).trim(), 'From B');
      const posted = firstBody(postsTo(recorded, 'assignments', 'POST'));
      assert.strictEqual(posted.athlete_id, B_ID);

      await tap(page, '.assign-edit-btn[data-id="asg-old"]');
      await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
      await page.fill('#new-a-name-edit', 'Older plan edited');
      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      await tap(page, '#new-a-submit');
      await page.waitForSelector('.assign-inline-success', { timeout: 8000 });
      assert.match(await page.locator('.detail-title').innerText(), /Bea B/);
      assert.strictEqual((await page.locator('.assign-title').first().innerText()).trim(), 'Older plan edited');
      assert.match(await page.locator('.assign-inline-success').innerText(), /Assignment updated/);
    });

    const keepSections = [{
      id: 'hb', shape: 'rep_pass_fail', title: 'Hangboard repeaters', grip: '', assistance: '',
      preset: 'repeaters', on_sec: 7, off_sec: 3, sets: [
        { grip: 'Half crimp', load: '35 lb assist', rest_after_sec: 180, reps: [{ ok: null }] }
      ]
    }];
    const keepCw = {
      id: 'cw-keep', name: 'Keep focus', training_focus: 'Hangboard', created_by: COACH_ID,
      description: '', sections: keepSections, created_by_role: 'coach'
    };
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      assignments: [asg({
        id: 'asg-keep', title: 'Keep focus', custom_workout_item_id: 'cw-keep', created_at: '2026-11-02T00:00:00Z'
      })],
      stub: async function(route, req){
        if(req.method === 'GET' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([keepCw]) });
          return true;
        }
        if(req.method === 'PATCH' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([Object.assign({}, keepCw, req.body || {})]) });
          return true;
        }
        return false;
      }
    }, async function(page, recorded){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await tap(page, '.assign-edit-btn[data-id="asg-keep"]');
      await page.waitForSelector('#wiz-edit-blocks', { timeout: 8000 });
      await tap(page, '#wiz-edit-blocks');
      await page.waitForSelector('#cwb-root [data-f="rowGrip"]', { timeout: 8000 });
      assert.strictEqual(await page.locator('#cwb-root [data-f="rowGrip"]').inputValue(), 'Half crimp');
      await tap(page, '#edit-cw-save');
      await page.waitForTimeout(400);
      const patched = recorded.filter(function(r){
        return r.method === 'PATCH' && r.url.indexOf('custom_workouts') !== -1;
      }).pop();
      assert.ok(patched, 'workout PATCH');
      assert.ok(!Object.prototype.hasOwnProperty.call(patched.body, 'training_focus'), 'edit keeps stored training_focus');
      assert.ok(!Object.prototype.hasOwnProperty.call(patched.body, 'sections'), 'unchanged blocks are not rewritten');
    });
  } finally {
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().then(function(){
  console.log('real-flow-coach-assign-flow-picker: ok');
}).catch(function(err){
  console.error(err);
  process.exit(1);
});
