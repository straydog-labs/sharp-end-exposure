import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap
} from './harness.mjs';

function coachSession(){
  return { access_token: 'test-token', user: { id: 'coach-regression-1', email: 'coach@test.local' } };
}

async function openAthlete(page){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  await tap(page, '.roster-row');
  await page.waitForSelector('#athlete-landing .detail-title', { timeout: 8000 });
  await page.waitForFunction(function(){
    return document.querySelectorAll('.roster-row.active').length === 1;
  }, null, { timeout: 8000 });
}

async function openJournal(page){
  await tap(page, '[data-path="notes"]');
  await tap(page, '#athlete-path-subs [data-pane="journal"]');
  await page.waitForFunction(function(){
    var landing = document.getElementById('athlete-landing');
    var sub = document.getElementById('athlete-subview');
    var journal = document.getElementById('detail-sessions');
    return !!(landing && landing.style.display === 'none' &&
      sub && sub.style.display !== 'none' &&
      journal && journal.style.display !== 'none');
  }, null, { timeout: 8000 });
}

async function assertRosterHome(page, label){
  await page.waitForFunction(function(){
    var feed = document.getElementById('coach-activity');
    var landing = document.getElementById('athlete-landing');
    return !!(feed && /Recent activity/.test(feed.innerText || '')) && !landing;
  }, null, { timeout: 8000 });
  const home = await page.evaluate(function(){
    var feed = document.getElementById('coach-activity');
    var add = document.getElementById('empty-landing-add-athlete');
    var gym = document.getElementById('empty-landing-gym-climbs');
    return {
      feed: feed ? feed.innerText : '',
      active: document.querySelectorAll('.roster-row.active').length,
      roster: document.querySelectorAll('.roster-row').length,
      add: add ? add.innerText : '',
      gym: gym ? gym.innerText : '',
      landing: document.querySelectorAll('#athlete-landing').length
    };
  });
  assert.match(home.feed, /Recent activity/, label);
  assert.strictEqual(home.active, 0, label + ' clears the selection');
  assert.ok(home.roster >= 1, label + ' keeps the roster list');
  assert.strictEqual(home.landing, 0, label + ' leaves the athlete view');
  assert.match(home.add, /Add athlete/, label);
  assert.match(home.gym, /Gym climb catalog/, label);
}

const { server, port } = await startStaticServer();
const browser = await launchChromium();
try {
  await withPage(browser, port, {
    path: '/coach-dashboard.html',
    session: coachSession()
  }, async function(page){
    const order = await page.evaluate(function(){
      var root = document.querySelector('.topbar-right');
      return Array.prototype.map.call(root.children, function(el){ return el.id; });
    });
    assert.deepStrictEqual(order, [
      'whoami', 'coach-home-btn', 'coach-guide-link', 'personal-dash-btn', 'founder-dash-btn', 'signout-btn'
    ]);
    const brand = await page.evaluate(function(){
      var el = document.querySelector('.topbar-word');
      return {
        tag: el ? el.tagName : '',
        text: el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : ''
      };
    });
    assert.strictEqual(brand.tag, 'BUTTON');
    assert.match(brand.text, /STRAYDOG LABS/);
    assert.match(brand.text, /Coaching/);

    await openAthlete(page);
    await tap(page, '#coach-home-btn');
    await assertRosterHome(page, 'Home from landing');

    await openAthlete(page);
    await openJournal(page);
    const arrow = await page.locator('#athlete-subview-back').innerText();
    assert.match(arrow, /←\s*Test Athlete/);
    await tap(page, '#athlete-subview-back');
    await page.waitForFunction(function(){
      var landing = document.getElementById('athlete-landing');
      return !!(landing && landing.style.display !== 'none' &&
        document.querySelectorAll('.roster-row.active').length === 1);
    }, null, { timeout: 8000 });
    await openJournal(page);
    await tap(page, '#coach-home-btn');
    await assertRosterHome(page, 'Home from journal');

    await openAthlete(page);
    await tap(page, '.topbar-word');
    await assertRosterHome(page, 'brand');

    await openAthlete(page);
    await tap(page, '#athlete-landing [data-roster-home]');
    await assertRosterHome(page, 'Roster from landing');

    await openAthlete(page);
    await openJournal(page);
    await tap(page, '#athlete-subview [data-roster-home]');
    await assertRosterHome(page, 'Roster from journal');

    for(var i = 0; i < 3; i++){
      await openAthlete(page);
      await tap(page, '#coach-home-btn');
      await assertRosterHome(page, 'repeat ' + i);
    }

    await openAthlete(page);
    await openJournal(page);
    await page.goBack();
    await assertRosterHome(page, 'browser Back');
  });

  await withPage(browser, port, {
    path: '/coach-dashboard.html',
    session: coachSession(),
    viewport: { width: 390, height: 844 }
  }, async function(page){
    await page.waitForSelector('#coach-home-btn', { timeout: 15000 });
    const home = await page.evaluate(function(){
      var el = document.getElementById('coach-home-btn');
      var style = window.getComputedStyle(el);
      var box = el.getBoundingClientRect();
      return {
        display: style.display,
        visibility: style.visibility,
        width: box.width,
        height: box.height,
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight
      };
    });
    assert.notStrictEqual(home.display, 'none');
    assert.notStrictEqual(home.visibility, 'hidden');
    assert.ok(home.width > 20 && home.height > 10, JSON.stringify(home));
    assert.ok(home.left >= -1 && home.right <= home.innerWidth + 1, JSON.stringify(home));
    assert.ok(home.top >= -1 && home.bottom <= home.innerHeight + 1, JSON.stringify(home));

    await openAthlete(page);
    const roster = await page.evaluate(function(){
      var el = document.querySelector('#athlete-landing [data-roster-home]');
      var style = window.getComputedStyle(el);
      var box = el.getBoundingClientRect();
      return {
        text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
        display: style.display,
        width: box.width,
        top: box.top,
        bottom: box.bottom,
        innerHeight: window.innerHeight
      };
    });
    assert.strictEqual(roster.text, '← Roster');
    assert.notStrictEqual(roster.display, 'none');
    assert.ok(roster.width > 20, JSON.stringify(roster));
    assert.ok(roster.top >= -1 && roster.bottom <= roster.innerHeight + 1, JSON.stringify(roster));
  });

  console.log('coach-home-nav tests: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
