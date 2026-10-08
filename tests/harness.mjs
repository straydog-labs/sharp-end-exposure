import { readFileSync, existsSync } from 'fs';
import { createServer } from 'http';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import { launchChromium } from './pw-browser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');
export const SB_HOST = 'kwtbqgoqtewrlsjgepwq.supabase.co';
export const USER_ID = 'user-regression-1';
export const COACH_ID = 'coach-regression-1';
export const ATHLETE_ID = 'athlete-regression-1';
export const ROUTE = 'Green 30 degree';
export const CLIMB_ID = 'climb-green-30';
export const GRADE = '5.11a';
export const TERRAIN = 'Overhang';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const SUPABASE_STUB = [
  'window.supabase = { createClient: function(){',
  '  return {',
  '    auth: {',
  '      getSession: function(){',
  '        return Promise.resolve({ data: { session: window.__seeTestSession || null }, error: null });',
  '      },',
  '      onAuthStateChange: function(){',
  '        return { data: { subscription: { unsubscribe: function(){} } } };',
  '      },',
  '      signInWithPassword: function(){',
  '        return Promise.resolve({ data: { session: window.__seeTestSession || null }, error: null });',
  '      },',
  '      signOut: function(){ return Promise.resolve({ error: null }); }',
  '    }',
  '  };',
  '}};'
].join('\n');

export function startStaticServer(){
  return new Promise(function(resolve){
    const server = createServer(function(req, res){
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if(urlPath === '/') urlPath = '/index.html';
      if(urlPath === '/sw.js'){
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        res.end('/* test stub */');
        return;
      }
      var filePath = join(ROOT, urlPath);
      if(!filePath.startsWith(ROOT) || !existsSync(filePath)){
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
    });
    server.listen(0, '127.0.0.1', function(){
      resolve({ server: server, port: server.address().port });
    });
  });
}

export { launchChromium };

export function climbRow(){
  return { id: CLIMB_ID, name: ROUTE, grade_value: GRADE, climbing_type: TERRAIN, is_project: true };
}

export function sessionRow(overrides){
  return Object.assign({
    id: 'sess-green-1',
    user_id: USER_ID,
    route_name: ROUTE,
    climb_id: CLIMB_ID,
    grade_value: GRADE,
    climbing_type: TERRAIN,
    setting: 'indoor',
    baseline_zone: 'sent',
    zone: 'learning',
    zone_confidence: 'confirmed',
    is_baseline: false,
    is_checkin: false,
    deleted_at: null,
    created_at: '2026-10-07T12:00:00.000Z'
  }, overrides || {});
}

function fulfillJson(route, status, body, extraHeaders){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    headers: extraHeaders || {},
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

export async function withPage(browser, port, opts, fn){
  opts = opts || {};
  const recorded = [];
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/*', async function(route){
    var req = route.request();
    var url = req.url();
    if(url.indexOf('cdn.jsdelivr.net/npm/@supabase/supabase-js') !== -1){
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: SUPABASE_STUB });
    }
    if(url.indexOf(SB_HOST) === -1) return route.continue();
    var method = req.method();
    var body = null;
    if(method === 'POST' || method === 'PATCH' || method === 'PUT'){
      try{ body = JSON.parse(req.postData() || 'null'); }catch(e){ body = req.postData(); }
    }
    recorded.push({ method: method, url: url, body: body });
    if(typeof opts.stub === 'function'){
      var handled = await opts.stub(route, { method: method, url: url, body: body, recorded: recorded });
      if(handled) return;
    }
    if(url.indexOf('/auth/v1/') !== -1){
      return fulfillJson(route, 200, { access_token: 'test-token', user: { id: opts.userId || USER_ID } });
    }
    if(method === 'GET' && url.indexOf('/rest/v1/climbs') !== -1){
      return fulfillJson(route, 200, [climbRow()]);
    }
    if(method === 'GET' && url.indexOf('/rest/v1/sessions') !== -1){
      return fulfillJson(route, 200, opts.sessions || [], { 'content-range': '0-0/1' });
    }
    if(method === 'POST' && url.indexOf('/rest/v1/sessions') !== -1){
      return fulfillJson(route, 201, [Object.assign({ id: 'sess-saved-' + recorded.length }, body || {})]);
    }
    if(method === 'PATCH' && url.indexOf('/rest/v1/sessions') !== -1){
      return fulfillJson(route, 200, [body || {}]);
    }
    if(method === 'POST' && url.indexOf('/rest/v1/falls') !== -1){
      return fulfillJson(route, 201, [Object.assign({ id: 'fall-1' }, body || {})]);
    }
    if(method === 'POST' && url.indexOf('/rest/v1/climbs') !== -1){
      return fulfillJson(route, 201, [Object.assign({ id: 'climb-created-' + recorded.length }, body || {})]);
    }
    if(method === 'POST' && url.indexOf('/rest/v1/rpc/coach_list_roster') !== -1){
      return fulfillJson(route, 200, {
        ok: true,
        roster: [{
          link_id: 'link-1',
          athlete_id: ATHLETE_ID,
          athlete_email: 'athlete@test.local',
          athlete_first_name: 'Test',
          athlete_last_name: 'Athlete',
          status: 'active'
        }]
      });
    }
    if(method === 'GET' && url.indexOf('/rest/v1/coach_flags') !== -1){
      return fulfillJson(route, 200, [{ is_coach: true, user_id: COACH_ID }]);
    }
    if(method === 'POST' && url.indexOf('/rest/v1/rpc/') !== -1){
      return fulfillJson(route, 200, { ok: false });
    }
    return fulfillJson(route, 200, []);
  });
  await page.addInitScript(function(args){
    try{
      localStorage.setItem('see_consent_v1', JSON.stringify({ at: 1 }));
      localStorage.setItem('see_baseline_complete', '1');
      localStorage.setItem('see_auth_dismissed', '1');
      localStorage.setItem('see_tips_enabled', '0');
      localStorage.setItem('see_device_id', 'dev_regression');
    }catch(e){}
    if(args.session) window.__seeTestSession = args.session;
  }, {
    session: opts.session || null
  });
  var pagePath = opts.path || '/index.html';
  await page.goto('http://127.0.0.1:' + port + pagePath, { waitUntil: 'domcontentloaded', timeout: 60000 });
  try{
    await fn(page, recorded);
  }finally{
    await context.close();
  }
}

export async function tap(page, selector){
  var loc = page.locator(selector).first();
  await loc.waitFor({ state: 'attached', timeout: 8000 });
  await loc.evaluate(function(el){ el.click(); });
}

export async function readyDial(page){
  await page.evaluate(function(){
    if(typeof onLogActivationRelease === 'function') onLogActivationRelease();
    if(typeof logState === 'object' && logState && !logState.userActivationEstimate && logState.userActivationEstimate !== 0){
      logState.userActivationEstimate = logFlowState.activationScore;
    }
  });
}

export async function waitForScreen(page, id){
  await page.waitForFunction(function(screenId){
    var el = document.getElementById(screenId);
    return !!(el && el.classList.contains('active'));
  }, id, { timeout: 8000 });
}

export function postsTo(recorded, table, method){
  method = method || 'POST';
  return recorded.filter(function(r){
    return r.method === method && r.url.indexOf('/rest/v1/' + table) !== -1;
  });
}

export function firstBody(rows){
  if(!rows.length) return null;
  var body = rows[0].body;
  if(Array.isArray(body)) body = body[0];
  return body;
}
