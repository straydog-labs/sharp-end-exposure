/**
 * Fast coach-for-athlete climb log. Any linked pair. No gym/person hardcoding.
 */
(function (global) {
  'use strict';

  var ZONES = ['comfort', 'learning', 'panic'];
  var HOW_CLIMBED = ['Lead', 'Top Rope', 'Boulder', 'Auto Belay'];
  var RESULTS = ['sent', 'fell', 'dna', 'took', 'fall_practice'];
  var RESULT_LABELS = { sent: 'Sent', fell: 'Fell', dna: 'Backed off', took: 'Took', fall_practice: 'Fall practice' };
  var OUTDOOR_STYLES = ['Sport', 'Trad'];
  // Same score bands as index.html scoreToZone / getZone / resolveZone.
  var SCORE_COMFORT_MAX = 4;
  var SCORE_LEARNING_MAX = 9;
  var SCORE_MIN = 0;
  var SCORE_MAX = 12;
  var ACTIVATION_SAVE_MAX = 10;

  function normalizeZone(value) {
    var z = String(value || '').trim().toLowerCase();
    return ZONES.indexOf(z) !== -1 ? z : '';
  }

  function clampScore(score) {
    var n = Number(score);
    if (isNaN(n)) n = 6;
    return Math.max(SCORE_MIN, Math.min(SCORE_MAX, n));
  }

  function scoreToZone(score) {
    var n = clampScore(score);
    if (n <= SCORE_COMFORT_MAX) return 'comfort';
    if (n <= SCORE_LEARNING_MAX) return 'learning';
    return 'panic';
  }

  function zoneColorFromScore(score) {
    var z = scoreToZone(score);
    if (z === 'comfort') return '#7ec87a';
    if (z === 'panic') return '#e84444';
    return '#f5a623';
  }

  function zoneLabelFromScore(score) {
    var z = scoreToZone(score);
    return z === 'comfort' ? 'Comfort' : z === 'panic' ? 'Panic' : 'Learning';
  }

  function pickAllowed(value, allowed) {
    var s = String(value || '').trim();
    var i;
    for (i = 0; i < allowed.length; i++) {
      if (allowed[i].toLowerCase() === s.toLowerCase()) return allowed[i];
    }
    return '';
  }

  function normalizeHowClimbed(value) {
    return pickAllowed(value, HOW_CLIMBED);
  }

  function normalizeSetting(value) {
    var s = String(value || '').trim().toLowerCase();
    return (s === 'indoor' || s === 'outdoor') ? s : '';
  }

  function normalizeResult(value) {
    var s = String(value || '').trim().toLowerCase();
    return RESULTS.indexOf(s) !== -1 ? s : '';
  }

  function normalizeDiscipline(value) {
    return pickAllowed(value, OUTDOOR_STYLES.concat(HOW_CLIMBED));
  }

  function clampFallCount(n) {
    n = parseInt(n, 10);
    if (isNaN(n) || n < 1) return 1;
    if (n > 20) return 20;
    return n;
  }

  function clampActivationSave(score) {
    var n = Number(score);
    if (isNaN(n)) return null;
    n = Math.max(SCORE_MIN, Math.min(ACTIVATION_SAVE_MAX, n));
    return Math.round(n * 2) / 2;
  }

  function buildPayload(opts) {
    opts = opts || {};
    var zone = normalizeZone(opts.zone);
    if (!zone && opts.activationScore != null && opts.activationScore !== '') {
      zone = scoreToZone(opts.activationScore);
    }
    if (!zone) return { ok: false, error: 'Drag the dial to set a zone.' };
    if (!opts.athleteId) return { ok: false, error: 'Athlete is required.' };
    if (!opts.coachId) return { ok: false, error: 'Coach is required.' };
    var terrain = '';
    if (global.CoachInsights && global.CoachInsights.normalizeTerrainType) {
      terrain = global.CoachInsights.normalizeTerrainType(opts.terrain) || '';
    } else {
      terrain = String(opts.terrain || '').trim();
    }
    var how = normalizeHowClimbed(opts.howClimbed);
    var setting = normalizeSetting(opts.setting);
    var discipline = normalizeDiscipline(opts.discipline);
    if (setting === 'outdoor') {
      discipline = pickAllowed(opts.discipline, OUTDOOR_STYLES) || discipline;
    } else if (setting === 'indoor') {
      discipline = how || pickAllowed(opts.discipline, HOW_CLIMBED);
    }
    var grade = String(opts.grade || '').trim();
    var routeName = String(opts.routeName || '').trim() || grade || null;
    var result = normalizeResult(opts.result);
    var score = clampActivationSave(opts.activationScore);
    var payload = {
      user_id: opts.athleteId,
      device_id: 'coach:' + String(opts.coachId),
      zone: zone,
      climbing_type: how || terrain || null,
      route_name: routeName,
      gym_climb_id: opts.gymClimbId || null,
      grade_value: grade || null,
      session_notes: String(opts.note || '').trim() || null,
      is_checkin: false,
      logged_by_coach: true,
      logged_by: opts.coachId,
      zone_confirmed_by_athlete: false
    };
    if (setting) payload.setting = setting;
    if (discipline) payload.discipline = discipline;
    if (score != null) payload.coach_activation_score = score;
    if (result) payload.baseline_zone = result;
    if (result === 'fall_practice') {
      payload.baseline_zone = 'fall_practice';
      payload.fall_count = clampFallCount(opts.fallCount);
    }
    if (global.SessionsInsertRequired && typeof global.SessionsInsertRequired.assertPayload === 'function') {
      var required = global.SessionsInsertRequired.assertPayload(payload);
      if (!required.ok) return { ok: false, error: required.error };
    }
    return { ok: true, payload: payload };
  }

  function keepAfterLogAnother(state) {
    return {
      zone: '',
      terrain: '',
      gymClimbId: null,
      routeName: '',
      grade: '',
      note: '',
      howClimbed: '',
      setting: '',
      discipline: '',
      result: '',
      fallCount: 1,
      activationScore: 6,
      activationTouched: false
    };
  }

  function angleForScore(s) {
    return -180 + (clampScore(s) / SCORE_MAX) * 180;
  }

  function mountActivationDial(container, opts) {
    if (!container) return null;
    opts = opts || {};
    var score = clampScore(opts.score != null ? opts.score : 6);
    var locked = !!opts.locked;
    var untouched = opts.untouched !== false && !opts.touched;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : null;

    var W = 220;
    var H = 130;
    var cx = 110;
    var cy = 115;
    var r = 95;

    function toXY(angle, radius) {
      var rad = angle * Math.PI / 180;
      return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
    }

    var segments = [];
    var segCount = 48;
    var i;
    for (i = 0; i < segCount; i++) {
      var a0 = angleForScore(i / segCount * SCORE_MAX);
      var a1 = angleForScore((i + 1) / segCount * SCORE_MAX);
      var p0 = toXY(a0, r);
      var p1 = toXY(a1, r);
      var t = i / segCount;
      var segColor = t < 0.42 ? '#7ec87a' : (t < 0.75 ? '#f5a623' : '#e84444');
      segments.push(
        '<path d="M' + p0.x.toFixed(1) + ' ' + p0.y.toFixed(1) +
        ' A' + r + ' ' + r + ' 0 0 1 ' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1) +
        '" stroke="' + segColor + '" stroke-width="14" fill="none" stroke-linecap="butt" opacity="0.85"/>'
      );
    }

    var needleAngle = angleForScore(score);
    var needleLen = r - 18;
    var needleTip = toXY(needleAngle, needleLen);
    var needleColor = zoneColorFromScore(score);
    var zoneName = zoneLabelFromScore(score);
    var subLabel = score <= 4 ? 'settled, low activation'
      : (score <= 7 ? 'sweet spot range'
        : (score <= 9 ? 'approaching the edge' : 'high activation'));
    var unreadout = untouched
      ? '<div class="clog-gauge-score" style="font-size:16px;font-weight:700;color:var(--text-secondary);line-height:1.3;">Drag to set their zone</div>'
      : ('<div class="clog-gauge-score" style="font-size:28px;font-weight:700;color:' + needleColor + ';line-height:1.15;">' + score.toFixed(1) + ' ' + zoneName + '</div>' +
        '<div class="clog-gauge-sub" style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' + subLabel + '</div>');

    container.innerHTML =
      '<div class="clog-gauge-wrap" style="position:relative;' + (locked ? 'pointer-events:none;opacity:.55;' : '') + '">' +
        '<svg class="clog-gauge-svg" width="100%" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block;">' +
          segments.join('') +
          '<text x="8" y="108" font-family="Space Grotesk,sans-serif" font-size="7" fill="rgba(126,200,122,.7)" letter-spacing=".06em">COMFORT</text>' +
          '<text x="86" y="22" font-family="Space Grotesk,sans-serif" font-size="7" fill="rgba(245,166,35,.7)" letter-spacing=".06em">LEARNING</text>' +
          '<text x="168" y="108" font-family="Space Grotesk,sans-serif" font-size="7" fill="rgba(232,68,68,.7)" letter-spacing=".06em">PANIC</text>' +
          '<line class="gauge-needle-line" x1="' + cx + '" y1="' + cy + '" x2="' + needleTip.x.toFixed(1) + '" y2="' + needleTip.y.toFixed(1) +
            '" stroke="' + needleColor + '" stroke-width="3" stroke-linecap="round"/>' +
          '<circle class="gauge-needle-hub" cx="' + cx + '" cy="' + cy + '" r="6" fill="' + needleColor + '"/>' +
        '</svg>' +
      '</div>' +
      '<div class="clog-gauge-readout" style="text-align:center;margin-top:4px;">' + unreadout + '</div>';

    if (locked) return { score: score, destroy: function () {} };

    var wrap = container.querySelector('.clog-gauge-wrap');
    var handleSize = 22;
    var handle = document.createElement('div');
    handle.className = 'gauge-drag-handle';
    handle.style.cssText = 'position:absolute;width:' + handleSize + 'px;height:' + handleSize + 'px;border-radius:50%;background:#fff;border:3px solid var(--accent);box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:grab;touch-action:none;z-index:5;pointer-events:none;';
    wrap.appendChild(handle);

    var dialTarget = document.createElement('div');
    dialTarget.className = 'gauge-dial-target';
    dialTarget.setAttribute('tabindex', '0');
    dialTarget.setAttribute('role', 'slider');
    dialTarget.setAttribute('aria-label', 'Activation');
    dialTarget.setAttribute('aria-valuemin', String(SCORE_MIN));
    dialTarget.setAttribute('aria-valuemax', String(SCORE_MAX));
    dialTarget.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;cursor:grab;touch-action:none;z-index:4;';
    wrap.appendChild(dialTarget);
    wrap.style.touchAction = 'none';

    var currentScore = score;
    var dragging = false;

    function positionHandle(s) {
      var rect = wrap.getBoundingClientRect();
      if (!rect.width) return;
      var pivotX = rect.width / 2;
      var rr = rect.width * (77 / 220);
      var pivotYOffset = (130 - 115) * (rect.width / 220);
      var angle = 180 - (clampScore(s) / SCORE_MAX * 180);
      var rad = angle * Math.PI / 180;
      handle.style.left = (pivotX + rr * Math.cos(rad) - handleSize / 2) + 'px';
      handle.style.bottom = (pivotYOffset + rr * Math.sin(rad)) + 'px';
    }

    function positionNeedle(s) {
      var angle = angleForScore(s);
      var rad = angle * Math.PI / 180;
      var tipX = cx + needleLen * Math.cos(rad);
      var tipY = cy + needleLen * Math.sin(rad);
      var color = zoneColorFromScore(s);
      var needleLine = wrap.querySelector('.gauge-needle-line');
      var needleHub = wrap.querySelector('.gauge-needle-hub');
      if (needleLine) {
        needleLine.setAttribute('x2', tipX.toFixed(1));
        needleLine.setAttribute('y2', tipY.toFixed(1));
        needleLine.setAttribute('stroke', color);
      }
      if (needleHub) needleHub.setAttribute('fill', color);
    }

    function syncAria(s) {
      dialTarget.setAttribute('aria-valuenow', String(s));
      dialTarget.setAttribute('aria-valuetext', s.toFixed(1) + ' ' + zoneLabelFromScore(s));
    }

    function updateReadout(s) {
      var readout = container.querySelector('.clog-gauge-readout');
      if (!readout) return;
      var color = zoneColorFromScore(s);
      var label = zoneLabelFromScore(s);
      var sub = s <= 4 ? 'settled, low activation'
        : (s <= 7 ? 'sweet spot range'
          : (s <= 9 ? 'approaching the edge' : 'high activation'));
      readout.innerHTML =
        '<div class="clog-gauge-score" style="font-size:28px;font-weight:700;color:' + color + ';line-height:1.15;">' + s.toFixed(1) + ' ' + label + '</div>' +
        '<div class="clog-gauge-sub" style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' + sub + '</div>';
    }

    function applyScore(s, fromUser) {
      currentScore = clampScore(s);
      positionHandle(currentScore);
      positionNeedle(currentScore);
      syncAria(currentScore);
      if (fromUser) untouched = false;
      if (fromUser || !untouched) updateReadout(currentScore);
      if (fromUser && onChange) onChange(currentScore, scoreToZone(currentScore));
    }

    function scoreFromPointer(clientX, clientY) {
      var rect = wrap.getBoundingClientRect();
      var pivotX = rect.width / 2;
      var dx = clientX - rect.left - pivotX;
      var dyp = rect.height - (clientY - rect.top);
      var ang = Math.atan2(dyp, dx) * 180 / Math.PI;
      if(ang<0){ ang = (dx>=0) ? 0 : 180; } else { ang = Math.min(180, ang); }
      return SCORE_MAX * (1 - ang / 180);
    }

    function startDrag(e) {
      dragging = true;
      try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
      wrap.style.cursor = 'grabbing';
      dialTarget.style.cursor = 'grabbing';
      applyScore(scoreFromPointer(e.clientX, e.clientY), true);
      e.preventDefault();
    }
    function moveDrag(e) {
      if (!dragging) return;
      applyScore(scoreFromPointer(e.clientX, e.clientY), true);
    }
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      wrap.style.cursor = 'grab';
      dialTarget.style.cursor = 'grab';
      try { wrap.releasePointerCapture(e.pointerId); } catch (err) {}
      applyScore(Math.round(currentScore * 2) / 2, true);
    }
    function nudge(delta) {
      var next = Math.round((currentScore + delta) * 2) / 2;
      applyScore(next, true);
    }
    function onKey(e) {
      var key = e.key;
      if (key === 'ArrowRight' || key === 'ArrowUp') {
        e.preventDefault();
        nudge(0.5);
      } else if (key === 'ArrowLeft' || key === 'ArrowDown') {
        e.preventDefault();
        nudge(-0.5);
      } else if (key === 'Home') {
        e.preventDefault();
        applyScore(SCORE_MIN, true);
      } else if (key === 'End') {
        e.preventDefault();
        applyScore(SCORE_MAX, true);
      }
    }

    applyScore(score, false);
    wrap.addEventListener('pointerdown', startDrag);
    wrap.addEventListener('pointermove', moveDrag);
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('pointercancel', function () {
      dragging = false;
      wrap.style.cursor = 'grab';
      dialTarget.style.cursor = 'grab';
    });
    dialTarget.addEventListener('keydown', onKey);

    return {
      score: function () { return currentScore; },
      destroy: function () {
        wrap.removeEventListener('pointerdown', startDrag);
        wrap.removeEventListener('pointermove', moveDrag);
        wrap.removeEventListener('pointerup', endDrag);
        dialTarget.removeEventListener('keydown', onKey);
      }
    };
  }

  global.CoachLogSession = {
    ZONES: ZONES,
    HOW_CLIMBED: HOW_CLIMBED,
    RESULTS: RESULTS,
    RESULT_LABELS: RESULT_LABELS,
    OUTDOOR_STYLES: OUTDOOR_STYLES,
    SCORE_COMFORT_MAX: SCORE_COMFORT_MAX,
    SCORE_LEARNING_MAX: SCORE_LEARNING_MAX,
    SCORE_MAX: SCORE_MAX,
    ACTIVATION_SAVE_MAX: ACTIVATION_SAVE_MAX,
    normalizeZone: normalizeZone,
    normalizeHowClimbed: normalizeHowClimbed,
    normalizeSetting: normalizeSetting,
    normalizeResult: normalizeResult,
    clampFallCount: clampFallCount,
    clampActivationSave: clampActivationSave,
    clampScore: clampScore,
    scoreToZone: scoreToZone,
    zoneColorFromScore: zoneColorFromScore,
    zoneLabelFromScore: zoneLabelFromScore,
    buildPayload: buildPayload,
    keepAfterLogAnother: keepAfterLogAnother,
    mountActivationDial: mountActivationDial
  };
})(typeof window !== 'undefined' ? window : globalThis);
