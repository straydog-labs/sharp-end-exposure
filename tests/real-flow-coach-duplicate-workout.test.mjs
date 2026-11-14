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
const NOTE = 'Changes this workout itself, so any other assignment using it changes too.';

function blocksNote(name){
  return name + ' — ' + NOTE;
}

const CUSTOM_SECTIONS = [
  { id: 'b1', shape: 'rep_pass_fail', title: 'Repeaters', grip: 'half crimp', assistance: '+35 lb',
    sets: [{ reps: [{ ok: null }, { ok: null }] }], progression_note: '', marker: { keep: 'yes' } },
  { id: 'b2', shape: 'section', title: 'Mental', notes: 'Box breathing' }
];
const CW = {
  id: 'cw-1', category: 'Hangboard', name: 'Repeaters', description: 'half crimp protocol',
  type: 'custom', visibility: 'private', created_by: COACH_ID, created_at: '2026-10-20T00:00:00Z',
  training_focus: 'Hangboard', sections: CUSTOM_SECTIONS, created_by_role: 'coach'
};
const ROUTES_SECTIONS = [
  { id: 'e1', shape: 'emom', title: 'Feet', rounds: [
    { boulders: [{ id: 'x1', text: 'slab', complete: false }], notes: '', rest_after_sec: 60, complete: false }
  ] }
];
const LIB_ROUTES = {
  id: 'lib-routes', name: 'Silent Feet', description: 'quiet feet on slab',
  training_focus: 'Routes', category: 'Routes', sections: ROUTES_SECTIONS
};
const BAD_SECTIONS = [
  { id: 'h1', shape: 'rep_pass_fail', title: 'Hangs', grip: 'open hand', assistance: '',
    sets: [{ reps: [{ ok: null }] }], progression_note: '' }
];
const LIB_BAD = {
  id: 'lib-bad', name: 'Old Power', description: 'legacy power session',
  training_focus: 'Limit Bouldering', category: 'Limit Bouldering', sections: BAD_SECTIONS
};

function coachSession(){
  return { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } };
}

function asg(extra){
  return Object.assign({
    coach_id: COACH_ID, athlete_id: ATHLETE_ID, description: 'we will do this together',
    due_date: '2026-10-30', completed_at: null, deleted_at: null,
    library_item_id: null, custom_workout_item_id: null, resource_link: null,
    created_at: '2026-10-20T00:00:00Z'
  }, extra);
}

function libraryRows(url, rows){
  var idMatch = String(url).match(/id=eq\.([^&]+)/);
  var out = rows.map(function(r){ return Object.assign({}, r); });
  if(idMatch){
    var id = decodeURIComponent(idMatch[1]);
    out = out.filter(function(r){ return r.id === id; });
  }
  if(String(url).indexOf('sections') === -1){
    out = out.map(function(r){
      var copy = Object.assign({}, r);
      delete copy.sections;
      return copy;
    });
  }
  return out;
}

function makeStub(opts){
  opts = opts || {};
  var customs = (opts.customs || [CW]).map(function(r){ return Object.assign({}, r); });
  var libs = opts.libs || [LIB_ROUTES, LIB_BAD];
  var copyN = 0;
  return async function(route, req){
    if(req.method === 'GET' && req.url.indexOf('/rest/v1/workout_library') !== -1){
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(libraryRows(req.url, libs))
      });
      return true;
    }
    if(req.method === 'GET' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(libraryRows(req.url, customs))
      });
      return true;
    }
    if(req.method === 'POST' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
      if(opts.failCustomPost){
        await route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ message: 'duplicate failed', code: '23514' })
        });
        return true;
      }
      copyN += 1;
      var row = Object.assign({ id: 'cw-copy-' + copyN }, req.body || {});
      customs.push(row);
      await route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify([row])
      });
      return true;
    }
    if(req.method === 'PATCH' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([Object.assign({}, req.body || {})])
      });
      return true;
    }
    if(req.method === 'POST' && req.url.indexOf('/rest/v1/assignments') !== -1){
      await route.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify([Object.assign({ id: 'asg-new' }, req.body || {})])
      });
      return true;
    }
    if(req.method === 'PATCH' && req.url.indexOf('/rest/v1/assignments') !== -1){
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([Object.assign({ id: 'asg-1' }, req.body || {})])
      });
      return true;
    }
    return false;
  };
}

async function openAthlete(page){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  await tap(page, '.roster-row');
}

async function openCustomizeFromEdit(page, id){
  await openAthlete(page);
  await tap(page, '[data-path="plan"]');
  await tap(page, '#athlete-path-subs [data-pane="assignments"]');
  await page.waitForSelector('.assign-edit-btn[data-id="' + id + '"]', { timeout: 8000 });
  await tap(page, '.assign-edit-btn[data-id="' + id + '"]');
  await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
}

function assertAllowed(focus, label){
  assert.ok(ALLOWED.indexOf(focus) !== -1, (label || 'focus') + ' not in the allowed list: ' + focus);
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1400 },
      session: coachSession(),
      assignments: [asg({ id: 'asg-1', title: 'Repeaters', custom_workout_item_id: 'cw-1' })],
      stub: makeStub()
    }, async function(page, recorded){
      await openCustomizeFromEdit(page, 'asg-1');
      await page.waitForSelector('#wiz-duplicate-workout', { timeout: 8000 });
      assert.strictEqual((await page.locator('#aw-q').innerText()).trim(), 'Customize for this athlete');
      assert.strictEqual((await page.locator('#wiz-blocks-note').innerText()).trim(), blocksNote('Repeaters'));
      assert.strictEqual(await page.getAttribute('#wiz-blocks-field', 'data-workout-id'), 'cw-1');
      await page.fill('#new-a-name-edit', 'Jess session');
      await tap(page, '#wiz-duplicate-workout');
      await page.waitForFunction(function(){
        var el = document.getElementById('wiz-blocks-field');
        return !!(el && el.getAttribute('data-workout-id') && el.getAttribute('data-workout-id') !== 'cw-1');
      }, null, { timeout: 8000 });
      const copyId = await page.getAttribute('#wiz-blocks-field', 'data-workout-id');
      assert.strictEqual(await page.inputValue('#new-a-name-edit'), 'Jess session', 'Title unchanged');
      assert.strictEqual((await page.locator('#aw-q').innerText()).trim(), 'Customize for this athlete', 'stays on step 3');
      assert.strictEqual((await page.locator('#wiz-blocks-note').innerText()).trim(), blocksNote('Repeaters (copy)'));
      const inserted = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
      assert.ok(inserted, 'custom workout insert');
      assert.strictEqual(inserted.name, 'Repeaters (copy)');
      assert.strictEqual(inserted.description, 'half crimp protocol');
      assert.deepStrictEqual(inserted.sections, CUSTOM_SECTIONS);
      assert.strictEqual(inserted.training_focus, 'Hangboard');
      assertAllowed(inserted.training_focus, 'custom copy');
      assert.strictEqual(inserted.created_by, COACH_ID);
      assert.strictEqual(inserted.created_by_role, 'coach');
      assert.ok(!recorded.some(function(r){
        return r.method === 'PATCH' && r.url.indexOf('custom_workouts') !== -1;
      }), 'duplicate does not patch the original');

      await page.waitForSelector('#wiz-edit-blocks', { timeout: 8000 });
      await tap(page, '#wiz-edit-blocks');
      await page.waitForSelector('#cwb-root [data-f="rowLoad"]', { timeout: 8000 });
      await page.locator('#cwb-root [data-f="rowLoad"]').first().fill('+45 lb');
      await tap(page, '#edit-cw-save');
      await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
      assert.strictEqual(await page.inputValue('#new-a-name-edit'), 'Jess session', 'title kept after editing the copy');
      const cwPatches = recorded.filter(function(r){
        return r.method === 'PATCH' && r.url.indexOf('custom_workouts') !== -1;
      });
      assert.strictEqual(cwPatches.length, 1, 'one workout PATCH');
      assert.ok(cwPatches[0].url.indexOf('id=eq.' + copyId) !== -1, cwPatches[0].url);
      assert.ok(cwPatches[0].url.indexOf('id=eq.cw-1') === -1, 'original was not patched');
      assert.strictEqual(cwPatches[0].body.name, 'Repeaters (copy)');
      assert.strictEqual(cwPatches[0].body.sections[0].sets[0].load, '+45 lb');

      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      await tap(page, '#new-a-submit');
      await page.waitForSelector('.assign-inline-success', { timeout: 8000 });
      const updated = recorded.filter(function(r){
        return r.method === 'PATCH' && r.url.indexOf('/rest/v1/assignments') !== -1;
      }).pop();
      assert.ok(updated, 'assignment update');
      assert.strictEqual(updated.body.custom_workout_item_id, copyId);
      assert.strictEqual(updated.body.library_item_id, null);
      assert.strictEqual(updated.body.title, 'Jess session');
    });

    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1400 },
      session: coachSession(),
      assignments: [asg({
        id: 'asg-routes', title: 'Silent Feet', library_item_id: 'lib-routes',
        custom_workout_item_id: null, created_at: '2026-11-09T12:00:00Z'
      })],
      stub: makeStub({ customs: [] })
    }, async function(page, recorded){
      await openAthlete(page);
      await page.waitForSelector('#athlete-header-assign', { timeout: 8000 });
      await tap(page, '#athlete-header-assign');
      await page.waitForSelector('#assign-kind-workout', { timeout: 8000 });
      await tap(page, '#assign-kind-workout');
      await page.waitForSelector('#wiz-recent-list .wiz-recent-row', { timeout: 8000 });
      await tap(page, '#wiz-recent-list .wiz-recent-row');
      await page.waitForSelector('#wiz-duplicate-workout', { timeout: 8000 });
      assert.strictEqual(await page.locator('#wiz-edit-blocks').count(), 0, 'catalog item is not edited in place');
      assert.strictEqual(await page.getAttribute('#wiz-blocks-field', 'data-workout-id'), 'lib-routes');
      await page.fill('#new-a-name-edit', 'Keep this title');
      await tap(page, '#wiz-duplicate-workout');
      await page.waitForFunction(function(){
        var el = document.getElementById('wiz-blocks-field');
        return !!(el && el.getAttribute('data-workout-source') === 'custom');
      }, null, { timeout: 8000 });
      const copyId = await page.getAttribute('#wiz-blocks-field', 'data-workout-id');
      assert.notStrictEqual(copyId, 'lib-routes');
      assert.strictEqual(await page.inputValue('#new-a-name-edit'), 'Keep this title');
      assert.strictEqual((await page.locator('#aw-q').innerText()).trim(), 'Customize for this athlete');
      assert.strictEqual(await page.locator('#wiz-edit-blocks').count(), 1, 'edit now targets the copy');
      assert.strictEqual((await page.locator('#wiz-blocks-note').innerText()).trim(), blocksNote('Silent Feet (copy)'));
      const inserted = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
      assert.strictEqual(inserted.name, 'Silent Feet (copy)');
      assert.strictEqual(inserted.description, 'quiet feet on slab');
      assert.deepStrictEqual(inserted.sections, ROUTES_SECTIONS);
      assert.strictEqual(inserted.training_focus, 'Routes', 'valid catalog focus is kept');
      assertAllowed(inserted.training_focus, 'catalog copy');
      assert.strictEqual(inserted.created_by, COACH_ID);

      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      await tap(page, '#new-a-submit');
      await page.waitForSelector('.assign-inline-success', { timeout: 8000 });
      const created = firstBody(postsTo(recorded, 'assignments', 'POST'));
      assert.ok(created, 'assignment create');
      assert.strictEqual(created.custom_workout_item_id, copyId);
      assert.ok(!created.library_item_id, 'assignment does not keep the catalog id');
      assert.strictEqual(created.title, 'Keep this title');
    });

    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1400 },
      session: coachSession(),
      assignments: [],
      stub: makeStub({ customs: [] })
    }, async function(page, recorded){
      await openAthlete(page);
      await page.waitForSelector('#athlete-header-assign', { timeout: 8000 });
      await tap(page, '#athlete-header-assign');
      await page.waitForSelector('#assign-kind-workout', { timeout: 8000 });
      await tap(page, '#assign-kind-workout');
      await page.waitForSelector('#new-a-lib-search', { timeout: 8000 });
      await page.fill('#new-a-lib-search', 'Old Power');
      await page.waitForSelector('.aw-chip[data-id="lib-bad"]', { timeout: 8000 });
      await tap(page, '.aw-chip[data-id="lib-bad"]');
      await page.waitForSelector('#wiz-duplicate-workout', { timeout: 8000 });
      await page.fill('#new-a-name-edit', 'Derived title');
      await tap(page, '#wiz-duplicate-workout');
      await page.waitForFunction(function(){
        var el = document.getElementById('wiz-blocks-field');
        return !!(el && el.getAttribute('data-workout-source') === 'custom');
      }, null, { timeout: 8000 });
      assert.strictEqual(await page.inputValue('#new-a-name-edit'), 'Derived title');
      const inserted = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
      assert.strictEqual(inserted.name, 'Old Power (copy)');
      assert.strictEqual(inserted.description, 'legacy power session');
      assert.deepStrictEqual(inserted.sections, BAD_SECTIONS);
      assert.strictEqual(inserted.training_focus, 'Hangboard', 'invalid source focus is derived from blocks');
      assert.notStrictEqual(inserted.training_focus, 'Limit Bouldering');
      assert.notStrictEqual(inserted.training_focus, 'Boulders', 'alias of the invalid focus is not written');
      assertAllowed(inserted.training_focus, 'derived copy');
    });

    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1400 },
      session: coachSession(),
      assignments: [asg({ id: 'asg-1', title: 'Repeaters', custom_workout_item_id: 'cw-1' })],
      stub: makeStub({ failCustomPost: true })
    }, async function(page, recorded){
      await openCustomizeFromEdit(page, 'asg-1');
      await page.waitForSelector('#wiz-duplicate-workout', { timeout: 8000 });
      await page.fill('#new-a-name-edit', 'Jess session');
      await tap(page, '#wiz-duplicate-workout');
      await page.waitForSelector('#new-a-msg .form-error', { timeout: 8000 });
      assert.match(await page.locator('#new-a-msg .form-error').innerText(), /Could not duplicate/);
      assert.strictEqual(await page.inputValue('#new-a-name-edit'), 'Jess session');
      assert.strictEqual(await page.getAttribute('#wiz-blocks-field', 'data-workout-id'), 'cw-1');
      assert.strictEqual(await page.getAttribute('#wiz-blocks-field', 'data-workout-source'), 'custom');
      assert.strictEqual((await page.locator('#aw-q').innerText()).trim(), 'Customize for this athlete');
      assert.strictEqual((await page.locator('#wiz-duplicate-workout').innerText()).trim(), 'Duplicate workout');
      assert.ok(postsTo(recorded, 'custom_workouts', 'POST').length >= 1, 'insert was attempted');
      assert.ok(!recorded.some(function(r){
        return r.method === 'PATCH' && r.url.indexOf('custom_workouts') !== -1;
      }));

      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      await tap(page, '#new-a-submit');
      await page.waitForSelector('.assign-inline-success', { timeout: 8000 });
      const updated = recorded.filter(function(r){
        return r.method === 'PATCH' && r.url.indexOf('/rest/v1/assignments') !== -1;
      }).pop();
      assert.ok(updated, 'assignment still saves');
      assert.strictEqual(updated.body.custom_workout_item_id, 'cw-1', 'selection stayed on the original');
      assert.strictEqual(updated.body.title, 'Jess session');
    });
  } finally {
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().then(function(){ console.log('real-flow-coach-duplicate-workout: ok'); })
  .catch(function(err){ console.error(err); process.exit(1); });
