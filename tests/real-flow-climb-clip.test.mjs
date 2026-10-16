import assert from 'assert';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import {
  startStaticServer, launchChromium, withPage, tap, readyDial, waitForScreen,
  postsTo, firstBody, sessionRow, USER_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index313'/.test(index));
assert.ok(/APP_VERSION = 'index313'/.test(sw));
assert.ok(/quick-project-row/.test(index));
assert.ok(/climb-hist-row/.test(index));
assert.ok(/function attemptCountLabel/.test(index));
assert.ok(/container-type:\s*inline-size/.test(index));

const SHOT_DIR = '/opt/cursor/artifacts/screenshots';
const LONG = 'The Supercalifragilistic Extreme Arete Project Name That Must Wrap Then Ellipsis';
const P_ORANGE = 'climb-orange-tower';
const P_ANKLES = 'climb-ankles-away';
const P_LONG = 'climb-long-arete';
const P_SLAB = 'climb-quiet-slab';
const P_ROOF = 'climb-roof-line';

function daysAgo(n){
  return new Date(Date.now() - n * 86400000).toISOString();
}
function project(id, name, grade, terrain){
  return {
    id: id, name: name, grade_value: grade, climbing_type: terrain,
    is_project: true, setting: 'indoor', deleted_at: null
  };
}

async function waitHomeReady(page){
  await page.waitForFunction(function(){
    var home = document.getElementById('screen-home');
    return !!(home && home.classList.contains('active') && window._homeDataReady === true && window._homeLoadsFinished === true);
  }, null, { timeout: 30000 });
}

async function openClimb(page){
  await tap(page, '#fnav-sessions');
  await waitForScreen(page, 'screen-sessions');
  await page.waitForFunction(function(){
    var strip = document.getElementById('quick-strip');
    var list = document.getElementById('sessions-climb-list');
    return !!(strip && strip.children.length && list && (list.querySelector('.climb-hist-row') || list.querySelector('.quick-project-row') || (list.textContent || '').length > 8));
  }, null, { timeout: 15000 });
}

async function clipSnapshot(page){
  return page.evaluate(function(){
    function box(el){
      if(!el) return null;
      return {
        sw: el.scrollWidth,
        cw: el.clientWidth,
        sh: el.scrollHeight,
        ch: el.clientHeight,
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height
      };
    }
    var strip = document.getElementById('quick-strip');
    var wrap = document.getElementById('quick-strip-wrap');
    var list = document.getElementById('sessions-climb-list');
    var rows = Array.prototype.map.call((strip && strip.querySelectorAll('.quick-project-row')) || [], function(row){
      var star = row.querySelector('.project-toggle');
      var att = row.querySelector('.quick-attempt-btn');
      var name = row.querySelector('.qp-name');
      var starBox = star ? star.getBoundingClientRect() : { width: 0, height: 0 };
      var attBox = att ? att.getBoundingClientRect() : { width: 0, height: 0 };
      return {
        text: (row.textContent || '').replace(/\s+/g, ' ').trim(),
        sw: row.scrollWidth,
        cw: row.clientWidth,
        h: row.getBoundingClientRect().height,
        starW: starBox.width,
        starH: starBox.height,
        attW: Math.round(attBox.width),
        attH: Math.round(attBox.height),
        attText: att ? (att.textContent || '').trim() : '',
        attCls: att ? (att.className || '') : '',
        attMissing: !att,
        name: name ? (name.textContent || '').trim() : '',
        starAria: star ? (star.getAttribute('aria-label') || '') : '',
        starBg: star ? getComputedStyle(star).backgroundColor : '',
        starBorder: star ? getComputedStyle(star).borderStyle + ' ' + getComputedStyle(star).borderWidth : ''
      };
    });
    var hist = Array.prototype.map.call((list && list.querySelectorAll('.climb-hist-row')) || [], function(row){
      return {
        text: (row.textContent || '').replace(/\s+/g, ' ').trim(),
        sw: row.scrollWidth,
        cw: row.clientWidth,
        h: row.getBoundingClientRect().height
      };
    });
    var falls = Array.prototype.map.call(document.querySelectorAll('#falls-terrain-wrap span:last-child'), function(el){
      var cs = getComputedStyle(el);
      return { text: (el.textContent || '').trim(), color: cs.color, weight: cs.fontWeight };
    });
    return {
      strip: box(strip),
      wrap: box(wrap),
      list: box(list),
      rows: rows,
      hist: hist,
      histText: list ? (list.textContent || '').replace(/\s+/g, ' ').trim() : '',
      falls: falls
    };
  });
}

function assertNoOverflow(snap, width){
  function fit(box, name){
    if(!box) return;
    assert.ok(box.sw <= box.cw + 1, width + 'px ' + name + ' overflow sw=' + box.sw + ' cw=' + box.cw);
  }
  fit(snap.strip, 'projects strip');
  fit(snap.wrap, 'projects wrap');
  fit(snap.list, 'history list');
  snap.rows.forEach(function(r, i){
    assert.ok(r.sw <= r.cw + 1, width + 'px project row ' + i + ' overflow sw=' + r.sw + ' cw=' + r.cw + ' ' + r.text);
    assert.ok(r.h >= 52, width + 'px project row min-height ' + r.h);
    assert.ok(r.starW >= 40 && r.starH >= 40, width + 'px star hit ' + r.starW + 'x' + r.starH);
    assert.ok(r.attW >= 44 && r.attH >= 44, width + 'px + Attempt hit ' + r.attW + 'x' + r.attH + ' cls=' + r.attCls + ' text=' + r.attText + ' missing=' + r.attMissing);
    assert.ok(r.starBg === 'rgba(0, 0, 0, 0)' || r.starBg === 'transparent', 'bare star bg ' + r.starBg);
    assert.ok(/none/.test(r.starBorder) || /0px/.test(r.starBorder), 'bare star border ' + r.starBorder);
  });
  snap.hist.forEach(function(r, i){
    assert.ok(r.sw <= r.cw + 1, width + 'px history row ' + i + ' overflow sw=' + r.sw + ' cw=' + r.cw + ' ' + r.text);
  });
}

async function shot(page, name, width){
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  var dest = join(SHOT_DIR, name);
  var tmpDir = '/tmp/climb-shots';
  if(!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  var tmp = join(tmpDir, name);
  await page.setViewportSize({ width: width, height: 1100 });
  await page.waitForTimeout(80);
  var lastErr = null;
  var i;
  for(i = 0; i < 3; i++){
    try{
      await page.screenshot({ path: tmp, fullPage: true });
      copyFileSync(tmp, dest);
      lastErr = null;
      break;
    }catch(e){
      lastErr = e;
      await page.waitForTimeout(120);
    }
  }
  if(lastErr) throw lastErr;
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  var failed = [];
  async function flow(name, fn){
    try{
      await fn();
      console.log('ok - ' + name);
    }catch(e){
      failed.push(name + ': ' + (e && e.message ? e.message : e));
      console.error('not ok - ' + name + ' ' + (e && e.stack ? e.stack : e));
    }
  }

  try{
    await flow('projects-and-history-fit-long-names', async function(){
      await withPage(browser, port, {
        session: { user: { id: USER_ID }, access_token: 'test-token' },
        climbs: [
          project(P_ORANGE, 'orange tower center', '5.13a', 'Overhang'),
          project(P_ANKLES, 'Ankles away', '5.12b', 'Overhang'),
          project(P_LONG, LONG, '5.11d', 'Arête'),
          project(P_SLAB, 'Quiet slab', '5.10a', 'Slab'),
          project(P_ROOF, 'Roof line', '5.12a', 'Roof')
        ],
        sessions: [
          sessionRow({ id: 's-ot', climb_id: P_ORANGE, route_name: 'orange tower center', grade_value: '5.13a', climbing_type: 'Overhang', zone: 'panic', baseline_zone: 'fell', created_at: daysAgo(0) }),
          sessionRow({ id: 's-ak1', climb_id: P_ANKLES, route_name: 'Ankles away', grade_value: '5.12b', climbing_type: 'Overhang', zone: 'learning', baseline_zone: 'fell', created_at: daysAgo(1) }),
          sessionRow({ id: 's-ak2', climb_id: P_ANKLES, route_name: 'Ankles away', grade_value: '5.12b', climbing_type: 'Overhang', zone: 'learning', baseline_zone: 'sent', created_at: daysAgo(1.1) }),
          sessionRow({ id: 's-ln', climb_id: P_LONG, route_name: LONG, grade_value: '5.11d', climbing_type: 'Arête', zone: 'comfort', baseline_zone: 'sent', created_at: daysAgo(2) }),
          sessionRow({ id: 's-sl', climb_id: P_SLAB, route_name: 'Quiet slab', grade_value: '5.10a', climbing_type: 'Slab', zone: 'comfort', baseline_zone: 'sent', created_at: daysAgo(3) }),
          sessionRow({ id: 's-rf', climb_id: P_ROOF, route_name: 'Roof line', grade_value: '5.12a', climbing_type: 'Roof', zone: 'learning', baseline_zone: 'fell', created_at: daysAgo(4) })
        ]
      }, async function(page, recorded){
        await waitHomeReady(page);
        await openClimb(page);
        var widths = [360, 390, 600, 840, 1280];
        var w, snap;
        for(w = 0; w < widths.length; w++){
          await page.setViewportSize({ width: widths[w], height: 1100 });
          await page.waitForTimeout(80);
          snap = await clipSnapshot(page);
          assert.ok(snap.rows.length >= 3, widths[w] + 'px expected 3 project rows, got ' + snap.rows.length);
          assert.ok(snap.rows.some(function(r){ return /orange tower center/i.test(r.text); }), 'orange tower center visible at ' + widths[w]);
          assert.ok(snap.rows.some(function(r){ return /Ankles away/i.test(r.text); }), 'Ankles away visible at ' + widths[w]);
          assertNoOverflow(snap, widths[w]);
          assert.ok(/1 attempt/.test(snap.histText), 'plural 1 attempt: ' + snap.histText);
          assert.ok(/2 attempts/.test(snap.histText), 'plural 2 attempts: ' + snap.histText);
          assert.ok(!/1 attempts/.test(snap.histText), 'no 1 attempts');
          if(widths[w] === 360 || widths[w] === 390 || widths[w] === 840){
            await shot(page, 'climb_projects_hist_' + widths[w] + '.png', widths[w]);
          }
        }
        await tap(page, '#patterns-toggle');
        await page.waitForTimeout(80);
        snap = await clipSnapshot(page);
        var nonzero = snap.falls.filter(function(f){ return /^[1-9]/.test(f.text); });
        var zero = snap.falls.filter(function(f){ return /^0 /.test(f.text); });
        assert.ok(nonzero.length >= 1, 'nonzero fall counts present ' + JSON.stringify(snap.falls));
        nonzero.forEach(function(f){
          assert.ok(!/#e84444/i.test(f.color), 'nonzero fall not hex red ' + f.color);
          var m = f.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          assert.ok(m, 'parsed color ' + f.color);
          var r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
          assert.ok(!(r > 200 && g < 90 && b < 90), 'nonzero fall not panic red ' + f.color);
          assert.ok(!(r > 220 && g > 140 && g < 190 && b < 60), 'nonzero fall not learning amber ' + f.color);
        });
        zero.forEach(function(f){
          var m = f.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          assert.ok(m, 'zero color ' + f.color);
          var r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
          var max = Math.max(r, g, b);
          assert.ok(max < 230, 'zero fall stays muted ' + f.color);
        });
        await page.setViewportSize({ width: 390, height: 1100 });
        await shot(page, 'climb_falls_by_terrain_390.png', 390);

        var starCid = await page.evaluate(function(){
          var btn = document.querySelector('#quick-strip .project-toggle');
          return btn ? (btn.getAttribute('data-cid') || '') : '';
        });
        assert.ok(starCid, 'project star missing data-cid');
        await page.locator('#quick-strip .project-toggle').first().click({ force: true });
        await page.waitForFunction(function(cid){
          var btn = document.querySelector('#quick-strip .project-toggle[data-cid="'+cid+'"]');
          if(!btn) return true;
          return btn.getAttribute('aria-pressed') === 'false';
        }, starCid, { timeout: 4000 });

        await page.locator('#quick-strip').getByRole('button', { name: '+ Attempt' }).first().click({ force: true });
        await waitForScreen(page, 'screen-log-act');
        await page.waitForTimeout(100);
        await readyDial(page);
        await tap(page, '#log-act-continue');
        await waitForScreen(page, 'screen-log-result');
        await tap(page, '#btn-sent');
        await tap(page, '#log-result-continue');
        await page.waitForTimeout(700);
        var posts = postsTo(recorded, 'sessions', 'POST');
        assert.ok(posts.length, '+ Attempt from projects row did not POST');
        var body = firstBody(posts);
        assert.ok(body && body.climb_id, 'posted climb_id ' + JSON.stringify(body));
      });
    });
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }

  if(failed.length){
    console.error('failed:\n' + failed.join('\n'));
    process.exit(1);
  }
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
