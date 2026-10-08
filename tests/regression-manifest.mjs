export const FLOWS = [
  { id: 'log-climb', group: 'athlete', file: 'real-flow-log-climb.test.mjs', covered: true, asserts: 'POST sessions baseline_zone+grade+terrain+route_name' },
  { id: 'attempt-home-recent', group: 'athlete', file: 'log-attempt-named-route.test.mjs', covered: true, asserts: 'POST sessions route_name+climb_id' },
  { id: 'attempt-climb-table', group: 'athlete', file: 'log-attempt-named-route.test.mjs', covered: true, asserts: 'POST sessions route_name+climb_id' },
  { id: 'attempt-pinned-strip', group: 'athlete', file: 'log-attempt-named-route.test.mjs', covered: true, asserts: 'POST sessions route_name+climb_id' },
  { id: 'attempt-locked-route', group: 'athlete', file: 'log-attempt-named-route.test.mjs', covered: true, asserts: 'POST sessions route_name+climb_id' },
  { id: 'attempt-route-history', group: 'athlete', file: 'log-attempt-named-route.test.mjs', covered: true, asserts: 'POST sessions route_name+climb_id' },
  { id: 'attempt-complete-drill', group: 'athlete', file: 'log-attempt-named-route.test.mjs', covered: true, asserts: 'POST sessions route_name+climb_id' },
  { id: 'fall-practice', group: 'athlete', file: 'fall-practice.test.mjs', covered: true, asserts: 'POST fall_practice+fall_count, no falls insert' },
  { id: 'edit-sheet', group: 'athlete', file: 'real-flow-edit-sheet.test.mjs', covered: true, asserts: 'PATCH sessions baseline_zone' },
  { id: 'coach-log-athlete', group: 'coach', file: 'real-flow-coach-log.test.mjs', covered: true, asserts: 'POST sessions logged_by_coach+user_id' },
  { id: 'attempt-inventory', group: 'meta', file: 'attempt-inventory.test.mjs', covered: true, asserts: 'every addAttemptFromLog/launchLogWithClimb site maps to a flow' },
  { id: 'schema-drift', group: 'meta', file: 'schema-drift.test.mjs', covered: true, asserts: 'every insert column exists in sql/' },
  { id: 'pw-no-download', group: 'meta', file: 'pw-no-download.test.mjs', covered: true, asserts: 'PLAYWRIGHT_BROWSERS_PATH /opt/pw-browsers, no test-level Chromium download' }
];

export const NOT_COVERED = [
  { id: 'voice-log', group: 'athlete', reason: 'voice parse has unit checks in-page; no stubbed-REST Playwright POST' },
  { id: 'prepare-checkin', group: 'athlete', reason: 'prepare flow POSTs sessions is_checkin; not in this net yet' },
  { id: 'home-day-attempt', group: 'athlete', reason: 'same climbAttemptRowHtml as Home recent; no separate day-sheet flow' },
  { id: 'go-deeper-confirm', group: 'athlete', reason: 'Go Deeper PATCH zone_confidence not in this net' },
  { id: 'offline-queue-generic', group: 'athlete', reason: 'offline replay covered for fall_practice only' }
];

export const ATTEMPT_SITE_RULES = [
  { fn: 'launchLogWithClimb', flow: 'attempt-pinned-strip', match: /ctaOnclick:\s*'launchLogWithClimb\(/ },
  { fn: 'launchLogWithClimb', flow: 'attempt-complete-drill', match: /launchLogWithClimb\(match\.climb_id/ },
  { fn: 'launchLogWithClimb', flow: 'attempt-locked-route', match: /launchLogWithClimb\(climbId,\s*routeName/ },
  { fn: 'addAttemptFromLog', flow: 'attempt-climb-table', match: /climb-table-attempt/ },
  { fn: 'addAttemptFromLog', flow: 'attempt-route-history', match: /_rhClimbName/ },
  { fn: 'addAttemptFromLog', flow: 'attempt-home-recent', match: /this\.dataset\.origin/ }
];
