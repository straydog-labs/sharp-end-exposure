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
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

assert.ok(typeof CI.computeTrainingVolumeSeries === 'function');
assert.ok(typeof CI.computeProgressSeries === 'function');

const end = new Date(2026, 8, 1, 12, 0, 0); // Tue Sep 1 2026 local
const monThis = new Date(2026, 7, 31, 10, 0, 0); // Mon Aug 31
const sunThis = new Date(2026, 8, 6, 18, 0, 0); // Sun Sep 6
const prevWeek = new Date(2026, 7, 24, 9, 0, 0); // Mon Aug 24
const tooOld = new Date(2026, 4, 1, 9, 0, 0); // May 1, outside 4-week window

const rows = [
  { id: 'a', started_at: monThis.toISOString(), created_at: tooOld.toISOString(), energy_type: 'Hangboard' },
  { id: 'b', started_at: sunThis.toISOString(), energy_type: 'Boulders' },
  { id: 'c', created_at: prevWeek.toISOString(), energy_type: 'Cardio & Capacity' },
  { id: 'skip-deleted', started_at: monThis.toISOString(), deleted_at: '2026-09-01T00:00:00', energy_type: 'Hangboard' },
  { id: 'skip-old', started_at: tooOld.toISOString(), energy_type: 'Hangboard' },
  { id: 'skip-bad', started_at: 'not-a-date', created_at: 'also-bad', energy_type: 'Hangboard' },
  null
];

const vol = CI.computeTrainingVolumeSeries(rows, { weekCount: 4, endDate: end });
const prog = CI.computeProgressSeries([], { weekCount: 4, endDate: end });
assert.deepStrictEqual(vol.labels, prog.labels, 'same week axis as progress');
assert.strictEqual(vol.points.length, 4);
assert.strictEqual(vol.sessionCount, 3, 'deleted / out of window / invalid excluded');
assert.strictEqual(vol.maxCount, 2, 'two sessions in the latest week');
const last = vol.points[vol.points.length - 1];
assert.strictEqual(last.count, 2);
assert.strictEqual(CI.weekKey(monThis), last.key);
const prev = vol.points[vol.points.length - 2];
assert.strictEqual(prev.count, 1);

const startedPreferred = CI.computeTrainingVolumeSeries(
  [{ started_at: monThis.toISOString(), created_at: tooOld.toISOString() }],
  { weekCount: 4, endDate: end }
);
assert.strictEqual(startedPreferred.sessionCount, 1);
assert.strictEqual(startedPreferred.points[startedPreferred.points.length - 1].count, 1);

const empty = CI.computeTrainingVolumeSeries([], { weekCount: 4, endDate: end });
assert.strictEqual(empty.sessionCount, 0);
assert.strictEqual(empty.maxCount, 0);
assert.strictEqual(empty.points.length, 4);

assert.ok(/id="athlete-training-volume-panel"/.test(dash));
assert.ok(/id="athlete-training-volume-body"/.test(dash));
assert.ok(/function loadAthleteTrainingInsightSessions/.test(dash));
assert.ok(/_athleteTrainingInsightCache/.test(dash));
assert.ok(/function renderTrainingVolumePanelHtml/.test(dash));
assert.ok(/training_sessions/.test(dash.match(/function loadAthleteTrainingInsightSessions[\s\S]*?\n  function loadAthleteProjectClimbs/)[0]));
assert.ok(/limit=2000/.test(dash.match(/function loadAthleteTrainingInsightSessions[\s\S]*?\n  function loadAthleteProjectClimbs/)[0]));
assert.ok(/started_at/.test(dash.match(/function loadAthleteTrainingInsightSessions[\s\S]*?\n  function loadAthleteProjectClimbs/)[0]));

const panels = dash.match(/function loadAthleteInsightPanels\([\s\S]*?\n  function insightSvgPolyline/);
assert.ok(panels, 'loadAthleteInsightPanels extracted');
assert.ok(/loadAthleteTrainingInsightSessions\(token, athleteId\)/.test(panels[0]));
assert.ok(/renderTrainingVolumePanelHtml\(trainingRows\)/.test(panels[0]));
assert.ok(/athlete-training-volume-body/.test(panels[0]));

const renderVol = dash.match(/function renderTrainingVolumePanelHtml\(trainingSessions\)\{[\s\S]*?\n  function renderGapPanelHtml/);
assert.ok(renderVol);
assert.ok(/computeTrainingVolumeSeries\(trainingSessions, \{ weekCount: 12 \}\)/.test(renderVol[0]));
assert.ok(/No logged training sessions in the last 12 weeks/.test(renderVol[0]));
assert.ok(/Sessions per week/.test(renderVol[0]));
assert.ok(/#3db8c9/.test(renderVol[0]));
assert.ok(/renderSharedAxisSvg/.test(renderVol[0]));
assert.ok(/insightChartTitleWithHelp/.test(renderVol[0]));
assert.ok(/logged training session/.test(renderVol[0]));
assert.ok(/not a target or prescription/.test(renderVol[0]));

const paint = dash.match(/function paintAthleteLandingStats\(\)\{[\s\S]*?\n  function athleteShareExportStamp/);
assert.ok(paint, 'SESSIONS tile paint extracted');
assert.ok(/athlete-stat-sessions/.test(paint[0]));
assert.ok(!/computeTrainingVolumeSeries/.test(paint[0]), 'SESSIONS tile is not the volume series');
assert.ok(!/loadAthleteTrainingInsightSessions/.test(paint[0]));

const landing = dash.match(/function renderAthleteDetail\([\s\S]*?\n  var _coachLogState/)[0];
const html = landing.match(/'<div id="athlete-landing">'[\s\S]*?'<\/div>' \+\s*'<div id="athlete-subview"/)[0];
assert.ok(html.indexOf('athlete-progress-panel') < html.indexOf('athlete-training-volume-panel'));
assert.ok(html.indexOf('athlete-training-volume-panel') < html.indexOf('athlete-gap-panel'));
assert.ok(html.indexOf('athlete-share-block') < html.indexOf('athlete-training-volume-panel'));
assert.ok(html.indexOf('athlete-training-volume-panel') < html.indexOf("'<div id=\"athlete-subview\"") ||
  html.indexOf('athlete-training-volume-panel') < html.indexOf("'<div id=\"athlete-subview\""));
assert.ok(/Train sessions/.test(html) || /Training volume/.test(html));

console.log('coach-training-volume tests: ok');
