import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');
const sw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../sw.js'), 'utf8');
assert.ok(/var app_version = 'index293'/.test(index));
assert.ok(/APP_VERSION = 'index293'/.test(sw));

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');
const insightsSrc = readFileSync(join(root, 'js/coach-athlete-insights.js'), 'utf8');

require(join(root, 'js/coach-athlete-insights.js'));
const CI = globalThis.CoachInsights;

function extractFn(src, name, nextName){
  const start = src.indexOf('function ' + name + '(');
  const end = nextName ? src.indexOf('function ' + nextName + '(', start + 1) : src.length;
  assert.ok(start >= 0 && end > start, 'extract ' + name);
  return src.slice(start, end);
}

const screenCss = dash.slice(0, dash.indexOf('@media print'));
assert.ok(/\.insight-panel\{\s*background:var\(--bg\);border:1px solid var\(--border\);border-radius:16px;\s*padding:16px 14px;margin:14px 0 0;/.test(screenCss.replace(/\n/g, '')),
  'on-screen insight-panel spacing unchanged');
assert.ok(!/\.insight-chart-unit\{/.test(screenCss), 'chart-unit wrapper has no on-screen style');
assert.ok(/\.insight-svg\{width:100%;height:auto;display:block;\}/.test(screenCss.replace(/\n/g, '')),
  'on-screen SVG sizing unchanged');
assert.ok(/\.gap-headline\.comfort\{color:var\(--comfort\);\}/.test(screenCss.replace(/\n/g, '')),
  'on-screen gap-headline tokens unchanged');

const printCss = dash.match(/@media print \{[\s\S]*?\n  \}/);
assert.ok(printCss, '@media print stylesheet');
assert.ok(!/\.insight-panel\s*\{[^}]*break-inside:\s*avoid/.test(printCss[0]));
assert.ok(/\.roster-stat,\s*\.athlete-zone-wrap\s*\{[\s\S]*break-inside:\s*avoid/.test(printCss[0]));
assert.ok(/\.insight-chart-unit,\s*\.gap-terrain-row\s*\{[\s\S]*break-inside:\s*avoid/.test(printCss[0]));
assert.ok(/break-after:\s*avoid/.test(printCss[0]));
assert.ok(/\.insight-chart-help\s*>\s*summary/.test(printCss[0]));
assert.ok(/\.roped-filter/.test(printCss[0]) && /display:\s*none/.test(printCss[0]));
assert.ok(/\.insight-chart-empty/.test(printCss[0]));
assert.ok(/\.gap-headline[\s\S]*#111/.test(printCss[0]));
assert.ok(/max-height:\s*110px/.test(printCss[0]));
assert.ok(/insight-panel-head/.test(dash), 'each panel title+note wraps in insight-panel-head');
assert.ok(/\.insight-panel-head\s*\{[\s\S]*break-after:\s*avoid/.test(printCss[0]),
  'panel head stays with the next unit');
assert.ok(/#athlete-progress-body\s*>\s*:first-child/.test(printCss[0]) &&
  /#athlete-psyche-volume-body\s*>\s*:first-child/.test(printCss[0]) &&
  /break-before:\s*avoid/.test(printCss[0]),
  'first content unit cannot start on the next page without its title');
assert.ok((dash.match(/class="insight-panel-head"/g) || []).length >= 4,
  'progress, training, psyche, and gap each have a keep-together head');

function assertNoOrphanedPanelHeads(pages, label){
  const TITLES = [
    'PROGRESS OVER TIME',
    'TRAINING VOLUME',
    'PSYCHE PRACTICE',
    "WHERE'S THE GAP?",
    'ZONE MIX'
  ];
    const FIRST = [
    'LOGGED SESSION',
    'LOGGED PSYCHE',
    'LOGGED TRAINING',
    'NO LOGGED',
    'ZONE SHARE',
    'SESSIONS PER WEEK',
    'PSYCHE PRACTICES PER WEEK',
    'MOST COMFORTABLE',
    'LEAST COMFORTABLE',
    'ONLY LOGGED TERRAIN',
    'BOTH PEAK',
    'ZONE MIX BY TERRAIN',
    'NO SESSIONS WITH',
    'NO ZONE-TAGGED',
    'SHARE OF THIS ATHLETE'
  ];
  pages.forEach(function(page, i){
    const lastBand = page.pageH * 0.85;
    (page.blocks || []).forEach(function(b){
      const text = String(b.text || '').replace(/\s+/g, ' ').trim().toUpperCase();
      const isTitle = TITLES.some(function(t){ return text === t || text.indexOf(t) === 0; });
      if(!isTitle) return;
      if(b.y1 < lastBand) return;
      const hasFirst = (page.blocks || []).some(function(c){
        if(c === b) return false;
        if(c.y0 < b.y0 - 2) return false;
        const ct = String(c.text || '').replace(/\s+/g, ' ').toUpperCase();
        return FIRST.some(function(f){ return ct.indexOf(f) !== -1; });
      });
      assert.ok(hasFirst,
        label + ' page ' + (i + 1) + ' title/note ends in the last 15% without its first content unit: ' + text);
    });
  });
}

const orphanPages = [
  {
    pageH: 1000,
    blocks: [
      { text: 'Psyche practice', y0: 900, y1: 920 },
      { text: 'Descriptive only', y0: 930, y1: 960 }
    ]
  }
];
let orphanFailed = false;
try {
  assertNoOrphanedPanelHeads(orphanPages, 'synthetic');
} catch (e) {
  orphanFailed = /last 15%/.test(String(e.message || e));
}
assert.ok(orphanFailed, 'orphan checker flags a title parked in the last 15% without its body');
assertNoOrphanedPanelHeads([{
  pageH: 1000,
  blocks: [
    { text: 'Psyche practice', y0: 900, y1: 920 },
    { text: '8 logged psyche practices in this window.', y0: 930, y1: 950 }
  ]
}], 'synthetic-ok');

assert.ok(/function shareAthleteLandingPrint/.test(dash));
assert.ok(/window\.print\(\)/.test(dash));

const gradeFn = extractFn(dash, 'renderGradeFamilyChartHtml', 'ropedFilterChipsHtml');
assert.ok(/insight-chart-unit insight-chart-empty/.test(gradeFn));
assert.ok(/'<div class="insight-chart-unit">'\s*\+/.test(gradeFn) || /"<div class=\\"insight-chart-unit\\">"/.test(gradeFn));
assert.ok(/renderSharedAxisSvg\(seriesList\.map/.test(gradeFn), 'grade chart still draws the same SVG');

const zoneFn = extractFn(dash, 'renderProgressPanelHtml', 'renderTrainingVolumePanelHtml');
assert.ok(/insight-chart-unit/.test(zoneFn));
assert.ok(/p\.zones\[z\.key\] > 0/.test(zoneFn), 'zone-share logged check unchanged');
assert.ok(!/insight-chart-empty/.test(zoneFn), 'Zone share is never marked empty-hide');

assert.ok(/class="gap-terrain-row"/.test(extractFn(dash, 'renderGapPanelHtml', 'openGymClimbsCatalog')));

assert.ok(/function computeProgressSeries\(sessions, options\)/.test(insightsSrc));

function harness(){
  const ctx = {
    window: { CoachInsights: CI },
    _ropedDisciplineFilter: 'all',
    ZONE_KEYS: ['comfort', 'learning', 'panic'],
    ZONE_CAP: { comfort: 'Comfort', learning: 'Learning', panic: 'Panic' },
    TERRAIN_LINE_COLOR: {
      Slab: '#8ec8d8',
      Vertical: '#c4b5e0',
      Overhang: '#e8a072',
      Roof: '#d4a0c8',
      Crack: '#a8c47a'
    },
    escapeHtml: function(s){
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };
  ctx.zoneBarSegsHtml = new Function('ZONE_KEYS', 'ZONE_CAP',
    'return ' + extractFn(dash, 'zoneBarSegsHtml', 'zoneBarLegendHtml')
  )(ctx.ZONE_KEYS, ctx.ZONE_CAP);
  vm.createContext(ctx);
  vm.runInContext(
    extractFn(dash, 'insightSvgPolyline', 'insightSvgDots') +
    extractFn(dash, 'insightSvgDots', 'renderSharedAxisSvg') +
    extractFn(dash, 'renderSharedAxisSvg', 'insightChartTitleWithHelp') +
    extractFn(dash, 'insightChartTitleWithHelp', 'renderGradeFamilyChartHtml') +
    extractFn(dash, 'renderGradeFamilyChartHtml', 'ropedFilterChipsHtml') +
    extractFn(dash, 'ropedFilterChipsHtml', 'wireRopedDisciplineChips') +
    extractFn(dash, 'renderProgressPanelHtml', 'renderTrainingVolumePanelHtml') +
    extractFn(dash, 'renderTrainingVolumePanelHtml', 'renderPsycheVolumePanelHtml') +
    extractFn(dash, 'renderPsycheVolumePanelHtml', 'renderGapPanelHtml') +
    extractFn(dash, 'renderGapPanelHtml', 'openGymClimbsCatalog'),
    ctx
  );
  return ctx;
}

function daysAgo(n){
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const terrains = ['Slab', 'Vertical', 'Overhang', 'Roof', 'Crack'];
const zones = ['comfort', 'learning', 'panic'];
const boulder = ['V2', 'V3', 'V4', 'V5'];
const roped = ['5.10a', '5.10b', '5.10c', '5.11a'];
const disc = ['Sport', 'Top Rope', 'Boulder'];

const thirty = [];
for(let i = 0; i < 30; i++){
  const boulderSession = i % 3 !== 0;
  thirty.push({
    created_at: daysAgo(2 + i * 2),
    zone: zones[i % 3],
    grade_value: boulderSession ? boulder[i % boulder.length] : roped[i % roped.length],
    climbing_type: terrains[i % terrains.length],
    discipline: boulderSession ? 'Boulder' : disc[i % 2],
    is_checkin: false
  });
}
const one = [thirty[0]];
const none = [];

const ctx = harness();
const html30 = vm.runInContext('renderProgressPanelHtml(' + JSON.stringify(thirty) + ')', ctx);
const html1 = vm.runInContext('renderProgressPanelHtml(' + JSON.stringify(one) + ')', ctx);
const html0 = vm.runInContext('renderProgressPanelHtml(' + JSON.stringify(none) + ')', ctx);
const gap30 = vm.runInContext('renderGapPanelHtml(' + JSON.stringify(thirty) + ')', ctx);
const vol30 = vm.runInContext('renderTrainingVolumePanelHtml(' + JSON.stringify(
  thirty.map(function(s, i){ return { started_at: s.created_at, created_at: s.created_at }; })
) + ')', ctx);
const psy30 = vm.runInContext('renderPsycheVolumePanelHtml(' + JSON.stringify(
  thirty.slice(0, 8).map(function(s){ return { created_at: s.created_at, is_checkin: true }; })
) + ',' + JSON.stringify([]) + ')', ctx);

assert.ok(/30 logged sessions/.test(html30));
assert.ok(/insight-chart-unit/.test(html30));
assert.ok(/Zone share/.test(html30));
assert.ok(!/insight-chart-empty/.test(html30.match(/insight-chart-unit[\s\S]*?Zone share[\s\S]*?<\/div>\s*<div class="insight-legend">[\s\S]*?<\/div>\s*<\/div>/) || ['']),
  'Zone share unit is not empty-hidden');
assert.ok(/<div class="insight-chart-unit">[\s\S]*Zone share/.test(html30));
assert.ok(/Bouldering/.test(html30) && /Roped climbing/.test(html30));
assert.ok((html30.match(/insight-chart-unit/g) || []).length >= 3);
assert.ok(!/insight-chart-empty/.test(html30), 'typical 30-session athlete has boulder + roped data');

assert.ok(/1 logged session/.test(html1));
assert.ok(/insight-chart-unit/.test(html1));
assert.ok(/insight-chart-empty/.test(html1), 'the unused family is marked empty for print hide');
assert.ok(/Zone share/.test(html1));
assert.ok(!/insight-chart-empty[\s\S]{0,80}Zone share/.test(html1));

assert.ok(/No logged climb sessions in the last 12 weeks/.test(html0));
assert.ok(!/insight-chart-empty/.test(html0), 'panel-level empty is not an insight-chart-empty hide');
assert.ok(!/Zone share/.test(html0));

assert.ok(/gap-terrain-row/.test(gap30));
assert.ok((gap30.match(/gap-terrain-row/g) || []).length >= 2);
assert.ok(/gap-headline/.test(gap30));
assert.ok(/insight-chart-unit/.test(vol30));
assert.ok(/insight-chart-unit/.test(psy30));
assert.ok(!/insight-chart-empty/.test(vol30));
assert.ok(!/insight-chart-empty/.test(psy30));

const emptyBoulder = vm.runInContext(
  'renderGradeFamilyChartHtml("Bouldering", [], { ticks: [] }, [], "No bouldering sessions in this window.", "", "", "help")',
  ctx
);
assert.ok(/insight-chart-unit insight-chart-empty/.test(emptyBoulder));
assert.ok(/No bouldering sessions in this window/.test(emptyBoulder));

const pdfDir = process.env.SHARE_PRINT_PDF_DIR;
if(pdfDir){
  const { spawnSync } = await import('child_process');
  const { existsSync } = await import('fs');
  ['30', '1', '0'].forEach(function(n){
    const pdf = join(pdfDir, 'share-print-' + n + '.pdf');
    assert.ok(existsSync(pdf), 'missing print PDF ' + pdf);
    const py = [
      'import json,sys,pymupdf',
      'doc=pymupdf.open(sys.argv[1])',
      'pages=[]',
      'for page in doc:',
      '    blocks=[]',
      '    for b in page.get_text("blocks"):',
      '        blocks.append({"text":b[4],"y0":b[1],"y1":b[3]})',
      '    pages.append({"pageH":page.rect.height,"blocks":blocks})',
      'print(json.dumps(pages))'
    ].join('\n');
    const r = spawnSync('python3', ['-c', py, pdf], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, 'pdf extract failed: ' + (r.stderr || r.stdout));
    assertNoOrphanedPanelHeads(JSON.parse(r.stdout), n + '-session PDF');
  });
}

console.log('coach-share-print-layout tests: ok');
