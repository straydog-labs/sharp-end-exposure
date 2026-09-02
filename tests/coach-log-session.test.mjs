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
assert.ok(/zone/i.test(missing.error));

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

const again = Log.keepAfterLogAnother({
  zone: 'panic',
  terrain: 'Overhang',
  gymClimbId: 'climb-1',
  routeName: 'Example climb',
  grade: 'V4',
  note: 'watched the crux'
});
assert.strictEqual(again.zone, '');
assert.strictEqual(again.terrain, 'Overhang');
assert.strictEqual(again.gymClimbId, 'climb-1');
assert.strictEqual(again.routeName, 'Example climb');
assert.strictEqual(again.grade, 'V4');

const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');
const index = readFileSync(join(__dirname, '../index.html'), 'utf8');
const colSql = readFileSync(join(__dirname, '../sql/sessions-logged-by-coach.sql'), 'utf8');
const rlsSql = readFileSync(join(__dirname, '../sql/sessions-insert-linked-coach.sql'), 'utf8');

assert.ok(/overflow:hidden/.test(dash));
assert.ok(/text-overflow:ellipsis/.test(dash));
assert.ok(/\.roster-name\{[^}]*white-space:nowrap/.test(dash.replace(/\n/g, '')));
assert.ok(/coach-log-overlay/.test(dash));
assert.ok(/Log a climb/.test(dash));
assert.ok(/clog-back/.test(dash) && /closeCoachLogOverlay/.test(dash));
assert.ok(/clog-save/.test(dash) && /saveCoachLogSession\(false\)/.test(dash));
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

console.log('coach-log-session + roster CSS tests: ok');
