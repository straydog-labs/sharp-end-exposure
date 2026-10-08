import assert from 'assert';
import { driftReport, printGrandfatheredColumns } from './schema-columns.mjs';
import { liveSchemaColumns } from './live-schema-check.mjs';

const report = driftReport();
assert.ok(report.app.size > 20, 'extractor found too few insert columns: ' + report.app.size);
assert.ok(report.sql.size > 20, 'sql/ has too few columns: ' + report.sql.size);

if(report.missing.length){
  var lines = report.missing.map(function(m){
    return m.key + '  (' + m.files.join(', ') + ')';
  });
  assert.fail('insert column has no sql/ migration:\n' + lines.join('\n'));
}

var known = printGrandfatheredColumns(console.log);
assert.ok(known.length >= 1, 'grandfathered burn-down list should be non-empty until ALTERs land');

var live = liveSchemaColumns(report.app);
var liveTables = {};
live.forEach(function(c){ liveTables[c.table] = (liveTables[c.table] || 0) + 1; });
assert.ok(liveTables.sessions, 'live-schema must query sessions insert columns');
assert.ok(liveTables.climbs, 'live-schema must query climbs insert columns');
assert.ok(liveTables.falls, 'live-schema must query falls insert columns');

console.log('schema-drift: ok (' + report.app.size + ' insert columns, ' + report.sql.size + ' sql columns, ' + known.length + ' grandfathered, live-check ' + live.length + ' sessions/climbs/falls)');
