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
assert.strictEqual(volDom.unit, 'Climbs logged');
assert.strictEqual(volDom.total, 4);
assert.strictEqual(volDom.sorted[0].terrain, 'Vertical');
assert.strictEqual(volDom.sorted[0].count, 3);
assert.ok(volDom.sorted.every((row, i, arr) => i === 0 || arr[i - 1].count >= row.count));
assert.strictEqual(volDom.sorted.reduce((n, row) => n + row.count, 0), volDom.total);
assert.ok(!volDom.sorted.some((row) => row.count === 0));
assert.ok(volDom.notLogged.includes('Roof'));
assert.ok(volDom.notLogged.includes('Crack'));
assert.ok(!volDom.notLogged.includes('Vertical'));
assert.ok(!/terrain-volume-radar/.test(js));

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
assert.ok(/% of logged climbs are Vertical/.test(readFull.lines[0]));
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

assert.ok(/Athlete snapshot/.test(dash));
assert.ok(/Print \/ Share/.test(dash));
assert.ok(/@media print/.test(dash));
assert.ok(/athlete-share-print-name/.test(dash));
assert.ok(/athlete-share-print-date/.test(dash));
assert.ok(/Descriptive — not a cause-and-effect read/.test(dash));
assert.ok(/background:var\(--accent\)/.test(dash));
assert.ok(!VOLUME_BAD_COLOR.test((dash.match(/\.terrain-volume-bar-fill\{[^}]+\}/) || [''])[0]));
assert.ok(!/data-terrain-volume="radar"/.test(dash));
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

assert.ok(/athlete-terrain-scoreboard/.test(dash));
assert.ok(/athlete-highlights/.test(dash));
assert.ok(/scoreboard-falls/.test(dash));
assert.ok(!VOLUME_BAD_COLOR.test((dash.match(/\.scoreboard-falls\{[^}]+\}/) || [''])[0]));

console.log('coach-athlete-insights tests: ok');
