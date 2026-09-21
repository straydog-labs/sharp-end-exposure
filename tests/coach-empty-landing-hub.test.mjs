import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

assert.ok(!/Select an athlete from the roster to get started/.test(dash), 'blank stub is gone');
assert.ok(/id="empty-landing-actions"/.test(dash));
assert.ok(/id="empty-landing-add-athlete"/.test(dash) && />Add athlete</.test(dash));
assert.ok(/id="empty-landing-gym-climbs"/.test(dash) && />Gym climb catalog</.test(dash));
assert.ok(/empty-landing-add-athlete[\s\S]{0,800}empty-landing-gym-climbs/.test(dash));
assert.ok(!/id="empty-landing[\s\S]{0,1200}Log a climb/.test(
  dash.match(/id="empty-landing-actions"[\s\S]{0,1200}/)[0]
), 'empty landing has no Log a climb action');

assert.ok(/getElementById\('empty-landing-gym-climbs'\)[\s\S]{0,250}openGymClimbsCatalog\(token, user\)/.test(dash),
  'empty gym card calls openGymClimbsCatalog');
assert.ok(/getElementById\('open-gym-climbs'\)[\s\S]{0,200}openGymClimbsCatalog\(token, user\)/.test(dash),
  'sidebar gym catalog button still wired');
const addHandler = dash.match(/getElementById\('empty-landing-add-athlete'\)[\s\S]{0,500}/);
assert.ok(addHandler && /add-athlete-section/.test(addHandler[0]) && /scrollIntoView/.test(addHandler[0]));

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
const hub = idx('athlete-hub-cards');
const log = idx('coach-log-launch');
const stats = idx('roster-stats');
const insights = idx('roster-insights');
const zone = idx('athlete-zone-wrap');
const progress = idx('athlete-progress-panel');
const gap = idx('athlete-gap-panel');
const projects = idx('athlete-projects-panel');
assert.ok(header < hub && hub < log && log < stats && stats < insights &&
  insights < zone && zone < progress && progress < gap && gap < projects,
  'hub cards sit after header and before log/stats/insights/projects');
assert.strictEqual((html.match(/athlete-hub-cards/g) || []).length, 1);
assert.ok(/athleteHubCardHtml\('assignments'/.test(html));
assert.ok(/athleteHubCardHtml\('chat'/.test(html));
assert.ok(/querySelectorAll\('#athlete-hub-cards \.see-card'\)/.test(render[0]));

assert.ok(/function athleteHubCardHtml\(pane, label, title, subId, subText, wide\)/.test(dash));
assert.ok(/coach-layout:not\(\.detail-open\) #detail-panel\{display:none;\}/.test(dash));

console.log('coach-empty-landing-hub tests: ok');
