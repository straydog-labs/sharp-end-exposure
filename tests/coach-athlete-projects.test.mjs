import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
require(join(__dirname, '../js/coach-athlete-insights.js'));
const CI = globalThis.CoachInsights;

const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');
const sql = readFileSync(join(__dirname, '../sql/climbs-select-coach.sql'), 'utf8');

assert.ok(CI.buildAthleteProjectList);
assert.strictEqual(CI.isStarredProject({ is_project: true, id: 'c1' }), true);
assert.strictEqual(CI.isStarredProject({ is_project: false, id: 'c1' }), false);
assert.strictEqual(CI.isStarredProject({ is_project: true, deleted_at: '2026-09-01', id: 'c1' }), false);

const sessionsA = [
  { id: 's1', climb_id: 'climb-a', zone: 'learning', is_checkin: false },
  { id: 's2', climb_id: 'climb-a', zone: 'panic', is_checkin: false },
  { id: 's3', climb_id: 'climb-b', zone: 'comfort', is_checkin: false },
  { id: 's4', climb_id: 'climb-a', zone: 'learning', is_checkin: true }
];
const sessionsB = [
  { id: 's9', climb_id: 'climb-a', zone: 'panic', is_checkin: false }
];

const climbsA = [
  { id: 'climb-a', name: 'Midnight Lightning', grade_value: 'V8', climbing_type: 'Overhang', is_project: true },
  { id: 'climb-b', name: 'Not starred', grade_value: 'V3', climbing_type: 'Slab', is_project: false },
  { id: 'climb-c', name: 'Roof project', grade_value: '5.12a', climbing_type: 'Roof', is_project: true }
];
const climbsB = [
  { id: 'climb-a', name: 'Different athlete same id must not leak', grade_value: 'V1', climbing_type: 'Slab', is_project: true }
];

const listA = CI.buildAthleteProjectList(climbsA, sessionsA);
assert.strictEqual(listA.length, 2);
assert.strictEqual(listA[0].name, 'Midnight Lightning');
assert.strictEqual(listA[0].grade, 'V8');
assert.strictEqual(listA[0].terrain, 'Overhang');
assert.strictEqual(listA[0].attempts, 2, 'checkins excluded; two real attempts');
assert.strictEqual(listA[1].name, 'Roof project');
assert.strictEqual(listA[1].attempts, 0);

const listB = CI.buildAthleteProjectList(climbsB, sessionsB);
assert.strictEqual(listB.length, 1);
assert.strictEqual(listB[0].attempts, 1);
assert.notStrictEqual(listA[0].attempts, listB[0].attempts, 'two athletes must not share attempt counts');

assert.deepStrictEqual(CI.buildAthleteProjectList([], sessionsA), []);
assert.deepStrictEqual(CI.buildAthleteProjectList(null, null), []);

assert.ok(!/athlete-projects-panel/.test(dash), 'buried landing panel is gone');
assert.ok(/athleteHubCardHtml\('projects', 'Track', 'Projects', 'hub-projects-sub'/.test(dash));
assert.ok(/id="detail-projects"/.test(dash));
assert.ok(/pane === 'projects'/.test(dash));
assert.ok(/No projects starred yet/.test(dash));
assert.ok(/is_project=eq\.true/.test(dash));
assert.ok(!/is_project=eq\.false/.test(dash));
assert.ok(!/star-toggle|toggleProject|is_project:\s*true/.test(dash.replace(/\s+/g, '')));
assert.ok(/climb_id/.test(dash));
assert.ok(/Targeted training/.test(dash));
assert.ok(/Similar training \(approximate\)/.test(dash));
assert.ok(/not a confirmed link/.test(dash));
assert.ok(/data-training-kind="tagged"/.test(dash));
assert.ok(/data-training-kind="approximate"/.test(dash));
assert.ok(/project-training-approx/.test(dash));
assert.ok(/starring stays on the athlete side/.test(dash));
assert.ok(!/wes\s*shih|jessica\.somos|sender\s*one/i.test(dash + sql));

assert.ok(CI.attemptsForClimbChronological);
assert.ok(CI.projectZoneTrendSummary);
assert.ok(CI.matchAssignmentsToProject);

const chrono = CI.attemptsForClimbChronological([
  { id: 's-new', climb_id: 'climb-a', zone: 'comfort', baseline_zone: 'sent', created_at: '2026-09-20T12:00:00Z', is_checkin: false },
  { id: 's-old', climb_id: 'climb-a', zone: 'panic', baseline_zone: 'fell', created_at: '2026-09-01T12:00:00Z', is_checkin: false },
  { id: 's-mid', climb_id: 'climb-a', zone: 'learning', baseline_zone: 'took', created_at: '2026-09-10T12:00:00Z', is_checkin: false },
  { id: 's-other', climb_id: 'climb-c', zone: 'panic', created_at: '2026-09-05T12:00:00Z', is_checkin: false },
  { id: 's-check', climb_id: 'climb-a', zone: 'panic', created_at: '2026-09-08T12:00:00Z', is_checkin: true }
], 'climb-a');
assert.deepStrictEqual(chrono.map(function(s){ return s.id; }), ['s-old', 's-mid', 's-new']);
assert.strictEqual(CI.sessionAttemptResultLabel(chrono[0]), 'Fell');
assert.strictEqual(CI.sessionAttemptResultLabel(chrono[1]), 'Took');
assert.strictEqual(CI.sessionAttemptResultLabel(chrono[2]), 'Sent');

const trend = CI.projectZoneTrendSummary(chrono);
assert.ok(/3 attempts over 3 weeks/.test(trend));
assert.ok(/Panic → Learning → Comfort/.test(trend));

const project = { id: 'climb-a', name: 'Midnight Lightning', grade: 'V8', terrain: 'Overhang' };
const matched = CI.matchAssignmentsToProject([
  { id: 'a-tag', title: 'Board repeaters', target_climb_id: 'climb-a', created_at: '2026-09-12' },
  { id: 'a-approx', title: 'Overhang power', created_at: '2026-09-11' },
  { id: 'a-unrelated', title: 'Easy slab mileage', created_at: '2026-09-11' },
  { id: 'a-outside', title: 'Overhang power', created_at: '2026-01-01' }
], project, chrono);
assert.strictEqual(matched.tagged.length, 1);
assert.strictEqual(matched.tagged[0].id, 'a-tag');
assert.strictEqual(matched.approximate.length, 1);
assert.strictEqual(matched.approximate[0].id, 'a-approx');

assert.ok(/drop policy if exists climbs_select_coach/i.test(sql));
assert.ok(/create policy climbs_select_coach/i.test(sql));
assert.ok(/for select/i.test(sql));
assert.ok(/coach_athlete_links/.test(sql));
assert.ok(/status = 'active'/.test(sql));
assert.ok(/cal\.coach_id = auth\.uid\(\)/.test(sql));
assert.ok(/cal\.athlete_id = climbs\.user_id/.test(sql));
assert.ok(!/for insert|for update|for all/i.test(sql));
assert.ok(!/alter table/i.test(sql));
assert.ok(!/add column/i.test(sql));
assert.ok(!/create table/i.test(sql));
assert.ok(!/climb_beta_notes/.test(sql));
assert.ok(!/insert into/i.test(sql));

console.log('coach-athlete-projects tests: ok');
