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
assert.ok(/var app_version = 'index297'/.test(index));
assert.ok(/APP_VERSION = 'index297'/.test(sw));
assert.ok(!/refreshCoachBadgeOnAuthEvent/.test(dash), 'coach-dashboard untouched');

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

const showSrc = extractFn(index, 'showScreen');
assert.strictEqual((showSrc.match(/loadClimbLog\(/g) || []).length, 1, 'showScreen loads Climb once');
assert.ok(/_climbCacheInflight/.test(extractFn(index, 'loadClimbCache')));
assert.ok(/refreshCoachBadgeOnAuthEvent/.test(extractFn(index, 'initAuth')));
assert.ok(/refreshCoachChatUnreadBadge\(true\)/.test(extractFn(index, 'loadCoachChat')));
assert.ok(/refreshCoachChatUnreadBadge\(true\)/.test(extractFn(index, 'sendCoachChatMessage')));
assert.ok(/coach-message-received/.test(index));

const badgeHelpers = [
  'var _coachBadgeInflight = null;',
  'var _coachBadgeLastAt = 0;',
  'var _coachBadgeForcedAuthUserId = null;',
  extractFn(index, 'resetCoachBadgeRefresh'),
  extractFn(index, 'refreshCoachBadgeOnAuthEvent')
].join('\n');

const badgeCtx = {
  forced: 0,
  throttled: 0,
  _coachBadgeInflight: null,
  _coachBadgeLastAt: 0,
  refreshCoachChatUnreadBadge: function(force){
    if(force) badgeCtx.forced++;
    else badgeCtx.throttled++;
  }
};
vm.createContext(badgeCtx);
vm.runInContext(badgeHelpers, badgeCtx);
vm.runInContext("refreshCoachBadgeOnAuthEvent('SIGNED_IN', { user: { id: 'u1' } })", badgeCtx);
vm.runInContext("refreshCoachBadgeOnAuthEvent('SIGNED_IN', { user: { id: 'u1' } })", badgeCtx);
assert.strictEqual(badgeCtx.forced, 1, 'first SIGNED_IN for a user forces');
assert.strictEqual(badgeCtx.throttled, 1, 'later SIGNED_IN for same user is non-forcing');
vm.runInContext("refreshCoachBadgeOnAuthEvent('INITIAL_SESSION', { user: { id: 'u1' } })", badgeCtx);
assert.strictEqual(badgeCtx.forced, 1, 'INITIAL_SESSION for same user stays non-forcing');
vm.runInContext('resetCoachBadgeRefresh()', badgeCtx);
vm.runInContext("refreshCoachBadgeOnAuthEvent('SIGNED_IN', { user: { id: 'u1' } })", badgeCtx);
assert.strictEqual(badgeCtx.forced, 2, 'sign-out then first sign-in forces again');
vm.runInContext("refreshCoachBadgeOnAuthEvent('SIGNED_IN', { user: { id: 'u2' } })", badgeCtx);
assert.strictEqual(badgeCtx.forced, 3, 'first sign-in for a new user forces');

const climbHelpers = [
  'var _climbCache = null;',
  'var _climbCacheInflight = null;',
  extractFn(index, 'loadClimbCache')
].join('\n');
const climbFetches = [];
const climbCtx = {
  fetches: climbFetches,
  _authUser: { id: 'u1' },
  window: null,
  fetchOwnedClimbsSelect: function(cols){
    climbFetches.push('climbs?select=' + cols);
    return new Promise(function(resolve){
      setTimeout(function(){ resolve([{ id: 'c1', name: 'Arete' }]); }, 20);
    });
  }
};
climbCtx.window = climbCtx;
vm.createContext(climbCtx);
vm.runInContext(climbHelpers, climbCtx);
const pair = vm.runInContext(
  "(function(){ var a=loadClimbCache(); var b=loadClimbCache(); return { a:a, b:b }; })()",
  climbCtx
);
await Promise.all([pair.a, pair.b]);
assert.strictEqual(climbFetches.length, 1, 'two concurrent loadClimbCache calls issue one climbs GET');
assert.ok(climbFetches[0].indexOf('id,name,grade_value,climbing_type') !== -1);

console.log('badge-climb-dedupe tests: ok');
