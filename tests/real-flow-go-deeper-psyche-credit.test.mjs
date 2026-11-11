import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { startStaticServer, launchChromium, withPage, waitForScreen, USER_ID } from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
assert.strictEqual(index, staging, 'index.html and index-staging.html must match');

const FROM = '2026-09-10T15:00:00';
const IN_WEEK = '2026-09-09T12:00:00';
const OLDER = '2026-08-20T12:00:00';

const browser = await launchChromium();
const { server, port } = await startStaticServer();
try{
  await withPage(browser, port, {
    path: '/index.html',
    viewport: { width: 390, height: 844 },
    session: { access_token: 'test-token', user: { id: USER_ID } }
  }, async function(page){
    await page.waitForFunction(function(){
      return typeof window.psycheRadarCounts === 'function' && typeof window.computePsycheHubStats === 'function';
    }, null, { timeout: 30000 });

    var credit = await page.evaluate(function(args){
      var fromIso = args.fromIso, inWeek = args.inWeek, older = args.older;
      var from = new Date(fromIso);
      var checkins = [
        { id: 'c1', created_at: inWeek, is_checkin: true, zone: 'comfort' },
        { id: 'c2', created_at: '2026-09-08T12:00:00', is_checkin: true, zone: 'learning' },
        { id: 'c3', created_at: '2026-09-07T12:00:00', is_checkin: true, zone: 'panic' }
      ];
      var bee = { id: 'd1', created_at: inWeek, drill_key: 'bee_humming' };
      var done = {
        id: 'climb-done',
        created_at: inWeek,
        is_checkin: false,
        breathing_post: 'Easy and steady',
        gut_post: 'Settled, neutral',
        crux_response: 'Yes — I paused',
        body_state: 'Settled and in control'
      };
      var partial = { id: 'climb-part', created_at: inWeek, is_checkin: false, breathing_post: 'Shallow or tight' };
      var skipped = { id: 'climb-skip', created_at: inWeek, is_checkin: false };
      var enjoyOnly = { id: 'climb-enjoy', created_at: inWeek, is_checkin: false, enjoyment: 5 };
      var climbAw = {
        id: 'aw-climb',
        created_at: inWeek,
        drill_key: 'awareness',
        metadata: { source: 'climb', session_id: 'climb-done', answered: ['breath', 'gut', 'crux', 'body'] }
      };
      var partialAw = {
        id: 'aw-part',
        created_at: inWeek,
        drill_key: 'awareness',
        metadata: { source: 'climb', session_id: 'climb-part', answered: ['breath'] }
      };
      var trainAw = {
        id: 'aw-train',
        created_at: inWeek,
        drill_key: 'awareness',
        metadata: { source: 'training', training_session_id: 'ts-1' }
      };
      function weekOf(climbs, drills){
        return computePsycheHubStats(checkins, drills || [], from, climbs || []).week;
      }
      function radarOf(climbs, drills, days){
        return psycheRadarCounts(checkins, drills || [], days, from, climbs || []);
      }
      var drillWeek = weekOf([], [bee]);
      var deeperWeek = weekOf([done], []);
      var baseWeek = weekOf([], []);
      var seven = radarOf([done], [], 7);
      var sevenDrill = radarOf([], [bee], 7);
      var thirtyOld = radarOf([{
        id: 'climb-old',
        created_at: older,
        is_checkin: false,
        breathing_post: 'I held my breath',
        gut_post: 'Mild flutter',
        crux_response: 'No standout moment',
        body_state: 'Hard to read'
      }], [], 30);
      var sevenOld = radarOf([{
        id: 'climb-old',
        created_at: older,
        is_checkin: false,
        breathing_post: 'I held my breath',
        gut_post: 'Mild flutter',
        crux_response: 'No standout moment',
        body_state: 'Hard to read'
      }], [], 7);
      buildPsycheRadar(seven);
      var label = Array.prototype.map.call(document.querySelectorAll('#psyche-radar-wrap text'), function(t){
        return t.textContent;
      }).filter(function(t){ return t.indexOf('Awareness') === 0; })[0] || '';
      return {
        drillWeek: drillWeek,
        deeperWeek: deeperWeek,
        baseWeek: baseWeek,
        partialWeek: weekOf([partial], [partialAw]),
        skipWeek: weekOf([skipped, enjoyOnly], []),
        resaveWeek: weekOf([done, Object.assign({}, done)], [climbAw, Object.assign({}, climbAw, { id: 'aw-climb-2' })]),
        sevenAw: seven.awareness,
        sevenBreath: seven.breath,
        sevenDrillBreath: sevenDrill.breath,
        sevenDrillAw: sevenDrill.awareness,
        sevenSum: seven.checkin + seven.breath + seven.exposure + seven.viz + seven.relax + seven.talk + seven.awareness,
        drillSum: sevenDrill.checkin + sevenDrill.breath + sevenDrill.exposure + sevenDrill.viz + sevenDrill.relax + sevenDrill.talk + sevenDrill.awareness,
        old30: thirtyOld.awareness,
        old7: sevenOld.awareness,
        trainStill: radarOf([], [trainAw], 7).awareness,
        radarLabel: label
      };
    }, { fromIso: FROM, inWeek: IN_WEEK, older: OLDER });

    assert.strictEqual(credit.deeperWeek, credit.drillWeek, 'completed Go deeper adds exactly one drill to the Psyche week total');
    assert.notStrictEqual(credit.deeperWeek, credit.baseWeek, 'the extra credit is visible on the week total');
    assert.strictEqual(credit.partialWeek, credit.baseWeek, 'partial Go deeper adds none');
    assert.strictEqual(credit.skipWeek, credit.baseWeek, 'skipped Go deeper adds none');
    assert.strictEqual(credit.resaveWeek, credit.deeperWeek, 're-save does not double');
    assert.strictEqual(credit.sevenAw, 1, '7-day radar counts the completed climb once');
    assert.strictEqual(credit.sevenBreath, credit.sevenDrillBreath - 1, 'Go deeper does not land on another axis');
    assert.strictEqual(credit.sevenSum, credit.drillSum, '7-day total matches one drill');
    assert.strictEqual(credit.old30, credit.sevenDrillAw + 1, 'older completed climb is credited inside 30 days');
    assert.strictEqual(credit.old7, 0, 'older climb outside 7 days is not in the 7-day view');
    assert.strictEqual(credit.trainStill, 1, 'training awareness credit is unchanged');
    assert.strictEqual(credit.radarLabel, 'Awareness 1', 'radar shows the one credit');

    await page.evaluate(function(){
      trainSessionState = newTrainSessionState('Boulders', 'Labels');
      showScreen('screen-train-session');
      renderTrainSessionBuilder();
      trainAddBlockMenu();
    });
    await waitForScreen(page, 'screen-train-session');
    var chip = await page.evaluate(function(){
      var btn = document.querySelector('#train-block-menu [data-wk-menu="mental"]');
      return {
        label: btn ? btn.textContent.trim() : '',
        key: btn ? btn.getAttribute('data-wk-menu') : ''
      };
    });
    assert.strictEqual(chip.label, 'Psyche', 'builder chip reads Psyche');
    assert.strictEqual(chip.key, 'mental', 'stored menu key stays mental');
    var fresh = await page.evaluate(function(){
      trainAddBlock('mental');
      var b = trainSessionState.blocks[trainSessionState.blocks.length - 1];
      return { title: b.title, shape: b.shape };
    });
    assert.strictEqual(fresh.title, 'Psyche', 'new block default title is Psyche');
    assert.strictEqual(fresh.shape, 'section', 'new mental block still stores a section');
    var saved = await page.evaluate(function(){
      trainSessionState.blocks.push({
        id: 'saved-mental',
        shape: 'section',
        title: 'Mental',
        notes: 'Box breathing',
        rest_after_sec: 0,
        complete: false,
        attempts: []
      });
      renderTrainSessionBuilder();
      var card = document.querySelector('.train-block-card[data-block-id="saved-mental"] .train-block-title');
      var block = trainSessionState.blocks.find(function(b){ return b.id === 'saved-mental'; });
      return { shown: card ? card.textContent : '', stored: block ? block.title : '' };
    });
    assert.strictEqual(saved.shown, 'Mental', 'saved block titled Mental still opens unchanged');
    assert.strictEqual(saved.stored, 'Mental');
  });
  console.log('real-flow-go-deeper-psyche-credit: ok');
} finally {
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
