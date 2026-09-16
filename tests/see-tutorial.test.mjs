import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const index = readFileSync(join(__dirname, '../index.html'), 'utf8');
const staging = readFileSync(join(__dirname, '../index-staging.html'), 'utf8');
const sw = readFileSync(join(__dirname, '../sw.js'), 'utf8');
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index262'/.test(index));
assert.ok(/APP_VERSION = 'index262'/.test(sw));

const betaCard = index.match(/id="profile-card-beta"[\s\S]*?<\/button>/)[0];
assert.ok(/SEE tutorial/.test(betaCard));
assert.ok(!/Help & Guides/.test(betaCard));

const betaScreen = index.match(/id="screen-profile-beta"[\s\S]*?id="screen-profile-feedback"/)[0];
assert.ok(/screen-title">SEE tutorial/.test(betaScreen));
assert.ok(!/Help & Guides/.test(betaScreen));

const athleteTile = index.match(/id="profile-beta-athlete-guide"[\s\S]*?<\/a>/)[0];
assert.ok(/SEE tutorial/.test(athleteTile));
assert.ok(!/User guide/.test(athleteTile));
assert.ok(/href="https:\/\/straydog-labs\.github\.io\/see-guide-site\/athlete-guide\.html"/.test(athleteTile));

const anonTile = index.match(/id="profile-card-guide-anon"[\s\S]*?<\/a>/)[0];
assert.ok(/SEE tutorial/.test(anonTile));
assert.ok(!/Guide \/ Help/.test(anonTile));
assert.ok(/href="https:\/\/straydog-labs\.github\.io\/see-guide-site\/athlete-guide\.html"/.test(anonTile));

assert.ok(/You can turn these tips off any time from SEE tutorial\./.test(index));
assert.ok(!/You can turn these tips off any time from Help\./.test(index));

const coachLink = dash.match(/id="coach-guide-link"[\s\S]*?<\/a>/)[0];
assert.ok(/Guide \/ Help/.test(coachLink));
assert.ok(/Coach guide/.test(dash.match(/id="coach-guide-tile"[\s\S]*?<\/a>/)[0]));

console.log('see-tutorial tests: ok');
