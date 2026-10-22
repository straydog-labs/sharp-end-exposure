import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index318'/.test(index));
assert.ok(/APP_VERSION = 'index318'/.test(sw));

function extractFn(src, name){
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' missing');
  let i = src.indexOf('{', start);
  let depth = 0;
  for(; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){
      depth--;
      if(depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function extractBetween(src, startId, endId){
  const start = src.indexOf('id="' + startId + '"');
  assert.ok(start >= 0, startId + ' missing');
  const end = src.indexOf('id="' + endId + '"', start);
  assert.ok(end > start, endId + ' after ' + startId);
  return src.slice(start, end);
}

const home = extractBetween(index, 'screen-home', 'screen-sessions');
assert.ok(/id="home-greeting"/.test(home));
assert.ok(/id="home-week-dots"/.test(home));
assert.ok(/id="home-today-card"/.test(home));
assert.ok(/id="home-action-row"/.test(home));
assert.ok(/id="home-card-log"/.test(home));
assert.ok(/onclick="startLogFlow\(\)"/.test(home));
assert.ok(/id="home-action-train"/.test(home));
assert.ok(/showScreen\('screen-train-start'\)/.test(home));
assert.ok(home.indexOf('id="home-today-card"') < home.indexOf('id="home-action-row"'));
assert.ok(home.indexOf('id="home-action-row"') < home.indexOf('id="home-welcome-hint"'));
assert.ok(home.indexOf('id="home-welcome-hint"') < home.indexOf('id="home-projects-wrap"'));
assert.ok(home.indexOf('id="home-projects-wrap"') < home.indexOf('id="home-recent-wrap"'), 'H3 last session before week card');
assert.ok(home.indexOf('id="home-recent-wrap"') < home.indexOf('id="home-streak-band"'), 'H3 week card after last session');
assert.ok(/id="home-today-log-attempt"/.test(home));
assert.ok(/launchHomeProjectLog/.test(home));
assert.ok(/onclick="showClimbTable\(\)"/.test(home));
assert.ok(/id="home-welcome-hint"/.test(home));
assert.ok(/id="home-due-see-all"/.test(home));
assert.ok(/showScreen\('screen-train-assignments'\)/.test(home));
assert.ok(/id="home-goals-strip"/.test(home));
assert.ok(/id="home-action-psyche"/.test(home));
assert.ok(/id="home-action-psyche"[\s\S]*?showScreen\('screen-drill'\)/.test(home));
assert.ok(/id="home-action-train"[\s\S]*?showScreen\('screen-train-start'\)/.test(home));
assert.ok(/\.home-week-dots\{display:flex/.test(index));
assert.ok(!/\.home-week-dots\{display:none !important/.test(index));
assert.ok(/\.home-streak-label\{[^}]*overflow:visible/.test(index));
assert.ok(/\.home-streak-band\{[^}]*overflow:visible/.test(index));
assert.ok(/\.home-streak-label\{[^}]*padding:0 4px/.test(index));
assert.ok(/\.home-zone-bar\[hidden\]/.test(index));
assert.ok(/showScreen\('screen-train-goals'\)/.test(home));
assert.ok(/Set a goal to guide your training/.test(home));
assert.ok(/id="home-goals-title"/.test(home));
assert.ok(/id="home-day-sheet"/.test(home));
assert.ok(/id="home-today-kicker"/.test(home));
assert.ok(/id="home-card-log"[\s\S]*Log a climb/.test(home));
assert.ok(/id="home-action-train"[^>]*>Train</.test(home));
assert.ok(/id="home-action-psyche"[^>]*>Psyche</.test(home));
assert.ok(/id="home-today-log-climb"/.test(home));
assert.ok(/id="home-today-star"/.test(home));
assert.ok(/id="home-today-checklist"/.test(home));
assert.ok(/class="home-action-outline"/.test(home));
assert.ok(/\.home-action-outline\{[^}]*border:1px solid var\(--accent\)/.test(index));
assert.ok(/\.home-action-outline\{[^}]*min-height:48px/.test(index));
assert.ok(/\.home-action-row\{[^}]*gap:8px/.test(index));
assert.ok(!/>Start training</.test(home), 'quiet Start training link is gone');
assert.ok(/id="home-goals-strip"[\s\S]*?te-icon[\s\S]*?Set a goal to guide your training/.test(home));
assert.ok(/id="home-assign-detail"/.test(home));
assert.ok(!/What to do today/.test(home));
assert.ok(!/Start a streak today/.test(home));
assert.ok(!/id="home-card-train"/.test(home));
assert.ok(!/Round complete/.test(home));
assert.ok(!/Mark complete/.test(home));
assert.ok(!/0\/1 done/.test(home));
assert.ok(!/No due date/.test(home));

const initAuth = extractFn(index, 'initAuth');
const applyAuth = extractFn(index, 'applyAuthStateChange');
const routeOnLoad = extractFn(index, 'routeOnLoad');
assert.ok(/routeSignedInHome\s*\(/.test(applyAuth), 'signed-in auth route uses routeSignedInHome');
assert.ok(/onAuthStateChange\(applyAuthStateChange\)/.test(initAuth), 'initAuth wires applyAuthStateChange');
assert.ok(/routeSignedInHome\s*\(/.test(routeOnLoad), 'load route uses routeSignedInHome');
assert.ok(!/loadHomeScreen\s*\(/.test(applyAuth), 'applyAuthStateChange must not call loadHomeScreen');
assert.ok(!/loadHomeScreen\s*\(/.test(initAuth), 'initAuth must not call loadHomeScreen');
assert.ok(!/loadHomeScreen\s*\(/.test(routeOnLoad), 'routeOnLoad must not call loadHomeScreen');
assert.ok(/if\(id==='screen-home'\)\{\s*loadHomeScreen\(\)/.test(extractFn(index, 'showScreen')));

const fetchSrc = extractFn(index, 'fetchTrainAssignmentsForAthlete');
assert.ok(/applyLiveTitleDescriptionForBlockAssignmentsAsync/.test(fetchSrc));
assert.ok(/select=\*&athlete_id=eq\./.test(fetchSrc));
assert.ok(/training_block_sessions/.test(extractFn(index, 'applyLiveTitleDescriptionForBlockAssignmentsAsync')));

const dueSrc = extractFn(index, 'loadHomeDueList');
assert.ok(/slice\(0,\s*3\)/.test(dueSrc));
assert.ok(/homeDueRowHtml/.test(dueSrc));
assert.ok(!/trainCardHtml/.test(dueSrc));
assert.ok(/openHomeAssignmentDetail/.test(extractFn(index, 'homeDueRowHtml')));
assert.ok(/wrap\.hidden = true/.test(dueSrc), 'due-this-week list stays hidden on redesigned Home');
assert.ok(!/athlete_goals/.test(extractFn(index, 'loadHomeGoalsStrip')));
assert.ok(/loadHomeSessionCaches/.test(extractFn(index, 'loadHomeStreakBand')));
assert.ok(/loadHomeSessionCaches/.test(extractFn(index, 'loadHomeRecentActivity')));
assert.ok(/sbS\(\s*'sessions'/.test(extractFn(index, 'loadHomeSessionCaches')));
assert.ok(/loadClimbCache/.test(extractFn(index, 'loadHomeProjectsStrip')));
assert.ok(/LOG_WHICH_LOAD_MS/.test(extractFn(index, 'loadHomeScreen')));
assert.ok(/homeWeekSessionLabel/.test(extractFn(index, 'paintHomeWeekFromCaches')));
assert.ok(/launchLogWithClimb\(climbId,\s*routeName/.test(extractFn(index, 'launchHomeProjectLog')));
assert.ok(/showAddAttempt:\s*true/.test(extractFn(index, 'homeDayClimbRowHtml')));
assert.ok(/_climbCacheHasProject\s*=\s*true/.test(extractFn(index, 'loadClimbCache')));
assert.ok(/function sbSWasOk/.test(index));
assert.ok(/_sbSResultOk/.test(index));
assert.ok(/see_home_v3_star_off_/.test(extractFn(index, 'homeStarOffKey')));
assert.ok(/function noteHomeSessionRow/.test(index));
assert.ok(/homeCachesOk\(\)/.test(extractFn(index, 'decideHomePrompt')));
assert.ok(/lastAtSource/.test(extractFn(index, 'listOpenLogProjects')));
assert.ok(/pickHomeUndatedAssignment/.test(extractFn(index, 'decideHomePrompt')));
assert.ok(/s6-assign/.test(extractFn(index, 'decideHomePrompt')));
assert.ok(!/Other projects/.test(index), 'G1 never titles the strip Other projects');
assert.ok(/My projects/.test(extractFn(index, 'paintHomeProjectsStrip')));
assert.ok(/pickHomeProjectsForStrip/.test(extractFn(index, 'paintHomeProjectsStrip')));
assert.ok(/0 attempts · added /.test(extractFn(index, 'paintHomeProjectsStrip')));
assert.ok(/n < 1/.test(extractFn(index, 'paintHomeWeekFromCaches')));
assert.ok(/homeStarCtaLabel/.test(extractFn(index, 'paintHomePrompt')));
assert.ok(/kickerEl\) kickerEl\.textContent = 'PROJECT'/.test(extractFn(index, 'paintHomePrompt')));
assert.ok(/state === 's5'/.test(extractFn(index, 'paintHomePrompt')));
assert.ok(/min-height:44px/.test(index));
assert.ok(/min-height:52px/.test(index));
assert.ok(/-webkit-line-clamp:2/.test(index));
assert.ok(/aria-current/.test(extractFn(index, 'paintHomeProjectsStrip')));
assert.ok(/id="home-projects-label"/.test(home));
assert.ok(/id="home-recent-label"/.test(home));
assert.ok(/Last session/.test(home));
assert.ok(!/overflow-x:\s*auto/.test(extractFn(index, 'paintHomeProjectsStrip')) && !/\.home-projects-strip\{[^}]*overflow-x:auto/.test(index));
assert.ok(/kicker === 'TODAY'/.test(extractFn(index, 'fillHomeAssignmentStart')));
assert.ok(/function attemptCountLabel/.test(index));
assert.ok(/home-today-log-climb/.test(extractFn(index, 'paintHomePrompt')));
assert.ok(/state === 's0'/.test(extractFn(index, 'paintHomePrompt')));
assert.ok(/cta === 'start-train'/.test(extractFn(index, 'paintHomeActionRow')));
assert.ok(/cta === 'log-climb'/.test(extractFn(index, 'paintHomeActionRow')));
assert.ok(/cta === 'psyche'/.test(extractFn(index, 'paintHomeActionRow')));
assert.ok(!/cta === 'start' \|\| cta === 'start-train'/.test(extractFn(index, 'paintHomeActionRow')));
assert.ok(!/home-action-filled/.test(extractFn(index, 'paintHomeActionRow')), 'action row is outline only');
assert.ok(/\.quick-project-row\{[^}]*min-height:52px/.test(index));
assert.ok(/\.quick-attempt-btn\{[^}]*min-height:44px/.test(index));
assert.ok(/container-type:\s*inline-size/.test(index));
assert.ok(/climb-hist-row/.test(index));
assert.ok(/count>0\?'var\(--text\)'/.test(extractFn(index, 'buildFallsByTerrain')) || /count>0\?['"]var\(--text\)['"]/.test(extractFn(index, 'buildFallsByTerrain')));
assert.ok(!/#e84444/.test(extractFn(index, 'buildFallsByTerrain')));
assert.ok(/id="rh-falls"[^>]*color:var\(--text\)/.test(index));

const detailSrc = extractFn(index, 'openHomeAssignmentDetail');
assert.ok(/trainCardHtml/.test(detailSrc));
assert.ok(/wireTrainCheckboxes/.test(detailSrc));
assert.ok(/trainMarkComplete/.test(extractFn(index, 'trainCardHtml')));

const helpers = [
  extractFn(index, 'isHomeAssignmentDueSoon'),
  extractFn(index, 'homeAssignmentDueKind'),
  extractFn(index, 'homeAssignmentDueLabel'),
  extractFn(index, 'homeTodayKickerLabel'),
  extractFn(index, 'homeAssignmentTypeLabel'),
  extractFn(index, 'pickHomeTodayAssignment'),
  extractFn(index, 'pickHomeDueSoonAssignment'),
  extractFn(index, 'pickHomeUndatedAssignment'),
  extractFn(index, 'pickHomeProjectsForStrip'),
  extractFn(index, 'homePromptTargetProjectId'),
  extractFn(index, 'athleteLocalMondayIndex'),
  extractFn(index, 'homeWeekDayNames'),
  extractFn(index, 'homeWeekDotsHtml'),
  extractFn(index, 'homeWeekStatusLabel'),
  extractFn(index, 'homeWeekSessionLabel'),
  extractFn(index, 'countHomeWeekSessions'),
  extractFn(index, 'homeGreetingText'),
  extractFn(index, 'athleteWeekBounds'),
  extractFn(index, 'athleteLocalDayKeyFromDate'),
  extractFn(index, 'athleteLocalDayKeyFromIso'),
  extractFn(index, 'homeAssignmentDueDay'),
  extractFn(index, 'isAthleteStreakClimb'),
  extractFn(index, 'isAthleteStreakTraining'),
  extractFn(index, 'isAthleteStreakPsyche'),
  extractFn(index, 'isAthleteStreakPsycheDrill'),
  extractFn(index, 'collectHomeDayCounts'),
  extractFn(index, 'collectHomeDayItems'),
  extractFn(index, 'homeDayClimbRowHtml'),
  extractFn(index, 'homeDayTrainRowHtml'),
  extractFn(index, 'homeDaySheetHtml'),
  extractFn(index, 'homeDueRowHtml'),
  extractFn(index, 'escHomeAttr'),
  extractFn(index, 'escTrainHtml')
].join('\n');

const helperCtx = {};
vm.createContext(helperCtx);
vm.runInContext(helpers, helperCtx);
const now = new Date('2026-08-18T12:00:00');
assert.strictEqual(helperCtx.homeAssignmentDueKind({ due_date: '2026-08-10' }, now), 'overdue');
assert.strictEqual(helperCtx.homeAssignmentDueKind({ due_date: '2026-08-18' }, now), 'today');
assert.strictEqual(helperCtx.homeAssignmentDueKind({ due_date: '2026-08-20' }, now), 'week');
assert.strictEqual(helperCtx.homeAssignmentDueLabel('overdue'), 'Overdue');
assert.strictEqual(helperCtx.homeAssignmentDueLabel('today'), 'Due today');
assert.strictEqual(helperCtx.homeGreetingText('Alex'), 'Alex');
assert.strictEqual(helperCtx.homeGreetingText(''), 'Home');
const picked = helperCtx.pickHomeTodayAssignment([
  { id: 'w', title: 'Week', due_date: '2026-08-20', training_focus: 'Boulders' },
  { id: 'o', title: 'Over', due_date: '2026-08-10', training_focus: 'Hangboard' }
], now);
assert.ok(picked && picked.id === 'o');
const weekFrom = new Date(2026, 8, 8);
const days = { '2026-09-07': true, '2026-09-08': true };
assert.strictEqual(helperCtx.homeWeekStatusLabel(0, {}, weekFrom), 'No sessions yet this week');
assert.ok(/streak/.test(helperCtx.homeWeekStatusLabel(3, days, weekFrom)));
assert.strictEqual(helperCtx.homeWeekSessionLabel(0), 'No sessions this week');
assert.strictEqual(helperCtx.homeWeekSessionLabel(1), '1 session this week');
assert.strictEqual(helperCtx.homeWeekSessionLabel(3), '3 sessions this week');
assert.ok((helperCtx.homeWeekDotsHtml(days, weekFrom).match(/home-week-dot/g) || []).length === 7);
assert.strictEqual(helperCtx.countHomeWeekSessions([
  { created_at: '2026-09-08T12:00:00' }
], [], [], [], weekFrom), 1);

const tueLocal = new Date(2026, 9, 6, 15, 30, 0);
assert.strictEqual(tueLocal.getDay(), 2, 'fixture is a local Tuesday');
assert.strictEqual(helperCtx.athleteLocalMondayIndex(tueLocal), 1, 'Tuesday is Mon-Sun index 1');
const tueDots = helperCtx.homeWeekDotsHtml({}, tueLocal);
const tueCells = tueDots.match(/<(button|span) class="[^"]*home-week-dot[^"]*"[^>]*>[A-Z]<\/\1>/g) || [];
assert.strictEqual(tueCells.length, 7);
assert.ok(!/is-today/.test(tueCells[0]), 'Monday must not be today on a local Tuesday');
assert.ok(/is-today/.test(tueCells[1]), 'Tuesday cell (index 1) is today');
assert.ok(!/is-today/.test(tueCells[2]), 'Wednesday is not today');

const counts = { '2026-09-07': 2, '2026-09-08': 1 };
const tapHtml = helperCtx.homeWeekDotsHtml({}, weekFrom, counts);
assert.ok(/aria-label="Monday, 2 items"/.test(tapHtml));
assert.ok(/aria-label="Tuesday, 1 item"/.test(tapHtml));
assert.ok(/<button type="button"[^>]*data-day="2026-09-07"/.test(tapHtml));
assert.ok(/<button type="button"[^>]*data-day="2026-09-08"/.test(tapHtml));
assert.ok(/<span class="[^"]*is-empty[^"]*"[^>]*data-day="2026-09-09"/.test(tapHtml), 'empty day is a non-button span');
assert.ok(!/aria-label="Wednesday/.test(tapHtml));
assert.ok((tapHtml.match(/<button /g) || []).length === 2);

assert.strictEqual(helperCtx.homeTodayKickerLabel({ due_date: '2026-08-18' }, now), 'TODAY');
assert.strictEqual(helperCtx.homeTodayKickerLabel({ title: 'Hangboard' }, now), 'UP NEXT');
assert.strictEqual(helperCtx.homeTodayKickerLabel({ due_date: '2026-08-20' }, now), 'UP NEXT');
assert.strictEqual(helperCtx.homeTodayKickerLabel({ due_date: '2026-08-10' }, now), 'OVERDUE');
const farOnly = helperCtx.pickHomeTodayAssignment([
  { id: 'far', title: 'EMOM', due_date: '2026-09-01', completed_at: null }
], now);
assert.ok(farOnly && farOnly.id === 'far', 'incomplete far-future assignment still ranks in any-incomplete picker');
const farDue = helperCtx.pickHomeDueSoonAssignment([
  { id: 'far', title: 'EMOM', due_date: '2026-09-01', completed_at: null }
], now);
assert.ok(!farDue, 'Home prompt excludes far-future assignments');
const doneOnly = helperCtx.pickHomeTodayAssignment([
  { id: 'done', title: 'Done', due_date: '2026-08-18', completed_at: '2026-08-18T00:00:00Z' }
], now);
assert.ok(!doneOnly, 'completed assignment is hidden');
assert.ok(/pickHomeDueSoonAssignment\(_trainAssignmentsCache/.test(dueSrc));
assert.strictEqual(helperCtx.isHomeAssignmentDueSoon({ completed_at: null, due_date: null }, now), false);
assert.ok(!helperCtx.pickHomeDueSoonAssignment([
  { id: 'u', title: 'Undated', due_date: null, completed_at: null }
], now), 'undated assignment is not S2');
const undatedPick = helperCtx.pickHomeUndatedAssignment([
  { id: 'u', title: 'Undated hang', due_date: null, completed_at: null, created_at: '2026-08-01' }
]);
assert.ok(undatedPick && undatedPick.id === 'u');
assert.strictEqual(helperCtx.homePromptTargetProjectId({ state: 's3', project: { id: 'p' } }), 'p');
assert.strictEqual(helperCtx.homePromptTargetProjectId({ state: 's6-climb', project: { id: 'p' } }), 'p');
assert.strictEqual(helperCtx.homePromptTargetProjectId({ state: 's2', project: { id: 'p' } }), '');
function idsOf(list){
  return Array.prototype.map.call(list, function(p){ return p.id; }).join(',');
}
assert.strictEqual(idsOf(helperCtx.pickHomeProjectsForStrip([
  { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }
], 'd')), 'a,b,d');
assert.strictEqual(idsOf(helperCtx.pickHomeProjectsForStrip([
  { id: 'a' }, { id: 'b' }, { id: 'c' }
], 'a')), 'a,b,c');
assert.strictEqual(idsOf(helperCtx.pickHomeProjectsForStrip([
  { id: 'a' }
], 'a')), 'a');

const dayItems = helperCtx.collectHomeDayItems('2026-09-08', [
  { created_at: '2026-09-08T10:00:00', zone: 'learning' },
  { created_at: '2026-09-07T10:00:00', zone: 'comfort' }
], [
  { created_at: '2026-09-08T11:00:00' }
], [
  { id: 'a1', title: 'Hangboard', due_date: '2026-09-08' },
  { id: 'a2', title: 'No date' }
]);
assert.strictEqual(dayItems.climbs.length, 1);
assert.strictEqual(dayItems.trains.length, 1);
assert.strictEqual(dayItems.assigns.length, 1);
const sheet = helperCtx.homeDaySheetHtml(dayItems);
assert.ok(/Climb/.test(sheet));
assert.ok(/Training session/.test(sheet));
assert.ok(/Hangboard/.test(sheet));
const emptyItems = helperCtx.collectHomeDayItems('2026-09-09', [], [], []);
assert.strictEqual(emptyItems.climbs.length + emptyItems.trains.length + emptyItems.assigns.length, 0);

const boot = {
  _active: '',
  loads: 0,
  paints: 0,
  _homeDataReady: false,
  document: {
    querySelector: function(){ return boot._active ? { id: boot._active } : null; }
  },
  showScreen: function(id){
    boot._active = id;
    if(id === 'screen-home') boot.loadHomeScreen();
  },
  loadHomeScreen: function(){ boot.loads++; boot._homeDataReady = true; },
  paintHomePrimaryCard: function(){ boot.paints++; }
};
vm.createContext(boot);
vm.runInContext(extractFn(index, 'routeSignedInHome'), boot);
boot.routeSignedInHome();
boot.routeSignedInHome();
assert.strictEqual(boot.loads, 1, 'normal dual boot path must load Home once');
assert.strictEqual(boot._active, 'screen-home');

const loadChunk = [
  'var _homeScreenLoadPromise = null;',
  'var _homeDataReady = false;',
  'var _homeHasDueAssignment = false;',
  'var _homeSessRows = null;',
  'var _homeSettledViaTimeout = false;',
  'var _homeLoadsFinished = false;',
  'var _homeLoadedUid = "";',
  'var _climbCacheLoadOk = null;',
  'var _climbCache = null;',
  'var _climbCacheInflight = null;',
  'var _climbCacheHasProject = null;',
  'var LOG_WHICH_LOAD_MS = 2000;',
  extractFn(index, 'loadHomeScreen')
].join('\n');
const loadCtx = {
  _homeScreenLoadPromise: null,
  _homeDataReady: false,
  _homeHasDueAssignment: false,
  _homeSessRows: null,
  _homeSettledViaTimeout: false,
  _homeLoadsFinished: false,
  _homeLoadedUid: '',
  _climbCacheLoadOk: null,
  _climbCache: null,
  _climbCacheInflight: null,
  _climbCacheHasProject: null,
  LOG_WHICH_LOAD_MS: 2000,
  closeHomeAssignmentDetail: function(){ loadCtx.closes++; },
  closeHomeDaySheet: function(){},
  hideHomeDataSections: function(){ loadCtx.hides++; },
  settleHomeData: function(){ loadCtx.settled++; },
  paintHomeAfterLoad: function(){ loadCtx.painted++; },
  applyHomeGreeting: async function(){ loadCtx.parts.push('g'); },
  loadHomeDueList: async function(){ loadCtx.parts.push('d'); },
  loadHomeGoalsStrip: async function(){ loadCtx.parts.push('o'); },
  loadHomeStreakBand: async function(){ loadCtx.parts.push('s'); },
  loadHomeRecentActivity: async function(){ loadCtx.parts.push('r'); },
  loadHomeProjectsStrip: async function(){ loadCtx.parts.push('p'); },
  setTimeout: function(fn){ loadCtx.timerFn = fn; return 1; },
  clearTimeout: function(){ loadCtx.cleared++; },
  closes: 0,
  hides: 0,
  settled: 0,
  painted: 0,
  cleared: 0,
  parts: []
};
vm.createContext(loadCtx);
vm.runInContext(loadChunk, loadCtx);
await Promise.all([loadCtx.loadHomeScreen(), loadCtx.loadHomeScreen()]);
assert.strictEqual(loadCtx.parts.filter(function(p){ return p === 'd'; }).length, 1,
  'overlapping loadHomeScreen calls must run due fetch once');

const train = extractBetween(index, 'screen-train', 'screen-train-start');
assert.ok(/id="train-hub-card-start"/.test(train), 'Train hub untouched');

console.log('home-compact tests: ok');
