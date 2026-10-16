import { readFileSync, existsSync } from 'fs';
import { createServer } from 'http';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import assert from 'assert';
import { launchChromium } from './pw-browser.mjs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');
const insightsSrc = readFileSync(join(root, 'js/coach-athlete-insights.js'), 'utf8');

assert.ok(/var app_version = 'index313'/.test(index));
assert.ok(/APP_VERSION = 'index313'/.test(sw));
assert.ok(/function computeTerrainVolume/.test(insightsSrc));
assert.ok(/data-terrain-volume/.test(dash));
assert.ok(/terrain-volume-unit/.test(dash));
assert.ok(/Attempts logged/.test(dash));
assert.ok(!/Climbs logged/.test(dash));
assert.ok(/Not logged yet:/.test(dash));
assert.ok(!/data-terrain-volume="radar"/.test(dash));
assert.ok(/Athlete snapshot/.test(dash));
assert.ok(/@media print/.test(dash));
assert.ok(/\.terrain-volume-unit/.test(dash) && /break-inside:\s*avoid/.test(dash));
assert.ok(!/\.insight-panel\s*\{[^}]*break-inside:\s*avoid/.test((dash.match(/@media print \{[\s\S]*?\n  \}/) || [''])[0]));

require(join(root, 'js/coach-athlete-insights.js'));
const CI = globalThis.CoachInsights;
assert.ok(typeof CI.computeTerrainVolume === 'function');
assert.deepStrictEqual(CI.TERRAIN_TYPES, ['Slab', 'Vertical', 'Overhang', 'Roof', 'Arête', 'Dihedral', 'Crack']);

const now = new Date();
function daysAgo(n, extra){
  return Object.assign({
    created_at: new Date(now.getTime() - n * 86400000).toISOString(),
    zone: 'learning',
    is_checkin: false
  }, extra);
}

const five = [
  daysAgo(2, { climbing_type: 'Slab' }),
  daysAgo(3, { climbing_type: 'Slab' }),
  daysAgo(4, { climbing_type: 'Vertical' }),
  daysAgo(5, { climbing_type: 'Overhang' }),
  daysAgo(6, { climbing_type: 'Roof' }),
  daysAgo(7, { climbing_type: 'Arête' }),
  daysAgo(8, { baseline_zone: 'fall_practice', climbing_type: 'Slab', fall_count: 3 }),
  daysAgo(120, { climbing_type: 'Crack' })
];
const vol90 = CI.computeTerrainVolume(five, { days: 90, endDate: now });
assert.strictEqual(vol90.mode, 'bars');
assert.strictEqual(vol90.unit, 'Attempts logged');
assert.strictEqual(vol90.counts.Slab, 2);
assert.strictEqual(vol90.counts.Vertical, 1);
assert.strictEqual(vol90.counts.Overhang, 1);
assert.strictEqual(vol90.counts.Roof, 1);
assert.strictEqual(vol90.counts['Arête'], 1);
assert.strictEqual(vol90.counts.Crack, 0, 'Crack is outside 90 days');
assert.strictEqual(vol90.counts.Dihedral, 0);
assert.strictEqual(vol90.total, 6);
assert.deepStrictEqual(vol90.sorted.map((row) => row.terrain), ['Slab', 'Arête', 'Overhang', 'Roof', 'Vertical']);
assert.ok(vol90.notLogged.includes('Crack') && vol90.notLogged.includes('Dihedral'));
assert.strictEqual(vol90.sorted.reduce((n, row) => n + row.count, 0), vol90.total);

const volAll = CI.computeTerrainVolume(five, { days: null, endDate: now });
assert.strictEqual(volAll.counts.Crack, 1);
assert.strictEqual(volAll.mode, 'bars');

const two = [
  daysAgo(2, { climbing_type: 'Slab' }),
  daysAgo(3, { climbing_type: 'Overhang' })
];
assert.strictEqual(CI.computeTerrainVolume(two, { days: 90, endDate: now }).mode, 'bars');
assert.strictEqual(CI.computeTerrainVolume([], { days: 90 }).mode, 'empty');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml'
};

function startStaticServer(){
  return new Promise(function(resolve){
    const server = createServer(function(req, res){
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if(urlPath === '/') urlPath = '/coach-dashboard.html';
      if(urlPath === '/sw.js'){
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        res.end('/* test stub */');
        return;
      }
      var filePath = join(root, urlPath);
      if(!filePath.startsWith(root) || !existsSync(filePath)){
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', function(){
      resolve({ server: server, port: server.address().port });
    });
  });
}

const SUPABASE_STUB = 'window.supabase={createClient:function(){return {auth:{getSession:function(){return Promise.resolve({data:{session:null},error:null});},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}};}}};}};';

function weekAt(mondayYmd, plusDays){
  const [y, m, d] = mondayYmd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + plusDays)).toISOString();
}

const gradeRows = [
  { created_at: weekAt('2026-10-12', 1), zone: 'learning', grade_value: 'V5', climbing_type: 'Vertical', baseline_zone: 'sent', is_checkin: false },
  { created_at: weekAt('2026-10-12', 2), zone: 'panic', grade_value: 'V7', climbing_type: 'Vertical', baseline_zone: 'fell', is_checkin: false },
  { created_at: weekAt('2026-09-14', 1), zone: 'learning', grade_value: 'V4', climbing_type: 'Dihedral', baseline_zone: 'sent', is_checkin: false },
  { created_at: weekAt('2026-10-12', 1), zone: 'learning', grade_value: 'V3', climbing_type: 'Dihedral', baseline_zone: 'fell', is_checkin: false },
  { created_at: weekAt('2026-10-05', 1), zone: 'comfort', grade_value: 'V2', climbing_type: 'Roof', baseline_zone: 'sent', is_checkin: false },
  { created_at: weekAt('2026-09-28', 1), zone: 'comfort', grade_value: 'V2', climbing_type: 'Roof', baseline_zone: 'sent', is_checkin: false }
];

const { server, port } = await startStaticServer();
const browser = await launchChromium();
const context = await browser.newContext();
const page = await context.newPage();

try{
  await page.route('**/*', async function(route){
    const url = route.request().url();
    if(/supabase-js@/.test(url)){
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: SUPABASE_STUB });
    }
    return route.continue();
  });
  await page.goto('http://127.0.0.1:' + port + '/coach-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(function(){
    return !!(window.__coachTerrainVolumeTest && window.CoachInsights);
  }, null, { timeout: 30000 });

  const fiveUi = await page.evaluate(function(rows){
    window.__coachTerrainVolumeTest.render(rows, 90);
    return {
      mode: window.__coachTerrainVolumeTest.mode(),
      counts: window.__coachTerrainVolumeTest.counts(),
      order: window.__coachTerrainVolumeTest.barOrder(),
      unit: window.__coachTerrainVolumeTest.unit(),
      notLogged: window.__coachTerrainVolumeTest.notLogged(),
      read: window.__coachTerrainVolumeTest.coachRead()
    };
  }, five);
  assert.strictEqual(fiveUi.mode, 'bars', 'logged terrains render bars, never radar');
  assert.strictEqual(fiveUi.counts.Slab, 2);
  assert.strictEqual(fiveUi.counts.Vertical, 1);
  assert.strictEqual(fiveUi.counts.Overhang, 1);
  assert.strictEqual(fiveUi.counts.Roof, 1);
  assert.strictEqual(fiveUi.counts['Arête'], 1);
  assert.ok(!fiveUi.counts.Crack && !fiveUi.counts.Dihedral, 'zero terrains are not bars');
  assert.strictEqual(fiveUi.order[0], 'Slab');
  assert.strictEqual(fiveUi.unit, 'Attempts logged');
  assert.ok(/Crack/.test(fiveUi.notLogged) && /Dihedral/.test(fiveUi.notLogged));
  assert.ok(/coach read/i.test(fiveUi.read));
  assert.ok(/logged attempts are/i.test(fiveUi.read));
  assert.ok(!/\b(because|caused|due to)\b/i.test(fiveUi.read));

  const twoUi = await page.evaluate(function(rows){
    window.__coachTerrainVolumeTest.render(rows, 90);
    return {
      mode: window.__coachTerrainVolumeTest.mode(),
      read: window.__coachTerrainVolumeTest.coachRead()
    };
  }, two);
  assert.strictEqual(twoUi.mode, 'bars', '2 terrains should render bars');
  assert.ok(/Not enough data yet/.test(twoUi.read));

  const emptyUi = await page.evaluate(function(){
    window.__coachTerrainVolumeTest.render([], 90);
    return {
      mode: window.__coachTerrainVolumeTest.mode(),
      counts: window.__coachTerrainVolumeTest.counts(),
      notLogged: window.__coachTerrainVolumeTest.notLogged()
    };
  });
  assert.strictEqual(emptyUi.mode, 'empty');
  assert.deepStrictEqual(emptyUi.counts, {});
  assert.ok(/Slab/.test(emptyUi.notLogged));

  const switched = await page.evaluate(function(rows){
    window.__coachTerrainVolumeTest.render(rows, 90);
    var before = window.__coachTerrainVolumeTest.counts();
    window.__coachTerrainVolumeTest.clickDays('all');
    var after = window.__coachTerrainVolumeTest.counts();
    return { beforeCrack: before.Crack || 0, afterCrack: after.Crack || 0, afterMode: window.__coachTerrainVolumeTest.mode() };
  }, five);
  assert.strictEqual(switched.beforeCrack, 0);
  assert.strictEqual(switched.afterCrack, 1, 'All time chip should add the old Crack climb');
  assert.strictEqual(switched.afterMode, 'bars');

  const colors = await page.evaluate(function(rows){
    window.__coachTerrainVolumeTest.render(rows, 90);
    var fill = document.querySelector('#terrain-volume-test-host .terrain-volume-bar-fill');
    var n = document.querySelector('#terrain-volume-test-host .terrain-volume-bar-n');
    var panic = document.querySelector('#terrain-volume-test-host .zone-seg.panic, #terrain-volume-test-host [style*="--panic"]');
    return {
      fill: fill ? getComputedStyle(fill).backgroundColor : '',
      text: n ? getComputedStyle(n).color : '',
      panic: panic ? getComputedStyle(panic).backgroundColor : ''
    };
  }, five);
  assert.ok(/rgb\(232,\s*146,\s*82\)/.test(colors.fill), 'volume bars use the one orange accent');
  assert.ok(!/rgb\(232,\s*68,\s*68\)/.test(colors.fill), 'volume is never panic red');
  assert.ok(!/rgb\(245,\s*166,\s*35\)/.test(colors.fill), 'volume is never learning amber');
  assert.ok(!/rgb\(126,\s*200,\s*122\)/.test(colors.fill), 'volume is never comfort green');
  assert.ok(!/rgb\(232,\s*68,\s*68\)/.test(colors.text), 'counts stay a neutral text color');

  const gradeUi = await page.evaluate(function(rows){
    window.__coachTerrainVolumeTest.render(rows, 90);
    var note = document.querySelector('#terrain-volume-test-host .insight-legend-note');
    var unit = note ? note.closest('.insight-chart-unit') : null;
    var svg = unit ? unit.querySelector('svg.insight-svg') : document.querySelector('#terrain-volume-test-host svg.insight-svg');
    var last = svg ? svg.querySelector('text.insight-x-tick[data-x-index]:last-of-type') : null;
    if(!last){
      var ticks = svg ? svg.querySelectorAll('text.insight-x-tick') : [];
      last = ticks[ticks.length - 1] || null;
    }
    var box = last && last.getBBox ? last.getBBox() : null;
    var vb = svg && svg.viewBox && svg.viewBox.baseVal;
    return {
      title: document.querySelector('#terrain-volume-test-host .insight-chart-help summary')
        ? Array.prototype.map.call(document.querySelectorAll('#terrain-volume-test-host .insight-chart-help summary'), function(n){ return n.textContent; }).join(' | ')
        : '',
      legend: note ? note.textContent : '',
      hollow: svg ? svg.querySelectorAll('circle[fill="none"]').length : 0,
      dashed: svg ? svg.querySelectorAll('polyline[stroke-dasharray]').length : 0,
      lastInside: !!(box && vb && box.x >= vb.x - 1 && (box.x + box.width) <= (vb.x + vb.width + 1)),
      trend: /trend/i.test((unit && unit.innerText) || '')
    };
  }, gradeRows);
  assert.ok(/Hardest send by terrain/.test(gradeUi.title));
  assert.ok(/Filled = send/.test(gradeUi.legend));
  assert.ok(gradeUi.hollow >= 1, 'attempt-only weeks render hollow dots');
  assert.ok(gradeUi.dashed >= 1, 'gaps up to 4 empty weeks use a dashed connector');
  assert.ok(gradeUi.lastInside, 'last x label is fully inside the SVG viewBox');
  assert.ok(!gradeUi.trend, 'no trend wording on short series');

  async function assertNoOverflow(width){
    await page.setViewportSize({ width: width, height: 900 });
    const box = await page.evaluate(function(w){
      var host = document.getElementById('terrain-volume-test-host');
      host.style.width = w + 'px';
      host.style.maxWidth = '100%';
      host.style.boxSizing = 'border-box';
      return { sw: host.scrollWidth, cw: host.clientWidth };
    }, width);
    assert.ok(box.sw <= box.cw + 1, 'overflow at ' + width + ': ' + box.sw + ' > ' + box.cw);
  }
  await page.evaluate(function(rows){ window.__coachTerrainVolumeTest.render(rows, 90); }, five);
  await assertNoOverflow(390);
  await assertNoOverflow(840);
  await assertNoOverflow(1280);

  const boardUi = await page.evaluate(function(rows){
    window.__coachTerrainVolumeTest.render(rows, 90);
    return window.__coachTerrainVolumeTest.scoreboard();
  }, two);
  assert.ok(boardUi.every(function(row){ return row.falls === '—'; }), 'scoreboard uses — under 5 attempts');

  const emptyHi = await page.evaluate(function(){
    window.__coachTerrainVolumeTest.render([], 90);
    return window.__coachTerrainVolumeTest.highlights();
  });
  assert.deepStrictEqual(emptyHi, [], 'highlights hide with no data');

  const fullHi = await page.evaluate(function(rows){
    window.__coachTerrainVolumeTest.render(rows, 90);
    return window.__coachTerrainVolumeTest.highlights();
  }, gradeRows);
  assert.ok(fullHi.indexOf('hardest-send') !== -1);
  assert.ok(fullHi.indexOf('most-climbed') !== -1);
  assert.ok(fullHi.indexOf('most-active-week') !== -1);

  await page.evaluate(function(rows){ window.__coachTerrainVolumeTest.render(rows, 90); }, five);
  await assertNoOverflow(390);

  console.log('coach-terrain-volume tests: ok');
}finally{
  await context.close();
  await browser.close();
  server.close();
}
