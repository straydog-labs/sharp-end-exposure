import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');
const sql = readFileSync(join(__dirname, '../sql/foundash-user-profile.sql'), 'utf8');

assert.ok(/id="section-user-profile"/.test(html), 'profile is a full page');
assert.ok(/id="user-profile-back"/.test(html), 'Back control');
assert.ok(/foundash_user_full/.test(html), 'profile RPC');
assert.ok(/foundash_user_messages/.test(html), 'messages RPC');
assert.ok(/CREATE FUNCTION public\.foundash_user_full\(p_user_id uuid\)/.test(sql));
assert.ok(/CREATE FUNCTION public\.foundash_user_messages\(p_user_id uuid\)/.test(sql));
assert.ok(/CREATE TABLE IF NOT EXISTS public\.foundash_access_log/.test(sql));
assert.ok(/kind = 'profile'/.test(sql) || /'profile'/.test(sql));
assert.ok(/REVOKE ALL ON FUNCTION public\.foundash_user_full\(uuid\) FROM PUBLIC, anon, authenticated/.test(sql));
assert.ok(/GRANT EXECUTE ON FUNCTION public\.foundash_user_full\(uuid\) TO authenticated/.test(sql));
assert.ok(/GRANT EXECUTE ON FUNCTION public\.foundash_user_messages\(uuid\) TO authenticated/.test(sql));
assert.ok(!/CREATE[\s\S]{0,80}FUNCTION public\.foundash_overview_counts/.test(sql));
assert.ok(!/DROP FUNCTION[\s\S]{0,80}foundash_users_summary/.test(sql));
assert.ok(/payments_note/.test(sql), 'payments are not queried from a guessed table');
assert.ok(/is_checkin IS NOT TRUE/.test(sql), 'climb sessions exclude baseline check-ins');

const openFn = html.match(/function openUserDetail\(userId\)\{[\s\S]*?\n  function buildUserDetailHtml/)[0];
assert.ok(/sbRpc\('foundash_user_full'/.test(openFn), 'row opens foundash_user_full');
assert.ok(/sbRpc\('foundash_user_messages'/.test(openFn), 'messages load separately');
assert.ok(!/foundash_user_detail/.test(openFn), 'detail RPC is not the profile source');
assert.ok(!/userDetailSoft/.test(openFn), 'profile does not swallow section failures');
assert.ok(!/sbAdminSelect/.test(openFn));
assert.ok(/showSection\('user-profile'\)/.test(openFn));
assert.ok(/showSection\('all-users'\)/.test(html.match(/function bindUserProfileBack\(\)\{[\s\S]*?\n  \}/)[0]));

const detailFn = html.match(/function buildUserDetailHtml\(userId, data, cached\)\{[\s\S]*?\n  function renderUserDetail/)[0];
assert.ok(/Climb sessions/.test(detailFn));
assert.ok(/Named climbs/.test(detailFn));
assert.ok(/Training sessions/.test(detailFn));
assert.ok(/Assignments/.test(detailFn));
assert.ok(/Journal/.test(detailFn));
assert.ok(/Psyche/.test(detailFn));
assert.ok(/Baseline/.test(detailFn));
assert.ok(/Messages/.test(detailFn));
assert.ok(/Payments/.test(detailFn));
assert.ok(/Account/.test(detailFn));
assert.ok(/Access log/.test(detailFn));
assert.ok(/did not come back/.test(html), 'missing section is visible');
assert.ok(/payments_note/.test(detailFn));
assert.ok(!/pay-add-btn/.test(detailFn), 'payments are read-only');
assert.ok(!/foundash_add_user_payment/.test(detailFn));
assert.ok(/emomBoulderResult/.test(detailFn) || /emomBoulderResult/.test(html));
assert.ok(/renderChartOrFallback\('user-profile-sessions-chart'/.test(html), 'overview reuses the chart helper');
assert.ok(/Project-wide charts stay on Analytics/.test(html));
assert.ok(!/function fetchUserBaseline/.test(html), 'baseline REST read removed');
assert.ok(!/function fetchUserJournal/.test(html));
assert.ok(!/function userDetailSoft/.test(html));

function sliceFn(name){
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}');
  const m = html.match(re);
  assert.ok(m, 'extract ' + name);
  return m[0];
}

const helperSrc = [
  'escapeHtml', 'fmtShortDate', 'fmtDate', 'shortId', 'personDisplayName', 'userField',
  'userIsTest', 'isTestAccount', 'userIsCoach', 'userIsAthlete', 'resolveDisplayRole',
  'roleChipClass', 'roleChip', 'usersDateMs', 'usersLastActivityRaw', 'usersRelativeAgo',
  'usersLastActivityLabel', 'usersBaselineSet', 'usersBaselineLabel',
  'parseBaselineTerrainState', 'emomBoulderResult', 'trainingBlocksHtml',
  'userDetailTableHtml', 'userDetailCoachLine', 'userDetailBaselinePanelHtml',
  'userProfileSection', 'userProfileMissing', 'userProfilePeopleLine', 'userProfileAccessInner',
  'buildUserDetailHtml'
].map(sliceFn).join('\n') + '\n' + html.match(/var COACH_BASELINE_TERRAINS = \[[^\]]+\];/)[0];

const check = spawnSync('node', ['--check'], { input: helperSrc, encoding: 'utf8' });
assert.strictEqual(check.status, 0, check.stderr || 'helpers failed node --check');

const vm = spawnSync('node', [], {
  encoding: 'utf8',
  input: helperSrc + `\n
function assert(c, m){ if(!c) throw new Error(m || 'assert'); }
assert(emomBoulderResult({ result: 'sent' }) === 'sent');
assert(emomBoulderResult({ result: 'failed' }) === 'failed');
assert(emomBoulderResult({ complete: true }) === 'sent', 'legacy complete counts as sent');
assert(emomBoulderResult({ text: 'Pink' }) === 'not attempted');
var blocks = trainingBlocksHtml([{ shape: 'emom', rounds: [{ boulders: [
  { text: 'Green V4', result: 'sent' },
  { text: 'Blue V5', result: 'failed' },
  { text: 'Yellow V3', complete: true },
  { text: 'Pink V6' }
]}]}]);
assert(blocks.indexOf('Green V4') !== -1 && blocks.indexOf('sent') !== -1);
assert(blocks.indexOf('failed') !== -1);
assert(blocks.indexOf('not attempted') !== -1);
var linked = {
  profile: {
    first_name: 'Kelly', last_name: 'Peterson', email: 'kelly.peterson@gmail.com',
    signed_up: '2026-07-19T12:00:00Z', is_coach: false, is_athlete: true, is_test: false,
    last_activity: '2026-11-15T12:00:00Z', last_activity_kind: 'checkin',
    baseline_set: true, baseline_at: '2026-10-07T12:00:00Z',
    coach_links: [{ email: 'wes.shih@gmail.com', name: 'Wes Shih', status: 'active' }],
    athletes: [],
    climb_sessions: 1, climbs: 1, training_sessions: 1, falls_count: 1,
    journal_count: 1, psyche_count: 1, assignments_open: 1, assignments_overdue: 1, assignments_completed: 0
  },
  climb_sessions: [{
    created_at: '2026-11-12T12:00:00Z', route_name: 'Arete', grade_value: '5.11a',
    climbing_type: 'sport', setting: 'outdoor', zone: 'learning', zone_confidence: 'high',
    breathing_post: 'steady', gut_post: 'tight', crux_response: 'breathed', body_state: 'ready',
    falls: [{ fall_description: 'slip at the clip' }]
  }],
  climbs: [{ name: 'Arete', grade_value: '5.11a', climbing_type: 'sport', is_project: true }],
  training_sessions: [{
    created_at: '2026-11-13T12:00:00Z', started_at: '2026-11-13T12:00:00Z', ended_at: '2026-11-13T12:40:00Z',
    energy_type: 'strength', notes: 'Hangboard', assignment_title: 'Power',
    blocks: [{ shape: 'emom', rounds: [{ boulders: [{ text: 'Green V4', result: 'sent' }] }] }]
  }],
  assignments: [{ title: 'Power', status: 'overdue', due_date: '2026-11-14', description: 'four rounds', linked_session: { id: '33333333-3333-3333-3333-333333333332', energy_type: 'strength' } }],
  journal: [{ created_at: '2026-11-10T12:00:00Z', entry_text: 'First week notes' }],
  psyche: [{ created_at: '2026-11-11T12:00:00Z', kind: 'drill', drill_key: 'panic-week' }],
  baseline: { id: 'b1', created_at: '2026-10-07T12:00:00Z', baseline_terrain_state: { Slab: 'sent' }, baseline_terrain_calibrated: { Slab: true } },
  payments: [],
  payments_note: 'No per-user payments table is committed in sql/. This section does not query one.',
  account: { email: 'kelly.peterson@gmail.com', created_at: '2026-07-19T12:00:00Z', last_sign_in_at: '2026-11-14T12:00:00Z', raw_user_meta_data: { name: 'Kelly' } },
  access_log: [{ viewed_at: '2026-11-16T12:00:00Z', kind: 'profile', admin_id: '11111111-1111-1111-1111-111111111111' }]
};
var unlinked = {
  profile: {
    first_name: 'Solo', last_name: 'User', email: 'solo.user@gmail.com',
    signed_up: '2026-11-06T12:00:00Z', is_coach: false, is_athlete: false,
    coach_links: [], athletes: [], climb_sessions: 0, climbs: 0, training_sessions: 0,
    falls_count: 0, journal_count: 0, psyche_count: 0, assignments_open: 0,
    baseline_set: false
  },
  climb_sessions: [], climbs: [], training_sessions: [], assignments: [],
  journal: [], psyche: [], baseline: null, payments: [],
  payments_note: linked.payments_note,
  account: { email: 'solo.user@gmail.com', created_at: '2026-11-06T12:00:00Z' },
  access_log: []
};
var linkedHtml = buildUserDetailHtml('kelly', linked, {});
var unlinkedHtml = buildUserDetailHtml('solo', unlinked, {});
assert(linkedHtml.indexOf('Coach: Wes Shih') !== -1, linkedHtml);
assert(linkedHtml.indexOf('Arete') !== -1);
assert(linkedHtml.indexOf('high') !== -1);
assert(linkedHtml.indexOf('slip at the clip') !== -1);
assert(linkedHtml.indexOf('Hangboard') !== -1);
assert(linkedHtml.indexOf('Green V4') !== -1);
assert(linkedHtml.indexOf('overdue') !== -1);
assert(linkedHtml.indexOf('First week notes') !== -1);
assert(linkedHtml.indexOf('panic-week') !== -1);
assert(linkedHtml.indexOf('No per-user payments table') !== -1);
assert(linkedHtml.indexOf('pay-add-btn') === -1);
assert(unlinkedHtml.indexOf('Not linked to a coach') !== -1);
assert(unlinkedHtml.indexOf('No baseline set yet.') !== -1);
assert(unlinkedHtml.indexOf('No climb sessions logged.') !== -1);
var broken = buildUserDetailHtml('x', { profile: {}, payments_note: 'n' }, {});
assert(broken.indexOf('Climb sessions did not come back') !== -1);
console.log('profile-vm: ok');
`
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/profile-vm: ok/.test(vm.stdout));

function runPsql(db, sqlText){
  const file = '/tmp/foundash-user-profile-test.sql';
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
  const drop = spawnSync('sudo', ['-u', 'postgres', 'psql', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'DROP DATABASE IF EXISTS foundash_profile_fx;', '-c', 'CREATE DATABASE foundash_profile_fx;'], { encoding: 'utf8' });
  assert.strictEqual(drop.status, 0, drop.stderr || drop.stdout);
  const harness = readFileSync(join(__dirname, 'fixtures/foundash-user-profile.fixture.sql'), 'utf8');
  const applied = runPsql('foundash_profile_fx', harness + '\n\\i ' + join(__dirname, '../sql/foundash-user-profile.sql') + '\n');
  assert.strictEqual(applied.status, 0, applied.stderr || applied.stdout);

  function call(fn, id){
    const q = spawnSync('sudo', ['-u', 'postgres', 'psql', '-d', 'foundash_profile_fx', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c',
      "SELECT public." + fn + "('" + id + "'::uuid);"], { encoding: 'utf8' });
    assert.strictEqual(q.status, 0, q.stderr || q.stdout);
    return JSON.parse(q.stdout.trim());
  }

  const kelly = call('foundash_user_full', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');
  const solo = call('foundash_user_full', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5');
  assert.strictEqual(kelly.ok, true);
  assert.strictEqual(kelly.profile.climb_sessions, 1, 'baseline and check-in are not climb sessions');
  assert.strictEqual(kelly.profile.climbs, 1);
  assert.strictEqual(kelly.profile.is_athlete, true);
  assert.strictEqual(kelly.profile.coach_links[0].name, 'Wes Shih');
  assert.strictEqual(kelly.profile.baseline_set, true);
  assert.strictEqual(kelly.climb_sessions.length, 1);
  assert.strictEqual(kelly.climb_sessions[0].route_name, 'Arete');
  assert.strictEqual(kelly.climb_sessions[0].zone_confidence, 'high');
  assert.strictEqual(kelly.climb_sessions[0].falls[0].fall_description, 'slip at the clip');
  assert.strictEqual(kelly.training_sessions[0].assignment_title, 'Power');
  assert.strictEqual(kelly.training_sessions[0].blocks[0].rounds[0].boulders[0].result, 'sent');
  assert.strictEqual(kelly.assignments[0].status, 'overdue');
  assert.strictEqual(kelly.assignments[0].linked_session.id, '33333333-3333-3333-3333-333333333332');
  assert.strictEqual(kelly.journal[0].entry_text, 'First week notes');
  assert.ok(kelly.psyche.some(function(row){ return row.kind === 'drill' && row.drill_key === 'panic-week'; }));
  assert.ok(kelly.psyche.some(function(row){ return row.kind === 'checkin'; }));
  assert.ok(kelly.baseline && kelly.baseline.baseline_terrain_state.Slab === 'sent');
  assert.ok(/No per-user payments table/.test(kelly.payments_note));
  assert.strictEqual(kelly.account.email, 'kelly.peterson@gmail.com');
  assert.strictEqual(kelly.access_log[0].kind, 'profile');
  assert.strictEqual(solo.ok, true);
  assert.deepStrictEqual(solo.profile.coach_links, []);
  assert.strictEqual(solo.profile.is_athlete, false);
  assert.strictEqual(solo.climb_sessions.length, 0);
  assert.strictEqual(solo.profile.climb_sessions, 0);
  assert.strictEqual(solo.access_log[0].kind, 'profile');

  const kellyMsgs = call('foundash_user_messages', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');
  const soloMsgs = call('foundash_user_messages', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5');
  assert.strictEqual(kellyMsgs.messages.length, 2);
  assert.strictEqual(kellyMsgs.messages[0].body, 'Try the arete again');
  assert.strictEqual(kellyMsgs.messages[1].body, 'Sent it');
  assert.strictEqual(kellyMsgs.messages[0].sender_name, 'Wes Shih');
  assert.strictEqual(kellyMsgs.messages[1].sender_name, 'Kelly Peterson');
  assert.ok(kellyMsgs.access_log.some(function(row){ return row.kind === 'messages'; }));
  assert.ok(kellyMsgs.access_log.some(function(row){ return row.kind === 'profile'; }));
  assert.strictEqual(soloMsgs.messages.length, 0);
  assert.ok(soloMsgs.access_log.some(function(row){ return row.kind === 'messages'; }));

  const denied = spawnSync('sudo', ['-u', 'postgres', 'psql', '-d', 'foundash_profile_fx', '-v', 'ON_ERROR_STOP=1', '-c',
    "SET ROLE anon; SELECT public.foundash_user_full('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5'::uuid);"], { encoding: 'utf8' });
  assert.notStrictEqual(denied.status, 0);
  assert.ok(/permission denied for function foundash_user_full/.test(denied.stderr || ''));

  writeFileSync('/opt/cursor/artifacts/foundash-user-profile-fixture.json', JSON.stringify({
    linked: { profile: kelly.profile, climb_sessions: kelly.climb_sessions, training_sessions: kelly.training_sessions, assignments: kelly.assignments, journal: kelly.journal, psyche: kelly.psyche, baseline: kelly.baseline, payments_note: kelly.payments_note, messages: kellyMsgs.messages, access_log: kellyMsgs.access_log },
    unlinked: { profile: solo.profile, climb_sessions: solo.climb_sessions, messages: soloMsgs.messages, access_log: soloMsgs.access_log, payments_note: solo.payments_note }
  }, null, 2));
  console.log('FIXTURE linked climb_sessions ' + kelly.profile.climb_sessions + ' coach ' + kelly.profile.coach_links[0].name);
  console.log('FIXTURE unlinked coach_links ' + JSON.stringify(solo.profile.coach_links));
}

console.log('foundash-user-profile tests: ok');
