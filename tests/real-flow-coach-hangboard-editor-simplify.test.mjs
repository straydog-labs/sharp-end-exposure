import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, postsTo, firstBody,
  COACH_ID, ATHLETE_ID
} from './harness.mjs';

function coachSession(){
  return { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } };
}

function asg(extra){
  return Object.assign({
    athlete_id: ATHLETE_ID, coach_id: COACH_ID, description: '',
    completed_at: null, deleted_at: null, custom_workout_item_id: null, library_item_id: null
  }, extra);
}

const LEGACY = {
  id: 'old-hb', shape: 'rep_pass_fail', title: 'Repeaters',
  grip: 'half crimp', assistance: '+35 lb', progression_note: '', complete: false, attempts: [],
  sets: [{ reps: [{ ok: null }, { ok: null }] }]
};

const FIVE = [
  { id: 'w', shape: 'check', title: 'Warm up', items: [{ id: 'i', text: 'Shoulders', complete: false }] },
  { id: 'e', shape: 'emom', title: 'EMOM', rounds: [{ boulders: [{ text: 'Orange', complete: false }] }] },
  { id: 'r', shape: 'rest', title: 'Rest', duration_sec: 600, rest_after_sec: 600 },
  { id: 'h', shape: 'rep_pass_fail', title: 'Hangboard', grip: '', assistance: '', sets: [{ reps: [{ ok: null }] }] },
  { id: 'c', shape: 'check', title: 'Cool down', items: [{ id: 'j', text: 'Walk', complete: false }] }
];

async function openBuilder(page){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  await tap(page, '.roster-row');
  await page.waitForSelector('#assign-launch-btn', { state: 'attached', timeout: 8000 });
  await tap(page, '#assign-launch-btn');
  await page.waitForSelector('#assign-kind-workout', { timeout: 8000 });
  await tap(page, '#assign-kind-workout');
  await page.waitForSelector('#wiz-create-custom', { timeout: 8000 });
  await tap(page, '#wiz-create-custom');
  await page.waitForSelector('#cwb-root .cwb-menu', { timeout: 8000 });
  await page.fill('#new-a-name', 'Compact hangs');
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      stub: async function(route, req){
        if(req.method === 'POST' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([Object.assign({ id: 'cw-new-1' }, req.body || {})]) });
          return true;
        }
        if(req.method === 'POST' && req.url.indexOf('/rest/v1/assignments') !== -1){
          await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([Object.assign({ id: 'asg-new-1' }, req.body || {})]) });
          return true;
        }
        return false;
      }
    }, async function(page, recorded){
      await openBuilder(page);
      const chips = (await page.locator('#cwb-root .cwb-chip').allTextContents()).map(function(t){ return t.trim(); });
      assert.deepStrictEqual(chips, [
        'Warm up', 'Climbing (EMOM)', 'Strength', 'Hangboard / repeaters', 'Psyche', 'Rest', 'Custom', 'Cool down'
      ]);
      assert.strictEqual(await page.locator('#cwb-root [data-act="jump-add"]').count(), 0, 'no top Add block before 3 blocks');

      await tap(page, '#cwb-root [data-act="add"][data-shape="rep_pass_fail"]');
      const hb = page.locator('#cwb-root .cwb-card').nth(0);
      assert.strictEqual(await hb.locator('[data-f="grip"]').count(), 0, 'no block grip input');
      assert.strictEqual(await hb.locator('[data-f="assistance"]').count(), 0, 'no block load input');

      await hb.locator('[data-act="preset"][data-preset="repeaters"]').click();
      assert.deepStrictEqual(await hb.locator('[data-f="rowGrip"]').evaluateAll(function(els){ return els.map(function(el){ return el.value; }); }), ['Half crimp']);
      assert.strictEqual(await hb.locator('.cwb-gripcount').innerText(), '3');
      assert.strictEqual(await hb.locator('[data-f="rowLoad"]').inputValue(), '');
      assert.strictEqual(await hb.locator('[data-f="on_sec"]').inputValue(), '7');
      assert.strictEqual(await hb.locator('[data-f="off_sec"]').inputValue(), '3');
      assert.strictEqual(await hb.locator('[data-f="allReps"]').inputValue(), '6');

      await hb.locator('[data-act="preset"][data-preset="max_hang"]').click();
      assert.strictEqual(await hb.locator('[data-f="on_sec"]').inputValue(), '10');
      assert.strictEqual(await hb.locator('[data-f="off_sec"]').inputValue(), '');
      assert.strictEqual(await hb.locator('.cwb-griprow').count(), 1);
      assert.strictEqual(await hb.locator('.cwb-gripcount').innerText(), '3');
      assert.strictEqual(await hb.locator('[data-f="allReps"]').inputValue(), '5');
      assert.deepStrictEqual(await hb.locator('[data-f="rowGrip"]').evaluateAll(function(els){ return els.map(function(el){ return el.value; }); }), ['']);

      await hb.locator('[data-act="preset"][data-preset="repeaters_2_grips"]').click();
      assert.deepStrictEqual(await hb.locator('[data-f="rowGrip"]').evaluateAll(function(els){ return els.map(function(el){ return el.value; }); }), [
        'Half crimp', '3-finger drag'
      ]);
      await hb.locator('[data-act="customize-sets"]').click();
      const loads = hb.locator('[data-f="setLoad"]');
      await loads.nth(0).fill('35 lb assist');
      assert.deepStrictEqual(await loads.evaluateAll(function(els){ return els.map(function(el){ return el.value; }); }), [
        '35 lb assist', '35 lb assist', '35 lb assist', '', '', ''
      ]);
      await loads.nth(3).fill('45 lb assist');
      assert.deepStrictEqual(await loads.evaluateAll(function(els){ return els.map(function(el){ return el.value; }); }), [
        '35 lb assist', '35 lb assist', '35 lb assist', '45 lb assist', '45 lb assist', '45 lb assist'
      ]);
      await hb.locator('[data-act="toggle"]').click();
      assert.match(await hb.locator('.cwb-sum').innerText(), /Hangboard repeaters · 6 sets · 7s on \/ 3s off/);

      await tap(page, '#cwb-root [data-act="add"][data-shape="warmup"]');
      await tap(page, '#cwb-root [data-act="add"][data-shape="mental"]');
      assert.strictEqual(await page.locator('#cwb-root [data-act="jump-add"]').count(), 1, 'top Add block shows at 3 blocks');
      assert.strictEqual(await page.locator('#cwb-root .cwb-card').nth(2).locator('[data-f="title"]').inputValue(), 'Psyche');

      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
      assert.strictEqual(await page.locator('#new-a-warmup').count(), 0, 'warm-up picker hides when a Warm up block exists');

      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      assert.match(await page.locator('#wiz-body').innerText(), /3 blocks: Hangboard repeaters, Warm up, Psyche/);
      await tap(page, '#new-a-submit');
      await page.waitForTimeout(500);
      const cw = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
      const saved = cw.sections.find(function(b){ return b.preset === 'repeaters_2_grips'; });
      assert.deepStrictEqual(saved.sets.map(function(s){ return s.load; }), [
        '35 lb assist', '35 lb assist', '35 lb assist', '45 lb assist', '45 lb assist', '45 lb assist'
      ]);
      assert.strictEqual(cw.sections[2].title, 'Psyche');
    });

    const FILLED = {
      id: 'hb-saved', shape: 'rep_pass_fail', title: 'Hangboard repeaters', grip: '', assistance: '',
      progression_note: '', on_sec: 7, off_sec: 3, preset: 'repeaters_2_grips', complete: false, attempts: [],
      sets: ['Half crimp', 'Half crimp', 'Half crimp', '3-finger drag', '3-finger drag', '3-finger drag'].map(function(grip, i){
        return { grip: grip, load: i < 3 ? '35 lb assist' : '45 lb assist', rest_after_sec: 180, reps: [0,0,0,0,0,0].map(function(){ return { ok: null }; }) };
      })
    };
    const CW = {
      id: 'cw-1', category: 'Hangboard', name: 'Compact hangs', description: '', type: 'custom',
      visibility: 'private', created_by: COACH_ID, created_at: '2026-10-20T00:00:00Z',
      training_focus: 'Hangboard', sections: [FILLED, JSON.parse(JSON.stringify(LEGACY))], created_by_role: 'coach'
    };
    const EDIT = asg({ id: 'asg-edit', title: 'Compact hangs', custom_workout_item_id: 'cw-1', due_date: '2026-11-20', created_at: '2026-10-01T00:00:00Z' });
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      assignments: [EDIT],
      stub: async function(route, req){
        if(req.method === 'GET' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CW]) });
          return true;
        }
        if(req.method === 'PATCH' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([Object.assign({}, CW, req.body || {})]) });
          return true;
        }
        if(req.method === 'PATCH' && req.url.indexOf('/rest/v1/assignments') !== -1){
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([Object.assign({}, EDIT, req.body || {})]) });
          return true;
        }
        return false;
      }
    }, async function(page, recorded){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await tap(page, '[data-path="plan"]');
      await tap(page, '#athlete-path-subs [data-pane="assignments"]');
      await page.waitForSelector('.assign-edit-btn[data-id="asg-edit"]', { timeout: 8000 });
      await page.waitForSelector('.assign-blocks-line', { timeout: 8000 });
      await tap(page, '.assign-edit-btn[data-id="asg-edit"]');
      await page.waitForSelector('#wiz-edit-blocks', { timeout: 8000 });
      const editColor = await page.evaluate(function(){
        var btn = document.getElementById('wiz-edit-blocks');
        return btn ? getComputedStyle(btn).color : '';
      });
      assert.strictEqual(editColor, 'rgb(232, 146, 82)');
      await tap(page, '#wiz-edit-blocks');
      await page.waitForSelector('#cwb-root .cwb-card', { timeout: 8000 });
      const hb = page.locator('#cwb-root .cwb-card').nth(0);
      assert.strictEqual(await hb.locator('[data-f="rowLoad"]').nth(0).inputValue(), '35 lb assist');
      assert.strictEqual(await hb.locator('[data-f="rowLoad"]').nth(1).inputValue(), '45 lb assist');
      const legacy = page.locator('#cwb-root .cwb-card').nth(1);
      assert.strictEqual(await legacy.locator('[data-f="rowGrip"]').inputValue(), 'half crimp');
      assert.strictEqual(await legacy.locator('[data-f="rowLoad"]').inputValue(), '+35 lb');
      await legacy.locator('[data-f="title"]').fill('Repeaters.');
      await tap(page, '#edit-cw-save');
      await page.waitForTimeout(500);
      const patched = recorded.filter(function(r){ return r.method === 'PATCH' && r.url.indexOf('custom_workouts') !== -1; }).pop();
      assert.strictEqual(patched.body.sections[1].grip, 'half crimp');
      assert.strictEqual(patched.body.sections[1].assistance, '+35 lb');
      assert.strictEqual(patched.body.sections[1].sets[0].grip, 'half crimp');
      assert.strictEqual(patched.body.sections[1].sets[0].load, '+35 lb');
      assert.strictEqual(patched.body.sections[0].sets[0].load, '35 lb assist');
      assert.strictEqual(patched.body.sections[0].sets[5].load, '45 lb assist');
    });

    const SORT = [
      asg({ id: 'a-morn', title: 'Morning', created_at: '2026-11-04T08:00:00Z', due_date: '2026-11-01' }),
      asg({ id: 'a-noon', title: 'Noon', created_at: '2026-11-04T12:00:00Z', due_date: '2026-12-01' }),
      asg({ id: 'a-mid', title: 'Mid', created_at: '2026-11-04T10:00:00Z', due_date: '2026-11-20' }),
      asg({ id: 'a-old', title: 'Older', created_at: '2026-11-01T15:00:00Z', due_date: '2026-11-02' })
    ];
    const SUM_CW = {
      id: 'cw-five', name: 'Five', created_by: COACH_ID, training_focus: 'Hangboard', sections: FIVE, _source: 'custom'
    };
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      assignments: SORT.concat([asg({ id: 'a-five', title: 'Five session', custom_workout_item_id: 'cw-five', created_at: '2026-11-05T12:00:00Z' })]),
      stub: async function(route, req){
        if(req.method === 'GET' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SUM_CW]) });
          return true;
        }
        return false;
      }
    }, async function(page){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await tap(page, '[data-path="plan"]');
      await tap(page, '#athlete-path-subs [data-pane="assignments"]');
      await page.waitForSelector('.assign-title', { timeout: 8000 });
      await page.waitForTimeout(400);
      const mainTitles = await page.locator('#detail-assignments .assign-title').allTextContents();
      assert.deepStrictEqual(mainTitles.map(function(t){ return t.trim(); }), ['Five session', 'Noon', 'Mid', 'Morning', 'Older']);
      assert.match(await page.locator('#detail-assignments').innerText(), /5 blocks: Warm up, EMOM, Rest, Hangboard, Cool down/);
      await page.waitForSelector('#assign-launch-btn', { state: 'attached', timeout: 8000 });
      await tap(page, '#assign-launch-btn');
      await page.waitForSelector('#assign-kind-workout', { timeout: 8000 });
      await tap(page, '#assign-kind-workout');
      await page.waitForSelector('.aw-side-assign-title', { timeout: 8000 });
      const side = await page.locator('.aw-side-assign-title').allTextContents();
      assert.deepStrictEqual(side.map(function(t){ return t.trim(); }), ['Five session', 'Noon', 'Mid', 'Morning', 'Older']);
    });

    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      assignments: [asg({ id: 'a-ok', title: 'Still here', created_at: '2026-11-04T12:00:00Z' })],
      stub: async function(route, req){
        if(req.method === 'GET' && req.url.indexOf('/rest/v1/training_sessions') !== -1 && req.url.indexOf('assignment_id=in.') !== -1){
          await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'column missing' }) });
          return true;
        }
        return false;
      }
    }, async function(page){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await tap(page, '[data-path="plan"]');
      await tap(page, '#athlete-path-subs [data-pane="assignments"]');
      await page.waitForSelector('.assign-title', { timeout: 8000 });
      await page.waitForTimeout(400);
      assert.match(await page.locator('#detail-assignments').innerText(), /Still here/);
      assert.doesNotMatch(await page.locator('#detail-assignments').innerText(), /Could not load assignments/);
      assert.strictEqual(await page.locator('#detail-assignments .assign-logged').count(), 0);
    });
  } finally {
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().then(function(){
  console.log('real-flow-coach-hangboard-editor-simplify: ok');
}).catch(function(err){
  console.error(err);
  process.exit(1);
});
