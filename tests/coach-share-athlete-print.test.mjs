import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

assert.ok(/id="athlete-share-btn"/.test(dash));
assert.ok(/>Share with athlete</.test(dash));
assert.ok(/id="athlete-share-block"/.test(dash));
assert.ok(/athlete-share-print-head/.test(dash));
assert.ok(/athlete-share-print-name/.test(dash));
assert.ok(/athlete-share-print-date/.test(dash));
assert.ok(/function shareAthleteLandingPrint/.test(dash));
assert.ok(/window\.print\(\)/.test(dash));
assert.ok(!/cdnjs/.test(dash));
assert.ok(!/<script[^>]+jspdf/i.test(dash) && !/<script[^>]+html2canvas/i.test(dash), 'path A — no PDF libs');

const render = dash.match(/function renderAthleteDetail\([\s\S]*?\n  var _coachLogState/);
assert.ok(render, 'renderAthleteDetail extracted');
const landing = render[0].match(/'<div id="athlete-landing">'[\s\S]*?'<\/div>' \+\s*'<div id="athlete-subview"/);
assert.ok(landing, 'athlete-landing concatenation');
const html = landing[0];
const idx = (s) => {
  const i = html.indexOf(s);
  assert.ok(i !== -1, 'missing ' + s);
  return i;
};
const header = idx('detail-header');
const shareBtn = idx('athlete-share-btn');
const hub = idx('athlete-hub-cards');
const log = idx('coach-log-launch');
const wrap = idx('athlete-share-block');
const stats = idx('roster-stats');
const zone = idx('athlete-zone-bar');
const progress = idx('athlete-progress-panel');
const volume = idx('athlete-training-volume-panel');
const psyche = idx('athlete-psyche-volume-panel');
const gap = idx('athlete-gap-panel');
assert.ok(header < shareBtn && shareBtn < hub, 'Share sits in the header, not in the hub');
assert.ok(hub < log && log < wrap && wrap < stats && stats < zone && zone < progress && progress < volume && volume < psyche && psyche < gap);
assert.ok(html.indexOf('athlete-hub-cards') < html.indexOf('athlete-share-block'));
assert.ok(html.indexOf('coach-log-launch') < html.indexOf('athlete-share-block'));
assert.ok(!/#athlete-hub-cards/.test(html.slice(html.indexOf('athlete-share-block'))),
  'hub cards are not inside the share block string after wrap start');
const wrapSlice = html.slice(wrap);
assert.ok(/Descriptive — not a cause-and-effect read/.test(wrapSlice));
assert.ok(/Descriptive only/.test(wrapSlice));
assert.ok(/athlete-training-volume-panel/.test(wrapSlice), 'volume panel is in the share export');
assert.ok(/athlete-psyche-volume-panel/.test(wrapSlice), 'psyche panel is in the share export');

const printCss = dash.match(/@media print \{[\s\S]*?\n  \}/);
assert.ok(printCss, '@media print stylesheet');
assert.ok(/#athlete-hub-cards/.test(printCss[0]));
assert.ok(/#coach-log-launch/.test(printCss[0]));
assert.ok(/#roster-panel/.test(printCss[0]));
assert.ok(/#topbar/.test(printCss[0]));
assert.ok(/#athlete-share-block/.test(printCss[0]));
assert.ok(/athlete-share-print-head/.test(printCss[0]));
assert.ok(/team-zone-note/.test(printCss[0]), 'descriptive notes stay styled in print, not hidden');
assert.ok(/print-color-adjust: exact/.test(printCss[0]));
assert.ok(/size:\s*letter/.test(printCss[0]));
assert.ok(!/#athlete-progress-panel\s*\{[^}]*display:\s*none/.test(printCss[0]));
assert.ok(/\.roster-stat,\s*\.athlete-zone-wrap\s*\{[\s\S]*?break-inside:\s*avoid/.test(printCss[0]),
  'roster-stat and athlete-zone-wrap stay unbreakable in print');
assert.ok(!/\.insight-panel\s*\{[^}]*break-inside:\s*avoid/.test(printCss[0]),
  'insight-panel must not jump whole to the next page');
assert.ok(/\.insight-chart-unit,\s*\.gap-terrain-row\s*\{[\s\S]*?break-inside:\s*avoid/.test(printCss[0]));
assert.ok(/\.team-zone-label,[\s\S]*?\.insight-chart-help\s*>\s*summary\s*\{[\s\S]*?break-after:\s*avoid/.test(printCss[0]));
assert.ok(/\.team-zone-note/.test(printCss[0]) && /break-after:\s*avoid/.test(printCss[0]));
assert.ok(/\.roped-filter,[\s\S]*?\.insight-chart-empty\s*\{[\s\S]*?display:\s*none/.test(printCss[0]));
assert.ok(/\.gap-headline[\s\S]*?color:\s*#111/.test(printCss[0]));
assert.ok(/\.insight-svg\s*\{[\s\S]*?max-height:\s*110px/.test(printCss[0]));
assert.ok(/\.insight-panel\s*\{[\s\S]*?margin:\s*6px 0 0[\s\S]*?padding:\s*8px/.test(printCss[0]));

const shareFn = dash.match(/function shareAthleteLandingPrint\(\)\{[\s\S]*?\n  function showAthleteLanding/);
assert.ok(shareFn);
assert.ok(/athleteShareExportStamp/.test(shareFn[0]));
assert.ok(/document\.title/.test(shareFn[0]));
assert.ok(/afterprint/.test(shareFn[0]));
assert.ok(/shareAthleteLandingPrint/.test(render[0]));

function extractFn(src, name, nextName){
  const start = src.indexOf('function ' + name + '(');
  const end = src.indexOf('function ' + nextName + '(', start + 1);
  assert.ok(start >= 0 && end > start, 'extract ' + name);
  return src.slice(start, end);
}

let timeoutFn = null;
const ctx = {
  _detailCtx: { athleteLabel: 'Anna' },
  document: {
    title: 'Coaching',
    getElementById: function(id){
      if(id === 'athlete-share-block') return { id: id };
      if(id === 'athlete-share-print-name') return ctx._nameEl;
      if(id === 'athlete-share-print-date') return ctx._dateEl;
      return null;
    }
  },
  window: {
    listeners: {},
    addEventListener: function(ev, fn){ this.listeners[ev] = fn; },
    removeEventListener: function(ev){ delete this.listeners[ev]; },
    print: function(){ this.printed = true; }
  },
  _nameEl: { textContent: '' },
  _dateEl: { textContent: '' },
  setTimeout: function(fn){ timeoutFn = fn; }
};
ctx.document.body = { classList: { add: function(){ ctx.added = true; }, remove: function(){ ctx.removed = true; } } };

vm.createContext(ctx);
vm.runInContext(
  'function athleteShareExportStamp(){ return "Sep 30, 2026"; }\n' +
  extractFn(dash, 'shareAthleteLandingPrint', 'showAthleteLanding').replace(
    /function athleteShareExportStamp[\s\S]*?\n  \}\n\n  function shareAthleteLandingPrint/,
    'function shareAthleteLandingPrint'
  ),
  ctx
);
vm.runInContext('shareAthleteLandingPrint()', ctx);
assert.strictEqual(ctx._nameEl.textContent, 'Anna');
assert.strictEqual(ctx._dateEl.textContent, 'Sep 30, 2026');
assert.ok(ctx.window.printed, 'calls window.print');
assert.ok(ctx.added, 'marks body while printing');
assert.ok(/Anna — Sep 30, 2026/.test(ctx.document.title));

console.log('coach-share-athlete-print tests: ok');
