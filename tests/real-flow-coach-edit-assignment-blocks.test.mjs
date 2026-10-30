import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, postsTo, firstBody,
  COACH_ID, ATHLETE_ID
} from './harness.mjs';

// Coach opens an existing assignment, edits the workout blocks from the
// Customize step, saves, lands back in the assignment wizard with the title
// and due date intact, then saves the assignment.
const BLOCKS = [
  { id: 'b1', shape: 'rep_pass_fail', title: 'Repeaters', grip: 'half crimp', assistance: '+35 lb',
    sets: [{ reps: [{ ok: null }, { ok: null }] }], progression_note: '' },
  { id: 'b2', shape: 'section', title: 'Mental', notes: 'Box breathing' }
];
const CW = { id: 'cw-1', category: 'Hangboard', name: 'Repeaters', description: 'half crimp', type: 'custom',
  visibility: 'private', created_by: COACH_ID, created_at: '2026-10-20T00:00:00Z',
  training_focus: 'Hangboard', sections: BLOCKS, created_by_role: 'coach' };
const ASG = { id: 'asg-1', athlete_id: ATHLETE_ID, coach_id: COACH_ID, title: 'Repeaters',
  description: 'we will do this together', custom_workout_item_id: 'cw-1', library_item_id: null,
  due_date: '2026-10-30', created_at: '2026-10-20T00:00:00Z', completed_at: null, deleted_at: null };

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1400 },
      assignments: [ASG],
      session: { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } },
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
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([Object.assign({}, ASG, req.body || {})]) });
          return true;
        }
        return false;
      }
    }, async function(page, recorded){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await tap(page, '[data-path="plan"]');
      await tap(page, '#athlete-path-subs [data-pane="assignments"]');
      await page.waitForSelector('.assign-edit-btn[data-id="asg-1"]', { timeout: 8000 });
      await tap(page, '.assign-edit-btn[data-id="asg-1"]');

      // Customize step offers the block editor for a workout this coach owns
      await page.waitForSelector('#wiz-edit-blocks', { timeout: 8000 });
      await page.fill('#new-a-name-edit', 'Repeaters for Jess');
      await tap(page, '#wiz-edit-blocks');
      await page.waitForSelector('#cwb-root .cwb-card', { timeout: 8000 });
      assert.strictEqual(await page.locator('#cwb-root .cwb-card').count(), 2, 'both blocks load');
      await page.locator('#cwb-root .cwb-card').nth(0).locator('[data-f="assistance"]').fill('+45 lb');
      await tap(page, '#edit-cw-save');

      // back on Customize with the assignment title kept
      await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
      assert.strictEqual(await page.inputValue('#new-a-name-edit'), 'Repeaters for Jess', 'assignment title kept');
      const cwPatch = recorded.filter(function(r){ return r.method === 'PATCH' && r.url.indexOf('custom_workouts') !== -1; }).pop();
      assert.ok(cwPatch, 'workout PATCH sent');
      assert.strictEqual(cwPatch.body.sections[0].assistance, '+45 lb');
      assert.strictEqual(cwPatch.body.name, 'Repeaters', 'workout name not overwritten by assignment title');

      // finish the assignment edit
      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      assert.strictEqual(await page.inputValue('#new-a-due'), '2026-10-30', 'due date kept');
      await tap(page, '#new-a-submit');
      await page.waitForTimeout(800);
      const ap = recorded.filter(function(r){ return r.method === 'PATCH' && r.url.indexOf('/assignments') !== -1; }).pop();
      assert.ok(ap, 'assignment PATCH sent');
      assert.strictEqual(ap.body.title, 'Repeaters for Jess');
    });
  } finally {
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}
run().then(function(){ console.log('real-flow-coach-edit-assignment-blocks: ok'); })
  .catch(function(e){ console.error(e); process.exit(1); });
