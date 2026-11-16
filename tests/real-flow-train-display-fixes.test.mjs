import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { startStaticServer, launchChromium, withPage, USER_ID } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index341'/.test(index));
assert.ok(/APP_VERSION = 'index341'/.test(sw));

function fulfillJson(route, status, body){
  return route.fulfill({
    status: status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

const LONG_TITLE = 'Density pyramid on the steep wall with long rests between burns';

function workout(id, name){
  return {
    id: id,
    name: name,
    description: name,
    training_focus: 'Max hangs',
    created_by: USER_ID,
    is_starred: true,
    sections: []
  };
}

function stub(){
  var marked = false;
  var messages = [
    { id: 'm1', coach_id: 'coach-1', athlete_id: USER_ID, sender_id: 'coach-1', body: 'One', read_at: null, created_at: '2026-11-15T12:00:00Z', edited_at: null },
    { id: 'm2', coach_id: 'coach-1', athlete_id: USER_ID, sender_id: 'coach-1', body: 'Two', read_at: null, created_at: '2026-11-15T12:01:00Z', edited_at: null },
    { id: 'm3', coach_id: 'coach-1', athlete_id: USER_ID, sender_id: 'coach-1', body: 'Three', read_at: null, created_at: '2026-11-15T12:02:00Z', edited_at: null }
  ];
  return async function(route, info){
    var url = info.url;
    var method = info.method;
    if(method === 'GET' && url.indexOf('/rest/v1/coach_athlete_links') !== -1){
      await fulfillJson(route, 200, [{ coach_id: 'coach-1', athlete_id: USER_ID, status: 'active' }]);
      return true;
    }
    if(method === 'PATCH' && url.indexOf('/rest/v1/coach_messages') !== -1){
      marked = true;
      var now = '2026-11-15T13:00:00Z';
      messages.forEach(function(m){ if(!m.read_at) m.read_at = now; });
      await fulfillJson(route, 200, [{ id: 'm1', read_at: now }]);
      return true;
    }
    if(method === 'GET' && url.indexOf('/rest/v1/coach_messages') !== -1){
      if(url.indexOf('read_at=is.null') !== -1){
        await fulfillJson(route, 200, marked ? [] : messages.filter(function(m){ return !m.read_at; }));
        return true;
      }
      await fulfillJson(route, 200, messages.slice());
      return true;
    }
    if(method === 'GET' && url.indexOf('/rest/v1/custom_workouts') !== -1){
      await fulfillJson(route, 200, [
        workout('cw-1', LONG_TITLE),
        workout('cw-2', 'Open hand repeaters with a long title that must wrap fully'),
        workout('cw-3', 'Short pin')
      ]);
      return true;
    }
    if(method === 'GET' && url.indexOf('/rest/v1/profiles') !== -1){
      await fulfillJson(route, 200, []);
      return true;
    }
    return false;
  };
}

async function boot(page){
  await page.waitForFunction(function(){
    return typeof window.showScreen === 'function' && typeof window.renderTrainSessionBuilder === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window._hasRoutedAfterSignIn = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window.routeSignedInHome = function(){};
    try{ localStorage.removeItem('see_train_draft_' + userId); }catch(e){}
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  }, USER_ID);
}

function shown(el){
  if(!el || el.hidden) return false;
  var cs = getComputedStyle(el);
  if(cs.display === 'none' || cs.visibility === 'hidden') return false;
  var box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page){
    await boot(page);

    var hang = await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Hangboard', 'Align', '', { session_running: true });
      trainSessionState.session_running = true;
      trainAddBlock('rep_pass_fail');
      var b = trainSessionState.blocks[0];
      b.title = 'Repeaters';
      b.editing = false;
      b.grip = '';
      b.assistance = '';
      b.on_sec = 7;
      b.off_sec = 3;
      var open = [null, null, null, null, null, null].map(function(ok){ return { ok: ok }; });
      var onePass = [{ ok: true }, { ok: null }, { ok: null }, { ok: null }, { ok: null }, { ok: null }];
      b.sets = [
        { grip: 'Half crimp', load: '35 lb assist', rest_after_sec: 180, reps: open },
        { grip: 'Open hand', load: '20 lb', rest_after_sec: 90, reps: onePass }
      ];
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
      var card = document.querySelector('[data-block-id="' + b.id + '"]');
      var rows = card ? Array.prototype.slice.call(card.querySelectorAll('[data-hang-compact]')) : [];
      return {
        rows: rows.map(function(row){
          var main = row.querySelector('.wk-hang-compact-main');
          var status = row.querySelector('.wk-hang-compact-status');
          var rep = row.querySelector('.wk-hang-rep');
          var mainCs = main ? getComputedStyle(main) : null;
          return {
            main: main ? main.textContent : '',
            status: status ? status.textContent : '',
            repX: rep ? rep.getBoundingClientRect().left : null,
            statusW: status ? status.getBoundingClientRect().width : null,
            ellipsis: !!(mainCs && mainCs.textOverflow === 'ellipsis'),
            nowrap: !!(mainCs && mainCs.whiteSpace === 'nowrap'),
            clipped: !!(main && main.scrollWidth > main.clientWidth + 1),
            labelAbove: !!(main && rep && main.getBoundingClientRect().bottom <= rep.getBoundingClientRect().top + 1),
            labelFull: !!(main && main.getBoundingClientRect().width >= row.getBoundingClientRect().width - 2)
          };
        })
      };
    });
    assert.strictEqual(hang.rows.length, 2, 'two compact hangboard rows');
    assert.ok(Math.abs(hang.rows[0].repX - hang.rows[1].repX) < 1, 'rep buttons share an x ' + JSON.stringify(hang.rows));
    assert.ok(Math.abs(hang.rows[0].statusW - hang.rows[1].statusW) < 1, 'status column is fixed width ' + JSON.stringify(hang.rows));
    assert.ok(hang.rows[0].status.indexOf('6 open') !== -1, hang.rows[0].status);
    assert.ok(hang.rows[1].status.indexOf('1 pass') !== -1 && hang.rows[1].status.indexOf('5 open') !== -1, hang.rows[1].status);
    hang.rows.forEach(function(row){
      assert.strictEqual(row.ellipsis, false, 'no ellipsis ' + row.main);
      assert.strictEqual(row.nowrap, false, 'grip load rest wraps ' + row.main);
      assert.strictEqual(row.clipped, false, 'text is not clipped ' + row.main);
    });
    assert.ok(hang.rows[0].main.indexOf('180s rest') !== -1, hang.rows[0].main);
    assert.ok(hang.rows[0].main.indexOf('…') === -1 && hang.rows[0].main.indexOf('180s r') !== -1, hang.rows[0].main);
    assert.strictEqual(hang.rows[0].labelAbove, true, 'label sits above the rep buttons');
    assert.strictEqual(hang.rows[0].labelFull, true, 'label uses the full row width');

    var labels = await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Prefix', '', { session_running: true });
      trainAddBlock('emom');
      var b = trainSessionState.blocks[0];
      b.rounds = [{
        boulders: [
          { text: 'Boulder 1 - Green V3-5' },
          { text: 'Green V3-5' },
          { text: '' }
        ],
        notes: '',
        rest_after_sec: 180,
        complete: false
      }];
      renderTrainSessionBuilder();
      var card = document.querySelector('[data-block-id="' + b.id + '"]');
      var texts = card ? Array.prototype.slice.call(card.querySelectorAll('.wk-boulder .wk-check-text')).map(function(n){ return n.textContent.trim(); }) : [];
      return { id: b.id, texts: texts };
    });
    assert.deepStrictEqual(labels.texts, [
      'Boulder 1 - Green V3-5',
      'Boulder 2 · Green V3-5',
      'Boulder 3'
    ], JSON.stringify(labels.texts));

    var input = '#tb-' + labels.id + '-r0-b0';
    await page.fill(input, '');
    await page.fill(input, 'Boulder 1 - Green V3-5');
    var live = (await page.locator('[data-block-id="' + labels.id + '"] .wk-boulder .wk-check-text').first().textContent()).trim();
    assert.strictEqual(live, 'Boulder 1 - Green V3-5', 'live label does not double the prefix');
    await page.fill(input, 'Green V4');
    live = (await page.locator('[data-block-id="' + labels.id + '"] .wk-boulder .wk-check-text').first().textContent()).trim();
    assert.strictEqual(live, 'Boulder 1 · Green V4', 'legacy detail still gets the prefix');

    await page.evaluate(function(){ showScreen('screen-train'); });
    await page.waitForFunction(function(title){
      var strip = document.getElementById('train-pinned-strip');
      if(!strip) return false;
      var names = strip.querySelectorAll('.qp-name');
      return names.length >= 3 && names[0].textContent === title;
    }, LONG_TITLE, { timeout: 8000 });
    var pinned = await page.evaluate(function(title){
      var strip = document.getElementById('train-pinned-strip');
      var cs = getComputedStyle(strip);
      var cards = Array.prototype.slice.call(strip.querySelectorAll('.quick-project-row'));
      var stripBox = strip.getBoundingClientRect();
      return {
        dir: cs.flexDirection,
        overflowX: cs.overflowX,
        cards: cards.map(function(card){
          var box = card.getBoundingClientRect();
          var name = card.querySelector('.qp-name');
          var meta = card.querySelector('.qp-meta');
          var star = card.querySelector('.climb-star-btn');
          var start = card.querySelector('.quick-attempt-btn');
          var nameCs = name ? getComputedStyle(name) : null;
          return {
            title: name ? name.textContent : '',
            meta: meta ? meta.textContent.trim() : '',
            width: box.width,
            left: box.left,
            top: box.top,
            bottom: box.bottom,
            nameBottom: name ? name.getBoundingClientRect().bottom : 0,
            metaTop: meta ? meta.getBoundingClientRect().top : 0,
            nameClamped: !!(name && name.scrollHeight > name.clientHeight + 2),
            lineClamp: nameCs ? nameCs.webkitLineClamp : '',
            starLeft: star ? star.getBoundingClientRect().left : 0,
            startRight: start ? start.getBoundingClientRect().right : 0,
            cardRight: box.right,
            nameLeft: name ? name.getBoundingClientRect().left : 0,
            startText: start ? start.textContent.trim() : ''
          };
        }),
        stripWidth: stripBox.width
      };
    }, LONG_TITLE);
    assert.strictEqual(pinned.dir, 'column', 'pinned strip is a vertical list');
    assert.ok(pinned.cards.length >= 3, 'three pinned workouts');
    pinned.cards.forEach(function(card, i){
      assert.ok(card.width > pinned.stripWidth * 0.9, 'card ' + i + ' is full width ' + card.width + ' vs ' + pinned.stripWidth);
      assert.strictEqual(card.nameClamped, false, 'full title ' + card.title);
      assert.ok(card.lineClamp === 'none' || card.lineClamp === 'unset' || card.lineClamp === '', 'no line clamp ' + card.lineClamp);
      assert.ok(card.metaTop >= card.nameBottom - 2, 'type sits under the title');
      assert.strictEqual(card.meta, 'Max hangs');
      assert.ok(card.starLeft > card.nameLeft, 'star is to the right of the title');
      assert.ok(card.cardRight - card.startRight < 20, 'Start sits on the right');
      assert.strictEqual(card.startText, 'Start');
    });
    assert.strictEqual(pinned.cards[0].title, LONG_TITLE);
    assert.ok(pinned.cards[1].top >= pinned.cards[0].bottom - 2, 'cards stack vertically');
    assert.ok(Math.abs(pinned.cards[1].left - pinned.cards[0].left) < 2, 'cards share a left edge');

    var badge = page.locator('#train-hub-chat-unread');
    await page.waitForFunction(function(){
      var hub = document.getElementById('train-hub-chat-unread');
      var dot = document.getElementById('fnav-train-unread');
      if(!hub || !dot || hub.hidden || dot.hidden) return false;
      var cs = getComputedStyle(hub);
      return hub.textContent.trim() === '3' && cs.display !== 'none';
    }, null, { timeout: 8000 });
    await page.locator('#train-hub-card-chat').click();
    await page.waitForFunction(function(){
      var hub = document.getElementById('train-hub-chat-unread');
      var dot = document.getElementById('fnav-train-unread');
      if(!hub || !dot) return false;
      var hubCs = getComputedStyle(hub);
      var dotCs = getComputedStyle(dot);
      return hub.hidden && dot.hidden && hubCs.display === 'none' && dotCs.display === 'none';
    }, null, { timeout: 8000 });
    assert.ok(badge);
  });
  console.log('train-display-fixes ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
