import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index296'/.test(index));
assert.ok(/APP_VERSION = 'index296'/.test(sw));
assert.ok(!/_sbSInflight/.test(dash), 'coach-dashboard untouched');

function extractFn(src, name){
  let start = src.indexOf('async function ' + name + '(');
  if(start < 0) start = src.indexOf('function ' + name + '(');
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

assert.ok(/_sbSInflight/.test(extractFn(index, 'sbS')));
assert.ok(/delete _sbSInflight/.test(extractFn(index, 'sbS')));
assert.ok(/fetchCoachFlags/.test(extractFn(index, 'refreshCoachDashToggle')));
assert.ok(/clearCoachFlagsCache/.test(extractFn(index, 'authSignOut')));
assert.ok(/resetCoachBadgeRefresh/.test(extractFn(index, 'authSignOut')));
assert.ok(/refreshCoachChatUnreadBadge\(true\)/.test(extractFn(index, 'loadCoachChat')));
assert.ok(/refreshCoachChatUnreadBadge\(true\)/.test(extractFn(index, 'sendCoachChatMessage')));
assert.ok(/refreshCoachBadgeOnAuthEvent/.test(extractFn(index, 'initAuth')));
assert.ok(/30000/.test(extractFn(index, 'refreshCoachChatUnreadBadge')));
assert.ok(/coach-message-received/.test(index));
assert.ok(/coach-message-received/.test(sw));
assert.ok(!/source_assignment_id:/.test(extractFn(index, 'saveTrainSession').match(/var payload = \{[\s\S]+?\};/)[0]));

const helpers = [
  'var _sbSInflight = Object.create(null);',
  extractFn(index, 'sbSInflightKey'),
  extractFn(index, 'sbS'),
  'var _coachFlagsCacheUserId = null;',
  'var _coachFlagsCacheRows = null;',
  'var _coachFlagsCacheInflight = null;',
  extractFn(index, 'clearCoachFlagsCache'),
  extractFn(index, 'fetchCoachFlags'),
  'var _coachBadgeInflight = null;',
  'var _coachBadgeLastAt = 0;',
  extractFn(index, 'resetCoachBadgeRefresh'),
  extractFn(index, 'refreshCoachChatUnreadBadge')
].join('\n');

function makeCtx(){
  const fetches = [];
  let now = 1_000_000;
  const ctx = {
    fetches,
    SB_URL: 'https://example.test',
    _authUser: { id: 'u1' },
    _authToken: 'tok',
    badge: false,
    getSBHeaders: function(){ return { Authorization: 'Bearer tok' }; },
    Date: {
      now: function(){ return now; }
    },
    setNow: function(n){ now = n; },
    console: { error: function(){}, warn: function(){} },
    setTrainChatUnreadBadge: function(on){ ctx.badge = !!on; },
    fetch: function(url){
      fetches.push(String(url));
      return Promise.resolve({
        ok: true,
        json: function(){
          if(String(url).indexOf('coach_flags') !== -1) return Promise.resolve([{ is_coach: true }]);
          if(String(url).indexOf('coach_athlete_links') !== -1) return Promise.resolve([{ coach_id: 'c1' }]);
          if(String(url).indexOf('coach_messages') !== -1) return Promise.resolve([{ id: 'm1' }]);
          return Promise.resolve([]);
        }
      });
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(helpers, ctx);
  return ctx;
}

function countTable(fetches, table){
  return fetches.filter(function(u){ return u.indexOf('/rest/v1/' + table + '?') !== -1; }).length;
}

const ctx1 = makeCtx();
const pair = vm.runInContext(
  "(function(){ var a=sbS('assignments','select=id&limit=1'); var b=sbS('assignments','select=id&limit=1'); return { same: a===b, a:a, b:b }; })()",
  ctx1
);
assert.strictEqual(pair.same, true, 'concurrent identical GETs share one promise');
await Promise.all([pair.a, pair.b]);
assert.strictEqual(countTable(ctx1.fetches, 'assignments'), 1, 'two concurrent identical GETs -> one fetch');

const p3 = vm.runInContext("sbS('assignments', 'select=id&limit=1')", ctx1);
await p3;
assert.strictEqual(countTable(ctx1.fetches, 'assignments'), 2, 'same GET after resolve -> second fetch');

const afterWrite = vm.runInContext("sbS('assignments', 'select=id&limit=1')", ctx1);
await afterWrite;
assert.strictEqual(countTable(ctx1.fetches, 'assignments'), 3, 'GET after a write/resolve is not served from a stale promise');

const ctx2 = makeCtx();
await vm.runInContext("fetchCoachFlags('u1')", ctx2);
await vm.runInContext("fetchCoachFlags('u1')", ctx2);
assert.strictEqual(countTable(ctx2.fetches, 'coach_flags'), 1, 'coach_flags cached per user');
vm.runInContext('clearCoachFlagsCache()', ctx2);
await vm.runInContext("fetchCoachFlags('u1')", ctx2);
assert.strictEqual(countTable(ctx2.fetches, 'coach_flags'), 2, 'coach_flags cache cleared on sign-out');
await vm.runInContext("fetchCoachFlags('u2')", ctx2);
assert.strictEqual(countTable(ctx2.fetches, 'coach_flags'), 3, 'user change misses the previous cache');

const ctx3 = makeCtx();
await vm.runInContext('refreshCoachChatUnreadBadge()', ctx3);
await vm.runInContext('refreshCoachChatUnreadBadge()', ctx3);
assert.strictEqual(countTable(ctx3.fetches, 'coach_athlete_links'), 1);
assert.strictEqual(countTable(ctx3.fetches, 'coach_messages'), 1);
await vm.runInContext('refreshCoachChatUnreadBadge(true)', ctx3);
assert.strictEqual(countTable(ctx3.fetches, 'coach_athlete_links'), 2, 'force refresh on open chat / send');
assert.strictEqual(countTable(ctx3.fetches, 'coach_messages'), 2);

const ctx4 = makeCtx();
await vm.runInContext(
  "Promise.all([fetchCoachFlags('u1'), fetchCoachFlags('u1'), refreshCoachChatUnreadBadge(), refreshCoachChatUnreadBadge()])",
  ctx4
);
for(var i = 0; i < 5; i++){
  await vm.runInContext('refreshCoachChatUnreadBadge()', ctx4);
  await vm.runInContext('fetchCoachFlags("u1")', ctx4);
}
assert.strictEqual(countTable(ctx4.fetches, 'coach_flags'), 1, 'fixture boot+5 screens: coach_flags 1');
assert.strictEqual(countTable(ctx4.fetches, 'coach_athlete_links'), 1, 'fixture boot+5 screens: coach_athlete_links 1');
assert.strictEqual(countTable(ctx4.fetches, 'coach_messages'), 1, 'fixture boot+5 screens: coach_messages 1');

console.log('sb-request-dedupe tests: ok');
