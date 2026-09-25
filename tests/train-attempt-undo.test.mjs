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

assert.ok(/function trainUndoAttempt/.test(index));
assert.ok(/\.train-attempt-undo\{/.test(index));
assert.ok(/mirrors attemptSummary\(\)'s markup/.test(index));

const summary = extractFn(index, 'attemptSummary');
assert.ok(/trainUndoAttempt/.test(summary));
assert.ok(/n > 0/.test(summary));
assert.ok(/train-attempt-undo/.test(summary));

const auto = extractFn(index, 'trainAutoLogAttempt');
assert.ok(/trainUndoAttempt/.test(auto));
assert.ok(/wrap\.innerHTML/.test(auto));
assert.ok(!/querySelector\('[^']* b'\)/.test(auto));

const undo = extractFn(index, 'trainUndoAttempt');
assert.ok(/b\.attempts\.pop\(\)/.test(undo));
assert.ok(/Attempt removed/.test(undo));

const ctx = {
  Date,
  Math,
  String,
  Number,
  isNaN,
  lastHtml: '',
  document: {
    querySelector: function(){
      return { set innerHTML(v){ ctx.lastHtml = v; }, get innerHTML(){ return ctx.lastHtml; } };
    }
  },
  trainSessionState: {
    blocks: [
      { id: 'emom-1', shape: 'emom', attempts: [{ at: 't1', note: 'attempt 1' }, { at: 't2', note: 'attempt 2' }] },
      { id: 'iv-1', shape: 'interval', attempts: [] }
    ]
  },
  collectTrainBlockFields: function(){},
  showToast: function(msg){ ctx.toast = msg; },
  renderTrainSessionBuilder: function(){ ctx.renders = (ctx.renders || 0) + 1; }
};
vm.createContext(ctx);
vm.runInContext(extractFn(index, 'escTrainHtml'), ctx);
vm.runInContext(extractFn(index, 'attemptSummary'), ctx);
vm.runInContext(extractFn(index, 'trainAutoLogAttempt'), ctx);
vm.runInContext(extractFn(index, 'trainUndoAttempt'), ctx);

const empty = vm.runInContext('attemptSummary({ id: "x", attempts: [] })', ctx);
assert.ok(/Attempts logged: <b style="color:var\(--text\);">0<\/b><\/div>/.test(empty));
assert.ok(!/Undo/.test(empty), 'no Undo when count is 0');

const filled = vm.runInContext('attemptSummary({ id: "emom-1", attempts: [{}, {}] })', ctx);
assert.ok(/>2</.test(filled));
assert.ok(/trainUndoAttempt\('emom-1'\)/.test(filled));
assert.ok(/class="train-attempt-undo"/.test(filled));

vm.runInContext("trainUndoAttempt('emom-1')", ctx);
assert.strictEqual(ctx.trainSessionState.blocks[0].attempts.length, 1);
assert.strictEqual(ctx.toast, 'Attempt removed');
assert.strictEqual(ctx.renders, 1);

vm.runInContext("trainUndoAttempt('emom-1')", ctx);
assert.strictEqual(ctx.trainSessionState.blocks[0].attempts.length, 0);
const gone = vm.runInContext('attemptSummary(trainSessionState.blocks[0])', ctx);
assert.ok(!/Undo/.test(gone));

vm.runInContext("trainUndoAttempt('emom-1')", ctx);
assert.strictEqual(ctx.trainSessionState.blocks[0].attempts.length, 0, 'undo on empty is a no-op');

ctx.b = ctx.trainSessionState.blocks[1];
vm.runInContext('trainAutoLogAttempt(b)', ctx);
assert.strictEqual(ctx.b.attempts.length, 1);
assert.ok(/\(auto\)/.test(ctx.b.attempts[0].note));
assert.ok(/>1</.test(ctx.lastHtml));
assert.ok(/trainUndoAttempt\('iv-1'\)/.test(ctx.lastHtml));

console.log('train-attempt-undo tests: ok');
