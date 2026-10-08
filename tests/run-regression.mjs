import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FLOWS, NOT_COVERED } from './regression-manifest.mjs';
import { printGrandfatheredColumns } from './schema-columns.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const files = [];
FLOWS.forEach(function(f){
  if(!f.covered || !f.file) return;
  if(files.indexOf(f.file) === -1) files.push(f.file);
});

var failed = [];
files.forEach(function(file){
  console.log('\n=== ' + file + ' ===');
  var result = spawnSync(process.execPath, [join(__dirname, file)], {
    stdio: 'inherit',
    env: process.env,
    cwd: join(__dirname, '..')
  });
  if(result.status !== 0){
    failed.push(file + ' exit ' + result.status);
  }
});

console.log('\n=== coverage ===');
FLOWS.forEach(function(f){
  console.log('COVERED  ' + f.group + '/' + f.id + '  ' + f.file + '  ' + f.asserts);
});
NOT_COVERED.forEach(function(f){
  console.log('NOT COVERED  ' + f.group + '/' + f.id + '  ' + f.reason);
});
console.log('\n=== grandfathered columns (burn down) ===');
printGrandfatheredColumns(console.log);

if(failed.length){
  console.error('\nFAILED\n' + failed.join('\n'));
  process.exit(1);
}
console.log('\nregression-net: ok');
