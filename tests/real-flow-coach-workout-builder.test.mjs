import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, postsTo, firstBody,
  COACH_ID, ATHLETE_ID
} from './harness.mjs';

// Coach builds an EMOM + Repeaters session with the block builder, then
// assigns it. Checks the saved blocks use the athlete builder's shapes.
async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1400 },
      session: { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } },
      stub: async function(route, req){
        if(req.method === 'POST' && req.url.indexOf('/rest/v1/custom_workouts') !== -1){
          await route.fulfill({ status: 201, contentType: 'application/json',
            body: JSON.stringify([Object.assign({ id: 'cw-new-1' }, req.body || {})]) });
          return true;
        }
        if(req.method === 'POST' && req.url.indexOf('/rest/v1/assignments') !== -1){
          await route.fulfill({ status: 201, contentType: 'application/json',
            body: JSON.stringify([Object.assign({ id: 'asg-new-1' }, req.body || {})]) });
          return true;
        }
        return false;
      }
    }, async function(page, recorded){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await page.waitForSelector('#assign-launch-btn', { state: 'attached', timeout: 8000 });
      await tap(page, '#assign-launch-btn');
      await page.waitForSelector('#assign-kind-workout', { timeout: 8000 });
      await tap(page, '#assign-kind-workout');
      await page.waitForSelector('#wiz-create-custom', { timeout: 8000 });
      await tap(page, '#wiz-create-custom');
      await page.waitForSelector('#cwb-root', { timeout: 8000 });

      // type + name
      await tap(page, '#new-a-focus-chips .aw-chip');
      await page.fill('#new-a-name', 'Emom + Repeaters');

      // add EMOM, Hangboard, Mental, Rest, Custom
      const add = async function(shape){ await tap(page, '#cwb-root [data-act="add"][data-shape="' + shape + '"]'); };
      await add('emom');
      await add('rep_pass_fail');
      await add('mental');
      await add('rest');
      await add('section');
      const kinds = async function(){
        return page.$$eval('#cwb-root .cwb-kick', function(ns){ return ns.map(function(n){ return n.textContent.replace(/\s+/g, ' ').trim(); }); });
      };
      assert.deepStrictEqual(await kinds(), [
        'Block 1 · Climbing (EMOM)', 'Block 2 · Hangboard / repeaters', 'Block 3 · Mental', 'Block 4 · Rest', 'Block 5 · Custom'
      ]);

      // EMOM: title, 2 boulders, same round again, rest, then remove a round with confirmation
      const emom = page.locator('#cwb-root .cwb-card').nth(0);
      await emom.locator('[data-f="title"]').fill('EMOM 7 boulders x 2');
      await emom.locator('[data-f="boulder"][data-ri="0"][data-bi="0"]').fill('v4 orange');
      await emom.locator('[data-f="boulder"][data-ri="0"][data-bi="1"]').fill('v5 black');
      assert.strictEqual(await emom.locator('[data-f="roundRest"][data-ri="0"]').inputValue(), '3', 'default 180s shows as 3');
      assert.strictEqual(await emom.locator('[data-f="roundRestU"][data-ri="0"]').inputValue(), 'min');
      await emom.locator('[data-f="roundRestU"][data-ri="0"]').selectOption('sec');
      assert.strictEqual(await emom.locator('[data-f="roundRest"][data-ri="0"]').inputValue(), '180', 'unit switch converts');
      await emom.locator('[data-f="roundRest"][data-ri="0"]').fill('600');
      await emom.locator('[data-act="same-round"][data-ri="0"]').click();
      assert.strictEqual(await emom.locator('.cwb-round').count(), 2, 'same round again adds round 2');
      assert.strictEqual(await emom.locator('[data-f="boulder"][data-ri="1"][data-bi="0"]').inputValue(), 'v4 orange', 'copy keeps boulders');
      assert.strictEqual(await emom.locator('[data-f="roundRest"][data-ri="1"]').inputValue(), '10', 'copy keeps rest (600s shows as 10 min)');
      assert.strictEqual(await emom.locator('[data-f="roundRestU"][data-ri="1"]').inputValue(), 'min');
      await emom.locator('[data-f="roundRest"][data-ri="1"]').fill('2 min 30');
      await emom.locator('[data-f="roundRest"][data-ri="1"]').fill('1:30');
      await emom.locator('[data-act="new-round"]').click();
      assert.strictEqual(await emom.locator('.cwb-round').count(), 3);
      await emom.locator('[data-act="del-round"][data-ri="2"]').click();
      assert.strictEqual(await emom.locator('.cwb-round').count(), 3, 'first click only arms');
      assert.ok(/Confirm/.test(await emom.locator('[data-act="del-round"][data-ri="2"]').textContent()));
      await emom.locator('[data-act="del-round"][data-ri="2"]').click();
      assert.strictEqual(await emom.locator('.cwb-round').count(), 2, 'second click removes');

      // Hangboard: grip, load, +1 set, +1 rep
      const hb = page.locator('#cwb-root .cwb-card').nth(1);
      await hb.locator('[data-f="title"]').fill('Repeaters');
      await hb.locator('[data-f="grip"]').fill('half crimp');
      await hb.locator('[data-f="assistance"]').fill('+35 lb');
      await hb.locator('[data-act="set-plus"]').click();
      await hb.locator('[data-act="rep-plus"]').click();

      // Mental notes, rest minutes
      await page.locator('#cwb-root .cwb-card').nth(2).locator('[data-f="notes"]').fill('Box breathing 4 min');
      await page.locator('#cwb-root .cwb-card').nth(3).locator('[data-f="restMin"]').fill('10');

      // reorder: move Mental up above Hangboard; collapse hangboard keeps summary
      await page.locator('#cwb-root .cwb-card').nth(2).locator('[data-act="up"]').click();
      assert.deepStrictEqual(await kinds(), [
        'Block 1 · Climbing (EMOM)', 'Block 2 · Mental', 'Block 3 · Hangboard / repeaters', 'Block 4 · Rest', 'Block 5 · Custom'
      ]);
      await page.locator('#cwb-root .cwb-card').nth(2).locator('[data-act="toggle"]').click();
      const sum = await page.locator('#cwb-root .cwb-card').nth(2).locator('.cwb-sum').textContent();
      assert.ok(/Repeaters/.test(sum) && /half crimp/.test(sum) && /2 sets/.test(sum), 'collapsed summary: ' + sum);
      await page.locator('#cwb-root .cwb-card').nth(2).locator('[data-act="toggle"]').click();

      // remove the empty Custom block (needs confirm)
      const custom = page.locator('#cwb-root .cwb-card').nth(4);
      await custom.locator('[data-act="remove"]').click();
      assert.strictEqual(await page.locator('#cwb-root .cwb-card').count(), 5, 'armed only');
      await custom.locator('[data-act="remove"]').click();
      assert.strictEqual(await page.locator('#cwb-root .cwb-card').count(), 4);

      // continue through the wizard and submit
      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      await tap(page, '#new-a-submit');
      await page.waitForTimeout(800);

      const cw = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
      assert.ok(cw, 'custom_workouts POST made');
      assert.strictEqual(cw.name, 'Emom + Repeaters');
      assert.strictEqual(cw.created_by_role, 'coach');
      assert.ok(Array.isArray(cw.sections) && cw.sections.length === 4, 'four blocks saved');
      assert.deepStrictEqual(cw.sections.map(function(b){ return b.shape; }), ['emom', 'section', 'rep_pass_fail', 'rest']);
      const e = cw.sections[0];
      assert.strictEqual(e.title, 'EMOM 7 boulders x 2');
      assert.strictEqual(e.rounds.length, 2);
      assert.deepStrictEqual(e.rounds[0].boulders.map(function(b){ return b.text; }).slice(0, 2), ['v4 orange', 'v5 black']);
      assert.strictEqual(e.rounds[0].rest_after_sec, 600);
      assert.strictEqual(e.rounds[1].rest_after_sec, 90, 'm:ss typed in round 2 saved as 90 sec');
      assert.ok(e.rounds.every(function(r){ return r.boulders.every(function(b){ return b.id && b.complete === false; }); }), 'boulders have ids, not complete');
      assert.strictEqual(cw.sections[1].title, 'Mental');
      assert.strictEqual(cw.sections[1].notes, 'Box breathing 4 min');
      const h = cw.sections[2];
      assert.strictEqual(h.grip, 'half crimp');
      assert.strictEqual(h.assistance, '+35 lb');
      assert.strictEqual(h.sets.length, 2);
      assert.strictEqual(h.sets[0].reps.length, 6);
      assert.ok(h.sets.every(function(s){ return s.reps.every(function(r){ return r.ok === null; }); }), 'reps unticked');
      assert.strictEqual(cw.sections[3].duration_sec, 600);
      const asg = firstBody(postsTo(recorded, 'assignments', 'POST'));
      assert.ok(asg, 'assignment POST made');
      assert.strictEqual(asg.custom_workout_item_id, 'cw-new-1');
      assert.strictEqual(asg.athlete_id, ATHLETE_ID);
    });
  } finally {
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().then(function(){
  console.log('real-flow-coach-workout-builder: ok');
}).catch(function(err){
  console.error(err);
  process.exit(1);
});
