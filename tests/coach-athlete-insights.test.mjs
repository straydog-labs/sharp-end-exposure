import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const insightsPath = join(__dirname, '../js/coach-athlete-insights.js');
require(insightsPath);
const CI = globalThis.CoachInsights;

function weekAt(mondayYmd, plusDays) {
  const [y, m, d] = mondayYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + plusDays));
  return dt.toISOString();
}

function fail(msg) {
  throw new Error(msg);
}

// --- classify boulder vs lead from real columns only ---
assert.strictEqual(CI.normalizeTerrainType('overhang'), 'Overhang');
assert.strictEqual(CI.normalizeTerrainType('Arête'), '');
assert.strictEqual(CI.gradeRank('V5'), CI.GRADE_ORDER.indexOf('V5'));
assert.strictEqual(CI.gradeRank('not-a-grade'), null);
assert.strictEqual(CI.classifyBoulderVsLead, undefined);

// --- progress: same axis, any athlete, checkins excluded ---
const end = new Date('2026-09-01T12:00:00Z');
const athleteA = [
  { created_at: weekAt('2026-08-31', 1), zone: 'comfort', grade_value: 'V3', climbing_type: 'Slab', is_checkin: false },
  { created_at: weekAt('2026-08-31', 2), zone: 'learning', grade_value: 'V4', climbing_type: 'Slab', is_checkin: false },
  { created_at: weekAt('2026-08-17', 1), zone: 'comfort', grade_value: 'V2', climbing_type: 'Vertical', is_checkin: false },
  { created_at: weekAt('2026-08-17', 1), zone: 'panic', grade_value: 'V6', climbing_type: 'Overhang', is_checkin: true }
];
const athleteB = [
  { created_at: weekAt('2026-08-31', 1), zone: 'panic', grade_value: '5.12a', climbing_type: 'Overhang', is_checkin: false },
  { created_at: weekAt('2026-08-31', 3), zone: 'panic', grade_value: '5.12b', climbing_type: 'Overhang', is_checkin: false },
  { created_at: weekAt('2026-08-10', 2), zone: 'learning', grade_value: '5.11a', climbing_type: 'Roof', is_checkin: false }
];

const progA = CI.computeProgressSeries(athleteA, { weekCount: 4, endDate: end });
const progB = CI.computeProgressSeries(athleteB, { weekCount: 4, endDate: end });

assert.deepStrictEqual(progA.weeks, progB.weeks, 'shared week axis');
assert.strictEqual(progA.sessionCount, 3, 'checkin excluded');
assert.strictEqual(progB.sessionCount, 3);
assert.ok(progA.hasZoneTrend && progA.hasGradeTrend);
assert.ok(progA.gradeSeries.some((s) => s.terrain === 'Slab'));
assert.ok(!progA.gradeSeries.some((s) => s.terrain === 'Overhang'), 'checkin overhang must not plot');
assert.ok(progB.gradeSeries.some((s) => s.terrain === 'Overhang'));
assert.ok(!progB.gradeSeries.some((s) => s.terrain === 'Slab'));

const lastA = progA.zonePoints[progA.zonePoints.length - 1];
const lastB = progB.zonePoints[progB.zonePoints.length - 1];
assert.ok(lastA.comfort > lastA.panic, 'athlete A comfort-heavy that week');
assert.ok(lastB.panic > lastB.comfort, 'athlete B panic-heavy that week');
assert.notDeepStrictEqual(lastA, lastB, 'two athletes must not share a hardcoded series');

const emptyProg = CI.computeProgressSeries([], { weekCount: 4, endDate: end });
assert.strictEqual(emptyProg.sessionCount, 0);
assert.strictEqual(emptyProg.hasZoneTrend, false);

// --- gap diagnostic: zone mix by terrain only (any athlete, 1–5 terrains) ---
const gapRows = [
  { zone: 'comfort', baseline_zone: 'sent', climbing_type: 'Slab', discipline: 'Boulder', grade_value: 'V4', is_checkin: false },
  { zone: 'comfort', baseline_zone: 'sent', climbing_type: 'Slab', discipline: 'Boulder', grade_value: 'V3', is_checkin: false },
  { zone: 'learning', baseline_zone: 'fell', climbing_type: 'Slab', discipline: 'Boulder', grade_value: 'V5', is_checkin: false },
  { zone: 'panic', baseline_zone: 'fell', climbing_type: 'Overhang', discipline: 'Lead', grade_value: '5.12a', is_checkin: false },
  { zone: 'panic', baseline_zone: 'dna', climbing_type: 'Overhang', discipline: 'Lead', grade_value: '5.12a', is_checkin: false },
  { zone: 'learning', baseline_zone: 'sent', climbing_type: 'Overhang', discipline: 'Sport', grade_value: '5.11d', is_checkin: false },
  { zone: 'comfort', baseline_zone: 'sent', climbing_type: 'Arête', discipline: 'Boulder', grade_value: 'V2', is_checkin: false }
];
const gap = CI.computeGapDiagnostic(gapRows);
assert.strictEqual(gap.boulder, undefined);
assert.strictEqual(gap.lead, undefined);
assert.strictEqual(gap.unclassifiedCount, undefined);
assert.strictEqual(gap.highestComfortShare.terrain, 'Slab');
assert.strictEqual(gap.highestPanicShare.terrain, 'Overhang');
assert.strictEqual(gap.otherTerrainCount, 1);
assert.ok(!gap.terrains.some((t) => t.terrain === 'Arête'));
assert.strictEqual(gap.terrains.length, 2);

const contrastHead = CI.gapHeadlineModel(gap);
assert.strictEqual(contrastHead.contrast, true);
assert.ok(/Most comfortable on Slab/.test(contrastHead.lines[0].text));
assert.ok(/Least comfortable on Overhang/.test(contrastHead.lines[1].text));
assert.ok(!/boulder|lead/i.test(contrastHead.lines.map((l) => l.text).join(' ')));

const oneTerrainGap = CI.computeGapDiagnostic([
  { zone: 'comfort', climbing_type: 'Vertical' },
  { zone: 'learning', climbing_type: 'Vertical' },
  { zone: 'comfort', climbing_type: 'Vertical' }
]);
assert.strictEqual(oneTerrainGap.terrains.length, 1);
const oneHead = CI.gapHeadlineModel(oneTerrainGap);
assert.strictEqual(oneHead.contrast, false);
assert.ok(/Vertical is the only logged terrain/.test(oneHead.lines[0].text));
assert.ok(/No other terrain to compare yet/.test(oneHead.lines[0].text));
assert.ok(!/Most comfortable|Least comfortable/.test(oneHead.lines[0].text));

const samePeakGap = CI.computeGapDiagnostic([
  { zone: 'comfort', climbing_type: 'Overhang' },
  { zone: 'panic', climbing_type: 'Overhang' },
  { zone: 'learning', climbing_type: 'Roof' }
]);
assert.strictEqual(samePeakGap.highestComfortShare.terrain, 'Overhang');
assert.strictEqual(samePeakGap.highestPanicShare.terrain, 'Overhang');
const sameHead = CI.gapHeadlineModel(samePeakGap);
assert.strictEqual(sameHead.contrast, false);
assert.ok(/both peak on Overhang/.test(sameHead.lines[0].text));
assert.ok(!/Most comfortable|Least comfortable/.test(sameHead.lines[0].text));

const fiveTerrainGap = CI.computeGapDiagnostic(
  CI.TERRAIN_TYPES.map((t, i) => ({
    zone: i === 0 ? 'comfort' : (i === 4 ? 'panic' : 'learning'),
    climbing_type: t
  }))
);
assert.strictEqual(fiveTerrainGap.terrains.length, 5);
const fiveHead = CI.gapHeadlineModel(fiveTerrainGap);
assert.strictEqual(fiveHead.contrast, true);
assert.ok(/Most comfortable on Slab/.test(fiveHead.lines[0].text));
assert.ok(/Least comfortable on Crack/.test(fiveHead.lines[1].text));

const emptyGap = CI.computeGapDiagnostic([]);
assert.strictEqual(emptyGap.sessionCount, 0);
assert.strictEqual(emptyGap.highestComfortShare, null);
assert.deepStrictEqual(CI.gapHeadlineModel(emptyGap).lines, []);

// --- CSV authoring (any coach, no gym seed) ---
const parsed = CI.parseGymClimbsCsv(
  '\uFEFFname,wall,angle,steepness,terrain\n' +
  '"Red, overhang",Lane 4,45,steep,Overhang\n' +
  ',,,,Slab\n' +
  'Ok climb,Cave,30,slight,Arete\n' +
  'Crack line,Lane 2,,,Crack\n'
);
assert.strictEqual(parsed.rows.length, 2);
assert.strictEqual(parsed.rows[0].name, 'Red, overhang');
assert.strictEqual(parsed.rows[0].wall_lane, 'Lane 4');
assert.strictEqual(parsed.rows[0].terrain_type, 'Overhang');
assert.strictEqual(parsed.rows[1].terrain_type, 'Crack');
assert.ok(parsed.errors.some((e) => /Name is required/.test(e)));
assert.ok(parsed.errors.some((e) => /Terrain must be/.test(e)));

const badHeader = CI.parseGymClimbsCsv('wall_lane,terrain_type\nLane 1,Slab\n');
assert.strictEqual(badHeader.rows.length, 0);
assert.ok(badHeader.errors[0].includes('name column'));

const okRow = CI.validateGymClimbRow({ name: '  Alpha  ', terrain_type: 'slab', wall_lane: 'L1' });
assert.strictEqual(okRow.ok, true);
assert.strictEqual(okRow.row.name, 'Alpha');
assert.strictEqual(okRow.row.terrain_type, 'Slab');

assert.ok(CI.CSV_TEMPLATE.indexOf('name,wall_lane,angle,steepness,terrain_type') === 0);
assert.ok(!/wes|sender\s*one|movement|earth\s*treks/i.test(CI.CSV_TEMPLATE));

// --- source must stay coach-agnostic ---
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');
const sql = readFileSync(join(__dirname, '../sql/gym-climbs.sql'), 'utf8');
const js = readFileSync(insightsPath, 'utf8');
[dash, sql, js].forEach(function (src, i) {
  if (/wes\s*shih|sender\s*one|hardcoded gym/i.test(src)) {
    fail('hardcoded coach/gym marker in source file ' + i);
  }
});
assert.ok(/gym_climbs\.id/.test(sql), 'id must be documented as FK target');
assert.ok(/created_by/.test(sql));
assert.ok(/gen_random_uuid\(\)/.test(sql));
assert.ok(!/insert into public\.gym_climbs/i.test(sql), 'do not seed gym_climbs');
assert.ok(/athlete-progress-panel/.test(dash));
assert.ok(/athlete-gap-panel/.test(dash));
assert.ok(/open-gym-climbs/.test(dash));
assert.ok(/js\/coach-athlete-insights\.js/.test(dash));
assert.ok(/Comfort vs panic by terrain/.test(dash));
assert.ok(/gapHeadlineModel/.test(dash));
assert.ok(!/Boulder vs lead/.test(dash));
assert.ok(!/classifyBoulderVsLead/.test(dash));
assert.ok(!/unclassifiedCount/.test(dash));
assert.ok(!/gapGroupHtml/.test(dash));
assert.ok(!/classifyBoulderVsLead/.test(js));
assert.ok(!/\bboulder\b/i.test(js));
assert.ok(!/index\.html/.test(js));

console.log('coach-athlete-insights tests: ok');
