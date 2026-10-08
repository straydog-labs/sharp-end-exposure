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
const logJs = readFileSync(join(root, 'js/coach-log-session.js'), 'utf8');

assert.ok(/var app_version = 'index296'/.test(index));
assert.ok(/APP_VERSION = 'index296'/.test(sw));

assert.ok(/data-terrain="Arête"/.test(dash) || /'Arête'/.test(dash));
assert.ok(/Dihedral/.test(dash));
assert.ok(/function buildPayload/.test(logJs));

const SB_HOST = 'kwtbqgoqtewrlsjgepwq.supabase.co';
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

async function withPage(port, fn){
  const browser = await launchChromium();
  const context = await browser.newContext();
  const page = await context.newPage();
  const posts = [];
  await page.route('**/*', async function(route){
    const req = route.request();
    const url = req.url();
    if(/supabase-js@/.test(url)){
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: SUPABASE_STUB });
    }
    if(url.indexOf(SB_HOST) === -1) return route.continue();
    var body = null;
    try{ body = req.postDataJSON(); }catch(e){ body = null; }
    if(req.method() === 'POST' && url.indexOf('/rest/v1/sessions') !== -1){
      posts.push(body);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify([Object.assign({ id: body && body.id }, body)])
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('http://127.0.0.1:' + port + '/coach-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(function(){
    return !!(window.__coachLogTest && window.CoachLogSession);
  }, null, { timeout: 30000 });
  try{
    await fn(page, posts);
  }finally{
    await context.close();
    await browser.close();
  }
}

async function fillAndSave(page, extras){
  await page.evaluate(function(extra){
    window.__coachLogTest.arm({
      token: 'test-token',
      athleteId: 'ath-1',
      athleteLabel: 'Jordan',
      coachUser: { id: 'coach-1' }
    }, extra);
    var name = document.getElementById('clog-name');
    if(name && extra.routeName) name.value = extra.routeName;
    var grade = document.getElementById('clog-grade');
    if(grade && extra.grade) grade.value = extra.grade;
    var note = document.getElementById('clog-note');
    if(note && extra.note) note.value = extra.note;
    var act = document.getElementById('clog-activation');
    if(act && extra.activationScore != null){
      act.value = String(extra.activationScore);
      act.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function clickChip(sel, val){
      var el = document.querySelector(sel + '[data-value="' + val + '"]');
      if(el && !/\bselected\b/.test(el.className)) el.click();
    }
    if(extra.howClimbed) clickChip('#clog-how button', extra.howClimbed);
    if(extra.setting) clickChip('#clog-setting button', extra.setting);
    if(extra.discipline) clickChip('#clog-discipline button', extra.discipline);
    if(extra.terrain){
      var t = document.querySelector('#clog-terrains button[data-terrain="' + extra.terrain + '"]');
      if(t) t.click();
    }
    if(extra.result) clickChip('#clog-result button', extra.result);
    if(extra.fallCount != null){
      var n = document.getElementById('clog-fall-count-val');
      if(n) n.textContent = String(extra.fallCount);
    }
    var save = document.getElementById('clog-save');
    if(save) save.click();
    else window.__coachLogTest.save();
  }, extras);
  await page.waitForTimeout(300);
}

const { server, port } = await startStaticServer();

try{
  await withPage(port, async function(page, posts){
    await fillAndSave(page, {
      zone: 'learning',
      activationScore: 7,
      activationTouched: true,
      routeName: 'Power of Now',
      grade: '5.12a',
      note: 'watched the crux',
      howClimbed: 'Lead',
      setting: 'outdoor',
      discipline: 'Sport',
      terrain: 'Overhang',
      result: 'sent'
    });
    assert.ok(posts.length >= 1, 'full form should POST a session');
    const body = posts[0];
    assert.strictEqual(body.route_name, 'Power of Now', 'climb name');
    assert.strictEqual(body.grade_value, '5.12a', 'grade');
    assert.strictEqual(body.climbing_type, 'Lead', 'how climbed');
    assert.strictEqual(body.setting, 'outdoor');
    assert.strictEqual(body.discipline, 'Sport');
    assert.strictEqual(body.coach_activation_score, 7);
    assert.strictEqual(body.zone, 'learning');
    assert.strictEqual(body.baseline_zone, 'sent');
    assert.strictEqual(body.session_notes, 'watched the crux');
    assert.strictEqual(body.logged_by_coach, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(body, 'gym_name') || body.gym_name == null,
      'gym name must not be posted from the odd field');
  });

  await withPage(port, async function(page, posts){
    await fillAndSave(page, {
      zone: 'learning',
      activationScore: 6,
      activationTouched: true,
      routeName: 'Practice wall',
      grade: '5.10a',
      howClimbed: 'Top Rope',
      setting: 'indoor',
      result: 'fall_practice',
      fallCount: 4
    });
    assert.ok(posts.length >= 1, 'fall practice should POST');
    const body = posts[0];
    assert.strictEqual(body.baseline_zone, 'fall_practice');
    assert.strictEqual(body.fall_count, 4);
    assert.strictEqual(body.climbing_type, 'Top Rope');
    assert.strictEqual(body.setting, 'indoor');
    assert.strictEqual(body.route_name, 'Practice wall');
  });

  console.log('coach-log-form tests: ok');
}finally{
  server.close();
}
