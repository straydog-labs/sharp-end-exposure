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

function htmlOf(block){
  return vm.runInContext('coachLoggedBlockHtml', ctx)(block);
}

assert.ok(/coachLoggedBlocksHtml\(latest\.blocks\)/.test(extractFn('assignmentLoggedHtml')),
  'assignment Show session uses the shared read-only blocks');
assert.ok(/coachLoggedBlocksHtml\(s && s\.blocks\)/.test(extractFn('journalWorkoutEntryHtml')),
  'journal Show blocks uses the shared read-only blocks');
assert.ok(/openAthletePane\('journal'\)/.test(extractFn('openLandingSession')),
  'recent sessions detail opens the journal entry');

const six = [true, true, false, null, false, true];
const mixed = htmlOf({
  shape: 'rep_pass_fail',
  grip: 'half crimp',
  assistance: '15 lbs',
  progression_note: 'add a little next week',
  attempts: [{ at: '2024-01-01', note: 'do not render this attempt' }],
  sets: [{
    grip: '',
    load: '',
    rest_after_sec: 90,
    reps: six.map(function(ok){ return { ok: ok }; })
  }]
});
assert.ok(mixed.indexOf('Set 1 · half crimp · 15 lbs · 90 sec · 3 pass · 2 fail · 1 open') !== -1, mixed);
assert.strictEqual((mixed.match(/class="clog-rep is-pass"/g) || []).length, 3);
assert.strictEqual((mixed.match(/class="clog-rep is-fail"/g) || []).length, 2);
assert.strictEqual((mixed.match(/class="clog-rep is-untested"/g) || []).length, 1);
assert.ok(mixed.indexOf('>1<') !== -1 && mixed.indexOf('>6<') !== -1, 'chips are numbered');
assert.ok(mixed.indexOf('>pass<') === -1 && mixed.indexOf('>fail<') === -1 && mixed.indexOf('>untested<') === -1);
assert.ok(mixed.indexOf('add a little next week') !== -1);
assert.ok(mixed.indexOf('do not render this attempt') === -1, 'attempts stay off the read-only block');

const legacy = htmlOf({
  shape: 'rep_pass_fail',
  grip: 'half crimp',
  assistance: '+35 lb',
  progression_note: 'keep me',
  attempts: [{ at: '2024-01-01' }],
  sets: [{ reps: [{ ok: true }, { ok: false }, { ok: null }] }]
});
assert.ok(legacy.indexOf('Set 1 · half crimp · +35 lb · 1 pass · 1 fail · 1 open') !== -1, legacy);
assert.strictEqual((legacy.match(/class="clog-rep /g) || []).length, 3);
assert.ok(legacy.indexOf('keep me') !== -1);
assert.ok(legacy.indexOf('2024-01-01') === -1);

const override = htmlOf({
  shape: 'rep_pass_fail',
  grip: 'half crimp',
  assistance: '15 lbs',
  sets: [
    { grip: 'open hand', load: '', reps: [{ ok: true }] },
    { grip: '   ', load: 'bodyweight', reps: [{ ok: false }] }
  ]
});
assert.ok(override.indexOf('Set 1 · open hand · 15 lbs · 1 pass · 0 fail · 0 open') !== -1, override);
assert.ok(override.indexOf('Set 2 · half crimp · bodyweight · 0 pass · 1 fail · 0 open') !== -1, override);
assert.ok(override.indexOf('Set 1 · half crimp') === -1, 'set grip replaces the block grip');

console.log('coach-hangboard-rep-chips: ok');
