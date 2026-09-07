/**
 * Coach dashboard — progress, gap diagnostic, and gym-climb CSV helpers.
 * Works for any coach/athlete. No gym- or person-specific data.
 */
(function (global) {
  'use strict';

  var TERRAIN_TYPES = ['Slab', 'Vertical', 'Overhang', 'Roof', 'Crack'];

  var GRADE_ORDER = [
    'VB',
    'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9',
    'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17',
    '5.5', '5.6', '5.7', '5.8', '5.9',
    '5.10a', '5.10b', '5.10c', '5.10d',
    '5.11a', '5.11b', '5.11c', '5.11d',
    '5.12a', '5.12b', '5.12c', '5.12d',
    '5.13a', '5.13b', '5.13c', '5.13d',
    '5.14a', '5.14b', '5.14c', '5.14d',
    '5.15a', '5.15b', '5.15c', '5.15d',
    '4a', '4b', '4c',
    '5a', '5b', '5c',
    '6a', '6a+', '6b', '6b+', '6c', '6c+',
    '7a', '7a+', '7b', '7b+', '7c', '7c+',
    '8a', '8a+', '8b', '8b+', '8c', '8c+',
    '9a', '9a+', '9b', '9b+', '9c',
    'Mod', 'Diff', 'VDiff', 'HVD', 'Sev', 'HS', 'VS', 'HVS',
    'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10'
  ];

  var GRADE_RANK = (function () {
    var map = {};
    for (var i = 0; i < GRADE_ORDER.length; i++) map[GRADE_ORDER[i]] = i;
    return map;
  })();

  function normalizeZone(value) {
    var z = String(value || '').trim().toLowerCase();
    if (z === 'comfort' || z === 'learning' || z === 'panic') return z;
    return '';
  }

  function emptyZoneCounts() {
    return { comfort: 0, learning: 0, panic: 0 };
  }

  function addZone(counts, zone) {
    var z = normalizeZone(zone);
    if (z) counts[z] += 1;
    return counts;
  }

  function zonePercents(counts) {
    var total = (counts.comfort || 0) + (counts.learning || 0) + (counts.panic || 0);
    if (!total) return { comfort: 0, learning: 0, panic: 0, total: 0 };
    return {
      comfort: Math.round((counts.comfort / total) * 100),
      learning: Math.round((counts.learning / total) * 100),
      panic: Math.round((counts.panic / total) * 100),
      total: total
    };
  }

  function gradeRank(grade) {
    if (!grade) return null;
    var key = String(grade).trim();
    if (Object.prototype.hasOwnProperty.call(GRADE_RANK, key)) return GRADE_RANK[key];
    return null;
  }

  // Family-scoped lists. Additive copies — GRADE_ORDER / GRADE_RANK / gradeRank stay as-is.
  var BOULDER_GRADE_ORDER = [
    'VB',
    'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9',
    'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17'
  ];
  var YDS_GRADE_ORDER = [
    '5.5', '5.6', '5.7', '5.8', '5.9',
    '5.10a', '5.10b', '5.10c', '5.10d',
    '5.11a', '5.11b', '5.11c', '5.11d',
    '5.12a', '5.12b', '5.12c', '5.12d',
    '5.13a', '5.13b', '5.13c', '5.13d',
    '5.14a', '5.14b', '5.14c', '5.14d',
    '5.15a', '5.15b', '5.15c', '5.15d'
  ];
  var FRENCH_GRADE_ORDER = [
    '4a', '4b', '4c',
    '5a', '5b', '5c',
    '6a', '6a+', '6b', '6b+', '6c', '6c+',
    '7a', '7a+', '7b', '7b+', '7c', '7c+',
    '8a', '8a+', '8b', '8b+', '8c', '8c+',
    '9a', '9a+', '9b', '9b+', '9c'
  ];
  var BRITISH_GRADE_ORDER = ['Mod', 'Diff', 'VDiff', 'HVD', 'Sev', 'HS', 'VS', 'HVS'];
  var E_GRADE_ORDER = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10'];
  var ROPED_SYSTEMS = ['yds', 'french', 'british', 'e_grade'];
  var ROPED_GRADE_ORDERS = {
    yds: YDS_GRADE_ORDER,
    french: FRENCH_GRADE_ORDER,
    british: BRITISH_GRADE_ORDER,
    e_grade: E_GRADE_ORDER
  };
  var ROPED_SYSTEM_LABELS = {
    yds: 'YDS',
    french: 'French',
    british: 'British',
    e_grade: 'E-grade'
  };

  function indexInOrder(order, grade) {
    var key = String(grade == null ? '' : grade).trim();
    if (!key || !order || !order.length) return null;
    var i;
    for (i = 0; i < order.length; i++) {
      if (order[i] === key) return i;
    }
    var lower = key.toLowerCase();
    for (i = 0; i < order.length; i++) {
      if (String(order[i]).toLowerCase() === lower) return i;
    }
    return null;
  }

  function classifyGradeSystem(grade) {
    var key = String(grade == null ? '' : grade).trim();
    if (!key) return '';
    if (indexInOrder(BOULDER_GRADE_ORDER, key) != null) return 'v_scale';
    if (indexInOrder(YDS_GRADE_ORDER, key) != null) return 'yds';
    if (indexInOrder(FRENCH_GRADE_ORDER, key) != null) return 'french';
    if (indexInOrder(BRITISH_GRADE_ORDER, key) != null) return 'british';
    if (indexInOrder(E_GRADE_ORDER, key) != null) return 'e_grade';
    if (/^vb$/i.test(key) || /^v\d+$/i.test(key)) return 'v_scale';
    if (/^5\.\d/.test(key)) return 'yds';
    if (/^e([1-9]|10)$/i.test(key)) return 'e_grade';
    if (/^(mod|diff|vdiff|hvd|sev|hs|vs|hvs)$/i.test(key)) return 'british';
    if (/^(4[abc]|5[abc]|[6-9][abc]\+?)$/i.test(key)) return 'french';
    return '';
  }

  function classifyGradeFamily(grade) {
    var sys = classifyGradeSystem(grade);
    if (sys === 'v_scale') return 'boulder';
    if (sys === 'yds' || sys === 'french' || sys === 'british' || sys === 'e_grade') return 'roped';
    return '';
  }

  function boulderGradeRank(grade) {
    return indexInOrder(BOULDER_GRADE_ORDER, grade);
  }

  function ropedGradeRank(grade, system) {
    var order = ROPED_GRADE_ORDERS[system];
    if (!order) return null;
    return indexInOrder(order, grade);
  }

  function normalizeRopedDisciplineGroup(discipline) {
    var d = String(discipline == null ? '' : discipline).trim().toLowerCase();
    if (!d) return '';
    if (d === 'lead' || d === 'sport' || d === 'trad') return 'lead';
    if (d === 'top rope') return 'top_rope';
    if (d === 'auto belay') return 'auto_belay';
    return '';
  }

  function ropedDisciplineMatches(discipline, filter) {
    var f = String(filter || 'all').trim().toLowerCase();
    if (!f || f === 'all') return true;
    return normalizeRopedDisciplineGroup(discipline) === f;
  }

  function dominantRopedSystem(sessions) {
    var counts = { yds: 0, french: 0, british: 0, e_grade: 0 };
    var total = 0;
    (sessions || []).forEach(function (row) {
      if (!isClimbSession(row)) return;
      var sys = classifyGradeSystem(row.grade_value);
      if (!Object.prototype.hasOwnProperty.call(counts, sys)) return;
      counts[sys] += 1;
      total += 1;
    });
    var best = '';
    var bestN = 0;
    ROPED_SYSTEMS.forEach(function (sys) {
      if (counts[sys] > bestN) {
        bestN = counts[sys];
        best = sys;
      }
    });
    return {
      system: best,
      count: bestN,
      total: total,
      counts: counts,
      excluded: best ? (total - bestN) : 0
    };
  }

  function averageGradePoint(list, key, label) {
    if (!list || !list.length) return { key: key, label: label, rank: null, grade: '' };
    var sum = 0;
    var i;
    for (i = 0; i < list.length; i++) sum += list[i].rank;
    var avg = sum / list.length;
    var nearest = list.slice().sort(function (a, b) {
      return Math.abs(a.rank - avg) - Math.abs(b.rank - avg);
    })[0];
    return { key: key, label: label, rank: avg, grade: nearest.grade };
  }

  function seriesFromTerrainBuckets(weeks, byWeek, field) {
    return TERRAIN_TYPES.map(function (terrain) {
      var points = weeks.map(function (k) {
        var list = (byWeek[k][field] && byWeek[k][field][terrain]) || [];
        return averageGradePoint(list, k, byWeek[k].label);
      });
      return { terrain: terrain, points: points };
    }).filter(function (series) {
      return series.points.some(function (p) { return p.rank != null; });
    });
  }

  function gradeAxisFromSeries(seriesList, gradeOrder) {
    var ranks = [];
    (seriesList || []).forEach(function (s) {
      (s.points || []).forEach(function (p) {
        if (p.rank != null) ranks.push(p.rank);
      });
    });
    if (!ranks.length || !gradeOrder || !gradeOrder.length) {
      return { lo: 0, hi: 1, ticks: [] };
    }
    var lo = Math.max(0, Math.floor(Math.min.apply(null, ranks) - 1));
    var hi = Math.min(gradeOrder.length - 1, Math.ceil(Math.max.apply(null, ranks) + 1));
    if (hi <= lo) hi = Math.min(gradeOrder.length - 1, lo + 1);
    var mid = Math.round((lo + hi) / 2);
    var ticks = [lo, mid, hi].filter(function (v, i, arr) { return arr.indexOf(v) === i; }).map(function (v) {
      return { value: v, label: gradeOrder[v] || String(v) };
    });
    return { lo: lo, hi: hi, ticks: ticks };
  }

  function normalizeTerrainType(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var lower = raw.toLowerCase();
    for (var i = 0; i < TERRAIN_TYPES.length; i++) {
      if (TERRAIN_TYPES[i].toLowerCase() === lower) return TERRAIN_TYPES[i];
    }
    return '';
  }

  function mondayUtc(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function weekKey(date) {
    var m = mondayUtc(date);
    var y = m.getFullYear();
    var mo = String(m.getMonth() + 1).padStart(2, '0');
    var da = String(m.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + da;
  }

  function lastNWeekKeys(n, endDate) {
    var end = mondayUtc(endDate || new Date());
    var keys = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      d.setDate(d.getDate() - i * 7);
      keys.push(weekKey(d));
    }
    return keys;
  }

  function formatWeekLabel(key) {
    var parts = key.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function isClimbSession(row) {
    if (!row) return false;
    if (row.deleted_at) return false;
    if (row.is_checkin === true) return false;
    return true;
  }

  function medianGradeLabel(grades) {
    var ranked = [];
    for (var i = 0; i < grades.length; i++) {
      var r = gradeRank(grades[i]);
      if (r != null) ranked.push({ grade: grades[i], rank: r });
    }
    if (!ranked.length) return '';
    ranked.sort(function (a, b) { return a.rank - b.rank; });
    return ranked[Math.floor((ranked.length - 1) / 2)].grade;
  }

  function sentFlag(row) {
    var bz = String(row && row.baseline_zone ? row.baseline_zone : '').trim().toLowerCase();
    if (bz === 'sent') return true;
    if (bz === 'fell') return false;
    // dna and blank are not a send/fail. Optional boolean is a last-resort column.
    if (row && row.sent === true) return true;
    if (row && row.sent === false) return false;
    return null;
  }

  function computeProgressSeries(sessions, options) {
    var weekCount = (options && options.weekCount) || 12;
    var endDate = (options && options.endDate) || new Date();
    var ropedDiscipline = (options && options.ropedDiscipline) || 'all';
    var weeks = lastNWeekKeys(weekCount, endDate);
    var byWeek = {};
    weeks.forEach(function (k) {
      byWeek[k] = {
        key: k,
        label: formatWeekLabel(k),
        zones: emptyZoneCounts(),
        boulderByTerrain: {},
        ropedByTerrain: {}
      };
    });

    var dominant = dominantRopedSystem(sessions);
    var dominantSystem = dominant.system;
    var excludedOffSystem = 0;

    (sessions || []).forEach(function (row) {
      if (!isClimbSession(row) || !row.created_at) return;
      var created = new Date(row.created_at);
      if (isNaN(created.getTime())) return;
      var key = weekKey(created);
      if (!byWeek[key]) return;
      var bucket = byWeek[key];
      addZone(bucket.zones, row.zone);
      var family = classifyGradeFamily(row.grade_value);
      var sys = classifyGradeSystem(row.grade_value);
      if (family === 'roped' && dominantSystem && sys !== dominantSystem) {
        excludedOffSystem += 1;
      }
      var terrain = normalizeTerrainType(row.climbing_type);
      if (!terrain) return;
      if (family === 'boulder') {
        var br = boulderGradeRank(row.grade_value);
        if (br == null) return;
        if (!bucket.boulderByTerrain[terrain]) bucket.boulderByTerrain[terrain] = [];
        bucket.boulderByTerrain[terrain].push({ grade: String(row.grade_value).trim(), rank: br });
        return;
      }
      if (family !== 'roped') return;
      if (!dominantSystem || sys !== dominantSystem) return;
      if (!ropedDisciplineMatches(row.discipline, ropedDiscipline)) return;
      var rr = ropedGradeRank(row.grade_value, dominantSystem);
      if (rr == null) return;
      if (!bucket.ropedByTerrain[terrain]) bucket.ropedByTerrain[terrain] = [];
      bucket.ropedByTerrain[terrain].push({ grade: String(row.grade_value).trim(), rank: rr });
    });

    var zonePoints = weeks.map(function (k) {
      var pct = zonePercents(byWeek[k].zones);
      return {
        key: k,
        label: byWeek[k].label,
        comfort: pct.comfort,
        learning: pct.learning,
        panic: pct.panic,
        total: pct.total,
        zones: byWeek[k].zones
      };
    });

    var boulderGradeSeries = seriesFromTerrainBuckets(weeks, byWeek, 'boulderByTerrain');
    var ropedGradeSeries = seriesFromTerrainBuckets(weeks, byWeek, 'ropedByTerrain');
    var gradeSeries = boulderGradeSeries.length && !ropedGradeSeries.length
      ? boulderGradeSeries
      : (!boulderGradeSeries.length && ropedGradeSeries.length
        ? ropedGradeSeries
        : boulderGradeSeries.concat(ropedGradeSeries));

    var sessionCount = zonePoints.reduce(function (n, p) { return n + p.total; }, 0);
    var ropedOrder = dominantSystem ? ROPED_GRADE_ORDERS[dominantSystem] : [];
    return {
      weeks: weeks,
      labels: weeks.map(formatWeekLabel),
      zonePoints: zonePoints,
      gradeSeries: gradeSeries,
      boulderGradeSeries: boulderGradeSeries,
      ropedGradeSeries: ropedGradeSeries,
      boulderAxis: gradeAxisFromSeries(boulderGradeSeries, BOULDER_GRADE_ORDER),
      ropedAxis: gradeAxisFromSeries(ropedGradeSeries, ropedOrder),
      sessionCount: sessionCount,
      hasZoneTrend: zonePoints.some(function (p) { return p.total > 0; }),
      hasBoulderGradeTrend: boulderGradeSeries.length > 0,
      hasRopedGradeTrend: ropedGradeSeries.length > 0,
      hasGradeTrend: boulderGradeSeries.length > 0 || ropedGradeSeries.length > 0,
      ropedDiscipline: ropedDiscipline,
      ropedSystem: dominantSystem,
      ropedSystemLabel: dominantSystem ? ROPED_SYSTEM_LABELS[dominantSystem] : '',
      ropedGradeOrder: ropedOrder,
      boulderGradeOrder: BOULDER_GRADE_ORDER,
      excludedOffSystem: excludedOffSystem,
      excludedOffSystemOverall: dominant.excluded
    };
  }

  function summarizeGroup(rows) {
    var zones = emptyZoneCounts();
    var grades = [];
    var sentKnown = 0;
    var sentYes = 0;
    (rows || []).forEach(function (row) {
      addZone(zones, row.zone);
      if (row.grade_value) grades.push(String(row.grade_value).trim());
      var s = sentFlag(row);
      if (s != null) {
        sentKnown += 1;
        if (s) sentYes += 1;
      }
    });
    var pct = zonePercents(zones);
    return {
      count: (rows || []).length,
      zones: zones,
      percents: pct,
      medianGrade: medianGradeLabel(grades),
      sendRate: sentKnown ? Math.round((sentYes / sentKnown) * 100) : null,
      sentKnown: sentKnown
    };
  }

  function computeGapDiagnostic(sessions) {
    var climbRows = (sessions || []).filter(isClimbSession);
    var byTerrain = {};
    TERRAIN_TYPES.forEach(function (t) { byTerrain[t] = []; });
    var otherTerrain = [];

    climbRows.forEach(function (row) {
      var terrain = normalizeTerrainType(row.climbing_type);
      if (terrain) byTerrain[terrain].push(row);
      else if (row.climbing_type) otherTerrain.push(row);
    });

    var terrainRows = TERRAIN_TYPES.map(function (terrain) {
      return { terrain: terrain, summary: summarizeGroup(byTerrain[terrain]) };
    }).filter(function (row) { return row.summary.count > 0; });

    var highestComfort = null;
    var highestPanic = null;
    terrainRows.forEach(function (row) {
      if (!highestComfort || row.summary.percents.comfort > highestComfort.summary.percents.comfort) {
        highestComfort = row;
      }
      if (!highestPanic || row.summary.percents.panic > highestPanic.summary.percents.panic) {
        highestPanic = row;
      }
    });

    return {
      sessionCount: climbRows.length,
      terrains: terrainRows,
      otherTerrainCount: otherTerrain.length,
      highestComfortShare: highestComfort
        ? { terrain: highestComfort.terrain, percent: highestComfort.summary.percents.comfort, count: highestComfort.summary.count }
        : null,
      highestPanicShare: highestPanic
        ? { terrain: highestPanic.terrain, percent: highestPanic.summary.percents.panic, count: highestPanic.summary.count }
        : null
    };
  }

  function sessionWord(n) {
    return n === 1 ? 'session' : 'sessions';
  }

  /**
   * Plain-language gap headlines from terrain zone mix only.
   * Two-sided contrast only when comfort and panic peak on different terrains.
   * One logged terrain, or both peaks on the same terrain, is stated as-is —
   * never framed as a discipline split or a false two-sided gap.
   */
  function gapHeadlineModel(gap) {
    var terrains = (gap && gap.terrains) || [];
    var comfort = gap && gap.highestComfortShare;
    var panic = gap && gap.highestPanicShare;
    if (!terrains.length) return { contrast: false, lines: [] };

    var hasComfort = !!(comfort && comfort.percent > 0);
    var hasPanic = !!(panic && panic.percent > 0);
    var split = !!(
      terrains.length >= 2 &&
      hasComfort &&
      hasPanic &&
      comfort.terrain !== panic.terrain
    );

    if (split) {
      return {
        contrast: true,
        lines: [
          {
            kind: 'comfort',
            text: 'Most comfortable on ' + comfort.terrain +
              ' — ' + comfort.percent + '% comfort-zone across ' +
              comfort.count + ' ' + sessionWord(comfort.count) + '.'
          },
          {
            kind: 'panic',
            text: 'Least comfortable on ' + panic.terrain +
              ' — ' + panic.percent + '% panic-zone across ' +
              panic.count + ' ' + sessionWord(panic.count) + '.'
          }
        ]
      };
    }

    if (terrains.length === 1) {
      var only = terrains[0];
      var pct = only.summary.percents;
      return {
        contrast: false,
        lines: [{
          kind: 'single',
          text: only.terrain + ' is the only logged terrain so far — ' +
            pct.comfort + '% comfort-zone, ' + pct.panic + '% panic-zone across ' +
            only.summary.count + ' ' + sessionWord(only.summary.count) +
            '. No other terrain to compare yet.'
        }]
      };
    }

    var names = terrains.map(function (row) { return row.terrain; }).join(', ');
    if (comfort && panic && comfort.terrain === panic.terrain) {
      return {
        contrast: false,
        lines: [{
          kind: 'same',
          text: 'Comfort-zone and panic-zone shares both peak on ' + comfort.terrain +
            ' (' + comfort.percent + '% comfort, ' + panic.percent + '% panic across ' +
            comfort.count + ' ' + sessionWord(comfort.count) +
            '). Also logged: ' + names + '. No split across terrains yet.'
        }]
      };
    }

    return {
      contrast: false,
      lines: [{
        kind: 'single',
        text: 'Logged terrains: ' + names +
          ' — no comfort-zone vs panic-zone split across terrains yet.'
      }]
    };
  }

  function splitCsvLine(line) {
    var out = [];
    var cur = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function parseGymClimbsCsv(text) {
    var raw = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = raw.split('\n').filter(function (line) { return line.trim().length > 0; });
    if (!lines.length) {
      return { rows: [], errors: ['CSV is empty.'] };
    }
    var headers = splitCsvLine(lines[0]).map(function (h) {
      return String(h || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    });
    var alias = {
      name: 'name',
      climb: 'name',
      climb_name: 'name',
      wall_lane: 'wall_lane',
      wall: 'wall_lane',
      lane: 'wall_lane',
      wall_or_lane: 'wall_lane',
      'wall/lane': 'wall_lane',
      angle: 'angle',
      steepness: 'steepness',
      terrain_type: 'terrain_type',
      terrain: 'terrain_type',
      type: 'terrain_type'
    };
    var mapped = headers.map(function (h) { return alias[h] || ''; });
    if (mapped.indexOf('name') === -1) {
      return { rows: [], errors: ['CSV needs a name column.'] };
    }
    var rows = [];
    var errors = [];
    for (var i = 1; i < lines.length; i++) {
      var cells = splitCsvLine(lines[i]);
      var row = { name: '', wall_lane: '', angle: '', steepness: '', terrain_type: '' };
      for (var c = 0; c < mapped.length; c++) {
        if (!mapped[c]) continue;
        row[mapped[c]] = String(cells[c] != null ? cells[c] : '').trim();
      }
      var check = validateGymClimbRow(row);
      if (!check.ok) {
        errors.push('Row ' + (i + 1) + ': ' + check.error);
        continue;
      }
      rows.push(check.row);
    }
    return { rows: rows, errors: errors };
  }

  function validateGymClimbRow(input) {
    var name = String(input && input.name ? input.name : '').trim();
    if (!name) return { ok: false, error: 'Name is required.' };
    var terrain = normalizeTerrainType(input && input.terrain_type);
    if (input && String(input.terrain_type || '').trim() && !terrain) {
      return { ok: false, error: 'Terrain must be Slab, Vertical, Overhang, Roof, or Crack.' };
    }
    return {
      ok: true,
      row: {
        name: name,
        wall_lane: String(input && input.wall_lane ? input.wall_lane : '').trim(),
        angle: String(input && input.angle ? input.angle : '').trim(),
        steepness: String(input && input.steepness ? input.steepness : '').trim(),
        terrain_type: terrain || null
      }
    };
  }

  function isStarredProject(row) {
    if (!row) return false;
    if (row.deleted_at) return false;
    return row.is_project === true || row.is_project === 'true';
  }

  function countAttemptsForClimb(sessions, climbId) {
    if (!climbId) return 0;
    var n = 0;
    var list = sessions || [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!isClimbSession(s)) continue;
      if (s.climb_id === climbId) n += 1;
    }
    return n;
  }

  function buildAthleteProjectList(climbs, sessions) {
    var out = [];
    var list = climbs || [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!isStarredProject(c) || !c.id) continue;
      var terrain = normalizeTerrainType(c.climbing_type) || String(c.climbing_type || '').trim();
      out.push({
        id: c.id,
        name: String(c.name || '').trim() || 'Unnamed climb',
        grade: String(c.grade_value || '').trim(),
        terrain: terrain,
        attempts: countAttemptsForClimb(sessions, c.id)
      });
    }
    return out;
  }

  var api = {
    TERRAIN_TYPES: TERRAIN_TYPES,
    GRADE_ORDER: GRADE_ORDER,
    BOULDER_GRADE_ORDER: BOULDER_GRADE_ORDER,
    YDS_GRADE_ORDER: YDS_GRADE_ORDER,
    FRENCH_GRADE_ORDER: FRENCH_GRADE_ORDER,
    BRITISH_GRADE_ORDER: BRITISH_GRADE_ORDER,
    E_GRADE_ORDER: E_GRADE_ORDER,
    ROPED_SYSTEM_LABELS: ROPED_SYSTEM_LABELS,
    normalizeZone: normalizeZone,
    emptyZoneCounts: emptyZoneCounts,
    zonePercents: zonePercents,
    gradeRank: gradeRank,
    boulderGradeRank: boulderGradeRank,
    ropedGradeRank: ropedGradeRank,
    classifyGradeSystem: classifyGradeSystem,
    classifyGradeFamily: classifyGradeFamily,
    normalizeRopedDisciplineGroup: normalizeRopedDisciplineGroup,
    ropedDisciplineMatches: ropedDisciplineMatches,
    dominantRopedSystem: dominantRopedSystem,
    gradeAxisFromSeries: gradeAxisFromSeries,
    normalizeTerrainType: normalizeTerrainType,
    computeProgressSeries: computeProgressSeries,
    computeGapDiagnostic: computeGapDiagnostic,
    gapHeadlineModel: gapHeadlineModel,
    parseGymClimbsCsv: parseGymClimbsCsv,
    validateGymClimbRow: validateGymClimbRow,
    weekKey: weekKey,
    lastNWeekKeys: lastNWeekKeys,
    formatWeekLabel: formatWeekLabel,
    isStarredProject: isStarredProject,
    countAttemptsForClimb: countAttemptsForClimb,
    buildAthleteProjectList: buildAthleteProjectList,
    CSV_TEMPLATE: 'name,wall_lane,angle,steepness,terrain_type\nExample climb,Lane 1,20,slight,Slab\n'
  };

  global.CoachInsights = api;
})(typeof window !== 'undefined' ? window : globalThis);
