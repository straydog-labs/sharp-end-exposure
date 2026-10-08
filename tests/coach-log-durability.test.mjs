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
assert.ok(/var app_version = 'index292'/.test(index));
assert.ok(/APP_VERSION = 'index292'/.test(sw));

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

async function withPage(port, handler, fn){
  const browser = await launchChromium();
  const context = await browser.newContext();
  const page = await context.newPage();
  const recorded = [];
  await page.route('**/*', async function(route){
    const req = route.request();
    const url = req.url();
    if(/supabase-js@/.test(url)){
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: SUPABASE_STUB });
    }
    if(url.indexOf(SB_HOST) === -1) return route.continue();
    var body = null;
    try{ body = req.postDataJSON(); }catch(e){ body = null; }
    var rec = { method: req.method(), url: url, body: body };
    recorded.push(rec);
    return handler(route, rec, recorded);
  });
  await page.goto('http://127.0.0.1:' + port + '/coach-dashboard.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(function(){
    return !!(window.__coachLogTest && window.CoachLogSession && window.SessionsInsertRequired);
  }, null, { timeout: 30000 });
  try{
    await fn(page, recorded);
  }finally{
    await context.close();
    await browser.close();
  }
}

async function armAndSave(page){
  await page.evaluate(function(){
    window.__coachLogTest.arm({
      token: 'test-token',
      athleteId: 'ath-1',
      athleteLabel: 'Jordan',
      coachUser: { id: 'coach-1' }
    }, { zone: 'learning', grade: 'V4', note: 'crux looked honest', activationTouched: true, activationScore: 7 });
    return window.__coachLogTest.save();
  });
  await page.waitForTimeout(250);
}

const { server, port } = await startStaticServer();

try{
  // (a) PGRST204 on one column → retry without it, warning shown
  await withPage(port, async function(route, rec){
    if(rec.method === 'POST' && rec.url.indexOf('/rest/v1/sessions') !== -1){
      if(rec.body && Object.prototype.hasOwnProperty.call(rec.body, 'zone_confirmed_by_athlete')){
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'PGRST204',
            message: "Could not find the 'zone_confirmed_by_athlete' column of 'sessions' in the schema cache"
          })
        });
      }
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify([Object.assign({ id: rec.body && rec.body.id }, rec.body)])
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  }, async function(page, recorded){
    await armAndSave(page);
    const posts = recorded.filter(function(r){ return r.method === 'POST' && r.url.indexOf('/sessions') !== -1; });
    assert.ok(posts.length >= 2, 'a: should retry after PGRST204, got ' + posts.length);
    assert.ok(Object.prototype.hasOwnProperty.call(posts[0].body, 'zone_confirmed_by_athlete'));
    assert.ok(!Object.prototype.hasOwnProperty.call(posts[1].body, 'zone_confirmed_by_athlete'),
      'a: retry must omit the missing column');
    const ui = await page.evaluate(function(){
      var msg = document.getElementById('clog-msg');
      return { text: msg ? msg.textContent : '', cls: msg ? msg.className : '' };
    });
    assert.ok(/zone_confirmed_by_athlete/.test(ui.text),
      'a: warning must name the dropped field, got ' + JSON.stringify(ui));
  });

  // (b) network failure → queued, form not cleared, replay inserts exactly once
  var acceptReplay = false;
  var inserts = [];
  await withPage(port, async function(route, rec){
    if(rec.method === 'POST' && rec.url.indexOf('/rest/v1/sessions') !== -1){
      if(!acceptReplay) return route.abort('failed');
      inserts.push(rec.body);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify([Object.assign({ id: rec.body && rec.body.id }, rec.body)])
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  }, async function(page){
    await armAndSave(page);
    const afterFail = await page.evaluate(function(){
      var msg = document.getElementById('clog-msg');
      var state = window.__coachLogTest.getState();
      var q = [];
      try{ q = JSON.parse(localStorage.getItem('see-coach-log-queue-v1') || '[]'); }catch(e){}
      return { text: msg ? msg.textContent : '', grade: state.grade, note: state.note, queue: q.length };
    });
    assert.ok(/Saved on this device, will retry/i.test(afterFail.text),
      'b: queue message missing, got ' + JSON.stringify(afterFail));
    assert.strictEqual(afterFail.grade, 'V4', 'b: form grade must not clear');
    assert.strictEqual(afterFail.note, 'crux looked honest', 'b: form note must not clear');
    assert.ok(afterFail.queue >= 1, 'b: queue should keep the entry');
    acceptReplay = true;
    await page.evaluate(function(){
      var btn = document.getElementById('clog-retry-now');
      if(btn) btn.click();
      else if(window.__coachLogTest.replay) return window.__coachLogTest.replay();
    });
    await page.waitForTimeout(400);
    await page.evaluate(function(){
      if(window.__coachLogTest.replay) return window.__coachLogTest.replay();
    });
    await page.waitForTimeout(400);
    assert.strictEqual(inserts.length, 1, 'b: replay must insert exactly once, got ' + inserts.length);
  });

  // (c) 403 → no stripping, error shown
  await withPage(port, async function(route, rec){
    if(rec.method === 'POST' && rec.url.indexOf('/rest/v1/sessions') !== -1){
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy for table "sessions"' })
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  }, async function(page, recorded){
    await armAndSave(page);
    const posts = recorded.filter(function(r){ return r.method === 'POST' && r.url.indexOf('/sessions') !== -1; });
    assert.strictEqual(posts.length, 1, 'c: 403 must not strip/retry, got ' + posts.length);
    assert.strictEqual(posts[0].body.logged_by_coach, true);
    assert.ok(Object.prototype.hasOwnProperty.call(posts[0].body, 'zone_confirmed_by_athlete'));
    const ui = await page.evaluate(function(){
      var msg = document.getElementById('clog-msg');
      return msg ? msg.textContent : '';
    });
    assert.ok(/403/.test(ui), 'c: must show status 403, got ' + JSON.stringify(ui));
    assert.ok(/row-level security|42501/i.test(ui), 'c: must show real error text, got ' + JSON.stringify(ui));
    assert.ok(!/^Could not save\.?$/i.test(ui.trim()));
  });

  console.log('coach-log-durability tests: ok');
}finally{
  server.close();
}
