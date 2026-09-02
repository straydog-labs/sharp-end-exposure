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

  var LEAD_DISCIPLINES = {
    lead: true,
    sport: true,
    trad: true,
    'top rope': true,
    'auto belay': true
  };

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
    var d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    var day = d.getUTCDay();
    var diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d;
  }

  function weekKey(date) {
    var m = mondayUtc(date);
    var y = m.getUTCFullYear();
    var mo = String(m.getUTCMonth() + 1).padStart(2, '0');
    var da = String(m.getUTCDate()).padStart(2, '0');
    return y + '-' + mo + '-' + da;
  }

  function lastNWeekKeys(n, endDate) {
    var end = mondayUtc(endDate || new Date());
    var keys = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(end.getTime());
      d.setUTCDate(d.getUTCDate() - i * 7);
      keys.push(weekKey(d));
    }
    return keys;
  }

  function formatWeekLabel(key) {
    var parts = key.split('-');
    var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function isClimbSession(row) {
    if (!row) return false;
    if (row.deleted_at) return false;
    if (row.is_checkin === true) return false;
    return true;
  }

  /**
   * Boulder vs lead from real logged columns only:
   * sessions.discipline first, then sessions.grade_value scale.
   * climbing_type in this app is terrain (Slab/Vertical/…), not boulder/lead.
   */
  function classifyBoulderVsLead(row) {
    var d = String(row && row.discipline ? row.discipline : '').trim().toLowerCase();
    if (d === 'boulder') return 'boulder';
    if (LEAD_DISCIPLINES[d]) return 'lead';
    var g = String(row && row.grade_value ? row.grade_value : '').trim();
    if (!g) return '';
    if (/^vb$/i.test(g) || /^v\d/i.test(g)) return 'boulder';
    if (/^5\.\d/.test(g)) return 'lead';
    if (/^(4|5|6|7|8|9)[abc]/i.test(g)) return 'lead';
    if (/^(mod|diff|vdiff|hvd|sev|hs|vs|hvs|e\d{1,2})$/i.test(g)) return 'lead';
    return '';
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
    var weeks = lastNWeekKeys(weekCount, endDate);
    var byWeek = {};
    weeks.forEach(function (k) {
      byWeek[k] = {
        key: k,
        label: formatWeekLabel(k),
        zones: emptyZoneCounts(),
        gradesByTerrain: {}
      };
    });

    (sessions || []).forEach(function (row) {
      if (!isClimbSession(row) || !row.created_at) return;
      var created = new Date(row.created_at);
      if (isNaN(created.getTime())) return;
      var key = weekKey(created);
      if (!byWeek[key]) return;
      var bucket = byWeek[key];
      addZone(bucket.zones, row.zone);
      var terrain = normalizeTerrainType(row.climbing_type);
      var rank = gradeRank(row.grade_value);
      if (terrain && rank != null) {
        if (!bucket.gradesByTerrain[terrain]) bucket.gradesByTerrain[terrain] = [];
        bucket.gradesByTerrain[terrain].push({ grade: String(row.grade_value).trim(), rank: rank });
      }
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

    var terrains = TERRAIN_TYPES.slice();
    var gradeSeries = terrains.map(function (terrain) {
      var points = weeks.map(function (k) {
        var list = byWeek[k].gradesByTerrain[terrain] || [];
        if (!list.length) return { key: k, label: byWeek[k].label, rank: null, grade: '' };
        var sum = 0;
        for (var i = 0; i < list.length; i++) sum += list[i].rank;
        var avg = sum / list.length;
        var nearest = list.slice().sort(function (a, b) {
          return Math.abs(a.rank - avg) - Math.abs(b.rank - avg);
        })[0];
        return { key: k, label: byWeek[k].label, rank: avg, grade: nearest.grade };
      });
      return { terrain: terrain, points: points };
    }).filter(function (series) {
      return series.points.some(function (p) { return p.rank != null; });
    });

    var sessionCount = zonePoints.reduce(function (n, p) { return n + p.total; }, 0);
    return {
      weeks: weeks,
      labels: weeks.map(formatWeekLabel),
      zonePoints: zonePoints,
      gradeSeries: gradeSeries,
      sessionCount: sessionCount,
      hasZoneTrend: zonePoints.some(function (p) { return p.total > 0; }),
      hasGradeTrend: gradeSeries.length > 0
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
    var boulder = [];
    var lead = [];
    var unclassified = 0;
    var byTerrain = {};
    TERRAIN_TYPES.forEach(function (t) { byTerrain[t] = []; });
    var otherTerrain = [];

    climbRows.forEach(function (row) {
      var side = classifyBoulderVsLead(row);
      if (side === 'boulder') boulder.push(row);
      else if (side === 'lead') lead.push(row);
      else unclassified += 1;

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
      boulder: summarizeGroup(boulder),
      lead: summarizeGroup(lead),
      unclassifiedCount: unclassified,
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

  var api = {
    TERRAIN_TYPES: TERRAIN_TYPES,
    GRADE_ORDER: GRADE_ORDER,
    normalizeZone: normalizeZone,
    emptyZoneCounts: emptyZoneCounts,
    zonePercents: zonePercents,
    gradeRank: gradeRank,
    normalizeTerrainType: normalizeTerrainType,
    classifyBoulderVsLead: classifyBoulderVsLead,
    computeProgressSeries: computeProgressSeries,
    computeGapDiagnostic: computeGapDiagnostic,
    parseGymClimbsCsv: parseGymClimbsCsv,
    validateGymClimbRow: validateGymClimbRow,
    weekKey: weekKey,
    lastNWeekKeys: lastNWeekKeys,
    CSV_TEMPLATE: 'name,wall_lane,angle,steepness,terrain_type\nExample climb,Lane 1,20,slight,Slab\n'
  };

  global.CoachInsights = api;
})(typeof window !== 'undefined' ? window : globalThis);
