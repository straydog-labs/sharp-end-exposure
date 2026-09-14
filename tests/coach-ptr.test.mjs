import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

const swClose = dash.indexOf('registerSEEServiceWorker');
const ptr = dash.indexOf('/* ---------- Pull-to-refresh (swipe down at top of screen) ---------- */');
assert.ok(swClose !== -1 && ptr !== -1);
assert.ok(ptr > swClose, 'PTR IIFE is after the service-worker IIFE');
assert.ok(/id = 'ptr-indicator'/.test(dash));
assert.ok(/var PTR_THRESHOLD = 70/.test(dash));
assert.ok(/var PTR_MAX = 110/.test(dash));
assert.ok(/isInsideNestedScroller/.test(dash));
assert.ok(/typeof showToast === 'function'/.test(dash));
assert.ok(/location\.reload\(\)/.test(dash));
assert.ok(/passive:false/.test(dash));

const m = dash.match(/\/\* ---------- Pull-to-refresh[\s\S]*?\}\)\(\);\n\n<\/script>/);
assert.ok(m, 'PTR block sits immediately before </script>');

const js = m[0].replace(/^[\s\S]*?\n(\(function\(\)\{)/, '$1').replace(/\n\n<\/script>$/, '');
const check = spawnSync('node', ['--check'], { input: js, encoding: 'utf8' });
assert.strictEqual(check.status, 0, check.stderr || 'node --check failed');

console.log('coach-ptr tests: ok');
