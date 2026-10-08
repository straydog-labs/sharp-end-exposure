import { readFileSync, existsSync } from 'fs';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import assert from 'assert';
import { launchChromium } from './pw-browser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');

assert.ok(/var app_version = 'index297'/.test(index));
assert.ok(/APP_VERSION = 'index297'/.test(sw));

assert.ok(/function renderJournalFeed/.test(dash));
assert.ok(/function loadAthleteSessions/.test(dash));
assert.ok(/function journalClimbEntryHtml/.test(dash));
assert.ok(/_journalSortNewest/.test(dash));
assert.ok(/baseline_zone/.test(dash) && /fall_count/.test(dash));
assert.ok(/coach_activation_score/.test(dash));
assert.ok(/grade_value/.test(dash) && /climbing_type/.test(dash));
assert.ok(/isCoachLogMissingColumn\(err, cols\[i\]\)/.test(dash));
assert.ok(/journal-sort-newest/.test(dash) && /journal-sort-oldest/.test(dash));

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

const SESSIONS = [
  {
    id: 's-old',
    created_at: '2026-01-01T10:00:00.000Z',
    route_name: 'Warm Up Wall',
    zone: 'comfort',
    coach_activation_score: 2.5,
    baseline_zone: 'sent',
    grade_value: 'V2',
    climbing_type: 'Slab',
    logged_by_coach: true
  },
  {
    id: 's-mid',
    created_at: '2026-02-15T10:00:00.000Z',
    route_name: 'Power of Now',
    zone: 'learning',
    coach_activation_score: 7.0,
    baseline_zone: 'fell',
    grade_value: 'V5',
    climbing_type: 'Overhang'
  },
  {
    id: 's-new',
    created_at: '2026-03-20T10:00:00.000Z',
    route_name: 'Roof Problem',
    zone: 'panic',
    coach_activation_score: 10.5,
    baseline_zone: 'dna',
    grade_value: 'V6',
    climbing_type: 'Roof'
  }
];

function expectCard(card, opts){
  assert.ok(card, 'missing card ' + opts.id);
  assert.ok(new RegExp(opts.zoneScore, 'i').test(card.text),
    opts.id + ' zone+score missing, got ' + JSON.stringify(card.text));
  assert.ok(new RegExp(opts.result, 'i').test(card.text),
    opts.id + ' result missing, got ' + JSON.stringify(card.text));
  assert.ok(card.text.indexOf(opts.grade) !== -1,
    opts.id + ' grade missing, got ' + JSON.stringify(card.text));
  assert.ok(card.text.indexOf(opts.terrain) !== -1,
    opts.id + ' terrain missing, got ' + JSON.stringify(card.text));
  assert.ok(card.text.indexOf(opts.name) !== -1,
    opts.id + ' name missing, got ' + JSON.stringify(card.text));
  assert.ok(card.text.indexOf('Unnamed climb') === -1,
    opts.id + ' should not say Unnamed climb when a name exists');
}

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
    return !!(window.__coachJournalTest && window.CoachInsights);
  }, null, { timeout: 30000 });

  await page.evaluate(function(rows){
    window.__coachJournalTest.render(rows);
  }, SESSIONS);

  const newest = await page.evaluate(function(){ return window.__coachJournalTest.cards(); });
  assert.deepStrictEqual(newest.map(function(c){ return c.id; }), ['s-new', 's-mid', 's-old'],
    'default order must be newest first, got ' + newest.map(function(c){ return c.id; }).join(','));

  expectCard(newest[0], { id: 's-new', name: 'Roof Problem', zoneScore: 'Panic 10\\.5', result: 'DNA', grade: 'V6', terrain: 'Roof' });
  expectCard(newest[1], { id: 's-mid', name: 'Power of Now', zoneScore: 'Learning 7\\.0', result: 'Fell', grade: 'V5', terrain: 'Overhang' });
  expectCard(newest[2], { id: 's-old', name: 'Warm Up Wall', zoneScore: 'Comfort 2\\.5', result: 'Sent', grade: 'V2', terrain: 'Slab' });
  assert.ok(/Logged by coach/.test(newest[2].text), 'coach-logged row must be marked');

  await page.evaluate(function(){ window.__coachJournalTest.clickOldest(); });
  const oldest = await page.evaluate(function(){ return window.__coachJournalTest.cards(); });
  assert.deepStrictEqual(oldest.map(function(c){ return c.id; }), ['s-old', 's-mid', 's-new'],
    'Oldest toggle must reverse the feed, got ' + oldest.map(function(c){ return c.id; }).join(','));

  console.log('coach-journal-readability tests: ok');
}finally{
  await context.close();
  await browser.close();
  server.close();
}
