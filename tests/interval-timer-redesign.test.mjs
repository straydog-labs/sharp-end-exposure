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
assert.ok(/var app_version = 'index271'/.test(index));
assert.ok(/APP_VERSION = 'index271'/.test(sw));

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

const renderFn = extractFn(index, 'renderTrainBlockHtml');
const intervalStart = renderFn.indexOf("if(b.shape === 'interval'){");
const countdownStart = renderFn.indexOf("} else if(sectionHasCountdown(b)){");
const intervalBranch = renderFn.slice(intervalStart, countdownStart);
assert.ok(/trainIntervalPrimaryAction/.test(intervalBranch));
assert.ok(/trainIntervalReset/.test(intervalBranch));
assert.ok(/data-block-interval-dots/.test(intervalBranch));
assert.ok(/train-interval-dot/.test(intervalBranch));
assert.ok(/train-block-timer-btn-primary/.test(intervalBranch));
assert.ok(!/startTrainBlockTimer/.test(intervalBranch));
assert.ok(!/stopTrainBlockTimer/.test(intervalBranch));
assert.ok(!/data-block-interval-rep/.test(intervalBranch));
assert.ok(!/Rep '\+\(st\.repIndex\+1\)\+' of/.test(intervalBranch));

const countdownBranch = renderFn.slice(countdownStart, renderFn.indexOf('} else {', countdownStart));
assert.ok(/startTrainBlockTimer/.test(countdownBranch));
assert.ok(/stopTrainBlockTimer/.test(countdownBranch));
assert.ok(/data-block-countdown-wrap/.test(countdownBranch));
assert.ok(!/trainIntervalPrimaryAction/.test(countdownBranch));
assert.ok(!/data-block-interval-dots/.test(countdownBranch));

assert.ok(/function trainAutoLogAttempt/.test(index));
assert.ok(/function trainIntervalPrimaryAction/.test(index));
assert.ok(/function trainIntervalReset/.test(index));
assert.ok(/data-block-attempt-summary="/.test(index));
assert.ok(/noteTrainIntervalTransition\(b\.id, st, b\)/.test(index));
assert.ok(/noteTrainIntervalTransition\(b\.id, \{ phase: st\.phase, repIndex: 0 \}\)/.test(index));
assert.ok(/flex-direction:column/.test(index));
assert.ok(/font-size:44px/.test(index));
assert.ok(/train-interval-dot\.filled/.test(index));
assert.ok(/train-interval-reset-link/.test(index));
assert.ok(/_interval_is_paused = false/.test(extractFn(index, 'toggleTrainBlockTimerEnabled')));

const richOk = index.match(/var richOk = [\s\S]*?;/);
assert.ok(richOk, 'in-page richOk harness present');
assert.ok(/data-block-interval-dots="/.test(richOk[0]));
assert.ok(/trainIntervalPrimaryAction/.test(richOk[0]));
assert.ok(!/Rep 1 of 4/.test(richOk[0]));

const ctx = {
  Date,
  Math,
  String,
  Number,
  isNaN,
  _trainIntervalLastPhaseKey: {},
  _trainIntervalCueLog: [],
  playTrainTimerCue: function(){},
  lastSel: '',
  lastHtml: '',
  document: {
    querySelector: function(sel){
      ctx.lastSel = sel;
      return { set innerHTML(v){ ctx.lastHtml = v; }, get innerHTML(){ return ctx.lastHtml; } };
    }
  }
};
vm.createContext(ctx);
vm.runInContext(extractFn(index, 'escTrainHtml'), ctx);
vm.runInContext(extractFn(index, 'intervalPhaseKey'), ctx);
vm.runInContext(extractFn(index, 'trainAutoLogAttempt'), ctx);
vm.runInContext(extractFn(index, 'noteTrainIntervalTransition'), ctx);
vm.runInContext(extractFn(index, 'computeIntervalState'), ctx);

const block = { id: 'iv-1', attempts: [], shape: 'interval', work_sec: 7, rest_sec: 3, target_sets: 4 };
ctx.b = block;
ctx.id = 'iv-1';
vm.runInContext('noteTrainIntervalTransition(id, { phase: "Work", repIndex: 0 }, b)', ctx);
assert.strictEqual(block.attempts.length, 0, 'first Work paint does not auto-log');

vm.runInContext('noteTrainIntervalTransition(id, { phase: "Rest", repIndex: 0 }, b)', ctx);
assert.strictEqual(block.attempts.length, 1, 'Work → Rest auto-logs one attempt');
assert.ok(/\(auto\)/.test(block.attempts[0].note));

const cueOnly = { id: 'iv-2', attempts: [] };
ctx.b = cueOnly;
ctx.id = 'iv-2';
ctx._trainIntervalLastPhaseKey['iv-2'] = 'Work:0';
vm.runInContext('noteTrainIntervalTransition(id, { phase: "Rest", repIndex: 0 })', ctx);
assert.strictEqual(cueOnly.attempts.length, 0, 'countdown-style 2-arg call does not auto-log');

const logged = { id: 'iv-3', attempts: [{ at: 'x', note: 'attempt 1' }] };
ctx.b = logged;
vm.runInContext('trainAutoLogAttempt(b)', ctx);
assert.strictEqual(logged.attempts.length, 2);
assert.strictEqual(logged.attempts[1].note, 'attempt 2 (auto)');
assert.ok(/data-block-attempt-summary="iv-3"/.test(ctx.lastSel));
assert.ok(/>2</.test(ctx.lastHtml));
assert.ok(/trainUndoAttempt/.test(ctx.lastHtml));
assert.ok(/train-attempt-undo/.test(ctx.lastHtml));

const primary = {
  Date,
  Math,
  String,
  Number,
  isNaN,
  trainSessionState: {
    blocks: [{
      id: 'iv-p',
      shape: 'interval',
      work_sec: 7,
      rest_sec: 3,
      target_sets: 4,
      interval_started_at: null,
      _interval_is_paused: false,
      _interval_paused_elapsed_ms: null
    }]
  },
  collectTrainBlockFields: function(){},
  ensureTrainTimerAudioCtx: function(){},
  requestTrainWakeLock: function(){ primary.wake += 1; },
  releaseTrainWakeLock: function(){ primary.wakeRel += 1; },
  anyTrainIntervalProtocolActive: function(){ return false; },
  renderTrainSessionBuilder: function(){ primary.renders += 1; },
  clearTrainBlockTimerInterval: function(){ primary.cleared += 1; },
  _trainIntervalLastPhaseKey: { 'iv-p': 'Work:0' },
  wake: 0,
  wakeRel: 0,
  renders: 0,
  cleared: 0
};
vm.createContext(primary);
vm.runInContext(extractFn(index, 'computeIntervalState'), primary);
vm.runInContext(extractFn(index, 'trainIntervalPrimaryAction'), primary);
vm.runInContext(extractFn(index, 'trainIntervalReset'), primary);

vm.runInContext("trainIntervalPrimaryAction('iv-p')", primary);
const afterStart = primary.trainSessionState.blocks[0];
assert.ok(afterStart.interval_started_at, 'Start sets interval_started_at');
assert.strictEqual(afterStart._interval_is_paused, false);
assert.ok(primary.wake >= 1);

vm.runInContext("trainIntervalPrimaryAction('iv-p')", primary);
assert.strictEqual(afterStart._interval_is_paused, true);
assert.strictEqual(afterStart.interval_started_at, null);
assert.ok(afterStart._interval_paused_elapsed_ms >= 0);
assert.ok(primary.wakeRel >= 1);

vm.runInContext("trainIntervalPrimaryAction('iv-p')", primary);
assert.strictEqual(afterStart._interval_is_paused, false);
assert.ok(afterStart.interval_started_at);

vm.runInContext("trainIntervalReset('iv-p')", primary);
assert.strictEqual(afterStart.interval_started_at, null);
assert.strictEqual(afterStart._interval_is_paused, false);
assert.strictEqual(afterStart._interval_paused_elapsed_ms, null);
assert.ok(!primary._trainIntervalLastPhaseKey['iv-p']);

const pausedState = vm.runInContext(
  'computeIntervalState(0, 7, 3, 4, 2500)',
  primary
);
assert.strictEqual(pausedState.phase, 'Work');
assert.ok(pausedState.remainingMs > 4000 && pausedState.remainingMs <= 4500);

console.log('interval-timer-redesign tests: ok');
