import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

const ZONE_HELP = "The percent of that week's sessions rated Comfort, Learning, or Panic. Every session gets exactly one rating, so the three lines add up to about 100% each week. A zone with no line means no sessions were logged in it during these 12 weeks. Comfort/Learning/Panic come from the athlete's own in-the-moment activation rating, not from grade or send/fall outcome.";
const BOULDER_HELP = "Hardest send each week on that terrain, on the V-scale. A filled dot is a week with at least one send; a hollow dot is attempt only. A solid line joins consecutive weeks; a dashed line joins across up to 4 weeks without a log. A lone point stays a dot. Descriptive only — not a cause-and-effect read.";
const ROPED_HELP = "Hardest send each week on that terrain, on this athlete's usual roped grade scale, filtered by the discipline chips above (Lead / Top Rope / Auto Belay). A filled dot is a week with at least one send; a hollow dot is attempt only. A solid line joins consecutive weeks; a dashed line joins across up to 4 weeks without a log. A lone point stays a dot. Descriptive only — not a cause-and-effect read.";
const BOULDER_TITLE = 'Hardest send by terrain — V-scale';

function toJsLiteral(s){
  return "'" + s.replace(/'/g, "\\'") + "'";
}

assert.ok(/function insightChartTitleWithHelp\(title, helpText\)/.test(dash), 'shared helper must exist');
assert.strictEqual((dash.match(/function insightChartTitleWithHelp/g) || []).length, 1, 'one helper, not three copies');

const helperMatch = dash.match(/function insightChartTitleWithHelp\(title, helpText\)\{[\s\S]*?\n  \}/);
assert.ok(helperMatch, 'can extract insightChartTitleWithHelp');
assert.ok(!/\bopen\b/.test(helperMatch[0]), 'helper must not set the open attribute');
assert.ok(/<details class="insight-chart-help">/.test(helperMatch[0]));
assert.ok(/<summary>' \+ escapeHtml\(title\) \+ '<\/summary>/.test(helperMatch[0]));
assert.ok(/<div>' \+ escapeHtml\(helpText\) \+ '<\/div>/.test(helperMatch[0]));

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
const insightChartTitleWithHelp = new Function(
  'escapeHtml',
  'return ' + helperMatch[0]
)(escapeHtml);

function assertCollapsedDetails(html, title, help){
  assert.ok(html.startsWith('<details class="insight-chart-help">'), title + ' wraps in details');
  assert.ok(!/\sopen(=|\s|>)/.test(html), title + ' starts collapsed');
  assert.ok(!/^<details[^>]*\sopen\b/.test(html), title + ' details tag has no open');
  assert.ok(html.includes('<summary>' + escapeHtml(title) + '</summary>'), title + ' is the summary');
  const body = html.match(/<div>([\s\S]*?)<\/div>/);
  assert.ok(body, title + ' has explainer div');
  assert.strictEqual(body[1], escapeHtml(help), title + ' explainer is the escaped verbatim string');
}

assertCollapsedDetails(insightChartTitleWithHelp('Zone share (%)', ZONE_HELP), 'Zone share (%)', ZONE_HELP);
assertCollapsedDetails(insightChartTitleWithHelp(BOULDER_TITLE, BOULDER_HELP), BOULDER_TITLE, BOULDER_HELP);
assertCollapsedDetails(insightChartTitleWithHelp('Hardest send by terrain — YDS', ROPED_HELP), 'Hardest send by terrain — YDS', ROPED_HELP);

assert.ok(dash.includes(toJsLiteral(ZONE_HELP)), 'zone help is in source verbatim');
assert.ok(dash.includes(toJsLiteral(BOULDER_HELP)), 'boulder help is in source verbatim');
assert.ok(dash.includes(toJsLiteral(ROPED_HELP)), 'roped help is in source verbatim');

const zoneCall = dash.match(/insightChartTitleWithHelp\(\s*'Zone share \(%\)',\s*'((?:\\'|[^'])*)'/);
assert.ok(zoneCall, 'Zone share uses the helper');
assert.strictEqual(zoneCall[1].replace(/\\'/g, "'"), ZONE_HELP);

const boulderCall = dash.match(/renderGradeFamilyChartHtml\(\s*'Hardest send by terrain — V-scale',[\s\S]*?((?:\\'|[^'])*)'\s*\)/);
assert.ok(boulderCall, 'Boulder chart still rendered via renderGradeFamilyChartHtml');
assert.ok(dash.slice(dash.indexOf("renderGradeFamilyChartHtml(\n      'Hardest send by terrain — V-scale'")).includes(toJsLiteral(BOULDER_HELP)));

const ropedIdx = dash.indexOf("renderGradeFamilyChartHtml(\n      'Hardest send by terrain — ' + (series.ropedSystemLabel || 'roped grades')");
assert.ok(ropedIdx !== -1, 'Roped chart still rendered via renderGradeFamilyChartHtml');
assert.ok(dash.slice(ropedIdx, ropedIdx + 1600).includes(toJsLiteral(ROPED_HELP)));
assert.ok(dash.slice(ropedIdx, ropedIdx + 1600).includes('ropedFilterChipsHtml(series.ropedDiscipline)'));

const BANNED = /\b(suggests|indicates|should|target|ideal)\b/i;
[ZONE_HELP, BOULDER_HELP, ROPED_HELP].forEach(function(s, i){
  assert.ok(!BANNED.test(s), 'evaluative/causal language in help string ' + i + ': ' + s);
});

assert.ok(/renderSharedAxisSvg\(/.test(dash));
assert.ok(/class="insight-svg"/.test(dash));
assert.ok(/class="insight-legend"/.test(dash));
assert.ok(/data-roped-filter/.test(dash));
assert.ok(/function wireRopedDisciplineChips/.test(dash));
assert.ok(/host\.innerHTML = renderProgressPanelHtml\(rows\)/.test(dash));
assert.ok(/function renderGapPanelHtml/.test(dash));
assert.ok(/<div class="insight-chart-title">Zone mix by terrain<\/div>/.test(dash), 'gap panel title stays a plain title');
assert.ok(!/renderGapPanelHtml[\s\S]{0,1200}insightChartTitleWithHelp/.test(dash));
assert.ok(/\.insight-chart-help > summary::before\{content:'▸ ';\}/.test(dash));
assert.ok(/\.insight-chart-help\[open\] > summary::before\{content:'▾ ';\}/.test(dash));
assert.ok(/\.completed-group summary::before\{content:'▸ ';\}/.test(dash));

console.log('coach-progress-chart-help tests: ok');
