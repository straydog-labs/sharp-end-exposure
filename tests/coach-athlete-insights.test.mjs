import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

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
assert.strictEqual(CI.normalizeTerrainType('Arête'), 'Arête');
assert.strictEqual(CI.normalizeTerrainType('Arete'), 'Arête');
assert.strictEqual(CI.normalizeTerrainType('Dihedral'), 'Dihedral');
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

// Local week buckets match a local-time journal, not UTC calendar-day math.
const sundayEve = new Date(2026, 7, 30, 23, 16, 0);
assert.strictEqual(sundayEve.getDay(), 0, 'fixture is a local Sunday');
assert.strictEqual(CI.weekKey(sundayEve), '2026-08-24');
assert.strictEqual(CI.weekKey(new Date(2026, 7, 30, 8, 0, 0)), '2026-08-24');
assert.strictEqual(CI.formatWeekLabel('2026-08-24'), 'Aug 24');
if (sundayEve.getTimezoneOffset() > 0) {
  assert.ok(sundayEve.getUTCDay() !== 0, 'west-of-UTC evening Sunday is already Monday in UTC');
  assert.notStrictEqual(CI.weekKey(sundayEve), '2026-08-31');
}
const boundaryProg = CI.computeProgressSeries(
  [{ zone: 'panic', created_at: sundayEve.toISOString(), is_checkin: false }],
  { weekCount: 3, endDate: new Date(2026, 7, 31, 12, 0, 0) }
);
const boundaryWeek = boundaryProg.zonePoints.find((p) => p.key === '2026-08-24');
assert.ok(boundaryWeek && boundaryWeek.panic === 100, 'Sunday 11pm local stays in the journal week');
assert.ok(!boundaryProg.zonePoints.some((p) => p.key === '2026-08-31' && p.total > 0));

// --- gap diagnostic: zone mix by terrain only (any athlete, 1–7 terrains) ---
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
assert.strictEqual(gap.highestComfortShare.terrain, 'Arête');
assert.strictEqual(gap.highestPanicShare.terrain, 'Overhang');
assert.strictEqual(gap.otherTerrainCount, 0);
assert.ok(gap.terrains.some((t) => t.terrain === 'Arête'));
assert.strictEqual(gap.terrains.length, 3);

const contrastHead = CI.gapHeadlineModel(gap);
assert.strictEqual(contrastHead.contrast, true);
assert.ok(/Most comfortable on Arête/.test(contrastHead.lines[0].text));
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

const fiveOnly = ['Slab', 'Vertical', 'Overhang', 'Roof', 'Crack'];
const fiveTerrainGap = CI.computeGapDiagnostic(
  fiveOnly.map((t, i) => ({
    zone: i === 0 ? 'comfort' : (i === 4 ? 'panic' : 'learning'),
    climbing_type: t
  }))
);
assert.strictEqual(fiveTerrainGap.terrains.length, 5);
const fiveHead = CI.gapHeadlineModel(fiveTerrainGap);
assert.strictEqual(fiveHead.contrast, true);
assert.ok(/Most comfortable on Slab/.test(fiveHead.lines[0].text));
assert.ok(/Least comfortable on Crack/.test(fiveHead.lines[1].text));

const catalogGap = CI.computeGapDiagnostic(
  CI.TERRAIN_TYPES.map((t, i) => ({
    zone: i === 0 ? 'comfort' : (i === CI.TERRAIN_TYPES.length - 1 ? 'panic' : 'learning'),
    climbing_type: t
  }))
);
assert.strictEqual(catalogGap.terrains.length, 7);
const catalogHead = CI.gapHeadlineModel(catalogGap);
assert.strictEqual(catalogHead.contrast, true);
assert.ok(/Most comfortable on Slab/.test(catalogHead.lines[0].text));
assert.ok(/Least comfortable on Crack/.test(catalogHead.lines[1].text));

const emptyGap = CI.computeGapDiagnostic([]);
assert.strictEqual(emptyGap.sessionCount, 0);
assert.strictEqual(emptyGap.highestComfortShare, null);
assert.deepStrictEqual(CI.gapHeadlineModel(emptyGap).lines, []);

function zoneRow(terrain, zone, n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({ zone: zone, climbing_type: terrain, is_checkin: false, baseline_zone: 'sent' });
  }
  return rows;
}
const panicZeroGap = CI.computeGapDiagnostic([].concat(
  zoneRow('Vertical', 'comfort', 9),
  zoneRow('Vertical', 'learning', 1),
  zoneRow('Roof', 'learning', 4),
  zoneRow('Roof', 'comfort', 1),
  zoneRow('Slab', 'comfort', 2)
));
assert.ok(panicZeroGap.terrains.every((t) => t.summary.percents.panic === 0));
const panicZeroHead = CI.gapHeadlineModel(panicZeroGap);
assert.ok(/Most comfort: Vertical \(90%\)/.test(panicZeroHead.lines[0].text));
assert.ok(/Most learning: Roof \(80%\)/.test(panicZeroHead.lines[0].text));
assert.ok(/Descriptive only/.test(panicZeroHead.lines[0].text));
assert.ok(!/no comfort-zone vs panic-zone split/.test(panicZeroHead.lines[0].text));
assert.ok(!/\b(because|caused|due to|suggests|indicates)\b/i.test(panicZeroHead.lines[0].text));

const panicZeroThin = CI.gapHeadlineModel(CI.computeGapDiagnostic([].concat(
  zoneRow('Vertical', 'comfort', 2),
  zoneRow('Roof', 'learning', 2)
)));
assert.ok(/No terrain has 5\+ sessions/.test(panicZeroThin.lines[0].text));
assert.ok(/Descriptive only/.test(panicZeroThin.lines[0].text));

// --- CSV authoring (any coach, no gym seed) ---
const parsed = CI.parseGymClimbsCsv(
  '\uFEFFname,wall,angle,steepness,terrain\n' +
  '"Red, overhang",Lane 4,45,steep,Overhang\n' +
  ',,,,Slab\n' +
  'Ok climb,Cave,30,slight,Arete\n' +
  'Prow line,Lane 3,,,Prow\n' +
  'Crack line,Lane 2,,,Crack\n'
);
assert.strictEqual(parsed.rows.length, 3);
assert.strictEqual(parsed.rows[0].name, 'Red, overhang');
assert.strictEqual(parsed.rows[0].wall_lane, 'Lane 4');
assert.strictEqual(parsed.rows[0].terrain_type, 'Overhang');
assert.strictEqual(parsed.rows[1].terrain_type, 'Arête');
assert.strictEqual(parsed.rows[2].terrain_type, 'Crack');
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
assert.ok(/athlete-training-volume-panel/.test(dash));
assert.ok(/athlete-psyche-volume-panel/.test(dash));
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
assert.ok(!/index\.html/.test(js));

const CAUSAL = /\b(because|caused|due to)\b/i;
const VOLUME_BAD_COLOR = /#e84444|#f5a623|#7ec87a|var\(--panic\)|var\(--learning\)|var\(--comfort\)/;

function extractFn(src, name, nextName){
  const start = src.indexOf('function ' + name + '(');
  const end = nextName ? src.indexOf('function ' + nextName + '(', start + 1) : src.length;
  assert.ok(start >= 0 && end > start, 'extract ' + name);
  return src.slice(start, end);
}

// --- terrain volume bars: included rows, sorted, zeros not logged ---
const volEnd = new Date('2026-10-16T12:00:00Z');
const dominantVol = [
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Vertical', is_checkin: false, baseline_zone: 'sent' },
  { created_at: '2026-10-09T12:00:00Z', climbing_type: 'Vertical', is_checkin: false, baseline_zone: 'sent' },
  { created_at: '2026-10-08T12:00:00Z', climbing_type: 'Vertical', is_checkin: false, baseline_zone: 'fell' },
  { created_at: '2026-10-07T12:00:00Z', climbing_type: 'Overhang', is_checkin: false, baseline_zone: 'sent' },
  { created_at: '2026-10-06T12:00:00Z', climbing_type: 'Slab', is_checkin: true, baseline_zone: 'sent' },
  { created_at: '2026-10-05T12:00:00Z', climbing_type: 'Roof', is_checkin: false, baseline_zone: 'fall_practice' },
  { created_at: '2026-10-04T12:00:00Z', climbing_type: 'Crack', is_checkin: false, deleted_at: '2026-10-04T13:00:00Z' }
];
const volDom = CI.computeTerrainVolume(dominantVol, { days: 90, endDate: volEnd });
assert.strictEqual(volDom.mode, 'bars');
assert.strictEqual(volDom.unit, 'Attempts logged');
assert.strictEqual(volDom.total, 5);
assert.strictEqual(volDom.sorted[0].terrain, 'Vertical');
assert.strictEqual(volDom.sorted[0].count, 3);
assert.strictEqual(volDom.counts.Roof, 1, 'fall_practice counts in volume');
assert.ok(volDom.sorted.every((row, i, arr) => i === 0 || arr[i - 1].count >= row.count));
assert.strictEqual(volDom.sorted.reduce((n, row) => n + row.count, 0), volDom.total);
assert.ok(!volDom.sorted.some((row) => row.count === 0));
assert.ok(!volDom.notLogged.includes('Roof'), 'fall_practice Roof is logged');
assert.ok(volDom.notLogged.includes('Crack'));
assert.ok(!volDom.notLogged.includes('Vertical'));
assert.ok(/function computeTerrainRadar/.test(js));
assert.ok(!/Math\.max\(0\.06/.test(js));

const volEmpty = CI.computeTerrainVolume([], { days: 90, endDate: volEnd });
assert.strictEqual(volEmpty.mode, 'empty');
assert.deepStrictEqual(volEmpty.notLogged, CI.TERRAIN_TYPES);

// --- hardest send y-metric, filled/hollow, connectors ---
const gradeEnd = new Date('2026-10-12T12:00:00Z');
const sendVsFall = [
  { created_at: weekAt('2026-10-12', 1), zone: 'learning', grade_value: 'V5', climbing_type: 'Vertical', baseline_zone: 'sent', is_checkin: false },
  { created_at: weekAt('2026-10-12', 2), zone: 'panic', grade_value: 'V7', climbing_type: 'Vertical', baseline_zone: 'fell', is_checkin: false },
  { created_at: weekAt('2026-09-28', 1), zone: 'learning', grade_value: 'V6', climbing_type: 'Vertical', baseline_zone: 'fell', is_checkin: false }
];
const sendProg = CI.computeProgressSeries(sendVsFall, { weekCount: 6, endDate: gradeEnd });
const vert = sendProg.boulderGradeSeries.find((s) => s.terrain === 'Vertical');
assert.ok(vert);
const lastSend = vert.points[vert.points.length - 1];
assert.strictEqual(lastSend.grade, 'V5', 'y is hardest send, not the harder fall');
assert.strictEqual(lastSend.sent, true);
const fallOnly = vert.points.find((p) => p.key === '2026-09-28');
assert.ok(fallOnly && fallOnly.grade === 'V6' && fallOnly.sent === false, 'hollow week uses hardest attempt');

const onePointRows = [
  { created_at: weekAt('2026-10-12', 1), zone: 'comfort', grade_value: 'V3', climbing_type: 'Roof', baseline_zone: 'sent', is_checkin: false }
];
const oneProg = CI.computeProgressSeries(onePointRows, { weekCount: 6, endDate: gradeEnd });
const roof1 = oneProg.boulderGradeSeries.find((s) => s.terrain === 'Roof');
assert.strictEqual(roof1.plotted, 1);
assert.deepStrictEqual(CI.gradeConnectors(roof1.points), []);

const twoPointRows = [
  { created_at: weekAt('2026-10-05', 1), zone: 'comfort', grade_value: 'V2', climbing_type: 'Roof', baseline_zone: 'sent', is_checkin: false },
  { created_at: weekAt('2026-10-12', 1), zone: 'comfort', grade_value: 'V3', climbing_type: 'Roof', baseline_zone: 'sent', is_checkin: false }
];
const twoProg = CI.computeProgressSeries(twoPointRows, { weekCount: 6, endDate: gradeEnd });
const roof2 = twoProg.boulderGradeSeries.find((s) => s.terrain === 'Roof');
assert.strictEqual(roof2.plotted, 2);
const twoConn = CI.gradeConnectors(roof2.points);
assert.strictEqual(twoConn.length, 1);
assert.strictEqual(twoConn[0].style, 'solid');

const gapRows3 = [
  { created_at: weekAt('2026-09-14', 1), zone: 'learning', grade_value: 'V4', climbing_type: 'Dihedral', baseline_zone: 'sent', is_checkin: false },
  { created_at: weekAt('2026-10-12', 1), zone: 'learning', grade_value: 'V5', climbing_type: 'Dihedral', baseline_zone: 'sent', is_checkin: false }
];
const gapProg = CI.computeProgressSeries(gapRows3, { weekCount: 8, endDate: gradeEnd });
const dih = gapProg.boulderGradeSeries.find((s) => s.terrain === 'Dihedral');
const gapConn = CI.gradeConnectors(dih.points);
assert.strictEqual(gapConn.length, 1);
assert.strictEqual(gapConn[0].style, 'dashed', '3 empty weeks use a dashed connector');

const svgCtx = {
  escapeHtml: function(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};
vm.createContext(svgCtx);
vm.runInContext(
  extractFn(dash, 'insightSvgPolyline', 'insightSvgDots') +
  extractFn(dash, 'insightSvgDots', 'renderSharedAxisSvg') +
  extractFn(dash, 'renderSharedAxisSvg', 'insightChartTitleWithHelp'),
  svgCtx
);
const dashedSvg = vm.runInContext(
  'renderSharedAxisSvg([' + JSON.stringify({
    color: '#ccc',
    xs: ['Sep 14', 'Sep 21', 'Sep 28', 'Oct 5', 'Oct 12'],
    values: [4, null, null, null, 5],
    fills: [true, false, false, false, false],
    dashedGaps: true
  }) + '], 0, 6, [{value:0,label:"0"},{value:6,label:"6"}], 720, 176)',
  svgCtx
);
assert.ok(/stroke-dasharray="4 4"/.test(dashedSvg), 'dashed connector across a 3-week gap');
assert.ok(/fill="none"/.test(dashedSvg), 'hollow attempt-only dot');
assert.ok(/class="insight-x-tick"[^>]*data-x-index="4"[^>]*text-anchor="end"/.test(dashedSvg));
const lastTick = dashedSvg.match(/class="insight-x-tick"[^>]*data-x-index="4"[^>]*x="([^"]+)"/);
assert.ok(lastTick);
assert.ok(Number(lastTick[1]) <= 720, 'last x label stays inside the viewBox');
assert.ok(!/trend/i.test(dashedSvg));

const solidSvg = vm.runInContext(
  'renderSharedAxisSvg([' + JSON.stringify({
    color: '#ccc',
    xs: ['Oct 5', 'Oct 12'],
    values: [2, 3],
    fills: [true, true],
    dashedGaps: true
  }) + '], 0, 6, [{value:0,label:"0"},{value:6,label:"6"}], 720, 176)',
  svgCtx
);
assert.ok(!/stroke-dasharray/.test(solidSvg), 'consecutive weeks stay solid');
assert.ok(!/<circle[^>]*fill="none"/.test(solidSvg), 'send weeks are filled');
assert.ok(/<circle[^>]*fill="#ccc"/.test(solidSvg));

// --- coach read: minimums, no causal wording ---
const readShort = CI.computeCoachRead([
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Vertical', grade_value: 'V3', baseline_zone: 'sent', is_checkin: false },
  { created_at: '2026-10-09T12:00:00Z', climbing_type: 'Vertical', grade_value: 'V2', baseline_zone: 'sent', is_checkin: false }
], { days: 90, endDate: volEnd });
assert.deepStrictEqual(readShort.lines, ['Not enough data yet']);

const readRows = [];
for (let i = 0; i < 8; i++) {
  readRows.push({
    created_at: new Date(volEnd.getTime() - i * 86400000).toISOString(),
    climbing_type: i < 6 ? 'Vertical' : 'Overhang',
    grade_value: i === 0 ? 'V5' : 'V4',
    baseline_zone: i % 3 === 0 ? 'fell' : 'sent',
    zone: i % 3 === 0 ? 'panic' : 'learning',
    is_checkin: false
  });
}
const readFull = CI.computeCoachRead(readRows, { days: 90, endDate: volEnd });
assert.ok(readFull.enough);
assert.ok(readFull.lines.length >= 1 && readFull.lines.length <= 3);
assert.ok(/% of logged attempts are Vertical/.test(readFull.lines[0]));
assert.ok(/not logged yet:/i.test(readFull.lines[0]));
readFull.lines.forEach(function (line) {
  assert.ok(!CAUSAL.test(line), 'causal wording: ' + line);
  assert.ok(!/trend/i.test(line));
});
const fewAttempts = CI.computeCoachRead([
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Slab', grade_value: 'V2', baseline_zone: 'sent', is_checkin: false },
  { created_at: '2026-10-09T12:00:00Z', climbing_type: 'Slab', grade_value: 'V3', baseline_zone: 'sent', is_checkin: false },
  { created_at: '2026-10-08T12:00:00Z', climbing_type: 'Vertical', grade_value: 'V4', baseline_zone: 'fell', is_checkin: false }
], { days: 90, endDate: volEnd });
assert.ok(!fewAttempts.lines.some((line) => /falls per 10/i.test(line)), 'omit falls under 5 attempts');

const oneFallRows = [];
for (let i = 0; i < 6; i++) {
  oneFallRows.push({
    created_at: new Date(volEnd.getTime() - i * 86400000).toISOString(),
    climbing_type: 'Vertical',
    grade_value: 'V3',
    baseline_zone: i === 0 ? 'fell' : 'sent',
    zone: i === 0 ? 'learning' : 'comfort',
    is_checkin: false
  });
}
const oneFallRead = CI.computeCoachRead(oneFallRows, { days: 90, endDate: volEnd });
assert.ok(!oneFallRead.lines.some((line) => /falls per 10/i.test(line)), 'omit falls line at 1 fall');
const oneFallBoard = CI.computeTerrainScoreboard(oneFallRows, { days: 90, endDate: volEnd });
assert.ok(oneFallBoard.rows.find((r) => r.terrain === 'Vertical').fallsPerTen != null, 'table keeps the falls number');

const threeFallRows = [];
for (let i = 0; i < 6; i++) {
  threeFallRows.push({
    created_at: new Date(volEnd.getTime() - i * 86400000).toISOString(),
    climbing_type: 'Vertical',
    grade_value: 'V3',
    baseline_zone: i < 3 ? 'fell' : 'sent',
    zone: i < 3 ? 'learning' : 'comfort',
    is_checkin: false
  });
}
const threeFallRead = CI.computeCoachRead(threeFallRows, { days: 90, endDate: volEnd });
assert.ok(threeFallRead.lines.some((line) => /Vertical has the highest falls per 10 attempts/i.test(line)),
  'show falls line at 3+ falls');

assert.ok(/Athlete snapshot/.test(dash));
assert.ok(/Print \/ Share/.test(dash));
assert.ok(/@media print/.test(dash));
assert.ok(/athlete-share-print-name/.test(dash));
assert.ok(/athlete-share-print-date/.test(dash));
assert.ok(/Descriptive — not a cause-and-effect read/.test(dash));
assert.ok(/background:var\(--accent\)/.test(dash));
assert.ok(!VOLUME_BAD_COLOR.test((dash.match(/\.terrain-volume-bar-fill\{[^}]+\}/) || [''])[0]));
assert.ok(/data-terrain-volume="radar"/.test(dash));
assert.ok(/terrain-volume-radar/.test(dash));
assert.ok(/svg\.terrain-volume-radar/.test(dash));
assert.ok(/Not logged yet:/.test(dash));
assert.ok(/Filled = send · hollow = attempt only · dashed = weeks without a log/.test(dash));

const boardFew = CI.computeTerrainScoreboard([
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Slab', grade_value: 'V2', baseline_zone: 'sent', zone: 'comfort', is_checkin: false },
  { created_at: '2026-10-09T12:00:00Z', climbing_type: 'Slab', grade_value: 'V3', baseline_zone: 'fell', zone: 'learning', is_checkin: false },
  { created_at: '2026-10-08T12:00:00Z', climbing_type: 'Vertical', grade_value: 'V4', baseline_zone: 'sent', zone: 'learning', is_checkin: false }
], { days: 90, endDate: volEnd });
assert.strictEqual(boardFew.rows.find((r) => r.terrain === 'Slab').fallsPerTen, null);
assert.strictEqual(boardFew.rows.find((r) => r.terrain === 'Slab').zones, null);
assert.strictEqual(boardFew.rows.find((r) => r.terrain === 'Slab').trend, null);
assert.ok(boardFew.notLogged.includes('Roof'));

const boardEnough = [];
for (let i = 0; i < 6; i++) {
  boardEnough.push({
    created_at: new Date(volEnd.getTime() - i * 86400000).toISOString(),
    climbing_type: 'Overhang',
    grade_value: 'V4',
    baseline_zone: i < 2 ? 'fell' : 'sent',
    zone: i < 2 ? 'panic' : 'learning',
    is_checkin: false
  });
}
const boardOk = CI.computeTerrainScoreboard(boardEnough, { days: 90, endDate: volEnd });
assert.ok(boardOk.rows[0].fallsPerTen != null);
assert.ok(boardOk.rows[0].zones);
assert.ok(boardOk.rows[0].trend);

const hiEmpty = CI.computeHighlights([], { days: 90, endDate: volEnd });
assert.strictEqual(hiEmpty.hardestSend, null);
assert.strictEqual(hiEmpty.mostClimbed, null);
assert.strictEqual(hiEmpty.mostActiveWeek, null);

const hiFull = CI.computeHighlights(readRows, { days: 90, endDate: volEnd });
assert.ok(hiFull.hardestSend && hiFull.hardestSend.grade);
assert.ok(hiFull.mostClimbed && hiFull.mostClimbed.terrain);
assert.ok(hiFull.mostActiveWeek && hiFull.mostActiveWeek.sessions >= 1);

const roofSendAt = '2026-10-11T16:00:00Z';
const hiRoof = CI.computeHighlights([
  { created_at: roofSendAt, climbing_type: 'Roof', grade_value: 'V6', baseline_zone: 'sent', is_checkin: false }
], { days: 90, endDate: volEnd });
assert.strictEqual(hiRoof.hardestSend.date, 'Oct 11', 'hardest-send card uses the real send date');
assert.strictEqual(CI.formatWeekLabel(CI.weekKey(new Date(roofSendAt))), 'Oct 5');
assert.notStrictEqual(hiRoof.hardestSend.date, 'Oct 5');

assert.ok(/athlete-terrain-scoreboard/.test(dash));
assert.ok(/athlete-highlights/.test(dash));
assert.ok(/scoreboard-falls/.test(dash));
assert.ok(!VOLUME_BAD_COLOR.test((dash.match(/\.scoreboard-falls\{[^}]+\}/) || [''])[0]));

// --- X1 unit: nested attempts count 1; labels say Attempts logged ---
const nested = [{
  created_at: '2026-10-10T12:00:00Z',
  climbing_type: 'Vertical',
  baseline_zone: 'sent',
  is_checkin: false,
  attempts: [
    { created_at: '2026-10-10T12:01:00Z', climbing_type: 'Vertical', baseline_zone: 'fell', is_checkin: false },
    { created_at: '2026-10-10T12:02:00Z', climbing_type: 'Overhang', baseline_zone: 'sent', is_checkin: false }
  ]
}];
const volNested = CI.computeTerrainVolume(nested, { days: 90, endDate: volEnd });
assert.strictEqual(volNested.total, 3, 'parent row + nested attempts each count 1');
assert.strictEqual(volNested.counts.Vertical, 2);
assert.strictEqual(volNested.counts.Overhang, 1);
assert.strictEqual(volNested.unit, 'Attempts logged');
assert.ok(/Attempts logged/.test(dash));
assert.ok(/Most-attempted terrain/.test(dash));
assert.ok(/data-label="Attempts"/.test(dash));
assert.ok(!/Climbs logged/.test(dash));
assert.ok(!/% of logged climbs are/.test(js));

// --- DNA counts in volume; still excluded from grade chart and send-rate denom ---
const dnaMix = [
  { created_at: weekAt('2026-10-12', 1), climbing_type: 'Vertical', grade_value: 'V4', baseline_zone: 'fell', zone: 'learning', is_checkin: false },
  { created_at: weekAt('2026-10-12', 1), climbing_type: 'Vertical', grade_value: 'V9', baseline_zone: 'dna', zone: 'panic', is_checkin: false },
  { created_at: weekAt('2026-10-05', 1), climbing_type: 'Vertical', grade_value: 'V3', baseline_zone: 'sent', zone: 'comfort', is_checkin: false }
];
const volDna = CI.computeTerrainVolume(dnaMix, { days: 90, endDate: volEnd });
assert.strictEqual(volDna.counts.Vertical, 3, 'volDna: DNA now counts as a logged climb row');
const dnaProg = CI.computeProgressSeries(dnaMix, { weekCount: 4, endDate: gradeEnd });
const dnaVert = dnaProg.boulderGradeSeries.find((s) => s.terrain === 'Vertical');
const dnaWeek = dnaVert.points[dnaVert.points.length - 1];
assert.notStrictEqual(dnaWeek.grade, 'V9', 'dnaWeek: DNA stays excluded from hardest-attempt grade');
assert.strictEqual(dnaWeek.grade, 'V4');
assert.strictEqual(dnaWeek.sent, false);
const dnaOnly = CI.computeProgressSeries([
  { created_at: weekAt('2026-10-12', 1), climbing_type: 'Slab', grade_value: 'V8', baseline_zone: 'dna', zone: 'panic', is_checkin: false }
], { weekCount: 4, endDate: gradeEnd });
assert.ok(!dnaOnly.boulderGradeSeries.some((s) => s.terrain === 'Slab'), 'DNA-only week plots no hollow dot');
const dnaFalls = [];
for (let i = 0; i < 5; i++) {
  dnaFalls.push({
    created_at: new Date(volEnd.getTime() - i * 86400000).toISOString(),
    climbing_type: 'Roof',
    grade_value: 'V2',
    baseline_zone: i === 0 ? 'fell' : 'sent',
    zone: 'learning',
    is_checkin: false
  });
}
dnaFalls.push({
  created_at: '2026-10-10T12:00:00Z', climbing_type: 'Roof', grade_value: 'V2',
  baseline_zone: 'dna', zone: 'panic', is_checkin: false
});
const dnaBoard = CI.computeTerrainScoreboard(dnaFalls, { days: 90, endDate: volEnd });
const roofBoard = dnaBoard.rows.find((r) => r.terrain === 'Roof');
assert.strictEqual(roofBoard.attempts, 6, 'roofBoard.attempts: Attempts column uses volume (DNA counts)');
assert.strictEqual(roofBoard.fallAttempts, 5, 'roofBoard.fallAttempts: send-rate denom still excludes DNA');
assert.strictEqual(roofBoard.fallsPerTen, 2, 'falls per 10 = 1 fell / 5 send-rate attempts * 10');

// --- X3 baseline rows can carry terrain/grade; exclude like the athlete app ---
const baselineRow = {
  created_at: '2026-10-10T12:00:00Z',
  climbing_type: 'Vertical',
  grade_value: 'V7',
  baseline_zone: 'sent',
  zone: 'comfort',
  is_checkin: false,
  is_baseline: true
};
const liveRow = {
  created_at: '2026-10-09T12:00:00Z',
  climbing_type: 'Slab',
  grade_value: 'V2',
  baseline_zone: 'sent',
  zone: 'learning',
  is_checkin: false,
  is_baseline: false
};
const volBase = CI.computeTerrainVolume([baselineRow, liveRow], { days: 90, endDate: volEnd });
assert.strictEqual(volBase.counts.Vertical, 0, 'baseline with terrain must not enter volume');
assert.strictEqual(volBase.counts.Slab, 1);
const progBase = CI.computeProgressSeries([baselineRow, liveRow], { weekCount: 4, endDate: volEnd });
assert.ok(!progBase.boulderGradeSeries.some((s) => s.terrain === 'Vertical'));
assert.ok(progBase.boulderGradeSeries.some((s) => s.terrain === 'Slab'));
const boardBase = CI.computeTerrainScoreboard([baselineRow, liveRow], { days: 90, endDate: volEnd });
assert.ok(!boardBase.rows.some((r) => r.terrain === 'Vertical'));
const hiBase = CI.computeHighlights([baselineRow], { days: 90, endDate: volEnd });
assert.strictEqual(hiBase.hardestSend, null);
assert.strictEqual(hiBase.mostClimbed, null);

// --- X4 largest-remainder shares always sum to 100 ---
const split3 = [
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Slab', is_checkin: false, baseline_zone: 'sent' },
  { created_at: '2026-10-09T12:00:00Z', climbing_type: 'Vertical', is_checkin: false, baseline_zone: 'sent' },
  { created_at: '2026-10-08T12:00:00Z', climbing_type: 'Overhang', is_checkin: false, baseline_zone: 'sent' }
];
const vol3 = CI.computeTerrainVolume(split3, { days: 90, endDate: volEnd });
const shareSum = vol3.sorted.reduce((n, row) => n + row.share, 0);
assert.strictEqual(shareSum, 100, 'largest-remainder shares must sum to 100');
assert.deepStrictEqual(vol3.sorted.map((row) => row.share).sort((a, b) => b - a), [34, 33, 33]);
const lr = CI.largestRemainderShares([{ key: 'a', count: 1 }, { key: 'b', count: 1 }, { key: 'c', count: 1 }]);
assert.strictEqual(lr.a + lr.b + lr.c, 100);

const zoneMix111 = CI.zonePercents({ comfort: 1, learning: 1, panic: 1 });
assert.strictEqual(zoneMix111.comfort + zoneMix111.learning + zoneMix111.panic, 100, 'zone-mix 1/1/1 sums to 100');
assert.strictEqual(zoneMix111.total, 3);

const radarCounts = {
  Slab: 0, Vertical: 8, Overhang: 4, Roof: 2, 'Arête': 0, Dihedral: 0, Crack: 1
};
const radar = CI.computeTerrainRadar(radarCounts, { cx: 0, cy: 0, maxR: 100 });
assert.deepStrictEqual(radar.axes.map((a) => a.terrain), CI.TERRAIN_TYPES);
assert.strictEqual(radar.scale, 8);
const slabAxis = radar.axes.find((a) => a.terrain === 'Slab');
assert.strictEqual(slabAxis.r, 0, 'radar: value 0 → radius 0');
assert.strictEqual(slabAxis.x, 0);
assert.strictEqual(slabAxis.y, 0);
const vertAxis = radar.axes.find((a) => a.terrain === 'Vertical');
assert.ok(Math.abs(vertAxis.r - 100) < 1e-9, 'radar: max value → outer ring');
const midAxis = radar.axes.find((a) => a.terrain === 'Overhang');
assert.ok(Math.abs(midAxis.r - 50) < 1e-9, 'radar: linear midpoint');
assert.strictEqual(radar.rings.length, 4);
assert.deepStrictEqual(radar.rings.map((r) => r.frac), [0.25, 0.5, 0.75, 1]);
assert.deepStrictEqual(radar.rings.map((r) => r.valueLabel), ['2', '4', '6', '8']);

[1, 2, 3, 7, 28].forEach(function (maxVal) {
  const counts = { Slab: maxVal, Vertical: 0, Overhang: 0, Roof: 0, 'Arête': 0, Dihedral: 0, Crack: 0 };
  const r = CI.computeTerrainRadar(counts);
  assert.ok(r.rings.every((ring) => Number.isInteger(ring.value)), 'ring values integer at max=' + maxVal);
  assert.ok(r.rings.every((ring) => /^\d+$/.test(ring.valueLabel)), 'ring labels integer at max=' + maxVal);
  assert.strictEqual(r.scale % 4, 0, 'scale is a multiple of 4 at max=' + maxVal);
  assert.ok(r.scale >= 4);
});
assert.strictEqual(CI.niceRadarScale(1), 4);
assert.strictEqual(CI.niceRadarScale(2), 4);
assert.strictEqual(CI.niceRadarScale(3), 4);
assert.strictEqual(CI.niceRadarScale(7), 8);
assert.strictEqual(CI.niceRadarScale(28), 28);

const countRule = [
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Slab', is_checkin: false, baseline_zone: 'sent' },
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Vertical', is_checkin: false, baseline_zone: 'dna' },
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Overhang', is_checkin: false, is_baseline: true, baseline_zone: 'sent' },
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Roof', is_checkin: false, baseline_zone: 'fall_practice' },
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Arête', is_checkin: false, baseline_zone: null },
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Dihedral', is_checkin: false, deleted_at: '2026-10-10T13:00:00Z', baseline_zone: 'sent' },
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Crack', is_checkin: true, baseline_zone: 'checkin' },
  { created_at: '2026-10-10T12:00:00Z', climbing_type: '', is_checkin: false, baseline_zone: 'took' }
];
const volRule = CI.computeTerrainVolume(countRule, { days: 90, endDate: volEnd });
assert.strictEqual(volRule.counts.Slab, 1);
assert.strictEqual(volRule.counts.Vertical, 1, 'dna counted');
assert.strictEqual(volRule.counts.Overhang, 0, 'baseline not counted');
assert.strictEqual(volRule.counts.Roof, 1, 'fall_practice counted');
assert.strictEqual(volRule.counts['Arête'], 1, 'null result counted');
assert.strictEqual(volRule.counts.Dihedral, 0, 'deleted not counted');
assert.strictEqual(volRule.counts.Crack, 0, 'check-in not counted');
assert.strictEqual(volRule.untagged, 1, 'unknown-terrain note N');
assert.strictEqual(CI.computeTerrainVolume(countRule.filter((r) => r.climbing_type), { days: 90, endDate: volEnd }).untagged, 0);

const agree = [
  { created_at: '2026-10-10T12:00:00Z', climbing_type: 'Vertical', is_checkin: false, baseline_zone: 'sent', zone: 'learning' },
  { created_at: '2026-10-09T12:00:00Z', climbing_type: 'Vertical', is_checkin: false, baseline_zone: 'dna', zone: 'panic' },
  { created_at: '2026-10-08T12:00:00Z', climbing_type: 'Vertical', is_checkin: false, baseline_zone: 'fall_practice', zone: 'learning' },
  { created_at: '2026-10-07T12:00:00Z', climbing_type: 'Overhang', is_checkin: false, baseline_zone: 'fell', zone: 'learning' }
];
const volAgree = CI.computeTerrainVolume(agree, { days: 90, endDate: volEnd });
const boardAgree = CI.computeTerrainScoreboard(agree, { days: 90, endDate: volEnd });
const hiAgree = CI.computeHighlights(agree, { days: 90, endDate: volEnd });
const radarAgree = CI.computeTerrainRadar(volAgree.counts);
assert.strictEqual(volAgree.total, 4);
assert.strictEqual(volAgree.counts.Vertical, 3);
assert.strictEqual(boardAgree.rows.find((r) => r.terrain === 'Vertical').attempts, 3);
assert.strictEqual(boardAgree.total, volAgree.total);
assert.strictEqual(hiAgree.mostClimbed.terrain, 'Vertical');
assert.strictEqual(hiAgree.mostClimbed.share, volAgree.sorted[0].share);
assert.strictEqual(radarAgree.axes.find((a) => a.terrain === 'Vertical').count, 3);
assert.strictEqual(radarAgree.axes.find((a) => a.terrain === 'Overhang').count, 1);

const jess = [];
for (let i = 0; i < 28; i++) jess.push({ created_at: '2026-10-10T12:00:00Z', climbing_type: 'Vertical', is_checkin: false, baseline_zone: 'sent' });
jess.push({ created_at: '2026-10-11T12:00:00Z', climbing_type: 'Vertical', is_checkin: false, baseline_zone: 'fall_practice' });
for (let i = 0; i < 8; i++) jess.push({ created_at: '2026-10-10T12:00:00Z', climbing_type: 'Overhang', is_checkin: false, baseline_zone: 'sent' });
for (let i = 0; i < 5; i++) jess.push({ created_at: '2026-10-10T12:00:00Z', climbing_type: 'Roof', is_checkin: false, baseline_zone: 'sent' });
for (let i = 0; i < 3; i++) jess.push({ created_at: '2026-10-10T12:00:00Z', climbing_type: 'Dihedral', is_checkin: false, baseline_zone: 'sent' });
const volJess = CI.computeTerrainVolume(jess, { days: 90, endDate: volEnd });
assert.strictEqual(volJess.counts.Vertical, 29, 'Jess: Oct 11 fall-practice brings Vertical to 29');
assert.strictEqual(volJess.counts.Overhang, 8);
assert.strictEqual(volJess.counts.Roof, 5);
assert.strictEqual(volJess.counts.Dihedral, 3);
assert.strictEqual(volJess.counts['Arête'], 0);
assert.strictEqual(volJess.counts.Slab, 0);
assert.strictEqual(volJess.counts.Crack, 0);
assert.strictEqual(volJess.total, 45);

assert.strictEqual(CI.computeStretchShare, undefined, 'stretch-share math is removed');
assert.strictEqual(CI.stretchShareFromZonePoints, undefined, 'stretch-share helper is removed');

const zoneEnd = new Date('2026-10-16T12:00:00Z');
const zoneRows = [
  { created_at: weekAt('2026-10-12', 1), zone: 'comfort', is_checkin: false },
  { created_at: weekAt('2026-10-12', 1), zone: 'comfort', is_checkin: false },
  { created_at: weekAt('2026-10-12', 1), zone: 'comfort', is_checkin: false },
  { created_at: weekAt('2026-10-12', 1), zone: 'comfort', is_checkin: false },
  { created_at: weekAt('2026-10-12', 1), zone: 'learning', is_checkin: false },
  { created_at: weekAt('2026-10-12', 1), zone: 'learning', is_checkin: false },
  { created_at: weekAt('2026-10-05', 1), zone: 'learning', is_checkin: false },
  { created_at: weekAt('2026-10-05', 1), zone: 'panic', is_checkin: false },
  { created_at: weekAt('2026-09-21', 1), zone: 'comfort', is_checkin: false },
  { created_at: weekAt('2026-09-21', 1), zone: 'learning', is_checkin: false },
  { created_at: weekAt('2026-09-21', 1), zone: 'panic', is_checkin: false },
  { created_at: weekAt('2026-10-12', 2), zone: '', is_checkin: false },
  { created_at: weekAt('2026-10-12', 2), zone: 'learning', is_checkin: true },
  { created_at: weekAt('2026-10-12', 2), zone: 'panic', is_baseline: true, is_checkin: false }
];
const zoneWeeks = CI.computeZoneWeekCounts(zoneRows, { weekCount: 4, endDate: zoneEnd });
const oct12 = zoneWeeks.points.find((p) => p.key === '2026-10-12');
const oct5 = zoneWeeks.points.find((p) => p.key === '2026-10-05');
const sep28 = zoneWeeks.points.find((p) => p.key === '2026-09-28');
const sep21 = zoneWeeks.points.find((p) => p.key === '2026-09-21');
assert.ok(oct12 && oct5 && sep28 && sep21);
assert.deepStrictEqual({ c: oct12.comfort, l: oct12.learning, p: oct12.panic, t: oct12.total }, { c: 4, l: 2, p: 0, t: 6 });
assert.ok(/Week of Oct 12: Comfort 4, Learning 2, Panic 0/.test(oct12.tooltip));
assert.deepStrictEqual({ c: oct5.comfort, l: oct5.learning, p: oct5.panic, t: oct5.total }, { c: 0, l: 1, p: 1, t: 2 });
assert.ok(/Week of Oct 5: Comfort 0, Learning 1, Panic 1/.test(oct5.tooltip));
assert.deepStrictEqual({ c: sep28.comfort, l: sep28.learning, p: sep28.panic, t: sep28.total }, { c: 0, l: 0, p: 0, t: 0 }, 'zero week plots 0');
assert.ok(/Week of Sep 28: Comfort 0, Learning 0, Panic 0/.test(sep28.tooltip));
assert.deepStrictEqual({ c: sep21.comfort, l: sep21.learning, p: sep21.panic, t: sep21.total }, { c: 1, l: 1, p: 1, t: 3 });
assert.strictEqual(zoneWeeks.noZone, 1, 'no-zone note N');
assert.strictEqual(zoneWeeks.panicLogged, true);
assert.deepStrictEqual(zoneWeeks.last4, { comfort: 5, learning: 4, panic: 2 });
assert.strictEqual(zoneWeeks.last4Sentence, 'Last 4 weeks: 5 Comfort, 4 Learning, 2 Panic sessions.');
assert.strictEqual(CI.computeZoneWeekCounts(zoneRows.filter((r) => r.zone), { weekCount: 4, endDate: zoneEnd }).noZone, 0);

const progZones = CI.computeProgressSeries(zoneRows, { weekCount: 4, endDate: zoneEnd });
zoneWeeks.points.forEach(function (p, i) {
  assert.strictEqual(p.total, progZones.zonePoints[i].total, 'C+L+P equals strip weekly total');
  assert.strictEqual(p.comfort, progZones.zonePoints[i].zones.comfort);
  assert.strictEqual(p.learning, progZones.zonePoints[i].zones.learning);
  assert.strictEqual(p.panic, progZones.zonePoints[i].zones.panic);
});

const noPanicRows = zoneRows.filter((r) => r.zone !== 'panic' || r.is_baseline);
const noPanicWeeks = CI.computeZoneWeekCounts(noPanicRows, { weekCount: 4, endDate: zoneEnd });
assert.strictEqual(noPanicWeeks.panicLogged, false, 'Panic line omitted when every week is 0');

const jessZoneRows = [];
function pushZone(monday, n, zone) {
  for (let i = 0; i < n; i++) {
    jessZoneRows.push({ created_at: weekAt(monday, 1), zone: zone, is_checkin: false, climbing_type: 'Vertical' });
  }
}
pushZone('2026-07-27', 3, 'comfort');
pushZone('2026-08-03', 2, 'comfort');
pushZone('2026-08-10', 4, 'comfort');
pushZone('2026-08-10', 1, 'learning');
pushZone('2026-08-17', 0, 'comfort');
pushZone('2026-08-24', 5, 'comfort');
pushZone('2026-08-24', 2, 'learning');
pushZone('2026-08-31', 3, 'comfort');
pushZone('2026-09-07', 6, 'comfort');
pushZone('2026-09-07', 1, 'learning');
pushZone('2026-09-14', 2, 'comfort');
pushZone('2026-09-21', 4, 'comfort');
pushZone('2026-09-21', 3, 'learning');
pushZone('2026-09-28', 5, 'comfort');
pushZone('2026-10-05', 6, 'comfort');
pushZone('2026-10-05', 2, 'learning');
pushZone('2026-10-12', 8, 'comfort');
pushZone('2026-10-12', 4, 'learning');
const jessZone = CI.computeZoneWeekCounts(jessZoneRows, { weekCount: 12, endDate: zoneEnd });
const jessProg = CI.computeProgressSeries(jessZoneRows, { weekCount: 12, endDate: zoneEnd });
assert.strictEqual(jessZone.points.length, 12);
assert.strictEqual(jessZone.panicLogged, false);
jessZone.points.forEach(function (p, i) {
  assert.strictEqual(p.comfort + p.learning + p.panic, jessProg.zonePoints[i].total,
    'Jess week ' + p.key + ' C+L+P equals strip');
});
assert.strictEqual(jessZone.last4Sentence, 'Last 4 weeks: 23 Comfort, 9 Learning, 0 Panic sessions.');
console.log('jess-shaped weekly zone counts: ' + jessZone.points.map(function (p) {
  return p.key + ' C' + p.comfort + ' L' + p.learning + ' P' + p.panic + ' T' + p.total;
}).join(' | '));

assert.ok(/scoreboard-falls-caption/.test(dash));
assert.ok(!/falls-per-10-caption/.test(dash), 'falls caption is not repeated in coach read');
assert.strictEqual(
  (dash.match(/class="scoreboard-falls-caption"/g) || []).length,
  1,
  'falls caption appears exactly once'
);
assert.ok(/Per 10 attempts; excludes backed-off and fall-practice rows; shown at 5\+ attempts\./.test(dash));
assert.ok(/Attempts vs prior 4 wks/.test(dash), 'header names attempts vs prior 4 wks');
assert.ok(!/delta \+ ' attempts vs prior 4 wks'/.test(dash)
  && !/\+ '\s*attempts vs prior 4 wks'/.test(dash)
  && !/attempts vs prior 4 wks<\/span>/.test(dash),
  'trend cells do not repeat the unit');
assert.ok(/scoreboard-zone-part/.test(dash), 'zone-mix parts are non-breaking spans');
assert.ok(/zone-week-unit/.test(dash));
assert.ok(/zone-week-svg/.test(dash));
assert.ok(/Sessions per week, by zone/.test(dash));
assert.ok(!/stretch-share/.test(dash));
assert.ok(!/Stretch share/.test(dash));

console.log('coach-athlete-insights tests: ok');
