import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index289'/.test(index));
assert.ok(/APP_VERSION = 'index289'/.test(sw));

assert.ok(/function setUnreadSource\(/.test(index));
assert.ok(/function syncAppIconBadge\(/.test(index));
assert.ok(/setUnreadSource\('coachChat', on\)/.test(index));
assert.ok(/navigator\.setAppBadge\(total\)/.test(index));
assert.ok(/navigator\.clearAppBadge\(\)/.test(index));
assert.ok(/setAppBadge/.test(sw));
assert.ok(/clearAppBadge/.test(sw));
assert.ok(/showNotification\(title/.test(sw));

function extractFn(src, name){
  var re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}');
  var m = src.match(re);
  assert.ok(m, name + ' extractable');
  return m[0];
}

var chatBadge = extractFn(index, 'setTrainChatUnreadBadge');
assert.ok(/setUnreadSource\('coachChat'/.test(chatBadge));
assert.ok(/fnav-train-unread/.test(chatBadge));

var pushIdx = sw.indexOf("addEventListener('push'");
var clickIdx = sw.indexOf("addEventListener('notificationclick'");
assert.ok(pushIdx !== -1 && clickIdx > pushIdx);
var pushChunk = sw.slice(pushIdx, clickIdx);
assert.ok(/setAppBadge/.test(pushChunk), 'push handler sets app badge');
assert.ok(/showNotification/.test(pushChunk));
var clickChunk = sw.slice(clickIdx, sw.indexOf("addEventListener('pushsubscriptionchange'"));
assert.ok(/clearAppBadge/.test(clickChunk), 'notificationclick clears app badge');

console.log('app-icon-badge tests: ok');
