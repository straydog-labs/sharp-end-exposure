import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

const showStart = dash.indexOf('function shareCoachInviteLink(){');
const showEnd = dash.indexOf('function toggleInviteLinkView(){');
assert.ok(showStart !== -1 && showEnd > showStart);
const src = dash.slice(showStart, showEnd);
const check = spawnSync('node', ['--check'], { input: src, encoding: 'utf8' });
assert.strictEqual(check.status, 0, check.stderr || 'share/showInviteLinkPanel failed node --check');

assert.ok(/input\.hidden = false/.test(src));
assert.ok(/viewToggle\.textContent = 'hide link'/.test(src));
assert.ok(/openBtn\.textContent = 'Link ready'/.test(src));
assert.ok(/Get invite link/.test(src));
assert.ok(/id="invite-link-share"/.test(dash));
assert.ok(/navigator\.share\(\{/.test(src));
assert.ok(/typeof navigator\.share === 'function'/.test(src));

const generateStart = dash.indexOf('function generateCoachAthleteInvite(){');
const generateEnd = dash.indexOf('function openInviteWelcome(){');
const generateSrc = dash.slice(generateStart, generateEnd);
assert.ok(!/Link ready/.test(generateSrc));
assert.ok(/input\.hidden = true/.test(dash.match(/function copyCoachInviteLink\(\)\{[\s\S]*?\n  function generateCoachAthleteInvite/)[0]));

console.log('coach-invite-link-reveal tests: ok');
