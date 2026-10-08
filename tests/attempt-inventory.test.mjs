import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import { ATTEMPT_SITE_RULES, FLOWS } from './regression-manifest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const index = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

function collectCallSites(src, name){
  var sites = [];
  var re = new RegExp(name + '\\s*\\(', 'g');
  var m;
  while((m = re.exec(src))){
    var lineStart = src.lastIndexOf('\n', m.index) + 1;
    var lineEnd = src.indexOf('\n', m.index);
    if(lineEnd < 0) lineEnd = src.length;
    var line = src.slice(lineStart, lineEnd);
    var trimmed = line.replace(/^\s+/, '');
    if(trimmed.indexOf('//') === 0) continue;
    if(line.slice(0, m.index - lineStart).indexOf('//') !== -1) continue;
    var before = src.slice(Math.max(0, m.index - 48), m.index);
    if(/function\s+$/.test(before)) continue;
    sites.push({
      name: name,
      line: src.slice(0, m.index).split('\n').length,
      ctx: (trimmed + ' ' + src.slice(Math.max(0, m.index - 220), m.index + 160)).replace(/\s+/g, ' ')
    });
  }
  return sites;
}

var covered = {};
FLOWS.forEach(function(f){ if(f.covered) covered[f.id] = f; });

var sites = collectCallSites(index, 'launchLogWithClimb')
  .concat(collectCallSites(index, 'addAttemptFromLog'));

assert.ok(sites.length >= 6, 'expected attempt entry points, got ' + sites.length);

var unmatched = [];
sites.forEach(function(site){
  var hit = ATTEMPT_SITE_RULES.find(function(rule){
    return rule.fn === site.name && rule.match.test(site.ctx);
  });
  if(!hit){
    unmatched.push(site.name + ' L' + site.line + ' ' + site.ctx.slice(0, 140));
    return;
  }
  assert.ok(covered[hit.flow], 'call site L' + site.line + ' maps to uncovered flow ' + hit.flow);
});

assert.deepStrictEqual(unmatched, [], 'new addAttemptFromLog/launchLogWithClimb entry point has no flow test:\n' + unmatched.join('\n'));

ATTEMPT_SITE_RULES.forEach(function(rule){
  var used = sites.some(function(site){
    return site.name === rule.fn && rule.match.test(site.ctx);
  });
  assert.ok(used, 'inventory rule never matched production code: ' + rule.flow);
});

console.log('attempt-inventory: ok (' + sites.length + ' sites, ' + ATTEMPT_SITE_RULES.length + ' rules)');
