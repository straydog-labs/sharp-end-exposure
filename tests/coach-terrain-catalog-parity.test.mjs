import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import { startStaticServer, launchChromium, withPage } from './harness.mjs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
require(join(root, 'js/coach-athlete-insights.js'));
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

assert.ok(/CoachInsights\.TERRAIN_TYPES/.test(dash), 'log form chips come from TERRAIN_TYPES');
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
assert.ok(/function renderGapPanelHtml/.test(dash) && /gap-terrain-row/.test(dash));

assert.ok(/var app_version = 'index296'/.test(index));
assert.ok(/APP_VERSION = 'index296'/.test(sw));

const { server, port } = await startStaticServer();
const browser = await launchChromium();
try{
  await withPage(browser, port, { path: '/coach-dashboard.html' }, async function(page){
    await page.waitForFunction(function(){
      return !!(window.__coachLogTest && window.CoachInsights && window.CoachInsights.TERRAIN_TYPES);
    }, null, { timeout: 30000 });
    await page.evaluate(function(){
      window.__coachLogTest.arm({
        token: 'test-token',
        athleteId: 'ath-1',
        athleteLabel: 'Jordan',
        coachUser: { id: 'coach-1' }
      }, { zone: 'learning', activationTouched: true, activationScore: 7 });
    });
    await page.waitForSelector('#coach-log-overlay.open #clog-terrains button', { timeout: 8000 });
    const chips = await page.evaluate(function(){
      return Array.prototype.map.call(
        document.querySelectorAll('#clog-terrains button'),
        function(btn){ return btn.getAttribute('data-terrain'); }
      );
    });
    assert.deepStrictEqual(chips, ATHLETE_SEVEN, 'form chips must be the 7 terrains, got ' + JSON.stringify(chips));
    assert.ok(chips.indexOf('Arête') !== -1);
    assert.ok(chips.indexOf('Dihedral') !== -1);
  });
  console.log('coach-terrain-catalog-parity tests: ok');
}finally{
  await browser.close();
  await new Promise(function(resolve){ server.close(resolve); });
}
