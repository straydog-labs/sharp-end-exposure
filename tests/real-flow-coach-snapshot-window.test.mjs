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
      id: (extra.prefix || 's') + '-' + sessions.length,
      user_id: ATHLETE_ID,
      created_at: daysAgo(daysAgoN, i * 60000),
      climbing_type: extra.terrain || 'Vertical',
      zone: zone,
      baseline_zone: extra.fp ? 'fall_practice' : 'sent',
      grade_value: extra.grade || 'V4',
      is_baseline: extra.baseline === true,
      is_checkin: extra.checkin === true,
      deleted_at: extra.deleted || null
    }));
  }
}

function jessSessions(){
  const sessions = [];
  add(sessions, 34, 8, 'comfort', { terrain: 'Vertical' });
  add(sessions, 11, 10, 'learning', { terrain: 'Overhang' });
  add(sessions, 1, 5, '', { prefix: 'nz' });
  add(sessions, 1, 4, 'learning', { prefix: 'ck', checkin: true });
  return sessions;
}

function panicSessions(){
  const sessions = jessSessions();
  add(sessions, 2, 3, 'panic', { prefix: 'pn', terrain: 'Roof' });
  return sessions;
}

async function openAthlete(page){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  await tap(page, '.roster-row');
  await page.waitForSelector('#athlete-stat-sessions', { timeout: 15000 });
  await page.waitForFunction(function(){
    var el = document.getElementById('athlete-stat-sessions');
    return el && el.textContent && el.textContent !== '—' && el.textContent !== '…';
  }, null, { timeout: 15000 });
}

async function shotBlock(page, name){
  await page.evaluate(function(){
    var bar = document.querySelector('.detail-stack-bar');
    if(bar) bar.style.visibility = 'hidden';
    ['athlete-progress-panel', 'athlete-training-volume-panel', 'athlete-psyche-volume-panel'].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.style.display = 'none';
    });
    var block = document.getElementById('athlete-share-block');
    if(block && block.scrollIntoView) block.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(80);
  var box = await page.evaluate(function(){
    var head = document.querySelector('#athlete-share-block .athlete-share-print-head');
    var snap = document.querySelector('#athlete-share-block .roster-stats');
    var zone = document.querySelector('#athlete-share-block .athlete-zone-wrap');
    var gap = document.getElementById('athlete-gap-panel');
    if(!snap || !gap) return null;
    var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    [head, snap, zone, gap].forEach(function(el){
      if(!el) return;
      var r = el.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    });
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
  await page.locator('#athlete-share-block').screenshot({ path: join(SHOT_DIR, name) });
}

function readUi(){
  var sess = document.getElementById('athlete-stat-sessions');
  var learn = document.getElementById('athlete-stat-learning');
  var panic = document.getElementById('athlete-stat-panic');
  var panicLabel = panic ? panic.parentNode.querySelector('.roster-stat-label') : null;
  var stamp = document.getElementById('athlete-share-print-date');
  var legend = document.querySelector('#athlete-zone-bar .zone-bar-legend');
  var chartNote = document.querySelector('#athlete-progress-body .form-note');
  var gapNote = document.getElementById('athlete-gap-note');
  return {
    sessions: sess ? sess.textContent.trim() : '',
    learning: learn ? learn.textContent.trim() : '',
    panic: panic ? panic.textContent.trim() : '',
    panicLabel: panicLabel ? panicLabel.textContent.trim() : '',
    stamp: stamp ? stamp.textContent : '',
    legend: legend ? legend.textContent : '',
    chartNote: chartNote ? chartNote.textContent : '',
    gapNote: gapNote ? gapNote.textContent : ''
  };
}

async function run(){
  mkdirSync(SHOT_DIR, { recursive: true });
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1400 },
      session: {
        access_token: 'test-token',
        user: { id: COACH_ID, email: 'coach@test.local' }
      },
      sessions: jessSessions()
    }, async function(page){
      await openAthlete(page);
      const ui = await page.evaluate(readUi);
      assert.strictEqual(ui.sessions, '45', 'snapshot SESSIONS equals 90-day zone-rated count');
      assert.ok(/45 logged sessions in this window/.test(ui.chartNote), ui.chartNote);
      assert.strictEqual(ui.learning, '24%');
      assert.ok(/Last 90 days/.test(ui.stamp), 'header names Last 90 days: ' + ui.stamp);
      assert.ok(/Comfort/.test(ui.legend) && /Learning/.test(ui.legend));
      assert.ok(/Panic this week/i.test(ui.panicLabel));
      assert.ok(/Zone mix by terrain, from this athlete's logged sessions. Descriptive only./.test(ui.gapNote));
      assert.ok(!/Comfort vs panic by terrain/.test(ui.gapNote));
      await shotBlock(page, 'snapshot-gap-jess-1280.png');
      await page.setViewportSize({ width: 390, height: 1400 });
      await page.waitForTimeout(80);
      await shotBlock(page, 'snapshot-gap-jess-390.png');
    });

    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1400 },
      session: {
        access_token: 'test-token',
        user: { id: COACH_ID, email: 'coach@test.local' }
      },
      sessions: panicSessions()
    }, async function(page){
      await openAthlete(page);
      const ui = await page.evaluate(readUi);
      assert.ok(/Comfort vs panic by terrain, from this athlete's logged sessions. Descriptive only./.test(ui.gapNote));
      assert.ok(!/Zone mix by terrain, from this athlete/.test(ui.gapNote));
    });

    console.log('real-flow-coach-snapshot-window: ok');
  }finally{
    await browser.close();
    server.close();
  }
}

run().catch(function(err){
  console.error(err);
  process.exit(1);
});
