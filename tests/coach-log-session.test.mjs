import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
require(join(__dirname, '../js/coach-athlete-insights.js'));
require(join(__dirname, '../js/coach-log-session.js'));
const Log = globalThis.CoachLogSession;

const missing = Log.buildPayload({ athleteId: 'a1', coachId: 'c1' });
assert.strictEqual(missing.ok, false);
assert.ok(/dial|zone/i.test(missing.error));

assert.strictEqual(Log.scoreToZone(0), 'comfort');
assert.strictEqual(Log.scoreToZone(4), 'comfort');
assert.strictEqual(Log.scoreToZone(4.1), 'learning');
assert.strictEqual(Log.scoreToZone(9), 'learning');
assert.strictEqual(Log.scoreToZone(9.1), 'panic');
assert.strictEqual(Log.scoreToZone(12), 'panic');
assert.strictEqual(Log.SCORE_COMFORT_MAX, 4);
assert.strictEqual(Log.SCORE_LEARNING_MAX, 9);

const built = Log.buildPayload({
  athleteId: 'athlete-1',
  coachId: 'coach-1',
  zone: 'Learning',
  terrain: 'overhang',
  routeName: 'Example climb',
  gymClimbId: 'climb-1',
  grade: 'V4',
  note: 'watched the crux'
});
assert.strictEqual(built.ok, true);
assert.strictEqual(built.payload.user_id, 'athlete-1');
assert.strictEqual(built.payload.logged_by, 'coach-1');
assert.strictEqual(built.payload.logged_by_coach, true);
assert.strictEqual(built.payload.is_checkin, false);
assert.strictEqual(built.payload.zone, 'learning');
assert.strictEqual(built.payload.climbing_type, 'Overhang');
assert.strictEqual(built.payload.route_name, 'Example climb');
assert.strictEqual(built.payload.gym_climb_id, 'climb-1');
assert.strictEqual(built.payload.grade_value, 'V4');
assert.strictEqual(built.payload.session_notes, 'watched the crux');
assert.strictEqual(built.payload.zone_confirmed_by_athlete, false);

const again = Log.keepAfterLogAnother({
  zone: 'panic',
  terrain: 'Overhang',
  gymClimbId: 'climb-1',
  routeName: 'Example climb',
  grade: 'V4',
  note: 'watched the crux',
  activationScore: 11,
  activationTouched: true
});
assert.strictEqual(again.zone, '');
assert.strictEqual(again.terrain, 'Overhang');
assert.strictEqual(again.gymClimbId, 'climb-1');
assert.strictEqual(again.routeName, 'Example climb');
assert.strictEqual(again.grade, 'V4');
assert.strictEqual(again.activationScore, 6);
assert.strictEqual(again.activationTouched, false);

const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');
const logJs = readFileSync(join(__dirname, '../js/coach-log-session.js'), 'utf8');
const index = readFileSync(join(__dirname, '../index.html'), 'utf8');
const colSql = readFileSync(join(__dirname, '../sql/sessions-logged-by-coach.sql'), 'utf8');
const rlsSql = readFileSync(join(__dirname, '../sql/sessions-insert-linked-coach.sql'), 'utf8');

assert.ok(/overflow:hidden/.test(dash));
assert.ok(/text-overflow:ellipsis/.test(dash));
assert.ok(/\.roster-name\{[^}]*white-space:nowrap/.test(dash.replace(/\n/g, '')));
assert.ok(/coach-log-overlay/.test(dash));
assert.ok(/Log a climb/.test(dash));
assert.ok(/clog-back/.test(dash) && /closeCoachLogOverlay/.test(dash));
assert.ok(/clog-save/.test(dash) && /saveCoachLogSession\(\)/.test(dash));
assert.ok(/clog-again/.test(dash) && /resetCoachLogAnother/.test(dash));
assert.ok(/Logged by coach/.test(dash));
assert.ok(/Logged by coach/.test(index));
assert.ok(/s\.logged_by_coach/.test(index));
assert.ok(/logged_by_coach/.test(colSql));
assert.ok(/logged_by uuid/.test(colSql));
assert.ok(!/insert into public\.sessions/i.test(colSql));
assert.ok(/sessions_insert_linked_coach/.test(rlsSql));
assert.ok(/coach_athlete_links/.test(rlsSql));
assert.ok(!/wes\s*shih|sender\s*one/i.test(dash + colSql + rlsSql));

assert.ok(/var _coachLogLocked/.test(dash));
assert.ok(/var _coachLogSaving/.test(dash));
assert.ok(/function coachLogFormLocked/.test(dash));
assert.ok(/function unlockCoachLogForm/.test(dash));
assert.ok(/if\(coachLogFormLocked\(\)\) return;/.test(dash));
assert.ok(/_coachLogLocked = true/.test(dash));
assert.ok(/unlockCoachLogForm\(\)/.test(dash));
assert.ok(/function refreshRosterAfterCoachLog/.test(dash));
assert.ok(/loadRosterInsights\(_detailCtx\.token, _coachRoster\)/.test(dash));
assert.ok(/updateRosterStats\(_detailCtx\.token, _coachRoster\)/.test(dash));
assert.ok(/refreshRosterAfterCoachLog\(\)/.test(dash));
assert.ok(/untaggedFallback/.test(dash));
assert.ok(/if\(untaggedFallback\)/.test(dash));
assert.ok(/not tagged Logged by coach/.test(dash));

assert.ok(/var PANIC_WEEK_THRESHOLD = 3/.test(dash));
assert.ok(/panicWeek \+ ' panic sessions this week/.test(dash));
assert.ok(!/4 panic sessions this week/.test(dash));
assert.ok((dash.match(/panicWeek \+ ' panic sessions this week/g) || []).length >= 2);

assert.ok(/Drag to set their zone/.test(logJs));
assert.ok(/if \(fromUser\) untouched = false/.test(logJs));
assert.ok(/function mountActivationDial/.test(logJs));
assert.ok(/function scoreToZone/.test(logJs));
assert.ok(typeof Log.mountActivationDial === 'function');
assert.ok(/clog-gauge/.test(dash));
assert.ok(/function ensureCoachLogGauge/.test(dash));
assert.ok(/function clearCoachLogGauge/.test(dash));
assert.ok(/mountActivationDial/.test(dash));
assert.ok(/activationTouched/.test(dash));
assert.ok(/zone_confirmed_by_athlete/.test(dash));
assert.ok(/delete payload\.zone_confirmed_by_athlete/.test(dash));
assert.ok(!/clog-zone/.test(dash));
assert.ok(!/clog-zones/.test(dash));
assert.ok(!/saveCoachLogSession\(true\)/.test(dash));
assert.ok(!/fromZoneTap/.test(dash));
assert.ok(!/Tap a zone to save/.test(dash));
assert.ok(!/one tap to save/.test(dash));
assert.ok(!/ghostScore|ghostNeedle|extraGhost/.test(logJs));

const overlayStart = dash.indexOf('id="coach-log-overlay"');
const overlayEnd = dash.indexOf('id="assign-wizard-overlay"');
const overlay = overlayStart >= 0 && overlayEnd > overlayStart
  ? dash.slice(overlayStart, overlayEnd)
  : '';
assert.ok(overlay);
assert.ok(/clog-gauge/.test(overlay));
assert.ok(/clog-catalog/.test(overlay));
assert.ok(/clog-terrains/.test(overlay));
assert.ok(/clog-grade/.test(overlay));
assert.ok(/clog-note/.test(overlay));
assert.ok(/clog-again/.test(overlay));
assert.ok(!/somatic|body-awareness|body awareness|quick.check.in|prepare.for.a.climb|questionnaire/i.test(overlay));

console.log('coach-log-session + roster CSS tests: ok');
