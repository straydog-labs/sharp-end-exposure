import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

assert.ok(/id="coach-guide-link"/.test(dash));
assert.ok(/Guide \/ Help/.test(dash));
assert.ok(/href="https:\/\/straydog-labs\.github\.io\/see-guide-site\/coach-guide\.html"/.test(dash));
assert.ok(/id="coach-guide-link"[^>]*target="_blank"/.test(dash));
assert.ok(/id="coach-guide-link"[^>]*rel="noopener"/.test(dash));
assert.ok(/<div id="topbar">[\s\S]*id="coach-guide-link"/.test(dash));
assert.ok(!/wes\s*shih|jessica\.somos/i.test(dash.match(/id="coach-guide-link"[\s\S]{0,200}/)[0]));

console.log('coach-guide-link tests: ok');
