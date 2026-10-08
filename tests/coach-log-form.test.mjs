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

assert.ok(/var app_version = 'index297'/.test(index));
assert.ok(/APP_VERSION = 'index297'/.test(sw));

const overlayStart = dash.indexOf('id="coach-log-overlay"');
const overlayEnd = dash.indexOf('id="assign-wizard-overlay"');
const overlay = overlayStart >= 0 && overlayEnd > overlayStart
  ? dash.slice(overlayStart, overlayEnd)
  : '';
assert.ok(overlay, 'coach-log overlay markup');

assert.ok(!/id="clog-activation"/.test(overlay), 'no Activation (0-10) number box');
assert.ok(!/Activation \(0/.test(overlay), 'no Activation (0-10) label');
assert.ok(!/id="clog-zone-chips"/.test(overlay), 'no Comfort/Learning/Panic zone chips');
assert.ok(!/>Comfort<\/button>/.test(overlay) && !/label: 'Comfort'/.test(overlay.slice(0, 1)),
  'zone chips are not hardcoded in overlay markup');
assert.ok(/clog-gauge/.test(overlay));
assert.ok(/Backed off/.test(overlay) || /Backed off/.test(logJs), 'result label matches athlete app');
assert.ok(!/>DNA</.test(overlay), 'DNA is athlete-labeled Backed off');
assert.ok(/id="clog-more"/.test(overlay) && /<summary>More<\/summary>/.test(overlay),
  'Indoor/Outdoor and Sport/Trad live under More');

function pos(id){
  var i = overlay.indexOf('id="' + id + '"');
  assert.ok(i >= 0, 'missing #' + id);
  return i;
}
const order = ['clog-gauge', 'clog-name', 'clog-grade', 'clog-terrains', 'clog-how', 'clog-result', 'clog-note', 'clog-more'];
for(var i = 1; i < order.length; i++){
  assert.ok(pos(order[i]) > pos(order[i - 1]),
    order[i - 1] + ' must come before ' + order[i]);
}
assert.ok(pos('clog-setting') > pos('clog-more'));
assert.ok(pos('clog-discipline') > pos('clog-more'));
assert.ok(pos('clog-setting') > pos('clog-note'));

assert.ok(/data-terrain="Arête"/.test(dash) || /'Arête'/.test(dash));
assert.ok(/Dihedral/.test(dash));
assert.ok(/function buildPayload/.test(logJs));
assert.ok(/keydown/.test(logJs) && /ArrowRight/.test(logJs), 'dial arrow keys ±0.5');
assert.ok(/role=['"]slider['"]/.test(logJs) || /setAttribute\('role', 'slider'\)/.test(logJs));

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

function armBlank(){
  window.__coachLogTest.arm({
    token: 'test-token',
    athleteId: 'ath-1',
    athleteLabel: 'Jordan',
    coachUser: { id: 'coach-1' }
  });
}

async function setDialScore(page, score){
  await page.waitForSelector('#clog-gauge .clog-gauge-wrap', { timeout: 8000 });
  await page.evaluate(function(s){
    var wrap = document.querySelector('#clog-gauge .clog-gauge-wrap');
    var target = document.querySelector('#clog-gauge .gauge-dial-target') || wrap;
    if(!wrap || !target) throw new Error('dial missing');
    var rect = wrap.getBoundingClientRect();
    var wantAng = 180 * (1 - Number(s) / 12);
    var rad = wantAng * Math.PI / 180;
    var clientX = rect.left + rect.width / 2 + Math.cos(rad) * 40;
    var clientY = rect.top + rect.height - Math.sin(rad) * 40;
    var opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX: clientX, clientY: clientY };
    target.dispatchEvent(new PointerEvent('pointerdown', opts));
    wrap.dispatchEvent(new PointerEvent('pointerdown', opts));
    target.dispatchEvent(new PointerEvent('pointerup', opts));
    wrap.dispatchEvent(new PointerEvent('pointerup', opts));
  }, score);
  await page.waitForFunction(function(){
    var el = document.querySelector('.clog-gauge-readout');
    return !!(el && !/Drag to set|set the dial/i.test(el.textContent || '') && /\d/.test(el.textContent || ''));
  }, null, { timeout: 5000 });
}

async function fillFields(page, extra){
  await page.evaluate(function(ex){
    var name = document.getElementById('clog-name');
    if(name && ex.routeName) name.value = ex.routeName;
    var grade = document.getElementById('clog-grade');
    if(grade && ex.grade) grade.value = ex.grade;
    var note = document.getElementById('clog-note');
    if(note && ex.note) note.value = ex.note;
    function clickChip(sel, val){
      var el = document.querySelector(sel + '[data-value="' + val + '"]');
      if(el && !/\bselected\b/.test(el.className)) el.click();
    }
    if(ex.howClimbed) clickChip('#clog-how button', ex.howClimbed);
    if(ex.setting){
      var more = document.getElementById('clog-more');
      if(more) more.open = true;
      clickChip('#clog-setting button', ex.setting);
    }
    if(ex.discipline){
      var more2 = document.getElementById('clog-more');
      if(more2) more2.open = true;
      clickChip('#clog-discipline button', ex.discipline);
    }
    if(ex.terrain){
      var t = document.querySelector('#clog-terrains button[data-terrain="' + ex.terrain + '"]');
      if(t) t.click();
    }
    if(ex.result) clickChip('#clog-result button', ex.result);
    if(ex.fallCount != null){
      var plus = document.getElementById('clog-fall-plus');
      var n = document.getElementById('clog-fall-count-val');
      var want = ex.fallCount;
      var guard = 0;
      while(plus && n && parseInt(n.textContent, 10) < want && guard++ < 25) plus.click();
    }
  }, extra);
}

const { server, port } = await startStaticServer();

try{
  await withPage(port, async function(page, posts){
    await page.evaluate(armBlank);
    await page.waitForSelector('#coach-log-overlay.open', { timeout: 8000 });

    const chrome = await page.evaluate(function(){
      var save = document.getElementById('clog-save');
      var results = Array.prototype.map.call(
        document.querySelectorAll('#clog-result button'),
        function(btn){ return (btn.textContent || '').trim(); }
      );
      var more = document.getElementById('clog-more');
      return {
        hasNumber: !!document.getElementById('clog-activation'),
        hasZoneChips: !!document.getElementById('clog-zone-chips'),
        zoneChipCount: document.querySelectorAll('#clog-zone-chips button').length,
        saveDisabled: !!(save && save.disabled),
        results: results,
        moreClosed: !!(more && !more.open),
        moreHasSetting: !!(more && more.querySelector('#clog-setting'))
      };
    });
    assert.strictEqual(chrome.hasNumber, false, 'Activation number box must be gone');
    assert.ok(!chrome.hasZoneChips && chrome.zoneChipCount === 0, 'zone chips must be gone');
    assert.strictEqual(chrome.saveDisabled, true, 'Save disabled until the dial is set');
    assert.deepStrictEqual(chrome.results, ['Sent', 'Fell', 'Backed off', 'Took', 'Fall practice']);
    assert.ok(chrome.moreClosed, 'More starts collapsed');
    assert.ok(chrome.moreHasSetting, 'Setting lives under More');

    await setDialScore(page, 7);
    const afterDial = await page.evaluate(function(){
      var save = document.getElementById('clog-save');
      var readout = (document.querySelector('.clog-gauge-readout') || {}).textContent || '';
      var slider = document.querySelector('#clog-gauge [role="slider"], #clog-gauge .gauge-dial-target');
      return {
        saveDisabled: !!(save && save.disabled),
        readout: readout.replace(/\s+/g, ' ').trim(),
        ariaNow: slider ? slider.getAttribute('aria-valuenow') : null
      };
    });
    assert.strictEqual(afterDial.saveDisabled, false, 'Save enables once the dial is set');
    assert.ok(/7\.0/.test(afterDial.readout) && /Learning/.test(afterDial.readout),
      'readout e.g. 7.0 Learning, got ' + afterDial.readout);

    await page.evaluate(function(){
      var el = document.querySelector('#clog-gauge [role="slider"], #clog-gauge .gauge-dial-target');
      if(!el) throw new Error('slider missing');
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    const afterKey = await page.evaluate(function(){
      var readout = (document.querySelector('.clog-gauge-readout') || {}).textContent || '';
      return readout.replace(/\s+/g, ' ').trim();
    });
    assert.ok(/6\.5/.test(afterKey) && /Learning/.test(afterKey),
      'ArrowLeft nudges -0.5, got ' + afterKey);

    await setDialScore(page, 7);
    await fillFields(page, {
      routeName: 'Power of Now',
      grade: '5.12a',
      note: 'watched the crux',
      howClimbed: 'Lead',
      setting: 'outdoor',
      discipline: 'Sport',
      terrain: 'Overhang',
      result: 'sent'
    });
    await page.click('#clog-save');
    await page.waitForTimeout(400);
    assert.ok(posts.length >= 1, 'full form should POST a session');
    const body = posts[0];
    assert.strictEqual(body.route_name, 'Power of Now', 'climb name');
    assert.strictEqual(body.grade_value, '5.12a', 'grade');
    assert.strictEqual(body.climbing_type, 'Lead', 'how climbed');
    assert.strictEqual(body.setting, 'outdoor');
    assert.strictEqual(body.discipline, 'Sport');
    assert.strictEqual(body.coach_activation_score, 7);
    assert.strictEqual(body.zone, 'learning', 'zone derived from dial');
    assert.strictEqual(body.baseline_zone, 'sent');
    assert.strictEqual(body.session_notes, 'watched the crux');
    assert.strictEqual(body.logged_by_coach, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(body, 'gym_name') || body.gym_name == null,
      'gym name must not be posted from the odd field');
  });

  await withPage(port, async function(page, posts){
    await page.evaluate(armBlank);
    await page.waitForSelector('#coach-log-overlay.open', { timeout: 8000 });
    await setDialScore(page, 6);
    await fillFields(page, {
      routeName: 'Practice wall',
      grade: '5.10a',
      howClimbed: 'Top Rope',
      setting: 'indoor',
      result: 'fall_practice',
      fallCount: 4
    });
    await page.click('#clog-save');
    await page.waitForTimeout(400);
    assert.ok(posts.length >= 1, 'fall practice should POST');
    const body = posts[0];
    assert.strictEqual(body.baseline_zone, 'fall_practice');
    assert.strictEqual(body.fall_count, 4);
    assert.strictEqual(body.climbing_type, 'Top Rope');
    assert.strictEqual(body.setting, 'indoor');
    assert.strictEqual(body.route_name, 'Practice wall');
    assert.strictEqual(body.coach_activation_score, 6);
    assert.strictEqual(body.zone, 'learning');
  });

  console.log('coach-log-form tests: ok');
}finally{
  server.close();
}
