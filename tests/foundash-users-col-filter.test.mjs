import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');

assert.ok(!/id="users-search"/.test(html), 'old combined search removed');
assert.ok(!/Search name or email/.test(html));
assert.ok(!/id="users-role-filter"/.test(html));
assert.ok(!/function setUsersRoleFilter/.test(html));
assert.ok(!/function renderUsersRoleFilterChip/.test(html));
assert.ok(!/function bindUsersRoleChipClicks/.test(html));
assert.ok(!/users-role-chip/.test(html));
assert.ok(/class="users-filter-row"/.test(html));
assert.ok(/id="users-filter-name"/.test(html));
assert.ok(/id="users-filter-email"/.test(html));
assert.ok(/id="users-filter-role"/.test(html));
assert.ok(/id="users-filter-coach"/.test(html));
assert.ok(/id="users-filter-signup"/.test(html));
assert.ok(/id="users-filter-sessions"/.test(html));
assert.ok(/id="users-filter-climbs"/.test(html));
assert.ok(/id="users-filter-last"/.test(html));
assert.ok(/id="users-filter-linked"/.test(html));
assert.ok(/id="users-refresh-btn"/.test(html), 'Refresh stays');
assert.ok(/option value="Test account"/.test(html));
assert.ok(/option value="Signed up · active"/.test(html));
assert.ok(/option value="Signed up · no activity"/.test(html));
assert.ok(/option value="not">Not coach/.test(html));

['name','email','role','coach','signup','sessions','climbs','lastActivity','linked'].forEach(function(key){
  assert.ok(html.indexOf('data-sort="' + key + '"') !== -1, 'sort header ' + key);
});
assert.ok(/var _usersSort = \{ key: null, dir: 'asc' \}/.test(html));
assert.ok(/loadAllUsers\(true\)/.test(html), 'Refresh still reloads data');
assert.ok(!/_usersSort = \{ key: null/.test(html.match(/function loadAllUsers\(force\)\{[\s\S]*?\n  function /)[0]),
  'loadAllUsers does not reset sort');
assert.ok(!/_usersRoleFilter = null/.test(html.match(/function loadAllUsers\(force\)\{[\s\S]*?\n  function /)[0].replace('var _usersRoleFilter', '')),
  'loadAllUsers does not reset role filter');

const tableFn = html.match(/function renderAllUsersTable\(\)\{[\s\S]*?\n  function /)[0];
assert.ok(/usersRowMatchesFilters/.test(tableFn));
assert.ok(/usersSortCompare/.test(tableFn));
assert.ok(/openUserDetail/.test(tableFn));
assert.ok(/toggleAllUsersCoach/.test(tableFn));
assert.ok(!/users-role-cell'\) return/.test(tableFn), 'role cell click no longer swallows row-open');

const personSrc = html.match(/function personDisplayName\(firstName, lastName, email, fallback\)\{[\s\S]*?\n  \}/)[0];
const userFieldSrc = html.match(/function userField\(u, keys, fallback\)\{[\s\S]*?\n  \}/)[0];
const userIsTestSrc = html.match(/function userIsTest\(u\)\{[\s\S]*?\n  \}/)[0];
const isTestAccountSrc = html.match(/function isTestAccount\(u\)\{[\s\S]*?\n  \}/)[0];
const fmtSrc = html.match(/function fmtShortDate\(v\)\{[\s\S]*?\n  \}/)[0];
const linkedLabelSrc = html.match(/function linkedLabel\(u\)\{[\s\S]*?\n  \}/)[0];
const helpersStart = html.indexOf('function usersDisplayName(u){');
const helpersEnd = html.indexOf('function loadAllUsers(force){');
assert.ok(helpersStart !== -1 && helpersEnd > helpersStart);
const filterSrc = html.slice(helpersStart, helpersEnd);
const coachStart = html.indexOf('function userIsCoach(u){');
const coachEnd = html.indexOf('function findAllUsersRow(userId){');
const coachSrc = html.slice(coachStart, coachEnd);

const src = [personSrc, userFieldSrc, userIsTestSrc, isTestAccountSrc, fmtSrc, linkedLabelSrc, filterSrc, coachSrc].join('\n');
const check = spawnSync('node', ['--check'], { input: src, encoding: 'utf8' });
assert.strictEqual(check.status, 0, check.stderr || 'helpers failed node --check');

const vm = spawnSync('node', [], {
  encoding: 'utf8',
  input: src + '\n' +
    `function assert(c, m){ if(!c) throw new Error(m); }
     var emptyTf = { name:'', email:'', signup:'', sessions:'', climbs:'', lastActivity:'', linked:'' };
     var anna = {
       first_name: 'Anna', last_name: 'I', email: 'anna@x.com', role: 'athlete',
       is_coach: false, signup_date: '2026-09-04T12:00:00Z', session_count: 12, climb_count: 3,
       last_activity: '2026-09-10T08:00:00Z', athlete_count: 0, linked_athletes: []
     };
     var coach = {
       first_name: 'Rich', last_name: 'C', email: 'rich@x.com', role: 'coach',
       is_coach: true, created_at: '2026-08-01', session_count: 2, climb_count: 40,
       last_seen_at: '2026-07-01', athlete_count: 5, linked_athletes: ['a','b']
     };
     var testU = { first_name: '', last_name: '', email: 'a+test@x.com', role: 'coach', is_coach: true, session_count: 1, climb_count: 0 };

     assert(usersDisplayName(anna) === 'Anna I', 'display name');
     assert(usersRowMatchesFilters(anna, emptyTf, null, null) === true, 'no filters');
     assert(usersRowMatchesFilters(anna, Object.assign({}, emptyTf, { name: 'ann' }), null, null) === true, 'name substring');
     assert(usersRowMatchesFilters(anna, Object.assign({}, emptyTf, { name: 'zzz' }), null, null) === false, 'name miss');
     assert(usersRowMatchesFilters(anna, Object.assign({}, emptyTf, { email: 'anna@' }), null, null) === true, 'email');
     assert(usersRowMatchesFilters(anna, emptyTf, 'athlete', null) === true, 'role athlete');
     assert(usersRowMatchesFilters(anna, emptyTf, 'coach', null) === false, 'role miss');
     assert(usersRowMatchesFilters(testU, emptyTf, 'Test account', null) === true, 'test role');
     assert(usersRowMatchesFilters(coach, emptyTf, null, 'coach') === true, 'coach select');
     assert(usersRowMatchesFilters(anna, emptyTf, null, 'coach') === false, 'not coach vs coach filter');
     assert(usersRowMatchesFilters(anna, emptyTf, null, 'not') === true, 'not coach');
     assert(usersRowMatchesFilters(anna, Object.assign({}, emptyTf, { signup: '2026-09' }), null, null) === true, 'signup month');
     assert(usersRowMatchesFilters(anna, Object.assign({}, emptyTf, { sessions: '12' }), null, null) === true, 'sessions text');
     assert(usersRowMatchesFilters(anna, Object.assign({}, emptyTf, { climbs: '3' }), null, null) === true, 'climbs text');
     assert(usersRowMatchesFilters(coach, Object.assign({}, emptyTf, { linked: 'athlete' }), null, null) === true, 'linked haystack');
     assert(usersRowMatchesFilters(anna, Object.assign({}, emptyTf, { name: 'ann', email: 'nope' }), null, null) === false, 'AND miss');

     var byName = [coach, anna].sort(function(a,b){ return usersSortCompare(a,b,{ key:'name', dir:'asc' }); });
     assert(byName[0].first_name === 'Anna', 'name asc');
     var bySess = [coach, anna].sort(function(a,b){ return usersSortCompare(a,b,{ key:'sessions', dir:'desc' }); });
     assert(bySess[0].session_count === 12, 'sessions desc numeric');
     var byDate = [coach, anna].sort(function(a,b){ return usersSortCompare(a,b,{ key:'signup', dir:'asc' }); });
     assert(byDate[0].first_name === 'Rich', 'signup chronological not stringy display');
     var byCoach = [coach, anna].sort(function(a,b){ return usersSortCompare(a,b,{ key:'coach', dir:'asc' }); });
     assert(userIsCoach(byCoach[0]) === false, 'coach false < true asc');
     var byLinked = [anna, coach].sort(function(a,b){ return usersSortCompare(a,b,{ key:'linked', dir:'desc' }); });
     assert(linkedAthleteCount(byLinked[0]) === 5, 'linked numeric');
     assert(usersSortCompare(anna, coach, { key: null, dir: 'asc' }) === 0, 'no sort key');
     console.log('col-filter: ok');`
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/col-filter: ok/.test(vm.stdout));

console.log('foundash-users-col-filter tests: ok');
