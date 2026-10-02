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
const sql = readFileSync(join(__dirname, '../sql/psyche-drills-coach-read.sql'), 'utf8');

assert.ok(typeof CI.computePsycheVolumeSeries === 'function');
assert.ok(typeof CI.computeTrainingVolumeSeries === 'function');

const end = new Date(2026, 8, 1, 12, 0, 0); // Tue Sep 1 2026 local
const monThis = new Date(2026, 7, 31, 10, 0, 0);
const sunThis = new Date(2026, 8, 6, 18, 0, 0);
const prevWeek = new Date(2026, 7, 24, 9, 0, 0);
const tooOld = new Date(2026, 4, 1, 9, 0, 0);

const checkins = [
  { id: 'c1', created_at: monThis.toISOString(), is_checkin: true, is_baseline: false },
  { id: 'c2', created_at: sunThis.toISOString(), is_checkin: true, is_baseline: false },
  { id: 'skip-climb', created_at: monThis.toISOString(), is_checkin: false, is_baseline: false },
  { id: 'skip-base', created_at: monThis.toISOString(), is_checkin: true, is_baseline: true },
  { id: 'skip-deleted', created_at: monThis.toISOString(), is_checkin: true, is_baseline: false, deleted_at: '2026-09-01' },
  { id: 'skip-old', created_at: tooOld.toISOString(), is_checkin: true, is_baseline: false },
  null
];
const drills = [
  { id: 'd1', created_at: prevWeek.toISOString(), drill_key: 'breathing' },
  { id: 'd2', created_at: monThis.toISOString(), drill_key: 'visualization' },
  { id: 'skip-key', created_at: monThis.toISOString(), drill_key: '' },
  { id: 'skip-del', created_at: monThis.toISOString(), drill_key: 'pmr', deleted_at: '2026-09-01' },
  { id: 'skip-old-d', created_at: tooOld.toISOString(), drill_key: 'self-talk' }
];

const psy = CI.computePsycheVolumeSeries(checkins, drills, { weekCount: 4, endDate: end });
const train = CI.computeTrainingVolumeSeries([], { weekCount: 4, endDate: end });
assert.deepStrictEqual(psy.labels, train.labels, 'same week axis as training volume');
assert.strictEqual(psy.sessionCount, 4, '2 checkins + 2 drills in window');
assert.strictEqual(psy.maxCount, 3, 'two checkins + one drill in latest week');
const last = psy.points[psy.points.length - 1];
assert.strictEqual(last.count, 3);
assert.strictEqual(CI.weekKey(monThis), last.key);
assert.strictEqual(psy.points[psy.points.length - 2].count, 1);

const empty = CI.computePsycheVolumeSeries([], [], { weekCount: 4, endDate: end });
assert.strictEqual(empty.sessionCount, 0);
assert.strictEqual(empty.maxCount, 0);
assert.strictEqual(empty.points.length, 4);

const checkinOnly = CI.computePsycheVolumeSeries(
  [{ created_at: monThis.toISOString(), is_checkin: true, is_baseline: false }],
  [],
  { weekCount: 4, endDate: end }
);
assert.strictEqual(checkinOnly.sessionCount, 1);
const drillOnly = CI.computePsycheVolumeSeries(
  [],
  [{ created_at: monThis.toISOString(), drill_key: 'breathing' }],
  { weekCount: 4, endDate: end }
);
assert.strictEqual(drillOnly.sessionCount, 1);

assert.ok(/psyche_drills_select_coach/.test(sql));
assert.ok(/coach_athlete_links/.test(sql));
assert.ok(/psyche_drills\.user_id/.test(sql));

assert.ok(/id="athlete-psyche-volume-panel"/.test(dash));
assert.ok(/id="athlete-psyche-volume-body"/.test(dash));
assert.ok(/function loadAthletePsycheCheckins/.test(dash));
assert.ok(/function loadAthletePsycheDrills/.test(dash));
assert.ok(/function renderPsycheVolumePanelHtml/.test(dash));
assert.ok(/_athletePsycheCheckinCache/.test(dash));
assert.ok(/_athletePsycheDrillCache/.test(dash));

const checkinFn = dash.match(/function loadAthletePsycheCheckins[\s\S]*?\n  function loadAthletePsycheDrills/);
assert.ok(checkinFn);
assert.ok(/is_checkin=eq\.true/.test(checkinFn[0]));
assert.ok(/is_baseline=eq\.false/.test(checkinFn[0]));
assert.ok(/limit=2000/.test(checkinFn[0]));
assert.ok(/'sessions'/.test(checkinFn[0]));

const drillFn = dash.match(/function loadAthletePsycheDrills[\s\S]*?\n  function loadAthleteProjectClimbs/);
assert.ok(drillFn);
assert.ok(/psyche_drills/.test(drillFn[0]));
assert.ok(/drill_key/.test(drillFn[0]));
assert.ok(/limit=2000/.test(drillFn[0]));

const panels = dash.match(/function loadAthleteInsightPanels\([\s\S]*?\n  function insightSvgPolyline/);
assert.ok(panels);
assert.ok(/loadAthletePsycheCheckins\(token, athleteId\)/.test(panels[0]));
assert.ok(/loadAthletePsycheDrills\(token, athleteId\)/.test(panels[0]));
assert.ok(/renderPsycheVolumePanelHtml\(checkins, drills\)/.test(panels[0]));

const renderPsy = dash.match(/function renderPsycheVolumePanelHtml\(checkins, drills\)\{[\s\S]*?\n  function renderGapPanelHtml/);
assert.ok(renderPsy);
assert.ok(/computePsycheVolumeSeries\(checkins, drills, \{ weekCount: 12 \}\)/.test(renderPsy[0]));
assert.ok(/No logged psyche practice in the last 12 weeks/.test(renderPsy[0]));
assert.ok(/Psyche practices per week/.test(renderPsy[0]));
assert.ok(/#a9622f/.test(renderPsy[0]));
assert.ok(/#3db8c9/.test(dash) && !/#3db8c9/.test(renderPsy[0]), 'psyche line is not the training teal');
assert.ok(/athlete's own Psyche tab/.test(renderPsy[0]) || /athlete\\'s own Psyche tab/.test(renderPsy[0]));
assert.ok(/renderSharedAxisSvg/.test(renderPsy[0]));
assert.ok(!/buildPsycheRadar/.test(dash), 'radar left out of this pass');

const climbFetch = dash.match(/function loadAthleteInsightSessions[\s\S]*?\n  function loadAthleteTrainingInsightSessions/);
assert.ok(/is_checkin=eq\.false/.test(climbFetch[0]), 'progress fetch still excludes check-ins');

const landing = dash.match(/function renderAthleteDetail\([\s\S]*?\n  var _coachLogState/)[0];
const html = landing.match(/'<div id="athlete-landing">'[\s\S]*?'<\/div>' \+\s*'<div id="athlete-subview"/)[0];
assert.ok(html.indexOf('athlete-training-volume-panel') < html.indexOf('athlete-psyche-volume-panel'));
assert.ok(html.indexOf('athlete-psyche-volume-panel') < html.indexOf('athlete-gap-panel'));
assert.ok(html.indexOf('athlete-share-block') < html.indexOf('athlete-psyche-volume-panel'));
assert.ok(/Psyche practice/.test(html));

console.log('coach-psyche-volume tests: ok');
