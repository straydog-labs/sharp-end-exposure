import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

assert.ok(/id="coach-guide-link"/.test(dash));
assert.ok(/Guide \/ Help/.test(dash));
assert.ok(/href="https:\/\/straydog-labs\.github\.io\/see-guide-site\/coach-guide\.html"/.test(dash));
assert.ok(/id="coach-guide-link"[^>]*target="_blank"/.test(dash));
assert.ok(/id="coach-guide-link"[^>]*rel="noopener"/.test(dash));
assert.ok(/<div id="topbar">[\s\S]*id="coach-guide-link"/.test(dash));
assert.ok(!/wes\s*shih|jessica\.somos/i.test(dash.match(/id="coach-guide-link"[\s\S]{0,200}/)[0]));

const tile = dash.match(/id="coach-guide-tile"[^>]*>[\s\S]*?<\/a>/);
assert.ok(tile, 'sidebar Coach guide tile exists');
assert.ok(/href="https:\/\/straydog-labs\.github\.io\/see-guide-site\/coach-guide\.html"/.test(tile[0]));
assert.ok(/target="_blank"/.test(tile[0]));
assert.ok(/rel="noopener"/.test(tile[0]));
assert.ok(/Coach guide/.test(tile[0]));
assert.ok(/id="coach-guide-section"/.test(dash));
assert.ok(/id="coach-guide-tip-replay"/.test(dash));
assert.ok(/id="coach-tip-coach-guide"/.test(dash));
assert.ok(/id="coach-tip-coach-guide-dismiss"/.test(dash));
assert.ok(/wireCoachGuideTip/.test(dash));
assert.ok(/COACH_TIPS\['coach-guide'\]/.test(dash));
assert.ok(/markCoachTipSeen\('coach-guide'\)/.test(dash));

const rosterMarkup = dash.match(/id="roster-panel">' \+[\s\S]*id="add-athlete-section"/);
assert.ok(rosterMarkup, 'roster panel markup found');
const guideAt = rosterMarkup[0].indexOf('id="coach-guide-section"');
const statsAt = rosterMarkup[0].indexOf('id="roster-stats"');
const gymAt = rosterMarkup[0].indexOf('id="open-gym-climbs"');
const addAt = rosterMarkup[0].indexOf('id="add-athlete-section"');
assert.ok(guideAt !== -1 && guideAt < statsAt, 'Coach guide sits above roster stats');
assert.ok(guideAt < gymAt && guideAt < addAt, 'Coach guide sits above gym catalog and Add an athlete');

console.log('coach-guide-link tests: ok');
