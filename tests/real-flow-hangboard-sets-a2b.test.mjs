import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, waitForScreen, postsTo, firstBody, USER_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index326'/.test(index));
assert.ok(/APP_VERSION = 'index326'/.test(sw));
assert.ok(!/WK_DEFAULT_ON/.test(index));
assert.ok(!/_hangLoadSrc/.test(index));
const sql = readFileSync(join(root, 'sql/training-sessions-assignment-id.sql'), 'utf8');
assert.strictEqual(sql.trim(), [
  'alter table public.training_sessions add column if not exists assignment_id uuid null references public.assignments(id) on delete set null;',
  'create index if not exists training_sessions_assignment_id_idx on public.training_sessions (assignment_id) where assignment_id is not null;'
].join('\n'));

function hangSet(grip, load, rest, n){
  var reps = [];
  for(var i = 0; i < n; i++) reps.push({ ok: null });
  return { grip: grip, load: load, rest_after_sec: rest, reps: reps };
}
function stripId(obj){
  var o = JSON.parse(JSON.stringify(obj));
  delete o.id;
  return o;
}
const CONTRACT_2_GRIPS = {
  shape: 'rep_pass_fail',
  title: 'Hangboard repeaters',
  grip: '',
  assistance: '',
  progression_note: '',
  on_sec: 7,
  off_sec: 3,
  preset: 'repeaters_2_grips',
  complete: false,
  attempts: [],
  sets: [
    hangSet('Half crimp', '', 180, 6),
    hangSet('Half crimp', '', 180, 6),
    hangSet('Half crimp', '', 180, 6),
    hangSet('3-finger drag', '', 180, 6),
    hangSet('3-finger drag', '', 180, 6),
    hangSet('3-finger drag', '', 180, 6)
  ]
};
const COACH_REPEATERS = {
  shape: 'rep_pass_fail',
  title: 'Hangboard repeaters',
  grip: '',
  assistance: '',
  progression_note: '',
  on_sec: 7,
  off_sec: 3,
  preset: 'repeaters',
  complete: false,
  attempts: [],
  sets: [
    hangSet('Half crimp', '', 180, 6),
    hangSet('Half crimp', '', 180, 6),
    hangSet('Half crimp', '', 180, 6)
  ]
};
const COACH_MAX_HANG = {
  shape: 'rep_pass_fail',
  title: 'Max hang',
  grip: '',
  assistance: '',
  progression_note: '',
  on_sec: 10,
  off_sec: null,
  preset: 'max_hang',
  complete: false,
  attempts: [],
  sets: [
    hangSet('', '', 180, 5),
    hangSet('', '', 180, 5),
    hangSet('', '', 180, 5)
  ]
};
const COACH_CUSTOM = {
  shape: 'rep_pass_fail',
  title: '',
  rest_after_sec: 120,
  complete: false,
  attempts: [],
  timer_enabled: false,
  timer_started_at: null,
  timer_ended_at: null,
  interval_started_at: null,
  duration_sec: null,
  grip: '',
  assistance: '',
  sets: [{ reps: [{ ok: null }, { ok: null }, { ok: null }, { ok: null }, { ok: null }] }],
  progression_note: '',
  preset: 'custom',
  on_sec: null,
  off_sec: null
};

function johnBlock(){
  function reps(){ return Array.prototype.slice.call(arguments).map(function(ok){ return { ok: ok }; }); }
  return {
    id: 'john-hb',
    shape: 'rep_pass_fail',
    title: 'Repeaters',
    grip: 'Half crimp',
    assistance: '15 lbs',
    progression_note: '',
    complete: false,
    attempts: [],
    sets: [
      { reps: reps(true, true, true, true, true, true) },
      { reps: reps(true, true, true, true, true, false) },
      { reps: reps(true, true, true, false, null, null) }
    ]
  };
}

function coachAssignmentWorkout(){
  var hb = JSON.parse(JSON.stringify(CONTRACT_2_GRIPS));
  hb.id = 'hb-asg';
  hb.sets[0].load = '35 lb assist';
  hb.sets[1].load = '35 lb assist';
  hb.sets[2].load = '35 lb assist';
  hb.sets[3].load = '45 lb assist';
  hb.sets[4].load = '45 lb assist';
  hb.sets[5].load = '45 lb assist';
  return {
    id: 'cw-coach-hang',
    name: 'Coach hang session',
    training_focus: 'Hangboard',
    sections: [
      {
        id: 'chk-wu',
        shape: 'check',
        title: 'Warm up',
        notes: '',
        complete: false,
        attempts: [],
        items: [
          { id: 'it-1', text: 'Band pulls', complete: false },
          { id: 'it-2', text: 'Easy hangs', complete: false }
        ]
      },
      {
        id: 'emom-asg',
        shape: 'emom',
        title: 'EMOM',
        complete: false,
        attempts: [],
        rounds: [
          { boulders: [{ text: '' }], notes: '', rest_after_sec: 180, complete: false, rest_started_at: null },
          { boulders: [{ text: '' }], notes: '', rest_after_sec: 180, complete: false, rest_started_at: null }
        ]
      },
      hb
    ]
  };
}

function fulfillJson(route, status, body){
  return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) });
}
function stub(opts){
  opts = opts || {};
  var rejectAssignmentCol = !!opts.rejectAssignmentCol;
  return async function(route, info){
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
      await fulfillJson(route, 201, [Object.assign({ id: 'cw-saved-hang' }, info.body || {})]);
      return true;
    }
    if(info.method === 'GET' && info.url.indexOf('/rest/v1/custom_workouts') !== -1){
      var rows = opts.customWorkouts || [];
      await fulfillJson(route, 200, rows);
      return true;
    }
    if(info.method === 'POST' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      if(rejectAssignmentCol && info.body && Object.prototype.hasOwnProperty.call(info.body, 'assignment_id')){
        await fulfillJson(route, 400, { code: '42703', message: 'column assignment_id does not exist' });
        return true;
      }
      await fulfillJson(route, 201, [Object.assign({ id: (info.body && info.body.id) || 'sess-hang' }, info.body || {})]);
      return true;
    }
    if(info.method === 'PATCH' && info.url.indexOf('/rest/v1/training_sessions') !== -1){
      await fulfillJson(route, 200, [info.body || {}]);
      return true;
    }
    if(info.method === 'PATCH' && info.url.indexOf('/rest/v1/assignments') !== -1){
      await fulfillJson(route, 200, [Object.assign({ id: 'asg-hang' }, info.body || {})]);
      return true;
    }
    return false;
  };
}

async function boot(page, userId){
  await page.waitForFunction(function(){
    return typeof window.newTrainSessionState === 'function' && typeof window.isWkOn === 'function';
  }, null, { timeout: 30000 });
  await page.waitForFunction(function(){
    var h = document.getElementById('screen-home');
    return !!(h && h.classList.contains('active'));
  }, null, { timeout: 15000 }).catch(function(){});
  await page.evaluate(function(uid){
    window._authUser = { id: uid };
    window._authToken = 'test-token';
    window._seeTestsRunning = true;
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window.prompt = function(){ return 'Hang persist workout'; };
    try{ localStorage.removeItem('see_train_session_draft'); }catch(e){}
  }, userId);
}

async function openBuilder(page){
  await boot(page, USER_ID);
  await page.evaluate(function(){
    trainSessionState = newTrainSessionState('Hangboard');
    showScreen('screen-train-session');
    renderTrainSessionBuilder();
  });
  await waitForScreen(page, 'screen-train-session');
  await page.evaluate(function(){
    var sk = document.getElementById('route-loading-skeleton');
    if(sk) sk.style.display = 'none';
  });
}

const browser = await launchChromium();
const { server, port } = await startStaticServer();
const flagOffDiffs = [];
try{
  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 1600 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await openBuilder(page);

    var presets = await page.evaluate(function(){
      return {
        two: trainHangPreset('repeaters_2_grips', 'p2'),
        one: trainHangPreset('repeaters', 'p1'),
        max: trainHangPreset('max_hang', 'pm'),
        custom: trainHangPreset('custom', 'pc')
      };
    });
    assert.deepStrictEqual(stripId(presets.two), CONTRACT_2_GRIPS, 'Repeaters - 2 grips contract');
    assert.deepStrictEqual(stripId(presets.one), COACH_REPEATERS, 'Repeaters coach parity');
    assert.deepStrictEqual(stripId(presets.max), COACH_MAX_HANG, 'Max hang coach parity');
    assert.deepStrictEqual(stripId(presets.custom), COACH_CUSTOM, 'Custom coach parity');
    var grouped = await page.evaluate(function(){
      function six(){ return [{}, {}, {}, {}, {}, {}]; }
      return {
        mixed: trainHangCollapsedSummary({
          grip: '', assistance: '',
          sets: [
            { grip: 'Half crimp', load: '35 lb assist', reps: six() },
            { grip: 'Half crimp', load: '35 lb assist', reps: six() },
            { grip: 'Half crimp', load: '35 lb assist', reps: six() },
            { grip: '3-finger drag', load: '45 lb assist', reps: six() },
            { grip: '3-finger drag', load: '45 lb assist', reps: six() },
            { grip: '3-finger drag', load: '45 lb assist', reps: six() }
          ]
        }),
        legacy: trainHangCollapsedSummary({
          grip: 'Half crimp', assistance: '15 lbs',
          sets: [{ reps: six() }, { reps: six() }, { reps: six() }]
        })
      };
    });
    assert.strictEqual(grouped.mixed, 'half crimp 35 lb assist · 3 x 6 | 3-finger drag 45 lb assist · 3 x 6');
    assert.strictEqual(grouped.legacy, 'Half crimp · 15 lbs · 3 sets');

    await page.evaluate(function(){ trainAddBlock('rep_pass_fail'); });
    var hbId = await page.evaluate(function(){ return trainSessionState.blocks[0].id; });
    var legacy = await page.evaluate(function(id){
      var b = trainSessionState.blocks[0];
      var card = document.querySelector('[data-block-id="' + id + '"]');
      return {
        sets: b.sets.length,
        reps: b.sets[0].reps.length,
        hasPerSet: !!card.querySelector('[data-hang-set]'),
        labels: Array.prototype.map.call(card.querySelectorAll('label'), function(n){ return n.textContent.trim(); }),
        placeholders: {
          grip: (document.getElementById('tb-' + id + '-s0-grip') || {}).placeholder || '',
          load: (document.getElementById('tb-' + id + '-s0-load') || {}).placeholder || ''
        },
        presets: Array.prototype.map.call(card.querySelectorAll('[data-hang-preset]'), function(n){ return n.textContent.trim(); })
      };
    }, hbId);
    assert.strictEqual(legacy.sets, 1, 'legacy new hangboard is one set');
    assert.strictEqual(legacy.reps, 5);
    assert.ok(legacy.hasPerSet, 'flag-on editor shows set rows');
    assert.ok(legacy.labels.indexOf('Grip') !== -1);
    assert.ok(legacy.labels.indexOf('Load or assistance') !== -1);
    assert.strictEqual(legacy.placeholders.grip, 'e.g. half crimp');
    assert.strictEqual(legacy.placeholders.load, 'e.g. 35 lb assist or +20 lb');
    assert.deepStrictEqual(legacy.presets, ['Repeaters', 'Repeaters - 2 grips', 'Max hang', 'Custom']);

    await page.click('[data-hang-preset="repeaters_2_grips"]');
    var afterPreset = await page.evaluate(function(){
      var b = trainSessionState.blocks[0];
      return { preset: b.preset, sets: b.sets.length, grips: b.sets.map(function(s){ return s.grip; }), rows: document.querySelectorAll('[data-hang-set]').length };
    });
    assert.strictEqual(afterPreset.preset, 'repeaters_2_grips');
    assert.strictEqual(afterPreset.sets, 6);
    assert.strictEqual(afterPreset.rows, 6);
    assert.deepStrictEqual(afterPreset.grips, ['Half crimp', 'Half crimp', 'Half crimp', '3-finger drag', '3-finger drag', '3-finger drag']);

    await page.fill('#tb-' + hbId + '-s0-load', '35 lb assist');
    var fill1 = await page.evaluate(function(){
      return trainSessionState.blocks[0].sets.map(function(s){ return s.load; });
    });
    assert.deepStrictEqual(fill1, ['35 lb assist', '35 lb assist', '35 lb assist', '', '', ''], 'forward-fill same grip only');

    await page.fill('#tb-' + hbId + '-s1-load', '30 lb assist');
    await page.fill('#tb-' + hbId + '-s0-load', '40 lb assist');
    var fill2 = await page.evaluate(function(){
      return trainSessionState.blocks[0].sets.map(function(s){ return s.load; });
    });
    assert.deepStrictEqual(fill2, ['40 lb assist', '30 lb assist', '30 lb assist', '', '', ''], '40 / 30 / 30; different grip untouched');

    await page.locator('[data-hang-set="1"] [onclick="trainHangSameSet(\'' + hbId + '\',0)"]').click();
    var same = await page.evaluate(function(){
      var sets = trainSessionState.blocks[0].sets;
      return { n: sets.length, grip: sets[1].grip, load: sets[1].load, rest: sets[1].rest_after_sec, reps: sets[1].reps.length, ok: sets[1].reps.map(function(r){ return r.ok; }) };
    });
    assert.strictEqual(same.n, 7);
    assert.strictEqual(same.grip, 'Half crimp');
    assert.strictEqual(same.load, '40 lb assist');
    assert.strictEqual(same.rest, 180);
    assert.strictEqual(same.reps, 6);
    assert.ok(same.ok.every(function(v){ return v === null; }));

    await page.click('[onclick="trainHangNewSet(\'' + hbId + '\',6)"]');
    var added = await page.evaluate(function(){
      var sets = trainSessionState.blocks[0].sets;
      var last = sets[sets.length - 1];
      return { n: sets.length, grip: last.grip || '', load: last.load || '', reps: last.reps.length };
    });
    assert.strictEqual(added.n, 8);
    assert.strictEqual(added.grip, '');
    assert.strictEqual(added.load, '');
    assert.strictEqual(added.reps, 6);

    var atCap = await page.evaluate(function(id){
      return {
        sameDis: !!document.querySelector('[onclick="trainHangSameSet(\'' + id + '\',0)"][disabled]'),
        newDis: !!document.querySelector('[onclick="trainHangNewSet(\'' + id + '\',0)"][disabled]')
      };
    }, hbId);
    assert.ok(atCap.sameDis && atCap.newDis, 'max 8 sets');

    await page.click('[onclick="trainHangRemoveSet(\'' + hbId + '\',7)"]');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.blocks[0].sets.length; }), 7);

    await page.locator('[data-hang-set="1"] button[onclick*="trainToggleRep"]').first().click();
    await page.locator('[onclick="trainHangRemoveSet(\'' + hbId + '\',0)"]').click();
    assert.strictEqual((await page.locator('[onclick="trainHangRemoveSet(\'' + hbId + '\',0)"]').textContent()).trim(), 'Confirm remove set');
    await page.locator('[onclick="trainHangRemoveSet(\'' + hbId + '\',0)"]').click();
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.blocks[0].sets.length; }), 6);

    await page.click('[onclick="trainHangAddRep(\'' + hbId + '\',0)"]');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.blocks[0].sets[0].reps.length; }), 7);
    await page.click('[onclick="trainHangMinusRep(\'' + hbId + '\',0)"]');
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.blocks[0].sets[0].reps.length; }), 6);

    await page.selectOption('#tb-' + hbId + '-s0-rest-u', 'min');
    await page.fill('#tb-' + hbId + '-s0-rest', '3');
    await page.evaluate(function(){ collectTrainBlockFields(); });
    assert.strictEqual(await page.evaluate(function(){ return trainSessionState.blocks[0].sets[0].rest_after_sec; }), 180);

    await page.click('#train-sess-save-workout');
    await page.waitForTimeout(400);
    var savedWorkout = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
    assert.ok(savedWorkout);
    var savedHb = savedWorkout.sections.find(function(b){ return b.shape === 'rep_pass_fail'; });
    assert.strictEqual(savedHb.sets[0].grip, 'Half crimp');
    assert.ok(savedHb.sets[0].load);
    assert.strictEqual(savedHb.sets[0].rest_after_sec, 180);

    await page.click('#train-sess-saved-start-now');
    await waitForScreen(page, 'screen-train-session');
    var seeded = await page.evaluate(function(){
      var b = trainSessionState.blocks.find(function(x){ return x.shape === 'rep_pass_fail'; });
      return { grip: b.sets[0].grip, load: b.sets[0].load, n: b.sets.length, ok: b.sets[0].reps[0].ok, on: b.on_sec, preset: b.preset };
    });
    assert.strictEqual(seeded.n, 6);
    assert.strictEqual(seeded.grip, 'Half crimp');
    assert.ok(seeded.load);
    assert.strictEqual(seeded.ok, null);
    assert.strictEqual(seeded.on, 7);
    assert.strictEqual(seeded.preset, 'repeaters_2_grips');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 1200 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await openBuilder(page);
    assert.strictEqual(await page.evaluate(function(){ return localStorage.getItem('see_wk'); }), null, 'coach-shaped assignment needs no stored flag');
    await page.evaluate(function(asg){
      seedTrainSessionFromItem(asg, { source_assignment_id: 'asg-hang', custom_workout_item_id: asg.id });
    }, coachAssignmentWorkout());
    var fromAsg = await page.evaluate(function(){
      var b = trainSessionState.blocks.find(function(x){ return x.shape === 'rep_pass_fail'; });
      return { n: b.sets.length, load0: b.sets[0].load, load3: b.sets[3].load, src: trainSessionState.source_assignment_id };
    });
    assert.strictEqual(fromAsg.n, 6);
    assert.strictEqual(fromAsg.load0, '35 lb assist');
    assert.strictEqual(fromAsg.load3, '45 lb assist');
    assert.strictEqual(fromAsg.src, 'asg-hang');
    await page.click('#train-sess-save');
    await page.waitForTimeout(400);
    var sess = firstBody(postsTo(recorded, 'training_sessions', 'POST'));
    assert.ok(sess);
    var hb = sess.blocks.find(function(b){ return b.shape === 'rep_pass_fail'; });
    assert.strictEqual(hb.sets[0].load, '35 lb assist');
    assert.strictEqual(hb.sets[3].load, '45 lb assist');
    assert.strictEqual(sess.assignment_id, 'asg-hang');
  });

  for(const flag of ['1', '0']){
    await withPage(browser, port, {
      path: '/index.html?wk=' + flag + '&aw=1',
      viewport: { width: 390, height: 1200 },
      session: { access_token: 'test-token', user: { id: USER_ID } },
      storage: flag === '0' ? { see_wk: '0' } : null,
      stub: stub()
    }, async function(page){
      await boot(page, USER_ID);
      var hist = await page.evaluate(function(block){
        var html = renderTrainSessionDetailHtml({ id: 'hist-john', blocks: [block], notes: 'John hang' });
        return {
          html: html,
          s1: html.indexOf('Set 1') !== -1,
          s2: html.indexOf('Set 2') !== -1,
          s3: html.indexOf('Set 3') !== -1,
          pass: (html.match(/data-hang-rep="pass"/g) || []).length,
          fail: (html.match(/data-hang-rep="fail"/g) || []).length,
          untested: (html.match(/data-hang-rep="untested"/g) || []).length
        };
      }, johnBlock());
      assert.ok(hist.s1 && hist.s2 && hist.s3, 'history shows all three sets (wk=' + flag + ')');
      assert.strictEqual(hist.pass, 14, 'john pass marks wk=' + flag);
      assert.strictEqual(hist.fail, 2, 'john fail marks wk=' + flag);
      assert.strictEqual(hist.untested, 2, 'john untested marks wk=' + flag);

      await page.evaluate(function(){
        trainSessionState = newTrainSessionState('Hangboard');
        trainAddBlock('rep_pass_fail');
        showScreen('screen-train-session');
        renderTrainSessionBuilder();
      });
      var editor = await page.evaluate(function(){
        var card = document.querySelector('[data-block-id="' + trainSessionState.blocks[0].id + '"]');
        var assist = card.querySelector('label[for$="-assist"]');
        return {
          setRows: card.querySelectorAll('[data-hang-set]').length,
          presets: card.querySelectorAll('[data-hang-preset]').length,
          assistLabel: assist ? assist.textContent.trim() : '',
          sets: trainSessionState.blocks[0].sets.length
        };
      });
      assert.strictEqual(editor.sets, 1, 'legacy single-set data wk=' + flag);
      if(flag === '1'){
        assert.ok(editor.setRows >= 1);
        assert.ok(editor.presets >= 4);
        assert.strictEqual(editor.assistLabel, 'Load or assistance');
      } else {
        assert.strictEqual(editor.setRows, 0, 'flag off editor is set[0] only');
        assert.strictEqual(editor.presets, 0);
        assert.strictEqual(editor.assistLabel, 'Assistance');
      }
    });
  }

  const coachWorkout = coachAssignmentWorkout();
  for(const flag of ['1', '0']){
    await withPage(browser, port, {
      path: '/index.html?wk=' + flag + '&aw=1',
      viewport: { width: 390, height: 1600 },
      session: { access_token: 'test-token', user: { id: USER_ID } },
      storage: flag === '0' ? { see_wk: '0' } : null,
      stub: stub({ customWorkouts: [coachWorkout] })
    }, async function(page, recorded){
      await boot(page, USER_ID);
      const errors = [];
      page.on('pageerror', function(err){ errors.push(String(err)); });
      page.on('console', function(msg){ if(msg.type() === 'error') errors.push(msg.text()); });
      await page.evaluate(function(){
        var sk = document.getElementById('route-loading-skeleton');
        if(sk) sk.style.display = 'none';
      });
      await page.evaluate(async function(){
        _trainAssignmentsCache = [{
          id: 'asg-coach',
          title: 'Coach hang session',
          custom_workout_item_id: 'cw-coach-hang',
          athlete_id: window._authUser.id,
          completed_at: null
        }];
        await startTrainSessionFromAssignment('asg-coach');
      });
      await waitForScreen(page, 'screen-train-session');
      await page.evaluate(function(){
        (trainSessionState.blocks || []).forEach(function(b){
          if(b && (b.shape === 'emom' || b.shape === 'check' || b.shape === 'rep_pass_fail')){
            b.editing = true;
          }
        });
        renderTrainSessionBuilder();
      });
      var probe = await page.evaluate(function(){
        var split = splitTrainBlocksByWarmup(trainSessionState.blocks);
        var check = trainSessionState.blocks.find(function(b){ return b.shape === 'check'; });
        var emom = trainSessionState.blocks.find(function(b){ return b.shape === 'emom'; });
        var hb = trainSessionState.blocks.find(function(b){ return b.shape === 'rep_pass_fail'; });
        var checkCard = check ? document.querySelector('[data-block-id="' + check.id + '"]') : null;
        var emomCard = emom ? document.querySelector('[data-block-id="' + emom.id + '"]') : null;
        var hbCard = hb ? document.querySelector('[data-block-id="' + hb.id + '"]') : null;
        var wuWrap = document.getElementById('train-warmup-blocks-wrap');
        return {
          warmupShapes: split.warmup.map(function(b){ return b.shape + ':' + (b.title || ''); }),
          mainShapes: split.main.map(function(b){ return b.shape + ':' + (b.title || ''); }),
          checkInWarmupDom: !!(wuWrap && check && wuWrap.querySelector('[data-block-id="' + check.id + '"]')),
          checkItems: checkCard ? checkCard.querySelectorAll('.wk-check-hit').length : 0,
          boulderLabel: emomCard && emomCard.querySelector('.wk-check-text') ? emomCard.querySelector('.wk-check-text').textContent.trim() : '',
          boulderTick: !!(emomCard && emomCard.querySelector('.wk-box')),
          boulderInput: !!(emom && document.getElementById('tb-' + emom.id + '-r0-b0')),
          hangSetRows: hbCard ? hbCard.querySelectorAll('[data-hang-set]').length : 0,
          hangDots: hbCard ? hbCard.querySelectorAll('button[onclick*="trainToggleRep"]').length : 0
        };
      });
      if(flag === '1'){
        assert.deepStrictEqual(probe.warmupShapes, []);
        assert.ok(probe.mainShapes.some(function(s){ return s.indexOf('check:Warm up') === 0; }), 'Warm up check is in main group');
        assert.strictEqual(probe.checkInWarmupDom, false, 'does not duplicate fixed Warm up slot');
        assert.ok(probe.checkItems >= 2, 'check items tick');
        assert.ok(/^Boulder 1/.test(probe.boulderLabel), 'blank boulder labeled Boulder N');
        assert.ok(probe.boulderTick, 'blank boulder has tick box');
        assert.ok(probe.boulderInput, 'blank boulder text is editable');
        assert.ok(probe.hangSetRows >= 6, 'all hangboard sets visible');
        await page.evaluate(function(){
          var check = trainSessionState.blocks.find(function(b){ return b.shape === 'check'; });
          var hits = document.querySelectorAll('[data-block-id="' + check.id + '"] .wk-check-hit');
          if(hits[0]) hits[0].click();
          var hb = trainSessionState.blocks.find(function(b){ return b.shape === 'rep_pass_fail'; });
          trainToggleRep(hb.id, 0, 0);
          trainToggleRep(hb.id, 0, 0);
        });
        await page.click('#train-sess-save');
        await page.waitForTimeout(400);
        assert.ok(firstBody(postsTo(recorded, 'training_sessions', 'POST')), 'session saved');
        assert.deepStrictEqual(errors.filter(function(e){ return !/Failed to load resource/.test(e); }), []);
      } else {
        if(probe.checkItems < 2) flagOffDiffs.push('flag-off check items not tickable (got ' + probe.checkItems + ')');
        if(!probe.boulderTick) flagOffDiffs.push('flag-off blank boulder has no tick box');
        if(!/^Boulder 1/.test(probe.boulderLabel)) flagOffDiffs.push('flag-off blank boulder label is "' + probe.boulderLabel + '"');
        flagOffDiffs.push('flag-off hangboard editor stays set[0]-only (' + probe.hangDots + ' dots, ' + probe.hangSetRows + ' per-set rows)');
        if(probe.hangDots < 1) flagOffDiffs.push('flag-off hangboard editor has no rep dots');
        try{
          await page.evaluate(function(){
            var hb = trainSessionState.blocks.find(function(b){ return b.shape === 'rep_pass_fail'; });
            if(hb) trainToggleRep(hb.id, 0, 0);
          });
          await page.click('#train-sess-save');
          await page.waitForTimeout(400);
        }catch(e){
          flagOffDiffs.push('flag-off save failed: ' + e.message);
        }
      }
    });
  }

  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await openBuilder(page);
    await page.evaluate(function(){ trainAddBlock('rep_pass_fail'); });
    await page.click('#train-sess-save');
    await page.waitForTimeout(400);
    var blank = firstBody(postsTo(recorded, 'training_sessions', 'POST'));
    assert.ok(blank);
    assert.ok(!Object.prototype.hasOwnProperty.call(blank, 'assignment_id'), 'blank save omits assignment_id');
  });

  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await boot(page, USER_ID);
    await page.evaluate(function(){
      var sk = document.getElementById('route-loading-skeleton');
      if(sk) sk.style.display = 'none';
      _trainPickerItems = [{ id: 'cw-pick', name: 'Picker hang', _source: 'custom', sections: [{ shape: 'rep_pass_fail', title: 'Hangboard', grip: '', assistance: '', sets: [{ reps: [{ ok: null }] }] }] }];
      startTrainSessionFromPicker(0);
    });
    await waitForScreen(page, 'screen-train-session');
    await page.click('#train-sess-save');
    await page.waitForTimeout(400);
    var pick = firstBody(postsTo(recorded, 'training_sessions', 'POST'));
    assert.ok(pick);
    assert.ok(!Object.prototype.hasOwnProperty.call(pick, 'assignment_id'), 'picker save omits assignment_id');
  });

  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub({ rejectAssignmentCol: true })
  }, async function(page, recorded){
    await openBuilder(page);
    await page.evaluate(function(){
      trainSessionState.source_assignment_id = 'asg-missing-col';
      trainAddBlock('rep_pass_fail');
    });
    await page.click('#train-sess-save');
    await page.waitForTimeout(500);
    var posts = postsTo(recorded, 'training_sessions', 'POST');
    assert.ok(posts.length >= 2, 'retries after missing assignment_id column');
    assert.ok(Object.prototype.hasOwnProperty.call(posts[0].body, 'assignment_id'));
    assert.ok(!Object.prototype.hasOwnProperty.call(posts[1].body, 'assignment_id'));
    var savedOk = await page.evaluate(function(){
      return (document.querySelector('.screen.active') || {}).id === 'screen-train-done';
    });
    assert.ok(savedOk, 'session still saves after stripping assignment_id');
  });

  await withPage(browser, port, {
    path: '/index.html?wk=1',
    viewport: { width: 390, height: 900 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page){
    await openBuilder(page);
    var queued = await page.evaluate(async function(){
      trainSessionState.source_assignment_id = 'asg-offline';
      trainAddBlock('rep_pass_fail');
      var orig = sbI;
      sbI = async function(table, payload){
        if(table === 'training_sessions') return sbFail('network', { message: 'offline', table: table });
        return orig.apply(this, arguments);
      };
      await saveTrainSession();
      sbI = orig;
      var q = JSON.parse(localStorage.getItem('see_offline_queue') || '[]');
      return q[0] && q[0].payload ? q[0].payload : null;
    });
    assert.ok(queued, 'offline queue wrote a payload');
    assert.strictEqual(queued.assignment_id, 'asg-offline');
  });

  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 1400 },
    session: { access_token: 'test-token', user: { id: USER_ID } },
    stub: stub()
  }, async function(page, recorded){
    await openBuilder(page);
    await page.evaluate(function(){ trainAddBlock('rep_pass_fail'); });
    var hbId = await page.evaluate(function(){ return trainSessionState.blocks[0].id; });
    await page.click('[data-hang-preset="repeaters_2_grips"]');
    await page.fill('#tb-' + hbId + '-s0-load', '35 lb assist');
    assert.deepStrictEqual(await page.evaluate(function(){
      return trainSessionState.blocks[0].sets.map(function(s){ return s.load; });
    }), ['35 lb assist', '35 lb assist', '35 lb assist', '', '', '']);
    await page.fill('#tb-' + hbId + '-s1-load', '30 lb assist');
    assert.deepStrictEqual(await page.evaluate(function(){
      return trainSessionState.blocks[0].sets.map(function(s){ return s.load; });
    }), ['35 lb assist', '30 lb assist', '30 lb assist', '', '', '']);
    await page.fill('#tb-' + hbId + '-s0-load', '40 lb assist');
    var before = await page.evaluate(function(){
      var sets = trainSessionState.blocks[0].sets;
      return {
        loads: sets.map(function(s){ return s.load; }),
        hidden: sets.some(function(s){ return s && s._hangLoadSrc != null; })
      };
    });
    assert.deepStrictEqual(before.loads, ['40 lb assist', '30 lb assist', '30 lb assist', '', '', '']);
    assert.strictEqual(before.hidden, false);
    await page.click('#train-sess-save-workout');
    await page.waitForTimeout(400);
    var saved = firstBody(postsTo(recorded, 'custom_workouts', 'POST'));
    var savedHb = saved.sections.find(function(b){ return b.shape === 'rep_pass_fail'; });
    assert.deepStrictEqual(savedHb.sets.map(function(s){ return s.load; }), before.loads);
    await page.click('#train-sess-saved-start-now');
    await waitForScreen(page, 'screen-train-session');
    var reopened = await page.evaluate(function(){
      var b = trainSessionState.blocks.find(function(x){ return x.shape === 'rep_pass_fail'; });
      return {
        loads: b.sets.map(function(s){ return s.load; }),
        hidden: b.sets.some(function(s){ return s && s._hangLoadSrc != null; })
      };
    });
    assert.deepStrictEqual(reopened.loads, before.loads, 'save and reopen keeps 40 / 30 / 30');
    assert.strictEqual(reopened.hidden, false);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(function(){
      document.documentElement.style.scrollBehavior = 'auto';
      var el = document.querySelector('[data-hang-set="1"]');
      if(!el) return;
      var node = el.parentElement;
      while(node && node !== document.body){
        var s = getComputedStyle(node);
        var oy = s.overflowY;
        if((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 2){
          var top = el.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop - 8;
          node.scrollTop = Math.max(0, top);
          return;
        }
        node = node.parentElement;
      }
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    var shotDir = '/opt/cursor/artifacts/screenshots';
    if(!existsSync(shotDir)) mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: join(shotDir, 'load-fill-40-30-30.png'), animations: 'disabled' });
  });

  var saveSrc = index.slice(index.indexOf('async function saveTrainSession()'), index.indexOf('function trainWorkoutFocusForSave'));
  assert.ok(/maybeCompleteLinkedAssignment/.test(saveSrc));
  assert.ok(/trainSessionBlocksAllComplete/.test(saveSrc));
  assert.ok(/source_assignment_id/.test(saveSrc));
  assert.ok(!/WK_DEFAULT_ON/.test(index));

  if(flagOffDiffs.length){
    console.log('FLAG-OFF DIFFS:\n' + flagOffDiffs.map(function(d){ return '- ' + d; }).join('\n'));
  }
  console.log('real-flow-hangboard-sets-a2b: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
