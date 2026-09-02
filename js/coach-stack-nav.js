/**
 * Coach dashboard stack navigation (roster -> athlete -> hub pane).
 * Mobile (<=820px) uses a full-screen overlay; desktop is a no-op besides
 * scroll-to-top of the detail panel. No gym/person hardcoding.
 */
(function (global) {
  'use strict';

  var MOBILE_MQ = '(max-width: 820px)';

  function isMobile(matchMediaFn) {
    var mm = typeof matchMediaFn === 'function' ? matchMediaFn(MOBILE_MQ) : matchMediaFn;
    return !!(mm && mm.matches);
  }

  function backAction(athletePane, hasAthleteCtx) {
    if (athletePane && hasAthleteCtx) return 'landing';
    return 'roster';
  }

  function openDetail(state) {
    if (state.layout && state.layout.classList) state.layout.classList.add('detail-open');
    if (state.panel) state.panel.scrollTop = 0;
    if (state.mobile && state.body && state.body.style) state.body.style.overflow = 'hidden';
    return state;
  }

  function closeDetail(state) {
    if (state.layout && state.layout.classList) state.layout.classList.remove('detail-open');
    if (state.body && state.body.style) state.body.style.overflow = '';
    return state;
  }

  function showLanding(state) {
    if (state.landing && state.landing.style) state.landing.style.display = '';
    if (state.sub && state.sub.style) state.sub.style.display = 'none';
    if (state.panel) state.panel.scrollTop = 0;
    return state;
  }

  function showSubview(state) {
    if (state.landing && state.landing.style) state.landing.style.display = 'none';
    if (state.sub && state.sub.style) state.sub.style.display = '';
    if (state.panel) state.panel.scrollTop = 0;
    return state;
  }

  function syncBackButton(btn, opts) {
    opts = opts || {};
    if (!btn) return '';
    var action = backAction(opts.pane, !!opts.hasAthlete);
    if (action === 'landing') {
      var label = opts.athleteLabel || 'Athlete';
      btn.textContent = '← ' + label;
      if (btn.setAttribute) btn.setAttribute('aria-label', 'Back to ' + label);
    } else {
      btn.textContent = '← Roster';
      if (btn.setAttribute) btn.setAttribute('aria-label', 'Back to roster');
    }
    return action;
  }

  function bodyOverflowAfterWizardClose(opts) {
    opts = opts || {};
    return (opts.mobile && opts.detailOpen) ? 'hidden' : '';
  }

  global.CoachStackNav = {
    MOBILE_MQ: MOBILE_MQ,
    isMobile: isMobile,
    backAction: backAction,
    openDetail: openDetail,
    closeDetail: closeDetail,
    showLanding: showLanding,
    showSubview: showSubview,
    syncBackButton: syncBackButton,
    bodyOverflowAfterWizardClose: bodyOverflowAfterWizardClose
  };
})(typeof window !== 'undefined' ? window : globalThis);
