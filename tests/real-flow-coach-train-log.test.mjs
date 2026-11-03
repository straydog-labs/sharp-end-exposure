import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap,
  COACH_ID, ATHLETE_ID
} from './harness.mjs';

const WORKOUT = {
  id: 'cw-1',
  name: 'Open power',
  sections: [
    {
      id: 'src-emom',
      shape: 'emom',
      title: 'Power EMOM',
      complete: true,
      attempts: [{ at: '2026-10-01T00:00:00.000Z', note: 'old' }],
      rounds: [{
        boulders: [
          { id: 'bo-1', text: 'V4 orange', complete: true },
          { id: 'bo-2', text: 'V5 black', complete: true }
        ],
        notes: 'send the orange',
        rest_after_sec: 180,
        complete: true,
        rest_started_at: '2026-10-01T00:00:00.000Z'
      }]
    },
    {
      id: 'src-hb',
      shape: 'rep_pass_fail',
      title: 'Repeaters',
      grip: 'half crimp',
      assistance: '+35 lb',
      complete: true,
      sets: [{ reps: [{ ok: true }, { ok: false }, { ok: null }] }]
    }
  ]
};

const ASSIGNMENTS = [
  {
    id: 'asg-1',
    title: 'Open power',
    athlete_id: ATHLETE_ID,
    coach_id: COACH_ID,
    custom_workout_item_id: 'cw-1',
    library_item_id: null,
    completed_at: null,
    created_at: '2026-11-01T12:00:00.000Z',
    deleted_at: null
  },
  {
    id: 'asg-done',
    title: 'Already done',
    athlete_id: ATHLETE_ID,
    coach_id: COACH_ID,
    custom_workout_item_id: 'cw-9',
    completed_at: '2026-10-01T12:00:00.000Z',
    created_at: '2026-10-01T12:00:00.000Z',
    deleted_at: null
  },
  {
    id: 'asg-lib',
    title: 'Library only',
    athlete_id: ATHLETE_ID,
    coach_id: COACH_ID,
    custom_workout_item_id: null,
    library_item_id: 'lib-1',
    completed_at: null,
    created_at: '2026-11-01T12:00:00.000Z',
    deleted_at: null
  }
];

function shapesOf(blocks){
  return (blocks || []).map(function(b){ return b && b.shape; });
}

async function openAthlete(page){
  await page.waitForSelector('.roster-row', { timeout: 15000 });
  await tap(page, '.roster-row');
  await page.waitForSelector('#coach-log-launch', { timeout: 8000 });
  await page.waitForSelector('#coach-train-log-launch', { timeout: 8000 });
}

async function openTrainLog(page){
  await tap(page, '#coach-train-log-launch');
  await page.waitForFunction(function(){
    var el = document.getElementById('coach-train-log-overlay');
    return !!(el && el.classList.contains('open'));
  }, null, { timeout: 8000 });
}

async function waitAssignmentOption(page){
  await page.waitForFunction(function(){
    var sel = document.getElementById('ctl-assignment');
    if(!sel) return false;
    return Array.prototype.some.call(sel.options, function(o){ return o.value === 'asg-1'; });
  }, null, { timeout: 8000 });
}

function coachSession(){
  return {
    access_token: 'test-token',
    user: { id: COACH_ID, email: 'coach@test.local' }
  };
}

function baseOpts(extra){
  extra = extra || {};
  return {
    path: '/coach-dashboard.html',
    session: coachSession(),
    assignments: ASSIGNMENTS,
    stub: async function(route, info){
      if(info.method === 'GET' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([WORKOUT])
        });
        return true;
      }
      if(extra.onTrainPost && info.method === 'POST' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
        await extra.onTrainPost(route, info);
        return true;
      }
      return false;
    }
  };
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, baseOpts(), async function(page, recorded){
      await openAthlete(page);
      const place = await page.evaluate(function(){
        function box(id){
          var el = document.getElementById(id);
          if(!el) return null;
          var r = el.getBoundingClientRect();
          var cs = getComputedStyle(el);
          return {
            text: (el.textContent || '').trim(),
            top: r.top, left: r.left, right: r.right, height: r.height,
            fontSize: parseFloat(cs.fontSize),
            minHeight: parseFloat(cs.minHeight) || r.height,
            bg: cs.backgroundColor,
            border: cs.borderTopWidth
          };
        }
        var climb = box('coach-log-launch');
        var train = box('coach-train-log-launch');
        var hub = document.getElementById('athlete-hub-cards');
        return {
          climb: climb,
          train: train,
          sameHub: !!(hub && climb && train && hub.contains(document.getElementById('coach-log-launch')) && hub.contains(document.getElementById('coach-train-log-launch')))
        };
      });
      assert.strictEqual(place.climb.text, 'Log a climb');
      assert.strictEqual(place.train.text, 'Log a training session');
      assert.ok(place.sameHub, 'both buttons live in the athlete header');
      assert.ok(Math.abs(place.climb.height - place.train.height) <= 4, 'same size family');
      assert.strictEqual(place.climb.fontSize, place.train.fontSize);
      assert.ok(place.train.left >= place.climb.right - 2, 'training button sits beside Log a climb');
      assert.notStrictEqual(place.climb.bg, place.train.bg, 'Log a climb stays primary; training log is secondary');

      await openTrainLog(page);
      const blank = await page.evaluate(function(){
        return {
          cards: document.querySelectorAll('#ctl-cwb-root .cwb-card').length,
          title: document.getElementById('ctl-title').value,
          date: document.getElementById('ctl-date').value,
          time: document.getElementById('ctl-time').value
        };
      });
      assert.strictEqual(blank.cards, 0, 'Blank starts with no blocks');
      assert.strictEqual(blank.title, 'Training session');
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(blank.date), 'date defaults');
      assert.ok(/^\d{2}:\d{2}/.test(blank.time), 'start time defaults');

      await tap(page, '#ctl-starts [data-start="hangboard"]');
      const hb = await page.evaluate(function(){
        var cards = Array.prototype.map.call(document.querySelectorAll('#ctl-cwb-root .cwb-card'), function(card){
          return { kick: card.querySelector('.cwb-kick').textContent, title: (card.querySelector('[data-f="title"]') || {}).value || '' };
        });
        return { title: document.getElementById('ctl-title').value, cards: cards };
      });
      assert.strictEqual(hb.title, 'Hangboard');
      assert.strictEqual(hb.cards.length, 1);
      assert.ok(/Hangboard/.test(hb.cards[0].kick));
      assert.strictEqual(hb.cards[0].title, 'Hangboard');

      await tap(page, '#ctl-starts [data-start="emom"]');
      const em = await page.evaluate(function(){
        var card = document.querySelector('#ctl-cwb-root .cwb-card');
        return {
          title: document.getElementById('ctl-title').value,
          n: document.querySelectorAll('#ctl-cwb-root .cwb-card').length,
          kick: card ? card.querySelector('.cwb-kick').textContent : '',
          blockTitle: card ? card.querySelector('[data-f="title"]').value : ''
        };
      });
      assert.strictEqual(em.title, 'EMOM');
      assert.strictEqual(em.n, 1);
      assert.ok(/EMOM|Climbing/.test(em.kick));
      assert.strictEqual(em.blockTitle, 'EMOM');

      await tap(page, '#ctl-starts [data-start="full"]');
      const full = await page.evaluate(function(){
        return {
          title: document.getElementById('ctl-title').value,
          kicks: Array.prototype.map.call(document.querySelectorAll('#ctl-cwb-root .cwb-kick'), function(n){ return n.textContent; }),
          titles: Array.prototype.map.call(document.querySelectorAll('#ctl-cwb-root [data-f="title"]'), function(n){ return n.value; })
        };
      });
      assert.strictEqual(full.title, 'Full session');
      assert.strictEqual(full.kicks.length, 3, 'EMOM + Hangboard + Mental');
      assert.ok(/Climbing|EMOM/.test(full.kicks[0]));
      assert.ok(/Hangboard/.test(full.kicks[1]));
      assert.ok(/Mental/.test(full.kicks[2]));
      assert.deepStrictEqual(full.titles, ['EMOM', 'Hangboard', 'Mental']);

      await waitAssignmentOption(page);
      const options = await page.evaluate(function(){
        var sel = document.getElementById('ctl-assignment');
        return Array.prototype.map.call(sel.options, function(o){ return { value: o.value, text: o.textContent }; });
      });
      assert.ok(options.some(function(o){ return o.value === 'asg-1'; }), 'open custom assignment listed');
      assert.ok(!options.some(function(o){ return o.value === 'asg-done' || o.value === 'asg-lib'; }),
        'completed and library-only assignments stay out of the dropdown');

      await page.selectOption('#ctl-assignment', 'asg-1');
      await page.waitForFunction(function(){
        return document.querySelectorAll('#ctl-cwb-root .cwb-card').length === 2
          && !!document.querySelector('#ctl-cwb-root [data-f="boulder"]');
      }, null, { timeout: 8000 });
      const cloned = await page.evaluate(function(){
        var ticks = Array.prototype.map.call(document.querySelectorAll('#ctl-cwb-root [data-act="tick-boulder"]'), function(b){
          return b.getAttribute('aria-pressed');
        });
        var reps = Array.prototype.map.call(document.querySelectorAll('#ctl-cwb-root [data-act="cycle-rep"]'), function(b){
          return b.className;
        });
        var texts = Array.prototype.map.call(document.querySelectorAll('#ctl-cwb-root [data-f="boulder"]'), function(n){ return n.value; });
        var wrap = document.getElementById('ctl-assign-wrap');
        var box = document.getElementById('ctl-assign-complete');
        return {
          title: document.getElementById('ctl-title').value,
          ticks: ticks,
          reps: reps,
          texts: texts,
          grip: (document.querySelector('#ctl-cwb-root [data-f="grip"]') || {}).value || '',
          load: (document.querySelector('#ctl-cwb-root [data-f="assistance"]') || {}).value || '',
          assignShown: !!(wrap && !wrap.hidden),
          assignChecked: !!(box && box.checked)
        };
      });
      assert.strictEqual(cloned.title, 'Open power');
      assert.deepStrictEqual(cloned.texts, ['V4 orange', 'V5 black']);
      assert.ok(cloned.ticks.length === 2 && cloned.ticks.every(function(t){ return t === 'false'; }),
        'cloned boulders reset ticks, got ' + JSON.stringify(cloned.ticks));
      assert.ok(cloned.reps.length === 3 && cloned.reps.every(function(c){ return c.indexOf('is-pass') === -1 && c.indexOf('is-fail') === -1; }),
        'cloned hangboard reps reset, got ' + JSON.stringify(cloned.reps));
      assert.strictEqual(cloned.grip, 'half crimp');
      assert.strictEqual(cloned.load, '+35 lb');
      assert.ok(cloned.assignShown && cloned.assignChecked, 'Mark assignment complete defaults on');

      await page.locator('#ctl-cwb-root [data-f="boulder"]').first().fill('V6 purple');
      await tap(page, '#ctl-cwb-root [data-act="tick-boulder"]');
      var rep = page.locator('#ctl-cwb-root [data-act="cycle-rep"]').first();
      await rep.click();
      let repClass = await rep.getAttribute('class');
      assert.ok(/is-pass/.test(repClass), 'untested -> pass, got ' + repClass);
      await rep.click();
      repClass = await rep.getAttribute('class');
      assert.ok(/is-fail/.test(repClass), 'pass -> fail, got ' + repClass);
      await rep.click();
      repClass = await rep.getAttribute('class');
      assert.ok(!/is-pass|is-fail/.test(repClass), 'fail -> untested, got ' + repClass);
      await rep.click();
      const tickOn = await page.locator('#ctl-cwb-root [data-act="tick-boulder"]').first().getAttribute('aria-pressed');
      assert.strictEqual(tickOn, 'true');

      await tap(page, '#ctl-cwb-root .cwb-card >> nth=0 >> [data-act="mark-block"]');
      await tap(page, '#ctl-mark-all');
      const marked = await page.evaluate(function(){
        var ticks = Array.prototype.map.call(document.querySelectorAll('#ctl-cwb-root [data-act="tick-boulder"]'), function(b){
          return b.getAttribute('aria-pressed');
        });
        var reps = Array.prototype.map.call(document.querySelectorAll('#ctl-cwb-root [data-act="cycle-rep"]'), function(b){
          return /is-pass/.test(b.className);
        });
        return { ticks: ticks, reps: reps };
      });
      assert.ok(marked.ticks.every(function(t){ return t === 'true'; }), 'mark all ticks boulders');
      assert.ok(marked.reps.every(Boolean), 'mark all sets hangboard reps to pass');

      await page.fill('#ctl-notes', 'Felt steady');
      await tap(page, '#ctl-save');
      await page.waitForFunction(function(){
        var toast = document.getElementById('coach-toast');
        return !!(toast && /Training session logged\./.test(toast.textContent || ''));
      }, null, { timeout: 8000 });
      const after = await page.evaluate(function(){
        return {
          again: document.getElementById('ctl-again').style.display !== 'none',
          backAth: document.getElementById('ctl-back-athlete').style.display !== 'none',
          locked: document.getElementById('coach-train-log-overlay').classList.contains('locked'),
          saveDisabled: document.getElementById('ctl-save').disabled,
          journal: (document.getElementById('detail-sessions') || {}).textContent || ''
        };
      });
      assert.ok(after.again && after.backAth, 'Log another and Back to athlete');
      assert.ok(after.locked && after.saveDisabled, 'form locks after save');
      assert.ok(/Open power/.test(after.journal), 'journal shows the new session without a reload');
      assert.ok(/Logged by coach/.test(after.journal), 'journal tags the coach log');
      assert.ok(/2 of 2 sent/.test(after.journal), 'EMOM summary uses sent count');
      assert.ok(/half crimp/.test(after.journal) && /\+35 lb/.test(after.journal) && /1 set/.test(after.journal),
        'hangboard summary keeps grip/load/sets');

      const posts = recorded.filter(function(r){
        return r.method === 'POST' && r.url.indexOf('/rest/v1/training_sessions') !== -1;
      });
      assert.strictEqual(posts.length, 1, 'one training_sessions insert');
      const body = posts[0].body;
      assert.strictEqual(body.user_id, ATHLETE_ID);
      assert.strictEqual(body.logged_by_coach, true);
      assert.strictEqual(body.logged_by, COACH_ID);
      assert.strictEqual(body.device_id, 'coach-dashboard');
      assert.strictEqual(body.energy_type, null);
      assert.strictEqual(body.app_version, 'coach-dashboard');
      assert.strictEqual(body.template_id, 'cw-1');
      assert.strictEqual(body.notes, 'Open power\nFelt steady');
      assert.strictEqual(body.ended_at, body.started_at);
      assert.ok(body.id && body.started_at);
      assert.deepStrictEqual(shapesOf(body.blocks), ['emom', 'rep_pass_fail']);
      assert.strictEqual(body.blocks[0].rounds[0].boulders[0].text, 'V6 purple');
      assert.strictEqual(body.blocks[0].rounds[0].boulders[0].complete, true);
      assert.strictEqual(body.blocks[0].rounds[0].boulders[1].complete, true);
      assert.strictEqual(body.blocks[0].shape, 'emom');
      assert.ok(body.blocks[1].sets[0].reps.every(function(rp){ return rp.ok === true; }),
        'hangboard ok keys kept, got ' + JSON.stringify(body.blocks[1].sets));
      assert.strictEqual(body.blocks[1].grip, 'half crimp');
      const patches = recorded.filter(function(r){
        return r.method === 'PATCH' && r.url.indexOf('/rest/v1/assignments') !== -1;
      });
      assert.strictEqual(patches.length, 1, 'checked assignment is marked complete');
      assert.ok(patches[0].url.indexOf('id=eq.asg-1') !== -1);
      assert.ok(patches[0].body && patches[0].body.completed_at);
    });

    await withPage(browser, port, baseOpts(), async function(page, recorded){
      await openAthlete(page);
      await openTrainLog(page);
      await waitAssignmentOption(page);
      await page.selectOption('#ctl-assignment', 'asg-1');
      await page.waitForSelector('#ctl-assign-complete', { timeout: 8000 });
      await page.evaluate(function(){ document.getElementById('ctl-assign-complete').checked = false; });
      await tap(page, '#ctl-save');
      await page.waitForFunction(function(){
        var toast = document.getElementById('coach-toast');
        return !!(toast && /Training session logged\./.test(toast.textContent || ''));
      }, null, { timeout: 8000 });
      const patches = recorded.filter(function(r){
        return r.method === 'PATCH' && r.url.indexOf('/rest/v1/assignments') !== -1;
      });
      const posts = recorded.filter(function(r){
        return r.method === 'POST' && r.url.indexOf('/rest/v1/training_sessions') !== -1;
      });
      assert.strictEqual(posts.length, 1);
      assert.strictEqual(posts[0].body.template_id, 'cw-1');
      assert.strictEqual(patches.length, 0, 'unchecked assignment is not patched');
    });

    var acceptReplay = false;
    var trainInserts = 0;
    await withPage(browser, port, baseOpts({
      onTrainPost: async function(route){
        if(!acceptReplay) return route.abort('failed');
        trainInserts += 1;
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'saved-1' }])
        });
      }
    }), async function(page){
      await openAthlete(page);
      await openTrainLog(page);
      await tap(page, '#ctl-starts [data-start="emom"]');
      await page.locator('#ctl-cwb-root [data-f="boulder"]').first().fill('V3 keep');
      await tap(page, '#ctl-save');
      await page.waitForFunction(function(){
        var msg = document.getElementById('ctl-msg');
        return !!(msg && /Saved on this device, will retry/i.test(msg.textContent || ''));
      }, null, { timeout: 8000 });
      const queued = await page.evaluate(function(){
        var q = [];
        try{ q = JSON.parse(localStorage.getItem('see-coach-train-log-queue-v1') || '[]'); }catch(e){}
        var boulder = document.querySelector('#ctl-cwb-root [data-f="boulder"]');
        return { n: q.length, id: q[0] && q[0].id, text: boulder ? boulder.value : '' };
      });
      assert.strictEqual(queued.n, 1, 'network failure queues one log');
      assert.ok(queued.id, 'queue entry keeps the client id');
      assert.strictEqual(queued.text, 'V3 keep', 'form stays so the log is not lost');
      acceptReplay = true;
      await tap(page, '#ctl-retry-now');
      await page.waitForTimeout(400);
      await tap(page, '#ctl-retry-now');
      await page.waitForTimeout(400);
      assert.strictEqual(trainInserts, 1, 'replay inserts once');
      const left = await page.evaluate(function(){
        var q = [];
        try{ q = JSON.parse(localStorage.getItem('see-coach-train-log-queue-v1') || '[]'); }catch(e){}
        return q.length;
      });
      assert.strictEqual(left, 0, 'success dequeues');
    });

    await withPage(browser, port, baseOpts({
      onTrainPost: async function(route, info){
        var body = info.body || {};
        function missing(col){
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 'PGRST204',
              message: "Could not find the '" + col + "' column of 'training_sessions' in the schema cache"
            })
          });
        }
        if(Object.prototype.hasOwnProperty.call(body, 'logged_by_coach')) return missing('logged_by_coach');
        if(Object.prototype.hasOwnProperty.call(body, 'logged_by')) return missing('logged_by');
        if(Object.prototype.hasOwnProperty.call(body, 'template_id')) return missing('template_id');
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify([body])
        });
      }
    }), async function(page, recorded){
      await openAthlete(page);
      await openTrainLog(page);
      await waitAssignmentOption(page);
      await page.selectOption('#ctl-assignment', 'asg-1');
      await page.waitForFunction(function(){
        return document.querySelectorAll('#ctl-cwb-root .cwb-card').length === 2;
      }, null, { timeout: 8000 });
      await page.evaluate(function(){ document.getElementById('ctl-assign-complete').checked = false; });
      await tap(page, '#ctl-save');
      await page.waitForFunction(function(){
        var msg = document.getElementById('ctl-msg');
        return !!(msg && /Saved, not tagged Logged by coach/.test(msg.textContent || ''));
      }, null, { timeout: 8000 });
      const posts = recorded.filter(function(r){
        return r.method === 'POST' && r.url.indexOf('/rest/v1/training_sessions') !== -1;
      });
      assert.ok(posts.length >= 4, 'strips logged_by_coach, logged_by, template_id in turn, got ' + posts.length);
      assert.ok(Object.prototype.hasOwnProperty.call(posts[0].body, 'logged_by_coach'));
      assert.ok(!Object.prototype.hasOwnProperty.call(posts[1].body, 'logged_by_coach'));
      assert.ok(Object.prototype.hasOwnProperty.call(posts[1].body, 'logged_by'));
      assert.ok(!Object.prototype.hasOwnProperty.call(posts[2].body, 'logged_by'));
      assert.ok(Object.prototype.hasOwnProperty.call(posts[2].body, 'template_id'));
      assert.ok(!Object.prototype.hasOwnProperty.call(posts[3].body, 'template_id'));
      assert.strictEqual(posts[3].body.user_id, ATHLETE_ID);
      assert.deepStrictEqual(shapesOf(posts[3].body.blocks), ['emom', 'rep_pass_fail']);
    });

    console.log('real-flow-coach-train-log: ok');
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
