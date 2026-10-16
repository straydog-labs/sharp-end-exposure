import assert from 'assert';
import { mkdirSync } from 'fs';
import { join } from 'path';
import {
  startStaticServer, launchChromium, withPage, tap,
  COACH_ID, ATHLETE_ID, sessionRow
} from './harness.mjs';

const SHOT_DIR = '/opt/cursor/artifacts/screenshots';

function daysAgo(n, extraMs){
  return new Date(Date.now() - n * 86400000 - (extraMs || 0)).toISOString();
}

function add(sessions, n, daysAgoN, zone, extra){
  extra = extra || {};
  for(let i = 0; i < n; i++){
    sessions.push(sessionRow({
      id: (extra.prefix || 'z') + '-' + sessions.length + '-' + i,
      user_id: ATHLETE_ID,
      created_at: daysAgo(daysAgoN, i * 3600000),
      climbing_type: extra.terrain || 'Vertical',
      zone: zone,
      baseline_zone: extra.fp ? 'fall_practice' : 'sent',
      grade_value: extra.grade || 'V4',
      is_baseline: false,
      is_checkin: false,
      deleted_at: null
    }));
  }
}

function jessSessions(){
  const sessions = [];
  add(sessions, 8, 3, 'comfort');
  add(sessions, 4, 4, 'learning');
  add(sessions, 6, 10, 'comfort');
  add(sessions, 2, 11, 'learning');
  add(sessions, 5, 17, 'comfort');
  add(sessions, 4, 24, 'comfort');
  add(sessions, 3, 25, 'learning');
  add(sessions, 2, 31, 'comfort');
  add(sessions, 6, 38, 'comfort');
  add(sessions, 1, 39, 'learning');
  add(sessions, 3, 45, 'comfort');
  add(sessions, 5, 52, 'comfort');
  add(sessions, 2, 53, 'learning');
  add(sessions, 4, 66, 'comfort');
  add(sessions, 1, 67, 'learning');
  add(sessions, 2, 73, 'comfort');
  add(sessions, 3, 80, 'comfort');
  return sessions;
}

function panicSessions(){
  const sessions = jessSessions();
  add(sessions, 2, 8, 'panic', { prefix: 'p', terrain: 'Overhang' });
  add(sessions, 1, 22, 'panic', { prefix: 'p', terrain: 'Roof' });
  return sessions;
}

function collectChart(width){
  var unit = document.querySelector('#athlete-progress-body .zone-week-unit');
  var strip = document.querySelector('#athlete-progress-body .progress-week-bars');
  var table = unit;
  if(!unit) return { missing: true, width: width };
  var t = unit.getBoundingClientRect();
  var overflows = [];
  var nodes = unit.querySelectorAll('text, .insight-legend, .zone-week-caption, .zone-week-no-zone, .insight-chart-help summary');
  Array.prototype.forEach.call(nodes, function(el){
    var r = el.getBoundingClientRect();
    if(r.width === 0 && r.height === 0) return;
    if(r.left < t.left - 1 || r.right > t.right + 1 || r.top < t.top - 1 || r.bottom > t.bottom + 1){
      overflows.push({
        text: String(el.textContent || '').trim().slice(0, 80),
        left: Math.round(r.left),
        right: Math.round(r.right),
        tleft: Math.round(t.left),
        tright: Math.round(t.right)
      });
    }
  });
  var svg = unit.querySelector('svg.zone-week-svg, svg.insight-svg');
  var title = unit.querySelector('.insight-chart-help summary');
  var legend = unit.querySelector('.insight-legend');
  var caption = unit.querySelector('.zone-week-caption');
  var note = document.querySelector('#athlete-progress-panel .team-zone-note');
  var polylines = svg ? Array.prototype.map.call(svg.querySelectorAll('polyline'), function(p){
    return p.getAttribute('stroke');
  }) : [];
  var dots = svg ? svg.querySelectorAll('circle[r="5"]').length : 0;
  var nLabels = svg ? svg.querySelectorAll('.stretch-n-label').length : 0;
  return {
    missing: false,
    width: width,
    overflows: overflows,
    title: title ? title.textContent : '',
    legend: legend ? legend.textContent : '',
    caption: caption ? caption.textContent : '',
    descriptive: note ? note.textContent : '',
    strip: !!strip,
    sessionNote: (document.querySelector('#athlete-progress-body .form-note') || {}).textContent || '',
    polylines: polylines,
    dots: dots,
    nLabels: nLabels,
    noZone: (unit.querySelector('.zone-week-no-zone') || {}).textContent || '',
    hasHit: !!unit.querySelector('[data-zone-week-tip]')
  };
}

async function openChart(page){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  await tap(page, '.roster-row');
  await page.waitForSelector('#athlete-progress-body .zone-week-unit', { timeout: 15000 });
}

async function shot(page, name){
  await page.evaluate(function(){
    var bar = document.querySelector('.detail-stack-bar');
    if(bar) bar.style.visibility = 'hidden';
    var strip = document.querySelector('#athlete-progress-body .progress-week-bars');
    if(strip && strip.scrollIntoView) strip.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(80);
  var box = await page.evaluate(function(){
    var strip = document.querySelector('#athlete-progress-body .progress-week-bars');
    var unit = document.querySelector('#athlete-progress-body .zone-week-unit');
    if(!unit) return null;
    var a = (strip || unit).getBoundingClientRect();
    var b = unit.getBoundingClientRect();
    var left = Math.min(a.left, b.left);
    var top = Math.min(a.top, b.top);
    var right = Math.max(a.right, b.right);
    var bottom = Math.max(a.bottom, b.bottom);
    return {
      x: Math.max(0, Math.floor(left)),
      y: Math.max(0, Math.floor(top)),
      width: Math.ceil(right - left),
      height: Math.ceil(bottom - top)
    };
  });
  if(box && box.width > 10 && box.height > 10){
    await page.screenshot({ path: join(SHOT_DIR, name), clip: box });
    return;
  }
  await page.locator('#athlete-progress-body .zone-week-unit').screenshot({ path: join(SHOT_DIR, name) });
}

async function run(){
  mkdirSync(SHOT_DIR, { recursive: true });
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1100 },
      session: {
        access_token: 'test-token',
        user: { id: COACH_ID, email: 'coach@test.local' }
      },
      sessions: jessSessions()
    }, async function(page){
      await openChart(page);
      async function checkWidth(width){
        await page.setViewportSize({ width: width, height: 1100 });
        await page.waitForTimeout(80);
        const info = await page.evaluate(collectChart, width);
        assert.ok(!info.missing, 'chart present at ' + width);
        assert.strictEqual(info.overflows.length, 0,
          'overflow at ' + width + ': ' + JSON.stringify(info.overflows));
        assert.ok(/Sessions per week, by zone/.test(info.title));
        assert.ok(/Comfort/.test(info.legend) && /Learning/.test(info.legend) && /Panic/.test(info.legend));
        assert.ok(/Panic: none logged/.test(info.legend));
        assert.ok(!info.polylines.some(function(c){ return c === '#e84444'; }), 'no panic line when none logged');
        assert.ok(info.polylines.indexOf('#7ec87a') !== -1);
        assert.ok(info.polylines.indexOf('#f5a623') !== -1);
        assert.ok(/Last 4 weeks:/.test(info.caption) && /sessions\./.test(info.caption));
        assert.ok(!/%/.test(info.caption), 'last-4 sentence is counts, not percents');
        assert.ok(info.strip, 'weekly color strip kept');
        assert.ok(/logged sessions in this window/.test(info.sessionNote));
        assert.ok(/Descriptive/.test(info.descriptive));
        assert.ok(/cause-and-effect/.test(info.descriptive));
        assert.strictEqual(info.nLabels, 0, 'n= labels removed');
        assert.ok(info.dots >= 12, '5px markers present');
        return info;
      }
      const info1280 = await checkWidth(1280);
      await shot(page, 'zone-weeks-jess-1280.png');
      await checkWidth(1024);
      await checkWidth(390);
      await shot(page, 'zone-weeks-jess-390.png');

      assert.ok(info1280.hasHit, 'tooltip hit targets present');
      await page.locator('[data-zone-week-tip]').first().dispatchEvent('pointerdown');
      const tip = await page.evaluate(function(){
        var el = document.querySelector('.zone-week-tip');
        return el ? { hidden: el.hidden, text: el.textContent } : null;
      });
      assert.ok(tip && !tip.hidden, 'tooltip shows on tap');
      assert.ok(/Week of .+: Comfort \d+, Learning \d+, Panic \d+/.test(tip.text), tip.text);
    });

    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1100 },
      session: {
        access_token: 'test-token',
        user: { id: COACH_ID, email: 'coach@test.local' }
      },
      sessions: panicSessions()
    }, async function(page){
      await openChart(page);
      const info = await page.evaluate(collectChart, 1280);
      assert.ok(info.polylines.indexOf('#e84444') !== -1, 'panic line drawn when a week has Panic');
      assert.ok(!/none logged/.test(info.legend), 'legend is Panic, not none logged');
      await shot(page, 'zone-weeks-panic-1280.png');
    });

    console.log('real-flow-coach-zone-weeks: ok');
  }finally{
    await browser.close();
    server.close();
  }
}

run().catch(function(err){
  console.error(err);
  process.exit(1);
});
