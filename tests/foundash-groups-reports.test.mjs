import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');
const sqlPath = join(__dirname, '../sql/foundash-groups-reports.sql');
assert.ok(existsSync(sqlPath), 'sql/foundash-groups-reports.sql exists');
const sql = readFileSync(sqlPath, 'utf8');

/* ---------- SQL shape ---------- */
const FNS = [
  'foundash_group_list()',
  'foundash_group_create(text, text)',
  'foundash_group_delete(uuid)',
  'foundash_group_add_members(uuid, uuid[])',
  'foundash_group_remove_member(uuid, uuid)',
  'foundash_group_members(uuid)',
  'foundash_report(date, date, text, uuid, boolean, text)'
];
function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

assert.ok(/CREATE TABLE IF NOT EXISTS public\.foundash_groups \(/.test(sql));
assert.ok(/CREATE TABLE IF NOT EXISTS public\.foundash_group_members \(/.test(sql));
assert.ok(/REFERENCES public\.foundash_groups\s*\(id\)\s*ON DELETE CASCADE/.test(sql), 'member FK cascades');
assert.ok(/PRIMARY KEY \(group_id, user_id\)/.test(sql));
assert.ok(/ALTER TABLE public\.foundash_groups ENABLE ROW LEVEL SECURITY/.test(sql));
assert.ok(/ALTER TABLE public\.foundash_group_members ENABLE ROW LEVEL SECURITY/.test(sql));
assert.ok(/REVOKE ALL ON TABLE public\.foundash_groups FROM PUBLIC, anon, authenticated/.test(sql));
assert.ok(/REVOKE ALL ON TABLE public\.foundash_group_members FROM PUBLIC, anon, authenticated/.test(sql));
assert.ok(!/CREATE POLICY/i.test(sql), 'no direct table policies');
FNS.forEach(function(sig){
  assert.ok(new RegExp('DROP FUNCTION IF EXISTS public\\.' + esc(sig) + ';').test(sql), 'drop ' + sig);
  assert.ok(new RegExp('REVOKE ALL ON FUNCTION public\\.' + esc(sig) + ' FROM PUBLIC, anon, authenticated;').test(sql), 'revoke ' + sig);
  assert.ok(new RegExp('GRANT EXECUTE ON FUNCTION public\\.' + esc(sig) + ' TO authenticated;').test(sql), 'grant ' + sig);
});
const fnBodies = sql.split(/\nCREATE FUNCTION /).slice(1);
assert.strictEqual(fnBodies.length, FNS.length, 'one CREATE FUNCTION per RPC');
fnBodies.forEach(function(body){
  const name = body.slice(0, body.indexOf('('));
  assert.ok(/SECURITY DEFINER/.test(body), name + ' SECURITY DEFINER');
  assert.ok(/SET search_path = public/.test(body), name + ' search_path');
  assert.ok(/IF auth\.uid\(\) IS NULL THEN[\s\S]*?'not_authenticated'/.test(body), name + ' auth check');
  assert.ok(/IF NOT public\._foundash_is_admin\(\) THEN[\s\S]*?'not_admin'/.test(body), name + ' admin check');
});
// No dynamic SQL anywhere. GRANT/REVOKE lines legitimately say EXECUTE.
const noGrants = sql.replace(/--.*$/gm, '').split('\n').filter(function(l){ return !/^\s*(GRANT|REVOKE)\b/.test(l); }).join('\n');
assert.ok(!/\bEXECUTE\b/i.test(noGrants), 'no EXECUTE');
assert.ok(!/\bformat\s*\(/i.test(noGrants), 'no format()');
assert.ok(!/quote_(ident|literal|nullable)/i.test(noGrants), 'no quote_* builders');
// Writes only touch the two new tables.
const writes = noGrants.match(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+([a-z_.]+)/gi) || [];
writes.forEach(function(w){
  assert.ok(/public\.foundash_group(s|_members)$/i.test(w.trim()), 'write outside group tables: ' + w);
});
assert.ok(writes.length > 0, 'group RPCs do write group tables');
assert.ok(/_foundash_is_test_email\(/.test(sql), 'test accounts use the shared helper');
assert.ok(!/CREATE[\s\S]{0,40}FUNCTION public\._foundash_is_test_email/.test(sql), 'helper not redefined');
assert.ok(!/CREATE[\s\S]{0,40}FUNCTION public\._foundash_is_admin/.test(sql), 'admin helper not redefined');
assert.ok(!/foundash_users_summary/.test(sql.replace(/^--.*$/gm, '')), 'users_summary untouched');

/* ---------- UI wiring ---------- */
assert.ok(/<div class="mono">v0\.3\.5 · foundash<\/div>/.test(html), 'version v0.3.5');
assert.ok(/id="section-groups"/.test(html), 'Groups page');
assert.ok(/id="section-reports"/.test(html), 'Reports page');
assert.ok(/\{id:'groups', icon:'[^']+', label:'Groups'\}/.test(html));
assert.ok(/\{id:'reports', icon:'[^']+', label:'Reports'\}/.test(html));
assert.ok(/ids:\['groups','reports'\]/.test(html.match(/var NAV_CATEGORIES = \[[\s\S]*?\];/)[0]));
assert.ok(/if\(id === 'groups'\) loadGroups\(\);/.test(html));
assert.ok(/if\(id === 'reports'\) loadReports\(\);/.test(html));
['foundash_group_list', 'foundash_group_create', 'foundash_group_delete', 'foundash_group_add_members',
 'foundash_group_remove_member', 'foundash_group_members', 'foundash_report'].forEach(function(fn){
  assert.ok(new RegExp("sbRpc\\('" + fn + "'").test(html), 'UI calls ' + fn);
});
['report-date-from', 'report-date-to', 'report-role', 'report-group', 'report-include-test',
 'report-group-by', 'report-run-btn', 'report-csv-btn', 'report-tbody', 'group-create-name',
 'group-create-note', 'group-create-btn', 'groups-tbody', 'group-members-tbody', 'group-picker-list',
 'group-add-selected-btn'].forEach(function(id){
  assert.ok(new RegExp('id="' + id + '"').test(html), 'element #' + id);
});
assert.ok(/id="report-include-test"(?![^>]*checked)/.test(html), 'include test defaults off');
const deleteFn = html.match(/function deleteFoundashGroup\([\s\S]*?\n  \}/);
assert.ok(deleteFn, 'deleteFoundashGroup');
assert.ok(/confirm\(/.test(deleteFn[0]), 'delete asks to confirm');
assert.ok(/if\(!window\.confirm\([\s\S]*?\)\) return;/.test(deleteFn[0]), 'cancel stops the delete');
const rpcStart = deleteFn[0].indexOf("sbRpc('foundash_group_delete'");
assert.ok(rpcStart > deleteFn[0].indexOf('confirm('), 'RPC only after confirm');
assert.ok(/new Blob\(/.test(html) && /text\/csv/.test(html), 'CSV built client-side');

/* ---------- CSV + params (vm) ---------- */
function sliceFn(name){
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}');
  const m = html.match(re);
  assert.ok(m, 'extract ' + name);
  return m[0];
}
const helperSrc = ['escapeHtml', 'foundashCsvCell', 'foundashReportCsv', 'foundashReportParams',
  'foundashReportTableHtml'].map(sliceFn).join('\n') + '\n' +
  html.match(/var FOUNDASH_REPORT_COLUMNS = \[[\s\S]*?\];/)[0];
const vm = spawnSync('node', [], {
  encoding: 'utf8',
  input: helperSrc + `\n
function assert(c, m){ if(!c) throw new Error(m || 'assert'); }
function eq(a, b, m){ if(a !== b) throw new Error((m || 'eq') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
eq(foundashCsvCell('=SUM(A1:A9)'), "'=SUM(A1:A9)", '=');
eq(foundashCsvCell('+1 555'), "'+1 555", '+');
eq(foundashCsvCell('-2+3'), "'-2+3", '-');
eq(foundashCsvCell('@cmd'), "'@cmd", '@');
eq(foundashCsvCell('=HYPERLINK("http://x","y")'), '"\\'=HYPERLINK(""http://x"",""y"")"', 'prefixed then quoted');
eq(foundashCsvCell('Pilot, fall'), '"Pilot, fall"', 'comma quoted');
eq(foundashCsvCell('two\\nlines'), '"two\\nlines"', 'newline quoted');
eq(foundashCsvCell('Pilot'), 'Pilot', 'plain');
eq(foundashCsvCell('a=b'), 'a=b', 'only a leading char triggers');
eq(foundashCsvCell(12), '12', 'number');
eq(foundashCsvCell(0), '0', 'zero');
eq(foundashCsvCell(null), '', 'null');
eq(foundashCsvCell(undefined), '', 'undefined');
var csv = foundashReportCsv([
  { bucket_label: '=cmd|calc', users: 2, active_7d: 1, active_30d: 2, sessions: 3, climbs: 1, coach_linked_athletes: 2 },
  { bucket_label: '@group', users: 1, active_7d: 0, active_30d: 1, sessions: 0, climbs: 0, coach_linked_athletes: 0 }
]);
var lines = csv.split('\\r\\n');
eq(lines[0], 'Bucket,Users,Active 7d,Active 30d,Sessions,Climbs,Coach-linked athletes', 'header');
eq(lines[1], "'=cmd|calc,2,1,2,3,1,2", 'row 1');
eq(lines[2], "'@group,1,0,1,0,0,0", 'row 2');
eq(lines.length, 3, 'no trailing row');
var p = foundashReportParams({ from: '2026-10-01', to: '2026-10-31', role: '', group: '', includeTest: false, groupBy: 'week' });
eq(JSON.stringify(p), JSON.stringify({ p_date_from: '2026-10-01', p_date_to: '2026-10-31', p_role: null, p_group_id: null, p_include_test: false, p_group_by: 'week' }), 'params');
var p2 = foundashReportParams({ from: '', to: '', role: 'coach', group: 'abc', includeTest: true, groupBy: '' });
eq(p2.p_date_from, null); eq(p2.p_date_to, null); eq(p2.p_role, 'coach'); eq(p2.p_group_id, 'abc');
eq(p2.p_include_test, true); eq(p2.p_group_by, 'none');
var t = foundashReportTableHtml([{ bucket_label: '<b>x</b>', users: 4, active_7d: 1, active_30d: 2, sessions: 5, climbs: 6, coach_linked_athletes: 7 }]);
assert(t.indexOf('&lt;b&gt;x&lt;/b&gt;') !== -1, 'labels escaped');
assert(t.indexOf('<td class="num">5</td>') !== -1, 'sessions cell');
assert(foundashReportTableHtml([]).indexOf('No rows') !== -1, 'empty state');
console.log('groups-reports-vm: ok');
`
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/groups-reports-vm: ok/.test(vm.stdout));

/* ---------- Local Postgres ---------- */
const DB = 'foundash_groups_reports_fx';
const ADMIN = '11111111-1111-1111-1111-111111111111';
const ANNA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const KELLY = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
const WES = 'cccccccc-cccc-cccc-cccc-ccccccccccc3';
const PROBE = 'dddddddd-dddd-dddd-dddd-ddddddddddd4';
const MISSING = '99999999-9999-9999-9999-999999999999';

function psql(args){
  return spawnSync('sudo', ['-u', 'postgres', 'psql'].concat(args), { encoding: 'utf8' });
}
const psqlVer = spawnSync('psql', ['--version'], { encoding: 'utf8' });
const pgUp = psqlVer.status === 0 ? psql(['-d', 'postgres', '-c', 'SELECT 1']) : { status: 1 };
if(psqlVer.status !== 0 || pgUp.status !== 0){
  console.log('local postgres skipped');
} else {
  const reset = psql(['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'DROP DATABASE IF EXISTS ' + DB + ';', '-c', 'CREATE DATABASE ' + DB + ';']);
  assert.strictEqual(reset.status, 0, reset.stderr || reset.stdout);

  function runFile(text){
    const file = '/tmp/foundash-groups-reports-test.sql';
    writeFileSync(file, text);
    spawnSync('chmod', ['644', file]);
    return psql(['-d', DB, '-v', 'ON_ERROR_STOP=1', '-f', file]);
  }
  const fixture = readFileSync(join(__dirname, 'fixtures/foundash-groups-reports.fixture.sql'), 'utf8');
  let applied = runFile(fixture + '\n\\i ' + sqlPath + '\n');
  assert.strictEqual(applied.status, 0, applied.stderr || applied.stdout);
  applied = runFile('\\i ' + sqlPath + '\n');
  assert.strictEqual(applied.status, 0, 're-run is clean: ' + (applied.stderr || applied.stdout));

  function q(text, opts){
    opts = opts || {};
    const pre = (opts.role ? 'SET ROLE ' + opts.role + '; ' : '') +
      (opts.sub ? "SET request.jwt.claim.sub = '" + opts.sub + "'; " : '');
    return psql(['-d', DB, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', pre + text]);
  }
  function rpc(text, opts){
    const r = q('SELECT ' + text + ';', opts);
    assert.strictEqual(r.status, 0, text + ': ' + (r.stderr || r.stdout));
    return JSON.parse(r.stdout.trim().split('\n').pop());
  }
  const calls = [
    'public.foundash_group_list()',
    "public.foundash_group_create('x', NULL)",
    "public.foundash_group_delete('" + MISSING + "'::uuid)",
    "public.foundash_group_add_members('" + MISSING + "'::uuid, ARRAY['" + ANNA + "'::uuid])",
    "public.foundash_group_remove_member('" + MISSING + "'::uuid, '" + ANNA + "'::uuid)",
    "public.foundash_group_members('" + MISSING + "'::uuid)",
    'public.foundash_report()'
  ];

  // anon: EXECUTE denied on every RPC
  calls.forEach(function(c){
    const r = q('SELECT ' + c + ';', { role: 'anon' });
    assert.notStrictEqual(r.status, 0, 'anon must be denied: ' + c);
    assert.ok(/permission denied for function foundash_/.test(r.stderr), c + ': ' + r.stderr);
  });
  // PUBLIC has no EXECUTE either (catalog check)
  const anonPriv = q("SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) FROM pg_proc p " +
    "WHERE p.proname LIKE 'foundash_group%' OR p.proname = 'foundash_report';");
  assert.strictEqual(anonPriv.stdout.trim(), 'f', 'anon holds no EXECUTE');
  // anon/authenticated cannot read the tables directly
  ['anon', 'authenticated'].forEach(function(role){
    const r = q('SELECT count(*) FROM public.foundash_groups;', { role: role });
    assert.notStrictEqual(r.status, 0, role + ' direct table read denied');
    assert.ok(/permission denied for table foundash_groups/.test(r.stderr), r.stderr);
  });

  // non-admin signed-in user: not_admin from every RPC, as authenticated
  calls.forEach(function(c){
    const out = rpc(c, { role: 'authenticated', sub: ANNA });
    assert.deepStrictEqual(out, { ok: false, error: 'not_admin' }, c);
  });
  // no JWT subject: not_authenticated
  calls.forEach(function(c){
    const out = rpc(c, { role: 'authenticated', sub: 'none' });
    assert.deepStrictEqual(out, { ok: false, error: 'not_authenticated' }, c);
  });
  const stillEmpty = q('SELECT count(*) FROM public.foundash_groups;');
  assert.strictEqual(stillEmpty.stdout.trim(), '0', 'denied calls wrote nothing');

  const A = { role: 'authenticated' };
  // groups CRUD
  assert.deepStrictEqual(rpc("public.foundash_group_create('   ', NULL)", A), { ok: false, error: 'name_required' });
  const pilot = rpc("public.foundash_group_create('Pilot', 'Sender One')", A);
  assert.strictEqual(pilot.ok, true);
  assert.strictEqual(pilot.group.name, 'Pilot');
  assert.strictEqual(pilot.group.note, 'Sender One');
  assert.strictEqual(pilot.group.created_by, ADMIN);
  assert.deepStrictEqual(rpc("public.foundash_group_create('pilot', NULL)", A), { ok: false, error: 'name_taken' });
  const coaches = rpc("public.foundash_group_create('Coaches', NULL)", A);
  const P = pilot.group.id, C = coaches.group.id;

  const added = rpc("public.foundash_group_add_members('" + P + "'::uuid, ARRAY['" + ANNA + "','" + KELLY + "','" + PROBE + "','" + ANNA + "','" + MISSING + "']::uuid[])", A);
  assert.strictEqual(added.ok, true);
  assert.strictEqual(added.added, 3, 'distinct existing users added');
  assert.strictEqual(added.skipped, 2, 'duplicate and unknown id skipped');
  const again = rpc("public.foundash_group_add_members('" + P + "'::uuid, ARRAY['" + ANNA + "']::uuid[])", A);
  assert.strictEqual(again.added, 0, 're-add is a no-op');
  rpc("public.foundash_group_add_members('" + C + "'::uuid, ARRAY['" + WES + "']::uuid[])", A);
  assert.deepStrictEqual(rpc("public.foundash_group_add_members('" + MISSING + "'::uuid, ARRAY['" + ANNA + "']::uuid[])", A),
    { ok: false, error: 'group_not_found' });

  const list = rpc('public.foundash_group_list()', A);
  assert.strictEqual(list.ok, true);
  assert.deepStrictEqual(list.groups.map(function(g){ return g.name + ':' + g.member_count; }), ['Coaches:1', 'Pilot:3']);
  const members = rpc("public.foundash_group_members('" + P + "'::uuid)", A);
  assert.strictEqual(members.ok, true);
  assert.strictEqual(members.group.name, 'Pilot');
  assert.deepStrictEqual(members.members.map(function(m){ return m.email; }).sort(),
    ['anna.lee@gmail.com', 'kelly.peterson@gmail.com', 'rls-probe-1@gmail.com']);
  assert.strictEqual(members.members.find(function(m){ return m.user_id === PROBE; }).is_test, true);
  assert.strictEqual(members.members.find(function(m){ return m.user_id === ANNA; }).name, 'Anna Lee');

  /* ---------- report ---------- */
  function report(from, to, role, group, includeTest, groupBy){
    function lit(v, type){ return v == null ? 'NULL::' + type : "'" + v + "'::" + type; }
    return rpc('public.foundash_report(' + [lit(from, 'date'), lit(to, 'date'), lit(role, 'text'), lit(group, 'uuid'),
      includeTest == null ? 'NULL::boolean' : String(includeTest), lit(groupBy, 'text')].join(', ') + ')', A);
  }
  function metrics(r){
    return [r.users, r.active_7d, r.active_30d, r.sessions, r.climbs, r.coach_linked_athletes];
  }
  const oct = report('2026-10-01', '2026-10-31', null, null, false, 'none');
  assert.strictEqual(oct.ok, true);
  assert.strictEqual(oct.params.include_test, false);
  assert.strictEqual(oct.rows.length, 1);
  assert.strictEqual(oct.rows[0].bucket, 'all');
  // founder, anna, kelly, wes, solo | anna kelly solo | +wes | anna x2 + kelly | anna | anna kelly
  assert.deepStrictEqual(metrics(oct.rows[0]), [5, 3, 4, 3, 1, 2], 'none, test excluded');
  const octDefault = rpc("public.foundash_report(p_date_from => '2026-10-01', p_date_to => '2026-10-31')", A);
  assert.deepStrictEqual(metrics(octDefault.rows[0]), [5, 3, 4, 3, 1, 2], 'test accounts excluded by default');
  const octTest = report('2026-10-01', '2026-10-31', null, null, true, 'none');
  assert.deepStrictEqual(metrics(octTest.rows[0]), [6, 4, 5, 6, 2, 2], 'include_test adds the probe');

  const byRole = report('2026-10-01', '2026-10-31', null, null, false, 'role');
  assert.deepStrictEqual(byRole.rows.map(function(r){ return r.bucket; }), ['coach', 'athlete', 'both', 'signed-up-only']);
  const roleMap = {};
  byRole.rows.forEach(function(r){ roleMap[r.bucket] = metrics(r); });
  assert.deepStrictEqual(roleMap.coach, [1, 0, 1, 0, 0, 0]);
  assert.deepStrictEqual(roleMap.athlete, [2, 2, 2, 3, 1, 2]);
  assert.deepStrictEqual(roleMap.both, [0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(roleMap['signed-up-only'], [2, 1, 1, 0, 0, 0]);
  const athletesOnly = report('2026-10-01', '2026-10-31', 'athlete', null, false, 'none');
  assert.deepStrictEqual(metrics(athletesOnly.rows[0]), [2, 2, 2, 3, 1, 2], 'role filter');
  assert.deepStrictEqual(report('2026-10-01', '2026-10-31', 'admin', null, false, 'none'), { ok: false, error: 'bad_role' });

  const byGroup = report('2026-10-01', '2026-10-31', null, null, false, 'group');
  assert.deepStrictEqual(byGroup.rows.map(function(r){ return r.bucket_label + ':' + metrics(r).join(','); }),
    ['Coaches:1,0,1,0,0,0', 'Pilot:2,2,2,3,1,2'], 'group_by group (probe excluded)');
  const pilotTest = report('2026-10-01', '2026-10-31', null, P, true, 'none');
  assert.deepStrictEqual(metrics(pilotTest.rows[0]), [3, 3, 3, 6, 2, 2], 'group filter with tests');
  const pilotByGroup = report('2026-10-01', '2026-10-31', null, P, false, 'group');
  assert.deepStrictEqual(pilotByGroup.rows.map(function(r){ return r.bucket; }), [P], 'group filter narrows group buckets');
  assert.deepStrictEqual(report('2026-10-01', '2026-10-31', null, MISSING, false, 'none'), { ok: false, error: 'group_not_found' });

  const byWeek = report('2026-10-01', '2026-10-31', null, null, false, 'week');
  assert.deepStrictEqual(byWeek.rows.map(function(r){ return r.bucket; }),
    ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  assert.deepStrictEqual(byWeek.rows.map(function(r){ return r.bucket_start + '..' + r.bucket_end; }),
    ['2026-10-01..2026-10-04', '2026-10-05..2026-10-11', '2026-10-12..2026-10-18', '2026-10-19..2026-10-25', '2026-10-26..2026-10-31']);
  assert.deepStrictEqual(byWeek.rows.map(function(r){ return r.sessions; }), [0, 1, 1, 0, 1]);
  assert.deepStrictEqual(byWeek.rows.map(function(r){ return r.climbs; }), [0, 1, 0, 0, 0]);
  assert.deepStrictEqual(byWeek.rows.map(function(r){ return r.users; }), [4, 4, 5, 5, 5], 'users signed up by week end');
  assert.deepStrictEqual(byWeek.rows.map(function(r){ return r.coach_linked_athletes; }), [1, 1, 1, 2, 2], 'links by week end');
  assert.deepStrictEqual(byWeek.rows.map(function(r){ return r.active_7d; }), [0, 1, 1, 1, 3]);

  assert.deepStrictEqual(report('2026-10-01', '2026-10-31', null, null, false, 'month'), { ok: false, error: 'bad_group_by' });
  assert.deepStrictEqual(report('2026-10-31', '2026-10-01', null, null, false, 'none'), { ok: false, error: 'bad_date_range' });
  const sept = report('2026-09-01', '2026-09-30', null, null, false, 'none');
  assert.deepStrictEqual(metrics(sept.rows[0]), [4, 0, 1, 1, 0, 1], 'September window');

  /* ---------- delete never touches users or user data ---------- */
  const SNAP = "SELECT md5(string_agg(t, '|' ORDER BY t)) FROM (" + [
    'auth.users', 'public.sessions', 'public.climbs', 'public.training_sessions', 'public.journal_entries',
    'public.psyche_drills', 'public.coach_athlete_links', 'public.coach_flags', 'public.profiles', 'public.foundash_admins'
  ].map(function(t){ return "SELECT '" + t + "' || x::text AS t FROM " + t + ' x'; }).join(' UNION ALL ') + ') s;';
  const COUNTS = "SELECT (SELECT count(*) FROM auth.users) || ',' || (SELECT count(*) FROM public.sessions) || ',' || " +
    "(SELECT count(*) FROM public.climbs) || ',' || (SELECT count(*) FROM public.training_sessions);";
  const before = q(SNAP).stdout.trim();
  const beforeCounts = q(COUNTS).stdout.trim();
  assert.ok(before.length === 32, 'snapshot hash');

  const removed = rpc("public.foundash_group_remove_member('" + P + "'::uuid, '" + KELLY + "'::uuid)", A);
  assert.deepStrictEqual(removed, { ok: true, removed: true });
  assert.deepStrictEqual(rpc("public.foundash_group_remove_member('" + P + "'::uuid, '" + KELLY + "'::uuid)", A), { ok: true, removed: false });
  assert.strictEqual(q(SNAP).stdout.trim(), before, 'remove member leaves user data untouched');

  const del = rpc("public.foundash_group_delete('" + P + "'::uuid)", A);
  assert.deepStrictEqual(del, { ok: true, deleted: true, members_removed: 2 });
  assert.strictEqual(q(SNAP).stdout.trim(), before, 'group delete leaves users and their data untouched');
  assert.strictEqual(q(COUNTS).stdout.trim(), beforeCounts);
  assert.strictEqual(q("SELECT count(*) FROM public.foundash_group_members WHERE group_id = '" + P + "';").stdout.trim(), '0', 'members cascade');
  assert.strictEqual(q("SELECT count(*) FROM public.foundash_group_members WHERE group_id = '" + C + "';").stdout.trim(), '1', 'other group intact');
  assert.deepStrictEqual(rpc("public.foundash_group_delete('" + P + "'::uuid)", A), { ok: false, error: 'group_not_found' });
  const afterReport = report('2026-10-01', '2026-10-31', null, null, false, 'none');
  assert.deepStrictEqual(metrics(afterReport.rows[0]), [5, 3, 4, 3, 1, 2], 'report unchanged after delete');

  // re-run keeps existing groups
  applied = runFile('\\i ' + sqlPath + '\n');
  assert.strictEqual(applied.status, 0, applied.stderr || applied.stdout);
  assert.deepStrictEqual(rpc('public.foundash_group_list()', A).groups.map(function(g){ return g.name; }), ['Coaches'], 're-run keeps data');

  console.log('FIXTURE oct none ' + JSON.stringify(oct.rows[0]));
  console.log('FIXTURE oct week sessions ' + JSON.stringify(byWeek.rows.map(function(r){ return r.sessions; })));
}

console.log('foundash-groups-reports tests: ok');
