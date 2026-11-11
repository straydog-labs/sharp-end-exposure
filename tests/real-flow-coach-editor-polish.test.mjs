import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap,
  COACH_ID
} from './harness.mjs';

function coachSession(){
  return { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } };
}

function saveStub(){
  return async function(route, req){
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
  };
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
  await page.fill('#new-a-name', 'Polish');
}

const serverP = await startStaticServer();
const { server, port } = serverP;
const browser = await launchChromium();
try {
  await withPage(browser, port, {
    path: '/coach-dashboard.html',
    viewport: { width: 1280, height: 900 },
    session: coachSession(),
    stub: saveStub()
  }, async function(page){
    await openBuilder(page);
    await tap(page, '#cwb-root [data-act="add"][data-shape="warmup"]');
    await tap(page, '#cwb-root [data-act="add"][data-shape="emom"]');
    await tap(page, '#cwb-root [data-act="add"][data-shape="rep_pass_fail"]');
    await tap(page, '#cwb-root [data-act="add"][data-shape="mental"]');
    const headers = await page.evaluate(function(){
      return Array.prototype.map.call(document.querySelectorAll('#cwb-root .cwb-card'), function(card){
        var kick = card.querySelector('.cwb-kick');
        var tools = card.querySelector('.cwb-tools');
        var buttons = Array.prototype.map.call(tools.querySelectorAll('button'), function(btn){
          return btn.getBoundingClientRect().top;
        });
        return {
          label: (kick.textContent || '').trim(),
          kickLeft: kick.getBoundingClientRect().left,
          toolsLeft: tools.getBoundingClientRect().left,
          toolsTop: tools.getBoundingClientRect().top,
          kickTop: kick.getBoundingClientRect().top,
          buttonTops: buttons
        };
      });
    });
    assert.ok(headers.length >= 3);
    headers.forEach(function(h, i){
      if(i) assert.ok(Math.abs(h.kickLeft - headers[0].kickLeft) < 1, 'labels share a left edge');
      assert.ok(Math.abs(h.toolsLeft - headers[0].toolsLeft) < 1, 'controls share a left edge');
      assert.ok(h.toolsTop > h.kickTop, 'controls sit on their own row');
      var top = h.buttonTops[0];
      h.buttonTops.forEach(function(t){
        assert.ok(Math.abs(t - top) < 2, 'header controls stay on one row');
      });
    });
    var labelLens = headers.map(function(h){ return h.label.length; });
    assert.ok(Math.max.apply(null, labelLens) - Math.min.apply(null, labelLens) >= 8, 'headers cover a long and a short label');

    const hb = page.locator('#cwb-root .cwb-card').nth(2);
    await hb.locator('[data-act="preset"][data-preset="repeaters_2_grips"]').click();
    const gripFit = await hb.locator('[data-f="rowGrip"]').evaluateAll(function(els){
      return els.map(function(el){
        return { value: el.value, clipped: el.scrollWidth > el.clientWidth + 1, width: el.getBoundingClientRect().width };
      });
    });
    const drag = gripFit.find(function(g){ return g.value === '3-finger drag'; });
    assert.ok(drag, '3-finger drag grip is present');
    assert.strictEqual(drag.clipped, false, '3-finger drag is not clipped');
    assert.ok(drag.width >= 150, 'grip field is wide enough');

    async function onOffBoxes(){
      return hb.locator('.cwb-onoff > label').evaluateAll(function(els){
        var card = els[0] && els[0].closest('.cwb-card').getBoundingClientRect();
        return {
          cardRight: card ? card.right : 0,
          boxes: els.map(function(el){
            var r = el.getBoundingClientRect();
            return { top: r.top, right: r.right };
          })
        };
      });
    }
    var wide = await onOffBoxes();
    assert.strictEqual(wide.boxes.length, 4);
    var wideTops = wide.boxes.map(function(b){ return Math.round(b.top); });
    var wideSame = wideTops.filter(function(t){ return t === wideTops[0]; }).length;
    assert.ok(wideSame >= 3, 'on/off controls share a row at 1280');
    wide.boxes.forEach(function(b){
      assert.ok(b.right <= wide.cardRight + 1, 'on/off does not overflow at 1280');
    });

    await page.setViewportSize({ width: 390, height: 844 });
    var narrow = await onOffBoxes();
    var narrowTops = narrow.boxes.map(function(b){ return Math.round(b.top); });
    assert.ok(Math.max.apply(null, narrowTops) - Math.min.apply(null, narrowTops) > 8, 'on/off wraps at 390');
    assert.ok(narrowTops.filter(function(t){ return t === narrowTops[0]; }).length >= 2, 'wrapped controls still sit in a row');
    narrow.boxes.forEach(function(b){
      assert.ok(b.right <= narrow.cardRight + 1, 'on/off does not overflow at 390');
    });
    await page.setViewportSize({ width: 1280, height: 900 });

    await hb.locator('[data-f="rowLoad"]').nth(0).fill('35 lb assist');
    await hb.locator('[data-f="rowLoad"]').nth(1).fill('45 lb assist');
    var roundTrip = await page.evaluate(function(){
      var blocks = window.__cwbTest.clean();
      var b = blocks.find(function(x){ return x.preset === 'repeaters_2_grips'; });
      return b.sets.map(function(s){ return s.grip + '|' + s.load; });
    });
    assert.deepStrictEqual(roundTrip, [
      'Half crimp|35 lb assist', 'Half crimp|35 lb assist', 'Half crimp|35 lb assist',
      '3-finger drag|45 lb assist', '3-finger drag|45 lb assist', '3-finger drag|45 lb assist'
    ]);

    await hb.locator('[data-act="customize-sets"]').click();
    const align = await hb.locator('.cwb-setrow').evaluateAll(function(rows){
      return rows.slice(0, 2).map(function(row){
        var grip = row.querySelector('[data-f="setGrip"]').getBoundingClientRect();
        var load = row.querySelector('[data-f="setLoad"]').getBoundingClientRect();
        var edge = row.getBoundingClientRect();
        return { left: edge.left, gripLeft: grip.left, gripWidth: grip.width, loadLeft: load.left, loadWidth: load.width };
      });
    });
    assert.ok(Math.abs(align[0].left - align[1].left) < 1, 'set rows share a left edge');
    assert.ok(Math.abs(align[0].gripLeft - align[1].gripLeft) < 1, 'grip columns align');
    assert.ok(Math.abs(align[0].gripWidth - align[1].gripWidth) < 1, 'grip widths match');
    assert.ok(Math.abs(align[0].loadLeft - align[1].loadLeft) < 1, 'load columns align');
    assert.ok(Math.abs(align[0].loadWidth - align[1].loadWidth) < 1, 'load widths match');

    const gripsBefore = await hb.locator('[data-f="setGrip"]').evaluateAll(function(els){
      return els.map(function(el){ return el.value; });
    });
    await hb.locator('[data-f="setLoad"]').nth(0).fill('99 lb');
    await hb.locator('[data-act="preset"][data-preset="max_hang"]').click();
    assert.match(await hb.locator('[data-act="preset"][data-preset="max_hang"]').innerText(), /Replace sets/);
    const gripsAfter = await hb.locator('[data-f="setGrip"]').evaluateAll(function(els){
      return els.map(function(el){ return el.value; });
    });
    assert.deepStrictEqual(gripsAfter, gripsBefore, 'first click asks and does not replace');

    await tap(page, '#wiz-next');
    await page.waitForSelector('#new-a-name-edit', { timeout: 8000 });
    await tap(page, '#wiz-next');
    await page.waitForSelector('label[for="new-a-due"]', { timeout: 8000 });
    const gap = await page.evaluate(function(){
      var summary = document.querySelector('.aw-block-summary').getBoundingClientRect();
      var label = document.querySelector('label[for="new-a-due"]').getBoundingClientRect();
      return label.top - summary.bottom;
    });
    assert.ok(gap >= 12, 'space between the block line and Due date, gap=' + gap);
  });

  await withPage(browser, port, {
    path: '/coach-dashboard.html',
    viewport: { width: 1280, height: 900 },
    session: coachSession(),
    stub: saveStub()
  }, async function(page){
    await openBuilder(page);
    await tap(page, '#cwb-root [data-act="add"][data-shape="rep_pass_fail"]');
    const hb = page.locator('#cwb-root .cwb-card').nth(0);
    await hb.locator('[data-act="preset"][data-preset="repeaters"]').click();
    await hb.locator('[data-act="add-grip"]').click();
    await hb.locator('[data-act="add-grip"]').click();
    assert.strictEqual(await hb.locator('.cwb-griprow').count(), 3);
    const saved = await page.evaluate(function(){ return window.__cwbTest.clean(); });
    await page.evaluate(function(blocks){ window.__cwbTest.reopen(blocks); }, saved);
    const rows = await page.locator('#cwb-root [data-f="rowGrip"]').evaluateAll(function(els){
      return els.map(function(el){ return el.value; });
    });
    assert.deepStrictEqual(rows, ['Half crimp', '', ''], 'empty + Grip rows survive reopen');
  });

  console.log('coach-editor-polish tests: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
