import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

assert.ok(/#topbar\{[^}]*flex-wrap:wrap/.test(dash));
assert.ok(/\.topbar-right\{[^}]*flex-wrap:wrap/.test(dash));
assert.ok(/#whoami\{[^}]*text-overflow:ellipsis/.test(dash));
assert.ok(/class="topbar-coaching-label"/.test(dash));
assert.ok(/\.topbar-right\{gap:8px;flex:1 1 100%;justify-content:flex-start;\}/.test(dash));
assert.ok(/\.coach-layout\{display:grid;grid-template-columns:300px 1fr;/.test(dash));
assert.ok(/@media \(max-width: 820px\)\{[\s\S]*?\.coach-layout\{grid-template-columns:1fr;\}/.test(dash));
assert.ok(/\.form-actions\{display:flex;flex-wrap:wrap;/.test(dash));
assert.ok(/\.chat-compose textarea\{[\s\S]*?min-width:0;/.test(dash));
assert.ok(/\.assign-title-row\{[^}]*flex-wrap:wrap/.test(dash));
assert.ok(/\.assign-meta\{[^}]*flex-wrap:wrap/.test(dash));
assert.ok(/\.project-row\{[^}]*flex-wrap:wrap/.test(dash));
assert.ok(/\.aw-top\{[^}]*flex-wrap:wrap/.test(dash));

console.log('coach-topbar-layout tests: ok');
