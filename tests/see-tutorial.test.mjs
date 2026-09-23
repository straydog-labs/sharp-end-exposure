import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index268'/.test(index));
assert.ok(/APP_VERSION = 'index268'/.test(sw));
assert.ok(!/see-guide-site/.test(index));
assert.ok(!/see-guide-site/.test(dash));

const betaCard = index.match(/id="profile-card-beta"[\s\S]*?<\/button>/)[0];
assert.ok(/SEE tutorial/.test(betaCard));
assert.ok(!/Help & Guides/.test(betaCard));

const betaScreen = index.match(/id="screen-profile-beta"[\s\S]*?id="screen-profile-feedback"/)[0];
assert.ok(/screen-title">SEE tutorial/.test(betaScreen));
assert.ok(!/Help & Guides/.test(betaScreen));

const athleteTile = index.match(/id="profile-beta-athlete-guide"[\s\S]*?<\/a>/)[0];
assert.ok(/SEE tutorial/.test(athleteTile));
assert.ok(!/User guide/.test(athleteTile));
assert.ok(/href="\/sharp-end-exposure\/guide\/athlete-guide\.html"/.test(athleteTile));

const anonTile = index.match(/id="profile-card-guide-anon"[\s\S]*?<\/a>/)[0];
assert.ok(/SEE tutorial/.test(anonTile));
assert.ok(!/Guide \/ Help/.test(anonTile));
assert.ok(/href="\/sharp-end-exposure\/guide\/athlete-guide\.html"/.test(anonTile));

assert.ok(/You can turn these tips off any time from SEE tutorial\./.test(index));
assert.ok(!/You can turn these tips off any time from Help\./.test(index));

const coachLink = dash.match(/id="coach-guide-link"[\s\S]*?<\/a>/)[0];
assert.ok(/Guide \/ Help/.test(coachLink));
assert.ok(/href="\/sharp-end-exposure\/guide\/coach-guide\.html"/.test(coachLink));
const coachTile = dash.match(/id="coach-guide-tile"[\s\S]*?<\/a>/)[0];
assert.ok(/Coach guide/.test(coachTile));
assert.ok(/href="\/sharp-end-exposure\/guide\/coach-guide\.html"/.test(coachTile));

const coachRow = index.match(/id="profile-beta-coach-row"[\s\S]*?<\/a>/)[0];
assert.ok(/href="\/sharp-end-exposure\/guide\/coach-guide\.html"/.test(coachRow));

[
  'guide/athlete-guide.html',
  'guide/coach-guide.html',
  'guide/styles.css',
  'guide/assets/athlete-home.png',
  'guide/assets/athlete-journal.png',
  'guide/assets/athlete-log-climb.png',
  'guide/assets/athlete-profile.png',
  'guide/assets/coach-add-athlete.png',
  'guide/assets/coach-gap-panel.png',
  'guide/assets/coach-log-climb-overlay.png',
  'guide/assets/coach-progress-panel.png',
  'guide/assets/coach-roster.png'
].forEach(function(rel){
  assert.ok(existsSync(join(root, rel)), 'missing ' + rel);
});

console.log('see-tutorial tests: ok');
