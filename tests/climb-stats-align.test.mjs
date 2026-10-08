import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging);
assert.ok(/var app_version = 'index294'/.test(index));
assert.ok(/APP_VERSION = 'index294'/.test(sw));

function extractFn(src, name){
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' missing');
  let i = src.indexOf('{', start);
  let depth = 0;
  for(; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){
      depth--;
      if(depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const climb = index.slice(index.indexOf('id="screen-sessions"'), index.indexOf('id="screen-consent"'));
assert.ok(/climb-page-col/.test(climb));
assert.ok(climb.indexOf('climb-page-col') < climb.indexOf('Log a climb'));
assert.ok(climb.indexOf('climb-page-col') < climb.indexOf('id="climb-log-title"'));
assert.ok(/id="real-week-vs"/.test(climb));
assert.ok(/id="real-zone-mix"/.test(climb));
assert.ok(/id="real-sent"/.test(climb));
assert.ok(/id="real-hardest"/.test(climb));
assert.ok(!/id="real-total"/.test(climb));
assert.ok(!/of attempts sent/.test(climb));
assert.ok(/This week vs last/.test(climb));
assert.ok(/Project send rate/.test(climb));
assert.ok(/Hardest send/.test(climb));
assert.ok(/id="sess-total-count"/.test(climb), 'header count kept; Total logged tile removed');

const helpers = [
  extractFn(index, 'athleteWeekBounds'),
  extractFn(index, 'climbCreatedAt'),
  extractFn(index, 'computeClimbLandingStats'),
  'function isClimbProject(id){ return id === "proj"; }',
  'var window = { GRADE_ORDER: ["V0","V1","V2","V3","V4","V5"] };'
].join('\n');
const ctx = { window: { GRADE_ORDER: ['V0','V1','V2','V3','V4','V5'] } };
vm.createContext(ctx);
vm.runInContext(helpers, ctx);

const now = new Date('2026-09-10T12:00:00');
const few = [
  { created_at: '2026-09-10T10:00:00', zone: 'comfort', baseline_zone: 'sent', climb_id: 'proj', grade_value: 'V3' },
  { created_at: '2026-09-09T10:00:00', zone: 'learning', baseline_zone: 'fell', climb_id: 'proj', grade_value: 'V4' }
];
const fewStats = ctx.computeClimbLandingStats(few, now);
assert.strictEqual(fewStats.week, '—');
assert.strictEqual(fewStats.zoneMix, '—');
assert.strictEqual(fewStats.sendRate, '—');
assert.ok(/V3/.test(fewStats.hardest), 'Hardest send needs >= 1 qualifying send');
assert.ok(!/%/.test(fewStats.hardest));

const many = [];
for(var i = 0; i < 6; i++){
  many.push({
    created_at: '2026-09-0' + (5 + (i % 3)) + 'T10:00:00',
    zone: i % 3 === 0 ? 'comfort' : (i % 3 === 1 ? 'learning' : 'panic'),
    baseline_zone: 'sent',
    climb_id: 'proj',
    grade_value: i === 0 ? 'V5' : 'V2'
  });
}
many.push({ created_at: '2026-09-01T10:00:00', zone: 'comfort', baseline_zone: 'sent', climb_id: 'proj', grade_value: 'V1' });
const full = ctx.computeClimbLandingStats(many, now);
assert.notStrictEqual(full.week, '—');
assert.notStrictEqual(full.zoneMix, '—');
assert.notStrictEqual(full.sendRate, '—');
assert.ok(/V5/.test(full.hardest));
assert.ok(!/%/.test(full.hardest));

assert.ok(/paintClimbLandingStats/.test(extractFn(index, 'loadClimbLog')));
assert.ok(!/real-total/.test(extractFn(index, 'loadClimbLog')));

console.log('climb-stats-align tests: ok');
