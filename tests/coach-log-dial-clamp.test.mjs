import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logJs = readFileSync(join(__dirname, '../js/coach-log-session.js'), 'utf8');
const index = readFileSync(join(__dirname, '../index.html'), 'utf8');
const staging = readFileSync(join(__dirname, '../index-staging.html'), 'utf8');
const sw = readFileSync(join(__dirname, '../sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index270'/.test(index));
assert.ok(/APP_VERSION = 'index270'/.test(sw));

const ptr = logJs.match(/function scoreFromPointer\(clientX, clientY\) \{[\s\S]*?\n    \}/);
assert.ok(ptr, 'scoreFromPointer present in js/coach-log-session.js');
assert.ok(/if\(ang<0\)/.test(ptr[0]));
assert.ok(/\(dx>=0\) \? 0 : 180/.test(ptr[0]));
assert.ok(!/Math\.max\(0,\s*Math\.min\(180,\s*ang\)\)/.test(ptr[0]), 'old wrap clamp removed');
assert.ok(/SCORE_MAX \* \(1 - ang \/ 180\)/.test(ptr[0]));

const vm = spawnSync('node', [], {
  encoding: 'utf8',
  input: `
    function scoreFromDxDy(dx, dyp){
      var ang=Math.atan2(dyp,dx)*180/Math.PI;
      if(ang<0){
        ang = (dx>=0) ? 0 : 180;
      } else {
        ang = Math.min(180, ang);
      }
      return 12*(1-ang/180);
    }
    function assert(c, m){ if(!c) throw new Error(m + ' got ' + c); }
    assert(scoreFromDxDy(-100, -40) === 0, 'below-left stays green/0');
    assert(scoreFromDxDy(100, -40) === 12, 'below-right stays red/12');
    assert(scoreFromDxDy(-100, 8) < 1, 'left-up near 0');
    assert(scoreFromDxDy(100, 8) > 11, 'right-up near 12');
    assert(Math.abs(scoreFromDxDy(0, 100) - 6) < 0.2, 'top is mid');
    var old = function(dx, dyp){
      var ang=Math.atan2(dyp,dx)*180/Math.PI;
      ang=Math.max(0,Math.min(180,ang));
      return 12*(1-ang/180);
    };
    assert(old(-100, -40) === 12, 'sanity: old clamp wrapped left-below to red');
    console.log('clamp math: ok');
  `
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/clamp math: ok/.test(vm.stdout));

console.log('coach-log-dial-clamp tests: ok');
