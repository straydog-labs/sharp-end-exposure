import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const sql = readFileSync(join(root, 'sql/custom-workouts-is-starred.sql'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index288'/.test(index));
assert.ok(/APP_VERSION = 'index288'/.test(sw));
assert.ok(/add column if not exists is_starred/.test(sql));
assert.ok(/custom_workouts/.test(sql));

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

const train = index.slice(index.indexOf('id="screen-train"'), index.indexOf('id="screen-train-start"'));
assert.ok(/Start training/.test(train));
assert.ok(/Build session/.test(train));
assert.ok(/My plan/.test(train));
assert.ok(/id="train-pinned-strip"/.test(train));
assert.ok(/Assignments due/.test(train));
assert.ok(/id="train-stat-week-plan"/.test(train));
assert.ok(/id="train-stat-least"/.test(train));
assert.ok(/id="train-stat-weeks4"/.test(train));
assert.ok(/id="train-stat-adhere"/.test(train));
assert.ok(!/id="train-stat-streak"/.test(train));
assert.ok(!/id="train-stat-since"/.test(train));
assert.ok(/id="train-landing-col"/.test(train));
assert.ok(/climb-page-col/.test(train));
assert.ok(!/id="train-hub-card-repeat"/.test(train));
assert.ok(/History/.test(train));
assert.ok(/View all/.test(train));
assert.ok(!/Write your own training plan/.test(train));
assert.ok(train.indexOf('id="train-hub-card-start"') < train.indexOf('id="train-pinned-strip"'));
assert.ok(train.indexOf('id="train-pinned-strip"') < train.indexOf('id="train-hub-due-list"'));
assert.ok(train.indexOf('id="train-hub-stats"') < train.indexOf('id="train-hub-recent-mini"'));

assert.ok(/function pinnedStripCardHtml\(/.test(index));
assert.ok(/pinnedStripCardHtml\(/.test(extractFn(index, 'renderQuickStrip')));
assert.ok(/pinnedStripCardHtml\(/.test(extractFn(index, 'renderTrainPinnedStrip')));
assert.ok(/sbU\(\s*'custom_workouts'/.test(extractFn(index, 'toggleCustomWorkoutStar')));
assert.ok(/is_starred/.test(extractFn(index, 'toggleCustomWorkoutStar')));
assert.ok(/loadTrainWorkoutCatalog/.test(extractFn(index, 'loadTrainHub')));
assert.ok(/saveTrainSessionAsWorkout/.test(index));
assert.ok(/sbI\('custom_workouts'/.test(extractFn(index, 'saveTrainSessionAsWorkout')));

const helpers = [
  'var TRAINING_FOCUS_VALUES = ["Boulders","Routes","Boards","Hangboard","Strength & Weights","Mobility & Flexibility","Technique & Footwork","Cardio & Capacity","Mental/Other","Warm-Ups"];',
  extractFn(index, 'isCustomWorkoutStarred'),
  extractFn(index, 'pickTrainPinnedWorkouts'),
  extractFn(index, 'isHomeAssignmentDueSoon'),
  extractFn(index, 'homeAssignmentDueDay'),
  extractFn(index, 'athleteWeekBounds'),
  extractFn(index, 'athleteLocalDayKeyFromDate'),
  extractFn(index, 'athleteLocalDayKeyFromIso'),
  extractFn(index, 'computeAthleteStreak'),
  extractFn(index, 'trainSessionsInWeek'),
  extractFn(index, 'trainAssignmentsInWindow'),
  extractFn(index, 'trainAssignmentsPlannedThisWeek'),
  extractFn(index, 'normalizeTrainingFocus'),
  extractFn(index, 'legacyTrainingFocusFromCategory'),
  extractFn(index, 'trainSessionFocus'),
  extractFn(index, 'computeLeastTrainedFocus'),
  extractFn(index, 'computeTrainWeeklyBars'),
  extractFn(index, 'computeTrainLandingStats')
].join('\n');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(helpers, ctx);

const customs = [
  { id: 'a', name: 'Old', created_at: '2026-01-01', is_starred: false },
  { id: 'b', name: 'Star', created_at: '2026-02-01', is_starred: true },
  { id: 'c', name: 'New', created_at: '2026-03-01', is_starred: false }
];
const starred = ctx.pickTrainPinnedWorkouts(customs);
assert.strictEqual(starred.length, 1);
assert.strictEqual(starred[0].id, 'b');
const recent = ctx.pickTrainPinnedWorkouts(customs.map(function(x){ return Object.assign({}, x, { is_starred: false }); }));
assert.strictEqual(recent.length, 3);

const now = new Date('2026-09-10T12:00:00');
const sessions = [
  { started_at: '2026-09-10T10:00:00' },
  { started_at: '2026-09-09T10:00:00' },
  { started_at: '2026-09-08T10:00:00' }
];
const assigns = [
  { id: '1', due_date: '2026-09-10', completed_at: '2026-09-10' },
  { id: '2', due_date: '2026-09-09', completed_at: null },
  { id: '3', due_date: '2026-09-01', completed_at: '2026-09-02' }
];
const stats = ctx.computeTrainLandingStats(sessions, assigns, now);
assert.ok(stats.week.indexOf('/') !== -1);
assert.notStrictEqual(stats.streak, '—');
assert.notStrictEqual(stats.since, '—');
assert.strictEqual(ctx.computeTrainLandingStats(sessions.slice(0, 2), assigns, now).since, '—');
assert.strictEqual(ctx.computeTrainLandingStats(sessions, assigns.slice(0, 2), now).adhere, '—');

const planned = ctx.trainAssignmentsPlannedThisWeek([
  { id: '1', due_date: '2026-09-10', completed_at: '2026-09-10' },
  { id: '2', due_date: '2026-09-09', completed_at: null },
  { id: '3', due_date: '2026-09-01', completed_at: '2026-09-02' },
  { id: '4', due_date: null, created_at: '2026-09-08T12:00:00', completed_at: null },
  { id: '5', due_date: null, created_at: '2026-09-08T12:00:00', completed_at: '2026-09-08' },
  { id: '6', due_date: null, created_at: '2026-08-01T12:00:00', completed_at: null }
], now);
assert.deepStrictEqual(planned.map(function(a){ return a.id; }).sort(), ['1', '2', '4']);
const weekStats = ctx.computeTrainLandingStats(sessions, [
  { id: '1', due_date: '2026-09-10', completed_at: '2026-09-10' },
  { id: '2', due_date: '2026-09-09', completed_at: null },
  { id: '6', due_date: null, created_at: '2026-08-01T12:00:00', completed_at: null }
], now);
assert.strictEqual(weekStats.week, '3 / 2');

const leastSessions = [
  { energy_type: 'Hangboard', started_at: '2026-09-10T10:00:00' },
  { energy_type: 'Boulders', started_at: '2026-09-01T10:00:00' },
  { energy_type: 'Hangboard', started_at: '2026-09-08T10:00:00' }
];
const least = ctx.computeLeastTrainedFocus(leastSessions, now);
assert.strictEqual(least.focus, 'Boulders');
assert.strictEqual(least.days, 9);
assert.strictEqual(ctx.computeLeastTrainedFocus(leastSessions.slice(0, 2), now).label, '—');
const fullStats = ctx.computeTrainLandingStats(leastSessions, assigns, now);
assert.strictEqual(fullStats.least.focus, 'Boulders');
assert.ok(Array.isArray(fullStats.weekBars) && fullStats.weekBars.length === 4);
assert.strictEqual(ctx.computeTrainLandingStats(leastSessions.slice(0, 2), assigns, now).least.label, '—');
assert.strictEqual(ctx.computeTrainLandingStats(leastSessions.slice(0, 2), assigns, now).weekBars, null);
assert.strictEqual(ctx.trainSessionFocus({ energy_type: 'Hangboard' }), 'Hangboard');
assert.strictEqual(ctx.trainSessionFocus({ energy_type: 'strength' }), 'Strength & Weights');

console.log('train-climb-template tests: ok');
