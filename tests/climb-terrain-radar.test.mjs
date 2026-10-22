import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage
} from './harness.mjs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const insightsSrc = readFileSync(join(root, 'js/coach-athlete-insights.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index318'/.test(index));
assert.ok(/APP_VERSION = 'index318'/.test(sw));
assert.ok(/script src="js\/coach-athlete-insights\.js"/.test(index));
assert.ok(/id="attempts-terrain-card"/.test(index));
assert.ok(/id="attempts-terrain-wrap"/.test(index));
assert.ok(/Attempts by terrain/.test(index));
assert.ok(/function buildAttemptsByTerrain/.test(index));
assert.ok(/function attemptsRadarLayout/.test(index));
assert.ok(/radar-axis-label\{[^}]*font-size:11px/.test(index.replace(/\s+/g, '')));
assert.ok(/No logged attempts/.test(index));
assert.ok(/function computeTerrainVolume/.test(insightsSrc));
assert.ok(/function computeTerrainRadar/.test(insightsSrc));
assert.ok(!/Math\.max\(0\.06/.test(insightsSrc), 'radar has no radius floor');
assert.ok(/count>0\?'var\(--text\)'/.test(index) || /count>0\?['"]var\(--text\)['"]/.test(index));
assert.ok(!/#e84444/.test(index.slice(index.indexOf('function buildFallsByTerrain'), index.indexOf('function toggleCollapsibleSection'))));
var homeChunk = index.substring(index.indexOf('async function loadHomeScreen'), index.indexOf('async function loadClimbLog'));
assert.ok(!/coach-athlete-insights/.test(homeChunk), 'Home must not load coach insights');
assert.ok(!/buildAttemptsByTerrain/.test(homeChunk), 'Home tap path unchanged');

require(join(root, 'js/coach-athlete-insights.js'));
const CI = globalThis.CoachInsights;
assert.deepStrictEqual(CI.TERRAIN_TYPES, ['Slab', 'Vertical', 'Overhang', 'Roof', 'Arête', 'Dihedral', 'Crack']);

function row(extra){
  return Object.assign({
    created_at: '2026-10-10T12:00:00Z',
    is_checkin: false,
    is_baseline: false,
    deleted_at: null,
    zone: 'learning'
  }, extra || {});
}

function nOf(n, terrain, extra){
  var out = [];
  var i;
  for(i = 0; i < n; i++){
    out.push(row(Object.assign({
      id: 'p-' + terrain + '-' + i,
      climbing_type: terrain,
      baseline_zone: 'sent'
    }, extra || {})));
  }
  return out;
}

const countRule = [
  row({ climbing_type: 'Slab', baseline_zone: 'sent' }),
  row({ climbing_type: 'Vertical', baseline_zone: 'dna' }),
  row({ climbing_type: 'Overhang', is_baseline: true, baseline_zone: 'sent' }),
  row({ climbing_type: 'Roof', baseline_zone: 'fall_practice' }),
  row({ climbing_type: 'Arête', baseline_zone: null }),
  row({ climbing_type: 'Dihedral', deleted_at: '2026-10-10T13:00:00Z', baseline_zone: 'sent' }),
  row({ climbing_type: 'Crack', is_checkin: true, baseline_zone: 'checkin' }),
  row({ climbing_type: '', baseline_zone: 'took' }),
  row({ climbing_type: 'Slab', baseline_zone: 'fell' }),
  row({
    climbing_type: 'Vertical',
    baseline_zone: 'took',
    attempts: [
      row({ climbing_type: 'Vertical', baseline_zone: 'fell', id: 'nested-1' }),
      row({ climbing_type: 'Vertical', baseline_zone: 'sent', id: 'nested-2' })
    ]
  })
];
const volRule = CI.computeTerrainVolume(countRule, { days: null });
assert.strictEqual(volRule.counts.Slab, 2, 'sent+fell Slab');
assert.strictEqual(volRule.counts.Vertical, 4, 'dna + took + two nested');
assert.strictEqual(volRule.counts.Overhang, 0, 'baseline not counted');
assert.strictEqual(volRule.counts.Roof, 1, 'fall_practice counted');
assert.strictEqual(volRule.counts['Arête'], 1, 'null result counted');
assert.strictEqual(volRule.counts.Dihedral, 0, 'deleted not counted');
assert.strictEqual(volRule.counts.Crack, 0, 'check-in not counted');
assert.strictEqual(volRule.untagged, 1, 'unknown-terrain note N');
assert.strictEqual(CI.computeTerrainVolume(countRule.filter(function(r){ return r.climbing_type; }), { days: null }).untagged, 0);

const parity = nOf(8, 'Slab').concat(nOf(4, 'Vertical'), nOf(2, 'Overhang'), nOf(1, 'Roof'));
const volParity = CI.computeTerrainVolume(parity, { days: null });
assert.strictEqual(volParity.counts.Slab, 8);
assert.strictEqual(volParity.counts.Vertical, 4);
assert.strictEqual(volParity.counts.Overhang, 2);
assert.strictEqual(volParity.counts.Roof, 1);
assert.strictEqual(volParity.counts['Arête'], 0);
assert.strictEqual(volParity.counts.Dihedral, 0);
assert.strictEqual(volParity.counts.Crack, 0);

const radar = CI.computeTerrainRadar({
  Slab: 8, Vertical: 4, Overhang: 2, Roof: 1, 'Arête': 0, Dihedral: 0, Crack: 0
}, { cx: 0, cy: 0, maxR: 100 });
assert.deepStrictEqual(radar.axes.map(function(a){ return a.terrain; }), CI.TERRAIN_TYPES);
var slab = radar.axes.find(function(a){ return a.terrain === 'Slab'; });
var vert = radar.axes.find(function(a){ return a.terrain === 'Vertical'; });
var over = radar.axes.find(function(a){ return a.terrain === 'Overhang'; });
var arete = radar.axes.find(function(a){ return a.terrain === 'Arête'; });
assert.ok(Math.abs(slab.r - 100) < 1e-9, 'max count sits on the outer ring');
assert.ok(Math.abs(vert.r - 50) < 1e-9, 'linear midpoint');
assert.strictEqual(arete.r, 0, '0 count sits at the center');
assert.strictEqual(arete.x, 0);
assert.strictEqual(arete.y, 0);
[1, 2, 3, 7, 28].forEach(function(maxVal){
  var counts = { Slab: maxVal, Vertical: 0, Overhang: 0, Roof: 0, 'Arête': 0, Dihedral: 0, Crack: 0 };
  var r = CI.computeTerrainRadar(counts);
  assert.ok(r.rings.every(function(ring){ return Number.isInteger(ring.value); }), 'ring values integer at max=' + maxVal);
  assert.ok(r.rings.every(function(ring){ return /^\d+$/.test(ring.valueLabel); }), 'ring labels integer at max=' + maxVal);
  assert.ok(r.scale >= 4);
});

async function revealRadarHost(page){
  await page.evaluate(function(){
    if(typeof showScreen === 'function') showScreen('screen-sessions');
    var sec = document.getElementById('patterns-section');
    var body = document.getElementById('patterns-body');
    var card = document.getElementById('attempts-terrain-card');
    if(sec) sec.style.display = 'block';
    if(body) body.style.display = 'block';
    if(card) card.style.display = 'block';
  });
  await page.waitForTimeout(40);
}

async function paint(page, sessions){
  await revealRadarHost(page);
  return page.evaluate(function(rows){
    return buildAttemptsByTerrain(rows);
  }, sessions);
}

function assertLabelsFitSvg(dump, tag){
  assert.ok(dump.labels.length === 7, tag + ': expected 7 axis labels');
  dump.labels.forEach(function(l){
    assert.ok(l.fontPx >= 11, tag + ' font ' + l.text + ' = ' + l.fontPx);
    assert.ok(l.x >= dump.svgBox.x - 0.5, tag + ' left ' + l.text + ' ' + l.x + ' < svg ' + dump.svgBox.x);
    assert.ok(l.r <= dump.svgBox.r + 0.5, tag + ' right ' + l.text + ' ' + l.r + ' > svg ' + dump.svgBox.r);
    assert.ok(l.y >= dump.svgBox.y - 0.5, tag + ' top ' + l.text + ' ' + l.y + ' < svg ' + dump.svgBox.y);
    assert.ok(l.b <= dump.svgBox.b + 0.5, tag + ' bottom ' + l.text + ' ' + l.b + ' > svg ' + dump.svgBox.b);
  });
}

function countsFromDump(dump){
  var out = { Slab: 0, Vertical: 0, Overhang: 0, Roof: 0, 'Arête': 0, Dihedral: 0, Crack: 0 };
  dump.verts.forEach(function(v){ out[v.terrain] = v.count; });
  dump.labels.forEach(function(l){
    var m = /^(.*) (\d+)$/.exec(l.text);
    if(m && Object.prototype.hasOwnProperty.call(out, m[1]) && !dump.verts.some(function(v){ return v.terrain === m[1]; })){
      out[m[1]] = parseInt(m[2], 10);
    }
  });
  return out;
}

async function dumpRadar(page){
  return page.evaluate(function(){
    var wrap = document.getElementById('attempts-terrain-wrap');
    var svg = wrap ? wrap.querySelector('svg.attempts-terrain-radar') : null;
    var empty = document.getElementById('attempts-terrain-empty');
    var note = wrap ? wrap.querySelector('.terrain-volume-untagged') : null;
    var svgBox = svg ? svg.getBoundingClientRect() : null;
    var verts = svg ? Array.prototype.map.call(svg.querySelectorAll('.radar-vertex'), function(c){
      return {
        terrain: c.getAttribute('data-terrain'),
        count: parseInt(c.getAttribute('data-count'), 10),
        r: parseFloat(c.getAttribute('data-r')),
        cssR: c.getAttribute('data-css-r')
      };
    }) : [];
    var labels = svg ? Array.prototype.map.call(svg.querySelectorAll('.radar-axis-label'), function(t){
      var box = t.getBoundingClientRect();
      var fs = parseFloat(window.getComputedStyle(t).fontSize) || 0;
      return { text: t.textContent, x: box.x, y: box.y, r: box.right, b: box.bottom, fontPx: fs };
    }) : [];
    var rings = svg ? Array.prototype.map.call(svg.querySelectorAll('.radar-ring-label'), function(t){
      return t.textContent;
    }) : [];
    var wrapBox = wrap ? wrap.getBoundingClientRect() : null;
    return {
      mode: wrap ? wrap.getAttribute('data-terrain-volume') : null,
      empty: empty ? empty.textContent.trim() : null,
      note: note ? note.textContent.trim() : null,
      untagged: note ? note.getAttribute('data-untagged') : null,
      verts: verts,
      labels: labels,
      rings: rings,
      wrapW: wrapBox ? wrapBox.width : 0,
      svgBox: svgBox ? { x: svgBox.x, y: svgBox.y, r: svgBox.right, b: svgBox.bottom, w: svgBox.width } : null
    };
  });
}

async function runSize(browser, port, size, results){
  var tag = size.width + 'x' + size.height;
  await withPage(browser, port, { viewport: size }, async function(page){
    await page.waitForFunction(function(){
      return typeof window.buildAttemptsByTerrain === 'function' && window.CoachInsights && typeof window.CoachInsights.computeTerrainRadar === 'function';
    }, null, { timeout: 30000 });

    await paint(page, parity);
    var data = await dumpRadar(page);
    assert.strictEqual(data.mode, 'radar');
    assert.strictEqual(data.empty, null);
    assert.strictEqual(data.note, null);
    var by = {};
    data.verts.forEach(function(v){ by[v.terrain] = v; });
    assert.strictEqual(by.Slab.count, 8);
    assert.strictEqual(by.Vertical.count, 4);
    assert.strictEqual(by.Overhang.count, 2);
    assert.strictEqual(by.Roof.count, 1);
    assert.ok(!by['Arête'] && !by.Dihedral && !by.Crack, 'zero axes render no marker');
    var labelTexts = data.labels.map(function(l){ return l.text; });
    assert.ok(labelTexts.indexOf('Slab 8') !== -1);
    assert.ok(labelTexts.indexOf('Vertical 4') !== -1);
    assert.ok(labelTexts.indexOf('Arête 0') !== -1);
    var maxR = by.Slab.r;
    assert.ok(Math.abs(by.Vertical.r - maxR / 2) < 1e-6, 'DOM linear midpoint');
    assert.ok(Math.abs(by.Overhang.r - maxR / 4) < 1e-6, 'DOM linear quarter');
    data.rings.forEach(function(lab){
      assert.ok(/^\d+$/.test(lab), 'ring label not integer: ' + lab);
    });
    assertLabelsFitSvg(data, 'parity ' + tag);
    var nodeVol = CI.computeTerrainVolume(parity, { days: null });
    assert.deepStrictEqual(countsFromDump(data), nodeVol.counts, 'parity vs computeTerrainVolume ' + tag);
    results['parity-' + tag] = 'PASS';
    results['font-clip-' + tag] = 'PASS';

    if(tag !== '390x844') return;

    await paint(page, nOf(5, 'Slab'));
    var zeros = await dumpRadar(page);
    var zBy = {};
    zeros.verts.forEach(function(v){ zBy[v.terrain] = v; });
    assert.ok(zBy.Slab && zBy.Slab.count === 5);
    assert.ok(!zBy.Vertical && !zBy.Overhang && !zBy.Roof && !zBy['Arête']);
    assert.ok(zeros.labels.some(function(l){ return l.text === 'Vertical 0'; }));
    assertLabelsFitSvg(zeros, 'zeros ' + tag);
    results['zeros-dom'] = 'PASS';

    await paint(page, []);
    var empty = await dumpRadar(page);
    assert.strictEqual(empty.mode, 'empty');
    assert.ok(empty.empty && /No logged attempts/.test(empty.empty));
    assert.ok(!empty.verts.length);
    assert.strictEqual(empty.note, null);
    results['empty-zero-rows'] = 'PASS';

    var untaggedOnly = nOf(5, '').concat([row({ climbing_type: '', terrain: '' })]).slice(0, 5);
    untaggedOnly.forEach(function(r){ r.climbing_type = ''; delete r.terrain; });
    await paint(page, untaggedOnly);
    var none = await dumpRadar(page);
    assert.strictEqual(none.mode, 'empty');
    assert.strictEqual(none.empty, null, 'untagged-only must not be empty-message-only');
    assert.strictEqual(none.untagged, '5');
    assert.ok(/5 logged rows have no terrain/.test(none.note));
    var nodeUntagged = CI.computeTerrainVolume(untaggedOnly, { days: null });
    assert.strictEqual(nodeUntagged.untagged, 5);
    assert.strictEqual(nodeUntagged.total, 0);
    results['empty-untagged'] = 'PASS';

    await paint(page, countRule);
    var rule = await dumpRadar(page);
    var rBy = {};
    rule.verts.forEach(function(v){ rBy[v.terrain] = v; });
    assert.strictEqual(rBy.Slab.count, 2);
    assert.strictEqual(rBy.Vertical.count, 4);
    assert.strictEqual(rBy.Roof.count, 1);
    assert.strictEqual(rBy['Arête'].count, 1);
    assert.ok(!rBy.Overhang && !rBy.Dihedral && !rBy.Crack);
    assert.strictEqual(rule.untagged, '1');
    assert.ok(/1 logged rows have no terrain/.test(rule.note));
    assert.deepStrictEqual(countsFromDump(rule), CI.computeTerrainVolume(countRule, { days: null }).counts);
    results['count-rule-dom'] = 'PASS';
    results['parity-computeTerrainVolume'] = 'PASS';

    await paint(page, countRule.filter(function(r){ return r.climbing_type; }));
    var hid = await dumpRadar(page);
    assert.strictEqual(hid.untagged, null);
    assert.strictEqual(hid.note, null);
    results['untagged-hidden'] = 'PASS';

    var i;
    var ringMaxes = [1, 2, 3, 7, 28];
    for(i = 0; i < ringMaxes.length; i++){
      await paint(page, nOf(ringMaxes[i], 'Slab'));
      var dump = await dumpRadar(page);
      dump.rings.forEach(function(lab){
        assert.ok(/^\d+$/.test(lab), 'ring not integer at max=' + ringMaxes[i] + ' lab=' + lab);
      });
    }
    results['ring-labels'] = 'PASS';
  });
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  var results = {};
  try{
    await runSize(browser, port, { width: 390, height: 667 }, results);
    await runSize(browser, port, { width: 390, height: 844 }, results);
    console.log('climb-terrain-radar tests: ok');
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
