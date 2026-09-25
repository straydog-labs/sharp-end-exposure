import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index273'/.test(index));
assert.ok(/APP_VERSION = 'index273'/.test(sw));

assert.ok(/function trustedSelectedClimbId\(/.test(index));
assert.ok(/function findOrCreateClimbIdByName\(/.test(index));

function extractFn(src, name){
  var re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}');
  var m = src.match(re);
  assert.ok(m, name + ' extractable');
  return m[0];
}

var startFn = extractFn(index, 'startLogFlow');
var resetFn = extractFn(index, 'resetLogScreen');
var launchFn = extractFn(index, 'launchLogWithClimb');
var trustedFn = extractFn(index, 'trustedSelectedClimbId');

assert.ok(/_selectedClimbId = null/.test(startFn), 'startLogFlow clears _selectedClimbId');
assert.ok(/_selectedClimbId=null/.test(resetFn), 'resetLogScreen clears _selectedClimbId');
assert.ok(launchFn.indexOf('startLogFlow()') < launchFn.indexOf('_selectedClimbId = climbId'),
  'launchLogWithClimb re-sets selection after startLogFlow');
assert.ok(/climbIdEarly = await trustedSelectedClimbId/.test(index));
assert.ok(/climbId = await trustedSelectedClimbId\(logState\.routeName, climbId\)/.test(index));
assert.ok((index.match(/findOrCreateClimbIdByName\(logState\.routeName\)/g) || []).length >= 2);
assert.ok(/normalizeClimbName\(rec\.name\) !== typed/.test(trustedFn));
assert.ok(/loadClimbCache/.test(trustedFn));

var vm = spawnSync('node', [], {
  encoding: 'utf8',
  input: `
    function normalizeClimbName(s){
      return (s||'').toLowerCase().trim().replace(/  +/g,' ');
    }
    function trusted(routeName, selectedId, cache){
      if(!selectedId) return null;
      var typed = normalizeClimbName(routeName || '');
      if(!typed) return null;
      var rec = (cache || []).find(function(c){ return c && c.id === selectedId; });
      if(!rec) return null;
      if(normalizeClimbName(rec.name) !== typed) return null;
      return selectedId;
    }
    var cache = [
      { id: 'climb-1', name: 'Climb 1' },
      { id: 'climb-3', name: 'Climb 3' },
      { id: 'climb-green', name: 'Green 30 degree' }
    ];
    function assert(c, m){ if(!c) throw new Error(m); }
    assert(trusted('Green 30 degree', 'climb-1', cache) === null, 'Jess mismatch dropped');
    assert(trusted('Green vert', 'climb-3', cache) === null, 'unrelated catalog dropped');
    assert(trusted('Green 30 degree', 'climb-green', cache) === 'climb-green', 'dropdown match kept');
    assert(trusted('green 30 degree', 'climb-green', cache) === 'climb-green', 'normalize match kept');
    assert(trusted('', 'climb-1', cache) === null, 'empty name cannot inherit selection');
    assert(trusted('Green 30 degree', 'missing', cache) === null, 'unknown id dropped');
    console.log('stale climb_id resolve: ok');
  `
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/stale climb_id resolve: ok/.test(vm.stdout));

console.log('climb-id-stale tests: ok');
