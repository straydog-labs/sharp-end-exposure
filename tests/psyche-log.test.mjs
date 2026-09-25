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
assert.ok(/var app_version = 'index270'/.test(index));
assert.ok(/APP_VERSION = 'index270'/.test(sw));

assert.ok(/function startPrepare\(/.test(index));
assert.ok(/function startPrepareClimb\(/.test(index));
assert.ok(/function startExposureDrill\(/.test(index));
assert.ok(/is_checkin:\s*true/.test(index));

assert.ok(/function startPsycheBee\(/.test(index));
assert.ok(/function startPsycheSigh\(/.test(index));
assert.ok(/function startPsychePmr\(/.test(index));
assert.ok(/function startPsycheViz\(/.test(index));
assert.ok(/function startPsycheTalk\(/.test(index));
assert.ok(/function logPsycheDrill\(/.test(index));
assert.ok(/function loadPsycheLog\(/.test(index));
assert.ok(/function buildPsycheRadar\(/.test(index));
assert.ok(/sbI\(\s*'psyche_drills'/.test(index));
assert.ok(/drill_key:\s*'bee_humming'|logPsycheDrill\('bee_humming'/.test(index));
assert.ok(/logPsycheDrill\('cyclic_sighing'/.test(index));
assert.ok(/logPsycheDrill\('pmr'/.test(index));
assert.ok(/logPsycheDrill\('project_visualization'/.test(index));
assert.ok(/logPsycheDrill\('self_talk'/.test(index));

assert.ok(/id="screen-psyche-bee"/.test(index));
assert.ok(/id="screen-psyche-sigh"/.test(index));
assert.ok(/id="screen-psyche-pmr"/.test(index));
assert.ok(/id="screen-psyche-viz"/.test(index));
assert.ok(/id="screen-psyche-talk"/.test(index));
assert.ok(/'screen-psyche-bee':'fnav-mental'/.test(index));
assert.ok(/'screen-psyche-talk':'fnav-mental'/.test(index));

assert.ok(/Log a practice to see your mix/.test(index));
assert.ok(/total === 0/.test(index));
assert.ok(/letter-spacing:\.12em;text-transform:uppercase;color:var\(--muted\);margin:2px 0 4px;">Check-in</.test(index));
assert.ok(/letter-spacing:\.12em;text-transform:uppercase;color:var\(--muted\);margin:2px 0 4px;">Exposure</.test(index));
assert.ok(/letter-spacing:\.12em;text-transform:uppercase;color:var\(--muted\);margin:2px 0 4px;">Breath</.test(index));
assert.ok(/letter-spacing:\.12em;text-transform:uppercase;color:var\(--muted\);margin:2px 0 4px;">Relax</.test(index));
assert.ok(/letter-spacing:\.12em;text-transform:uppercase;color:var\(--muted\);margin:2px 0 4px;">Visualize</.test(index));
assert.ok(/letter-spacing:\.12em;text-transform:uppercase;color:var\(--muted\);margin:2px 0 4px;">Self-talk</.test(index));
assert.ok(/id="psyche-radar-wrap"/.test(index));
assert.ok(/setPsycheRadarRange\(7/.test(index));
assert.ok(/setPsycheRadarRange\(30/.test(index));
assert.ok(/setPsycheRadarRange\(90/.test(index));
assert.ok(/sbS\(\s*'psyche_drills'/.test(index));
assert.ok(/collectAthleteStreakDays\(climbs, trains, psyche, psycheDrills\)/.test(index)
  || /function collectAthleteStreakDays\(climbs, trains, psyche, psycheDrills\)/.test(index));

assert.ok(/Humming vibrates the vagus nerve/.test(index));
assert.ok(/The exhale is doing the work/.test(index));
assert.ok(/Tension you create on purpose is tension you can release on purpose/.test(index));
assert.ok(/Your nervous system doesn't fully distinguish imagining from doing/.test(index));
assert.ok(/A short cue phrase measurably changes performance/.test(index));
assert.ok(/Weitzberg/.test(index));
assert.ok(/Balban et al/.test(index));
assert.ok(/Hatzigeorgiadis/.test(index));

assert.ok(!/id="screen-coach-build-drill"/.test(index));
assert.ok(!/build a drill/i.test(dash));
assert.ok(!/create a drill/i.test(dash));
assert.ok(!/id="fnav-mental"/.test(dash));

const startPrepare = index.match(/function startPrepare\(\)\{[^}]+\}/)[0];
assert.ok(!/psyche_drills/.test(startPrepare));
assert.ok(/showScreen\('screen-prepare'\)/.test(startPrepare));

console.log('psyche-log tests: ok');
