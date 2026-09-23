import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const sql = readFileSync(join(root, 'sql/training-blocks.sql'), 'utf8');
const coach = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index267'/.test(index));
assert.ok(/APP_VERSION = 'index267'/.test(sw));

assert.ok(/id="train-hub-card-blocks"/.test(index));
assert.ok(/id="screen-train-blocks"/.test(index));
assert.ok(/id="screen-train-block-detail"/.test(index));
assert.ok(/id="saw-sections-list"/.test(index));
assert.ok(/Warm-up/.test(index) && /Cooldown/.test(index));
assert.ok(/function cleanedSelfAssignSections\(/.test(index));
assert.ok(/function seedDefaultSessionSections\(/.test(index));
assert.ok(/function applyLiveTitleDescriptionForBlockAssignments\(/.test(index));
assert.ok(/function placeTrainingBlockSession\(/.test(index));
assert.ok(/function insertAthleteSelfAssignment\(/.test(index));
assert.ok(/function trainingBlockWeeksMissingPlacement\(/.test(index));
assert.ok(/function offerReassignToOtherWeeks\(/.test(index));
assert.ok(/function applyBlockReassignToWeeks\(/.test(index));
assert.ok(/id="tb-reassign-panel"/.test(index));
assert.ok(/Apply to all remaining weeks/.test(index));
assert.ok(/Reassign to other weeks/.test(index));
assert.ok(/Choose specific weeks/.test(index));
assert.ok(/Same linked template/.test(index));
const applyFn = extractFn(index, 'applyBlockReassignToWeeks');
assert.ok(/placeTrainingBlockSession/.test(applyFn));
assert.ok(/itemId: ctx\.itemId/.test(applyFn));
assert.ok(!/custom_workouts/.test(applyFn), 'reassign is linked place, not a template copy');
assert.ok(/offerReassignToOtherWeeks\(reassignMeta\)/.test(index));
assert.ok(/sections:\s*cleanedSelfAssignSections\(\)/.test(index));
assert.ok(/a\._fromTrainingBlock/.test(index));
assert.ok(/Training block/.test(index));
assert.ok(/item_source/.test(index));

assert.ok(/CREATE TABLE IF NOT EXISTS public\.training_blocks/.test(sql));
assert.ok(/CREATE TABLE IF NOT EXISTS public\.training_block_sessions/.test(sql));
assert.ok(/athlete_id = auth\.uid\(\)/.test(sql));
assert.ok(/item_source text NOT NULL CHECK \(item_source IN \('foundational', 'custom'\)\)/.test(sql));
assert.ok(/assignment_id/.test(sql));

assert.ok(!/training_blocks/.test(coach), 'coach-dashboard must stay untouched');
assert.ok(!/screen-train-blocks/.test(coach));

function extractFn(src, name){
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' missing');
  let i = src.indexOf('{', start);
  let depth = 0;
  for(; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){
      depth--;
      if(depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const fns = [
  'localIsoDate',
  'trainingBlockScheduledDate',
  'formatBlockWeekListLabel',
  'trainingBlockWeeksMissingPlacement',
  'assignmentItemKey',
  'applyLiveTitleDescriptionForBlockAssignments',
  'parseSelfAssignDurationSec',
  'parseSelfAssignNonNegInt',
  'normalizeSelfAssignExerciseKind',
  'newSelfAssignExercise',
  'newSelfAssignSection',
  'seedDefaultSessionSections',
  'cleanedSelfAssignExercises',
  'cleanedSelfAssignSections',
  'buildSelfAssignBulkExercises'
].map(function(name){ return extractFn(index, name); }).join('\n');

const vm = spawnSync('node', [], {
  encoding: 'utf8',
  input: `
    ${fns}
    var _selfAssignWizard = { sections: seedDefaultSessionSections() };
    function assert(c, m){ if(!c) throw new Error(m); }

    assert(_selfAssignWizard.sections.length === 3, 'seed count');
    assert(_selfAssignWizard.sections[0].label === 'Warm-up', 'warm-up');
    assert(_selfAssignWizard.sections[1].label === 'Workout', 'workout');
    assert(_selfAssignWizard.sections[2].label === 'Cooldown', 'cooldown');

    _selfAssignWizard.sections[0].exercises.push(newSelfAssignExercise({ title: 'Band pull-aparts', kind: 'check' }));
    _selfAssignWizard.sections[1].exercises.push(newSelfAssignExercise({ title: 'Repeaters', kind: 'interval', work_sec: '7', rest_sec: '3', target_sets: '6' }));
    var cleaned = cleanedSelfAssignSections();
    assert(cleaned.length === 3, 'cleaned keeps 3 labeled sections');
    assert(cleaned[0].order === 0 && cleaned[0].label === 'Warm-up', 'order 0');
    assert(cleaned[0].exercises[0].title === 'Band pull-aparts' && cleaned[0].exercises[0].kind === 'check', 'check ex');
    assert(cleaned[1].exercises[0].kind === 'interval' && cleaned[1].exercises[0].work_sec === 7, 'interval shape');
    assert(cleaned[1].exercises[0].rest_sec === 3 && cleaned[1].exercises[0].target_sets === 6, 'interval fields');
    assert(!('id' in cleaned[0]), 'persisted sections drop ui ids');

    _selfAssignWizard.sections[2].label = '   ';
    var trimmed = cleanedSelfAssignSections();
    assert(trimmed.length === 2, 'blank labels drop');

    var bulk = buildSelfAssignBulkExercises({ count: 3, stem: 'Boulder', kind: 'check' });
    assert(bulk.length === 3 && bulk[2].title === 'Boulder 3', 'bulk rounds');

    assert(trainingBlockScheduledDate('2026-09-21', 1, 0) === '2026-09-21', 'w1d0');
    assert(trainingBlockScheduledDate('2026-09-21', 1, 6) === '2026-09-27', 'w1d6');
    assert(trainingBlockScheduledDate('2026-09-21', 4, 0) === '2026-10-12', 'w4d0');
    assert(trainingBlockScheduledDate('2026-09-21', 6, 6) === '2026-11-01', 'w6d6');

    var snap = { id: 'asg-snap', title: 'Old title', description: 'Old desc' };
    var live = { id: 'asg-live', title: 'Old title', description: 'Old desc' };
    var coachA = { id: 'asg-coach', title: 'Coach copy', description: 'Coach desc', coach_id: 'c1' };
    applyLiveTitleDescriptionForBlockAssignments(
      [snap, live, coachA],
      [{ assignment_id: 'asg-live', item_id: 'cw-1', item_source: 'custom' }],
      { 'custom:cw-1': { name: 'Updated template', description: 'Live protocol' } }
    );
    assert(live._fromTrainingBlock === true, 'flag live');
    assert(live.title === 'Updated template', 'live title');
    assert(live.description === 'Live protocol', 'live desc');
    assert(snap.title === 'Old title' && snap.description === 'Old desc' && !snap._fromTrainingBlock, 'self-assign snapshot');
    assert(coachA.title === 'Coach copy' && coachA.description === 'Coach desc' && !coachA._fromTrainingBlock, 'coach snapshot');

    var w1 = { id: 'a1', title: 'Old', description: 'Old' };
    var w4 = { id: 'a2', title: 'Old', description: 'Old' };
    applyLiveTitleDescriptionForBlockAssignments(
      [w1, w4],
      [
        { assignment_id: 'a1', item_id: 'cw-1', item_source: 'custom' },
        { assignment_id: 'a2', item_id: 'cw-1', item_source: 'custom' }
      ],
      { 'custom:cw-1': { name: 'One edit', description: 'Everywhere' } }
    );
    assert(w1.title === 'One edit' && w4.title === 'One edit', 'edit once updates both placements');
    assert(w1.description === 'Everywhere' && w4.description === 'Everywhere', 'desc both');

    var missAll = trainingBlockWeeksMissingPlacement(
      { weeks: 6 },
      [{ item_id: 'cw-1', week_number: 1, day_of_week: 0 }],
      { itemId: 'cw-1', weekNumber: 1, dayOfWeek: 0 }
    );
    assert(missAll.remaining.join(',') === '2,3,4,5,6', 'remaining later weeks');
    assert(missAll.other.join(',') === '2,3,4,5,6', 'other matches remaining from week 1');

    var missSkip = trainingBlockWeeksMissingPlacement(
      { weeks: 6 },
      [
        { item_id: 'cw-1', week_number: 1, day_of_week: 0 },
        { item_id: 'cw-1', week_number: 4, day_of_week: 0 },
        { item_id: 'other', week_number: 2, day_of_week: 0 }
      ],
      { itemId: 'cw-1', weekNumber: 1, dayOfWeek: 0 }
    );
    assert(missSkip.remaining.join(',') === '2,3,5,6', 'skip weeks that already have this item');

    var fromLast = trainingBlockWeeksMissingPlacement(
      { weeks: 4 },
      [{ item_id: 'cw-1', week_number: 4, day_of_week: 2 }],
      { itemId: 'cw-1', weekNumber: 4, dayOfWeek: 2 }
    );
    assert(fromLast.remaining.join(',') === '', 'no remaining after last week');
    assert(fromLast.other.join(',') === '1,2,3', 'earlier weeks still eligible');

    var sameDayOnly = trainingBlockWeeksMissingPlacement(
      { weeks: 3 },
      [{ item_id: 'cw-1', week_number: 2, day_of_week: 1 }],
      { itemId: 'cw-1', weekNumber: 1, dayOfWeek: 0 }
    );
    assert(sameDayOnly.remaining.join(',') === '2,3', 'different weekday does not occupy');

    assert(formatBlockWeekListLabel([2,3,4]) === 'weeks 2, 3, and 4', 'week list label');

    console.log('training-blocks logic: ok');
  `
});

assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/training-blocks logic: ok/.test(vm.stdout));
console.log('training-blocks tests: ok');
