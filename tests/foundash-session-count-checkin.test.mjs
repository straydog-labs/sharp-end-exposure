import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '../sql/foundash-list-all-users-session-count.sql'), 'utf8');
const html = readFileSync(join(__dirname, '../founder-dashboard.html'), 'utf8');

assert.ok(/ALTER FUNCTION public\.foundash_list_all_users\(\) RENAME TO foundash_list_all_users_raw/.test(sql));
assert.ok(/CREATE OR REPLACE FUNCTION public\.foundash_list_all_users\(\)/.test(sql));
assert.ok(/foundash_list_all_users_raw\(\)/.test(sql));
assert.ok(/s\.is_checkin = false/.test(sql));
assert.ok(/s\.deleted_at IS NULL/.test(sql));
assert.ok(!/CREATE OR REPLACE FUNCTION public\.foundash_user_detail/.test(sql), 'detail RPC left alone');
assert.ok(!/DROP FUNCTION[^;]*foundash_user_detail/.test(sql));
assert.ok(!/AND s\.is_baseline = false/.test(sql), 'do not extra-filter is_baseline');
assert.ok(/GRANT EXECUTE ON FUNCTION public\.foundash_list_all_users\(\) TO authenticated/.test(sql));
assert.ok(/REVOKE ALL ON FUNCTION public\.foundash_list_all_users_raw\(\)/.test(sql));
assert.ok(/is_checkin = false AND deleted_at IS NULL/.test(html), 'All Users schema-note documents the filter');

console.log('foundash-session-count-checkin tests: ok');
