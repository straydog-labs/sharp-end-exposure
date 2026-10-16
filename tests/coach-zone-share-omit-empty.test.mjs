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
assert.ok(/p\.zones && p\.zones\.panic > 0/.test(panelSrc),
  'panic legend uses raw p.zones counts');
assert.ok(/Panic: none logged/.test(panelSrc));
assert.ok(/Sessions per week, by zone/.test(panelSrc));
assert.ok(/Descriptive, not a cause-and-effect read/.test(panelSrc));
assert.ok(/p\.total \? zoneBarSegsHtml\(p\.zones/.test(panelSrc), 'week bars still use raw zone counts');
assert.ok(/series\.sessionCount/.test(panelSrc));
assert.ok(/No logged climb sessions in the last 12 weeks\./.test(panelSrc));
assert.ok(!/Stretch share/.test(panelSrc));
assert.ok(!/stretch-n-label/.test(panelSrc) && !/'n=' \+/.test(panelSrc), 'n= labels removed');
assert.ok(!/stacked|rect class="zone-week-bar"/.test(panelSrc), 'line chart, not stacked bars');

const svgSrc = extractFn(dash, 'renderSharedAxisSvg', 'insightChartTitleWithHelp');
assert.ok(/insightSvgDots/.test(svgSrc) && /insightSvgPolyline/.test(svgSrc));
assert.ok(!/zones\[/.test(svgSrc), 'renderSharedAxisSvg itself is unchanged');

assert.ok(/if\(progressEl\) progressEl\.innerHTML = renderProgressPanelHtml\(rows\)/.test(dash),
  'Share with athlete print uses this same progress HTML');
const shareBlock = dash.match(/id="athlete-share-block"[\s\S]*?id="athlete-progress-panel"/);
assert.ok(shareBlock, 'progress panel is inside the share-print block');

function countsFromSeries(series, extra){
  extra = extra || {};
  const points = (series.zonePoints || []).map(function(p){
    const z = p.zones || { comfort: 0, learning: 0, panic: 0 };
    return {
      key: p.key || '',
      label: p.label,
      comfort: z.comfort || 0,
      learning: z.learning || 0,
      panic: z.panic || 0,
      total: (z.comfort || 0) + (z.learning || 0) + (z.panic || 0),
      tooltip: 'Week of ' + p.label + ': Comfort ' + (z.comfort || 0) +
        ', Learning ' + (z.learning || 0) + ', Panic ' + (z.panic || 0)
    };
  });
  const last4 = points.slice(-4);
  const last4Comfort = last4.reduce(function(n, p){ return n + p.comfort; }, 0);
  const last4Learning = last4.reduce(function(n, p){ return n + p.learning; }, 0);
  const last4Panic = last4.reduce(function(n, p){ return n + p.panic; }, 0);
  return {
    points: points,
    noZone: extra.noZone || 0,
    panicLogged: points.some(function(p){ return p.panic > 0; }),
    last4: { comfort: last4Comfort, learning: last4Learning, panic: last4Panic },
    last4Sentence: 'Last 4 weeks: ' + last4Comfort + ' Comfort, ' + last4Learning +
      ' Learning, ' + last4Panic + ' Panic sessions.'
  };
}

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
    '  lastSeries = seriesList.map(function(s){ return { color: s.color, values: s.values.slice(), dotR: s.dotR, lineWidth: s.lineWidth }; });' +
    '  return _svg.apply(null, arguments);' +
    '};',
    ctx
  );
  return { ctx: ctx, captured: captured };
}

function renderWith(series, extra){
  const h = harness();
  const meta = countsFromSeries(series, extra);
  h.ctx.window = {
    CoachInsights: {
      computeProgressSeries: function(){ return series; },
      computeZoneWeekCounts: function(){ return meta; }
    }
  };
  const html = vm.runInContext('renderProgressPanelHtml([])', h.ctx);
  return { html: html, series: h.ctx.lastSeries, weekZones: h.captured.weekZones, meta: meta };
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

const noPanicSeries = {
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
};
const noPanic = renderWith(noPanicSeries);
assert.ok(/3 logged sessions in this window/.test(noPanic.html));
assert.strictEqual(noPanic.weekZones.length, 2);
assert.deepStrictEqual(noPanic.weekZones[0], { comfort: 1, learning: 1, panic: 0 });
assert.deepStrictEqual(noPanic.weekZones[1], { comfort: 1, learning: 0, panic: 0 });
assert.strictEqual(noPanic.series.length, 2, 'Comfort + Learning lines; Panic omitted');
assert.strictEqual(noPanic.series.map(function(s){ return s.color; }).join(','), '#7ec87a,#f5a623');
assert.ok(noPanic.series.every(function(s){ return s.color !== '#e84444'; }), 'no panic series');
assert.ok(!/#e84444/.test(noPanic.html.match(/<svg[\s\S]*<\/svg>/)[0]), 'no red line or dots');
assert.ok(/Panic: none logged/.test(noPanic.html));
assert.ok(/Sessions per week, by zone/.test(noPanic.html));
assert.strictEqual(noPanic.series[0].values.join(','), '1,1');
assert.strictEqual(noPanic.series[1].values.join(','), '1,0');
assert.ok(noPanic.series.every(function(s){ return s.dotR === 5 && s.lineWidth === 2; }));
assert.ok(/Last 4 weeks: 2 Comfort, 1 Learning, 0 Panic sessions\./.test(noPanic.html));
noPanic.series.forEach(function(s, i){
  const strip = noPanic.weekZones;
  s.values.forEach(function(v, wi){
    const key = i === 0 ? 'comfort' : 'learning';
    assert.strictEqual(v, strip[wi][key], 'line count matches strip part');
  });
});
assert.strictEqual(noPanic.series[0].values[0] + noPanic.series[1].values[0], 2);
assert.strictEqual(noPanic.series[0].values[1] + noPanic.series[1].values[1], 1);

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
assert.strictEqual(somePanic.series.length, 3, 'Panic line drawn when some week has Panic');
assert.strictEqual(somePanic.series.map(function(s){ return s.color; }).join(','), '#7ec87a,#f5a623,#e84444');
assert.strictEqual(somePanic.series[0].values.join(','), '1,1,0');
assert.strictEqual(somePanic.series[1].values.join(','), '0,0,0');
assert.strictEqual(somePanic.series[2].values.join(','), '1,0,0');
assert.ok(/#e84444/.test(somePanic.html.match(/<svg[\s\S]*<\/svg>/)[0]), 'panic line is red');
assert.ok(!/Panic: none logged/.test(somePanic.html));
assert.ok(/<span class="insight-swatch" style="background:#e84444"><\/span>Panic/.test(somePanic.html));
assert.strictEqual(somePanic.weekZones.length, 2, 'empty weeks still skip zoneBarSegsHtml');
assert.deepStrictEqual(somePanic.weekZones[0], { comfort: 1, learning: 0, panic: 1 });
assert.deepStrictEqual(somePanic.weekZones[1], { comfort: 1, learning: 0, panic: 0 });
somePanic.series[0].values.forEach(function(_, wi){
  const c = somePanic.series[0].values[wi];
  const l = somePanic.series[1].values[wi];
  const p = somePanic.series[2].values[wi];
  const stripTotal = wi < somePanic.weekZones.length
    ? somePanic.weekZones[wi].comfort + somePanic.weekZones[wi].learning + somePanic.weekZones[wi].panic
    : 0;
  assert.strictEqual(c + l + p, stripTotal, 'week ' + wi + ' C+L+P equals strip');
});
assert.ok(/Week of W1: Comfort 1, Learning 0, Panic 1/.test(somePanic.html));
assert.ok(!/n=\d/.test(somePanic.html), 'n= labels are gone');
assert.ok(!/stroke-dasharray="4 4"/.test(somePanic.html), 'zero weeks are counts, not dashed gaps');

const shownNoZone = renderWith(noPanicSeries, { noZone: 2 });
assert.ok(/2 sessions in window have no zone/.test(shownNoZone.html));
assert.ok(/data-no-zone="2"/.test(shownNoZone.html));
const hiddenNoZone = renderWith(noPanicSeries, { noZone: 0 });
assert.ok(!/sessions in window have no zone/.test(hiddenNoZone.html));
assert.ok(!/zone-week-no-zone/.test(hiddenNoZone.html));

console.log('coach-zone-share-omit-empty tests: ok');
