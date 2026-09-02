/**
 * Fast coach-for-athlete climb log. Any linked pair. No gym/person hardcoding.
 */
(function (global) {
  'use strict';

  var ZONES = ['comfort', 'learning', 'panic'];

  function normalizeZone(value) {
    var z = String(value || '').trim().toLowerCase();
    return ZONES.indexOf(z) !== -1 ? z : '';
  }

  function buildPayload(opts) {
    opts = opts || {};
    var zone = normalizeZone(opts.zone);
    if (!zone) return { ok: false, error: 'Pick a zone.' };
    if (!opts.athleteId) return { ok: false, error: 'Athlete is required.' };
    if (!opts.coachId) return { ok: false, error: 'Coach is required.' };
    var terrain = '';
    if (global.CoachInsights && global.CoachInsights.normalizeTerrainType) {
      terrain = global.CoachInsights.normalizeTerrainType(opts.terrain) || '';
    } else {
      terrain = String(opts.terrain || '').trim();
    }
    var payload = {
      user_id: opts.athleteId,
      zone: zone,
      climbing_type: terrain || null,
      route_name: String(opts.routeName || '').trim() || null,
      gym_climb_id: opts.gymClimbId || null,
      grade_value: String(opts.grade || '').trim() || null,
      session_notes: String(opts.note || '').trim() || null,
      is_checkin: false,
      logged_by_coach: true,
      logged_by: opts.coachId
    };
    return { ok: true, payload: payload };
  }

  function keepAfterLogAnother(state) {
    state = state || {};
    return {
      zone: '',
      terrain: state.terrain || '',
      gymClimbId: state.gymClimbId || null,
      routeName: state.routeName || '',
      grade: state.grade || '',
      note: state.note || ''
    };
  }

  global.CoachLogSession = {
    ZONES: ZONES,
    normalizeZone: normalizeZone,
    buildPayload: buildPayload,
    keepAfterLogAnother: keepAfterLogAnother
  };
})(typeof window !== 'undefined' ? window : globalThis);
