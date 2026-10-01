import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const terms = readFileSync(join(root, 'terms.html'), 'utf8');
const sql = readFileSync(join(root, 'sql/profiles-terms-accepted.sql'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index276'/.test(index));
assert.ok(/APP_VERSION = 'index276'/.test(sw));
assert.ok(/var SEE_TERMS_VERSION = 'July 2026'/.test(index));

assert.ok(/id="feedback"/.test(terms), 'Feedback heading has deep-link id');
assert.ok(/<h2 id="feedback">7\. Feedback and Beta Testing<\/h2>/.test(terms));
assert.ok(/you agree that Straydog Labs may use, modify, and implement that Feedback/.test(terms));
assert.ok(/This section applies to Feedback submitted through the in-app feedback flow/.test(terms));
assert.ok(/<h2>8\. Governing Law<\/h2>/.test(terms));
assert.ok(!/<h2>7\. Governing Law<\/h2>/.test(terms));
assert.ok(/SEE does not recommend, suggest, or endorse any specific climb, route, or objective/.test(terms));

assert.ok(/id="auth-terms-checkbox"/.test(index));
assert.ok(/Please agree to the Terms of Service to continue/.test(index));
assert.ok(/terms_accepted_at: new Date\(\)\.toISOString\(\)/.test(index));
assert.ok(/terms_version: SEE_TERMS_VERSION/.test(index));
assert.ok(/profileRow\.terms_version = pending\.terms_version/.test(index));

assert.ok(/terms\.html#feedback/.test(index));
assert.ok(/By submitting, you agree feedback becomes Straydog Labs' to use/.test(index));
assert.ok(/function mountFeedbackLicenseNote\(/.test(index));
assert.ok(/FEEDBACK_LICENSE_NOTE_HTML/.test(index));

assert.ok(/add column if not exists terms_accepted_at timestamptz/.test(sql));
assert.ok(/add column if not exists terms_version text/.test(sql));
assert.ok(/Idempotent: safe to re-run/.test(sql));

console.log('terms-feedback-signup.test.mjs: ok');
