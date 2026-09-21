import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

const formTa = dash.match(/\.coach-note-form textarea\{\s*min-height:220px;[\s\S]*?\}/);
assert.ok(formTa, '.coach-note-form textarea rule');
assert.ok(/resize:vertical/.test(formTa[0]));
assert.ok(/line-height:1\.5/.test(formTa[0]));

const shared = dash.match(/\.coach-note-form input,\.coach-note-form textarea\{[\s\S]*?\}/);
assert.ok(shared);
assert.ok(!/min-height:220px/.test(shared[0]), 'title input keeps single-line styling');
assert.ok(!/resize:vertical/.test(shared[0]));

assert.ok(/id="coach-note-body" rows="12"/.test(dash));
assert.ok(!/id="coach-note-body" rows="3"/.test(dash));
assert.ok(/id="coach-note-edit-body-' \+ n\.id \+ '" rows="12"/.test(dash));
assert.ok(/coach-note-edit-body-[\s\S]{0,80}min-height:220px/.test(dash));
assert.ok(/coach-note-edit-body-[\s\S]{0,120}resize:vertical/.test(dash));

const rendered = dash.match(/\.coach-note-body\{[\s\S]*?\}/);
assert.ok(rendered);
assert.ok(/white-space:pre-wrap/.test(rendered[0]));
assert.ok(/font-size:13px/.test(rendered[0]));

const item = dash.match(/\.coach-note-item\{[\s\S]*?\}/);
assert.ok(item);
assert.ok(/border-radius:16px/.test(item[0]));

console.log('coach-notes-textarea tests: ok');
