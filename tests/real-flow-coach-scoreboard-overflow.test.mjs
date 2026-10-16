import assert from 'assert';
import { mkdirSync } from 'fs';
import { join } from 'path';
import {
  startStaticServer, launchChromium, withPage, tap,
  COACH_ID, ATHLETE_ID, sessionRow
} from './harness.mjs';

const SHOT_DIR = '/opt/cursor/artifacts/screenshots';

function jessSessions(){
  const now = Date.now();
  const sessions = [];
  let id = 1;
  function add(n, daysAgo, type, zone, extra){
    extra = extra || {};
    for(let i = 0; i < n; i++){
      sessions.push(sessionRow({
        id: 'jess-' + (id++),
        user_id: ATHLETE_ID,
        created_at: new Date(now - daysAgo * 86400000 - i * 3600000).toISOString(),
        climbing_type: type,
        zone: zone,
        baseline_zone: extra.fp ? 'fall_practice' : 'sent',
        grade_value: extra.grade || 'V4',
        is_baseline: false,
        is_checkin: false,
        deleted_at: null
      }));
    }
  }
  // Jess-shaped: Vertical 29, Overhang 8, Roof 5, Dihedral 3. Panic 0% on Vertical.
  add(18, 6, 'Vertical', 'comfort');
  add(2, 8, 'Vertical', 'learning');
  add(1, 5, 'Vertical', 'comfort', { fp: true });
  add(8, 40, 'Vertical', 'comfort');
  add(7, 10, 'Overhang', 'comfort');
  add(1, 10, 'Overhang', 'learning');
  add(5, 12, 'Roof', 'comfort');
  add(3, 14, 'Dihedral', 'comfort');
  return sessions;
}

function collectScoreboard(width){
  var table = document.getElementById('athlete-terrain-scoreboard');
  if(!table) return { missing: true, width: width };
  var t = table.getBoundingClientRect();
  var overflows = [];
  var nodes = table.querySelectorAll('.scoreboard-cell, .scoreboard-cell *, .terrain-scoreboard-head > div');
  Array.prototype.forEach.call(nodes, function(el){
    var r = el.getBoundingClientRect();
    if(r.width === 0 && r.height === 0) return;
    if(r.left < t.left - 1 || r.right > t.right + 1 || r.top < t.top - 1 || r.bottom > t.bottom + 1){
      overflows.push({
        text: String(el.textContent || '').trim().slice(0, 80),
        cls: String(el.className || ''),
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        tleft: Math.round(t.left),
        tright: Math.round(t.right)
      });
    }
  });
  var head = table.querySelector('.terrain-scoreboard-head');
  var headText = head ? head.textContent : '';
  var row = table.querySelector('.terrain-scoreboard-row');
  var rowStyle = row ? getComputedStyle(row) : null;
  var trends = Array.prototype.map.call(table.querySelectorAll('.scoreboard-trend'), function(el){
    return el.textContent.trim();
  });
  var panicParts = Array.prototype.map.call(table.querySelectorAll('.scoreboard-zone-part'), function(el){
    var rects = el.getClientRects();
    return { text: el.textContent.trim(), lines: rects.length };
  }).filter(function(p){ return /^Panic /.test(p.text); });
  return {
    missing: false,
    width: width,
    overflows: overflows,
    headText: headText,
    headHidden: !!(head && getComputedStyle(head).display === 'none'),
    stacked: !!(rowStyle && rowStyle.flexDirection === 'column'),
    trends: trends,
    panicParts: panicParts,
    labels: Array.prototype.map.call(table.querySelectorAll('.scoreboard-cell[data-label]'), function(el){
      return el.getAttribute('data-label');
    }),
    tableW: Math.round(t.width)
  };
}

async function run(){
  mkdirSync(SHOT_DIR, { recursive: true });
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 900 },
      session: {
        access_token: 'test-token',
        user: { id: COACH_ID, email: 'coach@test.local' }
      },
      sessions: jessSessions()
    }, async function(page){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await page.waitForSelector('#athlete-terrain-scoreboard[data-scoreboard="table"]', { timeout: 15000 });

      async function revealScoreboard(){
        await page.evaluate(function(){
          var table = document.getElementById('athlete-terrain-scoreboard');
          if(table && table.scrollIntoView) table.scrollIntoView({ block: 'start', inline: 'nearest' });
        });
        await page.waitForTimeout(80);
      }

      async function checkWidth(width){
        await page.setViewportSize({ width: width, height: 1100 });
        await revealScoreboard();
        const info = await page.evaluate(collectScoreboard, width);
        assert.ok(!info.missing, 'scoreboard present at ' + width);
        assert.strictEqual(info.overflows.length, 0,
          'overflow at ' + width + ': ' + JSON.stringify(info.overflows));
        if(width === 390){
          assert.ok(info.stacked, '390 keeps stacked scoreboard rows');
          assert.ok(info.headHidden, '390 hides the desktop header row');
          assert.ok(info.labels.some(function(l){
            return /attempts vs prior 4 wks/i.test(l || '');
          }), '390 stacked labels include attempts vs prior 4 wks');
        } else {
          assert.ok(!info.stacked, width + ' uses the grid scoreboard');
          assert.ok(/attempts vs prior 4 wks/i.test(info.headText),
            width + ' header names attempts vs prior 4 wks');
        }
        info.trends.forEach(function(text){
          assert.ok(/^[↑↓→]\s+[+\-]?\d+$/.test(text),
            'trend cell is arrow+number only, got ' + JSON.stringify(text));
          assert.ok(!/attempt|prior|wks/i.test(text), 'cells do not repeat the unit');
        });
        assert.ok(info.panicParts.length, 'zone-mix Panic part present at ' + width);
        info.panicParts.forEach(function(p){
          assert.ok(/^Panic \d+%$/.test(p.text), 'Panic part text: ' + p.text);
          assert.strictEqual(p.lines, 1, 'Panic 0% stays on one line at ' + width + ': ' + p.text);
        });
        return info;
      }

      async function shot(name){
        await page.evaluate(function(){
          var bar = document.querySelector('.detail-stack-bar');
          if(bar) bar.setAttribute('data-shot-hide', bar.style.visibility || '');
          if(bar) bar.style.visibility = 'hidden';
        });
        await page.locator('#athlete-terrain-scoreboard').screenshot({
          path: join(SHOT_DIR, name)
        });
        await page.evaluate(function(){
          var bar = document.querySelector('.detail-stack-bar');
          if(!bar) return;
          bar.style.visibility = bar.getAttribute('data-shot-hide') || '';
          bar.removeAttribute('data-shot-hide');
        });
      }

      await checkWidth(1280);
      await shot('scoreboard-overflow-1280.png');
      await checkWidth(1024);
      await shot('scoreboard-overflow-1024.png');
      await checkWidth(390);
      await shot('scoreboard-overflow-390.png');
    });
    console.log('real-flow-coach-scoreboard-overflow: ok');
  }finally{
    await browser.close();
    server.close();
  }
}

run().catch(function(err){
  console.error(err);
  process.exit(1);
});
