import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap,
  COACH_ID, ATHLETE_ID
} from './harness.mjs';

const OTHER_ID = 'athlete-other-9';
const MIN = 60 * 1000;

function coachSession(){
  return { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } };
}

function iso(msAgo){
  return new Date(Date.now() - msAgo).toISOString();
}

function ymd(offset){
  var d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function climbs(){
  var rows = [
    {
      id: 'climb-blue', user_id: ATHLETE_ID, created_at: iso(2 * MIN),
      route_name: 'Blue slab', grade_value: 'V4', baseline_zone: 'sent',
      logged_by_coach: false, is_checkin: false, deleted_at: null
    },
    {
      id: 'climb-red', user_id: ATHLETE_ID, created_at: iso(3 * MIN),
      route_name: 'Red roof', grade_value: 'V5', baseline_zone: 'fell',
      logged_by_coach: true, is_checkin: false, deleted_at: null
    },
    {
      id: 'climb-checkin', user_id: ATHLETE_ID, created_at: iso(10 * 1000),
      route_name: 'Checkin secret', grade_value: 'V1', baseline_zone: 'sent',
      logged_by_coach: false, is_checkin: true, deleted_at: null
    },
    {
      id: 'climb-other', user_id: OTHER_ID, created_at: iso(15 * 1000),
      route_name: 'Secret climb', grade_value: 'V8', baseline_zone: 'sent',
      logged_by_coach: false, is_checkin: false, deleted_at: null
    },
    {
      id: 'climb-deleted', user_id: ATHLETE_ID, created_at: iso(12 * 1000),
      route_name: 'Deleted climb', grade_value: 'V3', baseline_zone: 'sent',
      logged_by_coach: false, is_checkin: false, deleted_at: iso(1000)
    }
  ];
  for(var i = 0; i < 8; i++){
    rows.push({
      id: 'climb-extra-' + i, user_id: ATHLETE_ID, created_at: iso((5 + i) * MIN),
      route_name: 'Extra ' + i, grade_value: 'V2', baseline_zone: 'sent',
      logged_by_coach: false, is_checkin: false, deleted_at: null
    });
  }
  return rows;
}

function training(){
  return [
    {
      id: 'train-coach', user_id: ATHLETE_ID, created_at: iso(1 * MIN),
      notes: 'Coach repeaters', logged_by_coach: true, assignment_id: 'asg-done',
      energy_type: null, blocks: [], deleted_at: null
    },
    {
      id: 'train-athlete', user_id: ATHLETE_ID, created_at: iso(4 * MIN),
      notes: 'Athlete emom', logged_by_coach: false, assignment_id: null,
      energy_type: null, blocks: [], deleted_at: null
    },
    {
      id: 'train-other', user_id: OTHER_ID, created_at: iso(20 * 1000),
      notes: 'Other train secret', logged_by_coach: false, assignment_id: null,
      deleted_at: null
    },
    {
      id: 'train-deleted', user_id: ATHLETE_ID, created_at: iso(18 * 1000),
      notes: 'Deleted train', logged_by_coach: false, assignment_id: null,
      deleted_at: iso(1000)
    }
  ];
}

function assignments(){
  return [
    {
      id: 'asg-overdue', athlete_id: ATHLETE_ID, coach_id: COACH_ID,
      title: 'Overdue hangs', due_date: ymd(-2), completed_at: null,
      deleted_at: null, created_at: iso(5 * 86400000)
    },
    {
      id: 'asg-future', athlete_id: ATHLETE_ID, coach_id: COACH_ID,
      title: 'Future emom', due_date: ymd(6), completed_at: null,
      deleted_at: null, created_at: iso(4 * 86400000)
    },
    {
      id: 'asg-nodue', athlete_id: ATHLETE_ID, coach_id: COACH_ID,
      title: 'Anytime mobility', due_date: null, completed_at: null,
      deleted_at: null, created_at: iso(3 * 86400000)
    },
    {
      id: 'asg-done', athlete_id: ATHLETE_ID, coach_id: COACH_ID,
      title: 'Finished plan', due_date: ymd(-1), completed_at: iso(60 * MIN),
      deleted_at: null, created_at: iso(6 * 86400000)
    },
    {
      id: 'asg-deleted', athlete_id: ATHLETE_ID, coach_id: COACH_ID,
      title: 'Deleted plan', due_date: ymd(-3), completed_at: null,
      deleted_at: iso(60 * MIN), created_at: iso(7 * 86400000)
    },
    {
      id: 'asg-other', athlete_id: OTHER_ID, coach_id: COACH_ID,
      title: 'Other athlete secret', due_date: ymd(-4), completed_at: null,
      deleted_at: null, created_at: iso(86400000)
    }
  ];
}

function isLandingOpen(url){
  return url.indexOf('/rest/v1/assignments') !== -1 &&
    url.indexOf('due_date') !== -1 &&
    url.indexOf('completed_at=is.null') !== -1;
}

function isLandingSessions(url){
  return url.indexOf('/rest/v1/sessions') !== -1 &&
    url.indexOf('is_checkin') !== -1 &&
    url.indexOf('route_name') !== -1 &&
    url.indexOf('user_id=eq.') !== -1 &&
    url.indexOf('created_at=gte.') === -1;
}

function isLandingTraining(url){
  return url.indexOf('/rest/v1/training_sessions') !== -1 &&
    url.indexOf('assignment_id') !== -1 &&
    url.indexOf('limit=40') !== -1 &&
    url.indexOf('user_id=eq.') !== -1;
}

function fulfill(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function dataStub(state){
  return async function(route, request){
    var url = request.url;
    if(request.method !== 'GET') return false;
    var landing = isLandingOpen(url) || isLandingSessions(url) || isLandingTraining(url);
    if(!landing) return false;
    if(state.hold) await state.hold;
    if(state.fail){
      return fulfill(route, 403, { message: 'permission denied', code: '42501' }).then(function(){ return true; });
    }
    if(isLandingOpen(url)) return fulfill(route, 200, state.assignments).then(function(){ return true; });
    if(isLandingSessions(url)) return fulfill(route, 200, state.sessions).then(function(){ return true; });
    if(isLandingTraining(url)) return fulfill(route, 200, state.training).then(function(){ return true; });
    return false;
  };
}

async function openAthlete(page){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  await tap(page, '.roster-row');
  await page.waitForSelector('#athlete-landing', { timeout: 8000 });
}

function readRows(page, sel, attr){
  return page.evaluate(function(args){
    return Array.prototype.map.call(document.querySelectorAll(args.sel), function(el){
      return {
        id: el.getAttribute(args.attr),
        tag: el.tagName,
        text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
        overdue: el.getAttribute('data-overdue'),
        status: el.getAttribute('data-status'),
        source: el.getAttribute('data-source'),
        assignment: el.getAttribute('data-assignment-title') || ''
      };
    });
  }, { sel: sel, attr: attr });
}

const { server, port } = await startStaticServer();
const browser = await launchChromium();
try {
  var releaseLanding;
  var hold = new Promise(function(resolve){ releaseLanding = resolve; });
  var seeded = {
    hold: hold,
    fail: false,
    sessions: climbs(),
    training: training(),
    assignments: assignments()
  };

  await withPage(browser, port, {
    path: '/coach-dashboard.html',
    session: coachSession(),
    sessions: seeded.sessions,
    trainingSessions: seeded.training,
    assignments: seeded.assignments,
    stub: dataStub(seeded)
  }, async function(page, recorded){
    await openAthlete(page);
    await page.waitForFunction(function(){
      var open = document.getElementById('athlete-open-assignments');
      var recent = document.getElementById('athlete-recent-sessions');
      var stats = document.querySelector('#athlete-share-block .roster-stats');
      if(!open || !recent || !stats) return false;
      if(open.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING){
        /* sections sit above the stats block */
      } else return false;
      return /Loading/.test(open.innerText || '') && /Loading/.test(recent.innerText || '') &&
        open.querySelector('.landing-muted') && recent.querySelector('.landing-muted');
    }, null, { timeout: 8000 });

    releaseLanding();

    await page.waitForSelector('.landing-assign-row', { timeout: 8000 });
    var openRows = await readRows(page, '#athlete-open-assignments .landing-assign-row', 'data-assignment-id');
    assert.deepStrictEqual(openRows.map(function(r){ return r.id; }), [
      'asg-overdue', 'asg-future', 'asg-nodue'
    ]);
    assert.strictEqual(openRows[0].overdue, '1');
    assert.ok(/Overdue/.test(openRows[0].text), openRows[0].text);
    assert.ok(!/Overdue/.test(openRows[1].text) && !/Overdue/.test(openRows[2].text));
    assert.ok(openRows.every(function(r){ return r.status === 'Open' && /Open/.test(r.text); }));
    assert.ok(/Due /.test(openRows[0].text) && /Due /.test(openRows[1].text));
    assert.ok(/No due date/.test(openRows[2].text), openRows[2].text);
    var openText = openRows.map(function(r){ return r.text; }).join(' ');
    assert.ok(!/Finished plan|Deleted plan|Other athlete secret/.test(openText), openText);

    var recentRows = await readRows(page, '#athlete-recent-sessions .landing-session-row', 'data-session-id');
    assert.strictEqual(recentRows.length, 10);
    assert.deepStrictEqual(recentRows.slice(0, 4).map(function(r){ return r.id; }), [
      'train-coach', 'climb-blue', 'climb-red', 'train-athlete'
    ]);
    assert.strictEqual(recentRows[0].source, 'by coach');
    assert.ok(/Coach repeaters/.test(recentRows[0].text) && /by coach/.test(recentRows[0].text), recentRows[0].text);
    assert.strictEqual(recentRows[0].assignment, 'Finished plan');
    assert.ok(/Finished plan/.test(recentRows[0].text));
    assert.strictEqual(recentRows[1].source, 'by athlete');
    assert.ok(/Blue slab/.test(recentRows[1].text) && /by athlete/.test(recentRows[1].text), recentRows[1].text);
    assert.strictEqual(recentRows[1].assignment, '');
    assert.strictEqual(recentRows[2].source, 'by coach');
    assert.ok(/Red roof/.test(recentRows[2].text) && /by coach/.test(recentRows[2].text), recentRows[2].text);
    assert.strictEqual(recentRows[3].source, 'by athlete');
    assert.ok(/Athlete emom/.test(recentRows[3].text) && /by athlete/.test(recentRows[3].text), recentRows[3].text);
    assert.strictEqual(recentRows[3].assignment, '');
    var recentText = recentRows.map(function(r){ return r.text; }).join(' ');
    assert.ok(!/Secret climb|Other train secret|Deleted climb|Deleted train|Checkin secret/.test(recentText), recentText);
    assert.ok(recentRows.every(function(r){ return r.tag === 'BUTTON'; }));
    var more = page.locator('#athlete-recent-more');
    assert.strictEqual((await more.innerText()).trim(), 'Show 10 more');
    await tap(page, '#athlete-recent-more');
    recentRows = await readRows(page, '#athlete-recent-sessions .landing-session-row', 'data-session-id');
    assert.strictEqual(recentRows.length, 12);
    assert.strictEqual(await page.locator('#athlete-recent-more').count(), 0);
    assert.ok(!/Secret climb|Other train secret|Deleted climb|Deleted train|Checkin secret|Other athlete secret/.test(
      recentRows.map(function(r){ return r.text; }).join(' ')
    ));

    var landingUrls = recorded.filter(function(r){
      return r.method === 'GET' && (isLandingOpen(r.url) || isLandingSessions(r.url) || isLandingTraining(r.url));
    }).map(function(r){ return r.url; });
    assert.ok(landingUrls.some(isLandingOpen), 'open assignment query');
    assert.ok(landingUrls.some(isLandingSessions), 'climb query');
    assert.ok(landingUrls.some(isLandingTraining), 'training query');
    landingUrls.forEach(function(url){
      assert.ok(url.indexOf(encodeURIComponent(ATHLETE_ID)) !== -1, url);
      assert.ok(url.indexOf('deleted_at=is.null') !== -1, url);
      assert.ok(url.indexOf(OTHER_ID) === -1, url);
    });

    await tap(page, '.landing-assign-row[data-assignment-id="asg-overdue"]');
    await page.waitForFunction(function(){
      var input = document.getElementById('new-a-name-edit');
      var overlay = document.getElementById('assign-wizard-overlay');
      return !!(overlay && overlay.classList.contains('open') && input && input.value === 'Overdue hangs');
    }, null, { timeout: 8000 });

    await page.evaluate(function(){
      var close = document.getElementById('aw-cancel');
      if(close) close.click();
    });
    await page.waitForFunction(function(){
      var overlay = document.getElementById('assign-wizard-overlay');
      return !!(overlay && !overlay.classList.contains('open'));
    }, null, { timeout: 8000 });

    await tap(page, '.landing-session-row[data-session-id="climb-blue"]');
    await page.waitForSelector('.journal-entry[data-session-id="climb-blue"]', { timeout: 8000 });
    await page.waitForFunction(function(){
      var section = document.getElementById('detail-sessions');
      return !!(section && section.style.display !== 'none');
    }, null, { timeout: 8000 });

    var writes = recorded.filter(function(r){
      if(r.method !== 'POST' && r.method !== 'PATCH') return false;
      return r.url.indexOf('/rest/v1/assignments') !== -1 ||
        r.url.indexOf('/rest/v1/sessions') !== -1 ||
        r.url.indexOf('/rest/v1/training_sessions') !== -1;
    });
    assert.strictEqual(writes.length, 0, JSON.stringify(writes.map(function(r){ return r.method + ' ' + r.url; })));
  });

  await withPage(browser, port, {
    path: '/coach-dashboard.html',
    session: coachSession(),
    sessions: [],
    trainingSessions: [],
    assignments: []
  }, async function(page){
    await openAthlete(page);
    await page.waitForFunction(function(){
      var open = document.getElementById('athlete-open-assignments');
      var recent = document.getElementById('athlete-recent-sessions');
      return !!(open && recent && open.hidden && recent.hidden);
    }, null, { timeout: 8000 });
    assert.strictEqual(await page.locator('.landing-assign-row').count(), 0);
    assert.strictEqual(await page.locator('.landing-session-row').count(), 0);
  });

  await withPage(browser, port, {
    path: '/coach-dashboard.html',
    session: coachSession(),
    stub: dataStub({ fail: true, sessions: climbs(), training: training(), assignments: assignments() })
  }, async function(page){
    var errors = [];
    page.on('pageerror', function(err){ errors.push(String(err)); });
    await openAthlete(page);
    await page.waitForFunction(function(){
      var open = document.getElementById('athlete-open-assignments');
      var recent = document.getElementById('athlete-recent-sessions');
      if(!open || !recent || open.hidden || recent.hidden) return false;
      var openNote = open.querySelector('.landing-muted');
      var recentNote = recent.querySelector('.landing-muted');
      return !!(openNote && /Could not load open assignments/.test(openNote.textContent || '') &&
        recentNote && /Could not load recent sessions/.test(recentNote.textContent || ''));
    }, null, { timeout: 8000 });
    var skipped = await page.evaluate(function(){
      return window.__coachLandingTest && window.__coachLandingTest.skipped();
    });
    assert.ok(skipped && skipped.some(function(s){ return s.table === 'assignments'; }), JSON.stringify(skipped));
    assert.ok(skipped.some(function(s){ return s.table === 'sessions'; }), JSON.stringify(skipped));
    assert.ok(skipped.some(function(s){ return s.table === 'training_sessions'; }), JSON.stringify(skipped));
    assert.strictEqual(errors.length, 0);
  });

  console.log('coach-athlete-landing-activity tests: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
