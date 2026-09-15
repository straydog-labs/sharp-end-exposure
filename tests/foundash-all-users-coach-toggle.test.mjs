import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');

const usersTable = html.match(/<table class="bo-table" id="users-table">[\s\S]*?<\/table>/);
assert.ok(usersTable, 'All Users table present');
assert.ok(/<th>Role<\/th>\s*<th>Coach<\/th>/.test(usersTable[0]), 'Coach column sits after Role');
assert.ok((usersTable[0].match(/<th>/g) || []).length === 9, 'All Users has 9 columns');
assert.ok(/colspan="9"/.test(usersTable[0]), 'loading rowspan matches 9 columns');

const colspans = html.match(/users-tbody[\s\S]{0,80}colspan="9"|colspan="9" class="bo-empty"/g);
assert.ok(colspans && colspans.length >= 1, 'empty/loading states use colspan 9');
assert.ok(!/#users-tbody[\s\S]{0,200}colspan="8"/.test(html));
assert.ok(!/tbody\.innerHTML = '<tr><td colspan="8"/.test(html), 'JS empty states bumped to 9');

assert.ok(/class="users-coach-toggle"/.test(html));
assert.ok(/aria-label="Coach"/.test(html));
assert.ok(/users-role-cell/.test(html));
assert.ok(/users-coach-status/.test(html));
assert.ok(/aria-live="polite"/.test(html));
assert.ok(/function toggleAllUsersCoach/.test(html));
assert.ok(/function applyAllUsersCoachResult/.test(html));
assert.ok(/function setCoachRowPending/.test(html));
assert.ok(/function userIsCoach/.test(html));
assert.ok(/function resolveDisplayRole/.test(html));
assert.ok(/function isTestAccount/.test(html));
assert.ok(/Granting…/.test(html) && /Revoking…/.test(html));
assert.ok(!/id="users-hide-test"/.test(html), 'hide-test checkbox removed');
assert.ok(/id="users-role-filter"/.test(html), 'role filter chrome present');

const toggleFn = html.match(/function toggleAllUsersCoach\(cb\)\{[\s\S]*?\n  function openUserDetail/);
assert.ok(toggleFn, 'toggleAllUsersCoach extracted');
assert.ok(/foundash_grant_coach/.test(toggleFn[0]));
assert.ok(/foundash_revoke_coach/.test(toggleFn[0]));
assert.ok(/p_email: email/.test(toggleFn[0]));
assert.ok(/p_force: force/.test(toggleFn[0]));
assert.ok(/has_linked_athletes/.test(toggleFn[0]));
assert.ok(/applyAllUsersCoachResult\(userId, wantCoach\)/.test(toggleFn[0]));
assert.ok(!/loadAllUsers\(/.test(toggleFn[0]), 'inline toggle does not reload the full table');
assert.ok(!/renderAllUsersTable\(/.test(toggleFn[0]), 'inline toggle patches the row, not the table');
assert.ok(/cb\.disabled/.test(html.match(/function setCoachRowPending[\s\S]*?\n  function applyAllUsersCoachResult/)[0]));

const applyFn = html.match(/function applyAllUsersCoachResult\(userId, isCoach\)\{[\s\S]*?\n  function toggleAllUsersCoach/);
assert.ok(applyFn, 'applyAllUsersCoachResult extracted');
assert.ok(/users-role-cell/.test(applyFn[0]), 'ROLE badge is refreshed on the same row');
assert.ok(/u\.is_coach = isCoach/.test(applyFn[0]));
assert.ok(/deriveRoleAfterCoachToggle/.test(applyFn[0]));
assert.ok(/resolveDisplayRole/.test(applyFn[0]), 'ROLE badge uses resolveDisplayRole');

assert.ok(/e\.stopPropagation\(\)/.test(html.match(/tbody\.querySelectorAll\('\.users-coach-toggle'\)[\s\S]{0,400}/)[0]));
assert.ok(/closest\('\.users-coach-cell'\)/.test(html));

const coachMgmt = html.match(/<!-- ---------- FOUNDASH: COACH MANAGEMENT ---------- -->[\s\S]*?function revokeCoach/);
assert.ok(/id="grant-coach-btn"/.test(html), 'Coach Management grant UI unchanged');
assert.ok(/function revokeCoach\(email, athleteCount, btn\)/.test(html), 'Coach Management revoke stays');
assert.ok(/id="section-coach-mgmt"/.test(html));

const helpersStart = html.indexOf('function userIsCoach(u){');
const helpersEnd = html.indexOf('function findAllUsersRow(userId){');
assert.ok(helpersStart !== -1 && helpersEnd > helpersStart);
const userFieldSrc = html.match(/function userField\(u, keys, fallback\)\{[\s\S]*?\n  \}/)[0];
const userIsTestSrc = html.match(/function userIsTest\(u\)\{[\s\S]*?\n  \}/)[0];
const isTestAccountSrc = html.match(/function isTestAccount\(u\)\{[\s\S]*?\n  \}/)[0];
const helpersSrc = html.slice(helpersStart, helpersEnd);
const check = spawnSync('node', ['--check'], {
  input: userFieldSrc + '\n' + userIsTestSrc + '\n' + isTestAccountSrc + '\n' + helpersSrc,
  encoding: 'utf8'
});
assert.strictEqual(check.status, 0, check.stderr || 'helpers failed node --check');

const vm = spawnSync('node', [], {
  encoding: 'utf8',
  input:
    userFieldSrc + '\n' + userIsTestSrc + '\n' + isTestAccountSrc + '\n' + helpersSrc + '\n' +
    `function assert(c, m){ if(!c) throw new Error(m); }
     assert(userIsCoach({ role: 'coach' }) === true, 'role coach');
     assert(userIsCoach({ role: 'both' }) === true, 'role both');
     assert(userIsCoach({ role: 'athlete' }) === false, 'role athlete');
     assert(userIsCoach({ is_coach: true, role: 'athlete' }) === true, 'is_coach wins');
     assert(userIsCoach({ is_coach: false, role: 'coach' }) === false, 'is_coach false wins');
     assert(deriveRoleAfterCoachToggle({ role: 'athlete' }, true) === 'both', 'athlete + grant');
     assert(deriveRoleAfterCoachToggle({ role: 'signed-up-only' }, true) === 'coach', 'grant only');
     assert(deriveRoleAfterCoachToggle({ role: 'both' }, false) === 'athlete', 'revoke both');
     assert(deriveRoleAfterCoachToggle({ role: 'coach' }, false) === 'signed-up-only', 'revoke coach');
     assert(linkedAthleteCount({ athlete_count: 3 }) === 3, 'athlete_count');
     assert(linkedAthleteCount({ linked_athletes: ['a', 'b'] }) === 2, 'linked_athletes');
     assert(isTestAccount({ email: 'rls-probe-1@x.com' }) === true, 'rls-probe');
     assert(isTestAccount({ email: 'tf-verify-bot@x.com' }) === true, 'tf-verify');
     assert(isTestAccount({ email: 'anna+testcoach1@gmail.com' }) === true, '+test');
     assert(isTestAccount({ email: 'foo@test.com' }) === true, '@test.com');
     assert(isTestAccount({ email: 'foo@example.com' }) === true, '@example.com');
     assert(isTestAccount({ email: 'anna.islamova@gmail.com' }) === false, 'real email');
     assert(isTestAccount({ is_seed: true, email: 'real@gmail.com' }) === true, 'flag still counts');
     assert(resolveDisplayRole({ email: 'a+test@x.com', role: 'coach' }) === 'Test account', 'test beats coach');
     assert(resolveDisplayRole({ role: 'both' }) === 'both', 'both');
     assert(resolveDisplayRole({ role: 'coach' }) === 'coach', 'coach');
     assert(resolveDisplayRole({ role: 'athlete' }) === 'athlete', 'athlete');
     assert(resolveDisplayRole({ role: 'signed-up-only', session_count: 1 }) === 'Signed up · active', 'active');
     assert(resolveDisplayRole({ role: 'signed-up-only', climb_count: 2 }) === 'Signed up · active', 'climbs');
     assert(resolveDisplayRole({ role: 'signed-up-only', session_count: 0, climb_count: 0 }) === 'Signed up · no activity', 'idle');
     console.log('helpers: ok');`
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/helpers: ok/.test(vm.stdout));

console.log('foundash-all-users-coach-toggle tests: ok');
