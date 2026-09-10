import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const index = readFileSync(join(__dirname, '../index.html'), 'utf8');
const staging = readFileSync(join(__dirname, '../index-staging.html'), 'utf8');
const sw = readFileSync(join(__dirname, '../sw.js'), 'utf8');
const sql = readFileSync(join(__dirname, '../sql/sessions-zone-confirmed-by-athlete.sql'), 'utf8');
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index256'/.test(index));
assert.ok(/APP_VERSION = 'index256'/.test(sw));

assert.ok(/id="fnav-mental"/.test(index));
assert.ok(/showScreen\('screen-drill'\)/.test(index.match(/id="fnav-mental"[\s\S]{0,400}/)[0]));
assert.ok(/<\/svg>\s*Psyche\s*</.test(index.match(/id="fnav-mental"[\s\S]{0,400}/)[0]));
assert.ok(/<\/svg>\s*Climb\s*</.test(index.match(/id="fnav-sessions"[\s\S]{0,400}/)[0]));
assert.ok(!/<\/svg>\s*Climb Log\s*</.test(index.match(/id="fnav-sessions"[\s\S]{0,400}/)[0]));
assert.ok(!/id="fnav-drill"/.test(index));
assert.ok(!/id="home-card-drill"/.test(index));
assert.ok(/font-size:26px;font-weight:700;letter-spacing:-.02em;margin-bottom:6px;">Psyche</.test(index));
assert.ok(/← Psyche/.test(index));
assert.ok(!/← Mental/.test(index));
assert.ok(/Psyche has three practices you can run any time: a quick check-in, a full pre-climb sequence, or a guided Exposure Drill\./.test(index));
assert.ok(!/Mental has three practices/.test(index));
assert.ok(!/Drill has three practices/.test(index));
assert.ok(/'screen-drill':'fnav-mental'/.test(index));
assert.ok(/'screen-drill-reveal':'fnav-mental'/.test(index));
assert.ok(/'screen-drill-hold':'fnav-mental'/.test(index));
assert.ok(/'screen-prepare-climb':'fnav-mental'/.test(index));
assert.ok(/'screen-prepare-result':'fnav-mental'/.test(index));
assert.ok(/function startPrepare\(/.test(index));
assert.ok(/function startPrepareClimb\(/.test(index));
assert.ok(/function startExposureDrill\(/.test(index));
assert.ok(/var drillState/.test(index) || /drillState=/.test(index));
assert.ok(/id="screen-drill"/.test(index));

assert.ok(/add column if not exists zone_confirmed_by_athlete boolean not null default false/.test(sql));
assert.ok(/alter table public.sessions/.test(sql));
assert.ok(!/drop column/i.test(sql));
assert.ok(!/insert into public.sessions/i.test(sql));

assert.ok(/id="screen-coach-zone-confirm"/.test(index));
assert.ok(/id="coach-zone-confirm-gauge"/.test(index));
assert.ok(/Set your own read/.test(index));
assert.ok(/function zoneToScore\(/.test(index));
assert.ok(/function sessionNeedsAthleteZoneRead\(/.test(index));
assert.ok(/function loggedByCoachTagHtml\(/.test(index));
assert.ok(/function openCoachZoneConfirm\(/.test(index));
assert.ok(/function saveCoachZoneConfirm\(/.test(index));
assert.ok(/\(edited by you\)/.test(index));
assert.ok(/zone_confirmed_by_athlete:\s*true/.test(index));
assert.ok(/premium:\s*true/.test(String(index.match(/function openCoachZoneConfirm[\s\S]+?function closeCoachZoneConfirm/)[0])));

const confirmBlock = index.match(/id="screen-coach-zone-confirm"[\s\S]+?id="screen-zone-arc-detail"/)[0];
assert.ok(!/Quick check-in/.test(confirmBlock));
assert.ok(!/Prepare for a climb/.test(confirmBlock));
assert.ok(!/startPrepare\(/.test(confirmBlock));
assert.ok(!/zc-somatic-rows/.test(confirmBlock));
assert.ok(!/\b(suggests|indicates|should|target|ideal)\b/i.test(confirmBlock));

assert.ok(!/assign a mental drill/i.test(dash));
assert.ok(!/id="fnav-mental"/.test(dash));

console.log('athlete-mental-nav-zone-confirm tests: ok');
