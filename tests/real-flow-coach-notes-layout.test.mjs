import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, postsTo, firstBody,
  COACH_ID, ATHLETE_ID
} from './harness.mjs';

// Coach's Notes: add-note action on top, form hidden until asked, notes
// collapsible and newest first by date, backdated notes sort into place,
// and the pane still loads if the structured-note tables are missing live.
let postCount = 0;
const NOTES = [
  { id: 'n3', title: 'Oct 16 session', body: 'Started EMOM and hangboard plan.\nSecond line.', created_at: '2026-10-16T20:00:00Z', note_type: 'general', edited_at: null, coach_athlete_note_patterns: [] },
  { id: 'n2', title: 'Sep 13 video review', body: 'Dominant pattern: footwork.', created_at: '2026-09-20T20:00:00Z', note_type: 'video_review', edited_at: null, coach_athlete_note_patterns: [] },
  { id: 'n1', title: 'Coaching call', body: 'Agenda: shortcut, EMOM.', created_at: '2026-08-18T19:00:00Z', note_type: 'call', edited_at: null, coach_athlete_note_patterns: [] }
];

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      viewport: { width: 1280, height: 1400 },
      session: { access_token: 'test-token', user: { id: COACH_ID, email: 'coach@test.local' } },
      stub: async function(route, req){
        if(req.url.indexOf('/rest/v1/coach_athlete_notes') !== -1){
          if(req.method === 'GET'){
            if(req.url.indexOf('coach_athlete_note_patterns') !== -1){
              // structured tables missing live: the first query must fail, the plain one must be used
              await route.fulfill({ status: 400, contentType: 'application/json',
                body: JSON.stringify({ code: 'PGRST200', message: 'Could not find a relationship between coach_athlete_notes and coach_athlete_note_patterns' }) });
              return true;
            }
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NOTES) });
            return true;
          }
          if(req.method === 'POST'){
            await route.fulfill({ status: 201, contentType: 'application/json',
              body: JSON.stringify([Object.assign({ id: postCount++ ? 'n-new-2' : 'n-new', created_at: '2026-10-30T15:00:00Z' }, req.body || {})]) });
            return true;
          }
        }
        return false;
      }
    }, async function(page, recorded){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await tap(page, '[data-path="notes"]');
      await tap(page, '#athlete-path-subs [data-pane="notes"]');
      await page.waitForSelector('#coach-note-add-open', { timeout: 8000 });

      // loads even though the first (embedded) query failed
      assert.ok(recorded.some(function(r){ return r.method === 'GET' && r.url.indexOf('coach_athlete_notes') !== -1 && r.url.indexOf('coach_athlete_note_patterns') === -1; }), 'fallback query used');

      // add action sits above the list; form is hidden
      const order = await page.evaluate(function(){
        var add = document.getElementById('coach-note-add-open');
        var list = document.querySelector('.coach-note-list');
        return !!(add.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      assert.ok(order, 'Add note is above the notes list');
      assert.strictEqual(await page.locator('#coach-note-form').isVisible(), false, 'form hidden by default');

      // newest first, all collapsed, date shown, preview shown
      const titles = await page.$$eval('.coach-note-fold .coach-note-title', function(ns){ return ns.map(function(n){ return n.textContent.trim(); }); });
      assert.deepStrictEqual(titles, ['Oct 16 session', 'Video reviewSep 13 video review', 'CallCoaching call']);
      assert.strictEqual(await page.locator('details.coach-note-fold[open]').count(), 0, 'all collapsed by default');
      const times = await page.$$eval('.coach-note-fold .coach-note-time', function(ns){ return ns.map(function(n){ return n.textContent.trim(); }); });
      assert.ok(/Oct 16, 2026/.test(times[0]) && /Sep 20, 2026/.test(times[1]), 'dates shown: ' + times.join('|'));
      assert.ok(/Started EMOM/.test(await page.locator('.coach-note-preview').first().textContent()), 'preview shown');
      assert.strictEqual(await page.locator('.coach-note-preview').first().isVisible(), true);

      // expand one, then expand/collapse all
      await page.locator('.coach-note-fold > summary').first().click();
      assert.strictEqual(await page.locator('details.coach-note-fold[open]').count(), 1);
      assert.strictEqual(await page.locator('.coach-note-fold[open] .coach-note-body').first().isVisible(), true);
      await tap(page, '#coach-note-expand-all');
      assert.strictEqual(await page.locator('details.coach-note-fold[open]').count(), 3);
      await tap(page, '#coach-note-collapse-all');
      assert.strictEqual(await page.locator('details.coach-note-fold[open]').count(), 0);

      // add a backdated note
      await tap(page, '#coach-note-add-open');
      assert.strictEqual(await page.locator('#coach-note-form').isVisible(), true);
      assert.strictEqual(await page.locator('#coach-note-add-open').isVisible(), false);
      await page.fill('#coach-note-date', '2026-10-02');
      await page.fill('#coach-note-title', 'Oct 2 check-in');
      await page.fill('#coach-note-body', 'Backdated entry.');
      await tap(page, '#coach-note-save');
      await page.waitForSelector('.coach-note-fold[data-note-id="n-new"]', { timeout: 8000 });
      const post = firstBody(postsTo(recorded, 'coach_athlete_notes', 'POST'));
      assert.ok(post, 'note POST made');
      assert.strictEqual(post.title, 'Oct 2 check-in');
      assert.ok(post.created_at && post.created_at.indexOf('2026-10-02') === 0, 'chosen day sent as created_at: ' + post.created_at);
      assert.strictEqual(await page.locator('#coach-note-form').isVisible(), false, 'form closes after save');
      const after = await page.$$eval('.coach-note-fold', function(ns){ return ns.map(function(n){ return n.getAttribute('data-note-id'); }); });
      assert.deepStrictEqual(after, ['n3', 'n-new', 'n2', 'n1'], 'backdated note sorts by date');
      assert.strictEqual(await page.locator('.coach-note-fold[data-note-id="n-new"]').getAttribute('open') !== null, true, 'new note shown expanded');

      // a note added for today omits created_at (server stamps it)
      await tap(page, '#coach-note-add-open');
      await page.fill('#coach-note-title', 'Today');
      await page.fill('#coach-note-body', 'Today entry.');
      await tap(page, '#coach-note-save');
      await page.waitForFunction(function(){ return document.querySelectorAll('.coach-note-fold').length === 5; }, null, { timeout: 8000 });
      const posts = postsTo(recorded, 'coach_athlete_notes', 'POST');
      assert.strictEqual(posts.length, 2);
      assert.ok(!('created_at' in posts[1].body), 'today omits created_at');
    });
  } finally {
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}
run().then(function(){ console.log('real-flow-coach-notes-layout: ok'); })
  .catch(function(e){ console.error(e); process.exit(1); });
