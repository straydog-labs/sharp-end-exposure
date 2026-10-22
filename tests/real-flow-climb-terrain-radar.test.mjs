import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, waitForScreen,
  sessionRow, USER_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const SHOT_DIR = '/opt/cursor/artifacts/screenshots';

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index318'/.test(index));
assert.ok(/APP_VERSION = 'index318'/.test(sw));
assert.ok(/id="attempts-terrain-card"/.test(index));
assert.ok(/function buildAttemptsByTerrain/.test(index));
assert.ok(/js\/coach-athlete-insights\.js/.test(index));

function daysAgo(n){
  return new Date(Date.now() - n * 86400000).toISOString();
}

function climb(id, terrain, extra){
  return sessionRow(Object.assign({
    id: id,
    user_id: USER_ID,
    climbing_type: terrain,
    baseline_zone: 'sent',
    zone: 'learning',
    is_baseline: false,
    is_checkin: false,
    deleted_at: null,
    created_at: daysAgo(1)
  }, extra || {}));
}

function nOf(n, terrain, prefix, extra){
  var out = [];
  var i;
  for(i = 0; i < n; i++){
    out.push(climb(prefix + '-' + i, terrain, extra));
  }
  return out;
}

const paritySessions = nOf(8, 'Slab', 'slab')
  .concat(nOf(4, 'Vertical', 'vert'), nOf(2, 'Overhang', 'over'), nOf(1, 'Roof', 'roof'));
const zeroSessions = nOf(5, 'Slab', 'zero-slab');
const untaggedSessions = nOf(5, '', 'noterrain', { climbing_type: '' });

async function waitHome(page){
  await page.waitForFunction(function(){
    var home = document.getElementById('screen-home');
    return !!(home && home.classList.contains('active') && typeof window.startLogFlow === 'function');
  }, null, { timeout: 30000 });
  await page.evaluate(function(){
    if(typeof getDeviceId === 'function'){
      localStorage.setItem('see_milestone_5_' + getDeviceId(), '1');
    }
  });
}

async function openPatterns(page){
  await tap(page, '#fnav-sessions');
  await waitForScreen(page, 'screen-sessions');
  await page.waitForFunction(function(){
    var sec = document.getElementById('patterns-section');
    return !!(sec && sec.style.display === 'block');
  }, null, { timeout: 15000 });
  await page.evaluate(function(){
    var sec = document.getElementById('patterns-section');
    if(sec) sec.scrollIntoView({ block: 'start' });
  });
  var open = await page.evaluate(function(){
    var body = document.getElementById('patterns-body');
    return body && body.style.display !== 'none';
  });
  if(!open) await tap(page, '#patterns-toggle');
  await page.waitForFunction(function(){
    var body = document.getElementById('patterns-body');
    var card = document.getElementById('attempts-terrain-card');
    return !!(body && body.style.display !== 'none' && card && card.style.display !== 'none');
  }, null, { timeout: 8000 });
}

async function shot(page, name){
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  await page.evaluate(function(){ return document.fonts ? document.fonts.ready : null; });
  await page.waitForTimeout(160);
  var card = page.locator('#attempts-terrain-card');
  try{ await card.scrollIntoViewIfNeeded({ timeout: 4000 }); }catch(e){}
  await page.screenshot({ path: join(SHOT_DIR, name) });
}

async function radarInfo(page){
  return page.evaluate(function(){
    var wrap = document.getElementById('attempts-terrain-wrap');
    var svg = wrap && wrap.querySelector('svg.attempts-terrain-radar');
    var empty = document.getElementById('attempts-terrain-empty');
    var note = wrap && wrap.querySelector('.terrain-volume-untagged');
    var svgBox = svg ? svg.getBoundingClientRect() : null;
    return {
      mode: wrap ? wrap.getAttribute('data-terrain-volume') : null,
      empty: empty ? empty.textContent.trim() : null,
      note: note ? note.textContent.trim() : null,
      untagged: note ? note.getAttribute('data-untagged') : null,
      labels: svg ? Array.prototype.map.call(svg.querySelectorAll('.radar-axis-label'), function(t){
        var box = t.getBoundingClientRect();
        return {
          text: t.textContent,
          fontPx: parseFloat(window.getComputedStyle(t).fontSize) || 0,
          x: box.x, y: box.y, r: box.right, b: box.bottom
        };
      }) : [],
      verts: svg ? Array.prototype.map.call(svg.querySelectorAll('.radar-vertex'), function(c){
        return { terrain: c.getAttribute('data-terrain'), count: parseInt(c.getAttribute('data-count'), 10) };
      }) : [],
      rings: svg ? Array.prototype.map.call(svg.querySelectorAll('.radar-ring-label'), function(t){ return t.textContent; }) : [],
      title: (document.querySelector('#attempts-terrain-card .insight-label') || {}).textContent || '',
      svgBox: svgBox ? { x: svgBox.x, y: svgBox.y, r: svgBox.right, b: svgBox.bottom } : null
    };
  });
}

function assertFontAndClip(info, tag){
  assert.ok(info.labels.length === 7, tag + ': 7 labels');
  info.labels.forEach(function(l){
    assert.ok(l.fontPx >= 11, tag + ' font ' + l.text + '=' + l.fontPx);
    assert.ok(l.x >= info.svgBox.x - 0.5, tag + ' clip left ' + l.text);
    assert.ok(l.r <= info.svgBox.r + 0.5, tag + ' clip right ' + l.text);
    assert.ok(l.y >= info.svgBox.y - 0.5, tag + ' clip top ' + l.text);
    assert.ok(l.b <= info.svgBox.b + 0.5, tag + ' clip bottom ' + l.text);
  });
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  var results = {};
  var auth = {
    session: { access_token: 'test-token', user: { id: USER_ID } }
  };
  var sizes = [{ width: 390, height: 667 }, { width: 390, height: 844 }];
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  try{
    var si;
    for(si = 0; si < sizes.length; si++){
      await withPage(browser, port, Object.assign({
        sessions: paritySessions,
        viewport: sizes[si]
      }, auth), async function(page){
        await waitHome(page);
        await openPatterns(page);
        var info = await radarInfo(page);
        var tag = sizes[si].width + 'x' + sizes[si].height;
        assert.strictEqual(info.title.trim().toLowerCase(), 'attempts by terrain');
        assert.strictEqual(info.mode, 'radar');
        var texts = info.labels.map(function(l){ return l.text; });
        assert.ok(texts.indexOf('Slab 8') !== -1);
        assert.ok(texts.indexOf('Vertical 4') !== -1);
        assert.ok(texts.indexOf('Overhang 2') !== -1);
        assert.ok(texts.indexOf('Roof 1') !== -1);
        var by = {};
        info.verts.forEach(function(v){ by[v.terrain] = v.count; });
        assert.strictEqual(by.Slab, 8);
        assert.strictEqual(by.Vertical, 4);
        assert.strictEqual(by.Overhang, 2);
        assert.strictEqual(by.Roof, 1);
        assert.ok(!by['Arête'] && !by.Dihedral && !by.Crack);
        assertFontAndClip(info, 'data ' + tag);
        results['real-flow-data-' + tag] = 'PASS';
        if(sizes[si].height === 844) await shot(page, 'climb-radar-data-390.png');
      });
    }

    await withPage(browser, port, Object.assign({
      sessions: zeroSessions,
      viewport: { width: 390, height: 844 }
    }, auth), async function(page){
      await waitHome(page);
      await openPatterns(page);
      var info = await radarInfo(page);
      assert.strictEqual(info.mode, 'radar');
      assert.strictEqual(info.verts.length, 1);
      assert.strictEqual(info.verts[0].terrain, 'Slab');
      var texts = info.labels.map(function(l){ return l.text; });
      assert.ok(texts.indexOf('Vertical 0') !== -1);
      assert.ok(texts.indexOf('Arête 0') !== -1);
      assertFontAndClip(info, 'zeros');
      results['real-flow-zeros'] = 'PASS';
      await shot(page, 'climb-radar-zeros-390.png');
    });

    await withPage(browser, port, Object.assign({
      sessions: [],
      viewport: { width: 390, height: 844 }
    }, auth), async function(page){
      await waitHome(page);
      await tap(page, '#fnav-sessions');
      await waitForScreen(page, 'screen-sessions');
      await page.waitForFunction(function(){
        var count = document.getElementById('sess-total-count');
        return !!(count && /0 climbs/.test(count.textContent || ''));
      }, null, { timeout: 15000 });
      await page.evaluate(function(){
        var dash = document.getElementById('dash-new-user');
        var real = document.getElementById('sessions-real-section');
        var sec = document.getElementById('patterns-section');
        var body = document.getElementById('patterns-body');
        var card = document.getElementById('attempts-terrain-card');
        if(dash) dash.style.display = 'none';
        if(real) real.style.display = 'block';
        if(sec) sec.style.display = 'block';
        if(body) body.style.display = 'block';
        if(card) card.style.display = 'block';
        buildAttemptsByTerrain([]);
      });
      await page.evaluate(function(){
        var yourData = document.getElementById('your-data-section');
        if(yourData){
          Array.prototype.forEach.call(yourData.children, function(ch){
            if(ch.id !== 'patterns-section') ch.style.display = 'none';
          });
        }
        var toggle = document.getElementById('patterns-toggle');
        if(toggle) toggle.style.display = 'none';
        var empty = document.getElementById('attempts-terrain-empty');
        if(empty) empty.scrollIntoView({ block: 'center' });
      });
      var emptyBox = await page.evaluate(function(){
        var empty = document.getElementById('attempts-terrain-empty');
        var r = empty ? empty.getBoundingClientRect() : { width: 0, height: 0, top: -1 };
        var body = document.getElementById('patterns-body');
        return {
          text: empty ? empty.textContent.trim() : '',
          w: r.width, h: r.height, top: r.top,
          bodyDisplay: body ? body.style.display : null
        };
      });
      assert.ok(/No logged attempts/.test(emptyBox.text));
      assert.ok(emptyBox.h > 0 && emptyBox.w > 0, 'empty message must have a layout box');
      assert.ok(emptyBox.top >= 0 && emptyBox.top < 844, 'empty message must be in the 390x844 viewport');
      var info = await radarInfo(page);
      assert.strictEqual(info.mode, 'empty');
      assert.ok(/No logged attempts/.test(info.empty || ''));
      assert.strictEqual(info.note, null);
      assert.strictEqual(info.verts.length, 0);
      results['real-flow-empty'] = 'PASS';
      await page.evaluate(function(){ return document.fonts ? document.fonts.ready : null; });
      await page.waitForTimeout(160);
      await page.screenshot({ path: join(SHOT_DIR, 'climb-radar-empty-390.png') });
    });

    await withPage(browser, port, Object.assign({
      sessions: untaggedSessions,
      viewport: { width: 390, height: 844 }
    }, auth), async function(page){
      await waitHome(page);
      await openPatterns(page);
      var info = await radarInfo(page);
      assert.strictEqual(info.mode, 'empty');
      assert.strictEqual(info.empty, null, 'untagged-only must not be empty-message-only');
      assert.strictEqual(info.untagged, '5');
      assert.ok(/5 logged rows have no terrain/.test(info.note || ''));
      results['real-flow-untagged'] = 'PASS';
      await shot(page, 'climb-radar-untagged-390.png');
      copyFileSync(
        join(SHOT_DIR, 'climb-radar-untagged-390.png'),
        join(SHOT_DIR, 'climb-radar-rows-without-terrain-390.png')
      );
    });

    console.log('real-flow-climb-terrain-radar: ok');
    console.log(JSON.stringify(results));
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
