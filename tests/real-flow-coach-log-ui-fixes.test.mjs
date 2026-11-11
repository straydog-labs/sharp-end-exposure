import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, postsTo, firstBody,
  COACH_ID, ATHLETE_ID
} from './harness.mjs';

const ASSIGNMENTS = [{
  id: 'asg-1',
  title: 'Open power',
  athlete_id: ATHLETE_ID,
  coach_id: COACH_ID,
  custom_workout_item_id: 'cw-1',
  library_item_id: null,
  completed_at: null,
  created_at: '2026-11-01T12:00:00.000Z',
  deleted_at: null
}];

function coachSession(){
  return { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } };
}

function trainStub(){
  return async function(route, info){
    if(info.method === 'GET' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'cw-1',
          name: 'Open power',
          sections: [
            { id: 'b1', shape: 'section', title: 'Custom', notes: '', complete: false },
            { id: 'b2', shape: 'rest', title: 'Rest', duration_sec: 600, complete: false }
          ]
        }])
      });
      return true;
    }
    return false;
  };
}

async function openAthlete(page){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  await tap(page, '.roster-row');
  await page.waitForSelector('#coach-train-log-launch', { timeout: 8000 });
}

async function openTrain(page){
  await tap(page, '#coach-train-log-launch');
  await page.waitForSelector('#coach-train-log-overlay.open', { timeout: 8000 });
}

async function kicks(page, root){
  return page.$$eval(root + ' .cwb-kick', function(ns){
    return ns.map(function(n){ return n.textContent.replace(/\s+/g, ' ').trim(); });
  });
}

async function dragGrip(page, root, fromIdx, toIdx, pointerType){
  await page.locator(root + ' .cwb-card').nth(fromIdx).scrollIntoViewIfNeeded();
  await page.locator(root + ' .cwb-card').nth(toIdx).scrollIntoViewIfNeeded();
  const moved = await page.evaluate(async function(args){
    var rootEl = document.querySelector(args.root);
    var grip = rootEl.querySelectorAll('.cwb-grip')[args.from];
    var card = rootEl.querySelectorAll('.cwb-card')[args.to];
    var gr = grip.getBoundingClientRect();
    var cr = card.getBoundingClientRect();
    function ev(type, x, y){
      var target = type === 'pointerdown' ? grip : document;
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: args.pointerType,
        clientX: x,
        clientY: y,
        buttons: type === 'pointerup' ? 0 : 1
      }));
    }
    ev('pointerdown', gr.left + gr.width / 2, gr.top + gr.height / 2);
    ev('pointermove', cr.left + cr.width / 2, cr.top + 8);
    var marked = !!rootEl.querySelector('.cwb-card.cwb-drop-before, .cwb-card.cwb-drop-after');
    ev('pointerup', cr.left + cr.width / 2, cr.top + 8);
    return marked;
  }, { root: root, from: fromIdx, to: toIdx, pointerType: pointerType });
  assert.ok(moved, pointerType + ' drag shows a drop indicator');
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    async function assertSaveColumn(width, height){
      await withPage(browser, port, {
        path: '/coach-dashboard.html',
        viewport: { width: width, height: height },
        session: coachSession(),
        assignments: ASSIGNMENTS,
        stub: trainStub()
      }, async function(page, recorded){
        await openAthlete(page);
        await openTrain(page);
        assert.strictEqual(await page.locator('#ctl-assign-wrap').isHidden(), true, 'checkbox hidden on Blank at ' + width);
        assert.strictEqual(await page.locator('#ctl-mark-all').isHidden(), true, 'Mark all complete hidden with 0 blocks at ' + width);
        const place = await page.evaluate(function(){
          var col = document.getElementById('ctl-body').getBoundingClientRect();
          var save = document.getElementById('ctl-save').getBoundingClientRect();
          var foot = document.querySelector('#coach-train-log-overlay .clog-footer').getBoundingClientRect();
          return {
            col: { left: col.left, right: col.right, width: col.width },
            save: { left: save.left, right: save.right, width: save.width, top: save.top },
            foot: { left: foot.left, right: foot.right, width: foot.width }
          };
        });
        assert.ok(place.save.left >= place.col.left - 1 && place.save.right <= place.col.right + 1,
          'Save sits inside the content column at ' + width + ' ' + JSON.stringify(place));
        assert.ok(Math.abs(place.foot.left - place.col.left) <= 2 && Math.abs(place.foot.width - place.col.width) <= 2,
          'footer matches the column at ' + width + ' ' + JSON.stringify(place));
        await tap(page, '#ctl-starts [data-start="full"]');
        await page.waitForSelector('#ctl-cwb-root .cwb-menu');
        await page.evaluate(function(){
          var overlay = document.getElementById('coach-train-log-overlay');
          var menu = document.querySelector('#ctl-cwb-root .cwb-menu');
          if(menu && menu.scrollIntoView) menu.scrollIntoView({ block: 'end' });
          overlay.scrollTop = overlay.scrollHeight;
        });
        const clear = await page.evaluate(function(){
          var menu = document.querySelector('#ctl-cwb-root .cwb-menu').getBoundingClientRect();
          var save = document.getElementById('ctl-save').getBoundingClientRect();
          var viewH = window.innerHeight;
          return {
            menuTop: menu.top, menuBottom: menu.bottom,
            saveTop: save.top, saveBottom: save.bottom,
            viewH: viewH
          };
        });
        assert.ok(clear.menuBottom <= clear.saveTop + 1,
          'add-block row is not covered by Save at ' + width + ' ' + JSON.stringify(clear));
        assert.ok(clear.menuTop >= -1 && clear.menuBottom <= clear.viewH + 1,
          'add-block row stays on screen above Save at ' + width + ' ' + JSON.stringify(clear));
        await tap(page, '#ctl-save');
        await page.waitForFunction(function(){
          var toast = document.getElementById('coach-toast');
          return !!(toast && /Training session logged\./.test(toast.textContent || ''));
        }, null, { timeout: 8000 });
        const patches = recorded.filter(function(r){
          return r.method === 'PATCH' && r.url.indexOf('/rest/v1/assignments') !== -1;
        });
        assert.strictEqual(patches.length, 0, 'hidden checkbox does not PATCH assignments at ' + width);
      });
    }

    await assertSaveColumn(1280, 900);
    await assertSaveColumn(390, 844);

    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: coachSession(),
      assignments: ASSIGNMENTS,
      stub: trainStub()
    }, async function(page, recorded){
      await openAthlete(page);
      await openTrain(page);
      await page.waitForFunction(function(){
        var sel = document.getElementById('ctl-assignment');
        return sel && Array.prototype.some.call(sel.options, function(o){ return o.value === 'asg-1'; });
      });
      await page.selectOption('#ctl-assignment', 'asg-1');
      await page.waitForSelector('#ctl-assign-wrap', { state: 'visible', timeout: 8000 });
      assert.strictEqual(await page.locator('#ctl-assign-complete').isChecked(), true, 'assignment checkbox defaults on');
      assert.strictEqual(await page.locator('#ctl-mark-all').isHidden(), false, 'Mark all complete shows once blocks exist');
      await tap(page, '#ctl-starts [data-start="blank"]');
      assert.strictEqual(await page.locator('#ctl-assign-wrap').isHidden(), true, 'checkbox hides again when the assignment is cleared');
      assert.strictEqual(await page.locator('#ctl-mark-all').isHidden(), true, 'Mark all complete hides when the blocks are cleared');

      assert.strictEqual(await page.locator('#ctl-cwb-root [data-act="jump-add"]').count(), 0, 'top Add block stays hidden under 3 blocks');
      await tap(page, '#ctl-cwb-root [data-act="add"][data-shape="section"]');
      await tap(page, '#ctl-cwb-root [data-act="add"][data-shape="rest"]');
      await tap(page, '#ctl-cwb-root [data-act="add"][data-shape="mental"]');
      await tap(page, '#ctl-cwb-root [data-act="jump-add"]');
      await page.waitForFunction(function(){
        var a = document.activeElement;
        return !!(a && a.closest && a.closest('#ctl-cwb-root .cwb-menu'));
      });
      assert.strictEqual(await page.locator('#ctl-cwb-root [data-act="collapse-all"]').count(), 1, 'Collapse all appears at 2+ blocks');
      await page.locator('#ctl-cwb-root .cwb-card').nth(0).locator('[data-f="title"]').fill('Alpha');
      await page.locator('#ctl-cwb-root .cwb-card').nth(2).locator('[data-f="title"]').fill('Mental');
      assert.strictEqual(await page.locator('#ctl-cwb-root .cwb-body').count(), 3);
      await tap(page, '#ctl-cwb-root [data-act="collapse-all"]');
      assert.strictEqual(await page.locator('#ctl-cwb-root .cwb-body').count(), 0, 'Collapse all closes every block');
      await tap(page, '#ctl-cwb-root [data-act="expand-all"]');
      assert.strictEqual(await page.locator('#ctl-cwb-root .cwb-body').count(), 3, 'Expand all opens every block');
      await page.locator('#ctl-cwb-root .cwb-card').nth(2).locator('[data-act="up"]').click();
      assert.deepStrictEqual(await kicks(page, '#ctl-cwb-root'), [
        'Block 1 · Custom', 'Block 2 · Mental', 'Block 3 · Rest'
      ], 'arrows still reorder and renumber');
      await dragGrip(page, '#ctl-cwb-root', 2, 0, 'touch');
      assert.deepStrictEqual(await kicks(page, '#ctl-cwb-root'), [
        'Block 1 · Rest', 'Block 2 · Custom', 'Block 3 · Mental'
      ], 'touch drag reorders and renumbers');
      await tap(page, '#ctl-save');
      await page.waitForFunction(function(){
        var toast = document.getElementById('coach-toast');
        return !!(toast && /Training session logged\./.test(toast.textContent || ''));
      });
      const body = firstBody(postsTo(recorded, 'training_sessions', 'POST'));
      assert.deepStrictEqual(body.blocks.map(function(b){ return b.title; }), ['Rest', 'Alpha', 'Mental']);
      const patches = recorded.filter(function(r){
        return r.method === 'PATCH' && r.url.indexOf('/rest/v1/assignments') !== -1;
      });
      assert.strictEqual(patches.length, 0, 'cleared assignment does not PATCH');
    });

    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1600 },
      session: coachSession(),
      stub: async function(route, info){
        if(info.method === 'POST' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
          await route.fulfill({
            status: 201, contentType: 'application/json',
            body: JSON.stringify([Object.assign({ id: 'cw-new-1' }, info.body || {})])
          });
          return true;
        }
        if(info.method === 'POST' && info.url.indexOf('/rest/v1/assignments') !== -1){
          await route.fulfill({
            status: 201, contentType: 'application/json',
            body: JSON.stringify([Object.assign({ id: 'asg-new-1' }, info.body || {})])
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
      await page.waitForSelector('#wiz-create-custom', { timeout: 8000 });
      await tap(page, '#wiz-create-custom');
      await page.waitForSelector('#cwb-root', { timeout: 8000 });
      assert.strictEqual(await page.locator('#cwb-root [data-act="collapse-all"]').count(), 0, 'Collapse all hidden under 2 blocks');
      await page.fill('#new-a-name', 'Reorder me');
      await tap(page, '#cwb-root [data-act="add"][data-shape="rest"]');
      await tap(page, '#cwb-root [data-act="add"][data-shape="mental"]');
      assert.strictEqual(await page.locator('#cwb-root [data-act="jump-add"]').count(), 0, 'top Add block stays hidden at 2 blocks');
      assert.strictEqual(await page.locator('#cwb-root .cwb-body').count(), 2);
      await tap(page, '#cwb-root [data-act="collapse-all"]');
      assert.strictEqual(await page.locator('#cwb-root .cwb-body').count(), 0, 'wizard Collapse all closes every block');
      await tap(page, '#cwb-root [data-act="expand-all"]');
      assert.strictEqual(await page.locator('#cwb-root .cwb-body').count(), 2, 'wizard Expand all opens every block');
      await tap(page, '#cwb-root [data-act="add"][data-shape="section"]');
      await tap(page, '#cwb-root [data-act="jump-add"]');
      await page.waitForFunction(function(){
        var a = document.activeElement;
        return !!(a && a.closest && a.closest('#cwb-root .cwb-menu'));
      });
      await page.locator('#cwb-root .cwb-card').nth(2).locator('[data-f="title"]').fill('Custom A');
      assert.deepStrictEqual(await kicks(page, '#cwb-root'), [
        'Block 1 · Rest', 'Block 2 · Psyche', 'Block 3 · Custom'
      ]);
      await page.locator('#cwb-root .cwb-card').nth(2).locator('[data-act="up"]').click();
      assert.deepStrictEqual(await kicks(page, '#cwb-root'), [
        'Block 1 · Rest', 'Block 2 · Custom', 'Block 3 · Psyche'
      ], 'wizard arrows reorder');
      await dragGrip(page, '#cwb-root', 1, 0, 'mouse');
      assert.deepStrictEqual(await kicks(page, '#cwb-root'), [
        'Block 1 · Custom', 'Block 2 · Rest', 'Block 3 · Psyche'
      ], 'wizard drag reorders');
      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
      await tap(page, '#wiz-next');
      await page.waitForSelector('#new-a-submit', { timeout: 8000 });
      await tap(page, '#new-a-submit');
      await page.waitForTimeout(400);
      const cw = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
      assert.ok(cw, 'custom_workouts POST made');
      assert.deepStrictEqual(cw.sections.map(function(b){ return b.title; }), ['Custom A', 'Rest', 'Psyche']);
    });

    console.log('real-flow-coach-log-ui-fixes: ok');
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
