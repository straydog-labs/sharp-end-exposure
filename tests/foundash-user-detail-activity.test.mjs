import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');

assert.ok(/id="sidebar-admin-session"/.test(html), 'sidebar session slot');
assert.ok(/id="sidebar-signout"/.test(html), 'sidebar Sign out');
assert.ok(/id="sidebar-admin-email"/.test(html));
assert.ok(/function signOutAdmin\(/.test(html));
assert.ok(/function updateSidebarAdminSession\(/.test(html));
assert.ok(/function clearAdminSessionLocal\(/.test(html));
assert.ok(/bindSidebarSignOut/.test(html));
assert.ok(/renderAdminSessionBar[\s\S]*signOutAdmin\(\)/.test(html), 'per-section bar reuses signOutAdmin');

assert.ok(/#sidebar-admin-session\[hidden\]\{display:none;\}/.test(html));
assert.ok(/#user-detail-modal \.nav-group/.test(html), 'detail accordions reuse nav-group');
assert.ok(/#user-detail-modal \.bo-table td\.notes-clip/.test(html));

const detailFn = html.match(/function buildUserDetailHtml\(userId, data, cached\)\{[\s\S]*?\n  function renderUserDetail/)[0];
assert.ok(detailFn, 'buildUserDetailHtml extracted');
assert.ok(/repeat\(auto-fill,minmax\(140px,1fr\)\)/.test(detailFn), 'fluid tile grid');
assert.ok(!/repeat\(4,1fr\)/.test(detailFn) && !/repeat\(5,1fr\)/.test(detailFn), 'no hardcoded tile columns');
assert.ok(!/metric-label">Sessions/.test(detailFn), 'Sessions tile gone');
assert.ok(/metric-label">Climbs/.test(detailFn));
assert.ok(/metric-label">Falls/.test(detailFn));
assert.ok(/metric-label">Journal/.test(detailFn));
assert.ok(/metric-label">Psyche/.test(detailFn));
assert.ok(/metric-label">Train/.test(detailFn));
assert.ok(/metric-label">Baseline/.test(detailFn));
assert.ok(/baselineSet \? 'Set' : 'Not set'/.test(detailFn));
assert.ok(/userField\(profile, \['psyche_count'\]/.test(detailFn));
assert.ok(/userField\(profile, \['train_count'\]/.test(detailFn));
assert.ok(!/Recent sessions/.test(detailFn));
assert.ok(!/sessHtml/.test(detailFn));
assert.ok(!/recent_sessions/.test(detailFn), 'always-visible recent sessions removed');
assert.ok(!/CSV|csv|export/i.test(detailFn), 'no CSV export');
assert.ok(/userDetailAccordionHtml\('climbs', 'Climbs'/.test(detailFn));
assert.ok(/userDetailAccordionHtml\('falls', 'Falls'/.test(detailFn));
assert.ok(/userDetailAccordionHtml\('assignments', 'Assignments'/.test(detailFn));
assert.ok(/userDetailAccordionHtml\('journal', 'Journal'/.test(detailFn));
assert.ok(/userDetailAccordionHtml\('psyche', 'Psyche'/.test(detailFn));
assert.ok(/userDetailAccordionHtml\('train', 'Train'/.test(detailFn));
assert.ok(/No climbs logged\./.test(detailFn));
assert.ok(/No psyche activity logged\./.test(detailFn));
assert.ok(/No training sessions logged\./.test(detailFn));
assert.ok(/No falls logged\./.test(detailFn));
assert.ok(/No assignments\./.test(detailFn));
assert.ok(/No journal entries\./.test(detailFn));
assert.ok(/Date', 'Route', 'Grade', 'Type', 'Setting', 'Zone', 'Confidence', 'Breathing', 'Gut', 'Crux', 'Body'/.test(detailFn));
assert.ok(/Date', 'Type', 'Detail'/.test(detailFn));
assert.ok(/Date', 'Energy', 'Started', 'Ended', 'Notes'/.test(detailFn));
assert.ok(/c\.zone \|\| c\.baseline_zone/.test(detailFn));
assert.ok(/c\.zone_confidence/.test(detailFn));
assert.ok(/row\.kind === 'drill'/.test(detailFn));
assert.ok(/Payments ledger/.test(detailFn), 'payments stay');
assert.ok(/user-detail-coach-line/.test(detailFn));
assert.ok(/user-detail-baseline-card/.test(detailFn));
assert.ok(!/session/i.test(html.match(/function userDetailBaselinePanelHtml\(baseline\)\{[\s\S]*?\n  function /)[0]), 'baseline panel never says session');

const renderFn = html.match(/function renderUserDetail\(userId, data, cached\)\{[\s\S]*?\n  function /)[0];
assert.ok(/bindUserDetailAccordions\(body\)/.test(renderFn));
assert.ok(/user-detail-baseline-card/.test(renderFn));

const accFn = html.match(/function userDetailAccordionHtml\(key, title, innerHtml\)\{[\s\S]*?\n  \}/)[0];
assert.ok(/nav-group-chevron/.test(accFn));
assert.ok(/aria-expanded="false"/.test(accFn), 'collapsed by default');
assert.ok(!/class="nav-group open"/.test(accFn));

const bindFn = html.match(/function bindUserDetailAccordions\(root\)\{[\s\S]*?\n  \}/)[0];
assert.ok(/classList\.toggle\('open'/.test(bindFn));
assert.ok(/aria-expanded/.test(bindFn));

const escapeSrc = html.match(/function escapeHtml\(s\)\{[\s\S]*?\n  \}/)[0];
const fmtSrc = html.match(/function fmtShortDate\(v\)\{[\s\S]*?\n  \}/)[0];
const tableSrc = html.match(/function userDetailTableHtml\(headers, rowsHtml, emptyMsg\)\{[\s\S]*?\n  \}/)[0];
const accSrc = html.match(/function userDetailAccordionHtml\(key, title, innerHtml\)\{[\s\S]*?\n  \}/)[0];
const userFieldSrc = html.match(/function userField\(u, keys, fallback\)\{[\s\S]*?\n  \}/)[0];

const check = spawnSync('node', ['--check'], {
  input: [escapeSrc, fmtSrc, tableSrc, accSrc, userFieldSrc].join('\n'),
  encoding: 'utf8'
});
assert.strictEqual(check.status, 0, check.stderr || 'helpers failed node --check');

const vm = spawnSync('node', [], {
  encoding: 'utf8',
  input:
    [escapeSrc, fmtSrc, tableSrc, accSrc, userFieldSrc].join('\n') + '\n' +
    `function assert(c, m){ if(!c) throw new Error(m); }
     var profile = { climb_count: 21, falls_count: 3, journal_count: 4, psyche_count: 9, train_count: 2 };
     assert(userField(profile, ['psyche_count'], 0) === 9, 'psyche_count');
     assert(userField(profile, ['train_count'], 0) === 2, 'train_count');
     assert(userField({ session_count: 7 }, ['session_count'], 0) === 7, 'session_count still on profile if present');

     var empty = userDetailTableHtml(['Date'], '', 'No climbs logged.');
     assert(empty.indexOf('No climbs logged.') !== -1, 'empty state');
     assert(empty.indexOf('<table') === -1, 'empty has no table');

     var climbs = [{ created_at: '2026-09-01T12:00:00Z', route_name: 'Arete', grade_value: '5.11a', climbing_type: 'sport', setting: 'outdoor', zone: 'red', baseline_zone: 'yellow' }];
     var rows = climbs.map(function(c){
       return '<tr><td>' + escapeHtml(fmtShortDate(c.created_at)) + '</td><td>' + escapeHtml(c.route_name || '—') + '</td><td>' + escapeHtml(c.grade_value || '—') + '</td><td>' + escapeHtml(c.climbing_type || '—') + '</td><td>' + escapeHtml(c.setting || '—') + '</td><td>' + escapeHtml(c.zone || c.baseline_zone || '—') + '</td></tr>';
     }).join('');
     var table = userDetailTableHtml(['Date','Route','Grade','Type','Setting','Zone'], rows, 'No climbs logged.');
     assert(table.indexOf('Arete') !== -1 && table.indexOf('5.11a') !== -1 && table.indexOf('red') !== -1, 'climb cells');

     var noZone = { zone: '', baseline_zone: 'yellow' };
     assert((noZone.zone || noZone.baseline_zone || '—') === 'yellow', 'zone fallback');

     var acc = userDetailAccordionHtml('climbs', 'Climbs', table);
     assert(acc.indexOf('aria-expanded="false"') !== -1, 'collapsed');
     assert(acc.indexOf('nav-group-chevron') !== -1, 'chevron');
     assert(acc.indexOf('data-acc="climbs"') !== -1, 'acc key');
     assert(/class="nav-group open"/.test(acc) === false, 'not open in markup');

     var drill = { kind: 'drill', drill_key: 'panic-week', created_at: '2026-09-02' };
     var checkin = { kind: 'checkin', created_at: '2026-09-03' };
     assert((drill.kind === 'drill' ? 'Drill' : 'Check-in') === 'Drill');
     assert((checkin.kind === 'drill' ? 'Drill' : 'Check-in') === 'Check-in');
     assert((drill.kind === 'drill' ? (drill.drill_key || '—') : '—') === 'panic-week');
     assert((checkin.kind === 'drill' ? (checkin.drill_key || '—') : '—') === '—');
     console.log('detail-activity: ok');`
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/detail-activity: ok/.test(vm.stdout));

console.log('foundash-user-detail-activity tests: ok');
