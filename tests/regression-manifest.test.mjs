import { readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { FLOWS, IGNORED } from './regression-manifest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const onDisk = readdirSync(__dirname).filter(function(name){
  return name.endsWith('.test.mjs');
}).sort();

const flowFiles = [];
FLOWS.forEach(function(f){
  if(!f.file) return;
  if(flowFiles.indexOf(f.file) === -1) flowFiles.push(f.file);
});

const ignored = (IGNORED || []).slice().sort();
const listed = {};
flowFiles.concat(ignored).forEach(function(name){
  listed[name] = (listed[name] || 0) + 1;
});

const both = Object.keys(listed).filter(function(name){ return listed[name] > 1; });
assert.deepStrictEqual(both, [], 'file listed in both FLOWS and IGNORED: ' + both.join(', '));

const missing = onDisk.filter(function(name){ return !listed[name]; });
assert.deepStrictEqual(missing, [],
  'tests/*.test.mjs not in FLOWS or IGNORED:\n  ' + missing.join('\n  '));

const stale = Object.keys(listed).filter(function(name){ return onDisk.indexOf(name) === -1; }).sort();
assert.deepStrictEqual(stale, [],
  'manifest names a test file that is not on disk:\n  ' + stale.join('\n  '));

assert.ok(flowFiles.indexOf('regression-manifest.test.mjs') !== -1,
  'the meta test must itself be in FLOWS so CI runs it');

console.log('regression-manifest: ok (' + flowFiles.length + ' flow files, ' +
  ignored.length + ' ignored, ' + onDisk.length + ' on disk)');
