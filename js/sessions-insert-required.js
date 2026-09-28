/**
 * sessions INSERT required fields — live-probed 2026-09-28 on
 * kwtbqgoqtewrlsjgepwq (anon POST {} → 23502 device_id; POST
 * {device_id} succeeded, so id/created_at have defaults and no other
 * column is NOT NULL without a default).
 *
 * PostgREST missing-column retries (PGRST204 / 42703) do not catch
 * 23502 (column exists, value was null). Guard required fields here
 * before POST. Loaded by coach-dashboard.html and index.html.
 */
(function (global) {
  'use strict';

  var SESSIONS_INSERT_REQUIRED = ['device_id'];

  function assertSessionsInsertPayload(payload) {
    payload = payload || {};
    var missing = [];
    var i;
    for (i = 0; i < SESSIONS_INSERT_REQUIRED.length; i++) {
      var key = SESSIONS_INSERT_REQUIRED[i];
      var val = payload[key];
      if (val == null || val === '') missing.push(key);
    }
    if (missing.length) {
      return {
        ok: false,
        missing: missing,
        error: 'sessions insert missing required: ' + missing.join(', ')
      };
    }
    return { ok: true, payload: payload };
  }

  global.SessionsInsertRequired = {
    FIELDS: SESSIONS_INSERT_REQUIRED,
    assertPayload: assertSessionsInsertPayload
  };
})(typeof window !== 'undefined' ? window : globalThis);
