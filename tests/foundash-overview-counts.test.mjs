import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');
const sql = readFileSync(join(__dirname, '../sql/foundash-overview-counts-active-users.sql'), 'utf8');

const loadFn = html.match(/function loadOverviewPrivilegedCounts\(\)\{[\s\S]*?\n  function /)[0];
assert.ok(loadFn, 'loadOverviewPrivilegedCounts extracted');
assert.ok(/total_sessions_real/.test(loadFn), 'sessions pickNum includes total_sessions_real');
assert.ok(/total_climbs_real/.test(loadFn), 'climbs pickNum includes total_climbs_real');
assert.ok(/total_real_users/.test(loadFn), 'usersAll pickNum includes total_real_users');
assert.ok(/pickNum\(data, \['total_sessions_real'/.test(loadFn));
assert.ok(/pickNum\(data, \['total_climbs_real'/.test(loadFn));
assert.ok(/pickNum\(data, \['total_real_users'/.test(loadFn));

const pickSrc = html.match(/function pickNum\(obj, keys\)\{[\s\S]*?\n  \}/)[0];
const check = spawnSync('node', ['--check'], { input: pickSrc, encoding: 'utf8' });
assert.strictEqual(check.status, 0, check.stderr || 'pickNum failed node --check');

const vm = spawnSync('node', [], {
  encoding: 'utf8',
  input: pickSrc + '\n' +
    `function assert(c, m){ if(!c) throw new Error(m); }
     var data = {
       ok: true,
       active_users: 5,
       falls_logged: 3,
       journal_entries: 4,
       total_sessions_real: 213,
       total_climbs_real: 40,
       total_real_users: 8,
       total_sessions: 999,
       total_climbs: 999,
       active_users_all_time: 999
     };
     var sessions = pickNum(data, ['total_sessions_real', 'total_sessions', 'sessions_logged', 'sessions', 'filtered_sessions']);
     var climbs = pickNum(data, ['total_climbs_real', 'total_climbs', 'climbs_tracked', 'climbs', 'filtered_climbs']);
     var usersAll = pickNum(data, ['total_real_users', 'active_users_all_time', 'users_all_time', 'all_time_active_users', 'unfiltered_active_users']);
     var users = pickNum(data, ['active_users', 'active_users_30d', 'users_30d']);
     assert(sessions === 213, 'sessions uses total_sessions_real not total_sessions');
     assert(climbs === 40, 'climbs uses total_climbs_real not total_climbs');
     assert(usersAll === 8, 'caption uses total_real_users');
     assert(users === 5, 'active_users 30d');
     assert(usersAll !== users, 'all-time caption can trigger');
     var miss = pickNum({ ok: true, total_sessions: 12 }, ['total_sessions_real', 'total_sessions']);
     assert(miss === 12, 'fallback still works');
     var blank = pickNum({ ok: true }, ['total_sessions_real', 'total_sessions']);
     assert(blank === null, 'missing stays null → dash');
     console.log('overview-pickNum: ok');`
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/overview-pickNum: ok/.test(vm.stdout));

assert.ok(/INTO v_active_users/.test(sql));
assert.ok(/is_checkin filter REMOVED/.test(sql));
assert.ok(/foundash_admins/.test(sql) && /exclusion REMOVED/.test(sql));
assert.ok(/_foundash_is_test_email/.test(sql));
assert.ok(/now\(\) - interval '30 days'/.test(sql) || /now\(\) - interval ''30 days''/.test(sql));
assert.ok(/total_sessions_real/.test(sql) && /falls_logged/.test(sql), 'other counters named as untouched');
assert.ok(!/INTO v_total_sessions_real/.test(sql), 'does not rewrite session counter');
assert.ok(!/INTO v_falls_logged/.test(sql), 'does not rewrite falls counter');
assert.ok(/Other tile query changed/.test(sql), 'byte-compares other INTO blocks');
assert.ok(/active_users_30d/.test(sql), 'live verification select');
assert.ok(/Kellyanne Peters/.test(sql) || /Kellyanne Peterson/.test(sql));

console.log('foundash-overview-counts tests: ok');
