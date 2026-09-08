/**
 * Fast coach-for-athlete climb log. Any linked pair. No gym/person hardcoding.
 */
(function (global) {
  'use strict';

  var ZONES = ['comfort', 'learning', 'panic'];
  // Same score bands as index.html scoreToZone / getZone / resolveZone.
  var SCORE_COMFORT_MAX = 4;
  var SCORE_LEARNING_MAX = 9;
  var SCORE_MIN = 0;
  var SCORE_MAX = 12;

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

  function buildPayload(opts) {
    opts = opts || {};
    var zone = normalizeZone(opts.zone);
    if (!zone) return { ok: false, error: 'Drag the dial to set a zone.' };
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
      logged_by: opts.coachId,
      zone_confirmed_by_athlete: false
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
      note: state.note || '',
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
      : ('<div class="clog-gauge-score" style="font-size:30px;font-weight:700;color:' + needleColor + ';line-height:1;">' + score.toFixed(1) + '</div>' +
        '<div class="clog-gauge-zone" style="font-size:14px;font-weight:700;color:' + needleColor + ';margin-top:4px;">' + zoneName + '</div>' +
        '<div class="clog-gauge-sub" style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + subLabel + '</div>');

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
    handle.style.cssText = 'position:absolute;width:' + handleSize + 'px;height:' + handleSize + 'px;border-radius:50%;background:#fff;border:3px solid var(--accent);box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:grab;touch-action:none;z-index:5;';
    wrap.appendChild(handle);

    var dialTarget = document.createElement('div');
    dialTarget.className = 'gauge-dial-target';
    dialTarget.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;cursor:grab;touch-action:none;z-index:4;';
    wrap.appendChild(dialTarget);

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

    function updateReadout(s) {
      var readout = container.querySelector('.clog-gauge-readout');
      if (!readout) return;
      var color = zoneColorFromScore(s);
      var label = zoneLabelFromScore(s);
      var sub = s <= 4 ? 'settled, low activation'
        : (s <= 7 ? 'sweet spot range'
          : (s <= 9 ? 'approaching the edge' : 'high activation'));
      readout.innerHTML =
        '<div class="clog-gauge-score" style="font-size:30px;font-weight:700;color:' + color + ';line-height:1;">' + s.toFixed(1) + '</div>' +
        '<div class="clog-gauge-zone" style="font-size:14px;font-weight:700;color:' + color + ';margin-top:4px;">' + label + '</div>' +
        '<div class="clog-gauge-sub" style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + sub + '</div>';
    }

    function applyScore(s, fromUser) {
      currentScore = clampScore(s);
      positionHandle(currentScore);
      positionNeedle(currentScore);
      updateReadout(currentScore);
      if (fromUser && onChange) onChange(currentScore, scoreToZone(currentScore));
    }

    function scoreFromPointer(clientX, clientY) {
      var rect = wrap.getBoundingClientRect();
      var pivotX = rect.width / 2;
      var dx = clientX - rect.left - pivotX;
      var dyp = rect.height - (clientY - rect.top);
      var ang = Math.atan2(dyp, dx) * 180 / Math.PI;
      ang = Math.max(0, Math.min(180, ang));
      return SCORE_MAX * (1 - ang / 180);
    }

    function startDrag(e) {
      dragging = true;
      try { dialTarget.setPointerCapture(e.pointerId); } catch (err) {}
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
      dialTarget.style.cursor = 'grab';
      try { dialTarget.releasePointerCapture(e.pointerId); } catch (err) {}
      applyScore(Math.round(currentScore * 2) / 2, true);
    }

    applyScore(score, false);
    dialTarget.addEventListener('pointerdown', startDrag);
    dialTarget.addEventListener('pointermove', moveDrag);
    dialTarget.addEventListener('pointerup', endDrag);
    dialTarget.addEventListener('pointercancel', function () {
      dragging = false;
      dialTarget.style.cursor = 'grab';
    });

    return {
      score: function () { return currentScore; },
      destroy: function () {
        dialTarget.removeEventListener('pointerdown', startDrag);
        dialTarget.removeEventListener('pointermove', moveDrag);
        dialTarget.removeEventListener('pointerup', endDrag);
      }
    };
  }

  global.CoachLogSession = {
    ZONES: ZONES,
    SCORE_COMFORT_MAX: SCORE_COMFORT_MAX,
    SCORE_LEARNING_MAX: SCORE_LEARNING_MAX,
    normalizeZone: normalizeZone,
    clampScore: clampScore,
    scoreToZone: scoreToZone,
    zoneColorFromScore: zoneColorFromScore,
    zoneLabelFromScore: zoneLabelFromScore,
    buildPayload: buildPayload,
    keepAfterLogAnother: keepAfterLogAnother,
    mountActivationDial: mountActivationDial
  };
})(typeof window !== 'undefined' ? window : globalThis);
