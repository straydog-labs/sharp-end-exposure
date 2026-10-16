import { readFileSync, existsSync, mkdirSync } from 'fs';
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
assert.ok(/var app_version = 'index316'/.test(index));
assert.ok(/APP_VERSION = 'index316'/.test(sw));
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
const emptySessions = nOf(5, 'Slab', 'base', { is_baseline: true, climbing_type: 'Slab' });

async function waitHome(page){
  await page.waitForFunction(function(){
    var home = document.getElementById('screen-home');
    return !!(home && home.classList.contains('active') && typeof window.startLogFlow === 'function');
  }, null, { timeout: 30000 });
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
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOT_DIR, name) });
}

async function radarInfo(page){
  return page.evaluate(function(){
    var wrap = document.getElementById('attempts-terrain-wrap');
    var svg = wrap && wrap.querySelector('svg.attempts-terrain-radar');
    var empty = document.getElementById('attempts-terrain-empty');
    return {
      mode: wrap ? wrap.getAttribute('data-terrain-volume') : null,
      empty: empty ? empty.textContent.trim() : null,
      labels: svg ? Array.prototype.map.call(svg.querySelectorAll('.radar-axis-label'), function(t){ return t.textContent; }) : [],
      verts: svg ? Array.prototype.map.call(svg.querySelectorAll('.radar-vertex'), function(c){
        return { terrain: c.getAttribute('data-terrain'), count: parseInt(c.getAttribute('data-count'), 10) };
      }) : [],
      rings: svg ? Array.prototype.map.call(svg.querySelectorAll('.radar-ring-label'), function(t){ return t.textContent; }) : [],
      title: (document.querySelector('#attempts-terrain-card .insight-label') || {}).textContent || ''
    };
  });
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  var results = {};
  var auth = {
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  };
  try{
    await withPage(browser, port, Object.assign({ sessions: paritySessions }, auth), async function(page){
      await waitHome(page);
      await openPatterns(page);
      var info = await radarInfo(page);
      assert.strictEqual(info.title.trim().toLowerCase(), 'attempts by terrain');
      assert.strictEqual(info.mode, 'radar');
      assert.ok(info.labels.indexOf('Slab 8') !== -1);
      assert.ok(info.labels.indexOf('Vertical 4') !== -1);
      assert.ok(info.labels.indexOf('Overhang 2') !== -1);
      assert.ok(info.labels.indexOf('Roof 1') !== -1);
      var by = {};
      info.verts.forEach(function(v){ by[v.terrain] = v.count; });
      assert.strictEqual(by.Slab, 8);
      assert.strictEqual(by.Vertical, 4);
      assert.strictEqual(by.Overhang, 2);
      assert.strictEqual(by.Roof, 1);
      assert.ok(!by['Arête'] && !by.Dihedral && !by.Crack);
      results['real-flow-data'] = 'PASS';
      await shot(page, 'climb-radar-data-390.png');
    });

    await withPage(browser, port, Object.assign({ sessions: zeroSessions }, auth), async function(page){
      await waitHome(page);
      await openPatterns(page);
      var info = await radarInfo(page);
      assert.strictEqual(info.mode, 'radar');
      assert.strictEqual(info.verts.length, 1);
      assert.strictEqual(info.verts[0].terrain, 'Slab');
      assert.ok(info.labels.indexOf('Vertical 0') !== -1);
      assert.ok(info.labels.indexOf('Arête 0') !== -1);
      results['real-flow-zeros'] = 'PASS';
      await shot(page, 'climb-radar-zeros-390.png');
    });

    await withPage(browser, port, Object.assign({ sessions: emptySessions }, auth), async function(page){
      await waitHome(page);
      await openPatterns(page);
      var info = await radarInfo(page);
      assert.strictEqual(info.mode, 'empty');
      assert.ok(/No terrain-tagged attempts to plot/.test(info.empty || ''));
      assert.strictEqual(info.verts.length, 0);
      results['real-flow-empty'] = 'PASS';
      await shot(page, 'climb-radar-empty-390.png');
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
