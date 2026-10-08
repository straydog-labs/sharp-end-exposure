import { extractAppInsertColumns } from './schema-columns.mjs';

const LIVE_TABLES = ['sessions', 'climbs', 'falls'];

export function liveSchemaColumns(app){
  app = app || extractAppInsertColumns();
  var seen = new Set();
  var out = [];
  Array.from(app.values()).forEach(function(rec){
    if(LIVE_TABLES.indexOf(rec.table) === -1) return;
    var key = rec.table + '.' + rec.column;
    if(seen.has(key)) return;
    seen.add(key);
    out.push({ table: rec.table, column: rec.column, key: key });
  });
  out.sort(function(a, b){ return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
  return out;
}

function failBody(status, text){
  var code = '';
  try{
    var j = JSON.parse(text);
    code = j && j.code ? String(j.code) : '';
  }catch(e){}
  return { status: status, code: code, text: String(text || '').slice(0, 240) };
}

export async function checkLiveColumn(baseUrl, anonKey, table, column){
  var url = baseUrl.replace(/\/$/, '') + '/rest/v1/' + encodeURIComponent(table)
    + '?select=' + encodeURIComponent(column) + '&limit=1';
  var res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: 'Bearer ' + anonKey,
      Accept: 'application/json',
      Prefer: 'count=none'
    }
  });
  var text = await res.text();
  var info = failBody(res.status, text);
  if(res.status === 400 || info.code === 'PGRST204'){
    return { ok: false, reason: 'missing-column', info: info };
  }
  if(res.status >= 400 && (info.code === 'PGRST204' || /Could not find the/.test(info.text))){
    return { ok: false, reason: 'missing-column', info: info };
  }
  if(res.status >= 500){
    return { ok: false, reason: 'server', info: info };
  }
  return { ok: true, info: info };
}

async function main(){
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_ANON_KEY;
  if(!url || !key){
    console.error('live-schema: SUPABASE_URL and SUPABASE_ANON_KEY repo secrets are required');
    process.exit(1);
  }
  var cols = liveSchemaColumns();
  if(!cols.length){
    console.error('live-schema: extractor found no sessions/climbs/falls insert columns');
    process.exit(1);
  }
  console.log('live-schema: checking ' + cols.length + ' insert columns on ' + url);
  var failed = [];
  for(var i = 0; i < cols.length; i++){
    var col = cols[i];
    var result = await checkLiveColumn(url, key, col.table, col.column);
    if(!result.ok){
      failed.push(col.key + '  HTTP ' + result.info.status + ' ' + (result.info.code || '') + ' ' + result.info.text);
      console.error('FAIL  ' + col.key);
    } else {
      console.log('ok    ' + col.key);
    }
  }
  if(failed.length){
    console.error('\nlive-schema: live DB missing column (Sept 9 class):\n' + failed.join('\n'));
    process.exit(1);
  }
  console.log('live-schema: ok (' + cols.length + ' columns present)');
}

var isMain = process.argv[1] && String(process.argv[1]).indexOf('live-schema-check.mjs') !== -1;
if(isMain){
  main().catch(function(err){
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
