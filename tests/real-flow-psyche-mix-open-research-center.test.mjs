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
const coach = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');
const SHOT_DIR = '/opt/cursor/artifacts/screenshots';

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index329'/.test(index));
assert.ok(/APP_VERSION = 'index329'/.test(sw));
assert.ok(/function paintPsycheStatsOpen\(/.test(index));
assert.ok(/id==='screen-drill'\)\{ paintPsycheStatsOpen\(\); loadDrillRouteOptions\(\); loadPsycheLog\(\); \}/.test(index));
assert.ok(/id="psyche-stats-toggle-label">Hide practice mix</.test(index));
assert.ok(/id="psyche-stats-toggle-arrow"[^>]*>↑</.test(index));
assert.ok(/id="psyche-log-stats" class="hub-collapse-body" style="display:block;"/.test(index));
assert.ok(/Hide practice mix/.test(index) && /Practice mix/.test(index));
assert.ok(!/localStorage/.test(index.slice(index.indexOf('function paintPsycheStatsOpen'), index.indexOf('function togglePsycheStatsSection'))));
assert.ok(!/localStorage/.test(index.slice(index.indexOf('function togglePsycheStatsSection'), index.indexOf('function playCelebrateMoment'))));
assert.ok(/#home-card-research\{[^}]*flex-direction:column/.test(index));
assert.ok(/#home-card-research\{[^}]*align-items:center/.test(index));
assert.ok(/#home-card-research\{[^}]*text-align:center/.test(index));
assert.ok(!/paintPsycheStatsOpen/.test(coach));
assert.ok(!/home-card-research/.test(coach));

async function shot(page, name, selector){
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  var dest = join(SHOT_DIR, name);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(function(sel){
    if(!sel) return;
    var el = document.querySelector(sel);
    if(el) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, selector || null);
  await page.waitForTimeout(50);
  await page.screenshot({ path: dest, animations: 'allow' });
}

function boot(page){
  return page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

function mixState(){
  var body = document.getElementById('psyche-log-stats');
  var wrap = document.getElementById('psyche-radar-wrap');
  var label = document.getElementById('psyche-stats-toggle-label');
  var arrow = document.getElementById('psyche-stats-toggle-arrow');
  var selected = document.querySelector('#psyche-radar-range .psyche-range-chip.selected');
  var cs = body ? getComputedStyle(body) : null;
  var wrapCs = wrap ? getComputedStyle(wrap) : null;
  var br = wrap ? wrap.getBoundingClientRect() : { width: 0, height: 0 };
  var persist = [];
  try{
    for(var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i) || '';
      if(/psyche|practice.?mix|stats/i.test(k)) persist.push(k);
    }
  }catch(e){}
  return {
    display: body ? body.style.display : null,
    computed: cs ? cs.display : null,
    label: label ? label.textContent : null,
    arrow: arrow ? arrow.textContent : null,
    selected: selected ? selected.textContent.trim() : null,
    days: typeof _psycheRadarDays === 'number' ? _psycheRadarDays : null,
    wrapH: br.height,
    wrapDisplay: wrapCs ? wrapCs.display : null,
    hasSvg: !!(wrap && wrap.querySelector('svg')),
    persist: persist
  };
}

async function waitMixPainted(page){
  await page.waitForFunction(function(){
    var wrap = document.getElementById('psyche-radar-wrap');
    var body = document.getElementById('psyche-log-stats');
    if(!wrap || !body) return false;
    var open = body.style.display !== 'none' && getComputedStyle(body).display !== 'none';
    var br = wrap.getBoundingClientRect();
    return open && !!(wrap.querySelector('svg') || /Log a practice/.test(wrap.textContent || '')) && br.height > 40;
  }, null, { timeout: 15000 });
}

async function assertResearchLayout(page, tag){
  await page.evaluate(function(){
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  });
  var loc = page.locator('#home-card-research').first();
  await loc.scrollIntoViewIfNeeded();
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
    var title = card.querySelector('.te-title');
    var sub = card.querySelector('.te-sub');
    var icon = card.querySelector('.te-icon');
    var footer = document.querySelector('.footer-nav');
    var cr = card.getBoundingClientRect();
    var tr = title.getBoundingClientRect();
    var sr = sub.getBoundingClientRect();
    var ir = icon ? icon.getBoundingClientRect() : { top: 0, bottom: 0 };
    var fr = footer ? footer.getBoundingClientRect() : { top: 0, bottom: 0, left: 0, right: 0 };
    var overlap = !(cr.right <= fr.left || cr.left >= fr.right || cr.bottom <= fr.top || cr.top >= fr.bottom);
    var cs = getComputedStyle(card);
    var tcs = getComputedStyle(title);
    var scs = getComputedStyle(sub);
    var cardCx = cr.left + cr.width / 2;
    return {
      top: cr.top, bottom: cr.bottom, left: cr.left, right: cr.right,
      w: cr.width, h: cr.height, innerH: window.innerHeight, innerW: window.innerWidth,
      overlap: overlap,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      hidden: !!card.hidden,
      display: cs.display,
      bg: cs.backgroundColor,
      cls: card.className || '',
      titleDx: (tr.left + tr.width / 2) - cardCx,
      subDx: (sr.left + sr.width / 2) - cardCx,
      iconAbove: ir.bottom <= tr.top + 1,
      titleClip: tcs.textOverflow === 'ellipsis' || title.scrollWidth > title.clientWidth + 1,
      subClip: scs.textOverflow === 'ellipsis' || sub.scrollWidth > sub.clientWidth + 1,
      title: title.textContent,
      sub: sub.textContent
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
  assert.ok(Math.abs(box.titleDx) <= 2, tag + ': title center dx=' + box.titleDx);
  assert.ok(Math.abs(box.subDx) <= 2, tag + ': sub center dx=' + box.subDx);
  assert.ok(box.iconAbove, tag + ': icon above title');
  assert.ok(!box.titleClip, tag + ': title clipped');
  assert.ok(!box.subClip, tag + ': sub clipped');
  assert.strictEqual(box.title, 'Research');
  assert.strictEqual(box.sub, 'The science behind SEE');
  assert.ok(/hub-compact-row/.test(box.cls), tag + ': stays outlined compact row');
  assert.ok(!/home-action-filled/.test(box.cls), tag + ': research is not filled');
  return box;
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await page.waitForFunction(function(){
      return typeof window.showScreen === 'function' && typeof window.togglePsycheStatsSection === 'function';
    }, null, { timeout: 30000 });
    await boot(page);
    await page.evaluate(function(){ showScreen('screen-drill'); });
    await waitForScreen(page, 'screen-drill');
    await waitMixPainted(page);

    var open = await page.evaluate(mixState);
    assert.strictEqual(open.display, 'block', 'mix open on hub load, display=' + open.display);
    assert.notStrictEqual(open.computed, 'none', 'mix computed visible');
    assert.strictEqual(open.label, 'Hide practice mix');
    assert.strictEqual(open.arrow, '↑');
    assert.ok(open.hasSvg && open.wrapH > 40, 'radar visible with no tap, h=' + open.wrapH);
    assert.strictEqual(open.selected, '30 days');
    assert.strictEqual(open.days, 30);
    assert.deepStrictEqual(open.persist, [], 'collapsed state is not persisted');

    await page.evaluate(function(){
      document.getElementById('psyche-stats-toggle').click();
    });
    await page.waitForTimeout(50);
    var closed = await page.evaluate(mixState);
    assert.strictEqual(closed.display, 'none', 'toggle collapses mix');
    assert.strictEqual(closed.computed, 'none');
    assert.strictEqual(closed.label, 'Practice mix');
    assert.strictEqual(closed.arrow, '↓');
    assert.deepStrictEqual(closed.persist, [], 'collapse is not written to localStorage');

    await page.evaluate(function(){
      document.getElementById('psyche-stats-toggle').click();
    });
    await waitMixPainted(page);
    var again = await page.evaluate(mixState);
    assert.strictEqual(again.display, 'block', 'toggle expands mix again');
    assert.strictEqual(again.label, 'Hide practice mix');
    assert.strictEqual(again.arrow, '↑');
    assert.ok(again.hasSvg, 'radar svg present after re-expand');
    assert.ok(again.wrapH > 40, 'radar visible after re-expand, h=' + again.wrapH);
    assert.strictEqual(again.selected, '30 days');
    await shot(page, 'psyche-mix-open.png', '#psyche-stats-section');

    await page.evaluate(function(){
      document.getElementById('psyche-stats-toggle').click();
    });
    var leftClosed = await page.evaluate(mixState);
    assert.strictEqual(leftClosed.display, 'none');
    await shot(page, 'psyche-mix-collapsed.png', '#psyche-stats-section');
    await page.evaluate(function(){ showScreen('screen-home'); });
    await waitForScreen(page, 'screen-home');
    await page.evaluate(function(){ showScreen('screen-drill'); });
    await waitForScreen(page, 'screen-drill');
    await waitMixPainted(page);
    var reopened = await page.evaluate(mixState);
    assert.strictEqual(reopened.display, 'block', 'hub reopen expands mix again');
    assert.strictEqual(reopened.label, 'Hide practice mix');
    assert.strictEqual(reopened.arrow, '↑');
    assert.strictEqual(reopened.selected, '30 days');
    assert.deepStrictEqual(reopened.persist, []);
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await page.waitForFunction(function(){
      return typeof window.showScreen === 'function' && document.getElementById('home-card-research');
    }, null, { timeout: 30000 });
    await boot(page);
    await page.evaluate(function(){ showScreen('screen-home'); });
    await waitForScreen(page, 'screen-home');
    await page.waitForFunction(function(){
      var card = document.getElementById('home-today-card');
      var hint = document.getElementById('home-welcome-hint');
      return (card && !card.hidden) || (hint && !hint.hidden);
    }, null, { timeout: 10000 });

    var filled = await page.evaluate(function(){
      var orange = 0;
      var research = document.getElementById('home-card-research');
      var researchBg = research ? getComputedStyle(research).backgroundColor : '';
      if(researchBg === 'rgb(232, 118, 58)') orange++;
      var visibleFilled = [];
      Array.prototype.forEach.call(document.querySelectorAll('#screen-home button'), function(el){
        if(el.hidden || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden') return;
        var cls = el.className || '';
        var bg = getComputedStyle(el).backgroundColor;
        var isFilled = /home-action-filled|home-today-start/.test(cls) || bg === 'rgb(232, 118, 58)';
        if(isFilled) visibleFilled.push({ id: el.id, cls: cls, bg: bg });
      });
      return {
        orange: orange,
        visibleFilled: visibleFilled,
        researchClass: (research || {}).className || '',
        researchBg: researchBg
      };
    });
    assert.ok(!/home-action-filled/.test(filled.researchClass), 'research is not a filled button');
    assert.ok(!/home-today-start/.test(filled.researchClass), 'research is not the prompt fill class');
    assert.strictEqual(filled.orange, 0, 'research is not filled orange');
    assert.ok(filled.visibleFilled.every(function(b){
      return b.id !== 'home-card-research' && (/home-today-start/.test(b.cls) || /home-action-filled/.test(b.cls));
    }), 'only prompt-style buttons are filled: ' + JSON.stringify(filled.visibleFilled));
    assert.ok(filled.visibleFilled.length <= 1, 'at most one filled prompt, n=' + filled.visibleFilled.length);

    await assertResearchLayout(page, '390x844');
    await shot(page, 'home-research-centered.png', '#home-card-research');

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
console.log('real-flow-psyche-mix-open-research-center: ok');
