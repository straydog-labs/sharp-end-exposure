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
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index291'/.test(index));
assert.ok(/APP_VERSION = 'index291'/.test(sw));
assert.ok(!/train-done-assign-prompt/.test(dash), 'coach-dashboard untouched');

function extractFn(src, name){
  let start = src.indexOf('async function ' + name + '(');
  if(start < 0) start = src.indexOf('function ' + name + '(');
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

assert.ok(/source_assignment_id: sourceMeta\.source_assignment_id/.test(extractFn(index, 'newTrainSessionState')));
assert.ok(/source_assignment_id: a\.id/.test(extractFn(index, 'startTrainSessionFromAssignment')));
assert.ok(/b\.complete = !b\.complete/.test(extractFn(index, 'toggleTrainSectionComplete')));
assert.ok(/round\.complete = !round\.complete/.test(extractFn(index, 'toggleTrainEmomRoundComplete')));
assert.ok(/completed_at: new Date\(\)\.toISOString\(\)/.test(extractFn(index, 'trainMarkComplete')));
assert.ok(/completed_at=is\.null/.test(extractFn(index, 'trainMarkComplete')));
assert.ok(/maybeCompleteLinkedAssignment/.test(extractFn(index, 'saveTrainSession')));
assert.ok(/energy_type: trainSessionState\.energy_type/.test(extractFn(index, 'saveTrainSession')));
assert.ok(!/source_assignment_id:/.test(extractFn(index, 'saveTrainSession').match(/var payload = \{[\s\S]+?\};/)[0]));
assert.ok(/id="train-done-assign-prompt"/.test(index));
assert.ok(/Mark complete/.test(index));
assert.ok(/Not yet/.test(index));

const helpers = [
  extractFn(index, 'trainBlockIsComplete'),
  extractFn(index, 'trainSessionBlocksAllComplete'),
  extractFn(index, 'hideTrainDoneAssignPrompt'),
  extractFn(index, 'showTrainDoneAssignPrompt'),
  extractFn(index, 'dismissTrainDoneAssignPrompt'),
  extractFn(index, 'maybeCompleteLinkedAssignment')
].join('\n');

const calls = [];
const els = {
  'train-done-assign-prompt': { hidden: true },
  'train-done-assign-prompt-text': { textContent: '' }
};
const ctx = {
  _pendingAssignCompleteId: null,
  _trainAssignmentsCache: [{ id: 'asg-1', title: 'Night EMOM', completed_at: null }],
  toasts: [],
  markCalls: [],
  markResult: { ok: true },
  document: {
    getElementById: function(id){ return els[id] || null; }
  },
  showToast: function(msg){ ctx.toasts.push(msg); },
  trainMarkComplete: async function(id){
    ctx.markCalls.push(id);
    return ctx.markResult;
  }
};
vm.createContext(ctx);
vm.runInContext(helpers, ctx);

assert.strictEqual(ctx.trainBlockIsComplete({ complete: true }), true);
assert.strictEqual(ctx.trainBlockIsComplete({ complete: false, shape: 'interval' }), false);
assert.strictEqual(ctx.trainBlockIsComplete({
  shape: 'emom', complete: false,
  rounds: [{ complete: true }, { complete: true }]
}), true, 'all EMOM rounds count as block complete');
assert.strictEqual(ctx.trainBlockIsComplete({
  shape: 'emom', complete: false,
  rounds: [{ complete: true }, { complete: false }]
}), false);
assert.strictEqual(ctx.trainSessionBlocksAllComplete({
  blocks: [{ complete: true }, { shape: 'emom', rounds: [{ complete: true }] }]
}), true);
assert.strictEqual(ctx.trainSessionBlocksAllComplete({ blocks: [] }), false);
assert.strictEqual(ctx.trainSessionBlocksAllComplete({
  blocks: [{ complete: true }, { complete: false, shape: 'circuit' }]
}), false);

await vm.runInContext("maybeCompleteLinkedAssignment('asg-1', 'Night EMOM', true)", ctx);
assert.deepStrictEqual(ctx.markCalls, ['asg-1']);
assert.ok(ctx.toasts.indexOf('Assignment marked complete') !== -1);
assert.strictEqual(els['train-done-assign-prompt'].hidden, true);

ctx.markCalls = [];
ctx.toasts = [];
ctx.markResult = { ok: true };
await vm.runInContext("maybeCompleteLinkedAssignment('asg-1', 'Night EMOM', false)", ctx);
assert.deepStrictEqual(ctx.markCalls, []);
assert.strictEqual(els['train-done-assign-prompt'].hidden, false);
assert.ok(/Night EMOM/.test(els['train-done-assign-prompt-text'].textContent));

vm.runInContext('dismissTrainDoneAssignPrompt()', ctx);
assert.strictEqual(els['train-done-assign-prompt'].hidden, true);
assert.strictEqual(ctx._pendingAssignCompleteId, null);

ctx._trainAssignmentsCache = [{ id: 'asg-1', title: 'Night EMOM', completed_at: '2026-09-01T00:00:00Z' }];
ctx.markCalls = [];
ctx.toasts = [];
await vm.runInContext("maybeCompleteLinkedAssignment('asg-1', 'Night EMOM', true)", ctx);
assert.deepStrictEqual(ctx.markCalls, []);
assert.strictEqual(ctx.toasts.length, 0);

ctx._trainAssignmentsCache = [{ id: 'asg-1', title: 'Night EMOM', completed_at: null }];
ctx.markCalls = [];
ctx.toasts = [];
ctx.markResult = { ok: false };
await vm.runInContext("maybeCompleteLinkedAssignment('asg-1', 'Night EMOM', true)", ctx);
assert.deepStrictEqual(ctx.markCalls, ['asg-1']);
assert.ok(ctx.toasts.some(function(t){ return /try again/.test(t); }));
assert.strictEqual(els['train-done-assign-prompt'].hidden, false);

const saveSrc = extractFn(index, 'saveTrainSession');
assert.ok(/if\(!queuedOffline && linkedAssignmentId\)/.test(saveSrc));
assert.ok(/maybeCompleteLinkedAssignment\(linkedAssignmentId/.test(saveSrc));

console.log('assign-autocomplete tests: ok');
