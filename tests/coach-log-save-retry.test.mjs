import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

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

const saveStart = dash.indexOf('function saveCoachLogSession(');
const saveEnd = dash.indexOf('function resetCoachLogAnother(', saveStart);
const saveSrc = dash.slice(saveStart, saveEnd);
assert.ok(saveSrc);
assert.ok(/postCoachLogSessionWithColumnFallbacks\(postCoachLogSession, payload, retryState\)/.test(saveSrc));
assert.ok(/friendlyErrorMessage\(retryState\.firstErr \|\| err/.test(saveSrc));
assert.ok(!/if\(payload\.gym_climb_id\)/.test(saveSrc));
assert.ok(!/hasOwnProperty\('zone_confirmed_by_athlete'\)/.test(saveSrc));
assert.ok(!/payload\.logged_by_coach != null/.test(saveSrc));

const helperSrc = extractFn(dash, 'isCoachLogMissingColumn');
assert.ok(/err\.code !== 'PGRST204'/.test(helperSrc));
assert.ok(/err\.code !== '42703'/.test(helperSrc));
assert.ok(/indexOf\(column\)/.test(helperSrc));

const ctx = {};
vm.createContext(ctx);
vm.runInContext(extractFn(dash, 'isCoachLogMissingColumn'), ctx);
vm.runInContext(extractFn(dash, 'postCoachLogSessionWithColumnFallbacks'), ctx);

function samplePayload(){
  return {
    user_id: 'athlete-1',
    zone: 'learning',
    gym_climb_id: 'climb-1',
    session_notes: 'watched the crux',
    logged_by_coach: true,
    logged_by: 'coach-1',
    zone_confirmed_by_athlete: false
  };
}

function rlsErr(){
  return {
    code: '42501',
    message: 'new row violates row-level security policy for table "sessions"'
  };
}

function missingColErr(column){
  return {
    code: 'PGRST204',
    message: "Could not find the '" + column + "' column of 'sessions' in the schema cache"
  };
}

function runRetries(postFn, payload){
  const state = {};
  return vm.runInContext(
    'postCoachLogSessionWithColumnFallbacks(postFn, payload, state)',
    vm.createContext(Object.assign({}, ctx, { postFn, payload, state }))
  ).then(function(rows){
    return { ok: true, rows, state };
  }).catch(function(err){
    return { ok: false, err, state };
  });
}

const rlsPayload = samplePayload();
const rlsCalls = [];
const rlsResult = await runRetries(function(body){
  rlsCalls.push(Object.assign({}, body));
  return Promise.reject(rlsErr());
}, rlsPayload);

assert.strictEqual(rlsResult.ok, false, 'RLS must not be swallowed by fallbacks');
assert.strictEqual(rlsCalls.length, 1, 'no fallback tier should fire for a non-column error');
assert.strictEqual(rlsPayload.gym_climb_id, 'climb-1');
assert.strictEqual(rlsPayload.zone_confirmed_by_athlete, false);
assert.strictEqual(rlsPayload.logged_by_coach, true);
assert.strictEqual(rlsPayload.logged_by, 'coach-1');
assert.strictEqual(rlsPayload.session_notes, 'watched the crux');
assert.strictEqual(rlsResult.state.firstErr.code, '42501');
assert.strictEqual(rlsResult.err.code, '42501');
assert.ok(/row-level security/.test(rlsResult.err.message));
assert.strictEqual(rlsResult.err, rlsResult.state.firstErr);

const shown = 'Could not save. ' + rlsResult.state.firstErr.message;
assert.ok(/row-level security/.test(shown));
assert.ok(!/Could not find the/.test(shown));

const zoneCalls = [];
const zonePayload = samplePayload();
const zoneResult = await runRetries(function(body){
  zoneCalls.push(Object.assign({}, body));
  if(Object.prototype.hasOwnProperty.call(body, 'zone_confirmed_by_athlete')){
    return Promise.reject(missingColErr('zone_confirmed_by_athlete'));
  }
  return Promise.resolve([{ id: 'ok-zone' }]);
}, zonePayload);
assert.strictEqual(zoneResult.ok, true);
assert.strictEqual(zoneCalls.length, 2);
assert.ok(!zonePayload.hasOwnProperty('zone_confirmed_by_athlete'));
assert.strictEqual(zonePayload.logged_by_coach, true);
assert.strictEqual(zonePayload.gym_climb_id, 'climb-1');

const exhaustedCalls = [];
const exhaustedPayload = samplePayload();
const firstMissing = missingColErr('gym_climb_id');
const exhaustedResult = await runRetries(function(body){
  exhaustedCalls.push(Object.keys(body).slice());
  if(Object.prototype.hasOwnProperty.call(body, 'gym_climb_id')){
    return Promise.reject(firstMissing);
  }
  if(Object.prototype.hasOwnProperty.call(body, 'zone_confirmed_by_athlete')){
    return Promise.reject(missingColErr('zone_confirmed_by_athlete'));
  }
  if(Object.prototype.hasOwnProperty.call(body, 'logged_by_coach')){
    return Promise.reject(missingColErr('logged_by_coach'));
  }
  return Promise.reject(rlsErr());
}, exhaustedPayload);
assert.strictEqual(exhaustedResult.ok, false);
assert.strictEqual(exhaustedCalls.length, 4);
assert.strictEqual(exhaustedResult.state.firstErr, firstMissing);
assert.strictEqual(exhaustedResult.err.code, '42501');
assert.ok(/gym_climb_id/.test(exhaustedResult.state.firstErr.message));

console.log('coach-log-save-retry tests: ok');
