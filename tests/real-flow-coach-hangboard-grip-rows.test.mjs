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
const six = [0, 1, 2, 3, 4, 5].map(function(){ return { ok: null }; });

const PRESET_JSON = {
  repeaters: '{"shape":"rep_pass_fail","title":"Hangboard repeaters","grip":"","assistance":"","progression_note":"","on_sec":7,"off_sec":3,"preset":"repeaters","complete":false,"attempts":[],"sets":[{"grip":"Half crimp","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]},{"grip":"Half crimp","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]},{"grip":"Half crimp","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]}]}',
  repeaters_2_grips: '{"shape":"rep_pass_fail","title":"Hangboard repeaters","grip":"","assistance":"","progression_note":"","on_sec":7,"off_sec":3,"preset":"repeaters_2_grips","complete":false,"attempts":[],"sets":[{"grip":"Half crimp","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]},{"grip":"Half crimp","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]},{"grip":"Half crimp","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]},{"grip":"3-finger drag","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]},{"grip":"3-finger drag","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]},{"grip":"3-finger drag","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]}]}',
  max_hang: '{"shape":"rep_pass_fail","title":"Max hang","grip":"","assistance":"","progression_note":"","on_sec":10,"off_sec":null,"preset":"max_hang","complete":false,"attempts":[],"sets":[{"grip":"","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]},{"grip":"","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]},{"grip":"","load":"","rest_after_sec":180,"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]}]}',
  custom: '{"shape":"rep_pass_fail","title":"","rest_after_sec":120,"complete":false,"attempts":[],"timer_enabled":false,"timer_started_at":null,"timer_ended_at":null,"interval_started_at":null,"duration_sec":null,"grip":"","assistance":"","sets":[{"reps":[{"ok":null},{"ok":null},{"ok":null},{"ok":null},{"ok":null}]}],"progression_note":"","preset":"custom","on_sec":null,"off_sec":null}'
};

function loadBuilder(){
  const dash = readFileSync(join(__dirname, '..', 'coach-dashboard.html'), 'utf8');
  const start = dash.indexOf('  // ---------- Coach block builder ----------');
  const end = dash.indexOf('  function cwbSectionsForSave(');
  const ctx = {
    console, JSON, Date, Math, Array, Object, String, Number, parseInt, isNaN, setTimeout, clearTimeout,
    escapeHtml: function(s){ return String(s == null ? '' : s); },
    shapedBlockName: function(){ return ''; },
    shapedBlockSummary: function(){ return ''; },
    _assignWizard: { blocks: [] }
  };
  vm.createContext(ctx);
  vm.runInContext(dash.slice(start, end), ctx);
  return ctx;
}

function assertPresetBytes(){
  const ctx = loadBuilder();
  const got = vm.runInContext(`(function(){
    return {
      repeaters: JSON.stringify((function(){ var b = cwbHangPreset('repeaters', 'id'); delete b.id; return b; })()),
      repeaters_2_grips: JSON.stringify((function(){ var b = cwbHangPreset('repeaters_2_grips', 'id'); delete b.id; return b; })()),
      max_hang: JSON.stringify((function(){ var b = cwbHangPreset('max_hang', 'id'); delete b.id; return b; })()),
      custom: JSON.stringify((function(){ var b = cwbHangPreset('custom', 'id'); delete b.id; return b; })())
    };
  })()`, ctx);
  Object.keys(PRESET_JSON).forEach(function(key){
    assert.strictEqual(got[key], PRESET_JSON[key], key + ' preset output changed');
  });
}

function coachSession(){
  return { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } };
}

function saveStub(){
  return async function(route, req){
    if(req.method === 'POST' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([Object.assign({ id: 'cw-new-1' }, req.body || {})]) });
      return true;
    }
    if(req.method === 'POST' && req.url.indexOf('/rest/v1/assignments') !== -1){
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([Object.assign({ id: 'asg-new-1' }, req.body || {})]) });
      return true;
    }
    return false;
  };
}

async function openBuilder(page, name){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  await tap(page, '.roster-row');
  await page.waitForSelector('#assign-launch-btn', { state: 'attached', timeout: 8000 });
  await tap(page, '#assign-launch-btn');
  await page.waitForSelector('#assign-kind-workout', { timeout: 8000 });
  await tap(page, '#assign-kind-workout');
  await page.waitForSelector('#wiz-create-custom', { timeout: 8000 });
  await tap(page, '#wiz-create-custom');
  await page.waitForSelector('#cwb-root .cwb-menu', { timeout: 8000 });
  await page.fill('#new-a-name', name);
}

async function submitWizard(page){
  await tap(page, '#wiz-next');
  await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
  await tap(page, '#wiz-next');
  await page.waitForSelector('#new-a-submit', { timeout: 8000 });
  await tap(page, '#new-a-submit');
  await page.waitForTimeout(400);
}

function setsOf(sections, preset){
  return sections.find(function(b){ return b.preset === preset; }).sets;
}

async function run(){
  assertPresetBytes();
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    let savedPresets = null;
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      stub: saveStub()
    }, async function(page, recorded){
      await openBuilder(page, 'Four presets');
      const names = ['repeaters', 'repeaters_2_grips', 'max_hang', 'custom'];
      for(var i = 0; i < 4; i++) await tap(page, '#cwb-root [data-act="add"][data-shape="rep_pass_fail"]');
      for(var p = 0; p < 4; p++){
        await page.locator('#cwb-root .cwb-card').nth(p).locator('[data-act="preset"][data-preset="' + names[p] + '"]').click();
      }
      const counts = [];
      for(var c = 0; c < 4; c++) counts.push(await page.locator('#cwb-root .cwb-card').nth(c).locator('.cwb-griprow').count());
      assert.deepStrictEqual(counts, [1, 2, 1, 1], 'preset grip rows');
      assert.strictEqual(await page.locator('#cwb-root .cwb-card').nth(0).locator('[data-f="rowGrip"]').inputValue(), 'Half crimp');
      assert.strictEqual(await page.locator('#cwb-root .cwb-card').nth(0).locator('.cwb-gripcount').innerText(), '3');
      const labs = await page.locator('#cwb-root .cwb-card').nth(1).locator('.cwb-onoff').innerText();
      assert.match(labs, /On \(sec\)/i);
      assert.match(labs, /Off \(sec\)/i);
      assert.match(labs, /Reps per set/i);
      assert.match(labs, /Rest between sets/i);
      assert.deepStrictEqual(await page.locator('#cwb-root .cwb-card').nth(1).locator('[data-f="rowGrip"]').evaluateAll(function(els){ return els.map(function(el){ return el.value; }); }), ['Half crimp', '3-finger drag']);
      await submitWizard(page);
      const cw = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
      savedPresets = cw.sections;
      assert.deepStrictEqual(setsOf(savedPresets, 'repeaters'), JSON.parse(PRESET_JSON.repeaters).sets);
      assert.deepStrictEqual(setsOf(savedPresets, 'repeaters_2_grips'), JSON.parse(PRESET_JSON.repeaters_2_grips).sets);
      assert.deepStrictEqual(setsOf(savedPresets, 'max_hang'), JSON.parse(PRESET_JSON.max_hang).sets);
      assert.deepStrictEqual(setsOf(savedPresets, 'custom'), JSON.parse(PRESET_JSON.custom).sets);
    });

    const CW = {
      id: 'cw-1', name: 'Four presets', created_by: COACH_ID, training_focus: 'Hangboard',
      sections: savedPresets, created_by_role: 'coach'
    };
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      assignments: [{
        id: 'asg-1', title: 'Four presets', athlete_id: ATHLETE_ID, coach_id: COACH_ID,
        description: '', due_date: '2026-11-20', created_at: '2026-11-01T00:00:00Z',
        completed_at: null, deleted_at: null, custom_workout_item_id: 'cw-1', library_item_id: null
      }],
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
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'asg-1' }]) });
          return true;
        }
        return false;
      }
    }, async function(page){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await tap(page, '[data-path="plan"]');
      await tap(page, '#athlete-path-subs [data-pane="assignments"]');
      await page.waitForSelector('.assign-edit-btn[data-id="asg-1"]', { timeout: 8000 });
      await page.waitForSelector('.assign-blocks-line', { timeout: 8000 });
      await tap(page, '.assign-edit-btn[data-id="asg-1"]');
      await page.waitForSelector('#wiz-edit-blocks', { timeout: 8000 });
      await tap(page, '#wiz-edit-blocks');
      await page.waitForSelector('#cwb-root .cwb-card', { timeout: 8000 });
      const reopened = await page.evaluate(function(){ return window.__cwbTest.clean(); });
      assert.deepStrictEqual(setsOf(reopened, 'repeaters'), setsOf(savedPresets, 'repeaters'));
      assert.deepStrictEqual(setsOf(reopened, 'repeaters_2_grips'), setsOf(savedPresets, 'repeaters_2_grips'));
      assert.deepStrictEqual(setsOf(reopened, 'max_hang'), setsOf(savedPresets, 'max_hang'));
      assert.deepStrictEqual(setsOf(reopened, 'custom'), setsOf(savedPresets, 'custom'));
    });

    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      stub: saveStub()
    }, async function(page, recorded){
      await openBuilder(page, 'Two grips');
      await tap(page, '#cwb-root [data-act="add"][data-shape="rep_pass_fail"]');
      const hb = page.locator('#cwb-root .cwb-card').nth(0);
      await hb.locator('[data-act="preset"][data-preset="repeaters_2_grips"]').click();
      await hb.locator('[data-act="add-grip"]').click();
      assert.strictEqual(await hb.locator('.cwb-griprow').count(), 3, '+ Grip adds a row');
      await hb.locator('[data-act="preset"][data-preset="repeaters_2_grips"]').click();
      await hb.locator('[data-act="preset"][data-preset="repeaters_2_grips"]').click();
      assert.strictEqual(await hb.locator('[data-f="rowLoad"]').first().getAttribute('placeholder'), '35 lb assist');
      await hb.locator('[data-f="rowLoad"]').nth(0).fill('35 lb assist');
      await hb.locator('[data-f="rowLoad"]').nth(1).fill('45 lb assist');
      const preview = await hb.locator('.cwb-hang-preview').innerText();
      assert.match(preview, /Half crimp · 35 lb assist · 3 sets × 6 hangs = 18 hangs/);
      assert.match(preview, /3-finger drag · 45 lb assist · 3 sets × 6 hangs = 18 hangs/);
      assert.match(preview, /7 s on \/ 3 s off · 3 min rest between sets · 6 sets, 36 hangs total/);
      const expanded = await page.evaluate(function(){ return window.__cwbTest.clean()[0].sets.map(function(s){ return s.load; }); });
      assert.deepStrictEqual(expanded, ['35 lb assist', '35 lb assist', '35 lb assist', '45 lb assist', '45 lb assist', '45 lb assist']);
      await submitWizard(page);
      const cw = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
      assert.deepStrictEqual(cw.sections[0].sets.map(function(s){ return s.load; }), expanded);
      assert.deepStrictEqual(cw.sections[0].sets.map(function(s){ return s.grip; }), [
        'Half crimp', 'Half crimp', 'Half crimp', '3-finger drag', '3-finger drag', '3-finger drag'
      ]);
    });

    const MIX = {
      id: 'mix', shape: 'rep_pass_fail', title: 'Repeaters', grip: 'half crimp', assistance: '',
      progression_note: '', on_sec: 7, off_sec: 3, preset: 'repeaters', complete: false, attempts: [],
      sets: [
        { grip: 'half crimp', load: '35 lb assist', rest_after_sec: 180, reps: six.map(function(r){ return { ok: r.ok }; }) },
        { grip: 'half crimp', load: '35 lb assist', rest_after_sec: 180, reps: six.map(function(r){ return { ok: r.ok }; }) },
        { grip: 'half crimp', load: '40 lb assist', rest_after_sec: 180, reps: six.map(function(r){ return { ok: r.ok }; }) }
      ]
    };
    const MIX_CW = {
      id: 'cw-mix', name: 'Mixed', created_by: COACH_ID, training_focus: 'Hangboard',
      sections: [JSON.parse(JSON.stringify(MIX))], created_by_role: 'coach'
    };
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      assignments: [{
        id: 'asg-mix', title: 'Mixed', athlete_id: ATHLETE_ID, coach_id: COACH_ID,
        description: '', due_date: '2026-11-20', created_at: '2026-11-02T00:00:00Z',
        completed_at: null, deleted_at: null, custom_workout_item_id: 'cw-mix', library_item_id: null
      }],
      stub: async function(route, req){
        if(req.method === 'GET' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MIX_CW]) });
          return true;
        }
        if(req.method === 'PATCH' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([Object.assign({}, MIX_CW, req.body || {})]) });
          return true;
        }
        if(req.method === 'PATCH' && req.url.indexOf('/rest/v1/assignments') !== -1){
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'asg-mix' }]) });
          return true;
        }
        return false;
      }
    }, async function(page, recorded){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await tap(page, '[data-path="plan"]');
      await tap(page, '#athlete-path-subs [data-pane="assignments"]');
      await page.waitForSelector('.assign-edit-btn[data-id="asg-mix"]', { timeout: 8000 });
      await page.waitForSelector('.assign-blocks-line', { timeout: 8000 });
      await tap(page, '.assign-edit-btn[data-id="asg-mix"]');
      await page.waitForSelector('#wiz-edit-blocks', { timeout: 8000 });
      await tap(page, '#wiz-edit-blocks');
      await page.waitForSelector('#cwb-root .cwb-setrow', { timeout: 8000 });
      const hb = page.locator('#cwb-root .cwb-card').nth(0);
      assert.strictEqual(await hb.locator('.cwb-griprow').count(), 0, 'mixed grip opens in per-set view');
      assert.deepStrictEqual(await hb.locator('.cwb-setnum').allTextContents(), ['Set 1', 'Set 2', 'Set 3']);
      assert.deepStrictEqual(await hb.locator('[data-f="setLoad"]').evaluateAll(function(els){ return els.map(function(el){ return el.value; }); }), ['35 lb assist', '35 lb assist', '40 lb assist']);
      await hb.locator('[data-f="title"]').fill('Repeaters.');
      await tap(page, '#edit-cw-save');
      await page.waitForTimeout(400);
      const patched = recorded.filter(function(r){ return r.method === 'PATCH' && r.url.indexOf('custom_workouts') !== -1; }).pop();
      assert.deepStrictEqual(patched.body.sections[0].sets, MIX.sets);
    });
  } finally {
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().then(function(){
  console.log('real-flow-coach-hangboard-grip-rows: ok');
}).catch(function(err){
  console.error(err);
  process.exit(1);
});
