import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index276'/.test(index));
assert.ok(/APP_VERSION = 'index276'/.test(sw));

assert.ok(/id="log-gym-name-chips"/.test(index), 'chips host exists');
assert.ok(/id="log-gym-name"/.test(index), 'gym name input exists');

const indoorBlock = index.match(/id="log-details-indoor-fields"[\s\S]*?id="log-details-outdoor-fields"/);
assert.ok(indoorBlock, 'indoor fields block extractable');
assert.ok(/id="log-gym-name-chips"/.test(indoorBlock[0]), 'chips live in indoor fields');
assert.ok(indoorBlock[0].indexOf('id="log-gym-name-chips"') < indoorBlock[0].indexOf('id="log-gym-name"'),
  'chips render above the gym name input');
assert.ok(!/chip-primary/.test(indoorBlock[0]));

assert.ok(/var _recentGymNames = null/.test(index));
assert.ok(/async function loadRecentGymNames\(/.test(index));
assert.ok(/function renderGymNameChips\(/.test(index));
assert.ok(/function selectGymNameChip\(/.test(index));
assert.ok(/function rememberRecentGymName\(/.test(index));

function extractFn(src, name){
  var re = new RegExp('(?:async )?function ' + name + '\\([\\s\\S]*?\\n\\}');
  var m = src.match(re);
  assert.ok(m, name + ' extractable');
  return m[0];
}

var loadFn = extractFn(index, 'loadRecentGymNames');
assert.ok(/sbS\(\s*'sessions'/.test(loadFn), 'reads sessions, not a new table');
assert.ok(/select=gym_name,created_at/.test(loadFn));
assert.ok(/user_id=eq\./.test(loadFn));
assert.ok(/gym_name=not\.is\.null/.test(loadFn));
assert.ok(/deleted_at=is\.null/.test(loadFn));
assert.ok(/order=created_at\.desc/.test(loadFn));
assert.ok(/limit=200/.test(loadFn));
assert.ok(/names\.slice\(0,\s*6\)/.test(loadFn));
assert.ok(!/gym_climbs/.test(loadFn), 'does not use gym_climbs catalog');
assert.ok(!/create table/i.test(loadFn));

var renderFn = extractFn(index, 'renderGymNameChips');
assert.ok(/Last: /.test(renderFn), 'most-recent chip labeled Last:');
assert.ok(/chip' \+ \(isLast \? ' selected' : ''\)/.test(renderFn)
  || /class="chip' \+ \(isLast \? ' selected'/.test(renderFn));
assert.ok(!/chip-primary/.test(renderFn), 'reuses .chip.selected, no new chip-primary class');
assert.ok(/escTrainHtml\(n\)/.test(renderFn));
assert.ok(/selectGymNameChip/.test(renderFn));

var selectFn = extractFn(index, 'selectGymNameChip');
assert.ok(/log-gym-name/.test(selectFn));
assert.ok(/logDetailsState\.gymName = name/.test(selectFn));
assert.ok(!/disabled/.test(selectFn), 'tap pre-fills, does not lock the field');

var rememberFn = extractFn(index, 'rememberRecentGymName');
assert.ok(/_recentGymNames = \[name\]\.concat/.test(rememberFn));
assert.ok(/slice\(0,\s*6\)/.test(rememberFn));
assert.ok(/if\(!Array\.isArray\(_recentGymNames\)\) return/.test(rememberFn));

var resetFn = extractFn(index, 'resetLogDetailsState');
assert.ok(/log-gym-name-chips/.test(resetFn));
assert.ok(/chips\.innerHTML = ''/.test(resetFn));
assert.ok(/gym\.value = ''/.test(resetFn));

var refreshFn = extractFn(index, 'refreshLogDetailsPanels');
assert.ok(/setting === 'indoor'/.test(refreshFn));
assert.ok(/loadRecentGymNames\(\)\.then\(renderGymNameChips\)/.test(refreshFn));
assert.ok(/indoor\.style\.display = setting === 'indoor' \? 'block' : 'none'/.test(refreshFn));

var saveFn = extractFn(index, 'logFlowSaveSession');
assert.ok(/rememberRecentGymName\(payload\.gym_name\)/.test(saveFn));
assert.ok((saveFn.match(/rememberRecentGymName\(payload\.gym_name\)/g) || []).length >= 2,
  'cache unshift on offline save and successful save');

assert.ok(/Gym name quick-pick chips from session history/.test(index), 'SEETests cover gym chips');
assert.ok(!/CREATE TABLE/i.test(index.match(/function loadRecentGymNames[\s\S]*?function renderGymNameChips/)[0]));

const sql = readFileSync(join(root, 'sql/sessions-indoor-outdoor-details.sql'), 'utf8');
assert.ok(/gym_name text/.test(sql), 'gym_name already exists on sessions');

const vm = spawnSync('node', ['--input-type=module'], {
  encoding: 'utf8',
  input: `
    var _recentGymNames = null;
    var _authUser = { id: 'u-gym' };
    var fetches = [];
    async function sbS(table, params){
      fetches.push(table + '?' + (params || ''));
      return [
        { gym_name: '  Movement Denver ', created_at: '2026-10-02' },
        { gym_name: "O'Brien's", created_at: '2026-10-01' },
        { gym_name: 'Movement Denver', created_at: '2026-09-01' },
        { gym_name: '  ', created_at: '2026-08-01' },
        { gym_name: null, created_at: '2026-07-15' },
        { gym_name: 'Earth Treks', created_at: '2026-07-01' },
        { gym_name: 'Planet Granite', created_at: '2026-06-01' },
        { gym_name: 'Brooklyn Boulders', created_at: '2026-05-01' },
        { gym_name: 'Touchstone', created_at: '2026-04-01' },
        { gym_name: 'Too Old', created_at: '2026-03-01' }
      ];
    }
    async function loadRecentGymNames(){
      if(_recentGymNames) return _recentGymNames;
      if(!_authUser) return (_recentGymNames = []);
      var rows = await sbS(
        'sessions',
        'select=gym_name,created_at&user_id=eq.' + _authUser.id +
          '&gym_name=not.is.null&deleted_at=is.null&order=created_at.desc&limit=200'
      );
      var seen = {};
      var names = [];
      (Array.isArray(rows) ? rows : []).forEach(function(r){
        var n = (r.gym_name || '').trim();
        if(!n || seen[n]) return;
        seen[n] = true;
        names.push(n);
      });
      _recentGymNames = names.slice(0, 6);
      return _recentGymNames;
    }
    function escTrainHtml(s){
      return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function renderGymNameChips(names){
      names = Array.isArray(names) ? names : [];
      if(!names.length) return '';
      return names.map(function(n, i){
        var isLast = i === 0;
        return '<button type="button" class="chip' + (isLast ? ' selected' : '') + '" onclick="selectGymNameChip(\\'' +
          String(n).replace(/\\\\/g,'\\\\\\\\').replace(/'/g, "\\\\'") + '\\')">' + (isLast ? 'Last: ' : '') + escTrainHtml(n) + '</button>';
      }).join('');
    }
    function rememberRecentGymName(name){
      name = (name || '').trim();
      if(!name) return;
      if(!Array.isArray(_recentGymNames)) return;
      _recentGymNames = [name].concat(_recentGymNames.filter(function(n){ return n !== name; })).slice(0, 6);
    }
    function assert(c, m){ if(!c) throw new Error(m); }

    var names = await loadRecentGymNames();
    assert(names.join('|') === "Movement Denver|O'Brien's|Earth Treks|Planet Granite|Brooklyn Boulders|Touchstone", 'dedupe+trim+cap: ' + names.join('|'));
    assert(fetches.length === 1, 'one fetch');
    assert(/sessions/.test(fetches[0]) && !/gym_climbs/.test(fetches[0]), 'sessions table');
    var names2 = await loadRecentGymNames();
    assert(names2 === names && fetches.length === 1, 'cached per app load');

    rememberRecentGymName('New Gym');
    assert(_recentGymNames[0] === 'New Gym', 'unshift new');
    assert(_recentGymNames.indexOf('Movement Denver') === 1, 'existing shift down');
    assert(_recentGymNames.length === 6, 'still capped');
    assert(_recentGymNames.indexOf('Touchstone') === -1, 'oldest dropped');
    rememberRecentGymName("O'Brien's");
    assert(_recentGymNames[0] === "O'Brien's", 'existing moves to front');
    assert(_recentGymNames.filter(function(n){ return n === "O'Brien's"; }).length === 1, 'no dup');

    _recentGymNames = null;
    rememberRecentGymName('Too Soon');
    assert(_recentGymNames === null, 'remember no-ops until first fetch');

    var html = renderGymNameChips(['Movement Denver', "O'Brien's", 'The Spot']);
    assert(/class="chip selected"/.test(html), 'Last chip uses selected');
    assert(/Last: Movement Denver/.test(html), 'Last: prefix');
    assert(/O'Brien's/.test(html), 'apostrophe name visible');
    assert(/selectGymNameChip\\('O\\\\'Brien\\\\'s'\\)/.test(html) || /O\\\\'Brien/.test(html), 'apostrophe escaped in onclick');
    assert(!/chip-primary/.test(html), 'no invented class');
    assert(html.indexOf('Last:') === html.lastIndexOf('Last:'), 'only first chip labeled Last');
    var outlineCount = (html.match(/class="chip"/g) || []).length;
    assert(outlineCount === 2, 'two outline chips, got ' + outlineCount);

    var empty = renderGymNameChips([]);
    assert(empty === '', 'empty names clear');

    console.log('gym-name-chips runtime: ok');
  `
});
assert.strictEqual(vm.status, 0, vm.stderr || vm.stdout);
assert.ok(/gym-name-chips runtime: ok/.test(vm.stdout), vm.stdout + vm.stderr);

console.log('gym-name-chips tests: ok');
