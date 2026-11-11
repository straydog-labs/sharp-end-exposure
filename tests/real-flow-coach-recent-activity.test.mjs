import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap,
  COACH_ID, ATHLETE_ID
} from './harness.mjs';

function coachSession(){
  return { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } };
}

function iso(msAgo){
  return new Date(Date.now() - msAgo).toISOString();
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function seeded(){
  var sessions = [
    {
      id: 'climb-newish', user_id: ATHLETE_ID, created_at: iso(3 * HOUR),
      grade_value: 'V4', baseline_zone: 'sent', logged_by_coach: false,
      is_checkin: false, deleted_at: null
    },
    {
      id: 'climb-old', user_id: ATHLETE_ID, created_at: iso(10 * DAY),
      grade_value: 'V2', baseline_zone: 'fell', logged_by_coach: false,
      is_checkin: false, deleted_at: null
    }
  ];
  for(var i = 0; i < 12; i++){
    sessions.push({
      id: 'climb-extra-' + i, user_id: ATHLETE_ID,
      created_at: iso(4 * HOUR + i * HOUR),
      grade_value: 'V' + (i + 1), baseline_zone: 'sent',
      logged_by_coach: false, is_checkin: false, deleted_at: null
    });
  }
  var started = iso(40 * MIN + 45 * MIN);
  var ended = iso(40 * MIN);
  return {
    sessions: sessions,
    training: [{
      id: 'train-1', user_id: ATHLETE_ID, created_at: iso(40 * MIN),
      started_at: started, ended_at: ended,
      energy_type: null, notes: 'Repeaters\ncoach note',
      blocks: [{ complete: true }, { complete: true }, { complete: false }],
      logged_by_coach: true, deleted_at: null
    }],
    psyche: [{
      id: 'psy-1', user_id: ATHLETE_ID, created_at: iso(20 * MIN),
      drill_key: 'box_breathing', deleted_at: null
    }],
    assignments: [{
      id: 'asg-done', coach_id: COACH_ID, athlete_id: ATHLETE_ID,
      title: 'Night EMOM', completed_at: iso(10 * MIN),
      created_at: iso(2 * DAY), deleted_at: null
    }]
  };
}

function activityStub(state){
  return function(route, request){
    var url = request.url;
    var method = request.method;
    if(method !== 'GET') return false;
    if(url.indexOf('/rest/v1/sessions') !== -1){
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.sessions) });
      return true;
    }
    if(url.indexOf('/rest/v1/training_sessions') !== -1){
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.training) });
      return true;
    }
    if(url.indexOf('/rest/v1/psyche_drills') !== -1){
      if(state.blockPsyche){
        route.fulfill({
          status: 403, contentType: 'application/json',
          body: JSON.stringify({ message: 'permission denied for table psyche_drills', code: '42501' })
        });
        return true;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.psyche) });
      return true;
    }
    if(url.indexOf('/rest/v1/assignments') !== -1){
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.assignments) });
      return true;
    }
    return false;
  };
}

function rowText(page){
  return page.$$eval('.coach-activity-row', function(els){
    return els.map(function(el){
      return {
        id: el.getAttribute('data-entry-id'),
        athlete: el.getAttribute('data-athlete-id'),
        text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
        isNew: !!el.querySelector('.coach-activity-new')
      };
    });
  });
}

const seenKey = 'see_coach_activity_seen:' + COACH_ID;
const seenBefore = new Date(Date.now() - 90 * MIN).toISOString();

const { server, port } = await startStaticServer();
const browser = await launchChromium();
try {
  await withPage(browser, port, {
    path: '/coach-dashboard.html',
    session: coachSession(),
    storage: { [seenKey]: seenBefore },
    stub: activityStub(seeded())
  }, async function(page){
    await page.waitForSelector('.coach-activity-row', { timeout: 15000 });
    var rows = await rowText(page);
    assert.strictEqual(rows.length, 15, 'first page is 15');
    assert.deepStrictEqual(rows.slice(0, 3).map(function(r){ return r.id; }), [
      'asg-done', 'psy-1', 'train-1'
    ]);
    assert.ok(rows.every(function(r){ return r.athlete === ATHLETE_ID; }));
    assert.ok(/Night EMOM completed/.test(rows[0].text) && /by athlete/.test(rows[0].text), rows[0].text);
    assert.ok(/box_breathing/.test(rows[1].text) && /by athlete/.test(rows[1].text), rows[1].text);
    assert.ok(/Repeaters/.test(rows[2].text) && /45 min/.test(rows[2].text) &&
      /2 of 3 blocks done/.test(rows[2].text) && /by coach/.test(rows[2].text), rows[2].text);
    assert.ok(/V4 sent/.test(rows[3].text) && /by athlete/.test(rows[3].text), rows[3].text);
    assert.ok(rows[0].isNew && rows[1].isNew && rows[2].isNew, 'rows newer than the last visit are marked');
    assert.ok(!rows[3].isNew, 'older than the last visit has no dot');
    assert.ok(!/V2 fell/.test(rows.map(function(r){ return r.text; }).join(' ')), '10-day climb is outside the window');
    var more = page.locator('#coach-activity-more');
    assert.strictEqual((await more.innerText()).trim(), 'Show 15 more');
    await tap(page, '#coach-activity-more');
    rows = await rowText(page);
    assert.strictEqual(rows.length, 16);
    assert.strictEqual(await page.locator('#coach-activity-more').count(), 0);
    var seenAfter = await page.evaluate(function(key){ return localStorage.getItem(key); }, seenKey);
    assert.ok(seenAfter && new Date(seenAfter).getTime() > new Date(seenBefore).getTime());
    await tap(page, '.coach-activity-row[data-entry-id="climb-newish"]');
    await page.waitForFunction(function(){
      var title = document.querySelector('#detail-panel .detail-title');
      return !!(title && /Test Athlete/.test(title.textContent || ''));
    }, null, { timeout: 8000 });
    await page.waitForSelector('.journal-entry[data-session-id="climb-newish"].coach-activity-target', { timeout: 8000 });
    await tap(page, '#detail-stack-back');
    await tap(page, '#detail-stack-back');
    await page.waitForSelector('#coach-activity', { timeout: 8000 });
    assert.ok(/Recent activity/.test(await page.locator('#coach-activity').innerText()));
  });

  await withPage(browser, port, {
    path: '/coach-dashboard.html',
    session: coachSession(),
    stub: activityStub({ sessions: [], training: [], psyche: [], assignments: [] })
  }, async function(page){
    await page.waitForFunction(function(){
      var el = document.getElementById('coach-activity');
      return !!(el && /No activity in the last 7 days/.test(el.innerText || ''));
    }, null, { timeout: 15000 });
    assert.strictEqual(await page.locator('.coach-activity-row').count(), 0);
  });

  await withPage(browser, port, {
    path: '/coach-dashboard.html',
    session: coachSession(),
    stub: activityStub(Object.assign(seeded(), { blockPsyche: true }))
  }, async function(page){
    var errors = [];
    page.on('pageerror', function(err){ errors.push(String(err)); });
    await page.waitForSelector('.coach-activity-row', { timeout: 15000 });
    var rows = await rowText(page);
    assert.ok(rows.some(function(r){ return r.id === 'climb-newish'; }));
    assert.ok(rows.some(function(r){ return r.id === 'train-1'; }));
    assert.ok(!rows.some(function(r){ return r.id === 'psy-1'; }));
    var skipped = await page.evaluate(function(){
      return window.__coachActivityTest && window.__coachActivityTest.skipped();
    });
    assert.ok(skipped && skipped.some(function(s){
      return s.table === 'psyche_drills' && /permission denied for table psyche_drills/.test(s.error);
    }), JSON.stringify(skipped));
    assert.strictEqual(errors.length, 0);
  });

  await withPage(browser, port, {
    path: '/coach-dashboard.html',
    session: coachSession(),
    breakStorage: true,
    stub: activityStub(seeded())
  }, async function(page){
    var errors = [];
    page.on('pageerror', function(err){ errors.push(String(err)); });
    await page.waitForSelector('.coach-activity-row', { timeout: 15000 });
    assert.strictEqual(await page.locator('.coach-activity-new').count(), 0);
    assert.ok(/V4 sent/.test(await page.locator('#coach-activity').innerText()));
    assert.strictEqual(errors.length, 0);
  });

  console.log('coach-recent-activity tests: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
