import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
require(join(__dirname, '../js/coach-athlete-invite.js'));
const Inv = globalThis.CoachAthleteInvite;

const token = Inv.randomToken();
assert.ok(token.length >= 16);
assert.ok(/^[a-f0-9-]+$/i.test(token));

const payload = Inv.buildInsertPayload('coach-1', 'abc123');
assert.deepStrictEqual(payload, {
  role: 'athlete',
  coach_id: 'coach-1',
  token: 'abc123'
});

const url = Inv.inviteUrl('tok-1', {
  origin: 'https://straydog-labs.github.io',
  pathname: '/sharp-end-exposure/coach-dashboard.html'
});
assert.strictEqual(
  url,
  'https://straydog-labs.github.io/sharp-end-exposure/?invite=tok-1'
);

const replaced = [];
const locOpen = {
  pathname: '/sharp-end-exposure/coach-dashboard.html',
  search: '?invite=open&keep=1',
  hash: ''
};
assert.strictEqual(Inv.consumeOpenInviteParam(locOpen, {
  state: null,
  replaceState: function (s, t, path) { replaced.push(path); }
}), true);
assert.strictEqual(replaced[0], '/sharp-end-exposure/coach-dashboard.html?keep=1');

const locToken = {
  pathname: '/sharp-end-exposure/coach-dashboard.html',
  search: '?invite=tok-abc',
  hash: ''
};
assert.strictEqual(Inv.consumeOpenInviteParam(locToken, {
  replaceState: function () { throw new Error('must not strip a real token'); }
}), false);

assert.strictEqual(Inv.consumeOpenInviteParam({
  pathname: '/coach-dashboard.html',
  search: '',
  hash: ''
}, { replaceState: function () {} }), false);

assert.strictEqual(Inv.shouldShowWelcome({
  seenWelcome: false,
  inviteCount: 0,
  rosterCount: 0
}), true);
assert.strictEqual(Inv.shouldShowWelcome({
  seenWelcome: true,
  inviteCount: 0,
  rosterCount: 0
}), false);
assert.strictEqual(Inv.shouldShowWelcome({
  seenWelcome: false,
  inviteCount: 1,
  rosterCount: 0
}), false);
assert.strictEqual(Inv.shouldShowWelcome({
  seenWelcome: false,
  inviteCount: 0,
  rosterCount: 2
}), false);

const anna = { athlete_id: 'a1', athlete_first_name: 'Anna', athlete_email: 'anna@x.com' };
assert.strictEqual(Inv.athleteFirstName(anna), 'Anna');
assert.strictEqual(
  Inv.joinBannerCopy(anna),
  'Anna just joined — assign her first climb'
);

const banners = Inv.joinBanners(
  [
    { id: 'inv-old', used_at: '2026-01-01', used_by: 'a1' },
    { id: 'inv-new', used_at: '2026-09-01', used_by: 'a1' },
    { id: 'inv-open', used_at: null, used_by: null, token: 'x' },
    { id: 'inv-seen', used_at: '2026-09-02', used_by: 'a1' }
  ],
  [anna],
  ['inv-seen']
);
assert.strictEqual(banners[0].inviteId, 'inv-new');
assert.ok(banners.every(function (b) { return b.inviteId !== 'inv-seen'; }));
assert.ok(banners.every(function (b) { return b.inviteId !== 'inv-open'; }));

const lib = [
  { id: 'w1', name: 'Warmup for Climbing', training_focus: 'Warm-Ups' },
  { id: 'w2', name: 'Max Hang', training_focus: 'Hangboard' },
  { id: 'w3', name: 'ARC', training_focus: 'Cardio & Capacity' },
  { id: 'w4', name: 'Capacity', training_focus: 'Mental/Other' },
  { id: 'w5', name: 'Silent Feet', training_focus: 'Routes' },
  { id: 'w6', name: 'Hip CARs', training_focus: 'Mobility & Flexibility' },
  { id: 'w7', name: 'Downclimbing Practice', training_focus: 'Routes' }
];
const starters = Inv.starterShortlist(lib);
assert.strictEqual(starters.length, 5);
assert.ok(starters.every(function (s) { return s.name !== 'Warmup for Climbing'; }));
assert.deepStrictEqual(starters.map(function (s) { return s.name; }), Inv.STARTER_NAMES);
assert.ok(Inv.isWarmupForClimbing(lib[0]));
assert.ok(!Inv.isWarmupForClimbing(lib[2]));

const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');
const sw = readFileSync(join(__dirname, '../sw.js'), 'utf8');
const index = readFileSync(join(__dirname, '../index.html'), 'utf8');
const staging = readFileSync(join(__dirname, '../index-staging.html'), 'utf8');

assert.ok(/js\/coach-athlete-invite\.js/.test(dash));
assert.ok(/id="invite-athlete-open"/.test(dash));
assert.ok(/Invite an athlete/.test(dash));
assert.ok(/Send this link to your athlete/.test(dash));
assert.ok(/linked to you automatically once they sign up/.test(dash));
assert.ok(/id="invite-link-input"/.test(dash));
assert.ok(/textarea id="invite-link-input"/.test(dash));
assert.ok(/id="invite-link-copy"/.test(dash));
assert.ok(/id="invite-join-banner"/.test(dash));
assert.ok(/id="coach-invite-welcome"/.test(dash));
assert.ok(/link_athlete_by_email/.test(dash));
assert.ok(/id="link-athlete-submit"/.test(dash) && /Link athlete/.test(dash));
assert.ok(/createCoachLibraryAssignment/.test(dash));
assert.ok(/starterShortlist/.test(dash));
assert.ok(/Pick something else/.test(dash));
assert.ok(/function createAthleteInvite/.test(dash));
assert.ok(/rest\/v1\/invites/.test(dash));
assert.ok(/Pick something else/.test(dash));
assert.ok(!/openResearchSheet/.test(dash));
assert.ok(/consumeOpenInviteParam/.test(dash));
assert.ok(/_openInviteDeepLink/.test(dash));
assert.ok(/invite'\) !== 'open'|invite' !== 'open'/.test(
  readFileSync(join(__dirname, '../js/coach-athlete-invite.js'), 'utf8')
));

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index251'/.test(index));
assert.ok(/APP_VERSION = 'index251'/.test(sw));

console.log('coach-athlete-invite tests: ok');
