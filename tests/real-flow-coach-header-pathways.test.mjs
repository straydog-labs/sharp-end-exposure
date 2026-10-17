import assert from 'assert';
import { mkdirSync } from 'fs';
import { join } from 'path';
import {
  startStaticServer, launchChromium, withPage, tap,
  COACH_ID, ATHLETE_ID, sessionRow
} from './harness.mjs';

const SHOT_DIR = '/opt/cursor/artifacts/screenshots';

const PLAN_PANES = [
  { title: 'Assignments', pane: 'assignments', section: 'detail-assignments' },
  { title: 'Training Goals', pane: 'goals', section: 'detail-goals' },
  { title: 'Baseline', pane: 'baseline', section: 'detail-baseline' },
  { title: 'Projects', pane: 'projects', section: 'detail-projects' }
];
const NOTES_PANES = [
  { title: 'Session Notes', pane: 'journal', section: 'detail-sessions' },
  { title: "Coach's Notes", pane: 'notes', section: 'detail-coach-notes' }
];

function daysAgo(n){
  return new Date(Date.now() - n * 86400000).toISOString();
}

function fixtureSessions(){
  const sessions = [];
  for(let i = 0; i < 8; i++){
    sessions.push(sessionRow({
      id: 'hdr-' + i,
      user_id: ATHLETE_ID,
      created_at: daysAgo(3 + i),
      climbing_type: i % 2 ? 'Overhang' : 'Vertical',
      zone: i % 3 === 0 ? 'learning' : 'comfort',
      baseline_zone: 'sent',
      grade_value: 'V4',
      is_baseline: false,
      is_checkin: false,
      deleted_at: null
    }));
  }
  return sessions;
}

async function openAthlete(page){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  await tap(page, '.roster-row');
  await page.waitForSelector('#athlete-hub-cards', { timeout: 15000 });
  await page.waitForSelector('#athlete-share-btn', { timeout: 8000 });
}

async function hideStackBar(page){
  await page.evaluate(function(){
    var bar = document.querySelector('.detail-stack-bar');
    if(bar) bar.style.visibility = 'hidden';
  });
}

async function backToLanding(page){
  await page.evaluate(function(){
    var landing = document.getElementById('athlete-landing');
    if(landing && landing.style.display !== 'none') return;
    var stack = document.getElementById('detail-stack-back');
    var back = document.getElementById('athlete-subview-back');
    if(stack && stack.offsetParent){
      stack.click();
      return;
    }
    if(back) back.click();
  });
  await page.waitForFunction(function(){
    var landing = document.getElementById('athlete-landing');
    return !!(landing && landing.style.display !== 'none');
  }, null, { timeout: 8000 });
}

async function shotClip(page, name, selector){
  await hideStackBar(page);
  await page.waitForTimeout(60);
  var box = await page.evaluate(function(sel){
    var el = document.querySelector(sel);
    if(!el) return null;
    var r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(r.left)),
      y: Math.max(0, Math.floor(r.top)),
      width: Math.ceil(r.width),
      height: Math.ceil(r.height)
    };
  }, selector);
  if(box && box.width > 10 && box.height > 10){
    await page.screenshot({ path: join(SHOT_DIR, name), clip: box });
    return;
  }
  await page.screenshot({ path: join(SHOT_DIR, name), fullPage: false });
}

async function shotHeader(page, name){
  await hideStackBar(page);
  await page.waitForTimeout(60);
  var box = await page.evaluate(function(){
    var head = document.querySelector('#athlete-landing .detail-header');
    var row = document.getElementById('athlete-hub-cards');
    var snap = document.querySelector('#athlete-share-block .athlete-share-print-head');
    var nodes = [head, row, snap];
    var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    nodes.forEach(function(el){
      if(!el) return;
      var r = el.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    });
    return {
      x: Math.max(0, Math.floor(left)),
      y: Math.max(0, Math.floor(top)),
      width: Math.ceil(right - left),
      height: Math.ceil(bottom - top)
    };
  });
  if(box && box.width > 10 && box.height > 10){
    await page.screenshot({ path: join(SHOT_DIR, name), clip: box });
    return;
  }
  await page.screenshot({ path: join(SHOT_DIR, name), fullPage: false });
}

function readHeader(){
  var pathBtns = Array.prototype.map.call(
    document.querySelectorAll('#athlete-hub-cards .athlete-path-btn'),
    function(b){ return { path: b.getAttribute('data-path'), on: b.classList.contains('on'), text: b.textContent.trim() }; }
  );
  var subsHost = document.getElementById('athlete-path-subs');
  var visibleSubs = Array.prototype.map.call(
    document.querySelectorAll('#athlete-path-subs [data-pane]'),
    function(b){
      var row = b.closest('[data-path-subs]');
      var hidden = !!(subsHost && subsHost.hidden) || !!(row && row.hidden);
      return {
        pane: b.getAttribute('data-pane'),
        title: (b.querySelector('.te-title') || {}).textContent || '',
        sub: (b.querySelector('.te-sub') || {}).textContent || '',
        hidden: hidden
      };
    }
  );
  var title = document.querySelector('.athlete-snapshot-title');
  var date = document.getElementById('athlete-share-print-date');
  var share = document.getElementById('athlete-share-btn');
  var log = document.getElementById('coach-log-launch');
  var ts = title ? getComputedStyle(title) : null;
  var ds = date ? getComputedStyle(date) : null;
  return {
    paths: pathBtns,
    subs: visibleSubs,
    subsHidden: !!(subsHost && subsHost.hidden),
    titleSize: ts ? parseFloat(ts.fontSize) : 0,
    dateSize: ds ? parseFloat(ds.fontSize) : 0,
    shareText: share ? share.textContent.trim() : '',
    logText: log ? log.textContent.trim() : '',
    logHasDialSub: !!(log && /Drag the dial/.test(log.textContent || ''))
  };
}

function layoutBox(){
  var doc = document.documentElement;
  var panel = document.getElementById('detail-panel');
  var overflow = doc.scrollWidth > doc.clientWidth + 1 ||
    !!(panel && panel.scrollWidth > panel.clientWidth + 1);
  function box(el){
    if(!el) return null;
    var r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }
  function overlap(a, b){
    if(!a || !b) return false;
    return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  }
  var plan = box(document.querySelector('[data-path="plan"]'));
  var notes = box(document.querySelector('[data-path="notes"]'));
  var chat = box(document.querySelector('[data-path="chat"]'));
  var log = box(document.getElementById('coach-log-launch'));
  var share = box(document.getElementById('athlete-share-btn'));
  var title = box(document.querySelector('.athlete-snapshot-title'));
  var minH = Math.min(
    plan ? plan.height : 99,
    notes ? notes.height : 99,
    chat ? chat.height : 99,
    log ? log.height : 99,
    share ? share.height : 99
  );
  return {
    overflow: overflow,
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    overlapPathLog: overlap(plan, log) || overlap(notes, log) || overlap(chat, log),
    overlapPathShare: overlap(plan, share) || overlap(notes, share) || overlap(chat, share),
    overlapLogShare: overlap(log, share),
    shareRightOfTitle: !!(title && share && share.left >= title.right - 1),
    shareSameRow: !!(title && share && title.top < share.bottom && share.top < title.bottom),
    minTap: minH
  };
}

function paneState(sectionId){
  var landing = document.getElementById('athlete-landing');
  var sub = document.getElementById('athlete-subview');
  var section = document.getElementById(sectionId);
  return {
    landingHidden: !!(landing && landing.style.display === 'none'),
    subShown: !!(sub && sub.style.display !== 'none'),
    sectionShown: !!(section && section.style.display !== 'none')
  };
}

async function assertSubs(page, expected){
  const ui = await page.evaluate(readHeader);
  assert.strictEqual(ui.subsHidden, false, 'sub-button row should be visible');
  const shown = ui.subs.filter(function(s){ return !s.hidden; });
  assert.deepStrictEqual(shown.map(function(s){ return s.pane; }), expected.map(function(s){ return s.pane; }));
  expected.forEach(function(exp){
    const hit = shown.find(function(s){ return s.pane === exp.pane; });
    assert.ok(hit, 'missing sub ' + exp.pane);
    assert.strictEqual(hit.title, exp.title);
  });
}

async function openPane(page, path, item){
  const ui = await page.evaluate(readHeader);
  const pathOn = ui.paths.some(function(p){ return p.path === path && p.on; });
  if(!pathOn){
    await tap(page, '[data-path="' + path + '"]');
    await assertSubs(page, path === 'plan' ? PLAN_PANES : NOTES_PANES);
  }
  await tap(page, '#athlete-path-subs [data-pane="' + item.pane + '"]');
  const state = await page.evaluate(paneState, item.section);
  assert.ok(state.landingHidden && state.subShown && state.sectionShown,
    item.pane + ' should open ' + item.section);
  await backToLanding(page);
}

async function runViewport(page, width, takeShots){
  await page.setViewportSize({ width: width, height: 1400 });
  await openAthlete(page);

  var ui = await page.evaluate(readHeader);
  assert.ok(ui.paths.length === 3);
  assert.ok(ui.paths.every(function(p){ return !p.on; }), 'default: no pathway expanded');
  assert.strictEqual(ui.subsHidden, true);
  assert.strictEqual(ui.logText, 'Log a climb');
  assert.strictEqual(ui.logHasDialSub, false);
  assert.strictEqual(ui.shareText, 'Print / Share');
  assert.ok(ui.titleSize >= 20, 'heading font-size ' + ui.titleSize);
  assert.ok(ui.dateSize >= 14, 'export line font-size ' + ui.dateSize);

  var lay = await page.evaluate(layoutBox);
  assert.ok(!lay.overflow, 'horizontal overflow at ' + width + ' sw=' + lay.scrollWidth);
  assert.ok(!lay.overlapPathLog && !lay.overlapPathShare && !lay.overlapLogShare,
    'overlap at ' + width);
  assert.ok(lay.shareRightOfTitle && lay.shareSameRow, 'Print / Share not on snapshot heading row');
  assert.ok(lay.minTap >= 44, 'tap target ' + lay.minTap + ' at ' + width);

  if(takeShots) await shotHeader(page, 'header-default-' + width + '.png');

  await tap(page, '[data-path="plan"]');
  await assertSubs(page, PLAN_PANES);
  ui = await page.evaluate(readHeader);
  assert.ok(ui.paths.some(function(p){ return p.path === 'plan' && p.on; }));
  if(takeShots) await shotHeader(page, 'header-plan-' + width + '.png');
  for(const item of PLAN_PANES){
    await openPane(page, 'plan', item);
  }

  await tap(page, '[data-path="notes"]');
  await assertSubs(page, NOTES_PANES);
  ui = await page.evaluate(readHeader);
  assert.ok(ui.paths.some(function(p){ return p.path === 'notes' && p.on; }));
  if(takeShots) await shotHeader(page, 'header-notes-' + width + '.png');
  for(const item of NOTES_PANES){
    await openPane(page, 'notes', item);
  }

  await tap(page, '[data-path="chat"]');
  const chat = await page.evaluate(paneState, 'detail-chat');
  assert.ok(chat.landingHidden && chat.subShown && chat.sectionShown, 'Chat opens chat pane');
  if(takeShots){
    await hideStackBar(page);
    await shotClip(page, 'header-chat-' + width + '.png', '#athlete-subview');
  }
  await backToLanding(page);

  await tap(page, '#coach-log-launch');
  await page.waitForFunction(function(){
    var el = document.getElementById('coach-log-overlay');
    return !!(el && el.classList.contains('open'));
  }, null, { timeout: 8000 });
  await tap(page, '#clog-back');
  await page.waitForFunction(function(){
    var el = document.getElementById('coach-log-overlay');
    return !!(el && !el.classList.contains('open'));
  }, null, { timeout: 8000 });

  if(takeShots) await shotClip(page, 'header-snapshot-' + width + '.png', '#athlete-share-block .athlete-share-print-head');

  const printed = await page.evaluate(function(){
    var called = false;
    var prev = window.print;
    window.print = function(){ called = true; };
    document.getElementById('athlete-share-btn').click();
    window.print = prev;
    document.body.classList.remove('coach-printing');
    return called;
  });
  assert.ok(printed, 'Print / Share still calls window.print');
}

async function run(){
  mkdirSync(SHOT_DIR, { recursive: true });
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1400 },
      session: {
        access_token: 'test-token',
        user: { id: COACH_ID, email: 'coach@test.local' }
      },
      sessions: fixtureSessions()
    }, async function(page){
      await runViewport(page, 1280, true);
      await page.evaluate(function(){
        var layout = document.querySelector('.coach-layout');
        if(layout) layout.classList.remove('detail-open');
        if(document.body) document.body.style.overflow = '';
      });
      await runViewport(page, 390, true);
    });
    console.log('real-flow-coach-header-pathways: ok');
  }finally{
    await browser.close();
    server.close();
  }
}

run().catch(function(err){
  console.error(err);
  process.exit(1);
});
