import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');

assert.ok(!/id="users-hide-test"/.test(html), 'Hide test checkbox is gone');
assert.ok(!/Hide test \/ seed accounts/.test(html), 'Hide test label is gone');
assert.ok(/id="users-role-filter"/.test(html), 'Role filter chrome next to search');
assert.ok(/Role: /.test(html) && /users-role-filter-clear/.test(html), 'Role: label × chrome');
assert.ok(/var _usersRoleFilter = null/.test(html), 'module-level role filter');
assert.ok(/function resolveDisplayRole\(u\)/.test(html));
assert.ok(/function isTestAccount\(u\)/.test(html));
assert.ok(/function setUsersRoleFilter/.test(html));
assert.ok(/roleChip\(resolveDisplayRole\(u\)\)/.test(html), 'table uses resolveDisplayRole');
assert.ok(/data-role-filter=/.test(html), 'chips carry filter value');
assert.ok(/users-role-chip/.test(html));

assert.ok(/rls-probe-/.test(html) && /tf-verify-/.test(html));
assert.ok(/\+test/.test(html));
assert.ok(/@test\.com/.test(html) && /@example\.com/.test(html));
assert.ok(/Signed up · active/.test(html) && /Signed up · no activity/.test(html));
assert.ok(/Test account/.test(html));

const cats = html.match(/var NAV_CATEGORIES = \[[\s\S]*?\];/)[0];
assert.ok(/Overview & Users/.test(cats));
assert.ok(/Operations/.test(cats));
assert.ok(/Business/.test(cats));
assert.ok(/Dev Tools/.test(cats));
assert.ok(/ids:\['overview','all-users','coaching-roster','coach-mgmt'\]/.test(cats));
assert.ok(/ids:\['todo','ops-center','athlete-training','custom-workouts','audit-log'\]/.test(cats));
assert.ok(/ids:\['finance','investor-view','analytics'\]/.test(cats));
assert.ok(/ids:\['see-live','demo-center','roadmap','build-queue'\]/.test(cats));

const allIds = [
  'overview','all-users','coaching-roster','coach-mgmt',
  'todo','ops-center','athlete-training','custom-workouts','audit-log',
  'finance','investor-view','analytics',
  'see-live','demo-center','roadmap','build-queue'
];
allIds.forEach(function(id){
  assert.ok(new RegExp("id:'" + id + "'").test(html), 'SECTIONS keeps ' + id);
});
assert.ok(!/Back office/.test(html.match(/var SECTIONS[\s\S]*expandNavCategoryForSection\('overview'\)/)[0]));
assert.ok(!/Founder tools/.test(html.match(/var SECTIONS[\s\S]*expandNavCategoryForSection\('overview'\)/)[0]));
assert.ok(/function showSection\(id\)\{\s*expandNavCategoryForSection\(id\);/.test(html),
  'showSection auto-expands the active category');
assert.ok(/expandNavCategoryForSection\('overview'\)/.test(html), 'Overview & Users starts expanded');
assert.ok(/nav-group-chevron/.test(html) && /rotate\(90deg\)/.test(html));
assert.ok(/prefers-reduced-motion: reduce/.test(html));
assert.ok(/\.nav-group-items\{display:none;\}/.test(html));
assert.ok(/\.nav-group\.open \.nav-group-items\{display:block;\}/.test(html));
assert.ok(/setNavCategoryExpanded\(cat\.id, !_navExpanded\[cat\.id\]\)/.test(html),
  'header toggles without changing section');

console.log('foundash-role-nav tests: ok');
