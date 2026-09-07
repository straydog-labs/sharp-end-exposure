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
  return new Date(Date.UTC(y, m - 1, d + plusDays)).toISOString();
}

const end = new Date('2026-09-01T12:00:00Z');
const FROZEN_GRADE_ORDER = [
  'VB',
  'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9',
  'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17',
  '5.5', '5.6', '5.7', '5.8', '5.9',
  '5.10a', '5.10b', '5.10c', '5.10d',
  '5.11a', '5.11b', '5.11c', '5.11d',
  '5.12a', '5.12b', '5.12c', '5.12d',
  '5.13a', '5.13b', '5.13c', '5.13d',
  '5.14a', '5.14b', '5.14c', '5.14d',
  '5.15a', '5.15b', '5.15c', '5.15d',
  '4a', '4b', '4c',
  '5a', '5b', '5c',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+', '8b', '8b+', '8c', '8c+',
  '9a', '9a+', '9b', '9b+', '9c',
  'Mod', 'Diff', 'VDiff', 'HVD', 'Sev', 'HS', 'VS', 'HVS',
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10'
];

assert.deepStrictEqual(CI.GRADE_ORDER, FROZEN_GRADE_ORDER, 'GRADE_ORDER must stay load-bearing and unchanged');
assert.strictEqual(CI.gradeRank('V5'), FROZEN_GRADE_ORDER.indexOf('V5'));
assert.strictEqual(CI.gradeRank('5.11a'), FROZEN_GRADE_ORDER.indexOf('5.11a'));
assert.strictEqual(CI.gradeRank('6a+'), FROZEN_GRADE_ORDER.indexOf('6a+'));
assert.strictEqual(CI.classifyBoulderVsLead, undefined);

assert.strictEqual(CI.classifyGradeFamily('V5'), 'boulder');
assert.strictEqual(CI.classifyGradeFamily('VB'), 'boulder');
assert.strictEqual(CI.classifyGradeFamily('v10'), 'boulder');
assert.strictEqual(CI.classifyGradeFamily('5.11a'), 'roped');
assert.strictEqual(CI.classifyGradeFamily('6a+'), 'roped');
assert.strictEqual(CI.classifyGradeFamily('VS'), 'roped');
assert.strictEqual(CI.classifyGradeFamily('VDiff'), 'roped');
assert.strictEqual(CI.classifyGradeFamily('E3'), 'roped');
assert.strictEqual(CI.classifyGradeFamily('5a'), 'roped');
assert.strictEqual(CI.classifyGradeSystem('V5'), 'v_scale');
assert.strictEqual(CI.classifyGradeSystem('VS'), 'british');
assert.strictEqual(CI.classifyGradeSystem('5.11a'), 'yds');
assert.strictEqual(CI.classifyGradeSystem('6a+'), 'french');
assert.strictEqual(CI.classifyGradeFamily('V4'), 'boulder');
assert.notStrictEqual(CI.classifyGradeFamily('V4'), CI.classifyGradeFamily('5.11a'));
assert.strictEqual(CI.classifyGradeFamily('V5'), 'boulder', 'family comes from the grade string, not discipline');

assert.strictEqual(CI.boulderGradeRank('V5'), CI.BOULDER_GRADE_ORDER.indexOf('V5'));
assert.strictEqual(CI.boulderGradeRank('V5'), 6);
assert.ok(CI.boulderGradeRank('V5') < CI.BOULDER_GRADE_ORDER.length);
assert.strictEqual(CI.ropedGradeRank('5.11a', 'yds'), CI.YDS_GRADE_ORDER.indexOf('5.11a'));
assert.strictEqual(CI.ropedGradeRank('5.11a', 'yds'), 9);
assert.notStrictEqual(CI.boulderGradeRank('V5'), CI.gradeRank('5.11a'));

assert.strictEqual(CI.normalizeRopedDisciplineGroup('Sport'), 'lead');
assert.strictEqual(CI.normalizeRopedDisciplineGroup('Trad'), 'lead');
assert.strictEqual(CI.normalizeRopedDisciplineGroup('Lead'), 'lead');
assert.strictEqual(CI.normalizeRopedDisciplineGroup('Top Rope'), 'top_rope');
assert.strictEqual(CI.normalizeRopedDisciplineGroup('Auto Belay'), 'auto_belay');
assert.strictEqual(CI.normalizeRopedDisciplineGroup('Boulder'), '');
assert.strictEqual(CI.normalizeRopedDisciplineGroup(null), '');
assert.ok(CI.ropedDisciplineMatches(null, 'all'));
assert.ok(CI.ropedDisciplineMatches('Sport', 'all'));
assert.ok(!CI.ropedDisciplineMatches(null, 'lead'));
assert.ok(CI.ropedDisciplineMatches('Trad', 'lead'));

const boulderOnly = [
  { created_at: weekAt('2026-08-31', 1), zone: 'comfort', grade_value: 'V3', climbing_type: 'Slab', discipline: 'Boulder', is_checkin: false },
  { created_at: weekAt('2026-08-31', 2), zone: 'learning', grade_value: 'V5', climbing_type: 'Overhang', discipline: 'Lead', is_checkin: false }
];
const boulderProg = CI.computeProgressSeries(boulderOnly, { weekCount: 4, endDate: end });
assert.ok(boulderProg.hasBoulderGradeTrend);
assert.ok(!boulderProg.hasRopedGradeTrend);
assert.ok(boulderProg.boulderGradeSeries.some((s) => s.terrain === 'Slab'));
assert.strictEqual(boulderProg.ropedGradeSeries.length, 0);
assert.ok(boulderProg.boulderGradeSeries.every((s) =>
  s.points.every((p) => p.rank == null || (p.rank >= 0 && p.rank <= CI.BOULDER_GRADE_ORDER.length - 1))
));

const ropedOnly = [
  { created_at: weekAt('2026-08-31', 1), zone: 'panic', grade_value: '5.12a', climbing_type: 'Overhang', discipline: 'Lead', is_checkin: false },
  { created_at: weekAt('2026-08-31', 2), zone: 'learning', grade_value: '5.11a', climbing_type: 'Vertical', discipline: 'Top Rope', is_checkin: false }
];
const ropedProg = CI.computeProgressSeries(ropedOnly, { weekCount: 4, endDate: end });
assert.ok(ropedProg.hasRopedGradeTrend);
assert.ok(!ropedProg.hasBoulderGradeTrend);
assert.ok(ropedProg.ropedGradeSeries.some((s) => s.terrain === 'Overhang'));
assert.strictEqual(ropedProg.boulderGradeSeries.length, 0);

const mixed = [
  { created_at: weekAt('2026-08-31', 1), zone: 'learning', grade_value: 'V5', climbing_type: 'Overhang', is_checkin: false },
  { created_at: weekAt('2026-08-31', 1), zone: 'panic', grade_value: '5.11a', climbing_type: 'Overhang', is_checkin: false }
];
const mixedProg = CI.computeProgressSeries(mixed, { weekCount: 4, endDate: end });
const bOver = mixedProg.boulderGradeSeries.find((s) => s.terrain === 'Overhang');
const rOver = mixedProg.ropedGradeSeries.find((s) => s.terrain === 'Overhang');
assert.ok(bOver && rOver, 'both families plot the same week/terrain independently');
const lastB = bOver.points[bOver.points.length - 1];
const lastR = rOver.points[rOver.points.length - 1];
const boulderV5 = CI.boulderGradeRank('V5');
const yds511a = CI.ropedGradeRank('5.11a', 'yds');
const oldBlend = (CI.gradeRank('V5') + CI.gradeRank('5.11a')) / 2;
assert.strictEqual(lastB.rank, boulderV5);
assert.strictEqual(lastR.rank, yds511a);
assert.notStrictEqual(lastB.rank, lastR.rank);
assert.notStrictEqual(lastB.rank, oldBlend, 'must not emit the concatenated-list blend');
assert.notStrictEqual(lastR.rank, oldBlend);
assert.ok(lastB.rank >= 0 && lastB.rank <= CI.BOULDER_GRADE_ORDER.length - 1);
assert.ok(lastR.rank >= 0 && lastR.rank <= CI.YDS_GRADE_ORDER.length - 1);
assert.ok(oldBlend > boulderV5 && oldBlend < CI.gradeRank('5.11a'), 'legacy blend is between the two concatenated ranks');

const discRows = [
  { created_at: weekAt('2026-08-31', 1), zone: 'learning', grade_value: '5.11a', climbing_type: 'Vertical', discipline: 'Sport', is_checkin: false },
  { created_at: weekAt('2026-08-31', 1), zone: 'learning', grade_value: '5.10d', climbing_type: 'Vertical', discipline: 'Trad', is_checkin: false },
  { created_at: weekAt('2026-08-31', 1), zone: 'comfort', grade_value: '5.9', climbing_type: 'Slab', discipline: 'Top Rope', is_checkin: false },
  { created_at: weekAt('2026-08-31', 1), zone: 'comfort', grade_value: '5.8', climbing_type: 'Slab', discipline: 'Auto Belay', is_checkin: false },
  { created_at: weekAt('2026-08-31', 1), zone: 'learning', grade_value: '5.7', climbing_type: 'Vertical', is_checkin: false }
];
const allDisc = CI.computeProgressSeries(discRows, { weekCount: 4, endDate: end, ropedDiscipline: 'all' });
const leadDisc = CI.computeProgressSeries(discRows, { weekCount: 4, endDate: end, ropedDiscipline: 'lead' });
const trDisc = CI.computeProgressSeries(discRows, { weekCount: 4, endDate: end, ropedDiscipline: 'top_rope' });
const abDisc = CI.computeProgressSeries(discRows, { weekCount: 4, endDate: end, ropedDiscipline: 'auto_belay' });
assert.ok(allDisc.ropedGradeSeries.some((s) => s.terrain === 'Vertical'));
assert.ok(allDisc.ropedGradeSeries.some((s) => s.terrain === 'Slab'), 'All keeps Top Rope, Auto Belay, and undisciplined');
assert.ok(leadDisc.ropedGradeSeries.some((s) => s.terrain === 'Vertical'));
assert.ok(!leadDisc.ropedGradeSeries.some((s) => s.terrain === 'Slab'), 'Lead filter drops Top Rope / Auto Belay');
assert.ok(trDisc.ropedGradeSeries.some((s) => s.terrain === 'Slab'));
assert.ok(!trDisc.ropedGradeSeries.some((s) => s.terrain === 'Vertical'));
assert.ok(abDisc.ropedGradeSeries.some((s) => s.terrain === 'Slab'));
const leadVert = leadDisc.ropedGradeSeries.find((s) => s.terrain === 'Vertical');
const allVert = allDisc.ropedGradeSeries.find((s) => s.terrain === 'Vertical');
const leadPt = leadVert.points[leadVert.points.length - 1];
const allVertPt = allVert.points[allVert.points.length - 1];
assert.ok(leadPt.grade === '5.11a' || leadPt.grade === '5.10d');
assert.notStrictEqual(leadPt.rank, allVertPt.rank, 'Lead filter must drop the undisciplined 5.7 from the Vertical average');

const mixedSystems = [
  { created_at: weekAt('2026-08-31', 1), zone: 'learning', grade_value: '5.11a', climbing_type: 'Vertical', is_checkin: false },
  { created_at: weekAt('2026-08-31', 2), zone: 'learning', grade_value: '5.12a', climbing_type: 'Overhang', is_checkin: false },
  { created_at: weekAt('2026-08-31', 3), zone: 'panic', grade_value: '6c+', climbing_type: 'Overhang', is_checkin: false },
  { created_at: weekAt('2026-08-17', 1), zone: 'comfort', grade_value: '5.10a', climbing_type: 'Slab', is_checkin: false }
];
const sysProg = CI.computeProgressSeries(mixedSystems, { weekCount: 4, endDate: end });
assert.strictEqual(sysProg.ropedSystem, 'yds');
assert.ok(sysProg.excludedOffSystem >= 1);
assert.ok(sysProg.excludedOffSystemOverall >= 1);
assert.ok(!sysProg.ropedGradeSeries.some((s) =>
  s.points.some((p) => p.grade === '6c+')
), 'French session must not plot on the YDS axis');
assert.ok(sysProg.ropedGradeSeries.some((s) =>
  s.points.some((p) => p.grade === '5.12a' || p.grade === '5.11a')
));

const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');
assert.ok(/Bouldering/.test(dash));
assert.ok(/Roped climbing/.test(dash));
assert.ok(/No bouldering sessions in this window/.test(dash));
assert.ok(/No roped sessions in this window/.test(dash));
assert.ok(/data-roped-filter/.test(dash));
assert.ok(/Auto Belay/.test(dash));
assert.ok(!/Grade by terrain/.test(dash));
assert.ok(!/wes\s*shih|jessica\.somos/i.test(dash));

console.log('coach-grade-families tests: ok');
console.log('mixed-week ranks boulder V5=' + lastB.rank + ' roped 5.11a=' + lastR.rank + ' oldBlend=' + oldBlend);
