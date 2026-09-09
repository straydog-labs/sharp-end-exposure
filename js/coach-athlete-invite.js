/**
 * Coach-generated athlete invites. Inserts into public.invites (role=athlete).
 * Redemption is athlete-side; this module only creates tokens and UI helpers.
 */
(function (global) {
  'use strict';

  var STARTER_NAMES = [
    'ARC',
    'Capacity',
    'Silent Feet',
    'Hip CARs',
    'Downclimbing Practice'
  ];
  var STARTER_FOCUS_FALLBACK = [
    'Cardio & Capacity',
    'Mobility & Flexibility',
    'Technique & Footwork',
    'Routes'
  ];
  var WELCOME_KEY_PREFIX = 'see.coachInviteWelcome.v1.';
  var BANNER_KEY_PREFIX = 'see.coachInviteJoinBanner.v1.';

  function randomToken() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID().replace(/-/g, '');
    }
    var bytes = new Uint8Array(16);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(bytes);
    } else {
      var i;
      for (i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var hex = [];
    for (i = 0; i < bytes.length; i++) hex.push(('0' + bytes[i].toString(16)).slice(-2));
    return hex.join('');
  }

  function buildInsertPayload(coachId, token) {
    return {
      role: 'athlete',
      coach_id: coachId,
      token: String(token || '')
    };
  }

  function athleteAppBaseUrl(loc) {
    loc = loc || (typeof global.location !== 'undefined' ? global.location : { origin: '', pathname: '/' });
    var origin = loc.origin || '';
    var path = String(loc.pathname || '/');
    var dir = path.replace(/[^/]+$/, '');
    if (!dir) dir = '/';
    return origin + dir;
  }

  function inviteUrl(token, loc) {
    var base = athleteAppBaseUrl(loc);
    if (base.charAt(base.length - 1) !== '/') base += '/';
    return base + '?invite=' + encodeURIComponent(String(token || ''));
  }

  // Coach-dashboard deep link from the athlete app's post-signup
  // "Invite an athlete" choice. Only the sentinel value "open" — a real
  // invite token is left alone (those belong on index.html).
  function consumeOpenInviteParam(loc, historyApi) {
    loc = loc || (typeof global.location !== 'undefined' ? global.location : null);
    if (!loc) return false;
    var search = '';
    try { search = String(loc.search || ''); } catch (err) { return false; }
    var params;
    try { params = new URLSearchParams(search); } catch (err) { return false; }
    if (params.get('invite') !== 'open') return false;
    params.delete('invite');
    var qs = params.toString();
    var path = String(loc.pathname || '') + (qs ? '?' + qs : '') + String(loc.hash || '');
    try {
      var hist = historyApi || (typeof global.history !== 'undefined' ? global.history : null);
      if (hist && typeof hist.replaceState === 'function') {
        hist.replaceState(hist.state || null, '', path);
      }
    } catch (err) { /* ignore */ }
    return true;
  }

  function storageGet(key, fallback) {
    try {
      if (!global.localStorage) return fallback;
      var raw = global.localStorage.getItem(key);
      return raw == null ? fallback : raw;
    } catch (err) {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      if (!global.localStorage) return;
      global.localStorage.setItem(key, value);
    } catch (err) { /* private mode */ }
  }

  function welcomeStorageKey(userId) {
    return WELCOME_KEY_PREFIX + String(userId || '');
  }

  function bannerStorageKey(userId) {
    return BANNER_KEY_PREFIX + String(userId || '');
  }

  function hasSeenWelcome(userId) {
    return storageGet(welcomeStorageKey(userId), '') === '1';
  }

  function markWelcomeSeen(userId) {
    storageSet(welcomeStorageKey(userId), '1');
  }

  function seenBannerInviteIds(userId) {
    var raw = storageGet(bannerStorageKey(userId), '');
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function markBannerInviteSeen(userId, inviteId) {
    if (!inviteId) return;
    var ids = seenBannerInviteIds(userId);
    if (ids.indexOf(inviteId) === -1) ids.push(inviteId);
    storageSet(bannerStorageKey(userId), JSON.stringify(ids));
  }

  function shouldShowWelcome(opts) {
    opts = opts || {};
    if (opts.seenWelcome) return false;
    if ((opts.inviteCount || 0) > 0) return false;
    if ((opts.rosterCount || 0) > 0) return false;
    return true;
  }

  function athleteFirstName(row) {
    var first = String(row && row.athlete_first_name != null ? row.athlete_first_name : '').trim();
    if (first) return first;
    var email = String(row && row.athlete_email != null ? row.athlete_email : '').trim();
    if (email && email.indexOf('@') !== -1) {
      var local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
      if (local) {
        return local.charAt(0).toUpperCase() + local.slice(1);
      }
    }
    return 'Your athlete';
  }

  function joinBannerCopy(row) {
    return athleteFirstName(row) + ' just joined — assign her first climb';
  }

  function inviteIsUsed(inv) {
    return !!(inv && inv.used_at && inv.used_by);
  }

  function joinBanners(invites, roster, seenInviteIds) {
    var seen = {};
    (seenInviteIds || []).forEach(function (id) { seen[id] = true; });
    var byAthlete = {};
    (roster || []).forEach(function (r) {
      if (r && r.athlete_id) byAthlete[r.athlete_id] = r;
    });
    var out = [];
    (invites || []).forEach(function (inv) {
      if (!inv || !inv.id || seen[inv.id]) return;
      if (!inviteIsUsed(inv)) return;
      var row = byAthlete[inv.used_by];
      if (!row) return;
      out.push({ inviteId: inv.id, athlete: row, usedAt: inv.used_at });
    });
    out.sort(function (a, b) {
      return String(b.usedAt || '').localeCompare(String(a.usedAt || ''));
    });
    return out;
  }

  function isWarmupForClimbing(item) {
    var name = String(item && item.name || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^warmup for climbing$/i.test(name)) return true;
    var focus = String(item && (item.training_focus || item._focus) || '').toLowerCase();
    if (focus === 'warm-ups' || focus === 'warmup' || focus === 'warmups') return true;
    return false;
  }

  function starterShortlist(libraryRows) {
    var rows = (libraryRows || []).filter(function (item) {
      return item && item.id && item.name && !isWarmupForClimbing(item);
    });
    var picked = [];
    var used = {};
    function push(item) {
      if (!item || used[item.id]) return;
      used[item.id] = true;
      picked.push(item);
    }
    STARTER_NAMES.forEach(function (want) {
      var lower = want.toLowerCase();
      var i;
      for (i = 0; i < rows.length; i++) {
        if (String(rows[i].name).toLowerCase() === lower) {
          push(rows[i]);
          break;
        }
      }
    });
    if (picked.length < 3) {
      STARTER_FOCUS_FALLBACK.forEach(function (focus) {
        if (picked.length >= 5) return;
        var i;
        for (i = 0; i < rows.length && picked.length < 5; i++) {
          var f = String(rows[i].training_focus || rows[i]._focus || '');
          if (f === focus) push(rows[i]);
        }
      });
    }
    if (picked.length < 3) {
      var j;
      for (j = 0; j < rows.length && picked.length < 5; j++) push(rows[j]);
    }
    return picked.slice(0, 5);
  }

  global.CoachAthleteInvite = {
    STARTER_NAMES: STARTER_NAMES,
    randomToken: randomToken,
    buildInsertPayload: buildInsertPayload,
    athleteAppBaseUrl: athleteAppBaseUrl,
    inviteUrl: inviteUrl,
    consumeOpenInviteParam: consumeOpenInviteParam,
    hasSeenWelcome: hasSeenWelcome,
    markWelcomeSeen: markWelcomeSeen,
    seenBannerInviteIds: seenBannerInviteIds,
    markBannerInviteSeen: markBannerInviteSeen,
    shouldShowWelcome: shouldShowWelcome,
    athleteFirstName: athleteFirstName,
    joinBannerCopy: joinBannerCopy,
    joinBanners: joinBanners,
    isWarmupForClimbing: isWarmupForClimbing,
    starterShortlist: starterShortlist,
    welcomeStorageKey: welcomeStorageKey,
    bannerStorageKey: bannerStorageKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
