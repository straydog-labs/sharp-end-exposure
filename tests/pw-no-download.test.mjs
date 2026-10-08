import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { resolveChromiumPath } from './pw-browser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const helper = readFileSync(join(__dirname, 'pw-browser.mjs'), 'utf8');

assert.ok(/PLAYWRIGHT_BROWSERS_PATH/.test(helper), '649a3dc: resolveChromiumPath must honor PLAYWRIGHT_BROWSERS_PATH');
assert.ok(/\/opt\/pw-browsers/.test(helper), '649a3dc: resolveChromiumPath must check /opt/pw-browsers');
assert.ok(/SEE_PW_NO_DOWNLOAD/.test(helper) || /process\.env\.CI/.test(helper),
  'CI/SEE_PW_NO_DOWNLOAD must skip last-resort Chromium download');

var installIdx = helper.indexOf("playwright@1.55.0 install chromium");
assert.ok(installIdx > 0, 'last-resort install still present in helper');
var catchIdx = helper.lastIndexOf('catch', installIdx);
assert.ok(catchIdx > 0 && catchIdx < installIdx, 'install chromium must stay behind the last-resort catch');

var tests = readdirSync(__dirname).filter(function(n){ return n.endsWith('.mjs'); });
tests.forEach(function(name){
  if(name === 'pw-browser.mjs') return;
  var src = readFileSync(join(__dirname, name), 'utf8');
  assert.ok(!/execSync\([^)]*playwright[^)]*install/.test(src),
    name + ' must not download Chromium (3105fbd / 3525a3f)');
});

var exe = resolveChromiumPath();
if(process.env.CI || process.env.SEE_PW_NO_DOWNLOAD === '1'){
  assert.ok(exe, 'clean CI runner must have Chromium at PLAYWRIGHT_BROWSERS_PATH or /opt/pw-browsers (no download). got ' + exe);
}
console.log('pw-no-download: ok exe=' + (exe || '(not required locally)'));
