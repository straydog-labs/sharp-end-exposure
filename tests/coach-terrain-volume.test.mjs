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

assert.ok(/var app_version = 'index295'/.test(index));
assert.ok(/APP_VERSION = 'index295'/.test(sw));
assert.ok(/function computeTerrainVolume/.test(readFileSync(join(root, 'js/coach-athlete-insights.js'), 'utf8')));
assert.ok(/data-terrain-volume/.test(dash));
assert.ok(/terrain-volume-unit/.test(dash));
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
assert.strictEqual(vol90.mode, 'radar');
assert.strictEqual(vol90.counts.Slab, 2);
assert.strictEqual(vol90.counts.Vertical, 1);
assert.strictEqual(vol90.counts.Overhang, 1);
assert.strictEqual(vol90.counts.Roof, 1);
assert.strictEqual(vol90.counts['Arête'], 1);
assert.strictEqual(vol90.counts.Crack, 0, 'Crack is outside 90 days');
assert.strictEqual(vol90.counts.Dihedral, 0);

const volAll = CI.computeTerrainVolume(five, { days: null, endDate: now });
assert.strictEqual(volAll.counts.Crack, 1);

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
      counts: window.__coachTerrainVolumeTest.counts()
    };
  }, five);
  assert.strictEqual(fiveUi.mode, 'radar', '5 terrains should render a radar');
  assert.strictEqual(fiveUi.counts.Slab, 2);
  assert.strictEqual(fiveUi.counts.Vertical, 1);
  assert.strictEqual(fiveUi.counts.Overhang, 1);
  assert.strictEqual(fiveUi.counts.Roof, 1);
  assert.strictEqual(fiveUi.counts['Arête'], 1);
  assert.strictEqual(fiveUi.counts.Crack || 0, 0);

  const twoUi = await page.evaluate(function(rows){
    window.__coachTerrainVolumeTest.render(rows, 90);
    return window.__coachTerrainVolumeTest.mode();
  }, two);
  assert.strictEqual(twoUi, 'bars', '2 terrains should render bars');

  const switched = await page.evaluate(function(rows){
    window.__coachTerrainVolumeTest.render(rows, 90);
    var before = window.__coachTerrainVolumeTest.counts();
    window.__coachTerrainVolumeTest.clickDays('all');
    var after = window.__coachTerrainVolumeTest.counts();
    return { beforeCrack: before.Crack || 0, afterCrack: after.Crack || 0, afterMode: window.__coachTerrainVolumeTest.mode() };
  }, five);
  assert.strictEqual(switched.beforeCrack, 0);
  assert.strictEqual(switched.afterCrack, 1, 'All time chip should add the old Crack climb');
  assert.strictEqual(switched.afterMode, 'radar');

  console.log('coach-terrain-volume tests: ok');
}finally{
  await context.close();
  await browser.close();
  server.close();
}
