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
assert.ok(/var app_version = 'index272'/.test(index));
assert.ok(/APP_VERSION = 'index272'/.test(sw));

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

const trainStart = index.indexOf('id="screen-train"');
const nextScreen = index.indexOf('id="screen-train-start"', trainStart);
const landing = index.slice(trainStart, nextScreen);
assert.ok(/id="train-hub-recent-mini"/.test(landing));
assert.ok(/id="train-hub-recent-wrap"/.test(landing));
assert.ok(/Recent sessions/.test(landing));
assert.ok(/See all/.test(landing));
assert.ok(!/id="train-energy-grid"/.test(landing), 'landingLean: no #train-energy-grid on screen-train');
assert.ok(!/id="train-goals-section"/.test(landing));
assert.ok(!/id="coach-chat-section"/.test(landing));
assert.ok(/id="train-hub-card-chat"/.test(landing), 'hub cards stay in place');

const showSrc = extractFn(index, 'showScreen');
assert.ok(/if\(id==='screen-train'\)\{[^}]*loadTrainHub\(\)/.test(showSrc.replace(/\n/g, ' ')));

const hubSrc = extractFn(index, 'loadTrainHub');
assert.ok((hubSrc.match(/renderTrainHubRecentMini\(\)/g) || []).length === 2);

assert.ok(/function renderTrainHubRecentMini/.test(index));
assert.ok(/function trainCloneBlockForDuplicate/.test(index));
assert.ok(/function trainStartDuplicatedSession/.test(index));
assert.ok(/function trainDuplicateSession/.test(index));
assert.ok(/\.train-hub-duplicate-btn\{/.test(index));

const recentList = extractFn(index, 'renderTrainSessionList');
assert.ok(!/trainDuplicateSession/.test(recentList), 'full recent list stays without Duplicate');

let uidN = 0;
const ctx = {
  JSON,
  Array,
  String,
  Number,
  Date,
  Math,
  isNaN,
  uid: function(){ uidN += 1; return 'new-' + uidN; },
  _trainSessionsCache: [],
  trainSessionState: { id: 'old-in-progress' },
  showToast: function(msg){ ctx.toast = msg; },
  showScreen: function(id){ ctx.shown = id; },
  formatChatTimestamp: function(){ return 'Tue 3:00p'; },
  workoutTypeLabel: function(t){ return t || 'Session'; },
  trainNotesLineIsReflection: function(){ return false; },
  lastHtml: '',
  document: {
    getElementById: function(id){
      if(id !== 'train-hub-recent-mini') return null;
      return { set innerHTML(v){ ctx.lastHtml = v; }, get innerHTML(){ return ctx.lastHtml; } };
    }
  }
};
vm.createContext(ctx);
['escTrainHtml', 'parseTrainSessionBlocks', 'trainSessionWorkoutName', 'newTrainSessionState',
  'trainCloneBlockForDuplicate', 'trainStartDuplicatedSession', 'trainDuplicateSession',
  'renderTrainHubRecentMini'].forEach(function(name){
  vm.runInContext(extractFn(index, name), ctx);
});

vm.runInContext('renderTrainHubRecentMini()', ctx);
assert.ok(/No sessions yet/.test(ctx.lastHtml));
assert.ok(!/Duplicate/.test(ctx.lastHtml));

ctx._trainSessionsCache = [1,2,3,4].map(function(i){
  return {
    id: 'sess-' + i,
    energy_type: 'Hangboard',
    notes: 'Repeaters ' + i,
    started_at: '2026-09-25T12:00:00.000Z',
    blocks: [{ id: 'old-' + i, shape: 'interval', title: '7/3', work_sec: 7, rest_sec: 3, target_sets: 4, complete: true, attempts: [{ note: 'x' }] }]
  };
});
vm.runInContext('renderTrainHubRecentMini()', ctx);
assert.strictEqual((ctx.lastHtml.match(/train-hub-duplicate-btn/g) || []).length, 3);
assert.ok(/Repeaters 1/.test(ctx.lastHtml) && /Repeaters 3/.test(ctx.lastHtml));
assert.ok(!/Repeaters 4/.test(ctx.lastHtml), 'mini list caps at 3');
assert.ok(/trainDuplicateSession\('sess-1'\)/.test(ctx.lastHtml));
assert.ok(/openTrainSessionDetail\('sess-1'\)/.test(ctx.lastHtml));
assert.ok(/1 block/.test(ctx.lastHtml));

const dirty = {
  id: 'old-iv',
  shape: 'interval',
  title: '7on 3off',
  work_sec: 7,
  rest_sec: 3,
  target_sets: 6,
  groups: [{ sets: 2 }],
  complete: true,
  attempts: [{ note: 'attempt 1' }],
  timer_enabled: true,
  timer_started_at: 't',
  timer_ended_at: 'e',
  interval_started_at: 'i',
  _interval_is_paused: true,
  _interval_paused_elapsed_ms: 900,
  is_warmup: true,
  rest_after_sec: 60
};
ctx.b = dirty;
const cloned = vm.runInContext('trainCloneBlockForDuplicate(b)', ctx);
assert.notStrictEqual(cloned.id, 'old-iv');
assert.strictEqual(cloned.shape, 'interval');
assert.strictEqual(cloned.title, '7on 3off');
assert.strictEqual(cloned.work_sec, 7);
assert.strictEqual(cloned.target_sets, 6);
assert.strictEqual(cloned.complete, false);
assert.strictEqual(cloned.attempts.length, 0);
assert.strictEqual(cloned.timer_enabled, false);
assert.strictEqual(cloned.interval_started_at, null);
assert.strictEqual(cloned._interval_is_paused, false);
assert.strictEqual(cloned.is_warmup, true);
assert.deepStrictEqual(cloned.groups, [{ sets: 2 }]);
cloned.groups[0].sets = 9;
assert.strictEqual(dirty.groups[0].sets, 2, 'groups are deep-copied');

const rpf = vm.runInContext(
  'trainCloneBlockForDuplicate({ shape: "rep_pass_fail", grip: "20mm", sets: [{ reps: [{ ok: true }, { ok: false }] }] })',
  ctx
);
assert.strictEqual(rpf.grip, '20mm');
assert.strictEqual(rpf.sets[0].reps[0].ok, null);
assert.strictEqual(rpf.sets[0].reps[1].ok, null);

vm.runInContext("trainDuplicateSession('sess-1')", ctx);
assert.ok(ctx.trainSessionState.id !== 'old-in-progress');
assert.strictEqual(ctx.trainSessionState.blocks.length, 1);
assert.strictEqual(ctx.trainSessionState.blocks[0].complete, false);
assert.strictEqual(ctx.trainSessionState.blocks[0].attempts.length, 0);
assert.strictEqual(ctx.toast, 'Duplicated — ready to log');
assert.strictEqual(ctx.shown, 'screen-train-session');
assert.ok(/Repeaters 1/.test(ctx.trainSessionState.title));

console.log('train-hub-recent-mini tests: ok');
