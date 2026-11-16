import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');

assert.ok(/id="users-filter-baseline"/.test(html));
assert.ok(/data-sort="baseline"/.test(html));
assert.ok(!/function hydrateUsersBaselineFlags/.test(html), 'cross-user baseline REST read removed');
assert.ok(!/function fetchUserBaseline/.test(html), 'baseline REST read removed');
assert.ok(/sbRpc\('foundash_user_full'/.test(html.match(/function openUserDetail\(userId\)\{[\s\S]*?\n  function buildUserDetailHtml/)[0]));
assert.ok(!/function mergeUserDetailBundle/.test(html));
assert.ok(/function userDetailCoachLine/.test(html));
assert.ok(/No baseline set yet\./.test(html));
assert.ok(/Not linked to a coach/.test(html));
assert.ok(/metric-label">Baseline/.test(html));
assert.ok(!/pay-add-btn/.test(html), 'payments stay read-only');

function sliceFn(name){
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n  \\}');
  const m = html.match(re);
  assert.ok(m, 'extract ' + name);
  return m[0];
}

const terrains = html.match(/var COACH_BASELINE_TERRAINS = \[[^\]]+\];/)[0];
const src = [
  sliceFn('escapeHtml'),
  sliceFn('shortId'),
  sliceFn('personDisplayName'),
  sliceFn('fmtDate'),
  sliceFn('fmtShortDate'),
  terrains,
  sliceFn('parseBaselineTerrainState'),
  sliceFn('userField'),
  sliceFn('userIsTest'),
  sliceFn('isTestAccount'),
  sliceFn('userIsCoach'),
  sliceFn('userIsAthlete'),
  sliceFn('userDetailTableHtml'),
  sliceFn('userDetailAccordionHtml'),
  sliceFn('userDetailCoachLine'),
  sliceFn('userDetailBaselinePanelHtml')
].join('\n');

const check = spawnSync('node', ['--check'], { input: src, encoding: 'utf8' });
assert.strictEqual(check.status, 0, check.stderr || 'helpers failed node --check');

const vm = spawnSync('node', [], {
  encoding: 'utf8',
  input: src + '\n' +
    `function assert(c, m){ if(!c) throw new Error(m); }
     var baseline = {
       id: 'b1',
       created_at: '2026-09-04T13:00:00Z',
       baseline_terrain_state: { Slab: 'solid', Vertical: 'ok' },
       baseline_terrain_calibrated: { Slab: true }
     };
     var roster = [{
       coach_email: 'wes@x.com', status: 'active'
     }];
     var coachLine = userDetailCoachLine(roster);
     assert(coachLine === 'Coach: wes@x.com (active)', coachLine);
     var unlinkedLine = userDetailCoachLine([]);
     assert(unlinkedLine === 'Not linked to a coach', unlinkedLine);
     assert(userDetailBaselinePanelHtml(null) === '<div class="bo-empty">No baseline set yet.</div>', 'empty baseline exact');
     var panel = userDetailBaselinePanelHtml(baseline);
     assert(panel.indexOf('Slab') !== -1 && panel.indexOf('Crack') !== -1, 'all 5 terrains');
     assert(panel.indexOf('Calibrated') !== -1, 'calibrated badge');
     assert(panel.indexOf('Not set') !== -1, 'unset terrain');
     assert(!/session/i.test(panel), 'baseline panel text has no session');
     console.log(coachLine);
     console.log(unlinkedLine);
     console.log('full-detail: ok');`
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/full-detail: ok/.test(vm.stdout));
assert.ok(/Coach: wes@x.com \(active\)/.test(vm.stdout));
assert.ok(/Not linked to a coach/.test(vm.stdout));

console.log('foundash-user-full-detail tests: ok');
