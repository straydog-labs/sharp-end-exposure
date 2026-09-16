import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const staging = readFileSync(join(__dirname, '../index-staging.html'), 'utf8');
const index = readFileSync(join(__dirname, '../index.html'), 'utf8');
const sw = readFileSync(join(__dirname, '../sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index262'/.test(index));
assert.ok(/APP_VERSION = 'index262'/.test(sw));

assert.ok(/\.log-flow-screen \.log-btn/.test(index));
assert.ok(/\.log-flow-footer \.log-btn/.test(index));
assert.ok(/\.log-flow-skip-link\{[\s\S]*?text-align:center/.test(index));
assert.ok(/\.log-flow-skip-link\{[\s\S]*?width:100%/.test(index));
assert.ok(/Side-margin on \.log-btn left CTAs/.test(index)
  || /off-center vs titles and skip links/.test(index));

assert.ok(/function expandJournalComposer\(/.test(index));
assert.ok(/function closeJournalComposerExpand\(/.test(index));
assert.ok(/expandJournalComposer\('journal-entry-text'\)/.test(index));
assert.ok(/expandJournalComposer\('je-edit-text'\)/.test(index));
assert.ok(/journal-expand-overlay/.test(index));
assert.ok(/min-height:160px/.test(index.match(/id="journal-entry-text"[\s\S]{0,400}/)[0]));
assert.ok(/journalComposerSourceText\('journal-entry-text'\)/.test(index));

assert.ok(!/Math\.max\(0\.06/.test(index.match(/function buildPsycheRadar\(counts\)\{[\s\S]*?async function loadPsycheLog/)[0]));
assert.ok(/d\.n > 0/.test(index.match(/function buildPsycheRadar\(counts\)\{[\s\S]*?async function loadPsycheLog/)[0]));

console.log('log-journal-radar tests: ok');
