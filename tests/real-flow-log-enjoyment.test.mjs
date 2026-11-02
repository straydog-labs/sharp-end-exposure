import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, waitForScreen,
  postsTo, USER_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const sql = readFileSync(join(root, 'sql/sessions-enjoyment.sql'), 'utf8');
const coach = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');
const SHOT_DIR = '/opt/cursor/artifacts/screenshots';

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index320'/.test(index));
assert.ok(/APP_VERSION = 'index320'/.test(sw));
assert.ok(/add column if not exists enjoyment smallint/.test(sql));
assert.ok(/drop constraint if exists sessions_enjoyment_check/.test(sql));
assert.ok(/enjoyment is null or enjoyment between 1 and 5/.test(sql));
assert.ok(/id="dq-enjoy-card"/.test(index));
assert.ok(/How did you like it\?/.test(index));
assert.ok(/1 = Not at all/.test(index) && /5 = Loved it/.test(index));
assert.ok(/function selectEnjoyChip\(/.test(index));
assert.ok(/deepAnswers=\{q1:null,q2:null,q3:null,q4:null,q5:null,q6:null,q7:null,enjoy:null\}/.test(index));
assert.ok(/enjoyment: deepAnswers\.enjoy \|\| null/.test(index));
assert.ok(/hasOwnProperty\.call\(p,'enjoyment'\)/.test(index));
assert.ok(/function sessionEnjoymentLabel\(/.test(index));
assert.ok(/'send_notes','enjoyment'\]/.test(index.replace(/\s+/g, '')));
assert.ok(!/enjoyment/.test(coach), 'coach-dashboard must stay untouched');
assert.ok(!/selectEnjoyChip/.test(coach));

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

async function shot(page, name, selector){
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  var dest = join(SHOT_DIR, name);
  await page.setViewportSize({ width: 390, height: 844 });
  if(selector){
    await page.evaluate(function(sel){
      window.scrollTo(0, 0);
      var el = document.querySelector(sel);
      if(!el) return;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      var r = el.getBoundingClientRect();
      if(r.top < 8 || r.top > 500) window.scrollBy(0, r.top - 120);
    }, selector);
  }
  await page.waitForTimeout(80);
  await page.screenshot({ path: dest, animations: 'disabled' });
}

async function bootDeeper(page, extra){
  extra = extra || {};
  await page.waitForFunction(function(){
    return typeof window.startDeeper === 'function'
      && typeof window.afterQ4 === 'function'
      && typeof window.selectEnjoyChip === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(args){
    window._authUser = { id: args.userId };
    window._authToken = 'test-token';
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    logState.sessId = args.sessId || 'sess-enjoy-1';
    logState.grade = '5.11a';
    logState.terrain = 'Overhang';
    logState.zone = 'learning';
    logState.zoneConf = 'estimated';
    startDeeper();
  }, { userId: extra.userId || USER_ID, sessId: extra.sessId });
  await waitForScreen(page, 'screen-deeper');
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();

try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 }
  }, async function(page, recorded){
    await bootDeeper(page);

    var grid = await page.evaluate(function(){
      var cards = Array.from(document.querySelectorAll('#screen-deeper .dq-grid .dq-card'));
      var last = cards[cards.length - 1];
      var btns = Array.from(document.querySelectorAll('#dq-enjoy-card .dq-chip'));
      return {
        n: cards.length,
        lastLabel: last ? last.querySelector('.dq-card-label').textContent : '',
        lastId: last && last.id,
        nBtns: btns.length,
        labels: btns.map(function(b){ return b.textContent.trim(); }),
        ends: (document.querySelector('.dq-enjoy-ends') || {}).textContent || ''
      };
    });
    assert.ok(grid.n >= 5, 'five cards in dq-grid, got ' + grid.n);
    assert.strictEqual(grid.lastId, 'dq-enjoy-card', 'enjoyment card is last in the grid');
    assert.strictEqual(grid.lastLabel, 'How did you like it?');
    assert.deepStrictEqual(grid.labels, ['1', '2', '3', '4', '5']);
    assert.ok(/Not at all/.test(grid.ends) && /Loved it/.test(grid.ends));

    await page.evaluate(function(){
      var card = document.getElementById('dq-enjoy-card');
      var wrap = document.createElement('div');
      wrap.id = 'enjoy-card-shot';
      wrap.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:99999;padding:16px;';
      wrap.appendChild(card.cloneNode(true));
      document.body.appendChild(wrap);
    });
    await shot(page, 'deeper-enjoyment-card.png', '#enjoy-card-shot');
    await page.evaluate(function(){ var el = document.getElementById('enjoy-card-shot'); if(el) el.remove(); });

    await tap(page, '#dq-enjoy-card .dq-chip[data-enjoy="3"]');
    var sel3 = await page.evaluate(function(){
      return {
        enjoy: deepAnswers.enjoy,
        selected: Array.from(document.querySelectorAll('#dq-enjoy-card .dq-chip.selected')).map(function(b){ return b.getAttribute('data-enjoy'); }),
        scores: { breath: deepScores.breath, gut: deepScores.gut, crux: deepScores.crux, body: deepScores.body }
      };
    });
    assert.strictEqual(sel3.enjoy, 3);
    assert.deepStrictEqual(sel3.selected, ['3']);
    assert.strictEqual(sel3.scores.breath, null, 'enjoyment does not set somatic scores');

    await tap(page, '#dq-enjoy-card .dq-chip[data-enjoy="5"]');
    var sel5 = await page.evaluate(function(){
      return {
        enjoy: deepAnswers.enjoy,
        selected: Array.from(document.querySelectorAll('#dq-enjoy-card .dq-chip.selected')).map(function(b){ return b.getAttribute('data-enjoy'); })
      };
    });
    assert.strictEqual(sel5.enjoy, 5, 'change overwrites previous value');
    assert.deepStrictEqual(sel5.selected, ['5']);

    await page.evaluate(function(){
      var card = document.getElementById('dq-enjoy-card');
      var wrap = document.createElement('div');
      wrap.id = 'enjoy-sel-shot';
      wrap.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:99999;padding:16px;';
      wrap.appendChild(card.cloneNode(true));
      document.body.appendChild(wrap);
    });
    await shot(page, 'deeper-enjoyment-selected.png', '#enjoy-sel-shot');
    await page.evaluate(function(){ var el = document.getElementById('enjoy-sel-shot'); if(el) el.remove(); });

    await tap(page, '#dq-enjoy-card .dq-chip[data-enjoy="5"]');
    var cleared = await page.evaluate(function(){
      return {
        enjoy: deepAnswers.enjoy,
        nSel: document.querySelectorAll('#dq-enjoy-card .dq-chip.selected').length
      };
    });
    assert.strictEqual(cleared.enjoy, null, 'tapping selected value clears it');
    assert.strictEqual(cleared.nSel, 0);

    await tap(page, '#dq-enjoy-card .dq-chip[data-enjoy="4"]');
    await tap(page, '#screen-deeper .chip[data-dq="q1"]:has-text("Easy and steady")');
    await tap(page, '#screen-deeper .chip[data-dq="q2"]:has-text("Settled, neutral")');
    await tap(page, '#screen-deeper .chip[data-dq="q3"]:has-text("Yes — I paused")');
    await tap(page, '#screen-deeper .chip[data-dq="q4"]:has-text("Settled and in control")');
    await tap(page, '#deeper-confirm-btn');
    await page.waitForTimeout(400);

    var patches = postsTo(recorded, 'sessions', 'PATCH');
    var confirm = patches.map(function(r){
      var b = r.body;
      if(Array.isArray(b)) b = b[0];
      return b;
    }).find(function(b){
      return b && b.zone_confidence === 'confirmed';
    });
    assert.ok(confirm, 'confirm PATCH missing');
    assert.strictEqual(confirm.breathing_post, 'Easy and steady');
    assert.strictEqual(confirm.gut_post, 'Settled, neutral');
    assert.strictEqual(confirm.crux_response, 'Yes — I paused');
    assert.strictEqual(confirm.body_state, 'Settled and in control');
    assert.strictEqual(confirm.enjoyment, 4, 'enjoyment saved on the same PATCH');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    stub: async function(route, info){
      if(info.method === 'PATCH' && info.url.indexOf('/rest/v1/sessions') !== -1 && info.body && Object.prototype.hasOwnProperty.call(info.body, 'enjoyment')){
        await fulfillJson(route, 400, {
          code: 'PGRST204',
          message: "Could not find the 'enjoyment' column of 'sessions' in the schema cache"
        });
        return true;
      }
      return false;
    }
  }, async function(page, recorded){
    await bootDeeper(page, { sessId: 'sess-enjoy-missing' });
    await tap(page, '#screen-deeper .chip[data-dq="q1"]:has-text("Easy and steady")');
    await tap(page, '#dq-enjoy-card .dq-chip[data-enjoy="4"]');
    await tap(page, '#deeper-confirm-btn');
    await page.waitForTimeout(500);
    var patches = postsTo(recorded, 'sessions', 'PATCH').map(function(r){
      var b = r.body;
      if(Array.isArray(b)) b = b[0];
      return b;
    }).filter(function(b){ return b && b.zone_confidence === 'confirmed'; });
    assert.ok(patches.length >= 2, 'missing column retries, got ' + patches.length);
    assert.ok(Object.prototype.hasOwnProperty.call(patches[0], 'enjoyment'));
    assert.strictEqual(patches[0].breathing_post, 'Easy and steady');
    var retried = patches[patches.length - 1];
    assert.ok(!Object.prototype.hasOwnProperty.call(retried, 'enjoyment'), 'retry strips enjoyment');
    assert.strictEqual(retried.breathing_post, 'Easy and steady', 'other answers still saved');
    assert.strictEqual(retried.zone_confidence, 'confirmed');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 }
  }, async function(page){
    await bootDeeper(page);
    var scores = await page.evaluate(async function(){
      async function run(enjoy){
        startDeeper();
        deepAnswers.q1 = 'Easy and steady';
        deepAnswers.q2 = 'Settled, neutral';
        deepAnswers.q3 = 'Yes — I paused';
        deepAnswers.q4 = 'Settled and in control';
        deepAnswers.enjoy = enjoy;
        deepScores.breath = breathScoreMap[deepAnswers.q1];
        deepScores.gut = gutScoreMap[deepAnswers.q2];
        deepScores.crux = cruxScoreMap[deepAnswers.q3];
        deepScores.body = bodyScoreMap[deepAnswers.q4];
        await afterQ4();
        return { score: window._zcScore, zone: logState.zone, conf: logState.zoneConf };
      }
      var a = await run(null);
      var b = await run(5);
      return { without: a, with: b };
    });
    assert.strictEqual(scores.with.score, scores.without.score, 'activation score unchanged with enjoyment');
    assert.strictEqual(scores.with.zone, scores.without.zone);
    assert.strictEqual(scores.with.conf, scores.without.conf);
    assert.ok(scores.without.score != null);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 }
  }, async function(page, recorded){
    await bootDeeper(page, { sessId: 'sess-enjoy-skip' });
    await tap(page, '#dq-enjoy-card .dq-chip[data-enjoy="4"]');
    await page.evaluate(function(){ logFlowSkipDeeper(); });
    await page.waitForTimeout(200);
    var enjoyPatches = postsTo(recorded, 'sessions', 'PATCH').filter(function(r){
      var b = r.body;
      if(Array.isArray(b)) b = b[0];
      return b && Object.prototype.hasOwnProperty.call(b, 'enjoyment');
    });
    assert.strictEqual(enjoyPatches.length, 0, 'Done for now does not PATCH enjoyment');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 }
  }, async function(page){
    await bootDeeper(page);
    var detail = await page.evaluate(function(){
      var withVal = climbAttemptRowHtml({
        id: 's1',
        route_name: 'Green 30',
        baseline_zone: 'sent',
        zone: 'learning',
        went_well: 'Calm start',
        enjoyment: 4,
        created_at: '2026-11-02T12:00:00.000Z'
      }, { origin: 'route-history', rowIdx: 0, idPrefix: 'shot', showRouteName: true });
      var without = climbAttemptRowHtml({
        id: 's2',
        route_name: 'Green 30',
        baseline_zone: 'sent',
        zone: 'learning',
        went_well: 'Calm start',
        created_at: '2026-11-02T12:00:00.000Z'
      }, { origin: 'route-history', rowIdx: 1, idPrefix: 'shotb', showRouteName: true });
      var overlay = (function(){
        var s = { went_well: 'Calm start', enjoyment: 4, route_name: 'Green 30', grade_value: '5.11a' };
        renderSessionNotesOverlay(s, 's1');
        var html = document.getElementById('notes-preview-overlay').innerHTML;
        document.getElementById('notes-preview-overlay').remove();
        return html;
      })();
      var wrap = document.createElement('div');
      wrap.id = 'enjoy-detail-shot';
      wrap.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:9999;padding:16px;overflow:auto;';
      wrap.innerHTML = withVal;
      var refl = wrap.querySelector('#shot-refl-0');
      if(refl) refl.style.display = 'block';
      document.body.appendChild(wrap);
      return {
        withLabel: /Enjoyment 4\/5/.test(withVal),
        withoutLabel: /Enjoyment/.test(without),
        overlayLabel: /Enjoyment 4\/5/.test(overlay)
      };
    });
    assert.ok(detail.withLabel, 'detail row shows Enjoyment 4/5 when set');
    assert.ok(!detail.withoutLabel, 'detail hides enjoyment when unset');
    assert.ok(detail.overlayLabel, 'notes overlay shows Enjoyment 4/5 when set');
    await shot(page, 'climb-detail-enjoyment.png', '#enjoy-detail-shot');

    var csv = await page.evaluate(async function(){
      window._cachedClimbs = [{
        id: 's1',
        route_name: 'Green 30',
        enjoyment: 4,
        created_at: '2026-11-02T12:00:00.000Z'
      }];
      var captured = '';
      var OrigBlob = window.Blob;
      window.Blob = function(parts, opts){
        captured = parts && parts[0] != null ? String(parts[0]) : '';
        return new OrigBlob(parts, opts);
      };
      var origCreate = document.createElement.bind(document);
      document.createElement = function(tag){
        if(tag === 'a') return { click: function(){}, href: '', download: '' };
        return origCreate(tag);
      };
      var origUrl = URL.createObjectURL;
      URL.createObjectURL = function(){ return 'blob:test'; };
      await exportDataCSV();
      document.createElement = origCreate;
      URL.createObjectURL = origUrl;
      window.Blob = OrigBlob;
      var header = String(captured).split('\n')[0];
      var cols = header.split(',');
      return { last: cols[cols.length - 1], n: cols.length, header: header };
    });
    assert.strictEqual(csv.last, 'enjoyment', 'CSV last column is enjoyment, got ' + csv.header);
    assert.ok(csv.n > 10);
  });

  console.log('real-flow-log-enjoyment: ok');
}finally{
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
