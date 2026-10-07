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
assert.ok(/var app_version = 'index287'/.test(index));
assert.ok(/APP_VERSION = 'index287'/.test(sw));
assert.ok(!/id="psyche-landing-col"/.test(dash), 'coach-dashboard untouched');

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

const drill = index.slice(index.indexOf('id="screen-drill"'), index.indexOf('id="screen-psyche-bee"'));
assert.ok(/id="psyche-landing-col"/.test(drill));
assert.ok(/climb-page-col/.test(drill));
assert.ok(!/Check-in, train the mind/.test(drill));
assert.ok(!/te-sub/.test(drill));
assert.ok(drill.indexOf('id="psyche-hub-card-exposure"') < drill.indexOf('id="psyche-card-checkin"'));
assert.ok(drill.indexOf('id="psyche-card-checkin"') < drill.indexOf('id="psyche-row-prepare-climb"'));
assert.ok(drill.indexOf('id="psyche-row-prepare-climb"') < drill.indexOf('id="psyche-pinned-strip"'));
assert.ok(drill.indexOf('id="psyche-hub-recent-mini"') < drill.indexOf('id="psyche-practice-list"'));
assert.ok(drill.indexOf('id="psyche-practice-list"') < drill.indexOf('id="psyche-hub-stats"'));
assert.ok(/onclick="startExposureDrill\(\)"/.test(drill));
assert.ok(/onclick="startPrepare\(\)"/.test(drill));
assert.ok(/onclick="startPrepareClimb\(\)"/.test(drill));
assert.ok(/Bee Humming/.test(drill) && /Cyclic Sighing/.test(drill));
assert.ok(/Progressive Muscle Relaxation/.test(drill));
assert.ok(/Project Visualization/.test(drill));
assert.ok(/Self-Talk Cue/.test(drill));
assert.ok(/id="psyche-stat-last-zone"/.test(drill));
assert.ok(/id="psyche-stat-zone-mix"/.test(drill));
assert.ok(/Practice mix/.test(drill));
assert.ok(!/id="psyche-row-exposure"/.test(drill));
assert.ok(!/id="psyche-stat-total"/.test(drill));
assert.ok(/id="screen-psyche-recent"/.test(index));
assert.ok(/'screen-psyche-recent':'fnav-mental'/.test(index));

const hardest = extractFn(index, 'computeClimbLandingStats');
assert.ok(/sends\.length >= 1/.test(hardest));
assert.ok(/project30\.length < 5/.test(hardest));

const loadSrc = extractFn(index, 'loadPsycheLog');
assert.ok(/sbS\(\s*'sessions'/.test(loadSrc));
assert.ok(/sbS\(\s*'psyche_drills'/.test(loadSrc));
assert.ok(/prepare_type,zone/.test(loadSrc));
assert.ok(/metadata/.test(loadSrc));
assert.ok(!/sbS\(\s*'assignments'/.test(loadSrc));

assert.ok(!/psyche_drills/.test(extractFn(index, 'startPrepare')));
assert.ok(!/psyche_drills/.test(extractFn(index, 'startPrepareClimb')));
assert.ok(!/psyche_drills/.test(extractFn(index, 'startExposureDrill')));

const helpers = [
  extractFn(index, 'isAthleteStreakPsyche'),
  extractFn(index, 'isAthleteStreakPsycheDrill'),
  extractFn(index, 'athleteLocalDayKeyFromDate'),
  extractFn(index, 'athleteLocalDayKeyFromIso'),
  extractFn(index, 'athleteWeekBounds'),
  extractFn(index, 'computeAthleteStreak'),
  extractFn(index, 'collectAthleteStreakDays'),
  extractFn(index, 'psycheDrillLabel'),
  extractFn(index, 'psycheTalkCue'),
  extractFn(index, 'psycheCheckinName'),
  extractFn(index, 'psychePracticeName'),
  extractFn(index, 'collectPsychePractices'),
  extractFn(index, 'pickPsychePinned'),
  extractFn(index, 'psycheZoneLabel'),
  extractFn(index, 'computePsycheHubStats')
].join('\n');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(helpers, ctx);

const now = new Date('2026-09-10T12:00:00');
const few = ctx.computePsycheHubStats([
  { created_at: '2026-09-10T10:00:00', is_checkin: true, zone: 'comfort' },
  { created_at: '2026-09-09T10:00:00', is_checkin: true, zone: 'learning' }
], [], now);
assert.strictEqual(few.streak, '—');
assert.strictEqual(few.week, '—');
assert.strictEqual(few.lastZone, '—');
assert.strictEqual(few.zoneMix, '—');

const manyCheckins = [
  { created_at: '2026-09-10T10:00:00', is_checkin: true, zone: 'panic' },
  { created_at: '2026-09-09T10:00:00', is_checkin: true, zone: 'learning' },
  { created_at: '2026-09-08T10:00:00', is_checkin: true, zone: 'comfort' }
];
const full = ctx.computePsycheHubStats(manyCheckins, [
  { created_at: '2026-09-10T11:00:00', drill_key: 'bee_humming' }
], now);
assert.notStrictEqual(full.streak, '—');
assert.notStrictEqual(full.week, '—');
assert.strictEqual(full.lastZone, 'Panic');
assert.ok(/%/.test(full.zoneMix));

const drills = [
  { created_at: '2026-09-10', drill_key: 'bee_humming' },
  { created_at: '2026-09-09', drill_key: 'self_talk', metadata: { cue: 'Breathe' } },
  { created_at: '2026-09-08', drill_key: 'pmr' }
];
const pinned = ctx.pickPsychePinned(drills);
assert.strictEqual(pinned.length, 2);
assert.strictEqual(pinned[0].kind, 'talk');
assert.strictEqual(ctx.psycheTalkCue(pinned[0].row), 'Breathe');
assert.strictEqual(pinned[1].row.drill_key, 'bee_humming');
assert.strictEqual(ctx.pickPsychePinned([]).length, 0);
assert.strictEqual(ctx.psycheCheckinName({ prepare_type: 'full' }), 'Prepare for a climb');
assert.strictEqual(ctx.psycheCheckinName({}), 'Quick check-in');

const practices = ctx.collectPsychePractices(
  [{ created_at: '2026-09-10T12:00:00', is_checkin: true }],
  [{ created_at: '2026-09-09T12:00:00', drill_key: 'self_talk', metadata: { cue: 'Steady' } }]
);
assert.strictEqual(practices.length, 2);
assert.strictEqual(practices[0].name, 'Quick check-in');
assert.strictEqual(practices[1].name, 'Steady');

console.log('psyche-hub tests: ok');
