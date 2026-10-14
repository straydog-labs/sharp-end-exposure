import assert from 'assert';
import { existsSync, mkdirSync } from 'fs';
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
assert.ok(/var app_version = 'index308'/.test(index));
assert.ok(/APP_VERSION = 'index308'/.test(sw));
assert.ok(/id="home-today-card"[\s\S]*id="home-action-row"[\s\S]*id="home-projects-wrap"[\s\S]*id="home-streak-band"[\s\S]*id="home-recent-wrap"/.test(index));
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
function project(id, name, grade, terrain){
  return { id: id, name: name, grade_value: grade, climbing_type: terrain, is_project: true, setting: 'indoor', deleted_at: null };
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
  sessionRow({ id: 's-p3', climb_id: P3, route_name: NAME3, grade_value: '5.10a', climbing_type: 'Arête', zone: 'panic', baseline_zone: 'fall', created_at: daysAgo(2) })
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
    return !!(home && home.classList.contains('active') && window._homeDataReady === true);
  }, null, { timeout: 30000 });
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
    return {
      ready: window._homeDataReady === true,
      greeting: vis('home-greeting'),
      today: vis('home-today-card'),
      startHidden: !!(document.getElementById('home-today-start') || {}).hidden,
      logHidden: !!(document.getElementById('home-today-log-attempt') || {}).hidden,
      action: vis('home-action-row'),
      welcome: vis('home-welcome-hint'),
      projects: vis('home-projects-wrap'),
      week: vis('home-streak-band'),
      recent: vis('home-recent-wrap'),
      due: vis('home-due-wrap'),
      goals: vis('home-goals-strip'),
      chips: Array.prototype.map.call(document.querySelectorAll('#home-projects-strip .home-project-chip'), function(b){
        return { cid: b.getAttribute('data-cid'), text: (b.textContent || '').replace(/\s+/g, ' ').trim() };
      }),
      recents: Array.prototype.map.call(document.querySelectorAll('#home-recent-list .home-recent-row'), function(b){
        return { sid: b.getAttribute('data-sid'), text: (b.textContent || '').replace(/\s+/g, ' ').trim() };
      }),
      kids: kids
    };
  });
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
  await page.setViewportSize({ width: width, height: 900 });
  await page.waitForTimeout(80);
  await page.screenshot({ path: dest, fullPage: true });
}

function restGets(recorded){
  return recorded.filter(function(r){
    return r.method === 'GET' && r.url.indexOf('/rest/v1/') !== -1;
  });
}
function tableGets(recorded, table){
  return restGets(recorded).filter(function(r){
    return r.url.indexOf('/rest/v1/' + table + '?') !== -1 || /\/rest\/v1\/[^?]+\?/.test(r.url) && r.url.indexOf('/rest/v1/' + table) !== -1;
  }).filter(function(r){
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
    await flow('a-assignment-due-up-next-first', async function(){
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: [ASSIGNMENT]
      }), async function(page, recorded){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.today.hidden, false, 'assignment card must show');
        assert.ok(/Hangboard density/.test(snap.today.text), 'assignment title in Up next, got ' + snap.today.text);
        assert.strictEqual(snap.startHidden, false, 'Start stays on assignment card');
        assert.strictEqual(snap.logHidden, true, 'Log attempt is assignment-hidden');
        assert.ok(snap.today.top < snap.action.top, 'Up next is above the button row');
        assert.ok(snap.action.top < snap.projects.top, 'buttons sit above projects');
        assert.strictEqual(snap.projects.hidden, false);
        assert.strictEqual(snap.chips.length, 3);
        assert.strictEqual(snap.recent.hidden, false);
        assert.strictEqual(snap.recents.length, 3);
        assert.strictEqual(snap.welcome.hidden, true);
        assert.strictEqual(snap.week.hidden, false);
        assert.ok(/session/.test(snap.week.text), 'week copy is session count, got ' + snap.week.text);
        assert.ok(!/streak/.test(snap.week.text));
        var ids = snap.kids.filter(function(k){ return !k.hidden; }).map(function(k){ return k.id; });
        assert.ok(ids.indexOf('home-today-card') < ids.indexOf('home-action-row'));
        assert.ok(ids.indexOf('home-action-row') < ids.indexOf('home-projects-wrap'));
        await shot(page, 'home_redesign_assign_390.png', 390);
        await shot(page, 'home_redesign_assign_840.png', 840);
        var sess = tableGets(recorded, 'sessions');
        var goals = tableGets(recorded, 'athlete_goals');
        assert.strictEqual(sess.length, 1, 'boot sessions GET once, got ' + sess.length);
        assert.strictEqual(goals.length, 0, 'athlete_goals must not fetch on Home');
      });
    });

    await flow('b-no-assignment-project-card-log-attempt-saves-climb-id', async function(){
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: []
      }), async function(page, recorded){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.today.hidden, false, 'project card must fill slot 1');
        assert.ok(/Next: Power of Now/.test(snap.today.text), 'project Next: name, got ' + snap.today.text);
        assert.ok(/attempt/.test(snap.today.text) && /last/i.test(snap.today.text),
          'project card shows attempts and last date: ' + snap.today.text);
        assert.strictEqual(snap.startHidden, true, 'Start hidden on project card');
        assert.strictEqual(snap.logHidden, false, 'Log attempt shown');
        assert.ok(!/Hangboard/.test(snap.today.text));
        await shot(page, 'home_redesign_projects_390.png', 390);
        await shot(page, 'home_redesign_projects_840.png', 840);
        await tap(page, '#home-today-log-attempt');
        var posts = await finishLockedAttempt(page, recorded);
        assert.ok(posts.length, 'Log attempt did not POST sessions');
        var body = firstBody(posts);
        assert.strictEqual(body.climb_id, P1, 'project card must save exact climb_id, got ' + body.climb_id);
        assert.strictEqual(body.route_name, NAME1);
      });
    });

    await flow('c-strip-row-tap-saves-that-climb-id', async function(){
      await withPage(browser, port, signedIn({
        climbs: THREE_PROJECTS,
        sessions: THREE_SESSIONS,
        assignments: []
      }), async function(page, recorded){
        await waitHomeReady(page);
        var chip = page.locator('#home-projects-strip .home-project-chip[data-cid="' + P2 + '"]');
        assert.ok(await chip.count(), 'Yellow Overhang chip missing');
        await tap(page, '#home-projects-strip .home-project-chip[data-cid="' + P2 + '"]');
        var posts = await finishLockedAttempt(page, recorded);
        assert.ok(posts.length, 'strip tap did not POST sessions');
        var body = firstBody(posts);
        assert.strictEqual(body.climb_id, P2, 'strip tap must save that row climb_id, got ' + body.climb_id);
        assert.strictEqual(body.route_name, NAME2);
      });
    });

    await flow('d-empty-user-no-strips-welcome-only', async function(){
      await withPage(browser, port, signedIn({
        climbs: [],
        sessions: [],
        assignments: []
      }), async function(page){
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.today.hidden, true, 'no primary card');
        assert.strictEqual(snap.projects.hidden, true, 'no projects strip');
        assert.strictEqual(snap.week.hidden, true, 'no empty week card');
        assert.strictEqual(snap.recent.hidden, true, 'no recent strip');
        assert.strictEqual(snap.due.hidden, true);
        assert.strictEqual(snap.goals.hidden, true);
        assert.strictEqual(snap.welcome.hidden, false, 'welcome hint for brand-new user');
        assert.strictEqual(snap.action.hidden, false, 'Log a climb / Start training stay');
        assert.ok(/Log a climb/.test(snap.action.text) && /Start training/.test(snap.action.text));
        await shot(page, 'home_redesign_empty_390.png', 390);
        await shot(page, 'home_redesign_empty_840.png', 840);
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
            var week = document.getElementById('home-streak-band');
            var recent = document.getElementById('home-recent-wrap');
            var today = document.getElementById('home-today-card');
            return {
              ready: window._homeDataReady === true,
              welcomeOn: !!(welcome && !welcome.hidden),
              projectsOn: !!(projects && !projects.hidden),
              weekOn: !!(week && !week.hidden),
              recentOn: !!(recent && !recent.hidden),
              todayOn: !!(today && !today.hidden),
              climbCache: window._climbCache,
              sessCache: window._cachedClimbs
            };
          });
          if(mid.welcomeOn && !mid.projectsOn && !mid.todayOn && !mid.ready){
            sawEmpty = true;
            break;
          }
          if(Array.isArray(mid.climbCache) && !mid.ready && mid.welcomeOn){
            sawEmpty = true;
            break;
          }
          await page.waitForTimeout(80);
        }
        assert.strictEqual(sawEmpty, false, 'unloaded caches must not paint the empty-user welcome');
        await waitHomeReady(page);
        var snap = await homeSnapshot(page);
        assert.strictEqual(snap.projects.hidden, false, 'projects appear after load');
        assert.strictEqual(snap.today.hidden, false, 'project card appears after load');
        assert.strictEqual(snap.welcome.hidden, true);
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
        assert.strictEqual(sess.length, 1, 'sessions GET once, got ' + sess.length + ' ' + JSON.stringify(sess.map(function(r){ return r.url; })));
        assert.ok(climbs.length === 1, 'climbs GET once, got ' + climbs.length);
        assert.strictEqual(goals.length, 0, 'no athlete_goals');
        assert.deepStrictEqual(dupes, [], 'each Home data URL once, dupes=' + JSON.stringify(dupes));
        console.log('boot rest GET tables: sessions=' + sess.length + ' climbs=' + climbs.length + ' athlete_goals=' + goals.length + ' homeGets=' + homeGets.length);
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
