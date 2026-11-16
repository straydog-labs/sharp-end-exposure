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
assert.ok(/var app_version = 'index340'/.test(index));
assert.ok(/APP_VERSION = 'index340'/.test(sw));

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

const ctx = {};
vm.runInNewContext(extractFn(index, 'homeProjectLastLabel') + '\nthis.homeProjectLastLabel = homeProjectLastLabel;', ctx);
const label = ctx.homeProjectLastLabel;
const now = new Date(2026, 10, 16, 15, 0, 0);

assert.strictEqual(label(new Date(2026, 10, 16, 8, 30, 0), now), 'tried today');
assert.strictEqual(label(new Date(2026, 10, 15, 23, 0, 0), now), 'tried yesterday');
assert.strictEqual(label(new Date(2026, 10, 3, 12, 0, 0), now), 'tried 13 days ago');
assert.strictEqual(label(new Date(2026, 9, 2, 12, 0, 0), now), 'tried Oct 2');
assert.strictEqual(label(new Date(2025, 11, 31, 12, 0, 0), now), 'tried Dec 31, 2025');

const prompt = extractFn(index, 'paintHomePrompt');
const strip = extractFn(index, 'paintHomeProjectsStrip');
assert.ok(!/', last ' \+ homeProjectLastLabel/.test(prompt), 'Home project cards do not prefix last');
assert.ok(!/' · last ' \+ when/.test(strip), 'My projects rows do not prefix last');
assert.ok(/0 attempts · added /.test(strip), 'a project with no attempts still says added');

console.log('project-tried-label ok');
