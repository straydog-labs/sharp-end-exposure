import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const insightsPath = join(root, 'js/coach-athlete-insights.js');
require(insightsPath);
const CI = globalThis.CoachInsights;
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

const ATHLETE_SEVEN = ['Slab', 'Vertical', 'Overhang', 'Roof', 'Arête', 'Dihedral', 'Crack'];
assert.deepStrictEqual(CI.TERRAIN_TYPES, ATHLETE_SEVEN,
  'coach catalog must match the athlete app 7 terrains, exact spelling');
assert.strictEqual(CI.normalizeTerrainType('Arête'), 'Arête');
assert.strictEqual(CI.normalizeTerrainType('Arete'), 'Arête', 'ASCII Arete aliases to Arête');
assert.strictEqual(CI.normalizeTerrainType('Dihedral'), 'Dihedral');
assert.strictEqual(CI.normalizeTerrainType('dihedral'), 'Dihedral');

const gap = CI.computeGapDiagnostic([
  { zone: 'comfort', climbing_type: 'Arête', is_checkin: false },
  { zone: 'learning', climbing_type: 'Arete', is_checkin: false },
  { zone: 'panic', climbing_type: 'Dihedral', is_checkin: false }
]);
assert.ok(gap.terrains.some((t) => t.terrain === 'Arête'), 'Arête session appears in the gap panel');
assert.ok(gap.terrains.some((t) => t.terrain === 'Dihedral'), 'Dihedral session appears in the gap panel');
assert.strictEqual(gap.otherTerrainCount, 0);
assert.strictEqual(gap.terrains.length, 2);

function extractFn(src, name, nextName){
  const start = src.indexOf('function ' + name + '(');
  const end = nextName ? src.indexOf('function ' + nextName + '(', start + 1) : src.length;
  assert.ok(start >= 0 && end > start, 'extract ' + name);
  return src.slice(start, end);
}

const paint = extractFn(dash, 'paintCoachLogForm', 'readCoachLogFields');
assert.ok(/CoachInsights\.TERRAIN_TYPES/.test(paint), 'log form chips come from TERRAIN_TYPES');

const fallback = dash.match(/\['Slab','Vertical','Overhang','Roof'(?:,'Arête','Dihedral')?,'Crack'\]/g) || [];
assert.ok(fallback.length >= 1);
fallback.forEach(function(s){
  assert.ok(/Arête/.test(s) && /Dihedral/.test(s), 'dashboard fallback lists include Arête and Dihedral: ' + s);
});

assert.ok(/COACH_BASELINE_TERRAINS = \['Slab', 'Vertical', 'Overhang', 'Roof', 'Crack'\]/.test(dash),
  'athlete baseline grid stays 5');
assert.ok(!/five-type/.test(dash));
assert.ok(/Arête/.test(dash.match(/var TERRAIN_LINE_COLOR = \{[\s\S]*?\n  \}/)[0]));
assert.ok(/Dihedral/.test(dash.match(/var TERRAIN_LINE_COLOR = \{[\s\S]*?\n  \}/)[0]));

const ctx = {
  window: { CoachInsights: CI },
  _coachLogState: { terrain: '', catalog: [] },
  document: {
    getElementById: function(id){
      if(id === 'clog-terrains') return ctx.terrainsEl;
      return { innerHTML: '', querySelectorAll: function(){ return []; }, textContent: '', className: '' };
    }
  },
  terrainsEl: {
    innerHTML: '',
    querySelectorAll: function(){ return []; }
  }
};
ctx.readCoachLogFields = function(){};
ctx.ensureCoachLogGauge = function(){};
vm.createContext(ctx);
vm.runInContext(extractFn(dash, 'paintCoachLogForm', 'resetCoachLogAnother'), ctx);
vm.runInContext('paintCoachLogForm()', ctx);
assert.ok(/data-terrain="Arête"/.test(ctx.terrainsEl.innerHTML), 'form chips include Arête');
assert.ok(/data-terrain="Dihedral"/.test(ctx.terrainsEl.innerHTML), 'form chips include Dihedral');
ATHLETE_SEVEN.forEach(function(t){
  assert.ok(ctx.terrainsEl.innerHTML.indexOf('data-terrain="' + t + '"') !== -1, 'chip ' + t);
});

function extractGap(){
  const gctx = {
    window: { CoachInsights: CI },
    escapeHtml: function(s){
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    zoneBarSegsHtml: function(){ return '<bar></bar>'; }
  };
  vm.createContext(gctx);
  vm.runInContext(extractFn(dash, 'renderGapPanelHtml', 'openGymClimbsCatalog'), gctx);
  return vm.runInContext('renderGapPanelHtml(' + JSON.stringify([
    { zone: 'comfort', climbing_type: 'Arête' },
    { zone: 'panic', climbing_type: 'Dihedral' }
  ]) + ')', gctx);
}
const gapHtml = extractGap();
assert.ok(/Arête/.test(gapHtml));
assert.ok(/Dihedral/.test(gapHtml));
assert.ok(/gap-terrain-row/.test(gapHtml));

assert.ok(/var app_version = 'index295'/.test(index));
assert.ok(/APP_VERSION = 'index295'/.test(sw));

console.log('coach-terrain-catalog-parity tests: ok');
