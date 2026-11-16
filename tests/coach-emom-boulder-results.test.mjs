import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '..', 'coach-dashboard.html'), 'utf8');

function extractFn(name){
  const start = dash.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  const next = dash.indexOf('\n  function ', start + 10);
  return dash.slice(start, next > 0 ? next : dash.length);
}

const ctx = {
  Object: Object, String: String, Number: Number, Array: Array, isFinite: isFinite
};
vm.createContext(ctx);
[
  'escapeHtml', 'coachRestPhrase', 'coachEffGrip', 'coachEffLoad', 'coachHangGroupText',
  'coachBoulderAttempt', 'coachBoulderMarkHtml', 'coachLoggedBlockHtml', 'coachLoggedBlocksHtml'
].forEach(function(name){
  vm.runInContext(extractFn(name), ctx);
});
const htmlOf = function(block){
  return vm.runInContext('coachLoggedBlockHtml', ctx)(block);
};
const sessionHtml = function(blocks){
  return vm.runInContext('coachLoggedBlocksHtml', ctx)(blocks);
};

assert.ok(/coachLoggedBlocksHtml\(latest\.blocks\)/.test(extractFn('assignmentLoggedHtml')),
  'assignment Show session uses the shared read-only blocks');
assert.ok(/coachLoggedBlocksHtml\(s && s\.blocks\)/.test(extractFn('journalWorkoutEntryHtml')),
  'journal Show blocks uses the shared read-only blocks');
assert.ok(/openAthletePane\('journal'\)/.test(extractFn('openLandingSession')),
  'recent sessions detail opens the journal entry');

const mixed = htmlOf({
  shape: 'emom',
  rounds: [{
    boulders: [
      { text: 'Orange', result: 'sent', complete: true },
      { text: 'Black', result: 'failed', complete: false },
      { text: 'Blue', result: null, complete: false }
    ]
  }]
});
assert.ok(/clog-boulder-mark is-sent[\s\S]*aria-label="Sent"/.test(mixed), 'sent is a check');
assert.ok(/clog-boulder-mark is-failed[\s\S]*aria-label="Failed"/.test(mixed), 'failed is an x');
assert.ok(/clog-boulder-mark is-none[\s\S]*aria-label="Not attempted"/.test(mixed), 'not attempted is an empty box');
assert.ok(mixed.indexOf('Sent 1 · Failed 1 · Not attempted 1') !== -1, mixed);
assert.ok(mixed.indexOf('Orange') !== -1 && mixed.indexOf('Black') !== -1 && mixed.indexOf('Blue') !== -1);

const legacy = htmlOf({
  shape: 'emom',
  rounds: [{
    boulders: [
      { text: 'Sent one', complete: true },
      { text: 'Open one', complete: false }
    ]
  }]
});
assert.strictEqual((legacy.match(/is-sent/g) || []).length, 1, 'legacy complete true is sent');
assert.strictEqual((legacy.match(/is-none/g) || []).length, 1, 'legacy complete false is not attempted');
assert.ok(!/is-failed/.test(legacy), 'legacy rows do not invent a fail');
assert.ok(legacy.indexOf('Sent 1 · Failed 0 · Not attempted 1') !== -1, legacy);
assert.ok(legacy.indexOf('· done') === -1 && legacy.indexOf('not done') === -1);

const hang = {
  shape: 'rep_pass_fail',
  title: 'Hangboard',
  grip: 'half crimp',
  assistance: '+20 lb',
  sets: [{ grip: 'half crimp', load: '+20 lb', reps: [{ ok: true }, { ok: false }, { ok: null }] }],
  progression_note: 'keep this'
};
const check = {
  shape: 'check',
  title: 'Warm up',
  items: [{ text: 'Shoulder rolls', complete: true }, { text: 'Easy hangs', complete: false }]
};
const plain = sessionHtml([hang, check, {
  shape: 'emom',
  rounds: [{ boulders: [{ text: 'Slab', complete: true }, { text: 'Cave', complete: false }] }]
}]);
const hangHtml = htmlOf(hang);
const checkHtml = htmlOf(check);
assert.ok(hangHtml.indexOf('clog-boulder-mark') === -1, 'hangboard has no boulder marks');
assert.ok(hangHtml.indexOf('is-pass') !== -1 && hangHtml.indexOf('is-fail') !== -1 && hangHtml.indexOf('is-untested') !== -1);
assert.ok(hangHtml.indexOf('keep this') !== -1);
assert.ok(checkHtml.indexOf('Shoulder rolls') !== -1 && checkHtml.indexOf('· done') !== -1);
assert.ok(checkHtml.indexOf('Easy hangs') !== -1 && checkHtml.indexOf('· not done') !== -1);
assert.ok(checkHtml.indexOf('clog-boulder-mark') === -1);
assert.ok(plain.indexOf('half crimp') !== -1 && plain.indexOf('Shoulder rolls') !== -1);
assert.ok(plain.indexOf('Sent 1 · Failed 0 · Not attempted 1') !== -1, 'legacy session still summarizes');
assert.ok(plain.indexOf('is-failed') === -1, 'a session without result fields does not show failed');

console.log('coach-emom-boulder-results: ok');
