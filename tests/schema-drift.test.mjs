import assert from 'assert';
import { driftReport } from './schema-columns.mjs';

const report = driftReport();
assert.ok(report.app.size > 20, 'extractor found too few insert columns: ' + report.app.size);
assert.ok(report.sql.size > 20, 'sql/ has too few columns: ' + report.sql.size);

if(report.missing.length){
  var lines = report.missing.map(function(m){
    return m.key + '  (' + m.files.join(', ') + ')';
  });
  assert.fail('insert column has no sql/ migration:\n' + lines.join('\n'));
}

console.log('schema-drift: ok (' + report.app.size + ' insert columns, ' + report.sql.size + ' sql columns)');
