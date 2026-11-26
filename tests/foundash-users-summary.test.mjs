import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');
const sql = readFileSync(join(__dirname, '../sql/foundash-users-summary.sql'), 'utf8');

assert.ok(/CREATE FUNCTION public\.foundash_users_summary\(\)/.test(sql));
assert.ok(/SECURITY DEFINER/.test(sql));
assert.ok(/SET search_path = public/.test(sql));
assert.ok(/auth\.uid\(\) IS NULL/.test(sql));
assert.ok(/not_authenticated/.test(sql));
assert.ok(/public\._foundash_is_admin\(\)/.test(sql));
assert.ok(/not_admin/.test(sql));
assert.ok(/public\._foundash_is_test_email\(u\.email\)/.test(sql));
assert.ok(/FROM auth\.users u/.test(sql));
assert.ok(/u\.created_at AS signed_up/.test(sql));
assert.ok(/coach_flags/.test(sql));
assert.ok(/is_checkin IS NOT TRUE/.test(sql));
assert.ok(/s\.deleted_at IS NULL/.test(sql));
assert.ok(/is_baseline IS TRUE/.test(sql));
assert.ok(/public\.training_sessions/.test(sql));
assert.ok(/GREATEST\(t\.created_at, t\.started_at, t\.ended_at\)/.test(sql));
assert.ok(/public\.journal_entries/.test(sql));
assert.ok(/public\.psyche_drills/.test(sql));
assert.ok(/public\.climbs/.test(sql));
assert.ok(/public\.assignments/.test(sql));
assert.ok(/completed_at IS NULL/.test(sql));
assert.ok(/cal\.status = 'active'/.test(sql));
assert.ok(/REVOKE ALL ON FUNCTION public\.foundash_users_summary\(\) FROM PUBLIC, anon, authenticated/.test(sql));
assert.ok(/GRANT EXECUTE ON FUNCTION public\.foundash_users_summary\(\) TO authenticated/.test(sql));
assert.ok(!/GRANT EXECUTE ON FUNCTION public\.foundash_users_summary\(\) TO anon/.test(sql));
assert.ok(!/CREATE[\s\S]{0,80}foundash_overview_counts/.test(sql), 'overview counts stay untouched');
assert.ok(!/DROP FUNCTION[\s\S]{0,80}foundash_overview_counts/.test(sql));
assert.ok(!/CREATE[\s\S]{0,120}FUNCTION public\.foundash_user_detail/.test(sql), 'detail RPC stays untouched');
assert.ok(!/DROP FUNCTION[\s\S]{0,80}foundash_user_detail/.test(sql));
assert.ok(!/CREATE OR REPLACE FUNCTION public\._foundash_is_test_email/.test(sql), 'do not redefine the live helper');

const loadFn = html.match(/function loadAllUsers\(force\)\{[\s\S]*?\n  function /)[0];
assert.ok(/foundash_users_summary/.test(loadFn), 'roster calls foundash_users_summary');
assert.ok(!/foundash_list_all_users/.test(loadFn), 'roster no longer calls the old list RPC');
assert.ok(!/hydrateUsersBaselineFlags\(/.test(loadFn), 'roster does not REST-read other users baselines');
assert.ok(!/sbAdminSelect/.test(loadFn));
assert.ok(/bo-err/.test(loadFn), 'RPC failure is a visible error');
assert.ok(/allUsersCache\.length/.test(loadFn), 'a failed refresh keeps the rows');
assert.ok(/visibilitychange/.test(html));
assert.ok(/USERS_AUTO_REFRESH_MS = 5 \* 60 \* 1000/.test(html));
assert.ok(/document\.visibilityState !== 'visible'/.test(html));
assert.ok(/id="users-hide-test"[^>]*checked/.test(html));
assert.ok(/id="users-showing-count"/.test(html));
assert.ok(/id="users-refreshed-at"/.test(html));
assert.ok(/showing ' \+ shown \+ ' of ' \+ total/.test(html));
assert.ok(/data-sort="sessions"[^>]*title="Climb sessions\. Baseline and check-ins are not counted\."/.test(html));
assert.ok(/data-sort="climbs"[^>]*title="Rows in the climbs table\. Sessions logged without a named climb are not counted here\."[^>]*>Named climbs /.test(html));
assert.ok(!/data-sort="climbs"[^>]*>Climbs </.test(html));
assert.ok(/data-sort="training"/.test(html));
assert.ok(/data-sort="openAssignments"/.test(html));
assert.ok(/id="users-filter-training"/.test(html));
assert.ok(/id="users-filter-open"/.test(html));
assert.ok((html.match(/<table class="bo-table" id="users-table">[\s\S]*?<\/table>/)[0].match(/<th /g) || []).length === 12);

function sliceFn(name){
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}');
  const m = html.match(re);
  assert.ok(m, 'extract ' + name);
  return m[0];
}

const helperNames = [
  'personDisplayName', 'userField', 'userIsTest', 'isTestAccount', 'fmtShortDate',
  'linkedLabel', 'usersDisplayName', 'usersSignupRaw', 'usersLastActivityRaw',
  'usersSessionCount', 'usersClimbCount', 'usersTrainingCount', 'usersOpenAssignments',
  'usersRelativeAgo', 'usersLastActivityLabel', 'usersBaselineLabel', 'formatUsersRefreshedLabel',
  'usersDateMs', 'usersTextHay', 'usersSubstringMatch', 'usersRowMatchesFilters',
  'usersSortValue', 'usersSortCompare', 'userIsCoach', 'userIsAthlete', 'resolveDisplayRole',
  'linkedAthleteCount', 'usersBaselineSet'
];
const helperSrc = helperNames.map(sliceFn).join('\n');
const check = spawnSync('node', ['--check'], { input: helperSrc, encoding: 'utf8' });
assert.strictEqual(check.status, 0, check.stderr || 'helpers failed node --check');

const labelVm = spawnSync('node', [], {
  encoding: 'utf8',
  input: helperSrc + `\n
function assert(c, m){ if(!c) throw new Error(m || 'assert'); }
// Self-relative fixture: every date is an offset from the real run-time "now" (and
// the expected label strings are derived with the same helpers, not hardcoded), so
// this suite can never drift out of sync with the calendar the way a frozen "now" did.
var now = new Date();
function daysAgoIso(n){ return new Date(now.getTime() - n * 86400000).toISOString(); }
var anna = {
  first_name: 'Anna', last_name: 'Islamova', email: 'anna.islamova@gmail.com',
  signed_up: daysAgoIso(160), is_coach: false, is_athlete: false, is_test: false,
  last_activity: daysAgoIso(3), last_activity_kind: 'climb',
  climb_sessions: 16, climbs: 9, training_sessions: 2,
  baseline_set: true, baseline_at: daysAgoIso(70),
  coach_links: [], athlete_count: 0, assignments_open: 2
};
var kelly = {
  first_name: 'Kelly', last_name: 'Peterson', email: 'kelly.peterson@gmail.com',
  is_coach: false, is_athlete: true, is_test: false,
  last_activity: daysAgoIso(1), last_activity_kind: 'checkin',
  climb_sessions: 2, climbs: 1, training_sessions: 0, baseline_set: false,
  coach_links: [{ first_name: 'Wes', last_name: 'Shih', email: 'wes.shih@gmail.com', name: 'Wes Shih' }],
  athlete_count: 0, assignments_open: 1
};
var wes = {
  first_name: 'Wes', last_name: 'Shih', email: 'wes.shih@gmail.com',
  is_coach: true, is_athlete: false, is_test: false,
  last_activity: now.toISOString(), last_activity_kind: 'training',
  climb_sessions: 4, climbs: 2, training_sessions: 1, baseline_set: true,
  baseline_at: daysAgoIso(80), coach_links: [], athlete_count: 1, assignments_open: 0
};
var probe = { first_name: 'Probe', last_name: 'Bot', email: 'rls-probe-9@example.com', is_test: true, climb_sessions: 0, climbs: 0 };
var empty = { name:'', email:'', signup:'', sessions:'', climbs:'', training:'', lastActivity:'', linked:'', openAssignments:'' };
assert(usersLastActivityLabel(anna, now) === fmtShortDate(anna.last_activity) + ' · 3d ago', usersLastActivityLabel(anna, now));
assert(usersLastActivityLabel(kelly, now) === fmtShortDate(kelly.last_activity) + ' · 1d ago', usersLastActivityLabel(kelly, now));
assert(usersLastActivityLabel(wes, now) === fmtShortDate(wes.last_activity) + ' · today', usersLastActivityLabel(wes, now));
assert(usersBaselineLabel(anna) === '✓ ' + fmtShortDate(anna.baseline_at), usersBaselineLabel(anna));
assert(usersBaselineLabel(kelly) === '—');
assert(usersBaselineLabel(wes) === '✓ ' + fmtShortDate(wes.baseline_at), usersBaselineLabel(wes));
assert(linkedLabel(anna) === '—');
assert(linkedLabel(kelly) === 'Coach: Wes Shih', linkedLabel(kelly));
assert(linkedLabel(wes) === '1 athlete', linkedLabel(wes));
assert(usersRowMatchesFilters(probe, empty, null, null, null, true) === false, 'hide test');
assert(usersRowMatchesFilters(anna, empty, null, null, null, true) === true, 'anna stays');
assert(usersRowMatchesFilters(kelly, Object.assign({}, empty, { linked: 'wes' }), null, null, null, true) === true);
assert(usersRowMatchesFilters(anna, Object.assign({}, empty, { lastActivity: '3d' }), null, null, null, false) === true);
assert(usersRowMatchesFilters(anna, Object.assign({}, empty, { training: '2' }), null, null, null, false) === true);
assert(usersRowMatchesFilters(anna, Object.assign({}, empty, { openAssignments: '2' }), null, null, null, false) === true);
assert(resolveDisplayRole(anna) === 'Signed up · active');
assert(resolveDisplayRole(kelly) === 'athlete');
assert(resolveDisplayRole(wes) === 'coach');
assert(resolveDisplayRole(probe) === 'Test account');
var byTrain = [kelly, wes, anna].sort(function(a, b){ return usersSortCompare(a, b, { key: 'training', dir: 'desc' }); });
assert(byTrain[0].first_name === 'Anna' && byTrain[2].first_name === 'Kelly');
assert(formatUsersRefreshedLabel(new Date(2026, 10, 16, 14, 5)) === 'Last refreshed 14:05');
console.log('labels: ok');
`
});
assert.strictEqual(labelVm.status, 0, labelVm.stderr || labelVm.stdout);
assert.ok(/labels: ok/.test(labelVm.stdout));

function runPsql(db, sqlText){
  const file = '/tmp/foundash-users-summary-test.sql';
  writeFileSync(file, sqlText);
  return spawnSync('sudo', ['-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', file], {
    encoding: 'utf8'
  });
}

const psql = spawnSync('psql', ['--version'], { encoding: 'utf8' });
const pg = spawnSync('sudo', ['-u', 'postgres', 'psql', '-d', 'postgres', '-c', 'SELECT 1'], { encoding: 'utf8' });
if(psql.status !== 0 || pg.status !== 0){
  console.log('local postgres skipped');
} else {
  const drop = spawnSync('sudo', ['-u', 'postgres', 'psql', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'DROP DATABASE IF EXISTS foundash_summary_fx;', '-c', 'CREATE DATABASE foundash_summary_fx;'], { encoding: 'utf8' });
  assert.strictEqual(drop.status, 0, drop.stderr || drop.stdout);
  const harness = readFileSync(join(__dirname, 'fixtures/foundash-users-summary.fixture.sql'), 'utf8');
  const applied = runPsql('foundash_summary_fx', harness + '\n\\i ' + join(__dirname, '../sql/foundash-users-summary.sql') + '\n');
  assert.strictEqual(applied.status, 0, applied.stderr || applied.stdout);
  const queried = spawnSync('sudo', ['-u', 'postgres', 'psql', '-d', 'foundash_summary_fx', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', 'SELECT public.foundash_users_summary();'], { encoding: 'utf8' });
  assert.strictEqual(queried.status, 0, queried.stderr || queried.stdout);
  const payload = JSON.parse(queried.stdout.trim());
  assert.strictEqual(payload.ok, true);
  const users = payload.users;
  function row(email){
    const hit = users.find(function(u){ return u.email === email; });
    assert.ok(hit, 'missing ' + email);
    return hit;
  }
  const anna = row('anna.islamova@gmail.com');
  const kelly = row('kelly.peterson@gmail.com');
  const wes = row('wes.shih@gmail.com');
  const probe = row('rls-probe-9@example.com');
  assert.strictEqual(anna.climb_sessions, 16);
  assert.strictEqual(anna.climbs, 9);
  assert.strictEqual(anna.training_sessions, 2);
  assert.strictEqual(anna.sessions_30d, 5);
  assert.strictEqual(anna.training_30d, 1);
  assert.strictEqual(anna.baseline_set, true);
  assert.ok(anna.baseline_at);
  assert.strictEqual(anna.last_activity_kind, 'climb');
  assert.strictEqual(anna.assignments_open, 2);
  assert.strictEqual(anna.assignments_overdue, 1);
  assert.strictEqual(anna.assignments_completed, 4);
  assert.strictEqual(anna.is_coach, false);
  assert.strictEqual(anna.is_athlete, false);
  assert.strictEqual(anna.is_test, false);
  assert.strictEqual(anna.athlete_count, 0);
  assert.deepStrictEqual(anna.coach_links, []);
  assert.ok(Math.abs(Date.now() - new Date(anna.last_activity).getTime() - 3 * 86400000) < 3600000);
  assert.strictEqual(kelly.last_activity_kind, 'checkin');
  assert.strictEqual(kelly.climb_sessions, 2);
  assert.strictEqual(kelly.sessions_30d, 0);
  assert.strictEqual(kelly.climbs, 1);
  assert.strictEqual(kelly.training_sessions, 0);
  assert.strictEqual(kelly.baseline_set, false);
  assert.strictEqual(kelly.is_athlete, true);
  assert.strictEqual(kelly.assignments_open, 1);
  assert.strictEqual(kelly.assignments_overdue, 0);
  assert.strictEqual(kelly.coach_links.length, 1);
  assert.strictEqual(kelly.coach_links[0].name, 'Wes Shih');
  assert.strictEqual(kelly.coach_links[0].email, 'wes.shih@gmail.com');
  assert.strictEqual(wes.is_coach, true);
  assert.strictEqual(wes.athlete_count, 1);
  assert.strictEqual(wes.last_activity_kind, 'training');
  assert.strictEqual(wes.climb_sessions, 4);
  assert.strictEqual(wes.sessions_30d, 2);
  assert.strictEqual(wes.training_sessions, 1);
  assert.strictEqual(wes.training_30d, 1);
  assert.strictEqual(wes.baseline_set, true);
  assert.strictEqual(wes.climbs, 2);
  assert.strictEqual(wes.is_athlete, false);
  assert.deepStrictEqual(wes.coach_links, []);
  assert.ok(Math.abs(Date.now() - new Date(wes.last_activity).getTime() - 2 * 3600000) < 600000);
  assert.strictEqual(probe.is_test, true);
  assert.strictEqual(probe.climb_sessions, 0);

  const denied = spawnSync('sudo', ['-u', 'postgres', 'psql', '-d', 'foundash_summary_fx', '-v', 'ON_ERROR_STOP=1', '-c', "SET ROLE anon; SELECT public.foundash_users_summary();"], { encoding: 'utf8' });
  assert.notStrictEqual(denied.status, 0);
  assert.ok(/permission denied for function foundash_users_summary/.test(denied.stderr || ''));
  const authed = spawnSync('sudo', ['-u', 'postgres', 'psql', '-d', 'foundash_summary_fx', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', "SET ROLE authenticated; SELECT public.foundash_users_summary()->>'ok';"], { encoding: 'utf8' });
  assert.strictEqual(authed.status, 0, authed.stderr || authed.stdout);
  assert.ok(/\btrue\b/.test(authed.stdout), authed.stdout);

  const summary = {
    anna: anna,
    kelly: kelly,
    wes: wes,
    not_derivable: [
      'public._foundash_is_test_email body is not in the repo. is_test calls that live helper. This fixture stubs it with the same email rules as isTestAccount (rls-probe-, tf-verify-, +test, @test.com, @example.com). The dashboard hide-toggle applies those rules even if the live helper differs.',
      'is_athlete is not a stored column. It is an active coach_athlete_links row where this user is athlete_id.',
      'assignments_overdue compares the due_date calendar day to today UTC, not the browser timezone.'
    ]
  };
  writeFileSync('/opt/cursor/artifacts/foundash-users-summary-fixture.json', JSON.stringify(summary, null, 2));
  console.log('FIXTURE Anna ' + JSON.stringify(anna));
  console.log('FIXTURE Kelly ' + JSON.stringify(kelly));
  console.log('FIXTURE Wes ' + JSON.stringify(wes));
}

console.log('foundash-users-summary tests: ok');
