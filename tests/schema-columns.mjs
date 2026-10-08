import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');

const APP_SOURCES = [
  'index.html',
  'coach-dashboard.html',
  'js/coach-log-session.js',
  'js/coach-athlete-invite.js',
  'js/coach-athlete-insights.js',
  'js/coach-stack-nav.js',
  'js/sessions-insert-required.js'
];

const SKIP_TABLES = new Set(['rpc']);
const SKIP_COLUMNS = new Set(['test']);

function skipLineComment(src, i){
  var lineStart = src.lastIndexOf('\n', i) + 1;
  var prefix = src.slice(lineStart, i);
  return prefix.replace(/^\s+/, '').indexOf('//') === 0 || prefix.indexOf('//') !== -1;
}

export function parseObjectKeys(src, braceIdx){
  if(src[braceIdx] !== '{') return [];
  var keys = [];
  var i = braceIdx + 1;
  var depth = 1;
  var inStr = null;
  var expectKey = true;
  while(i < src.length && depth > 0){
    var c = src[i];
    if(inStr){
      if(c === '\\'){ i += 2; continue; }
      if(c === inStr) inStr = null;
      i++;
      continue;
    }
    if(c === '"' || c === "'" || c === '`'){ inStr = c; i++; continue; }
    if(c === '/' && src[i + 1] === '/'){
      while(i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if(c === '/' && src[i + 1] === '*'){
      var end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if(c === '{'){ depth++; expectKey = false; i++; continue; }
    if(c === '['){ depth++; expectKey = false; i++; continue; }
    if(c === '('){ depth++; expectKey = false; i++; continue; }
    if(c === '}' || c === ']' || c === ')'){
      depth--;
      i++;
      if(depth === 1) expectKey = false;
      continue;
    }
    if(depth === 1){
      if(c === ','){ expectKey = true; i++; continue; }
      if(c === ':'){ expectKey = false; i++; continue; }
      if(expectKey && /[A-Za-z_$]/.test(c)){
        var start = i;
        i++;
        while(i < src.length && /[A-Za-z0-9_$]/.test(src[i])) i++;
        var ident = src.slice(start, i);
        var j = i;
        while(j < src.length && /\s/.test(src[j])) j++;
        if(src[j] === ':') keys.push(ident);
        continue;
      }
      if(expectKey && (c === '"' || c === "'")){
        inStr = c;
        var ks = i + 1;
        i++;
        continue;
      }
    }
    i++;
  }
  return keys;
}

function findMatchingBrace(src, braceIdx){
  var i = braceIdx;
  var depth = 0;
  var inStr = null;
  for(; i < src.length; i++){
    var c = src[i];
    if(inStr){
      if(c === '\\'){ i++; continue; }
      if(c === inStr) inStr = null;
      continue;
    }
    if(c === '"' || c === "'" || c === '`'){ inStr = c; continue; }
    if(c === '/' && src[i + 1] === '/'){
      while(i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if(c === '{') depth++;
    if(c === '}'){
      depth--;
      if(depth === 0) return i;
    }
  }
  return -1;
}

function addCol(map, table, col, file, idx){
  if(!table || !col) return;
  if(SKIP_TABLES.has(table) || SKIP_COLUMNS.has(col)) return;
  if(!/^[a-z][a-z0-9_]*$/.test(table) || !/^[a-z][a-z0-9_]*$/.test(col)) return;
  var key = table + '.' + col;
  if(!map.has(key)) map.set(key, { table: table, column: col, files: [] });
  var rec = map.get(key);
  var line = (file + ':' + (srcLine(file, idx)));
  if(rec.files.indexOf(line) === -1) rec.files.push(line);
}

var _srcCache = {};
function srcLine(file, idx){
  if(idx == null) return 0;
  var src = _srcCache[file];
  if(!src) return 0;
  return src.slice(0, idx).split('\n').length;
}

function scanSbI(src, file, map){
  var re = /sbI\(\s*['"]([a-z0-9_]+)['"]\s*,/g;
  var m;
  while((m = re.exec(src))){
    if(skipLineComment(src, m.index)) continue;
    var k = m.index + m[0].length;
    while(k < src.length && /\s/.test(src[k])) k++;
    if(src[k] === '{'){
      parseObjectKeys(src, k).forEach(function(col){ addCol(map, m[1], col, file, m.index); });
    }
  }
}

function scanNamedPayloadThenInsert(src, file, map, insertRe, table){
  var m;
  var re = insertRe;
  re.lastIndex = 0;
  while((m = re.exec(src))){
    if(skipLineComment(src, m.index)) continue;
    var varName = m[1];
    var before = src.slice(Math.max(0, m.index - 4000), m.index);
    var decl = new RegExp('(?:var|let|const)\\s+' + varName + '\\s*=\\s*\\{', 'g');
    var assign = new RegExp(varName + '\\s*=\\s*\\{', 'g');
    var hit = null;
    var dm;
    while((dm = decl.exec(before)) || (dm = assign.exec(before))){
      hit = dm;
    }
    if(!hit) continue;
    var brace = before.indexOf('{', hit.index);
    if(brace < 0) continue;
    var abs = m.index - before.length + brace;
    parseObjectKeys(src, abs).forEach(function(col){ addCol(map, table, col, file, abs); });
  }
}

function scanInsertSession(src, file, map){
  scanNamedPayloadThenInsert(src, file, map, /sbInsertSession\(\s*([A-Za-z_$][\w$]*)\s*\)/g, 'sessions');
  var lit = /sbInsertSession\(\s*\{/g;
  var m;
  while((m = lit.exec(src))){
    if(skipLineComment(src, m.index)) continue;
    var k = src.indexOf('{', m.index);
    parseObjectKeys(src, k).forEach(function(col){ addCol(map, 'sessions', col, file, m.index); });
  }
}

function scanRestPost(src, file, map){
  var re = /['`]\/rest\/v1\/([a-z0-9_]+)[^'`]*(?:['`]|\?)/g;
  var m;
  while((m = re.exec(src))){
    if(skipLineComment(src, m.index)) continue;
    var windowSrc = src.slice(m.index, Math.min(src.length, m.index + 500));
    if(!/method:\s*['"]POST['"]/.test(windowSrc) && !/method:\s*['"]POST['"]/.test(src.slice(Math.max(0, m.index - 200), m.index + 80))){
      // also JSON.stringify(body) after fetch sessions POST
      if(windowSrc.indexOf("method: 'POST'") === -1 && windowSrc.indexOf('method: "POST"') === -1){
        continue;
      }
    }
    var stringify = windowSrc.match(/JSON\.stringify\(\s*(\{|[A-Za-z_$][\w$]*)/);
    if(!stringify) continue;
    if(stringify[1] === '{'){
      var brace = windowSrc.indexOf('{', stringify.index);
      parseObjectKeys(windowSrc, brace).forEach(function(col){ addCol(map, m[1], col, file, m.index); });
    }
  }
}

function scanBuildPayload(src, file, map){
  var idx = src.indexOf('var payload = {');
  if(idx < 0) idx = src.indexOf('payload = {');
  if(idx < 0) return;
  var brace = src.indexOf('{', idx);
  parseObjectKeys(src, brace).forEach(function(col){ addCol(map, 'sessions', col, file, brace); });
}

export function extractAppInsertColumns(){
  var map = new Map();
  APP_SOURCES.forEach(function(rel){
    var src = readFileSync(join(ROOT, rel), 'utf8');
    _srcCache[rel] = src;
    scanSbI(src, rel, map);
    scanInsertSession(src, rel, map);
    scanRestPost(src, rel, map);
    if(rel.indexOf('coach-log-session') !== -1) scanBuildPayload(src, rel, map);
  });
  return map;
}

function parseCreateTable(sql, table, body, cols){
  var i = 0;
  var depth = 0;
  var ident = '';
  var expectCol = true;
  var inStr = null;
  for(; i < body.length; i++){
    var c = body[i];
    if(inStr){
      if(c === inStr) inStr = null;
      continue;
    }
    if(c === "'" ){ inStr = c; continue; }
    if(c === '('){ depth++; expectCol = false; ident = ''; continue; }
    if(c === ')'){ depth--; ident = ''; continue; }
    if(depth !== 0) continue;
    if(c === ','){ expectCol = true; ident = ''; continue; }
    if(expectCol && /[a-zA-Z_]/.test(c)){
      var start = i;
      i++;
      while(i < body.length && /[a-zA-Z0-9_]/.test(body[i])) i++;
      var name = body.slice(start, i).toLowerCase();
      var rest = body.slice(i).replace(/^\s+/, '');
      if(/^(constraint|primary|unique|check|exclude|foreign)\b/i.test(name)){
        expectCol = false;
        i = start;
        continue;
      }
      cols.add(table + '.' + name);
      expectCol = false;
      i--;
    }
  }
}

export function extractSqlColumns(){
  var cols = new Set();
  var sqlDir = join(ROOT, 'sql');
  readdirSync(sqlDir).filter(function(n){ return n.endsWith('.sql'); }).forEach(function(name){
    var sql = readFileSync(join(sqlDir, name), 'utf8');
    var addRe = /alter table(?:\s+only)?\s+public\.([a-z0-9_]+)\s+add column(?:\s+if not exists)?\s+([a-z0-9_]+)/gi;
    var m;
    while((m = addRe.exec(sql))){
      cols.add(m[1] + '.' + m[2]);
    }
    var commentRe = /comment on column public\.([a-z0-9_]+)\.([a-z0-9_]+)/gi;
    while((m = commentRe.exec(sql))){
      cols.add(m[1] + '.' + m[2]);
    }
    var knownRe = /^--\s*known:\s*([a-z0-9_]+)\.([a-z0-9_]+)\s*$/gim;
    while((m = knownRe.exec(sql))){
      cols.add(m[1] + '.' + m[2]);
    }
    var createRe = /create table(?:\s+if not exists)?\s+public\.([a-z0-9_]+)\s*\(/gi;
    while((m = createRe.exec(sql))){
      var start = m.index + m[0].length - 1;
      var depth = 0;
      var j = start;
      for(; j < sql.length; j++){
        if(sql[j] === '(') depth++;
        else if(sql[j] === ')'){
          depth--;
          if(depth === 0) break;
        }
      }
      parseCreateTable(sql, m[1], sql.slice(start + 1, j), cols);
    }
  });
  return cols;
}

export function extractGrandfatheredColumns(){
  var cols = [];
  var sql = readFileSync(join(ROOT, 'sql', 'baseline-insert-columns.sql'), 'utf8');
  var knownRe = /^--\s*known:\s*([a-z0-9_]+)\.([a-z0-9_]+)\s*$/gim;
  var m;
  while((m = knownRe.exec(sql))){
    cols.push(m[1] + '.' + m[2]);
  }
  return cols.sort();
}

export function printGrandfatheredColumns(log){
  log = log || console.log;
  var cols = extractGrandfatheredColumns();
  log('GRANDFATHERED ' + cols.length + ' columns (burn-down list from sql/baseline-insert-columns.sql):');
  cols.forEach(function(key){ log('  -- known: ' + key); });
  return cols;
}

export function driftReport(){
  var app = extractAppInsertColumns();
  var sql = extractSqlColumns();
  var missing = [];
  Array.from(app.keys()).sort().forEach(function(key){
    if(!sql.has(key)) missing.push(Object.assign({ key: key }, app.get(key)));
  });
  return { app: app, sql: sql, missing: missing, grandfathered: extractGrandfatheredColumns() };
}
