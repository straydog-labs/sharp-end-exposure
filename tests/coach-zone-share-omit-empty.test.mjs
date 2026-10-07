import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');

require(join(root, 'js/coach-athlete-insights.js'));
const CI = globalThis.CoachInsights;

function extractFn(src, name, nextName){
  const start = src.indexOf('function ' + name + '(');
  const end = nextName ? src.indexOf('function ' + nextName + '(', start + 1) : src.length;
  assert.ok(start >= 0 && end > start, 'extract ' + name);
  return src.slice(start, end);
}

const panelSrc = extractFn(dash, 'renderProgressPanelHtml', 'renderTrainingVolumePanelHtml');
assert.ok(/p\.zones\[z\.key\] > 0/.test(panelSrc) || /p\.zones\[zone\] > 0/.test(panelSrc),
  'logged check uses raw p.zones counts');
assert.ok(/none logged/.test(panelSrc));
assert.ok(/A zone with no line means no sessions were logged in it during these 12 weeks\./.test(panelSrc));
assert.ok(!/A 0% or missing zone just means no sessions were logged in it that week/.test(panelSrc));
assert.ok(/p\.total \? zoneBarSegsHtml\(p\.zones/.test(panelSrc), 'week bars still use raw zone counts');
assert.ok(/series\.sessionCount/.test(panelSrc));
assert.ok(/No logged climb sessions in the last 12 weeks\./.test(panelSrc));

const svgSrc = extractFn(dash, 'renderSharedAxisSvg', 'insightChartTitleWithHelp');
assert.ok(/insightSvgDots/.test(svgSrc) && /insightSvgPolyline/.test(svgSrc));
assert.ok(!/zones\[/.test(svgSrc), 'renderSharedAxisSvg itself is unchanged');

assert.ok(/if\(progressEl\) progressEl\.innerHTML = renderProgressPanelHtml\(rows\)/.test(dash),
  'Share with athlete print uses this same progress HTML');
const shareBlock = dash.match(/id="athlete-share-block"[\s\S]*?id="athlete-progress-panel"/);
assert.ok(shareBlock, 'progress panel is inside the share-print block');

function harness(){
  const captured = { series: null, weekZones: [] };
  const ctx = {
    window: { CoachInsights: CI },
    _ropedDisciplineFilter: 'all',
    lastSeries: null,
    weekZones: captured.weekZones,
    ZONE_KEYS: ['comfort', 'learning', 'panic'],
    ZONE_CAP: { comfort: 'Comfort', learning: 'Learning', panic: 'Panic' },
    escapeHtml: function(s){
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    zoneBarSegsHtml: function(counts){
      captured.weekZones.push({
        comfort: counts.comfort,
        learning: counts.learning,
        panic: counts.panic
      });
      return '<bar></bar>';
    },
    renderGradeFamilyChartHtml: function(){ return ''; },
    ropedFilterChipsHtml: function(){ return ''; }
  };
  vm.createContext(ctx);
  vm.runInContext(
    extractFn(dash, 'insightSvgPolyline', 'insightSvgDots') +
    extractFn(dash, 'insightSvgDots', 'renderSharedAxisSvg') +
    extractFn(dash, 'renderSharedAxisSvg', 'insightChartTitleWithHelp') +
    extractFn(dash, 'insightChartTitleWithHelp', 'renderGradeFamilyChartHtml') +
    panelSrc,
    ctx
  );
  vm.runInContext(
    'var _svg = renderSharedAxisSvg;' +
    'renderSharedAxisSvg = function(seriesList){' +
    '  lastSeries = seriesList.map(function(s){ return { color: s.color, values: s.values.slice() }; });' +
    '  return _svg.apply(null, arguments);' +
    '};',
    ctx
  );
  return { ctx: ctx, captured: captured };
}

function renderWith(series){
  const h = harness();
  h.ctx.window = {
    CoachInsights: {
      computeProgressSeries: function(){ return series; }
    }
  };
  const html = vm.runInContext('renderProgressPanelHtml([])', h.ctx);
  return { html: html, series: h.ctx.lastSeries, weekZones: h.captured.weekZones };
}

const EMPTY = 'No logged climb sessions in the last 12 weeks.';
const emptyHtml = renderWith({
  hasZoneTrend: false,
  hasBoulderGradeTrend: false,
  hasRopedGradeTrend: false,
  hasGradeTrend: false,
  sessionCount: 0,
  labels: [],
  zonePoints: [],
  boulderGradeSeries: [],
  ropedGradeSeries: [],
  boulderAxis: null,
  ropedAxis: null,
  ropedDiscipline: 'all',
  excludedOffSystem: 0
});
assert.ok(emptyHtml.html.indexOf(EMPTY) !== -1);
assert.ok(!/insight-legend/.test(emptyHtml.html));
assert.strictEqual(emptyHtml.series, null);

const noPanic = renderWith({
  hasZoneTrend: true,
  hasBoulderGradeTrend: false,
  hasRopedGradeTrend: false,
  hasGradeTrend: false,
  sessionCount: 3,
  labels: ['W1', 'W2'],
  zonePoints: [
    { label: 'W1', total: 2, comfort: 50, learning: 50, panic: 0, zones: { comfort: 1, learning: 1, panic: 0 } },
    { label: 'W2', total: 1, comfort: 100, learning: 0, panic: 0, zones: { comfort: 1, learning: 0, panic: 0 } }
  ],
  boulderGradeSeries: [],
  ropedGradeSeries: [],
  boulderAxis: { ticks: [] },
  ropedAxis: { ticks: [] },
  ropedDiscipline: 'all',
  excludedOffSystem: 0
});
assert.ok(/3 logged sessions in this window/.test(noPanic.html));
assert.strictEqual(noPanic.weekZones.length, 2);
assert.deepStrictEqual(noPanic.weekZones[0], { comfort: 1, learning: 1, panic: 0 });
assert.deepStrictEqual(noPanic.weekZones[1], { comfort: 1, learning: 0, panic: 0 });
assert.ok(noPanic.series.every(function(s){ return s.color !== '#e84444'; }), 'no panic series');
assert.ok(!/#e84444/.test(noPanic.html.match(/<svg[\s\S]*<\/svg>/)[0]), 'no red line or dots');
assert.ok(/Panic — none logged/.test(noPanic.html));
assert.ok(/opacity:\s*\.45/.test(noPanic.html));
assert.ok(/Comfort</.test(noPanic.html) && /Learning</.test(noPanic.html));
assert.ok(!/Comfort — none logged/.test(noPanic.html));
const learning = noPanic.series.find(function(s){ return s.color === '#f5a623'; });
assert.ok(learning, 'learning still plots');
assert.deepStrictEqual(learning.values, [50, 0], 'logged zone still plots real 0% weeks');

const somePanic = renderWith({
  hasZoneTrend: true,
  hasBoulderGradeTrend: false,
  hasRopedGradeTrend: false,
  hasGradeTrend: false,
  sessionCount: 3,
  labels: ['W1', 'W2', 'W3'],
  zonePoints: [
    { label: 'W1', total: 2, comfort: 50, learning: 0, panic: 50, zones: { comfort: 1, learning: 0, panic: 1 } },
    { label: 'W2', total: 1, comfort: 100, learning: 0, panic: 0, zones: { comfort: 1, learning: 0, panic: 0 } },
    { label: 'W3', total: 0, comfort: 0, learning: 0, panic: 0, zones: { comfort: 0, learning: 0, panic: 0 } }
  ],
  boulderGradeSeries: [],
  ropedGradeSeries: [],
  boulderAxis: { ticks: [] },
  ropedAxis: { ticks: [] },
  ropedDiscipline: 'all',
  excludedOffSystem: 0
});
const panic = somePanic.series.find(function(s){ return s.color === '#e84444'; });
assert.ok(panic, 'panic series included when any week has a nonzero count');
assert.deepStrictEqual(panic.values, [50, 0, null]);
assert.ok(/#e84444/.test(somePanic.html.match(/<svg[\s\S]*<\/svg>/)[0]));
assert.ok(!/Panic — none logged/.test(somePanic.html));
assert.ok(/Learning — none logged/.test(somePanic.html), 'unlogged learning stays in the legend');
assert.strictEqual(somePanic.weekZones.length, 2, 'empty weeks still skip zoneBarSegsHtml');
assert.deepStrictEqual(somePanic.weekZones[0], { comfort: 1, learning: 0, panic: 1 });
assert.deepStrictEqual(somePanic.weekZones[1], { comfort: 1, learning: 0, panic: 0 });

const roundedZero = renderWith({
  hasZoneTrend: true,
  hasBoulderGradeTrend: false,
  hasRopedGradeTrend: false,
  hasGradeTrend: false,
  sessionCount: 401,
  labels: ['W1'],
  zonePoints: [
    {
      label: 'W1', total: 401, comfort: 100, learning: 0, panic: 0,
      zones: { comfort: 400, learning: 0, panic: 1 }
    }
  ],
  boulderGradeSeries: [],
  ropedGradeSeries: [],
  boulderAxis: { ticks: [] },
  ropedAxis: { ticks: [] },
  ropedDiscipline: 'all',
  excludedOffSystem: 0
});
assert.ok(roundedZero.series.some(function(s){ return s.color === '#e84444'; }),
  'raw count > 0 includes the zone even when rounded percent is 0');

console.log('coach-zone-share-omit-empty tests: ok');
