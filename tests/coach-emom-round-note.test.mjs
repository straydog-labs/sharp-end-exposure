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

const ctx = { Object: Object, String: String, Number: Number, Array: Array, isFinite: isFinite };
vm.createContext(ctx);
['escapeHtml', 'coachRestPhrase', 'coachEffGrip', 'coachEffLoad', 'coachHangGroupText',
  'coachBoulderAttempt', 'coachBoulderMarkHtml', 'coachLoggedBlockHtml'].forEach(function(name){
  vm.runInContext(extractFn(name), ctx);
});
function htmlOf(block){
  return vm.runInContext('coachLoggedBlockHtml', ctx)(block);
}

const withNote = htmlOf({
  shape: 'emom',
  rounds: [
    {
      note: 'Quiet feet on the slab',
      notes: 'coach cue',
      boulders: [{ text: 'Orange', complete: true }],
      rest_after_sec: 60
    },
    {
      notes: 'smooth',
      boulders: [{ text: 'Black', complete: false }],
      rest_after_sec: 120
    }
  ]
});
const round1 = withNote.split('Round 2')[0];
const round2 = withNote.split('Round 2')[1];
assert.ok(round1.indexOf('clog-round-note') !== -1, 'note renders under the round');
assert.ok(round1.indexOf('Quiet feet on the slab') !== -1);
assert.ok(round1.indexOf('Sent 1') < round1.indexOf('Quiet feet on the slab'), 'note sits under the round summary');
assert.ok(round1.indexOf('coach cue') !== -1, 'existing notes field still renders');
assert.ok(round2.indexOf('clog-round-note') === -1, 'a round without note adds nothing');
assert.ok(round2.indexOf('smooth') !== -1, 'missing note leaves the existing notes line');
assert.ok(round2.indexOf('Rest after round') !== -1);

const blank = htmlOf({
  shape: 'emom',
  rounds: [{ note: '   ', notes: 'kept', boulders: [{ text: 'Blue', complete: false }] }]
});
assert.ok(blank.indexOf('clog-round-note') === -1, 'blank note is not shown');
assert.ok(blank.indexOf('kept') !== -1);

const escaped = htmlOf({
  shape: 'emom',
  rounds: [{ note: '<script>', boulders: [{ text: 'A', result: 'sent' }] }]
});
assert.ok(escaped.indexOf('<script>') === -1);
assert.ok(escaped.indexOf('&lt;script&gt;') !== -1);

console.log('coach-emom-round-note: ok');
