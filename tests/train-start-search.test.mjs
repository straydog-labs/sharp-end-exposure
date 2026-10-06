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
assert.ok(/var app_version = 'index282'/.test(index));
assert.ok(/APP_VERSION = 'index282'/.test(sw));

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

const startScreen = extractBetween(index, 'screen-train-start', 'screen-train-recent');
assert.ok(!/Energy mix/i.test(startScreen));
assert.ok(!/Pick a focus, then a workout/.test(startScreen));
assert.ok(startScreen.indexOf('id="train-start-search"') < startScreen.indexOf('id="train-start-pinned-wrap"'));
assert.ok(startScreen.indexOf('id="train-start-pinned-wrap"') < startScreen.indexOf('id="train-energy-grid"'));
assert.ok(/id="train-start-pinned-strip"/.test(startScreen));
assert.ok(startScreen.indexOf('id="train-start-search"') < startScreen.indexOf('id="train-energy-grid"'));
assert.ok(/placeholder="Search workouts"/.test(startScreen));
assert.ok(/Start blank session/.test(startScreen));
assert.ok(/startSessionNoCategory\(\)/.test(startScreen));
assert.ok(/Browse workout library/.test(startScreen));
assert.ok(/id="self-assign-launch"/.test(startScreen));
assert.ok(/Plan \/ assignments/.test(startScreen));
assert.ok(!/coach/i.test(startScreen), 'start flow must not say coach');
assert.ok(/id="train-start-more"/.test(startScreen));

const hub = extractBetween(index, 'screen-train', 'screen-train-start');
assert.ok(/>My plan</.test(hub));
assert.ok(/id="train-hub-card-assign"/.test(hub));
assert.ok(/id="train-hub-assign-count"/.test(hub));
assert.ok(!/Assignments from coach/.test(hub));
assert.ok(/Start training/.test(hub));
assert.ok(!/search/i.test(hub.match(/id="train-hub-card-start"[\s\S]*?<\/button>/)[0]));

const assignScreen = extractBetween(index, 'screen-train-assignments', 'screen-train-blocks');
assert.ok(/My plan/.test(assignScreen));
assert.ok(/id="train-list"/.test(assignScreen));
assert.ok(!/Assignments from coach/.test(assignScreen));

const detail = extractBetween(index, 'screen-workout-library-detail', 'screen-workout-library-add');
assert.ok(/id="wl-start-now-btn"/.test(detail));
assert.ok(/startNowFromWorkoutDetail\(\)/.test(detail));
assert.ok(/Save to my plan/.test(detail));
assert.ok(!/Add to my training/.test(detail));
assert.ok(detail.indexOf('id="wl-start-now-btn"') < detail.indexOf('id="wl-add-to-train-btn"'));

const addForm = extractBetween(index, 'screen-workout-library-add', 'screen-milestone');
assert.ok(/id="wl-new-saved"/.test(addForm));
assert.ok(/id="wl-new-start-now"/.test(addForm));
assert.ok(/id="wl-new-done"/.test(addForm));
assert.ok(/startNowFromJustCreatedWorkout/.test(addForm));
assert.ok(/doneFromJustCreatedWorkout/.test(addForm));

const sess = extractBetween(index, 'screen-train-session', 'screen-train-done');
assert.ok(/id="train-sess-saved-workout"/.test(sess));
assert.ok(/id="train-sess-saved-start-now"/.test(sess));

const addSrc = extractFn(index, 'addLibraryItemToTraining');
assert.ok(!/450/.test(addSrc));
assert.ok(!/showScreen\('screen-train'\)/.test(addSrc));
assert.ok(/Save to my plan/.test(addSrc));
assert.ok(/custom_workout_item_id/.test(addSrc));

const startNow = extractFn(index, 'startNowFromWorkoutDetail');
assert.ok(/seedTrainSessionFromItem/.test(startNow));
assert.ok(!/sbI\('assignments'/.test(startNow));
assert.ok(/library_item_id/.test(startNow));
assert.ok(/custom_workout_item_id/.test(startNow));

const createSrc = extractFn(index, 'createWorkoutLibraryItem');
assert.ok(/showWlCreateConfirm/.test(createSrc));
assert.ok(!/showScreen\('screen-train-picker'\)/.test(createSrc));
assert.ok(!/showScreen\('screen-workout-library'\)/.test(createSrc));

const saveAs = extractFn(index, 'saveTrainSessionAsWorkout');
assert.ok(/train-sess-saved-workout/.test(saveAs));
assert.ok(/_justCreatedWorkout/.test(saveAs));

const picker = extractFn(index, 'renderTrainPicker');
assert.ok(/loadTrainWorkoutCatalog/.test(picker));
assert.ok(!/sbS\('workout_library'/.test(picker));

const card = extractFn(index, 'trainCardHtml');
assert.ok(/From coach/.test(card));
assert.ok(/Added by you/.test(card));
assert.ok(/startTrainSessionFromAssignment/.test(card));
assert.ok(/>Start</.test(card));
assert.ok(!/hasLinkedItem/.test(card));

const showSrc = extractFn(index, 'showScreen');
assert.ok(/loadTrainStartScreen/.test(showSrc));

let uidN = 0;
const els = {};
function el(id){
  if(!els[id]) els[id] = { id: id, textContent: '', innerHTML: '', value: '', style: { display: '', opacity: '1' }, disabled: false };
  return els[id];
}
const ctx = {
  JSON, Array, String, Number, Date, Math, isNaN,
  uid: function(){ uidN += 1; return 'id-' + uidN; },
  _trainWorkoutCatalog: [],
  _trainStartSearchResults: [],
  _trainPickerType: 'Hangboard',
  _trainPickerItems: [],
  _workoutLibraryDetailItem: null,
  _workoutLibraryDetailSource: 'foundational',
  _workoutLibraryDetailId: null,
  _justCreatedWorkout: null,
  trainSessionState: null,
  shown: '',
  seeded: null,
  toast: '',
  document: {
    getElementById: function(id){ return el(id); }
  },
  itemTrainingFocus: function(item){ return item && (item._canonicalFocus || item.training_focus) || ''; },
  canonicalizeWizardItem: function(row, source){
    return Object.assign({}, row, { _source: source || 'foundational', _canonicalFocus: row.training_focus || '' });
  },
  workoutMatchesFocus: function(item, focus){ return item && item.training_focus === focus; },
  seedTrainSessionFromItem: function(item, sourceMeta){
    ctx.seeded = { item: item, sourceMeta: sourceMeta };
    ctx.shown = 'screen-train-session';
  },
  showScreen: function(id){ ctx.shown = id; },
  showToast: function(msg){ ctx.toast = msg; },
  escTrainHtml: function(s){ return String(s || ''); }
};
vm.createContext(ctx);
[
  'trainStartSearchHay', 'filterTrainStartSearch', 'startNowFromWorkoutDetail',
  'startNowFromJustCreatedWorkout', 'doneFromJustCreatedWorkout'
].forEach(function(name){
  vm.runInContext(extractFn(index, name), ctx);
});

vm.runInContext(`
  var catalog = [
    { id: 'lib-1', name: 'Repeaters', description: '7-3 hangs', training_focus: 'Hangboard', _canonicalFocus: 'Hangboard', _source: 'foundational' },
    { id: 'cw-1', name: 'Night EMOM', description: 'private boulder circuit', training_focus: 'Boulders', _canonicalFocus: 'Boulders', _source: 'custom', visibility: 'private' },
    { id: 'lib-2', name: 'Max Hang', description: 'near failure', training_focus: 'Hangboard', _canonicalFocus: 'Hangboard', _source: 'foundational' }
  ];
  var hang = filterTrainStartSearch('hang', catalog);
  var multi = filterTrainStartSearch('emom boulder', catalog);
  var miss = filterTrainStartSearch('campus board', catalog);
  var empty = filterTrainStartSearch('   ', catalog);
  var caseOk = filterTrainStartSearch('NIGHT', catalog);
`, ctx);
const hang = vm.runInContext("filterTrainStartSearch('hang', [{ id: 'lib-1', name: 'Repeaters', description: '7-3 hangs', training_focus: 'Hangboard', _canonicalFocus: 'Hangboard' }, { id: 'cw-1', name: 'Night EMOM', description: 'private boulder circuit', training_focus: 'Boulders', _canonicalFocus: 'Boulders' }])", ctx);
assert.strictEqual(hang.length, 1);
assert.strictEqual(hang[0].id, 'lib-1');
const multi = vm.runInContext("filterTrainStartSearch('emom boulder', [{ id: 'lib-1', name: 'Repeaters', description: '7-3 hangs', training_focus: 'Hangboard', _canonicalFocus: 'Hangboard' }, { id: 'cw-1', name: 'Night EMOM', description: 'private boulder circuit', training_focus: 'Boulders', _canonicalFocus: 'Boulders' }])", ctx);
assert.strictEqual(multi.length, 1);
assert.strictEqual(multi[0].id, 'cw-1');
const miss = vm.runInContext("filterTrainStartSearch('campus board', [{ id: 'lib-1', name: 'Repeaters', description: '7-3 hangs', training_focus: 'Hangboard', _canonicalFocus: 'Hangboard' }, { id: 'cw-1', name: 'Night EMOM', description: 'private boulder circuit', training_focus: 'Boulders', _canonicalFocus: 'Boulders' }])", ctx);
assert.strictEqual(miss.length, 0);
const empty = vm.runInContext("filterTrainStartSearch('', [{ id: 'a' }, { id: 'b' }])", ctx);
assert.strictEqual(empty.length, 2);

vm.runInContext(`
  _workoutLibraryDetailItem = { id: 'lib-9', name: 'Repeaters', description: 'x', training_focus: 'Hangboard' };
  _workoutLibraryDetailSource = 'foundational';
  startNowFromWorkoutDetail();
`, ctx);
assert.strictEqual(ctx.shown, 'screen-train-session');
assert.strictEqual(ctx.seeded.sourceMeta.library_item_id, 'lib-9');
assert.ok(!ctx.seeded.sourceMeta.custom_workout_item_id);

vm.runInContext(`
  _workoutLibraryDetailItem = { id: 'cw-9', name: 'Custom', description: 'y', training_focus: 'Boulders' };
  _workoutLibraryDetailSource = 'custom';
  startNowFromWorkoutDetail();
`, ctx);
assert.strictEqual(ctx.seeded.sourceMeta.custom_workout_item_id, 'cw-9');
assert.ok(!ctx.seeded.sourceMeta.library_item_id);

vm.runInContext(`
  _justCreatedWorkout = { item: { id: 'cw-new', name: 'Fresh', training_focus: 'Boulders' }, source: 'custom', returnScreen: 'screen-train-picker' };
  startNowFromJustCreatedWorkout();
`, ctx);
assert.strictEqual(ctx.shown, 'screen-train-session');
assert.strictEqual(ctx.seeded.sourceMeta.custom_workout_item_id, 'cw-new');

vm.runInContext(`
  _justCreatedWorkout = { item: { id: 'cw-new', name: 'Fresh' }, source: 'custom', returnScreen: 'screen-train-picker' };
  document.getElementById('train-sess-saved-workout').style.display = 'block';
  document.getElementById('wl-new-saved').style.display = 'block';
  document.getElementById('wl-new-form-body').style.display = 'none';
  doneFromJustCreatedWorkout();
`, ctx);
assert.strictEqual(ctx.shown, 'screen-train-picker');
assert.strictEqual(els['train-sess-saved-workout'].style.display, 'none');
assert.strictEqual(els['wl-new-saved'].style.display, 'none');
assert.strictEqual(els['wl-new-form-body'].style.display, '');

console.log('train-start-search tests: ok');
