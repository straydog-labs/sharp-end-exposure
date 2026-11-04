import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, postsTo, firstBody,
  COACH_ID, ATHLETE_ID
} from './harness.mjs';

function coachSession(){
  return { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } };
}

const LEGACY = {
  id: 'old-hb',
  shape: 'rep_pass_fail',
  title: 'Repeaters',
  grip: 'half crimp',
  assistance: '+35 lb',
  progression_note: 'keep me',
  complete: false,
  attempts: [{ at: '2024-01-01' }],
  sets: [{ reps: [{ ok: true }, { ok: false }, { ok: null }] }]
};

const OLD_MULTI = {
  id: 'old-multi',
  shape: 'rep_pass_fail',
  title: 'Old editor',
  grip: 'open hand',
  assistance: '+10 lb',
  progression_note: 'leave me',
  complete: false,
  attempts: [],
  sets: [
    { reps: [{ ok: true }, { ok: null }] },
    { reps: [{ ok: false }, { ok: true }] }
  ]
};

function filledHang(){
  const six = [{ ok: null }, { ok: null }, { ok: null }, { ok: null }, { ok: null }, { ok: null }];
  const grips = ['Half crimp', 'Half crimp', 'Half crimp', '3-finger drag', '3-finger drag', '3-finger drag'];
  const loads = ['40 lb assist', '30 lb assist', '30 lb assist', '', '', ''];
  return {
    id: 'hb-saved',
    shape: 'rep_pass_fail',
    title: 'Hangboard repeaters',
    grip: '',
    assistance: '',
    progression_note: '',
    on_sec: 7,
    off_sec: 3,
    preset: 'repeaters_2_grips',
    complete: false,
    attempts: [],
    sets: grips.map(function(grip, i){
      return { grip: grip, load: loads[i], rest_after_sec: 180, reps: six.map(function(r){ return { ok: r.ok }; }) };
    })
  };
}

async function loadValues(card){
  return card.locator('[data-f="setLoad"]').evaluateAll(function(els){
    return els.map(function(el){ return el.value; });
  });
}

async function runFillSequence(card){
  const loads = card.locator('[data-f="setLoad"]');
  await loads.nth(0).fill('35 lb assist');
  assert.deepStrictEqual(await loadValues(card), [
    '35 lb assist', '35 lb assist', '35 lb assist', '', '', ''
  ], 'set 1 fills later empty same-grip sets only');
  await loads.nth(1).fill('30 lb assist');
  assert.strictEqual(await loads.nth(2).inputValue(), '30 lb assist', 'set 3 held the old value, so it follows set 2');
  await loads.nth(0).fill('40 lb assist');
  assert.deepStrictEqual(await loadValues(card), [
    '40 lb assist', '30 lb assist', '30 lb assist', '', '', ''
  ], 'sets 2 and 3 no longer match set 1, so they stay 30');
}

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
  await tap(page, '#new-a-focus-chips .aw-chip');
  await page.fill('#new-a-name', 'Load fill');
  await tap(page, '#cwb-root [data-act="add"][data-shape="rep_pass_fail"]');
  const hb = page.locator('#cwb-root .cwb-card').nth(0);
  await hb.locator('[data-act="preset"][data-preset="repeaters_2_grips"]').click();
  return hb;
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
          await route.fulfill({
            status: 201, contentType: 'application/json',
            body: JSON.stringify([Object.assign({ id: 'cw-new-1' }, req.body || {})])
          });
          return true;
        }
        if(req.method === 'POST' && req.url.indexOf('/rest/v1/assignments') !== -1){
          await route.fulfill({
            status: 201, contentType: 'application/json',
            body: JSON.stringify([Object.assign({ id: 'asg-new-1' }, req.body || {})])
          });
          return true;
        }
        return false;
      }
    }, async function(page, recorded){
      const hb = await openBuilder(page);
      const loads = hb.locator('[data-f="setLoad"]');
      assert.strictEqual(await loads.count(), 6);

      await hb.locator('[data-f="assistance"]').fill('+99 lb');
      assert.deepStrictEqual(await loadValues(hb), ['', '', '', '', '', ''], 'block assistance does not fill set loads');
      await hb.locator('[data-f="assistance"]').fill('');

      await loads.nth(2).fill('28 lb assist');
      await loads.nth(1).fill('22 lb assist');
      await loads.nth(0).fill('35 lb assist');
      assert.deepStrictEqual(await loadValues(hb), [
        '35 lb assist', '22 lb assist', '28 lb assist', '', '', ''
      ], 'different hand-entered loads stay put');

      await hb.locator('[data-act="preset"][data-preset="custom"]').click();
      await hb.locator('[data-f="grip"]').fill('Half crimp');
      await hb.locator('[data-act="set-plus"]').click();
      await loads.nth(0).fill('15 lb');
      assert.deepStrictEqual(await loadValues(hb), ['15 lb', '15 lb'], 'empty set grip uses the block grip');

      await hb.locator('[data-act="preset"][data-preset="repeaters_2_grips"]').click();
      assert.deepStrictEqual(await loadValues(hb), ['', '', '', '', '', '']);
      await runFillSequence(hb);

      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      await tap(page, '#new-a-submit');
      await page.waitForTimeout(600);
      const cw = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
      assert.ok(cw, 'custom workout saved');
      const saved = cw.sections.find(function(b){ return b.shape === 'rep_pass_fail'; });
      assert.strictEqual(saved.preset, 'repeaters_2_grips');
      assert.strictEqual(saved.assistance, '');
      assert.deepStrictEqual(saved.sets.map(function(s){ return s.load; }), [
        '40 lb assist', '30 lb assist', '30 lb assist', '', '', ''
      ]);
      assert.ok(saved.sets.every(function(s){ return !Object.prototype.hasOwnProperty.call(s, '_hangLoadSrc'); }), 'saved sets have no fill memory');
      assert.deepStrictEqual(saved.sets.map(function(s){ return s.grip; }), [
        'Half crimp', 'Half crimp', 'Half crimp', '3-finger drag', '3-finger drag', '3-finger drag'
      ]);
    });

    const FILLED = filledHang();
    const CW = {
      id: 'cw-1', category: 'Hangboard', name: 'Load fill', description: '', type: 'custom',
      visibility: 'private', created_by: COACH_ID, created_at: '2026-10-20T00:00:00Z',
      training_focus: 'Hangboard', sections: [
        JSON.parse(JSON.stringify(FILLED)),
        JSON.parse(JSON.stringify(LEGACY)),
        JSON.parse(JSON.stringify(OLD_MULTI))
      ],
      created_by_role: 'coach'
    };
    const EDIT_ASG = {
      id: 'asg-edit', title: 'Load fill', athlete_id: ATHLETE_ID, coach_id: COACH_ID,
      description: '', due_date: '2026-11-20', created_at: '2026-10-01T00:00:00Z',
      completed_at: null, deleted_at: null, custom_workout_item_id: 'cw-1', library_item_id: null
    };
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      assignments: [EDIT_ASG],
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
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([Object.assign({}, EDIT_ASG, req.body || {})]) });
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
      await tap(page, '.assign-edit-btn[data-id="asg-edit"]');
      await page.waitForSelector('#wiz-edit-blocks', { timeout: 8000 });
      await tap(page, '#wiz-edit-blocks');
      await page.waitForSelector('#cwb-root .cwb-card', { timeout: 8000 });
      const hb = page.locator('#cwb-root .cwb-card').nth(0);
      assert.deepStrictEqual(await loadValues(hb), [
        '40 lb assist', '30 lb assist', '30 lb assist', '', '', ''
      ], 'filled loads reopen in Edit workout blocks');
      const opened = await page.evaluate(function(){ return window.__cwbTest.clean(); });
      assert.deepStrictEqual(opened.find(function(b){ return b.id === 'old-hb'; }), LEGACY);
      assert.deepStrictEqual(opened.find(function(b){ return b.id === 'old-multi'; }), OLD_MULTI);
      assert.ok(opened[0].sets.every(function(s){ return !Object.prototype.hasOwnProperty.call(s, '_hangLoadSrc'); }));
      await hb.locator('[data-act="preset"][data-preset="repeaters_2_grips"]').click();
      await runFillSequence(hb);
      await hb.locator('[data-f="title"]').fill('Hangboard repeaters.');
      await tap(page, '#edit-cw-save');
      await page.waitForTimeout(500);
      const patched = recorded.filter(function(r){ return r.method === 'PATCH' && r.url.indexOf('custom_workouts') !== -1; }).pop();
      assert.ok(patched && patched.body.sections, 'edit workout PATCH sends blocks');
      assert.strictEqual(patched.body.sections[0].title, 'Hangboard repeaters.');
      assert.deepStrictEqual(patched.body.sections[0].sets.map(function(s){ return s.load; }), [
        '40 lb assist', '30 lb assist', '30 lb assist', '', '', ''
      ]);
      assert.ok(patched.body.sections[0].sets.every(function(s){ return !Object.prototype.hasOwnProperty.call(s, '_hangLoadSrc'); }));
      assert.deepStrictEqual(patched.body.sections[1], LEGACY);
      assert.deepStrictEqual(patched.body.sections[2], OLD_MULTI);
    });
  } finally {
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().then(function(){
  console.log('real-flow-coach-hangboard-load-fill: ok');
}).catch(function(err){
  console.error(err);
  process.exit(1);
});
