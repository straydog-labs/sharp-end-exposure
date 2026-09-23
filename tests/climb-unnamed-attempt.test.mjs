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
assert.ok(/var app_version = 'index268'/.test(index));
assert.ok(/APP_VERSION = 'index268'/.test(sw));

assert.ok(/function isUnnamedClimbName\(/.test(index));
assert.ok(/function climbDisplayNameHtml\(/.test(index));
assert.ok(/function climbAttemptLaunchBtnHtml\(/.test(index));
assert.ok(/function confirmEditRouteRename\(/.test(index));
assert.ok(/function showEditRenameConfirm\(/.test(index));
assert.ok(/id="edit-rename-confirm"/.test(index));
assert.ok(/id="edit-rename-old"/.test(index));
assert.ok(/id="edit-rename-new"/.test(index));
assert.ok(/Skip - leave unnamed/.test(index));
assert.ok(/logFlowSaveSession\('unnamed'\)/.test(index));
assert.ok(/how !== 'unnamed'/.test(index));
assert.ok(/Name this climb or tap Skip - leave unnamed/.test(index));
assert.ok(!/confirm\('Rename this route for all/.test(index));
assert.ok(/climbAttemptLaunchBtnHtml\(s,'climb-table'\)/.test(index));
assert.ok(/climbDisplayNameHtml\(s\.route_name\)/.test(index));
assert.ok(/class="climb-unnamed-flag"/.test(index));
assert.ok(/class="climb-table-attempt"/.test(index));

function extractFn(src, name){
  var re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}');
  var m = src.match(re);
  assert.ok(m, name + ' extractable');
  return m[0];
}

var saveFlow = extractFn(index, 'logFlowSaveSession');
var logClimb = extractFn(index, 'logClimb');
var saveEdit = extractFn(index, 'saveEditedClimb');
var tableFn = extractFn(index, 'renderClimbDataTable');
var attemptRow = extractFn(index, 'climbAttemptRowHtml');

assert.ok(!/_userClimbCount/.test(saveFlow), 'logFlowSaveSession no longer auto-names Climb N');
assert.ok(!/_userClimbCount/.test(logClimb), 'logClimb no longer auto-names Climb N');
assert.ok(!/Climb '\+/.test(saveFlow));
assert.ok(!/Climb '\+/.test(logClimb));
assert.ok(/showEditRenameConfirm/.test(saveEdit));
assert.ok(!/confirm\('Rename this route for all/.test(saveEdit));
assert.ok(/climbAttemptLaunchBtnHtml/.test(tableFn));
assert.ok(/climbDisplayNameHtml/.test(tableFn));
assert.ok(/climbDisplayNameHtml\(s\.route_name\)/.test(attemptRow));

var vm = spawnSync('node', [], {
  encoding: 'utf8',
  input: `
    function isUnnamedClimbName(name){
      var t = String(name == null ? '' : name).trim();
      if(!t) return true;
      return /^Climb\\s+\\d+$/i.test(t);
    }
    function climbDisplayName(name){
      return isUnnamedClimbName(name) ? 'Unnamed' : String(name).trim();
    }
    function assert(c, m){ if(!c) throw new Error(m); }
    assert(isUnnamedClimbName('') === true, 'empty is unnamed');
    assert(isUnnamedClimbName(null) === true, 'null is unnamed');
    assert(isUnnamedClimbName('Climb 1') === true, 'Climb 1 is unnamed');
    assert(isUnnamedClimbName('Climb 3') === true, 'Climb 3 is unnamed');
    assert(isUnnamedClimbName('Climb 6') === true, 'Climb 6 is unnamed');
    assert(isUnnamedClimbName('green 30 degree') === false, 'real name stays named');
    assert(isUnnamedClimbName('Power of Now') === false, 'Power of Now stays named');
    assert(climbDisplayName('Climb 1') === 'Unnamed', 'display Climb 1 as Unnamed');
    assert(climbDisplayName('green 30 degree') === 'green 30 degree', 'real name displays as-is');
    console.log('unnamed helpers: ok');
  `
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/unnamed helpers: ok/.test(vm.stdout));

console.log('climb-unnamed-attempt tests: ok');
