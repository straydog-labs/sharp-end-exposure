import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, waitForScreen, USER_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const SHOT_DIR = '/opt/cursor/artifacts/screenshots';

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index323'/.test(index));
assert.ok(/APP_VERSION = 'index323'/.test(sw));
assert.ok(/Math\.max\(max,\s*4\)/.test(index));
assert.ok(!/Math\.max\(0\.06/.test(index.slice(index.indexOf('function buildPsycheRadar'), index.indexOf('function psycheDrillLabel'))));
assert.ok(/filter\(function\(d\)\{\s*return d\.n > 0/.test(index) || /d\.n > 0/.test(index.slice(index.indexOf('function buildPsycheRadar'), index.indexOf('function psycheDrillLabel'))));
assert.ok(/id="home-card-research"/.test(index));
assert.ok(!/id="home-more-hidden"/.test(index));
assert.ok(index.indexOf('id="home-recent-wrap"') < index.indexOf('id="home-card-research"'));
assert.ok(index.indexOf('id="home-streak-band"') < index.indexOf('id="home-card-research"'));
assert.ok(index.indexOf('id="home-today-card"') < index.indexOf('id="home-card-research"'));
assert.ok(index.indexOf('id="home-action-row"') < index.indexOf('id="home-card-research"'));
assert.ok(/The science behind SEE/.test(index));
assert.ok(/showScreen\('screen-research'\)/.test(index.slice(index.indexOf('id="home-card-research"'), index.indexOf('id="home-card-research"') + 400)));
assert.ok(/a\.count > 0/.test(index.slice(index.indexOf('function renderAttemptsTerrainRadarHtml'), index.indexOf('function buildAttemptsByTerrain'))));
assert.ok(!/Math\.max\(max,\s*4\)/.test(index.slice(index.indexOf('function renderAttemptsTerrainRadarHtml'), index.indexOf('function buildAttemptsByTerrain'))));

async function shot(page, name, selector){
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  var dest = join(SHOT_DIR, name);
  await page.setViewportSize({ width: 390, height: 844 });
  if(selector){
    await page.evaluate(function(sel){
      window.scrollTo(0, 0);
      var el = document.querySelector(sel);
      if(!el) return;
      var overlay = document.getElementById('see-shot-overlay');
      if(overlay) overlay.remove();
      overlay = document.createElement('div');
      overlay.id = 'see-shot-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg,#111);z-index:99999;padding:16px;overflow:auto;';
      overlay.appendChild(el.cloneNode(true));
      document.body.appendChild(overlay);
    }, selector);
    await page.waitForTimeout(80);
  }
  await page.screenshot({ path: dest, animations: 'disabled' });
  await page.evaluate(function(){
    var overlay = document.getElementById('see-shot-overlay');
    if(overlay) overlay.remove();
  });
}

function radarInfo(){
  var wrap = document.getElementById('psyche-radar-wrap');
  var svg = wrap && wrap.querySelector('svg');
  var circles = wrap ? Array.prototype.map.call(wrap.querySelectorAll('circle'), function(c){
    return { cx: parseFloat(c.getAttribute('cx')), cy: parseFloat(c.getAttribute('cy')), r: parseFloat(c.getAttribute('r')) };
  }) : [];
  var polys = wrap ? wrap.querySelectorAll('polygon') : [];
  var dataPoly = wrap ? wrap.querySelector('polygon[fill="var(--accent)"]') : null;
  var texts = wrap ? Array.prototype.map.call(wrap.querySelectorAll('text'), function(t){ return t.textContent; }) : [];
  var boxed = true;
  if(wrap){
    Array.prototype.forEach.call(wrap.querySelectorAll('text'), function(t){
      var x = parseFloat(t.getAttribute('x'));
      var y = parseFloat(t.getAttribute('y'));
      if(!(x >= 0 && x <= 340 && y >= 0 && y <= 320)) boxed = false;
    });
  }
  var emptyMsg = wrap ? /Log a practice to see your mix/.test(wrap.textContent || '') : false;
  return {
    circleN: circles.length,
    circles: circles,
    polyN: polys.length,
    hasDataPoly: !!dataPoly,
    texts: texts,
    boxed: boxed,
    emptyMsg: emptyMsg,
    vb: svg ? svg.getAttribute('viewBox') : ''
  };
}

const CX = 170, CY = 158, MAX_R = 62;

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await page.waitForFunction(function(){
      return typeof window.buildPsycheRadar === 'function' && typeof window.showScreen === 'function';
    }, null, { timeout: 30000 });
    await page.evaluate(function(){
      var sk = document.getElementById('route-loading-skeleton');
      if(sk) sk.style.display = 'none';
      var wrap = document.getElementById('psyche-radar-wrap');
      if(wrap && wrap.closest('.insight-card')) wrap.closest('.insight-card').style.display = 'block';
    });

    await page.evaluate(function(){
      buildPsycheRadar({ checkin: 1, breath: 1, exposure: 0, viz: 1, relax: 1, talk: 1, awareness: 2 });
    });
    var mixed = await page.evaluate(radarInfo);
    assert.strictEqual(mixed.texts.length, 7, 'radar shows 7 axes');
    assert.ok(mixed.texts.some(function(t){ return /^Check-in 1$/.test(t); }));
    assert.ok(mixed.texts.some(function(t){ return /^Breath 1$/.test(t); }));
    assert.ok(mixed.texts.some(function(t){ return /^Exposure 0$/.test(t); }));
    assert.ok(mixed.texts.some(function(t){ return /^Visualize 1$/.test(t); }));
    assert.ok(mixed.texts.some(function(t){ return /^Relax 1$/.test(t); }));
    assert.ok(mixed.texts.some(function(t){ return /^Self-talk 1$/.test(t); }));
    assert.ok(mixed.texts.some(function(t){ return /^Awareness 2$/.test(t); }));
    assert.ok(mixed.boxed, 'labels inside viewBox');
    assert.ok(mixed.hasDataPoly, 'non-zero mix draws a polygon');
    assert.strictEqual(mixed.circleN, 6, 'zero-value axes render no marker');
    mixed.circles.forEach(function(c){
      var dist = Math.sqrt(Math.pow(c.cx - CX, 2) + Math.pow(c.cy - CY, 2));
      assert.ok(dist > 4, 'no marker piled at the center, dist=' + dist);
    });

    await page.evaluate(function(){
      buildPsycheRadar({ checkin: 1, breath: 0, exposure: 0, viz: 0, relax: 0, talk: 0, awareness: 0 });
    });
    var one = await page.evaluate(radarInfo);
    assert.strictEqual(one.circleN, 1, 'one non-zero axis draws one marker');
    assert.ok(one.hasDataPoly, 'count-1 still draws a polygon through the center');
    var c = one.circles[0];
    var dist = Math.sqrt(Math.pow(c.cx - CX, 2) + Math.pow(c.cy - CY, 2));
    var expected = MAX_R * 0.25;
    assert.ok(Math.abs(dist - expected) < 1.5, 'count 1 plots at 25% radius, dist=' + dist + ' expected=' + expected);
    await shot(page, 'psyche-radar-count1.png', '#psyche-radar-wrap');

    await page.evaluate(function(){
      buildPsycheRadar({ checkin: 0, breath: 0, exposure: 0, viz: 0, relax: 0, talk: 0, awareness: 0 });
    });
    var empty = await page.evaluate(radarInfo);
    assert.strictEqual(empty.circleN, 0, 'all-zero draws no markers');
    assert.ok(!empty.hasDataPoly, 'all-zero draws no data polygon');
    assert.ok(empty.polyN >= 4, 'all-zero keeps grid rings');
    assert.strictEqual(empty.texts.length, 7, 'all-zero keeps 7 labels');
    assert.ok(empty.emptyMsg, 'all-zero shows empty mix copy');
    await shot(page, 'psyche-radar-all-zero.png', '#psyche-radar-wrap');

    var terrainSrc = await page.evaluate(function(){
      return String(renderAttemptsTerrainRadarHtml);
    });
    assert.ok(/a\.count > 0/.test(terrainSrc), 'terrain radar still skips 0-count markers itself');
    assert.ok(!/Math\.max\(max,\s*4\)/.test(terrainSrc), 'terrain radar scale unchanged');
  });

  async function assertResearchLayout(page, tag){
    await page.evaluate(function(){
      var sk = document.getElementById('route-loading-skeleton');
      if(sk) sk.style.display = 'none';
    });
    await page.locator('#home-card-research').first().scrollIntoViewIfNeeded();
    await page.evaluate(function(){
      var card = document.getElementById('home-card-research');
      var screen = document.getElementById('screen-home');
      var nav = document.querySelector('.footer-nav');
      var navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
      function box(){ return card.getBoundingClientRect(); }
      function fits(){
        var cr = box();
        return cr.top >= navBottom - 1 && cr.bottom <= window.innerHeight + 1;
      }
      var i;
      for(i = 0; i < 8 && !fits(); i++){
        var cr = box();
        var dy = 0;
        if(cr.bottom > window.innerHeight) dy += cr.bottom - window.innerHeight;
        if(cr.top < navBottom) dy -= (navBottom - cr.top);
        if(dy === 0) break;
        if(screen) screen.scrollTop += dy;
        window.scrollBy(0, dy);
      }
    });
    await page.waitForTimeout(80);
    var box = await page.evaluate(function(){
      var card = document.getElementById('home-card-research');
      var footer = document.querySelector('.footer-nav');
      var cr = card.getBoundingClientRect();
      var fr = footer ? footer.getBoundingClientRect() : { top: 0, bottom: 0, left: 0, right: 0 };
      var overlap = !(cr.right <= fr.left || cr.left >= fr.right || cr.bottom <= fr.top || cr.top >= fr.bottom);
      var cs = getComputedStyle(card);
      var overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      return {
        top: cr.top, bottom: cr.bottom, left: cr.left, right: cr.right,
        w: cr.width, h: cr.height, innerH: window.innerHeight, innerW: window.innerWidth,
        overlap: overlap, overflow: overflow,
        bg: cs.backgroundColor, hidden: !!card.hidden,
        display: cs.display, clip: cs.textOverflow
      };
    });
    assert.ok(!box.hidden, tag + ': research card not hidden');
    assert.notStrictEqual(box.display, 'none', tag + ': research card displayed');
    assert.ok(box.h >= 44, tag + ': hit area >= 44px, h=' + box.h);
    assert.ok(box.top >= -1, tag + ': card top in view ' + box.top);
    assert.ok(box.bottom <= box.innerH + 1, tag + ': card bottom in view ' + box.bottom + '/' + box.innerH);
    assert.ok(!box.overlap, tag + ': card overlapped by footer');
    assert.ok(!box.overflow, tag + ': horizontal scroll');
    assert.ok(box.w >= 300, tag + ': full width-ish, w=' + box.w);
  }

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await page.waitForFunction(function(){
      return typeof window.showScreen === 'function' && document.getElementById('home-card-research');
    }, null, { timeout: 30000 });
    await page.evaluate(function(userId){
      window._authUser = { id: userId };
      window._authToken = 'test-token';
      window._seeTestsRunning = true;
      var sk = document.getElementById('route-loading-skeleton');
      if(sk) sk.style.display = 'none';
      showScreen('screen-home');
    }, USER_ID);
    await waitForScreen(page, 'screen-home');

    var order = await page.evaluate(function(){
      var ids = ['home-today-card','home-action-row','home-recent-wrap','home-streak-band','home-card-research'];
      var pos = ids.map(function(id){
        var el = document.getElementById(id);
        if(!el) return -1;
        var all = document.getElementById('screen-home').querySelectorAll('[id]');
        return Array.prototype.indexOf.call(all, el);
      });
      return pos;
    });
    assert.ok(order[4] > order[2], 'research after last-session in DOM');
    assert.ok(order[4] > order[3], 'research after week card in DOM');
    assert.ok(order[4] > order[0], 'research after prompt card in DOM');
    assert.ok(order[4] > order[1], 'research after action row in DOM');

    var filled = await page.evaluate(function(){
      var n = 0;
      var ids = ['home-card-research','home-card-log','home-action-train','home-action-psyche'];
      ids.forEach(function(id){
        var el = document.getElementById(id);
        if(!el) return;
        var cls = el.className || '';
        var bg = getComputedStyle(el).backgroundColor;
        if(/home-action-filled|home-today-start/.test(cls)) n++;
        if(/home-action-filled/.test(cls)) n += 10;
        if(bg === 'rgb(232, 118, 58)' && id === 'home-card-research') n += 100;
      });
      var prompt = document.querySelectorAll('#home-today-card .home-today-start');
      return { n: n, promptFilledClass: prompt.length, researchClass: (document.getElementById('home-card-research') || {}).className || '' };
    });
    assert.ok(!/home-action-filled/.test(filled.researchClass), 'research is not a filled button');
    assert.ok(!/train-energy-card/.test(filled.researchClass), 'research is not an energy card');
    assert.ok(filled.n < 100, 'research is not filled orange');

    var empty = await page.evaluate(function(){
      return {
        home: !!(document.getElementById('screen-home') && document.getElementById('screen-home').classList.contains('active')),
        research: !!(document.getElementById('home-card-research') && !document.getElementById('home-card-research').hidden),
        title: ((document.getElementById('home-card-research') || {}).textContent || ''),
        greeting: !!(document.getElementById('home-greeting')),
        actions: !!(document.getElementById('home-action-row'))
      };
    });
    assert.ok(empty.home && empty.research && empty.greeting && empty.actions, 'empty-state Home still renders');
    assert.ok(/Research/.test(empty.title) && /The science behind SEE/.test(empty.title));

    await assertResearchLayout(page, '390x844');
    await shot(page, 'home-research-card.png', '#home-card-research');

    await page.setViewportSize({ width: 390, height: 667 });
    await assertResearchLayout(page, '390x667');

    await page.setViewportSize({ width: 390, height: 844 });
    var opened = await page.evaluate(function(){
      var overlay = document.getElementById('see-shot-overlay');
      if(overlay) overlay.remove();
      var el = document.getElementById('home-card-research');
      if(!el) return { id: null };
      el.scrollIntoView({ block: 'center' });
      el.click();
      var active = document.querySelector('.screen.active');
      var research = document.getElementById('screen-research');
      var cs = research ? getComputedStyle(research) : null;
      return {
        id: active ? active.id : null,
        display: cs ? cs.display : null,
        hasActive: !!(research && research.classList.contains('active'))
      };
    });
    assert.strictEqual(opened.id, 'screen-research', 'tap opens #screen-research, active=' + opened.id);
    assert.ok(opened.hasActive && opened.display !== 'none', 'screen-research is visible');
  });
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
console.log('real-flow-psyche-radar-home-research: ok');
