import assert from 'assert';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import {
  startStaticServer, launchChromium, withPage, tap, readyDial, waitForScreen,
  postsTo, firstBody, sessionRow, USER_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index312'/.test(index));
assert.ok(/APP_VERSION = 'index312'/.test(sw));
assert.ok(/id="home-today-card"[\s\S]*id="home-action-row"[\s\S]*id="home-projects-wrap"[\s\S]*id="home-streak-band"[\s\S]*id="home-recent-wrap"/.test(index));
assert.ok(/function decideHomePrompt/.test(index));
assert.ok(/function pickHomeDueSoonAssignment/.test(index));
assert.ok(/function launchHomeProjectLog/.test(index));
assert.ok(/function homeWeekSessionLabel/.test(index));
assert.ok(/LOG_WHICH_LOAD_MS/.test(index));
assert.ok(/settleHomeData/.test(index));
assert.ok(!/athlete_goals/.test(index.slice(index.indexOf('function loadHomeGoalsStrip'), index.indexOf('function loadHomeSessionCaches'))));

const SHOT_DIR = '/opt/cursor/artifacts/screenshots';
const P1 = 'climb-power-now';
const P2 = 'climb-yellow-overhang';
const P3 = 'climb-blue-arete';
const NAME1 = 'Power of Now';
const NAME2 = 'Yellow Overhang';
const NAME3 = 'Blue Arete';

function daysAgo(n){
  return new Date(Date.now() - n * 86400000).toISOString();
}
function todayYmd(){
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function project(id, name, grade, terrain, extra){
  return Object.assign({
    id: id, name: name, grade_value: grade, climbing_type: terrain,
    is_project: true, setting: 'indoor', deleted_at: null
  }, extra || {});
}
function signedIn(extra){
  extra = extra || {};
  return Object.assign({
    session: { user: { id: USER_ID }, access_token: 'test-token' }
  }, extra);
}

const THREE_PROJECTS = [
  project(P1, NAME1, '5.12a', 'Overhang'),
  project(P2, NAME2, '5.11a', 'Overhang'),
  project(P3, NAME3, '5.10a', 'Arête')
];
const THREE_SESSIONS = [
  sessionRow({ id: 's-p1', climb_id: P1, route_name: NAME1, grade_value: '5.12a', climbing_type: 'Overhang', zone: 'learning', baseline_zone: 'sent', created_at: daysAgo(0) }),
  sessionRow({ id: 's-p2', climb_id: P2, route_name: NAME2, grade_value: '5.11a', climbing_type: 'Overhang', zone: 'comfort', baseline_zone: 'take', created_at: daysAgo(1) }),
  sessionRow({ id: 's-p3', climb_id: P3, route_name: NAME3, grade_value: '5.10a', climbing_type: 'Arête', zone: 'panic', baseline_zone: 'fall', created_at: daysAgo(2) }),
  sessionRow({ id: 's-check', climb_id: null, route_name: '', is_checkin: true, is_baseline: false, zone: 'learning', created_at: daysAgo(10) })
];
const ASSIGNMENT = {
  id: 'asg-hang-1',
  title: 'Hangboard density',
  due_date: todayYmd(),
  completed_at: null,
  deleted_at: null,
  athlete_id: USER_ID,
  training_focus: 'Hangboard'
};

async function waitHomeReady(page){
  await page.waitForFunction(function(){
    var home = document.getElementById('screen-home');
    return !!(home && home.classList.contains('active') && window._homeDataReady === true && window._homeLoadsFinished === true);
  }, null, { timeout: 30000 });
}

async function waitHomeVisible(page){
  await page.waitForFunction(function(){
    var home = document.getElementById('screen-home');
    var log = document.getElementById('home-card-log');
    return !!(home && home.classList.contains('active') && log && typeof startLogFlow === 'function');
  }, null, { timeout: 30000 });
}

async function waitPicker(page){
  await waitForScreen(page, 'screen-log-which');
  await page.waitForFunction(function(){
    var load = document.getElementById('log-which-loading');
    var loadingOn = !!(load && !load.hidden);
    var root = document.getElementById('log-my-projects');
    return !loadingOn && !!(root && !root.hidden && root.querySelector('[data-cid]'));
  }, null, { timeout: 8000 });
}

async function homeSnapshot(page){
  return page.evaluate(function(){
    function vis(id){
      var el = document.getElementById(id);
      if(!el) return { missing: true };
      var r = el.getBoundingClientRect();
      return { hidden: !!el.hidden, top: r.top, text: (el.textContent || '').replace(/\s+/g, ' ').trim() };
    }
    var compact = document.getElementById('home-compact');
    var kids = compact ? Array.prototype.map.call(compact.children, function(el){
      return { id: el.id, hidden: !!el.hidden };
    }) : [];
    var card = document.getElementById('home-today-card');
    return {
      ready: window._homeDataReady === true,
      finished: window._homeLoadsFinished === true,
      failOpen: window._homeSettledViaTimeout === true,
      state: card ? (card.dataset.state || '') : '',
      cta: card ? (card.dataset.cta || '') : '',
      greeting: vis('home-greeting'),
      today: vis('home-today-card'),
      startHidden: !!(document.getElementById('home-today-start') || {}).hidden,
      logHidden: !!(document.getElementById('home-today-log-attempt') || {}).hidden,
      logClimbHidden: !!(document.getElementById('home-today-log-climb') || {}).hidden,
      starHidden: !!(document.getElementById('home-today-star') || {}).hidden,
      action: vis('home-action-row'),
      logLinkHidden: !!(document.getElementById('home-card-log') || {}).hidden,
      trainLinkHidden: !!(document.getElementById('home-action-train') || {}).hidden,
      welcome: vis('home-welcome-hint'),
      projects: vis('home-projects-wrap'),
      week: vis('home-streak-band'),
      recent: vis('home-recent-wrap'),
      due: vis('home-due-wrap'),
      goals: vis('home-goals-strip'),
      chips: Array.prototype.map.call(document.querySelectorAll('#home-projects-strip [data-cid]'), function(b){
        var r = b.getBoundingClientRect();
        return {
          cid: b.getAttribute('data-cid'),
          text: (b.textContent || '').replace(/\s+/g, ' ').trim(),
          current: b.getAttribute('aria-current') === 'true',
          h: r.height,
          w: r.width,
          sw: b.scrollWidth,
          cw: b.clientWidth
        };
      }),
      recents: Array.prototype.map.call(document.querySelectorAll('#home-recent-list .home-recent-row'), function(b){
        return { sid: b.getAttribute('data-sid'), text: (b.textContent || '').replace(/\s+/g, ' ').trim() };
      }),
      recentLabel: vis('home-recent-label'),
      overflow: (function(){
        function box(el){
          if(!el) return null;
          return { sw: el.scrollWidth, cw: el.clientWidth };
        }
        return {
          wrap: box(document.getElementById('home-projects-wrap')),
          strip: box(document.getElementById('home-projects-strip')),
          compact: box(document.getElementById('home-compact')),
          content: box(document.querySelector('#screen-home .content'))
        };
      })(),
      kids: kids,
      logClass: (document.getElementById('home-card-log') || {}).className || '',
      trainClass: (document.getElementById('home-action-train') || {}).className || '',
      filled: (function(){
        var n = 0;
        ['home-today-start','home-today-log-attempt','home-today-log-climb','home-today-star','home-today-psyche'].forEach(function(id){
          var el = document.getElementById(id);
          if(el && !el.hidden) n++;
        });
        var log = document.getElementById('home-card-log');
        var train = document.getElementById('home-action-train');
        if(log && !log.hidden && /home-action-filled/.test(log.className || '')) n++;
        if(train && !train.hidden && /home-action-filled/.test(train.className || '')) n++;
        return n;
      })(),
      checklist: (document.getElementById('home-today-checklist') || {}).innerHTML || '',
      weekDots: (document.getElementById('home-week-dots') || {}).innerHTML || '',
      hasProjectFlag: window._climbCacheHasProject === true,
      kicker: vis('home-today-kicker').text,
      title: vis('home-today-title').text,
      meta: vis('home-today-meta').text,
      starText: ((document.getElementById('home-today-star') || {}).textContent || '').trim(),
      stripLabel: vis('home-projects-label').text,
      hit: (function(){
        function h(id){
          var el = document.getElementById(id);
          if(!el || el.hidden) return null;
          return el.getBoundingClientRect().height;
        }
        var log = document.getElementById('home-card-log');
        var train = document.getElementById('home-action-train');
        var gap = null;
        if(log && train && !log.hidden && !train.hidden
          && /home-action-link/.test(log.className || '') && !/home-action-filled/.test(log.className || '')
          && /home-action-link/.test(train.className || '') && !/home-action-filled/.test(train.className || '')){
          var a = log.getBoundingClientRect();
          var b = train.getBoundingClientRect();
          gap = Math.round(b.left - a.right);
        }
        return { log: h('home-card-log'), train: h('home-action-train'), dismiss: h('home-today-dismiss'), gap: gap };
      })()
    };
  });
}

function wordsOf(s){
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(function(w){ return w.length > 2; });
}
function assertNoRepeatWords(snap, extraAllow, skipTitleMeta){
  extraAllow = extraAllow || [];
  var allow = { next: true };
  extraAllow.forEach(function(w){ allow[w] = true; });
  var groups = [
    ['kicker', snap.kicker, 'title', snap.title],
    ['kicker', snap.kicker, 'meta', snap.meta]
  ];
  if(!skipTitleMeta) groups.push(['title', snap.title, 'meta', snap.meta]);
  groups.forEach(function(g){
    var a = wordsOf(g[1]);
    var b = wordsOf(g[3]);
    a.forEach(function(w){
      if(allow[w]) return;
      assert.ok(b.indexOf(w) === -1, 'repeat "' + w + '" in ' + g[0] + '/' + g[2] + ': ' + g[1] + ' | ' + g[3]);
    });
  });
}
function assertMyProjects(snap, opts){
  opts = opts || {};
  if(opts.hidden){
    assert.strictEqual(snap.projects.hidden, true, 'MY PROJECTS hidden');
    return;
  }
  assert.strictEqual(snap.projects.hidden, false, 'MY PROJECTS visible');
  assert.ok(/^My projects$/i.test(String(snap.stripLabel || '').trim()), 'label is My projects, got ' + snap.stripLabel);
  assert.ok(!/Other projects/i.test(snap.stripLabel || ''), snap.stripLabel);
  if(opts.include){
    opts.include.forEach(function(id){
      assert.ok(snap.chips.some(function(c){ return c.cid === id; }), 'missing project ' + id);
    });
  }
  if(opts.current){
    var cur = snap.chips.filter(function(c){ return c.current; });
    assert.strictEqual(cur.length, 1, 'exactly one outlined target, got ' + cur.length);
    assert.strictEqual(cur[0].cid, opts.current, 'outlined cid ' + (cur[0] && cur[0].cid));
  } else if(opts.current === null){
    assert.ok(snap.chips.every(function(c){ return !c.current; }), 'no outlined row');
  }
  if(opts.max != null){
    assert.ok(snap.chips.length <= opts.max, 'at most ' + opts.max + ' rows, got ' + snap.chips.length);
  }
}
function assertProjectsFit(snap){
  if(snap.projects.hidden) return;
  function fit(box, name){
    if(!box) return;
    assert.ok(box.sw <= box.cw + 1, name + ' overflow sw=' + box.sw + ' cw=' + box.cw);
  }
  fit(snap.overflow.wrap, 'projects wrap');
  fit(snap.overflow.strip, 'projects strip');
  fit(snap.overflow.compact, 'home compact');
  fit(snap.overflow.content, 'home content');
  snap.chips.forEach(function(c){
    assert.ok(c.sw <= c.cw + 1, 'row ' + c.cid + ' overflow sw=' + c.sw + ' cw=' + c.cw);
    assert.ok(c.h >= 44, 'row min-height ' + c.h);
    if(snap.overflow.strip){
      assert.ok(c.w >= snap.overflow.strip.cw - 2, 'row not full width w=' + c.w + ' strip=' + snap.overflow.strip.cw);
    }
  });
}
function assertLastSession(snap, present){
  if(present){
    assert.strictEqual(snap.recent.hidden, false, 'last-session row visible');
    assert.ok(snap.recentLabel && !snap.recentLabel.hidden, 'LAST SESSION label visible');
    assert.ok(/Last session/i.test(snap.recentLabel.text || ''), 'LAST SESSION label text: ' + (snap.recentLabel && snap.recentLabel.text));
  } else {
    assert.ok(!snap.recentLabel || snap.recentLabel.hidden || snap.recent.hidden, 'LAST SESSION hidden with the row');
  }
}
function assertQuietHit(snap){
  if(snap.hit.train != null && !/home-action-filled/.test(snap.trainClass)){
    assert.ok(snap.hit.train >= 44, 'Start training hit ' + snap.hit.train);
  }
  if(snap.hit.log != null && /home-action-link/.test(snap.logClass) && !/home-action-filled/.test(snap.logClass)){
    assert.ok(snap.hit.log >= 44, 'Log a climb quiet hit ' + snap.hit.log);
  }
  if(snap.hit.dismiss != null){
    assert.ok(snap.hit.dismiss >= 44, 'Not now hit ' + snap.hit.dismiss);
  }
  if(snap.hit.gap != null){
    assert.ok(snap.hit.gap >= 12, 'quiet link gap ' + snap.hit.gap);
  }
}

async function clipCheck(page){
  return page.evaluate(function(){
    var label = document.getElementById('home-streak-label');
    var band = document.getElementById('home-streak-band');
    if(!label || !band || band.hidden) return { ok: false, reason: 'week hidden' };
    var text = label.textContent || '';
    if(!text) return { ok: false, reason: 'empty label' };
    var node = label.firstChild;
    if(!node || node.nodeType !== 3) {
      var r = label.getBoundingClientRect();
      return { ok: r.width > 8 && text.charAt(0) !== '', text: text, labelLeft: r.left, reason: 'no text node' };
    }
    var range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 1);
    var charRect = range.getBoundingClientRect();
    var labelRect = label.getBoundingClientRect();
    var bandRect = band.getBoundingClientRect();
    var ok = charRect.width > 0
      && charRect.left + 0.5 >= bandRect.left
      && charRect.left + 0.5 >= labelRect.left
      && text.charAt(0) !== '';
    return {
      ok: ok,
      text: text,
      charLeft: charRect.left,
      charWidth: charRect.width,
      labelLeft: labelRect.left,
      bandLeft: bandRect.left
    };
  });
}

async function finishLockedAttempt(page, recorded){
  await waitForScreen(page, 'screen-log-act');
  await page.waitForTimeout(100);
  await readyDial(page);
  await tap(page, '#log-act-continue');
  await waitForScreen(page, 'screen-log-result');
  await tap(page, '#btn-sent');
  await tap(page, '#log-result-continue');
  await page.waitForTimeout(700);
  return postsTo(recorded, 'sessions', 'POST');
}

async function shot(page, name, width){
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  var dest = join(SHOT_DIR, name);
  var tmpDir = '/tmp/home-shots';
  if(!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  var tmp = join(tmpDir, name);
  await page.setViewportSize({ width: width, height: 900 });
  await page.waitForTimeout(80);
  var lastErr = null;
  var i;
  for(i = 0; i < 3; i++){
    try{
      await page.screenshot({ path: tmp, fullPage: true });
      copyFileSync(tmp, dest);
      lastErr = null;
      break;
    }catch(e){
      lastErr = e;
      await page.waitForTimeout(120);
    }
  }
  if(lastErr) throw lastErr;
}

function restGets(recorded){
  return recorded.filter(function(r){
    return r.method === 'GET' && r.url.indexOf('/rest/v1/') !== -1;
  });
}
function tableGets(recorded, table){
  return restGets(recorded).filter(function(r){
    return r.url.indexOf('/rest/v1/' + table) !== -1;
  });
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  var failed = [];
  async function flow(name, fn){
    try{
      await fn();
      console.log('ok - ' + name);
    }catch(e){
      failed.push(name + ': ' + (e && e.message ? e.message : e));
      console.error('not ok - ' + name + ' ' + (e && e.stack ? e.stack : e));
    }
  }

  try{
    await flow('s0-fail-open-no-checklist', async function(){
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: [],
        stub: async function(route, info){
          if(info.method === 'GET' && (
            info.url.indexOf('/rest/v1/climbs') !== -1
            || info.url.indexOf('/rest/v1/sessions') !== -1
            || info.url.indexOf('/rest/v1/assignments') !== -1
            || info.url.indexOf('/rest/v1/training_sessions') !== -1
            || info.url.indexOf('/rest/v1/psyche_drills') !== -1
          )){
            await new Promise(function(){});
            return true;
          }
          return false;
        }
      }), async function(page){
        await waitHomeVisible(page);
        await page.waitForFunction(function(){
          return window._homeDataReady === true && window._homeSettledViaTimeout === true;
        }, null, { timeout: 8000 });
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's0', 'fail-open must be S0, got ' + snap.state);
        assert.strictEqual(snap.today.hidden, true, 'S0 hides the prompt');
        assert.strictEqual(snap.projects.hidden, true);
        assert.strictEqual(snap.welcome.hidden, true);
        assert.strictEqual(snap.logLinkHidden, false, 'S0 keeps Log a climb');
        assert.strictEqual(snap.trainLinkHidden, false, 'S0 keeps quiet Start training');
        assert.ok(/home-action-filled/.test(snap.logClass), 'S0 filled Log a climb, got ' + snap.logClass);
        assert.ok(/home-action-link/.test(snap.trainClass) && !/home-action-filled/.test(snap.trainClass), 'S0 Start training quiet');
        assert.strictEqual(snap.filled, 1, 'S0 exactly one filled, got ' + snap.filled);
        assertQuietHit(snap);
        await shot(page, 'home_v3_s0_failopen_390.png', 390);
      });
    });

    await flow('s1-checklist-0-of-3', async function(){
      await withPage(browser, port, signedIn({
        climbs: [],
        sessions: [],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's1', 'empty user is checklist, got ' + snap.state);
        assert.ok(/Get started/.test(snap.today.text), snap.today.text);
        assert.ok(/0 of 3/.test(snap.today.text), snap.today.text);
        assert.strictEqual(snap.logClimbHidden, false);
        assert.strictEqual(snap.projects.hidden, true);
        assert.strictEqual(snap.recent.hidden, true);
        assert.strictEqual(snap.welcome.hidden, true);
        assert.strictEqual(snap.week.hidden, true, 'F3 week hidden at count 0');
        assertMyProjects(snap, { hidden: true });
        assertLastSession(snap, false);
        assertNoRepeatWords(snap);
        assertQuietHit(snap);
        assert.strictEqual(snap.filled, 1, 'S1 0 of 3 exactly one filled, got ' + snap.filled);
        await shot(page, 'home_v3_s1_0of3_390.png', 390);
      });
    });

    await flow('s1-checklist-1-of-3', async function(){
      await withPage(browser, port, signedIn({
        climbs: [{ id: P1, name: NAME1, grade_value: '5.12a', climbing_type: 'Overhang', is_project: false, deleted_at: null }],
        sessions: [sessionRow({
          id: 's-first', climb_id: P1, route_name: NAME1, grade_value: '5.12a',
          climbing_type: 'Overhang', created_at: daysAgo(0)
        })],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's1', 'first climb stays on checklist, got ' + snap.state);
        assert.ok(/1 of 3/.test(snap.today.text), snap.today.text);
        assert.strictEqual(snap.starHidden, false, 'next item is Star');
        assert.ok(/^Star Power of Now/.test(snap.starText), 'F4 Star names target, got ' + snap.starText);
        assertNoRepeatWords(snap);
        assertQuietHit(snap);
        assert.strictEqual(snap.filled, 1, 'S1 1 of 3 exactly one filled, got ' + snap.filled);
        await shot(page, 'home_v3_s1_1of3_390.png', 390);
      });
    });

    await flow('s2-assignment-due', async function(){
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: [ASSIGNMENT]
      }), async function(page, recorded){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's2', 'due-soon assignment is S2, got ' + snap.state);
        assert.ok(/Up next: Hangboard density/.test(snap.today.text), snap.today.text);
        assert.strictEqual(snap.startHidden, false);
        assert.strictEqual(snap.logHidden, true);
        assert.strictEqual(snap.trainLinkHidden, true, 'Start training hides when prompt is Start');
        assert.strictEqual(snap.logLinkHidden, false, 'quiet Log a climb stays');
        assert.strictEqual(snap.projects.hidden, false);
        assert.strictEqual(snap.chips.length, 3);
        assertMyProjects(snap, { include: [P1, P2, P3], current: null, max: 3 });
        assert.strictEqual(snap.kicker, 'TODAY');
        assert.ok(/Hangboard/.test(snap.meta) && !/Due today/.test(snap.meta), 'F5 TODAY meta type only: ' + snap.meta);
        assertNoRepeatWords(snap, ['today'], true);
        assertQuietHit(snap);
        assertProjectsFit(snap);
        assertLastSession(snap, true);
        assert.strictEqual(snap.recents.length, 1, 'last session is one row, got ' + snap.recents.length);
        assert.ok(/session/.test(snap.week.text), snap.week.text);
        assert.strictEqual(snap.filled, 1, 'S2 exactly one filled, got ' + snap.filled);
        assert.ok(/home-week-dot/.test(snap.weekDots), 'week dots painted');
        await shot(page, 'home_v3_s2_assignment_390.png', 390);
        await shot(page, 'home_v3_s2_assignment_840.png', 840);
        assert.strictEqual(tableGets(recorded, 'sessions').length, 1);
        assert.strictEqual(tableGets(recorded, 'athlete_goals').length, 0);
      });
    });

    await flow('s3-stale-project', async function(){
      await withPage(browser, port, signedIn({
        climbs: [
          project(P2, NAME2, '5.11a', 'Overhang', { created_at: daysAgo(8), updated_at: daysAgo(8) }),
          project(P1, NAME1, '5.12a', 'Overhang', { created_at: daysAgo(20), updated_at: daysAgo(20) })
        ],
        sessions: [
          sessionRow({
            id: 's-old', climb_id: P1, route_name: NAME1, grade_value: '5.12a',
            climbing_type: 'Overhang', created_at: daysAgo(20)
          }),
          sessionRow({
            id: 's-mid', climb_id: P2, route_name: NAME2, grade_value: '5.11a',
            climbing_type: 'Overhang', created_at: daysAgo(8)
          }),
          sessionRow({ id: 's-check', is_checkin: true, is_baseline: false, climb_id: null, route_name: '', created_at: daysAgo(10) })
        ],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's3', 'stale project is S3, got ' + snap.state);
        assert.ok(/Revisit/.test(snap.today.text) && /Power of Now/.test(snap.today.text), 'oldest stale not projects[0]: ' + snap.today.text);
        assert.strictEqual(snap.kicker, 'PROJECT');
        assert.ok(/attempt/.test(snap.meta) && /, last /.test(snap.meta), 'F5 S3 meta: ' + snap.meta);
        assert.strictEqual(snap.week.hidden, true, 'F3 week hidden at 0 for S3');
        assertMyProjects(snap, { include: [P1, P2], current: P1, max: 3 });
        assert.strictEqual(snap.logHidden, false);
        assertNoRepeatWords(snap);
        assertProjectsFit(snap);
        assert.strictEqual(snap.filled, 1, 'S3 exactly one filled, got ' + snap.filled);
        assert.strictEqual(snap.hasProjectFlag, true);
        await shot(page, 'home_v3_s3_stale_390.png', 390);
        await shot(page, 'home_v3_s3_stale_840.png', 840);
      });
    });

    await flow('s4-star-last-climb', async function(){
      await withPage(browser, port, signedIn({
        climbs: [
          { id: P1, name: NAME1, grade_value: '5.12a', climbing_type: 'Overhang', is_project: false, deleted_at: null },
          { id: P2, name: NAME2, grade_value: '5.11a', climbing_type: 'Overhang', is_project: false, deleted_at: null }
        ],
        sessions: [
          sessionRow({ id: 's-a', climb_id: P1, route_name: NAME1, grade_value: '5.12a', climbing_type: 'Overhang', created_at: daysAgo(0) }),
          sessionRow({ id: 's-b', climb_id: P2, route_name: NAME2, grade_value: '5.11a', climbing_type: 'Overhang', created_at: daysAgo(1) })
        ],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        await page.evaluate(function(uid){
          localStorage.setItem('see_home_v3_checklist_dismissed_' + uid, '1');
          paintHomePrimaryCard();
        }, USER_ID);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's4', 'two non-project climbs is S4, got ' + snap.state + ' ' + snap.today.text);
        assert.strictEqual(snap.title, NAME1, 'S4 title is climb name, got ' + snap.title);
        assert.ok(/^Star Power of Now/.test(snap.starText), 'F4 S4 CTA names target: ' + snap.starText);
        assert.strictEqual(snap.starHidden, false);
        assertNoRepeatWords(snap);
        assertQuietHit(snap);
        assert.strictEqual(snap.kicker, 'PROJECT');
        assertMyProjects(snap, { hidden: true });
        assertLastSession(snap, true);
        assert.strictEqual(snap.filled, 1, 'S4 exactly one filled, got ' + snap.filled);
        await shot(page, 'home_v3_s4_star_390.png', 390);
        await shot(page, 'home_v3_s4_star_840.png', 840);
      });
    });

    await flow('s5-nothing-this-week', async function(){
      await withPage(browser, port, signedIn({
        climbs: [project(P1, NAME1, '5.12a', 'Overhang', { created_at: daysAgo(3), updated_at: daysAgo(3) })],
        sessions: [],
        assignments: [],
        trainingSessions: [{ id: 'tr-old', created_at: daysAgo(10), deleted_at: null }]
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's5', 'fresh unused project + empty week is S5, got ' + snap.state);
        assert.ok(/Nothing logged this week/.test(snap.today.text), snap.today.text);
        assert.ok(/Next: Power of Now · 5\.12a/.test(snap.meta), 'F2 S5 meta names target: ' + snap.meta);
        assert.strictEqual(snap.kicker, 'PROJECT');
        assert.strictEqual(snap.logHidden, false);
        assert.strictEqual(snap.week.hidden, true, 'F3 week hidden at 0 for S5');
        assertMyProjects(snap, { include: [P1], current: P1, max: 3 });
        assertLastSession(snap, false);
        assertNoRepeatWords(snap);
        assertProjectsFit(snap);
        assert.strictEqual(snap.filled, 1, 'S5 exactly one filled, got ' + snap.filled);
        await shot(page, 'home_v3_s5_none_week_390.png', 390);
        await shot(page, 'home_v3_s5_none_week_840.png', 840);
      });
    });

    await flow('s6-climb-default', async function(){
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: []
      }), async function(page, recorded){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's6-climb', 'active projects are S6 climb, got ' + snap.state);
        assert.ok(/Next: Power of Now/.test(snap.today.text), snap.today.text);
        assert.strictEqual(snap.kicker, 'PROJECT');
        assertMyProjects(snap, { include: [P1, P2, P3], current: P1, max: 3 });
        assert.strictEqual(snap.startHidden, true);
        assert.strictEqual(snap.logHidden, false);
        assertNoRepeatWords(snap);
        assertProjectsFit(snap);
        assertLastSession(snap, true);
        assert.strictEqual(snap.filled, 1, 'S6 climb exactly one filled, got ' + snap.filled);
        await shot(page, 'home_v3_s6_climb_390.png', 390);
        await shot(page, 'home_v3_s6_climb_840.png', 840);
        await tap(page, '#home-today-log-attempt');
        var posts = await finishLockedAttempt(page, recorded);
        assert.ok(posts.length, 'Log attempt did not POST sessions');
        var body = firstBody(posts);
        assert.strictEqual(body.climb_id, P1);
        assert.strictEqual(body.route_name, NAME1);
      });
    });

    await flow('s6-training-default', async function(){
      await withPage(browser, port, signedIn({
        climbs: [],
        sessions: [],
        assignments: [],
        trainingSessions: [{ id: 'tr-1', created_at: daysAgo(0), deleted_at: null }]
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's6-train', 'training-only week is S6 train, got ' + snap.state);
        assert.ok(/Keep training/.test(snap.today.text), snap.today.text);
        assert.strictEqual(snap.kicker, 'SESSION');
        assert.strictEqual(snap.startHidden, false);
        assert.strictEqual(snap.trainLinkHidden, true);
        assertNoRepeatWords(snap);
        assert.strictEqual(snap.filled, 1, 'S6 train exactly one filled, got ' + snap.filled);
        await shot(page, 'home_v3_s6_train_390.png', 390);
      });
    });

    await flow('c-strip-row-tap-saves-that-climb-id', async function(){
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: []
      }), async function(page, recorded){
        await waitHomeReady(page);
        var chip = page.locator('#home-projects-strip [data-cid="' + P2 + '"]');
        assert.ok(await chip.count(), 'Yellow Overhang row missing');
        await tap(page, '#home-projects-strip [data-cid="' + P2 + '"]');
        var posts = await finishLockedAttempt(page, recorded);
        assert.ok(posts.length, 'strip tap did not POST sessions');
        var body = firstBody(posts);
        assert.strictEqual(body.climb_id, P2);
        assert.strictEqual(body.route_name, NAME2);
      });
    });

    await flow('e-clipped-text-regression', async function(){
      await withPage(browser, port, signedIn({
        climbs: [project(P1, NAME1, '5.12a', 'Overhang')],
        sessions: [sessionRow({
          id: 's-one', climb_id: P1, route_name: NAME1, grade_value: '5.12a',
          climbing_type: 'Overhang', zone: 'learning', created_at: new Date().toISOString()
        })],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        await page.setViewportSize({ width: 390, height: 844 });
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.week.hidden, false, 'week shows when there is a session');
        var label = await page.evaluate(function(){
          var el = document.getElementById('home-streak-label');
          return el ? String(el.textContent || '').trim() : '';
        });
        assert.strictEqual(label, '1 session this week');
        var clip = await clipCheck(page);
        assert.ok(clip.ok, 'first character of week label clipped: ' + JSON.stringify(clip));
        assert.strictEqual(clip.text.charAt(0), '1');
      });
    });

    await flow('f-unloaded-cache-does-not-flash-empty', async function(){
      var delayMs = 900;
      var sawEmpty = false;
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: [],
        stub: async function(route, info){
          if(info.method === 'GET' && (info.url.indexOf('/rest/v1/climbs') !== -1 || info.url.indexOf('/rest/v1/sessions') !== -1)){
            await new Promise(function(resolve){ setTimeout(resolve, delayMs); });
          }
          return false;
        }
      }), async function(page){
        await page.waitForFunction(function(){
          var home = document.getElementById('screen-home');
          return !!(home && home.classList.contains('active') && typeof loadHomeScreen === 'function');
        }, null, { timeout: 30000 });
        var deadline = Date.now() + 700;
        while(Date.now() < deadline){
          var mid = await page.evaluate(function(){
            var welcome = document.getElementById('home-welcome-hint');
            var projects = document.getElementById('home-projects-wrap');
            var today = document.getElementById('home-today-card');
            return {
              ready: window._homeDataReady === true,
              welcomeOn: !!(welcome && !welcome.hidden),
              projectsOn: !!(projects && !projects.hidden),
              todayOn: !!(today && !today.hidden),
              state: today ? (today.dataset.state || '') : '',
              climbCache: window._climbCache,
              sessCache: window._cachedClimbs
            };
          });
          if(mid.welcomeOn && !mid.projectsOn && !mid.todayOn && !mid.ready){
            sawEmpty = true;
            break;
          }
          if(!mid.ready && (mid.state === 's1' || (mid.todayOn && /Get started/.test((document.getElementById('home-today-card') || {}).textContent || '')))){
            sawEmpty = true;
            break;
          }
          if(Array.isArray(mid.climbCache) && !mid.ready && mid.welcomeOn){
            sawEmpty = true;
            break;
          }
          await page.waitForTimeout(80);
        }
        assert.strictEqual(sawEmpty, false, 'unloaded caches must not paint checklist or empty welcome');
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.projects.hidden, false, 'projects appear after load');
        assert.strictEqual(snap.today.hidden, false, 'prompt appears after load');
        assert.notStrictEqual(snap.state, 's0');
        assert.notStrictEqual(snap.state, 's1');
      });
    });

    await flow('g-boot-request-count-each-once', async function(){
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: []
      }), async function(page, recorded){
        await waitHomeReady(page);
        var sess = tableGets(recorded, 'sessions');
        var climbs = tableGets(recorded, 'climbs');
        var goals = tableGets(recorded, 'athlete_goals');
        var homeTables = ['profiles', 'assignments', 'sessions', 'training_sessions', 'psyche_drills', 'climbs', 'athlete_goals'];
        var homeGets = restGets(recorded).filter(function(r){
          return homeTables.some(function(t){ return r.url.indexOf('/rest/v1/' + t) !== -1; });
        });
        var counts = {};
        homeGets.forEach(function(r){ counts[r.url] = (counts[r.url] || 0) + 1; });
        var dupes = Object.keys(counts).filter(function(u){ return counts[u] > 1; });
        assert.strictEqual(sess.length, 1, 'sessions GET once, got ' + sess.length);
        assert.ok(climbs.length === 1, 'climbs GET once, got ' + climbs.length);
        assert.strictEqual(goals.length, 0, 'no athlete_goals');
        assert.deepStrictEqual(dupes, [], 'each Home data URL once, dupes=' + JSON.stringify(dupes));
      });
    });

    await flow('h-log-a-climb-while-home-loads-shows-picker', async function(){
      var delayMs = 1200;
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: [],
        stub: async function(route, info){
          if(info.method === 'GET' && (info.url.indexOf('/rest/v1/climbs') !== -1 || info.url.indexOf('/rest/v1/sessions') !== -1)){
            await new Promise(function(resolve){ setTimeout(resolve, delayMs); });
          }
          return false;
        }
      }), async function(page){
        await waitHomeVisible(page);
        var mid = await page.evaluate(function(){
          return {
            ready: window._homeDataReady === true,
            climbCache: window._climbCache,
            cachedClimbs: window._cachedClimbs
          };
        });
        assert.ok(mid.ready !== true, 'must tap before Home settles, ready=' + mid.ready);
        assert.ok(!Array.isArray(mid.climbCache), 'climb cache still in flight at tap, got ' + JSON.stringify(mid.climbCache));
        await tap(page, '#home-card-log');
        var immediate = await page.evaluate(function(){
          var el = document.querySelector('.screen.active');
          return el ? el.id : null;
        });
        assert.notStrictEqual(immediate, 'screen-log-act',
          'must not skip to the dial while Home caches are still loading, got ' + immediate);
        await waitPicker(page);
        var ids = await page.evaluate(function(){
          var root = document.getElementById('log-my-projects');
          if(!root || root.hidden) return [];
          return Array.prototype.map.call(root.querySelectorAll('[data-cid]'), function(btn){
            return btn.getAttribute('data-cid');
          });
        });
        assert.ok(ids.indexOf(P1) !== -1 && ids.indexOf(P2) !== -1,
          'in-flight Home Log a climb must still list projects, got ' + JSON.stringify(ids));
      });
    });

    await flow('g0-sessions-http-error-is-s0-not-empty', async function(){
      await withPage(browser, port, signedIn({
        climbs: [],
        sessions: [],
        assignments: [],
        stub: async function(route, info){
          if(info.method === 'GET' && info.url.indexOf('/rest/v1/sessions') !== -1){
            await route.fulfill({ status: 500, contentType: 'application/json', body: '[]' });
            return true;
          }
          return false;
        }
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's0', 'sbS error is fail-open S0, not loaded-empty S1, got ' + snap.state);
        assert.strictEqual(snap.today.hidden, true);
        assert.ok(/home-action-filled/.test(snap.logClass));
        assert.strictEqual(snap.filled, 1);
      });
    });

    await flow('s1-baseline-only-not-checklist', async function(){
      await withPage(browser, port, signedIn({
        climbs: [],
        sessions: [sessionRow({
          id: 's-base', is_baseline: true, is_checkin: true, climb_id: null, route_name: '',
          created_at: daysAgo(1)
        })],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.notStrictEqual(snap.state, 's1', 'baseline-only must not get S1, got ' + snap.state);
      });
    });

    await flow('s1-b-locked-unnamed', async function(){
      await withPage(browser, port, signedIn({
        climbs: [{ id: P1, name: 'Climb 7', grade_value: '5.12a', climbing_type: 'Overhang', is_project: false, deleted_at: null }],
        sessions: [sessionRow({
          id: 's-unnamed', climb_id: P1, route_name: 'Climb 7', grade_value: '5.12a',
          climbing_type: 'Overhang', created_at: daysAgo(0)
        })],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's1', snap.state);
        assert.ok(/1 of 3/.test(snap.today.text), snap.today.text);
        assert.strictEqual(snap.starHidden, true, 'B locked: Star CTA hidden');
        assert.ok(/is-locked/.test(snap.checklist), 'Star checklist item locked');
        assert.strictEqual(snap.filled, 1);
      });
    });

    await flow('s1-c-flips-after-checkin-no-reload', async function(){
      await withPage(browser, port, signedIn({
        climbs: [],
        sessions: [],
        assignments: []
      }), async function(page, recorded){
        await waitHomeReady(page);
        var before = tableGets(recorded, 'sessions').length;
        await page.evaluate(function(){
          noteHomeSessionRow({
            id: 's-live-check', is_checkin: true, is_baseline: false, deleted_at: null,
            created_at: new Date().toISOString(), zone: 'learning'
          });
        });
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's1', snap.state);
        assert.ok(/1 of 3/.test(snap.today.text), 'C flips without reload: ' + snap.today.text);
        assert.ok(/is-done/.test(snap.checklist) && /First Psyche/.test(snap.checklist), snap.checklist);
        assert.strictEqual(tableGets(recorded, 'sessions').length, before, 'no extra sessions GET');
      });
    });

    await flow('s1-dismiss-key-scoped-by-uid', async function(){
      await withPage(browser, port, signedIn({
        climbs: [],
        sessions: [],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        await page.evaluate(function(){
          localStorage.setItem('see_home_v3_checklist_dismissed_other-user', '1');
          paintHomePrimaryCard();
        });
        var still = await homeSnapshot(page);
        assert.strictEqual(still.state, 's1', 'other uid dismiss must not hide S1');
        await page.evaluate(function(uid){
          localStorage.setItem('see_home_v3_checklist_dismissed_' + uid, '1');
          paintHomePrimaryCard();
        }, USER_ID);
        var gone = await homeSnapshot(page);
        assert.notStrictEqual(gone.state, 's1', 'own uid dismiss hides S1, got ' + gone.state);
      });
    });

    await flow('s2-undated-not-s2', async function(){
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: [{ id: 'asg-u', title: 'Undated hang', due_date: null, completed_at: null, athlete_id: USER_ID, training_focus: 'Hangboard' }]
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.notStrictEqual(snap.state, 's2', 'undated assignment is not S2, got ' + snap.state);
        assert.strictEqual(snap.state, 's6-assign', 'undated with week activity is S6, got ' + snap.state);
        assert.ok(/Up next: Undated hang/.test(snap.title), snap.title);
        assert.strictEqual(snap.kicker, 'UP NEXT');
        assert.strictEqual(snap.startHidden, false);
        assert.strictEqual(snap.filled, 1);
        assertMyProjects(snap, { include: [P1], current: null, max: 3 });
        await shot(page, 'home_v3_s6_undated_390.png', 390);
        await shot(page, 'home_v3_s6_undated_840.png', 840);
      });
    });

    await flow('s5-undated-assignment', async function(){
      await withPage(browser, port, signedIn({
        climbs: [project(P1, NAME1, '5.12a', 'Overhang', { created_at: daysAgo(3), updated_at: daysAgo(3) })],
        sessions: [],
        assignments: [{ id: 'asg-u', title: 'Undated hang', due_date: null, completed_at: null, athlete_id: USER_ID, training_focus: 'Hangboard' }],
        trainingSessions: [{ id: 'tr-old', created_at: daysAgo(10), deleted_at: null }]
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's5', 'undated also shows at S5, got ' + snap.state);
        assert.ok(/Up next: Undated hang/.test(snap.title), snap.title);
        assert.strictEqual(snap.startHidden, false);
        assert.strictEqual(snap.week.hidden, true);
        assert.strictEqual(snap.filled, 1);
        assertMyProjects(snap, { include: [P1], current: null, max: 3 });
      });
    });

    await flow('f8-undated-never-above-s3', async function(){
      await withPage(browser, port, signedIn({
        climbs: [project(P1, NAME1, '5.12a', 'Overhang', { created_at: daysAgo(20), updated_at: daysAgo(20) })],
        sessions: [
          sessionRow({ id: 's-old', climb_id: P1, route_name: NAME1, grade_value: '5.12a', climbing_type: 'Overhang', created_at: daysAgo(20) }),
          sessionRow({ id: 's-check', is_checkin: true, is_baseline: false, climb_id: null, route_name: '', created_at: daysAgo(10) })
        ],
        assignments: [{ id: 'asg-u', title: 'Undated hang', due_date: null, completed_at: null, athlete_id: USER_ID }]
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's3', 'undated must not outrank S3, got ' + snap.state);
      });
    });

    await flow('f8-undated-never-above-s4', async function(){
      await withPage(browser, port, signedIn({
        climbs: [
          { id: P1, name: NAME1, grade_value: '5.12a', climbing_type: 'Overhang', is_project: false, deleted_at: null }
        ],
        sessions: [sessionRow({ id: 's-a', climb_id: P1, route_name: NAME1, grade_value: '5.12a', climbing_type: 'Overhang', created_at: daysAgo(0) })],
        assignments: [{ id: 'asg-u', title: 'Undated hang', due_date: null, completed_at: null, athlete_id: USER_ID }]
      }), async function(page){
        await waitHomeReady(page);
        await page.evaluate(function(uid){
          localStorage.setItem('see_home_v3_checklist_dismissed_' + uid, '1');
          paintHomePrimaryCard();
        }, USER_ID);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's4', 'undated must not outrank S4, got ' + snap.state);
      });
    });

    await flow('f6-zero-attempts-added', async function(){
      await withPage(browser, port, signedIn({
        climbs: [
          project(P1, NAME1, '5.12a', 'Overhang'),
          project(P2, NAME2, '5.11a', 'Overhang'),
          project('climb-fresh', 'Fresh Set', '5.9', 'Slab', { created_at: daysAgo(4), updated_at: daysAgo(4) })
        ],
        sessions: [
          THREE_SESSIONS[0],
          THREE_SESSIONS[1],
          THREE_SESSIONS[3]
        ],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's6-climb', snap.state);
        var fresh = snap.chips.filter(function(c){ return c.cid === 'climb-fresh'; })[0];
        assert.ok(fresh, 'unused project stays in My projects when in top 3');
        assert.ok(/0 attempts · added /.test(fresh.text), 'F6 added not last: ' + fresh.text);
        assert.ok(!/ last /.test(fresh.text.replace('added', '')), fresh.text);
      });
    });

    await flow('g1-one-project-shows-outlined', async function(){
      await withPage(browser, port, signedIn({
        climbs: [project(P1, NAME1, '5.12a', 'Overhang')],
        sessions: [sessionRow({
          id: 's-one', climb_id: P1, route_name: NAME1, grade_value: '5.12a',
          climbing_type: 'Overhang', zone: 'learning', created_at: daysAgo(0)
        })],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        await page.evaluate(function(uid){
          localStorage.setItem('see_home_v3_checklist_dismissed_' + uid, '1');
          paintHomePrimaryCard();
        }, USER_ID);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's6-climb', 'one project with a session is S6, got ' + snap.state);
        assert.strictEqual(snap.kicker, 'PROJECT');
        assertMyProjects(snap, { include: [P1], current: P1, max: 3 });
        assert.strictEqual(snap.chips.length, 1);
        assertNoRepeatWords(snap);
        assertProjectsFit(snap);
        assert.strictEqual(snap.filled, 1);
        await shot(page, 'home_v3_g1_one_project_390.png', 390);
        await shot(page, 'home_v3_g1_one_project_840.png', 840);
      });
    });

    await flow('g1-stale-target-replaces-third', async function(){
      await withPage(browser, port, signedIn({
        climbs: [
          project('r1', 'Recent One', '5.10a', 'Slab', { created_at: daysAgo(1), updated_at: daysAgo(1) }),
          project('r2', 'Recent Two', '5.10b', 'Slab', { created_at: daysAgo(2), updated_at: daysAgo(2) }),
          project('r3', 'Recent Three', '5.10c', 'Slab', { created_at: daysAgo(3), updated_at: daysAgo(3) }),
          project(P1, NAME1, '5.12a', 'Overhang', { created_at: daysAgo(20), updated_at: daysAgo(20) })
        ],
        sessions: [
          sessionRow({ id: 's-r1', climb_id: 'r1', route_name: 'Recent One', grade_value: '5.10a', created_at: daysAgo(1) }),
          sessionRow({ id: 's-r2', climb_id: 'r2', route_name: 'Recent Two', grade_value: '5.10b', created_at: daysAgo(2) }),
          sessionRow({ id: 's-r3', climb_id: 'r3', route_name: 'Recent Three', grade_value: '5.10c', created_at: daysAgo(3) }),
          sessionRow({ id: 's-old', climb_id: P1, route_name: NAME1, grade_value: '5.12a', climbing_type: 'Overhang', created_at: daysAgo(20) }),
          sessionRow({ id: 's-check', is_checkin: true, is_baseline: false, climb_id: null, route_name: '', created_at: daysAgo(10) })
        ],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's3', 'oldest stale is S3 even with 3 newer projects, got ' + snap.state);
        assert.strictEqual(snap.kicker, 'PROJECT');
        assertMyProjects(snap, { include: [P1], current: P1, max: 3 });
        assert.strictEqual(snap.chips.length, 3);
        assert.ok(snap.chips.some(function(c){ return c.cid === 'r1'; }));
        assert.ok(snap.chips.some(function(c){ return c.cid === 'r2'; }));
        assert.ok(!snap.chips.some(function(c){ return c.cid === 'r3'; }), '3rd recency row is replaced by the target');
        assertNoRepeatWords(snap);
        assert.strictEqual(snap.filled, 1);
      });
    });

    await flow('g6-overflow-long-names', async function(){
      var LONG = 'The Supercalifragilistic Extreme Arete Project Name That Must Wrap Then Ellipsis';
      await withPage(browser, port, signedIn({
        climbs: [
          project('orange-tower', 'orange tower center', '5.13a', 'Overhang'),
          project('ankles', 'Ankles away', '5.12b', 'Overhang'),
          project('long-arete', LONG, '5.11d', 'Arête')
        ],
        sessions: [
          sessionRow({ id: 's-ot', climb_id: 'orange-tower', route_name: 'orange tower center', grade_value: '5.13a', zone: 'panic', baseline_zone: 'fall', created_at: daysAgo(0) }),
          sessionRow({ id: 's-ak', climb_id: 'ankles', route_name: 'Ankles away', grade_value: '5.12b', created_at: daysAgo(1) }),
          sessionRow({ id: 's-ln', climb_id: 'long-arete', route_name: LONG, grade_value: '5.11d', created_at: daysAgo(2) })
        ],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        await page.evaluate(function(uid){
          localStorage.setItem('see_home_v3_checklist_dismissed_' + uid, '1');
          paintHomePrimaryCard();
        }, USER_ID);
        var widths = [360, 390, 840];
        var w, snap;
        for(w = 0; w < widths.length; w++){
          await page.setViewportSize({ width: widths[w], height: 900 });
          await page.waitForTimeout(80);
          snap = await homeSnapshot(page);
          assert.strictEqual(snap.state, 's6-climb', 'width ' + widths[w] + ' state ' + snap.state);
          assertMyProjects(snap, { include: ['orange-tower', 'ankles', 'long-arete'], current: 'orange-tower', max: 3 });
          assertProjectsFit(snap);
          assertLastSession(snap, true);
          assert.strictEqual(snap.filled, 1);
          await shot(page, 'home_v3_g6_long_' + widths[w] + '.png', widths[w]);
        }
        await tap(page, '#home-projects-strip [data-cid="long-arete"]');
        await waitForScreen(page, 'screen-log-act');
      });
    });

    await flow('s2-far-future-not-s2', async function(){
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: [{ id: 'asg-far', title: 'Far EMOM', due_date: '2099-01-01', completed_at: null, athlete_id: USER_ID }]
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.notStrictEqual(snap.state, 's2', 'far-future is not S2, got ' + snap.state);
      });
    });

    await flow('s3-skip-when-lastAt-not-session-and-window-full', async function(){
      var padded = [];
      var i;
      for(i = 0; i < 80; i++){
        padded.push(sessionRow({
          id: 's-pad-' + i, climb_id: P2, route_name: NAME2, created_at: daysAgo(1)
        }));
      }
      await withPage(browser, port, signedIn({
        climbs: [project(P1, NAME1, '5.12a', 'Overhang', { created_at: daysAgo(20), updated_at: daysAgo(20) })],
        sessions: padded.concat([
          sessionRow({ id: 's-check', is_checkin: true, is_baseline: false, climb_id: null, route_name: '', created_at: daysAgo(10) })
        ]),
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.notStrictEqual(snap.state, 's3', 'saturated window without session lastAt must skip S3, got ' + snap.state);
      });
    });

    await flow('s4-one-dismiss-ends-all-star-never-posts-climb', async function(){
      await withPage(browser, port, signedIn({
        climbs: [
          { id: P1, name: NAME1, grade_value: '5.12a', climbing_type: 'Overhang', is_project: false, deleted_at: null },
          { id: P2, name: NAME2, grade_value: '5.11a', climbing_type: 'Overhang', is_project: false, deleted_at: null }
        ],
        sessions: [
          sessionRow({ id: 's-a', climb_id: P1, route_name: NAME1, grade_value: '5.12a', climbing_type: 'Overhang', created_at: daysAgo(0) }),
          sessionRow({ id: 's-b', climb_id: P2, route_name: NAME2, grade_value: '5.11a', climbing_type: 'Overhang', created_at: daysAgo(1) })
        ],
        assignments: []
      }), async function(page, recorded){
        await waitHomeReady(page);
        await page.evaluate(function(uid){
          localStorage.setItem('see_home_v3_checklist_dismissed_' + uid, '1');
          paintHomePrimaryCard();
        }, USER_ID);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's4', snap.state);
        var gets = restGets(recorded).length;
        await tap(page, '#home-today-dismiss');
        var after = await homeSnapshot(page);
        assert.notStrictEqual(after.state, 's4', 'global star off ends S4, got ' + after.state);
        var localStorageHasStarOff = await page.evaluate(function(uid){
          return localStorage.getItem('see_home_v3_star_off_' + uid) === '1';
        }, USER_ID);
        assert.ok(localStorageHasStarOff, 'see_home_v3_star_off_<uid> set');
        assert.strictEqual(restGets(recorded).length, gets, 'dismiss repaints with zero GETs');
        assert.strictEqual(postsTo(recorded, 'climbs', 'POST').length, 0, 'star path never POSTs climbs');
      });
    });

    await flow('repaint-from-caches-after-star-and-refocus', async function(){
      await withPage(browser, port, signedIn({
        climbs: [
          { id: P1, name: NAME1, grade_value: '5.12a', climbing_type: 'Overhang', is_project: false, deleted_at: null }
        ],
        sessions: [sessionRow({
          id: 's-first', climb_id: P1, route_name: NAME1, grade_value: '5.12a',
          climbing_type: 'Overhang', created_at: daysAgo(0)
        })],
        assignments: []
      }), async function(page, recorded){
        await waitHomeReady(page);
        await page.evaluate(function(uid){
          localStorage.setItem('see_home_v3_checklist_dismissed_' + uid, '1');
          paintHomePrimaryCard();
        }, USER_ID);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.state, 's4', snap.state);
        await tap(page, '#home-today-star');
        await page.waitForTimeout(200);
        assert.strictEqual(postsTo(recorded, 'climbs', 'POST').length, 0, 'star never creates a climb row');
        assert.ok(postsTo(recorded, 'climbs', 'PATCH').length >= 1, 'star PATCHes existing climb');
        assert.strictEqual(tableGets(recorded, 'sessions').length, 1);
        var gets = restGets(recorded).length;
        await page.evaluate(function(){ showScreen('screen-home'); });
        await page.waitForTimeout(80);
        assert.strictEqual(restGets(recorded).length, gets, 'same-user Home refocus is zero extra GETs, before=' + gets + ' after=' + restGets(recorded).length);
        await page.evaluate(function(){ showScreen('screen-train-start'); });
        await page.evaluate(function(){ showScreen('screen-home'); });
        await page.waitForTimeout(80);
        assert.strictEqual(tableGets(recorded, 'sessions').length, 1, 'Home refocus after Train does not GET sessions again');
        assert.strictEqual(tableGets(recorded, 'climbs').length, 1, 'Home refocus after Train does not GET climbs again');
      });
    });

    await flow('tap-known-climb-is-1-new-climb-picker-is-2', async function(){
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        await tap(page, '#home-today-log-attempt');
        await waitForScreen(page, 'screen-log-act');
        await page.evaluate(function(){ showScreen('screen-home'); });
        await waitHomeReady(page);
        await tap(page, '#home-card-log');
        await waitPicker(page);
        await tap(page, '#log-my-projects [data-cid="' + P2 + '"]');
        await waitForScreen(page, 'screen-log-act');
      });
    });
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }

  if(failed.length){
    console.error('failed:\n' + failed.join('\n'));
    process.exit(1);
  }
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
