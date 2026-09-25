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
assert.ok(/var app_version = 'index273'/.test(index));
assert.ok(/APP_VERSION = 'index273'/.test(sw));

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

// PART A — title is a real input, not a static div
assert.ok(/id="train-sess-title" class="train-sess-title-input"/.test(index));
assert.ok(/placeholder="Name this session"/.test(index));
assert.ok(/oninput="if\(trainSessionState\) trainSessionState\.title = this\.value;"/.test(index));
assert.ok(!/<div[^>]*id="train-sess-title"/.test(index), 'old static title div must be gone');
assert.ok(/\.train-sess-title-input\{/.test(index));
assert.ok(/\.train-sess-title-input:focus\{/.test(index));
assert.ok(/\.train-sess-title-input::placeholder/.test(index));

const builder = extractFn(index, 'renderTrainSessionBuilder');
assert.ok(/document\.activeElement !== title/.test(builder));
assert.ok(/title\.value = trainSessionState\.title \|\| ''/.test(builder));
assert.ok(!/title\.textContent/.test(builder), 'builder paints input .value, not textContent');

const doneSrc = extractFn(index, 'populateTrainDoneScreen');
assert.ok(/snap\.title \|\| workoutTypeLabel\(snap\.energy_type\) \|\| 'Session'/.test(doneSrc));
assert.ok(!/workoutTypeLabel\(snap\.energy_type\) \|\| snap\.title/.test(doneSrc),
  'done screen must prefer real title over category');

const nameSrc = extractFn(index, 'trainSessionWorkoutName');
assert.ok(/workoutTypeLabel\(row && row\.energy_type\)/.test(nameSrc));

// PART B — skippable category
const startScreen = extractBetween(index, 'screen-train-start', 'screen-train-recent');
assert.ok(/id="train-energy-grid"/.test(startScreen));
assert.ok(/onclick="startSessionNoCategory\(\)"/.test(startScreen));
assert.ok(/Skip — just start a session/.test(startScreen));
assert.ok(/Browse workout library/.test(startScreen));
const skipAt = startScreen.indexOf('startSessionNoCategory()');
const browseAt = startScreen.indexOf("showScreen('screen-workout-library')");
assert.ok(skipAt > startScreen.indexOf('id="train-energy-grid"') && skipAt < browseAt,
  'Skip link sits below the 10 cards and above Browse workout library');

assert.ok(/function startSessionNoCategory/.test(index));
const skipFn = extractFn(index, 'startSessionNoCategory');
assert.ok(/_trainPickerType = ''/.test(skipFn));
assert.ok(/newTrainSessionState\(''\)/.test(skipFn));
assert.ok(/showScreen\('screen-train-session'\)/.test(skipFn));

const saveSrc = extractFn(index, 'saveTrainSession');
assert.ok(/energy_type: trainSessionState\.energy_type \|\| null/.test(saveSrc));

const arcSrc = extractFn(index, 'renderTrainEnergyArc');
assert.ok(/if\(!r\.energy_type\) return;/.test(arcSrc));

const landing = extractBetween(index, 'screen-train', 'screen-train-start');
assert.ok(!/id="train-energy-grid"/.test(landing), 'landingLean: no energy grid on hub');
assert.ok(/id="train-hub-recent-mini"/.test(landing));

assert.ok(/var TRAINING_FOCUS_VALUES = \[/.test(index));
const focusMatch = index.match(/var TRAINING_FOCUS_VALUES = \[([\s\S]*?)\];/);
assert.ok(focusMatch);
const focuses = focusMatch[1].split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean);
assert.strictEqual(focuses.length, 10, '10 energy-system categories stay intact');
assert.strictEqual(focuses[focuses.length - 1], 'Warm-Ups');
assert.ok(/energyOnStart/.test(index));
assert.ok(/querySelectorAll\('#train-energy-grid \.train-energy-card'\)\.length === 10/.test(index));

// Runtime: skip starts a blank uncategorized session
let uidN = 0;
const skipCtx = {
  Date,
  String,
  uid: function(){ uidN += 1; return 'sess-' + uidN; },
  workoutTypeLabel: function(t){ return t || ''; },
  _trainPickerType: 'Cardio & Capacity',
  trainSessionState: null,
  shown: '',
  showScreen: function(id){ skipCtx.shown = id; }
};
vm.createContext(skipCtx);
vm.runInContext(extractFn(index, 'newTrainSessionState'), skipCtx);
vm.runInContext(skipFn, skipCtx);
vm.runInContext('startSessionNoCategory()', skipCtx);
assert.strictEqual(skipCtx._trainPickerType, '');
assert.strictEqual(skipCtx.shown, 'screen-train-session');
assert.strictEqual(skipCtx.trainSessionState.energy_type, '');
assert.strictEqual(skipCtx.trainSessionState.title, '');

// Runtime: done screen prefers the typed title over the category label
const doneEls = {};
const doneCtx = {
  Date,
  Math,
  isNaN,
  String,
  Number,
  _trainDoneSnapshot: null,
  workoutTypeLabel: function(t){
    if(t === 'Cardio & Capacity') return 'Cardio & Capacity';
    return t || '';
  },
  formatTrainDuration: function(){ return '12 min'; },
  document: {
    getElementById: function(id){
      if(!doneEls[id]) doneEls[id] = { textContent: '', style: { display: '' }, value: '' };
      return doneEls[id];
    },
    querySelectorAll: function(){ return []; }
  }
};
vm.createContext(doneCtx);
vm.runInContext(extractFn(index, 'populateTrainDoneScreen'), doneCtx);
vm.runInContext(`populateTrainDoneScreen({
  title: 'Morning hang + laps',
  energy_type: 'Cardio & Capacity',
  started_at: '2026-09-25T10:00:00Z',
  ended_at: '2026-09-25T10:12:00Z',
  blockCount: 2
}, true)`, doneCtx);
assert.strictEqual(doneEls['train-done-title'].textContent, 'Morning hang + laps',
  'John bug: done screen must show the real name, not Cardio & Capacity');

vm.runInContext(`populateTrainDoneScreen({
  title: '',
  energy_type: 'Cardio & Capacity',
  started_at: '2026-09-25T10:00:00Z',
  ended_at: '2026-09-25T10:12:00Z',
  blockCount: 1
}, false)`, doneCtx);
assert.strictEqual(doneEls['train-done-title'].textContent, 'Cardio & Capacity',
  'category remains the fallback when there is no title');

vm.runInContext(`populateTrainDoneScreen({
  title: '',
  energy_type: null,
  started_at: '2026-09-25T10:00:00Z',
  ended_at: '2026-09-25T10:12:00Z',
  blockCount: 0
}, false)`, doneCtx);
assert.strictEqual(doneEls['train-done-title'].textContent, 'Session',
  'uncategorized untitled session falls back to Session');

// Runtime: builder does not clobber the input while the user is typing
const titleEl = { value: 'typed mid-render', id: 'train-sess-title' };
const eyeEl = { textContent: '' };
const builderCtx = {
  Date,
  String,
  document: {
    activeElement: titleEl,
    getElementById: function(id){
      if(id === 'train-sess-title') return titleEl;
      if(id === 'train-sess-eyebrow') return eyeEl;
      return { value: '', textContent: '', style: {}, classList: { add: function(){}, remove: function(){} } };
    }
  },
  trainSessionState: { title: 'stale from state', energy_type: '', blocks: [], started_at: null, ended_at: null, warm_up: '', cool_down: '' },
  _trainPickerType: '',
  newTrainSessionState: function(){ return builderCtx.trainSessionState; },
  workoutTypeLabel: function(){ return ''; },
  toLocalInputValue: function(){ return ''; },
  renderTrainBlocks: function(){},
  renderTrainWarmCool: function(){}
};
// Extract only the title-paint fragment by running a thin wrapper that
// mirrors the two lines under test (full builder has many DOM deps).
vm.createContext(builderCtx);
vm.runInContext(`
  var title = document.getElementById('train-sess-title');
  var eye = document.getElementById('train-sess-eyebrow');
  if(title && document.activeElement !== title) title.value = trainSessionState.title || '';
  if(eye) eye.textContent = workoutTypeLabel(trainSessionState.energy_type) || 'Training session';
`, builderCtx);
assert.strictEqual(titleEl.value, 'typed mid-render', 'do not overwrite while focused');

builderCtx.document.activeElement = { id: 'other' };
vm.runInContext(`
  var title = document.getElementById('train-sess-title');
  if(title && document.activeElement !== title) title.value = trainSessionState.title || '';
`, builderCtx);
assert.strictEqual(titleEl.value, 'stale from state', 'paint .value when not focused');

// Runtime: uncategorized sessions are not plotted on the energy arc
const circles = [];
const arcCtx = {
  Math,
  String,
  document: {
    getElementById: function(id){
      if(id !== 'train-arc-dots') return null;
      return {
        innerHTML: '',
        appendChild: function(c){ circles.push(c); }
      };
    },
    createElementNS: function(){
      const attrs = {};
      return { setAttribute: function(k, v){ attrs[k] = v; }, attrs: attrs };
    }
  },
  trainEnergyArcBand: function(){ return 60; }
};
vm.createContext(arcCtx);
vm.runInContext(arcSrc, arcCtx);
vm.runInContext(`renderTrainEnergyArc([
  { energy_type: null },
  { energy_type: '' },
  { energy_type: 'Boulders' },
  { energy_type: 'Cardio & Capacity' }
])`, arcCtx);
assert.strictEqual(circles.length, 2, 'null/empty energy_type must not plot on SKL/MOB');

console.log('train-session-title tests passed');
