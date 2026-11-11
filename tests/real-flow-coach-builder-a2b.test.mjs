import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import vm from 'vm';
import {
  startStaticServer, launchChromium, withPage, tap, postsTo, firstBody,
  COACH_ID, ATHLETE_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const six = [{ ok: null }, { ok: null }, { ok: null }, { ok: null }, { ok: null }, { ok: null }];
const CONTRACT = {
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
  sets: ['Half crimp', 'Half crimp', 'Half crimp', '3-finger drag', '3-finger drag', '3-finger drag'].map(function(grip){
    return { grip: grip, load: '', rest_after_sec: 180, reps: six.map(function(r){ return { ok: r.ok }; }) };
  })
};

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

function loadBuilder(){
  const dash = readFileSync(join(__dirname, '..', 'coach-dashboard.html'), 'utf8');
  const start = dash.indexOf('  // ---------- Coach block builder ----------');
  const end = dash.indexOf('  function cwbSectionsForSave(');
  assert.ok(start > 0 && end > start, 'coach block builder module present');
  const ctx = {
    console, JSON, Date, Math, Array, Object, String, Number, parseInt, isNaN, setTimeout, clearTimeout,
    escapeHtml: function(s){ return String(s == null ? '' : s); },
    shapedBlockName: function(b){ return b && b.shape; },
    shapedBlockSummary: function(){ return ''; },
    _assignWizard: { blocks: [] }
  };
  vm.createContext(ctx);
  vm.runInContext(dash.slice(start, end), ctx);
  return ctx;
}

function contractFromVm(){
  const ctx = loadBuilder();
  const made = vm.runInContext(`(function(){
    var b = cwbHangPreset('repeaters_2_grips', 'preset-id');
    _assignWizard.blocks = [b];
    var c = cwbCleanBlocks()[0];
    delete c.id;
    return c;
  })()`, ctx);
  assert.deepStrictEqual(made, CONTRACT);

  const others = vm.runInContext(`(function(){
    var rep = cwbHangPreset('repeaters', 'r');
    var max = cwbHangPreset('max_hang', 'm');
    var custom = cwbHangPreset('custom', 'c');
    return {
      rep: { on: rep.on_sec, off: rep.off_sec, preset: rep.preset, grips: rep.sets.map(function(s){ return s.grip; }), reps: rep.sets.map(function(s){ return s.reps.length; }), rest: rep.sets.map(function(s){ return s.rest_after_sec; }) },
      max: { on: max.on_sec, off: max.off_sec, preset: max.preset, n: max.sets.length, reps: max.sets[0].reps.length, rest: max.sets[0].rest_after_sec },
      custom: { preset: custom.preset, n: custom.sets.length, reps: custom.sets[0].reps.length, grip: custom.grip, assistance: custom.assistance }
    };
  })()`, ctx);
  assert.strictEqual(others.rep.on, 7);
  assert.strictEqual(others.rep.off, 3);
  assert.strictEqual(others.rep.preset, 'repeaters');
  assert.strictEqual(others.rep.grips.length, 3);
  assert.ok(others.rep.grips.every(function(g){ return g === others.rep.grips[0] && g; }), 'repeaters is one grip');
  assert.deepStrictEqual(Array.prototype.slice.call(others.rep.reps), [6, 6, 6]);
  assert.deepStrictEqual(Array.prototype.slice.call(others.rep.rest), [180, 180, 180]);
  assert.strictEqual(others.max.on, 10);
  assert.strictEqual(others.max.off, null);
  assert.strictEqual(others.max.preset, 'max_hang');
  assert.strictEqual(others.max.n, 3);
  assert.strictEqual(others.max.reps, 5);
  assert.strictEqual(others.max.rest, 180);
  assert.strictEqual(others.custom.preset, 'custom');
  assert.strictEqual(others.custom.n, 1);
  assert.strictEqual(others.custom.reps, 5);
  assert.strictEqual(others.custom.grip, '');
  assert.strictEqual(others.custom.assistance, '');

  ctx._assignWizard.blocks = [JSON.parse(JSON.stringify(LEGACY))];
  const cleaned = vm.runInContext('cwbCleanBlocks()', ctx);
  const legacySaved = JSON.parse(JSON.stringify(LEGACY));
  legacySaved.sets[0].grip = 'half crimp';
  legacySaved.sets[0].load = '+35 lb';
  assert.deepStrictEqual(cleaned[0], legacySaved, 'legacy block grip and load are written onto the set at save');

  const rich = {
    id: 'rich',
    shape: 'rep_pass_fail',
    title: 'Hangboard repeaters',
    grip: '',
    assistance: '',
    progression_note: '',
    on_sec: 7,
    off_sec: null,
    preset: 'max_hang',
    complete: false,
    attempts: [],
    sets: [{ grip: ' Half crimp ', load: ' 35 lb assist ', rest_after_sec: 180, reps: [{ ok: true }] }]
  };
  ctx._assignWizard.blocks = [JSON.parse(JSON.stringify(rich))];
  const kept = vm.runInContext('cwbCleanBlocks()', ctx)[0];
  assert.strictEqual(kept.sets[0].grip, 'Half crimp');
  assert.strictEqual(kept.sets[0].load, '35 lb assist');
  assert.strictEqual(kept.sets[0].rest_after_sec, 180);
  assert.strictEqual(kept.sets[0].reps[0].ok, true);
  assert.strictEqual(kept.off_sec, null);
  assert.strictEqual(kept.preset, 'max_hang');
}

function coachSession(){
  return { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } };
}

function oks(list){
  return list.map(function(v){ return { ok: v }; });
}

const JOHN_HB = {
  id: 'john-hb',
  shape: 'rep_pass_fail',
  title: 'Imported hangs',
  grip: 'Half crimp',
  assistance: '15 lbs',
  progression_note: 'add a little next week',
  sets: [
    { reps: oks([true, true, true, true, true, true]) },
    { reps: oks([true, true, true, true, true, false]) },
    { reps: oks([true, true, true, false, null, null]) }
  ]
};
const EMOM = {
  id: 'john-emom',
  shape: 'emom',
  title: 'Boulders',
  rounds: [
    { boulders: [{ text: 'Orange', complete: true }, { text: 'Black', complete: true }], notes: 'smooth', rest_after_sec: 180 },
    { boulders: [{ text: 'Blue', complete: true }], notes: '', rest_after_sec: 60 },
    { boulders: [{ text: '', complete: true }], notes: '', rest_after_sec: 0 },
    { boulders: [{ text: 'Red', complete: false }, { text: '', complete: false }, { text: 'Green', complete: false }], notes: 'pumped', rest_after_sec: 120 }
  ]
};
const CHECK = {
  id: 'wu',
  shape: 'check',
  title: 'Warm up',
  complete: false,
  items: [
    { id: 'i1', text: 'Shoulder rolls', complete: true },
    { id: 'i2', text: 'Easy hangs', complete: false }
  ]
};
const SHAPES = [
  EMOM,
  JOHN_HB,
  CHECK,
  { id: 'circ', shape: 'circuit', title: 'Strength', rounds: 3, exercises: [{ name: 'Pull-ups', weight: '0', reps: '5' }] },
  { id: 'men', shape: 'section', title: 'Mental', notes: 'Box breathing' },
  { id: 'rest1', shape: 'rest', title: 'Rest', duration_sec: 600, rest_after_sec: 600 },
  { id: 'int1', shape: 'interval', title: 'Intervals', work_sec: 120, rest_sec: 60, target_sets: 4 },
  { id: 'mystery', shape: 'mystery_shape', title: 'Old thing' }
];

function trainRow(extra){
  return Object.assign({
    user_id: ATHLETE_ID,
    created_at: '2026-08-01T12:00:00Z',
    started_at: '2026-08-01T12:00:00Z',
    ended_at: null,
    energy_type: 'hangboard',
    notes: '',
    warm_up: '',
    cool_down: '',
    blocks: [],
    logged_by_coach: false,
    assignment_id: null,
    deleted_at: null
  }, extra);
}

const JOURNAL_ROWS = [
  trainRow({
    id: 'ts-new',
    assignment_id: 'asg-1',
    started_at: '2026-11-02T18:00:00Z',
    ended_at: '2026-11-02T19:00:00Z',
    created_at: '2026-11-02T19:00:00Z',
    warm_up: 'bands',
    cool_down: 'stretch',
    blocks: SHAPES
  }),
  trainRow({
    id: 'ts-old',
    assignment_id: 'asg-1',
    started_at: '2026-10-01T15:00:00Z',
    created_at: '2026-10-01T16:00:00Z',
    blocks: [CHECK]
  }),
  trainRow({
    id: 'ts-done',
    assignment_id: 'asg-2',
    started_at: '2026-10-20T15:00:00Z',
    created_at: '2026-10-20T16:00:00Z',
    blocks: [EMOM, JOHN_HB]
  }),
  trainRow({
    id: 'ts-free',
    started_at: '2026-09-01T15:00:00Z',
    created_at: '2026-09-01T16:00:00Z',
    blocks: [{ id: 'free1', shape: 'section', title: 'Free notes', notes: 'not from an assignment' }]
  }),
  trainRow({
    id: 'ts-null',
    started_at: '2026-08-15T15:00:00Z',
    created_at: '2026-08-15T16:00:00Z',
    warm_up: 'legacy warm',
    blocks: null
  })
];

function asg(extra){
  return Object.assign({
    athlete_id: ATHLETE_ID,
    coach_id: COACH_ID,
    description: '',
    due_date: null,
    created_at: '2026-10-01T00:00:00Z',
    completed_at: null,
    deleted_at: null,
    custom_workout_item_id: null,
    library_item_id: null
  }, extra);
}

const ASSIGNMENTS = [
  asg({ id: 'asg-1', title: 'Repeaters week' }),
  asg({ id: 'asg-2', title: 'Done week', completed_at: '2026-10-21T00:00:00Z' }),
  asg({ id: 'asg-3', title: 'No log yet' })
];

const CLIMB = {
  id: 'climb-1',
  user_id: ATHLETE_ID,
  created_at: '2026-11-03T12:00:00Z',
  route_name: 'Pocket problem',
  zone: 'learning',
  deleted_at: null
};

function savedHang(){
  const block = JSON.parse(JSON.stringify(CONTRACT));
  block.id = 'hb-saved';
  block.sets.forEach(function(s){
    s.load = s.grip === 'Half crimp' ? '35 lb assist' : '45 lb assist';
  });
  return block;
}

const SAVED_WARM = {
  id: 'wu-saved',
  shape: 'check',
  title: 'Warm up',
  notes: '',
  complete: false,
  attempts: [],
  rest_after_sec: 120,
  timer_enabled: false,
  timer_started_at: null,
  timer_ended_at: null,
  interval_started_at: null,
  duration_sec: null,
  items: [{ id: 'item-1', text: 'Shoulder rolls', complete: false }]
};

function listen(page, bag){
  page.on('pageerror', function(err){ bag.push('page:' + String(err)); });
  page.on('console', function(msg){
    if(msg.type() === 'error') bag.push('console:' + msg.text());
  });
}

function quiet(bag){
  return bag.filter(function(line){
    return !/Failed to load resource/i.test(line) && !/favicon/i.test(line) && !/status of 400/i.test(line);
  });
}

async function openAthlete(page){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  await tap(page, '.roster-row');
}

async function run(){
  contractFromVm();

  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 390, height: 700 },
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
      await openAthlete(page);
      await page.waitForSelector('#assign-launch-btn', { state: 'attached', timeout: 8000 });
      await tap(page, '#assign-launch-btn');
      await page.waitForSelector('#assign-kind-workout', { timeout: 8000 });
      await tap(page, '#assign-kind-workout');
      await page.waitForSelector('#new-a-lib-results', { timeout: 8000 });
      const bar = await page.evaluate(function(){
        var el = document.querySelector('.aw-lib-results');
        var cs = getComputedStyle(el);
        return { color: cs.scrollbarColor, width: cs.scrollbarWidth };
      });
      assert.ok(bar.width === 'thin', 'thin scrollbar, got ' + bar.width);
      assert.ok(bar.color && bar.color !== 'auto', 'dark scrollbar-color, got ' + bar.color);

      await tap(page, '#wiz-create-custom');
      await page.waitForSelector('#cwb-root .cwb-menu', { timeout: 8000 });
      await page.fill('#new-a-name', 'A2B warmup');

      const chips = await page.locator('#cwb-root .cwb-chip').allTextContents();
      const labels = chips.map(function(t){ return t.trim(); });
      assert.strictEqual(labels[0], 'Warm up');
      assert.strictEqual(labels[labels.length - 1], 'Cool down');

      assert.strictEqual(await page.locator('#cwb-root [data-act="jump-add"]').count(), 0, 'no top Add block on an empty session');
      assert.strictEqual(await page.locator('#cwb-root .cwb-chip').count(), 8, 'add-block chips stay on the page');

      await tap(page, '#cwb-root [data-act="add"][data-shape="rep_pass_fail"]');
      const hb = page.locator('#cwb-root .cwb-card').nth(0);
      assert.strictEqual(await hb.locator('[data-f="rowGrip"]').first().getAttribute('aria-label'), 'Grip');
      assert.strictEqual(await hb.locator('[data-f="rowLoad"]').first().getAttribute('aria-label'), 'Load');
      assert.ok((await hb.locator('.cwb-lab').allTextContents()).some(function(t){ return /Rest between sets/.test(t); }));
      assert.strictEqual(await hb.locator('[data-f="grip"]').count(), 0);
      assert.strictEqual(await hb.locator('[data-f="assistance"]').count(), 0);
      assert.strictEqual(await hb.locator('[data-f="rowLoad"]').first().getAttribute('placeholder'), '35 lb assist');

      await hb.locator('[data-act="customize-sets"]').click();
      await hb.locator('[data-act="set-menu"]').first().click();
      for(var i = 0; i < 5; i++) await hb.locator('[data-act="rep-plus"]').first().click();
      assert.strictEqual(await hb.locator('[data-act="rep-plus"]').first().isDisabled(), true, '+ Rep stops at 10');
      await hb.locator('[data-act="rep-minus"]').first().click();
      assert.strictEqual(await hb.locator('[data-act="rep-plus"]').first().isDisabled(), false);

      for(var s = 0; s < 7; s++) await hb.locator('[data-act="set-plus"]').click();
      assert.strictEqual(await hb.locator('.cwb-setrow').count(), 8);
      assert.strictEqual(await hb.locator('[data-act="set-plus"]').isDisabled(), true, 'sets stop at 8');
      await hb.locator('[data-act="del-set"]').first().click();
      assert.strictEqual(await hb.locator('.cwb-setrow').count(), 7);
      assert.strictEqual(await hb.locator('[data-act="set-plus"]').isDisabled(), false);
      assert.strictEqual(await hb.locator('[data-act="del-set"]').first().isDisabled(), false);

      await hb.locator('[data-f="setGrip"]').first().fill('Half crimp');
      await hb.locator('[data-f="setLoad"]').first().fill('35 lb assist');
      await hb.locator('[data-f="setRestU"]').first().selectOption('min');
      await hb.locator('[data-f="setRest"]').first().fill('3');
      await hb.locator('[data-act="same-set"]').first().click();
      assert.strictEqual(await hb.locator('[data-f="setGrip"]').nth(1).inputValue(), 'Half crimp');
      assert.strictEqual(await hb.locator('[data-f="setLoad"]').nth(1).inputValue(), '35 lb assist');
      await hb.locator('.cwb-setrow').nth(1).locator('[data-act="set-menu"]').click();
      assert.strictEqual(await hb.locator('[data-f="setRest"]').inputValue(), '3');
      assert.strictEqual(await hb.locator('[data-f="setRestU"]').inputValue(), 'min');

      await hb.locator('[data-act="preset"][data-preset="repeaters"]').click();
      await hb.locator('[data-act="preset"][data-preset="repeaters"]').click();
      await hb.locator('[data-act="preset"][data-preset="max_hang"]').click();
      assert.strictEqual(await hb.locator('[data-f="on_sec"]').inputValue(), '10');
      assert.strictEqual(await hb.locator('[data-f="off_sec"]').inputValue(), '');
      await hb.locator('[data-act="preset"][data-preset="custom"]').click();
      assert.strictEqual(await hb.locator('.cwb-griprow').count(), 1);
      await hb.locator('[data-act="preset"][data-preset="repeaters_2_grips"]').click();
      const got = await page.evaluate(function(){
        var blocks = window.__cwbTest.clean();
        var b = blocks.find(function(x){ return x.preset === 'repeaters_2_grips'; });
        delete b.id;
        return b;
      });
      assert.deepStrictEqual(got, CONTRACT);

      await hb.locator('[data-act="customize-sets"]').click();
      const loads = hb.locator('[data-f="setLoad"]');
      for(var a = 0; a < 3; a++) await loads.nth(a).fill('35 lb assist');
      for(var c = 3; c < 6; c++) await loads.nth(c).fill('45 lb assist');
      await hb.locator('[data-act="set-menu"]').first().click();
      await hb.locator('[data-f="setRestU"]').first().selectOption('sec');
      assert.strictEqual(await hb.locator('[data-f="setRest"]').first().inputValue(), '180');
      await hb.locator('[data-f="setRestU"]').first().selectOption('min');
      await hb.locator('[data-act="toggle"]').click();
      const sum = await hb.locator('.cwb-sum').textContent();
      assert.strictEqual(String(sum).replace(/\s+/g, ' ').trim(), 'Hangboard repeaters · 6 sets · 7s on / 3s off');
      await hb.locator('[data-act="toggle"]').click();

      await tap(page, '#cwb-root [data-act="add"][data-shape="warmup"]');
      await tap(page, '#cwb-root [data-act="add"][data-shape="cooldown"]');
      const warm = page.locator('#cwb-root .cwb-card', { hasText: 'Warm up' }).last();
      assert.strictEqual(await warm.locator('[data-f="title"]').inputValue(), 'Warm up');
      assert.strictEqual(await warm.locator('[data-f="item"]').count(), 1);
      assert.strictEqual(await warm.locator('[data-act="del-item"]').isDisabled(), true);
      await warm.locator('[data-act="add-item"]').click();
      assert.strictEqual(await warm.locator('[data-f="item"]').count(), 2);
      await warm.locator('[data-act="del-item"]').first().click();
      assert.strictEqual(await warm.locator('[data-f="item"]').count(), 1);
      await warm.locator('[data-f="item"]').fill('Shoulder rolls');
      const cool = page.locator('#cwb-root .cwb-card', { hasText: 'Cool down' }).last();
      assert.strictEqual(await cool.locator('[data-f="title"]').inputValue(), 'Cool down');
      await cool.locator('[data-f="item"]').fill('Easy walk');
      assert.strictEqual(await page.locator('#cwb-root [data-act="jump-add"]').count(), 1, 'top Add block shows at 3 blocks');
      await page.evaluate(function(){ document.getElementById('assign-wizard-overlay').scrollTop = 0; });
      await page.locator('#cwb-root [data-act="jump-add"]').click();
      const afterMenu = await page.locator('#cwb-root .cwb-menu').boundingBox();
      assert.ok(afterMenu && afterMenu.y >= 0 && afterMenu.y < 800, 'chip row is in view');
      assert.strictEqual(await page.locator('#cwb-root .cwb-menu.cwb-menu-flash').count(), 1, 'Add block highlights the chip row');
      await warm.locator('[data-act="toggle"]').click();
      assert.ok(/1 item/.test(await warm.locator('.cwb-sum').textContent()));

      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      await tap(page, '#new-a-submit');
      await page.waitForTimeout(600);
      const cw = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
      assert.ok(cw, 'custom workout saved');
      const hbSaved = cw.sections.find(function(b){ return b.shape === 'rep_pass_fail'; });
      assert.strictEqual(hbSaved.preset, 'repeaters_2_grips');
      assert.strictEqual(hbSaved.on_sec, 7);
      assert.strictEqual(hbSaved.off_sec, 3);
      assert.strictEqual(hbSaved.sets[0].grip, 'Half crimp');
      assert.strictEqual(hbSaved.sets[0].load, '35 lb assist');
      assert.strictEqual(hbSaved.sets[3].grip, '3-finger drag');
      assert.strictEqual(hbSaved.sets[3].load, '45 lb assist');
      assert.strictEqual(hbSaved.sets[0].rest_after_sec, 180);
      assert.strictEqual(hbSaved.sets[0].reps.length, 6);
      const warmSaved = cw.sections.find(function(b){ return b.title === 'Warm up'; });
      const coolSaved = cw.sections.find(function(b){ return b.title === 'Cool down'; });
      assert.strictEqual(warmSaved.shape, 'check');
      assert.strictEqual(warmSaved.complete, false);
      assert.ok(Array.isArray(warmSaved.attempts));
      assert.strictEqual(warmSaved.items.length, 1);
      assert.strictEqual(warmSaved.items[0].text, 'Shoulder rolls');
      assert.strictEqual(typeof warmSaved.items[0].complete, 'boolean');
      assert.ok(warmSaved.items[0].id);
      assert.strictEqual(coolSaved.shape, 'check');
      assert.strictEqual(coolSaved.items[0].text, 'Easy walk');
      assert.ok(cw.sections.filter(function(b){ return b.shape === 'check'; }).length >= 2, 'more than one check block');
    });

    const editSections = [savedHang(), JSON.parse(JSON.stringify(SAVED_WARM)), JSON.parse(JSON.stringify(LEGACY))];
    const CW = {
      id: 'cw-1', category: 'Hangboard', name: 'A2B', description: '', type: 'custom',
      visibility: 'private', created_by: COACH_ID, created_at: '2026-10-20T00:00:00Z',
      training_focus: 'Hangboard', sections: editSections, created_by_role: 'coach'
    };
    const EDIT_ASG = asg({ id: 'asg-edit', title: 'A2B', custom_workout_item_id: 'cw-1', due_date: '2026-11-20' });
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
      await openAthlete(page);
      await tap(page, '[data-path="plan"]');
      await tap(page, '#athlete-path-subs [data-pane="assignments"]');
      await page.waitForSelector('.assign-edit-btn[data-id="asg-edit"]', { timeout: 8000 });
      await tap(page, '.assign-edit-btn[data-id="asg-edit"]');
      await page.waitForSelector('#wiz-edit-blocks', { timeout: 8000 });
      await tap(page, '#wiz-edit-blocks');
      await page.waitForSelector('#cwb-root .cwb-card', { timeout: 8000 });
      const hbEdit = page.locator('#cwb-root .cwb-card').nth(0);
      assert.strictEqual(await hbEdit.locator('[data-f="rowGrip"]').first().inputValue(), 'Half crimp');
      assert.strictEqual(await hbEdit.locator('[data-f="rowLoad"]').first().inputValue(), '35 lb assist');
      assert.strictEqual(await hbEdit.locator('[data-f="allRest"]').inputValue(), '3');
      assert.strictEqual(await hbEdit.locator('[data-f="allRestU"]').inputValue(), 'min');
      assert.strictEqual(await hbEdit.locator('[data-f="on_sec"]').inputValue(), '7');
      const warmEdit = page.locator('#cwb-root .cwb-card').nth(1);
      assert.strictEqual(await warmEdit.locator('[data-f="item"]').inputValue(), 'Shoulder rolls');
      const legacy = page.locator('#cwb-root .cwb-card').nth(2);
      assert.strictEqual(await legacy.locator('[data-f="rowGrip"]').inputValue(), 'half crimp');
      assert.strictEqual(await legacy.locator('[data-f="rowLoad"]').inputValue(), '+35 lb');
      const opened = await page.evaluate(function(){ return window.__cwbTest.clean(); });
      const oldOpened = opened.find(function(b){ return b.id === 'old-hb'; });
      assert.strictEqual(oldOpened.grip, 'half crimp');
      assert.strictEqual(oldOpened.assistance, '+35 lb');
      assert.strictEqual(oldOpened.sets[0].grip, 'half crimp');
      assert.strictEqual(oldOpened.sets[0].load, '+35 lb');
      await hbEdit.locator('[data-f="rowLoad"]').first().fill('40 lb assist');
      await tap(page, '#edit-cw-save');
      await page.waitForTimeout(500);
      const patched = recorded.filter(function(r){ return r.method === 'PATCH' && r.url.indexOf('custom_workouts') !== -1; }).pop();
      assert.ok(patched, 'edit workout PATCH');
      assert.strictEqual(patched.body.sections[0].sets[0].load, '40 lb assist');
      assert.strictEqual(patched.body.sections[0].sets[0].grip, 'Half crimp');
      assert.strictEqual(patched.body.sections[0].sets[0].rest_after_sec, 180);
      assert.strictEqual(patched.body.sections[1].shape, 'check');
      assert.strictEqual(patched.body.sections[1].items[0].text, 'Shoulder rolls');
      assert.strictEqual(patched.body.sections[2].sets[0].grip, 'half crimp');
      assert.strictEqual(patched.body.sections[2].sets[0].load, '+35 lb');
      assert.strictEqual(patched.body.sections[2].grip, 'half crimp');
      assert.strictEqual(patched.body.sections[2].assistance, '+35 lb');
    });

    const errors = [];
    let sawLinkQuery = false;
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      assignments: ASSIGNMENTS,
      sessions: [CLIMB],
      stub: async function(route, req){
        if(req.method === 'GET' && req.url.indexOf('/rest/v1/training_sessions') !== -1){
          if(req.url.indexOf('assignment_id=in.') !== -1){
            sawLinkQuery = true;
            var linked = JOURNAL_ROWS.filter(function(r){ return r.assignment_id; }).slice().reverse();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(linked) });
            return true;
          }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(JOURNAL_ROWS) });
          return true;
        }
        return false;
      }
    }, async function(page){
      listen(page, errors);
      await openAthlete(page);
      await tap(page, '[data-path="plan"]');
      await tap(page, '#athlete-path-subs [data-pane="assignments"]');
      await page.waitForSelector('.assign-card', { timeout: 8000 });
      await page.waitForFunction(function(){
        return /Logged/.test((document.getElementById('detail-assignments') || {}).innerText || '');
      }, null, { timeout: 8000 });
      const card = page.locator('.assign-card', { hasText: 'Repeaters week' });
      const logged = await card.locator('.assign-logged').innerText();
      assert.match(logged, /Logged/);
      assert.match(logged, /\+1 more/);
      assert.match(logged, /2026/);
      await card.locator('[data-show-session]').click();
      assert.strictEqual(await card.locator('.assign-session-detail').getAttribute('hidden'), null);
      const sessionText = await card.locator('.assign-session-detail').innerText();
      assert.match(sessionText, /4 of 7 sent/);
      assert.match(sessionText, /half crimp 15 lbs · 3 x 6/);
      assert.match(sessionText, /pass/i);
      assert.match(sessionText, /fail/i);
      assert.match(sessionText, /untested/i);
      await page.locator('.completed-group > summary').click();
      const done = page.locator('.assign-card', { hasText: 'Done week' });
      assert.match(await done.locator('.assign-logged').innerText(), /Logged/);
      assert.strictEqual(await done.locator('.assign-logged-more').count(), 0);
      const none = page.locator('.assign-card', { hasText: 'No log yet' });
      assert.strictEqual(await none.locator('.assign-logged').count(), 0);

      await tap(page, '[data-path="notes"]');
      await tap(page, '#athlete-path-subs [data-pane="journal"]');
      await page.waitForSelector('.journal-entry[data-session-id="ts-new"]', { timeout: 8000 });
      const entry = page.locator('.journal-entry[data-session-id="ts-new"]');
      assert.notStrictEqual(await entry.locator('.journal-block-detail').getAttribute('hidden'), null, 'Show blocks starts collapsed');
      assert.doesNotMatch(await entry.innerText(), /untested/i);
      assert.match(await entry.innerText(), /From assignment: Repeaters week/);
      await entry.locator('[data-show-blocks]').click();
      assert.strictEqual(await entry.locator('.journal-block-detail').getAttribute('hidden'), null);
      const detail = await entry.locator('.journal-block-detail').innerText();
      assert.match(detail, /4 of 7 sent/);
      assert.match(detail, /half crimp 15 lbs · 3 x 6/);
      assert.match(detail, /Set 1 · Half crimp · 15 lbs/);
      assert.match(detail, /add a little next week/);
      assert.match(detail, /Shoulder rolls · done/);
      assert.match(detail, /Easy hangs · not done/);
      assert.match(detail, /Pull-ups/);
      assert.match(detail, /3 rounds/);
      assert.match(detail, /Box breathing/);
      assert.match(detail, /Rest · 10 min/);
      assert.match(detail, /work 120s \/ rest 60s × 4 sets/);
      assert.match(detail, /kept as logged/);
      assert.match(detail, /Boulder 2/);
      assert.match(detail, /smooth/);
      assert.match(detail, /Rest after round/);
      assert.strictEqual(await entry.locator('.clog-rep.is-pass').count(), 14);
      assert.strictEqual(await entry.locator('.clog-rep.is-fail').count(), 2);
      assert.strictEqual(await entry.locator('.clog-rep.is-untested').count(), 2);
      const round4 = await entry.locator('.clog-round').nth(3).locator('.clog-item').allTextContents();
      assert.strictEqual(round4.filter(function(t){ return /not done/.test(t); }).length, 3);
      const nil = page.locator('.journal-entry[data-session-id="ts-null"]');
      assert.strictEqual(await nil.locator('[data-show-blocks]').count(), 0);
      assert.match(await nil.innerText(), /legacy warm/);
      assert.doesNotMatch(await page.locator('.journal-entry[data-session-id="ts-free"]').innerText(), /From assignment/);
      const climb = page.locator('.journal-entry[data-kind="climb"]');
      assert.strictEqual(await climb.locator('[data-show-blocks]').count(), 0);
      assert.match(await climb.innerText(), /Pocket problem/);
      const overflow = await page.evaluate(function(){ return getComputedStyle(document.body).overflowY; });
      assert.notStrictEqual(overflow, 'hidden');
      assert.deepStrictEqual(quiet(errors), []);
    });
    assert.strictEqual(sawLinkQuery, true, 'assignment link query ran');

    const errors400 = [];
    let saw400 = false;
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      assignments: ASSIGNMENTS,
      sessions: [CLIMB],
      stub: async function(route, req){
        if(req.method === 'GET' && req.url.indexOf('/rest/v1/training_sessions') !== -1){
          if(req.url.indexOf('assignment_id=in.') !== -1){
            saw400 = true;
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({ code: '42703', message: 'column training_sessions.assignment_id does not exist' })
            });
            return true;
          }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(JOURNAL_ROWS) });
          return true;
        }
        return false;
      }
    }, async function(page){
      listen(page, errors400);
      await openAthlete(page);
      await tap(page, '[data-path="plan"]');
      await tap(page, '#athlete-path-subs [data-pane="assignments"]');
      await page.waitForSelector('.assign-title', { timeout: 8000 });
      await page.waitForTimeout(400);
      assert.match(await page.locator('#detail-assignments').innerText(), /Repeaters week/);
      assert.match(await page.locator('#detail-assignments').innerText(), /No log yet/);
      assert.strictEqual(await page.locator('#detail-assignments .assign-logged').count(), 0);
      assert.strictEqual(await page.locator('#detail-assignments .form-error').count(), 0);
      assert.doesNotMatch(await page.locator('#detail-assignments').innerText(), /Could not load/);
      assert.deepStrictEqual(quiet(errors400), []);
    });
    assert.strictEqual(saw400, true, 'missing column was requested');
  } finally {
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().then(function(){
  console.log('real-flow-coach-builder-a2b: ok');
}).catch(function(err){
  console.error(err);
  process.exit(1);
});
