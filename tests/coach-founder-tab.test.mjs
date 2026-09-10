import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');
const founder = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');

assert.ok(/id="founder-dash-btn"/.test(dash));
assert.ok(/id="founder-dash-btn"[^>]*hidden/.test(dash));
assert.ok(/id="founder-dash-btn"[^>]*aria-hidden="true"/.test(dash));
assert.ok(/>Founder</.test(dash.match(/id="founder-dash-btn"[^>]*>[\s\S]{0,40}/)[0]));

const topbar = dash.match(/<div id="topbar">[\s\S]*?<\/div>\s*<div id="main">/);
assert.ok(topbar, 'topbar markup found');
const personalAt = topbar[0].indexOf('id="personal-dash-btn"');
const founderAt = topbar[0].indexOf('id="founder-dash-btn"');
const signoutAt = topbar[0].indexOf('id="signout-btn"');
assert.ok(personalAt !== -1 && founderAt !== -1 && personalAt < founderAt, 'Founder sits next to My dashboard');
assert.ok(founderAt < signoutAt, 'Founder sits before Sign out');

assert.ok(/#founder-dash-btn:not\(\[hidden\]\)\{display:inline-block;\}/.test(dash));
assert.ok(/id="founder-dash-btn"[^>]*href="founder-dashboard\.html"/.test(dash));
assert.ok(/id="founder-dash-btn"[^>]*target="_blank"/.test(dash));
assert.ok(/id="founder-dash-btn"[^>]*rel="noopener"/.test(dash));
assert.ok(!/window\.location\.href = 'founder-dashboard\.html'/.test(dash));
assert.ok(/window\.location\.href = 'index\.html'/.test(dash));

assert.ok(/foundash_whoami/.test(dash));
assert.ok(/rest\/v1\/rpc\/foundash_whoami/.test(dash));
assert.ok(/function revealFounderTabIfAdmin/.test(dash));
assert.ok(/function hideFounderDashBtn/.test(dash));
assert.ok(/body\.ok === true && body\.is_admin === true/.test(dash));
assert.ok(/hideFounderDashBtn\(\)/.test(dash.match(/signOut\(\)[\s\S]{0,400}/)[0]));

assert.ok(/foundash_whoami/.test(founder), 'founder-dashboard still uses foundash_whoami');
assert.ok(/foundash_admins/.test(founder));

console.log('coach-founder-tab tests: ok');
