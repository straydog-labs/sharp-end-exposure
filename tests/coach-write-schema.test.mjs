import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const logJs = readFileSync(join(root, 'js/coach-log-session.js'), 'utf8');
const insightsJs = readFileSync(join(root, 'js/coach-athlete-insights.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index291'/.test(index));
assert.ok(/APP_VERSION = 'index291'/.test(sw));

require(join(root, 'js/sessions-insert-required.js'));
require(join(root, 'js/coach-athlete-insights.js'));
require(join(root, 'js/coach-log-session.js'));
const Req = globalThis.SessionsInsertRequired;
const Log = globalThis.CoachLogSession;

assert.deepStrictEqual(Req.FIELDS, ['device_id']);
assert.strictEqual(Req.assertPayload({ device_id: 'coach:c1' }).ok, true);
assert.strictEqual(Req.assertPayload({}).ok, false);
assert.strictEqual(Req.assertPayload({ device_id: null }).ok, false);
assert.strictEqual(Req.assertPayload({ device_id: '' }).ok, false);
assert.ok(/device_id/.test(Req.assertPayload({}).error));

assert.ok(/src="js\/sessions-insert-required\.js"/.test(index));
assert.ok(/src="js\/sessions-insert-required\.js"/.test(dash));
assert.ok(dash.indexOf('js/sessions-insert-required.js') < dash.indexOf('js/coach-log-session.js'));

const built = Log.buildPayload({
  athleteId: 'athlete-1',
  coachId: 'coach-1',
  zone: 'learning'
});
assert.strictEqual(built.ok, true);
assert.strictEqual(built.payload.device_id, 'coach:coach-1');
assert.strictEqual(Req.assertPayload(built.payload).ok, true);

assert.ok(/SessionsInsertRequired\.assertPayload/.test(logJs));
assert.ok(/SessionsInsertRequired\.assertPayload/.test(index));
assert.ok(/SessionsInsertRequired\.assertPayload/.test(dash));

const insertStart = index.indexOf('async function sbInsertSession(');
const insertEnd = index.indexOf('async function sbD(', insertStart);
const insertSrc = index.slice(insertStart, insertEnd);
assert.ok(/assertPayload/.test(insertSrc));
assert.ok(/device_id/.test(insertSrc));

const fallbackStart = dash.indexOf('function postCoachLogSessionWithColumnFallbacks(');
const fallbackEnd = dash.indexOf('function saveCoachLogSession(', fallbackStart);
const fallbackSrc = dash.slice(fallbackStart, fallbackEnd);
assert.ok(!/delete payload\.device_id/.test(fallbackSrc), 'retry must never strip device_id');
assert.ok(/PGRST204/.test(dash));
assert.ok(!/23502/.test(fallbackSrc), 'missing-column retry must not treat 23502 as retryable');

// Production athlete session inserts go through sbInsertSession (not raw sbI),
// except in-page diagnostics that use { test: true } against a mocked fetch.
const prodSbi = index.match(/sbI\(\s*'sessions'/g) || [];
assert.ok(prodSbi.length >= 3, 'sbI sessions still used inside sbInsertSession + diagnostics');
assert.ok(/sbInsertSession\(prepareSessPayload\)/.test(index));
assert.ok(/sbInsertSession\(payload\)/.test(index));
assert.ok(/sbInsertSession\(\{/.test(index));
assert.ok(/sbI\('sessions', \{ test: true \}/.test(index), 'auth diagnostic stays on raw sbI');

assert.ok(!/fetch\(SB_URL \+ '\/rest\/v1\//.test(insightsJs), 'coach-athlete-insights.js does not write');

// Coach write sites: required-looking fields present on insert payloads.
assert.ok(/role: 'athlete'/.test(readFileSync(join(root, 'js/coach-athlete-invite.js'), 'utf8')));
assert.ok(/token: String\(token/.test(readFileSync(join(root, 'js/coach-athlete-invite.js'), 'utf8')));
assert.ok(/created_by: _gymClimbsCtx\.user\.id/.test(dash));
assert.ok(/author_id: coachUser\.id/.test(dash) && /priority:/.test(dash));
assert.ok(/text: text/.test(dash));
assert.ok(/training_focus: focus \|\| null/.test(dash));
assert.ok(/name: fields\.name/.test(dash));
assert.ok(/sender_id: coachUser\.id/.test(dash));
assert.ok(/session_id: sessionId/.test(dash) && /note: noteText/.test(dash));
assert.ok(/coach_id: _coachAthleteNotesCtx\.coachUser\.id/.test(dash));
assert.ok(/body: body \|\| ''/.test(dash));

// Live 2026-09-28: coach-note-patterns.sql is not in PostgREST schema cache.
// note_type insert must retry without the column so general notes still save.
const noteSaveStart = dash.indexOf('async function saveNewCoachAthleteNote(');
const noteSaveEnd = dash.indexOf('function wireCoachAthleteNoteActions(', noteSaveStart);
const noteSave = dash.slice(noteSaveStart, noteSaveEnd);
assert.ok(/note_type: type/.test(noteSave));
assert.ok(/isMissingColumnErr\(err\)/.test(noteSave));
assert.ok(/delete payload\.note_type/.test(noteSave));

assert.ok(/js\/sessions-insert-required\.js/.test(dash));
assert.ok(/Never strip them here/.test(dash) || /never strip them here/.test(dash));

console.log('coach-write-schema tests passed');
