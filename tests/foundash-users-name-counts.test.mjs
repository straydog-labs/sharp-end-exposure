import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');

const tableFn = html.match(/function renderAllUsersTable\(\)\{[\s\S]*?\n  function /)[0];
assert.ok(tableFn, 'renderAllUsersTable extracted');
assert.ok(
  /personDisplayName\(userField\(u, \['first_name'\], ''\), userField\(u, \['last_name'\], ''\), userField\(u, \['email'\], ''\), '—'\)/.test(tableFn),
  'All Users Name cell uses first_name + last_name + email via personDisplayName'
);
assert.ok(!/userField\(u, \['name', 'display_name', 'full_name'\]/.test(tableFn), 'Name cell no longer looks up name/display_name/full_name');
assert.ok(
  /personDisplayName\(userField\(u, \['first_name'\], ''\), userField\(u, \['last_name'\], ''\), '', ''\)/.test(tableFn),
  'search haystack uses first_name + last_name'
);

const openFn = html.match(/function openUserDetail\(userId\)\{[\s\S]*?\n  function renderUserDetail/)[0];
assert.ok(openFn, 'openUserDetail extracted');
assert.ok(
  /personDisplayName\(userField\(cached, \['first_name'\], ''\), userField\(cached, \['last_name'\], ''\), userField\(cached, \['email'\], ''\), 'User'\)/.test(openFn),
  'loading-title uses first_name + last_name + email'
);

const detailFn = html.match(/function renderUserDetail\(userId, data, cached\)\{[\s\S]*?\n  function /)[0];
assert.ok(detailFn, 'renderUserDetail extracted');
assert.ok(/var profile = data\.profile \|\| \{\}/.test(detailFn), 'detail reads nested profile');
assert.ok(/userField\(profile, \['first_name'\]/.test(detailFn), 'detail name from profile.first_name');
assert.ok(/userField\(profile, \['last_name'\]/.test(detailFn), 'detail name from profile.last_name');
assert.ok(/userField\(profile, \['session_count'/.test(detailFn), 'Sessions tile from profile.session_count');
assert.ok(/userField\(profile, \['climb_count'/.test(detailFn), 'Climbs tile from profile.climb_count');
assert.ok(/userField\(profile, \['falls_count'/.test(detailFn), 'Falls tile from profile.falls_count');
assert.ok(/userField\(profile, \['journal_count'/.test(detailFn), 'Journal tile from profile.journal_count');
assert.ok(!/userField\(data, \['session_count'/.test(detailFn), 'metrics no longer read top-level data');
assert.ok(!/userField\(data, \['falls', 'falls_logged'\]/.test(detailFn), 'old falls key gone');
assert.ok(!/userField\(data, \['journal_entries'/.test(detailFn), 'old journal_entries key gone');

const personSrc = html.match(/function personDisplayName\(firstName, lastName, email, fallback\)\{[\s\S]*?\n  \}/)[0];
const userFieldSrc = html.match(/function userField\(u, keys, fallback\)\{[\s\S]*?\n  \}/)[0];
assert.ok(personSrc && userFieldSrc);

const check = spawnSync('node', ['--check'], {
  input: personSrc + '\n' + userFieldSrc,
  encoding: 'utf8'
});
assert.strictEqual(check.status, 0, check.stderr || 'helpers failed node --check');

const vm = spawnSync('node', [], {
  encoding: 'utf8',
  input:
    personSrc + '\n' + userFieldSrc + '\n' +
    `function assert(c, m){ if(!c) throw new Error(m); }

     var listRow = { first_name: 'Anna', last_name: 'I', email: 'anna@x.com', session_count: 12 };
     assert(userField(listRow, ['name', 'display_name', 'full_name'], '—') === '—', 'old keys miss');
     assert(
       personDisplayName(userField(listRow, ['first_name'], ''), userField(listRow, ['last_name'], ''), userField(listRow, ['email'], ''), '—') === 'Anna I',
       'list first+last'
     );
     var emailOnly = { first_name: '', last_name: null, email: 'solo@x.com' };
     assert(
       personDisplayName(userField(emailOnly, ['first_name'], ''), userField(emailOnly, ['last_name'], ''), userField(emailOnly, ['email'], ''), '—') === 'solo@x.com',
       'list falls back to email'
     );
     var empty = {};
     assert(
       personDisplayName(userField(empty, ['first_name'], ''), userField(empty, ['last_name'], ''), userField(empty, ['email'], ''), '—') === '—',
       'list empty fallback'
     );

     var data = {
       ok: true,
       profile: {
         first_name: 'Rich',
         last_name: 'Coach',
         email: 'rich@x.com',
         session_count: 7,
         climb_count: 21,
         falls_count: 3,
         journal_count: 4
       },
       recent_sessions: [],
       payments: [],
       total_paid: 0
     };
     var profile = data.profile || {};
     assert(userField(data, ['session_count', 'sessions'], 0) === 0, 'top-level session_count is empty');
     assert(userField(profile, ['session_count', 'sessions'], 0) === 7, 'profile.session_count');
     assert(userField(profile, ['climb_count', 'climbs'], 0) === 21, 'profile.climb_count');
     assert(userField(profile, ['falls', 'falls_logged'], 0) === 0, 'old falls keys miss');
     assert(userField(profile, ['falls_count', 'falls', 'falls_logged'], 0) === 3, 'profile.falls_count');
     assert(userField(profile, ['journal_entries', 'journal'], 0) === 0, 'old journal keys miss');
     assert(userField(profile, ['journal_count', 'journal_entries', 'journal'], 0) === 4, 'profile.journal_count');
     assert(
       personDisplayName(
         userField(profile, ['first_name'], ''),
         userField(profile, ['last_name'], ''),
         userField(profile, ['email'], ''),
         'User'
       ) === 'Rich Coach',
       'detail name from profile'
     );
     console.log('name-counts: ok');`
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/name-counts: ok/.test(vm.stdout));

console.log('foundash-users-name-counts tests: ok');
