import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

const render = dash.match(/function renderAthleteDetail\([\s\S]*?\n  var _coachLogState/);
assert.ok(render, 'renderAthleteDetail extracted');
const landing = render[0].match(/'<div id="athlete-landing">'[\s\S]*?'<\/div>' \+\s*'<div id="athlete-subview"/);
assert.ok(landing, 'athlete-landing concatenation');
const html = landing[0];

const recentAt = html.indexOf('id="athlete-recent-sessions"');
const dividerAt = html.indexOf('landing-snapshot-divider');
const snapAt = html.indexOf('id="athlete-share-block"');
const titleAt = html.indexOf('athlete-snapshot-title');
assert.ok(recentAt !== -1 && dividerAt !== -1 && snapAt !== -1, 'divider sits in the landing');
assert.ok(recentAt < dividerAt && dividerAt < snapAt && snapAt < titleAt,
  'divider is above the Athlete snapshot and below Recent sessions');
assert.ok(/class="landing-snapshot-divider"/.test(html));
assert.ok(/\.landing-snapshot-divider\s*\{[^}]*border-top:\s*1px solid/.test(dash));
assert.ok(/\.landing-snapshot-divider\s*\{[^}]*margin-top:\s*1[68]px/.test(dash));
assert.ok(/#athlete-landing > #athlete-share-block\s*\{[^}]*margin-top:\s*1[68]px/.test(dash));
assert.ok(/#athlete-landing > \.landing-block\s*\{[^}]*margin-top:\s*1[68]px/.test(dash));

assert.ok(/>Print \/ Share snapshot</.test(html), 'button label is Print / Share snapshot');
assert.ok(!/>Print \/ Share</.test(html), 'old Print / Share label is gone');

const printCss = dash.match(/@media print \{[\s\S]*?\n  \}/);
assert.ok(printCss, '@media print stylesheet');
assert.ok(/#athlete-open-assignments,[\s\S]*?#athlete-recent-sessions,[\s\S]*?display:\s*none\s*!important/.test(printCss[0]),
  'print hides Open assignments and Recent sessions');
assert.ok(/\.landing-snapshot-divider/.test(printCss[0]));
assert.ok(!/#athlete-share-block\s*\{[^}]*display:\s*none/.test(printCss[0]),
  'snapshot block stays in print');

const rowFn = dash.match(/function landingSessionRowHtml\(item\)\{[\s\S]*?\n  \}/);
assert.ok(rowFn, 'landingSessionRowHtml');
assert.ok(/Assignment: /.test(rowFn[0]), 'linked assignment uses Assignment: label');
assert.ok(/landing-session-time/.test(rowFn[0]));
assert.ok(/landing-session-blocks/.test(rowFn[0]));
assert.ok(/blocksDone/.test(rowFn[0]));
assert.ok(/kind !== 'training'/.test(rowFn[0]) || /item\.kind === 'training'/.test(rowFn[0]),
  'time and blocks are training-only');
assert.ok(/landing-chevron/.test(rowFn[0]));
assert.ok(/tap \? '<span class="landing-chevron"/.test(rowFn[0]), 'chevron only on tappable rows');

const assignFn = dash.match(/function landingAssignRowHtml\(a\)\{[\s\S]*?\n  \}/);
assert.ok(assignFn && /landing-chevron/.test(assignFn[0]), 'open assignment rows show a chevron');

console.log('coach-landing-polish tests: ok');
