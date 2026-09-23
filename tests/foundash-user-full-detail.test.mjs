import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');

assert.ok(/id="users-filter-baseline"/.test(html));
assert.ok(/data-sort="baseline"/.test(html));
assert.ok(/hydrateUsersBaselineFlags/.test(html));
assert.ok(/fetchUserBaseline/.test(html));
assert.ok(/is_baseline=eq\.true&user_id=eq\./.test(html), 'same baseline query as coach');
assert.ok(/foundash_athlete_training/.test(html.match(/function openUserDetail\(userId\)\{[\s\S]*?\n  function /)[0]));
assert.ok(/function mergeUserDetailBundle/.test(html));
assert.ok(/function userDetailCoachLine/.test(html));
assert.ok(/No baseline set yet\./.test(html));
assert.ok(/Not linked to a coach/.test(html));
assert.ok(/metric-label">Baseline/.test(html));
assert.ok(!/sql\//.test(html.match(/function fetchUserBaseline[\s\S]*function renderUserDetail/)[0] || ''), 'no SQL files in client compose');

function sliceFn(name){
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}');
  const m = html.match(re);
  assert.ok(m, 'extract ' + name);
  return m[0];
}

const terrains = html.match(/var COACH_BASELINE_TERRAINS = \[[^\]]+\];/)[0];
const src = [
  sliceFn('escapeHtml'),
  sliceFn('shortId'),
  sliceFn('personDisplayName'),
  sliceFn('fmtDate'),
  sliceFn('fmtShortDate'),
  terrains,
  sliceFn('parseBaselineTerrainState'),
  sliceFn('userField'),
  sliceFn('userIsTest'),
  sliceFn('isTestAccount'),
  sliceFn('userIsCoach'),
  sliceFn('userIsAthlete'),
  sliceFn('userDetailTableHtml'),
  sliceFn('userDetailAccordionHtml'),
  sliceFn('enrichClimbsFromTraining'),
  sliceFn('mergeUserDetailBundle'),
  sliceFn('userDetailCoachLine'),
  sliceFn('userDetailBaselinePanelHtml'),
  sliceFn('buildUserDetailHtml'),
  'function opsMoney(n){ return (Number(n)||0).toFixed(2); }'
].join('\n');

const check = spawnSync('node', ['--check'], { input: src, encoding: 'utf8' });
assert.strictEqual(check.status, 0, check.stderr || 'helpers failed node --check');

const vm = spawnSync('node', [], {
  encoding: 'utf8',
  input: src + '\n' +
    `function assert(c, m){ if(!c) throw new Error(m); }
     var linkedId = 'anna-1';
     var unlinkedId = 'signup-1';
     var annaDetail = {
       ok: true,
       profile: {
         first_name: 'Anna', last_name: 'Islamova', email: 'anna@x.com',
         climb_count: 0, falls_count: 0, journal_count: 1, psyche_count: 0, train_count: 0,
         signup_date: '2026-09-04T12:00:00Z', is_coach: false
       },
       climbs: [{
         id: 'c1', created_at: '2026-09-10T12:00:00Z', route_name: 'Arete',
         grade_value: '5.11a', climbing_type: 'sport', setting: 'outdoor', zone: 'red'
       }],
       psyche: [],
       train: [],
       payments: []
     };
     var training = {
       ok: true,
       sessions: [{
         id: 'c1', zone_confidence: 'high', breathing_post: 'slow',
         gut_post: 'ok', crux_response: 'committed', body_state: 'fresh'
       }],
       falls: [{ id: 'f1', session_id: 'c1', created_at: '2026-09-10T12:05:00Z' }],
       assignments: [{
         id: 'a1', coach_id: 'coach-1', title: 'Hangboard',
         description: '3x7', due_date: '2026-09-20', completed_at: null
       }]
     };
     var baseline = {
       id: 'b1',
       created_at: '2026-09-04T13:00:00Z',
       baseline_terrain_state: { Slab: 'solid', Vertical: 'ok' },
       baseline_terrain_calibrated: { Slab: true }
     };
     var journal = [{ id: 'j1', created_at: '2026-09-05T08:00:00Z', entry_text: 'First week notes' }];
     var roster = [{
       athlete_id: 'anna-1', coach_id: 'coach-1', coach_email: 'wes@x.com',
       coach_first_name: 'Wes', status: 'active', linked_at: '2026-09-01T00:00:00Z'
     }];
     var linked = mergeUserDetailBundle(linkedId, {
       detail: annaDetail, training: training, baseline: baseline,
       journal: journal, rosterLinks: roster, is_coach: false
     }, { first_name: 'Anna', last_name: 'Islamova', email: 'anna@x.com', is_coach: false });
     assert(linked.climbs[0].zone_confidence === 'high', 'climb fields merged from training');
     assert(linked.falls.length === 1, 'falls from training');
     assert(linked.assignments[0].title === 'Hangboard', 'assignments from training');
     assert(linked.journal[0].entry_text === 'First week notes', 'journal list');
     assert(linked.coach_links.length === 1, 'coach link from roster');
     assert(linked.baseline.id === 'b1', 'baseline attached');
     assert(userDetailCoachLine(linked.coach_links) === 'Coach: wes@x.com (active)', 'coach line');

     var soloDetail = {
       ok: true,
       profile: {
         first_name: '', last_name: '', email: 'solo@x.com',
         climb_count: 0, falls_count: 0, journal_count: 0, psyche_count: 0, train_count: 0,
         created_at: '2026-09-22T18:00:00Z'
       },
       climbs: [], psyche: [], train: [], payments: []
     };
     var unlinked = mergeUserDetailBundle(unlinkedId, {
       detail: soloDetail,
       training: { ok: true, sessions: [], falls: [], assignments: [] },
       baseline: null,
       journal: [],
       rosterLinks: roster,
       is_coach: false
     }, { email: 'solo@x.com', signup_date: '2026-09-22T18:00:00Z', is_coach: false });
     assert(unlinked.coach_links.length === 0, 'unlinked has empty coach_links');
     assert(userDetailCoachLine(unlinked.coach_links) === 'Not linked to a coach', 'unlinked coach line');
     assert(userDetailBaselinePanelHtml(null) === '<div class="bo-empty">No baseline set yet.</div>', 'empty baseline exact');
     var panel = userDetailBaselinePanelHtml(baseline);
     assert(panel.indexOf('Slab') !== -1 && panel.indexOf('Crack') !== -1, 'all 5 terrains');
     assert(panel.indexOf('Calibrated') !== -1, 'calibrated badge');
     assert(panel.indexOf('Not set') !== -1, 'unset terrain');
     assert(!/session/i.test(panel), 'baseline panel text has no session');

     var linkedHtml = buildUserDetailHtml(linkedId, linked, { first_name: 'Anna', last_name: 'Islamova', email: 'anna@x.com' });
     var unlinkedHtml = buildUserDetailHtml(unlinkedId, unlinked, { email: 'solo@x.com', signup_date: '2026-09-22T18:00:00Z' });
     assert(linkedHtml.indexOf('Coach: wes@x.com (active)') !== -1);
     assert(linkedHtml.indexOf('metric-label">Baseline') !== -1);
     assert(linkedHtml.indexOf('>Set<') !== -1);
     assert(linkedHtml.indexOf('Arete') !== -1 && linkedHtml.indexOf('high') !== -1);
     assert(linkedHtml.indexOf('Hangboard') !== -1);
     assert(linkedHtml.indexOf('First week notes') !== -1);
     assert(unlinkedHtml.indexOf('Not linked to a coach') !== -1);
     assert(unlinkedHtml.indexOf('Not set') !== -1);
     assert(unlinkedHtml.indexOf('No baseline set yet.') !== -1);
     assert(unlinkedHtml.indexOf('No climbs logged.') !== -1);
     assert(unlinkedHtml.indexOf('No falls logged.') !== -1);
     assert(unlinkedHtml.indexOf('No assignments.') !== -1);
     assert(unlinkedHtml.indexOf('No journal entries.') !== -1);
     assert(!/session/i.test(userDetailBaselinePanelHtml(linked.baseline)));

     console.log('---LINKED_HTML---');
     console.log(linkedHtml);
     console.log('---UNLINKED_HTML---');
     console.log(unlinkedHtml);
     console.log('full-detail: ok');`
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/full-detail: ok/.test(vm.stdout));
assert.ok(/Coach: wes@x.com \(active\)/.test(vm.stdout));
assert.ok(/Not linked to a coach/.test(vm.stdout));

console.log('foundash-user-full-detail tests: ok');
