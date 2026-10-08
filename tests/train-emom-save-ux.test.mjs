import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index292'/.test(index));
assert.ok(/APP_VERSION = 'index292'/.test(sw));

function extractFn(src, name){
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' missing');
  let i = src.indexOf('{', start);
  let depth = 0;
  for(; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){
      depth--;
      if(depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function extractBetween(src, startId, endId){
  const start = src.indexOf('id="' + startId + '"');
  assert.ok(start >= 0, startId + ' missing');
  const end = src.indexOf('id="' + endId + '"', start);
  assert.ok(end > start, endId + ' after ' + startId);
  return src.slice(start, end);
}

const landing = extractBetween(index, 'screen-train', 'screen-train-start');
assert.ok(!/id="train-hub-card-repeat"/.test(landing));
assert.ok(!/trainRepeatLastSession\(/.test(landing));
assert.ok(/id="train-hub-card-start"/.test(landing));
assert.ok(/Start training/.test(landing));
assert.ok(/id="train-hub-card-build"/.test(landing));
assert.ok(/id="train-hub-card-goals"/.test(landing));
assert.ok(/id="train-pinned-strip"/.test(landing));
assert.ok(landing.indexOf('id="train-hub-card-start"') < landing.indexOf('id="train-hub-cards"'));
assert.ok(landing.indexOf('id="train-hub-card-goals"') > landing.indexOf('id="train-hub-cards"'));

const sess = extractBetween(index, 'screen-train-session', 'screen-train-done');
assert.ok(/id="train-sess-save-workout"/.test(sess));
assert.ok(/saveTrainSessionAsWorkout/.test(sess));
assert.ok(/trainAddBlock\('emom'\)/.test(sess));

const newBlock = extractFn(index, 'newTrainBlock');
assert.ok(/complete: false, rest_started_at: null/.test(newBlock));
assert.ok(/rest_after_sec: 180/.test(newBlock));

const render = extractFn(index, 'renderTrainBlockHtml');
assert.ok(/toggleTrainEmomRoundComplete/.test(render));
assert.ok(/trainAddEmomRound/.test(render));
assert.ok(/tb-'\+b\.id\+'-r'\+ri\+'-b/.test(render));
assert.ok(/tb-'\+b\.id\+'-r'\+ri\+'-rest/.test(render));
assert.ok(/emomRoundIsLocked/.test(render));
assert.ok(/attemptSummary\(b\)/.test(render));
assert.ok(/trainLogAttempt/.test(render));

const collect = extractFn(index, 'collectTrainBlockFields');
assert.ok(/b\.rounds\.forEach\(function\(round, ri\)/.test(collect));
assert.ok(/tb-'\+b\.id\+'-r'\+ri\+'-b/.test(collect));
assert.ok(/tb-'\+b\.id\+'-r'\+ri\+'-notes/.test(collect));
assert.ok(/tb-'\+b\.id\+'-r'\+ri\+'-rest/.test(collect));
assert.ok(!/b\.rounds\[0\]\.notes/.test(collect));

const toggle = extractFn(index, 'toggleTrainEmomRoundComplete');
assert.ok(/b\.rounds\[roundIndex\]/.test(toggle));
assert.ok(/rest_started_at = new Date\(\)\.toISOString\(\)/.test(toggle));

const addRound = extractFn(index, 'trainAddEmomRound');
assert.ok(/mode === 'repeat'/.test(addRound));
assert.ok(/boulders: \[\]/.test(addRound));

const builder = extractFn(index, 'renderTrainSessionBuilder');
assert.ok(/saveTrainSessionDraft\(\)/.test(builder));
assert.ok(/loadTrainSessionDraft\(\)/.test(builder));

const saveSess = extractFn(index, 'saveTrainSession');
assert.ok(/isSbNetworkFail/.test(saveSess));
assert.ok(/offlineQueueAdd\(payload,/.test(saveSess));
assert.ok(/'training_session'/.test(saveSess));
assert.ok(/clearTrainSessionDraft\(\)/.test(saveSess));
assert.ok(/see_pinned_session_id/.test(saveSess));

const saveAs = extractFn(index, 'saveTrainSessionAsWorkout');
assert.ok(/sbI\('custom_workouts'/.test(saveAs));
assert.ok(/sections: trainSessionState\.blocks/.test(saveAs));
assert.ok(/training_focus: trainSessionState\.energy_type/.test(saveAs));
assert.ok(/loadWorkoutLibrary\(\)/.test(saveAs));

const seed = extractFn(index, 'seedTrainBlocksFromSections');
assert.ok(/s && s\.shape/.test(seed));
assert.ok(/trainCloneBlockForDuplicate\(s\)/.test(seed));

const hub = extractFn(index, 'loadTrainHub');
assert.ok(/started_at\.desc/.test(hub));
assert.ok(/maybeResumeTrainSessionDraft/.test(hub));

const queueAdd = extractFn(index, 'offlineQueueAdd');
assert.ok(/type \|\| 'session'/.test(queueAdd));

const flush = extractFn(index, 'flushOfflineQueue');
assert.ok(/entry\.type === 'training_session'/.test(flush));
assert.ok(/sbI\('training_sessions'/.test(flush));
assert.ok(/sbInsertSession\(payload\)/.test(flush));

const cancel = extractFn(index, 'cancelTrainSession');
assert.ok(/clearTrainSessionDraft\(\)/.test(cancel));

const countdown = extractFn(index, 'computeCountdownState');
assert.ok(/phase: 'Counting'/.test(countdown));
const emomRest = extractFn(index, 'emomRoundCountdownState');
assert.ok(/computeCountdownState/.test(emomRest));

let uidN = 0;
const store = {};
const ctx = {
  JSON, Array, String, Number, Date, Math, isNaN,
  uid: function(){ uidN += 1; return 'id-' + uidN; },
  trainSessionState: null,
  _trainPickerType: 'Boulders',
  _trainSessionsCache: [],
  toast: '',
  shown: '',
  prompts: [],
  inserted: [],
  localStorage: {
    getItem: function(k){ return store[k] || null; },
    setItem: function(k, v){ store[k] = String(v); },
    removeItem: function(k){ delete store[k]; }
  },
  window: { prompt: function(msg, def){ ctx.prompts.push({ msg: msg, def: def }); return def; }, _authUser: { id: 'u1' } },
  document: {
    getElementById: function(){ return null; },
    querySelector: function(){ return { id: 'screen-train' }; }
  },
  workoutTypeLabel: function(t){ return t || 'Session'; },
  showToast: function(msg){ ctx.toast = msg; },
  showScreen: function(id){ ctx.shown = id; },
  collectTrainBlockFields: function(){},
  syncTrainSessionFieldsFromDom: function(){},
  requestTrainWakeLock: function(){ ctx.wake = true; },
  releaseTrainWakeLock: function(){ ctx.wake = false; },
  anyTrainIntervalProtocolActive: function(){ return false; },
  loadWorkoutLibrary: function(){ ctx.libraryLoaded = true; },
  sbFailed: function(r){ return !!(r && r.ok === false); },
  sbI: async function(table, payload){ ctx.inserted.push({ table: table, payload: payload }); return { id: 'cw-1' }; },
  renderTrainSessionBuilder: function(){ ctx.renders = (ctx.renders || 0) + 1; },
  computeCountdownState: function(startedAtMs, durationSec, now){
    var durMs = Math.max(0, (Number(durationSec) || 0) * 1000);
    if(startedAtMs == null || startedAtMs === '' || isNaN(Number(startedAtMs))){
      return { phase: 'Ready', remainingMs: durMs };
    }
    var elapsed = (Number(now) || 0) - Number(startedAtMs);
    if(elapsed < 0) elapsed = 0;
    if(elapsed >= durMs) return { phase: 'Done', remainingMs: 0 };
    return { phase: 'Counting', remainingMs: durMs - elapsed };
  }
};
ctx.window.prompt = ctx.window.prompt;
vm.createContext(ctx);
[
  'newTrainSessionState', 'newTrainBlock', 'trainAddBlock',
  'trainAddEmomRound', 'toggleTrainEmomRoundComplete',
  'saveTrainSessionDraft', 'loadTrainSessionDraft', 'clearTrainSessionDraft'
].forEach(function(name){
  vm.runInContext(extractFn(index, name), ctx);
});

vm.runInContext(`
  trainSessionState = newTrainSessionState('Boulders', 'EMOM night');
  trainAddBlock('emom');
`, ctx);
assert.strictEqual(ctx.trainSessionState.blocks[0].shape, 'emom');
assert.strictEqual(ctx.trainSessionState.blocks[0].rounds[0].complete, false);
assert.strictEqual(ctx.trainSessionState.blocks[0].rounds[0].rest_after_sec, 180);

vm.runInContext("trainAddEmomRound(trainSessionState.blocks[0].id, 'repeat')", ctx);
assert.strictEqual(ctx.trainSessionState.blocks[0].rounds.length, 2);
assert.strictEqual(ctx.trainSessionState.blocks[0].rounds[1].boulders.length, 4);
assert.strictEqual(ctx.trainSessionState.blocks[0].rounds[1].complete, false);

vm.runInContext("trainAddEmomRound(trainSessionState.blocks[0].id, 'new')", ctx);
assert.strictEqual(ctx.trainSessionState.blocks[0].rounds.length, 3);
assert.strictEqual(ctx.trainSessionState.blocks[0].rounds[2].boulders.length, 0);

vm.runInContext('toggleTrainEmomRoundComplete(trainSessionState.blocks[0].id, 0)', ctx);
assert.strictEqual(ctx.trainSessionState.blocks[0].rounds[0].complete, true);
assert.ok(ctx.trainSessionState.blocks[0].rounds[0].rest_started_at);

vm.runInContext('saveTrainSessionDraft()', ctx);
assert.ok(store.see_train_session_draft);
vm.runInContext('trainSessionState = null; loadTrainSessionDraft()', ctx);
assert.ok(ctx.trainSessionState && ctx.trainSessionState.blocks[0].shape === 'emom');
vm.runInContext('clearTrainSessionDraft()', ctx);
assert.ok(!store.see_train_session_draft);

console.log('train-emom-save-ux tests: ok');
