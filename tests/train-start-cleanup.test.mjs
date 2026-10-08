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
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index291'/.test(index));
assert.ok(/APP_VERSION = 'index291'/.test(sw));
assert.ok(!/id="train-start-pinned-strip"/.test(dash), 'coach-dashboard untouched');

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

function extractBetween(src, startId, endId){
  const start = src.indexOf('id="' + startId + '"');
  assert.ok(start >= 0, startId + ' missing');
  const end = src.indexOf('id="' + endId + '"', start);
  assert.ok(end > start, endId + ' after ' + startId);
  return src.slice(start, end);
}

const startScreen = extractBetween(index, 'screen-train-start', 'screen-train-recent');
assert.ok(/Start a session/.test(startScreen));
assert.ok(!/Pick a focus, then a workout/.test(startScreen));
assert.ok(!/Energy mix/i.test(startScreen));
assert.ok(!/id="train-arc-dots"/.test(startScreen));
assert.ok(startScreen.indexOf('id="train-start-search"') < startScreen.indexOf('id="train-start-pinned-wrap"'));
assert.ok(startScreen.indexOf('id="train-start-pinned-wrap"') < startScreen.indexOf('id="train-energy-grid"'));
assert.ok(/hidden/.test(startScreen.match(/id="train-start-pinned-wrap"[^>]*/)[0]));

const landing = extractBetween(index, 'screen-train', 'screen-train-start');
assert.ok(/id="train-landing-col"/.test(landing));
assert.ok(/climb-page-col/.test(landing));
assert.ok(!/id="train-hub-card-repeat"/.test(landing));
assert.ok(landing.indexOf('id="train-landing-col"') < landing.indexOf('id="train-hub-card-start"'));
assert.ok(landing.indexOf('id="train-hub-card-start"') < landing.indexOf('id="train-pinned-strip"'));
assert.ok(landing.indexOf('id="train-pinned-strip"') < landing.indexOf('id="train-hub-due-list"'));
assert.ok(/Least trained/.test(landing));
assert.ok(/Last 4 weeks/.test(landing));
assert.ok(/id="train-stat-least"/.test(landing));
assert.ok(/id="train-stat-weeks4"/.test(landing));
assert.ok(/openLeastTrainedFocus\(\)/.test(landing));
assert.ok(!/id="train-stat-streak"/.test(landing));
assert.ok(!/id="train-stat-since"/.test(landing));

const saveSrc = extractFn(index, 'saveTrainSession');
assert.ok(/energy_type: trainSessionState\.energy_type/.test(saveSrc));
assert.ok(!/training_focus:/.test(saveSrc), 'training_sessions writes energy_type, not training_focus');

const pickSrc = extractFn(index, 'pickHomeTodayAssignment');
assert.ok(/!a\.completed_at/.test(pickSrc));
assert.ok(!/isHomeAssignmentDueSoon/.test(pickSrc));
assert.ok(/pickHomeTodayAssignment\(_trainAssignmentsCache/.test(extractFn(index, 'loadHomeDueList')));

const iconSrc = extractFn(index, 'trainFocusIconSvg');
const focuses = [
  'Boulders', 'Routes', 'Boards', 'Hangboard', 'Strength & Weights',
  'Mobility & Flexibility', 'Technique & Footwork', 'Cardio & Capacity',
  'Mental/Other', 'Warm-Ups'
];
const inners = focuses.map(function(f){
  const m = iconSrc.match(new RegExp("'" + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "': '([^']+)'"));
  assert.ok(m, 'icon for ' + f);
  return m[1];
});
assert.strictEqual(new Set(inners).size, 10, 'each focus has a distinct te-icon path');

const helpers = [
  'var TRAINING_FOCUS_VALUES = ' + JSON.stringify(focuses) + ';',
  extractFn(index, 'isCustomWorkoutStarred'),
  extractFn(index, 'pickTrainStartPinned'),
  extractFn(index, 'homeAssignmentDueDay'),
  extractFn(index, 'homeAssignmentDueKind'),
  extractFn(index, 'homeTodayKickerLabel'),
  extractFn(index, 'pickHomeTodayAssignment'),
  extractFn(index, 'normalizeTrainingFocus'),
  extractFn(index, 'legacyTrainingFocusFromCategory'),
  extractFn(index, 'trainSessionFocus'),
  extractFn(index, 'computeLeastTrainedFocus'),
  extractFn(index, 'athleteWeekBounds'),
  extractFn(index, 'computeTrainWeeklyBars')
].join('\n');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(helpers, ctx);

const now = new Date('2026-08-18T12:00:00');
assert.strictEqual(ctx.homeTodayKickerLabel({ due_date: '2026-08-18' }, now), 'TODAY');
assert.strictEqual(ctx.homeTodayKickerLabel({ due_date: '2026-08-10' }, now), 'OVERDUE');
assert.strictEqual(ctx.homeTodayKickerLabel({ due_date: '2026-08-20' }, now), 'UP NEXT');
assert.strictEqual(ctx.homeTodayKickerLabel({ title: 'No date' }, now), 'UP NEXT');
const incompleteFar = ctx.pickHomeTodayAssignment([
  { id: 'done', completed_at: '2026-08-01', due_date: '2026-08-01' },
  { id: 'far', completed_at: null, due_date: '2026-10-01' }
], now);
assert.strictEqual(incompleteFar && incompleteFar.id, 'far');

const last = { id: 'sess-1', energy_type: 'Hangboard', notes: 'Repeaters' };
const starred = [
  { id: 'a', name: 'A', is_starred: true },
  { id: 'b', name: 'B', is_starred: true },
  { id: 'c', name: 'C', is_starred: true }
];
const withLast = ctx.pickTrainStartPinned(starred, last);
assert.strictEqual(withLast.length, 3);
assert.strictEqual(withLast[0].kind, 'workout');
assert.strictEqual(withLast[2].kind, 'repeat');
const noLast = ctx.pickTrainStartPinned(starred, null);
assert.strictEqual(noLast.length, 3);
assert.ok(noLast.every(function(x){ return x.kind === 'workout'; }));
assert.strictEqual(ctx.pickTrainStartPinned([], null).length, 0);
assert.strictEqual(ctx.pickTrainStartPinned([], last)[0].kind, 'repeat');

assert.ok(/trainRepeatLastSession\(rows\[0\]\.id\)/.test(extractFn(index, 'trainRepeatLastSession'))
  || /trainDuplicateSession\(rows\[0\]\.id\)/.test(extractFn(index, 'trainRepeatLastSession')));
assert.ok(/trainStartDuplicatedSession/.test(extractFn(index, 'trainDuplicateSession')));
assert.ok(/>Repeat</.test(extractFn(index, 'renderTrainSessionList')));
assert.ok(/>Repeat</.test(extractFn(index, 'renderTrainHubRecentMini')));
assert.ok(!/>Duplicate</.test(extractFn(index, 'renderTrainSessionList')));
assert.ok(!/>Duplicate</.test(extractFn(index, 'renderTrainHubRecentMini')));

console.log('train-start-cleanup tests: ok');
