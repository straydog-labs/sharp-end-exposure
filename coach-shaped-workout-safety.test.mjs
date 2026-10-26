import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '..', 'coach-dashboard.html'), 'utf8');

function extractFn(name){
  const start = dash.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  const next = dash.indexOf('\n  function ', start + 10);
  return dash.slice(start, next > 0 ? next : start + 6000);
}

// Shaped blocks as the athlete Train builder saves them.
const SHAPED = [
  { id: 'b1', shape: 'emom', title: '', rest_after_sec: 120, complete: false, attempts: [],
    rounds: [
      { boulders: [{ id: 'x1', text: 'V4 orange', complete: false }, { id: 'x2', text: 'V5 black', complete: false }], notes: '', rest_after_sec: 600, complete: false },
      { boulders: [{ id: 'x3', text: 'V4 orange', complete: false }], notes: '', rest_after_sec: 600, complete: false }
    ] },
  { id: 'b2', shape: 'rep_pass_fail', title: '', grip: 'half crimp', assistance: '+20 lb', sets: [{ reps: [{ ok: null }, { ok: null }] }], progression_note: '' },
  { id: 'b3', shape: 'rest', title: 'Rest', duration_sec: 600, rest_after_sec: 600 },
  { id: 'b4', shape: 'section', title: 'Mental', notes: 'Box breathing 4 min' },
  { id: 'b5', shape: 'circuit', title: '', rounds: 3, exercises: [{ name: 'Pull-ups', weight: '', reps: '5' }] }
];
const LEGACY = [{ label: 'Warm up', order: 0, duration_sec: 300 }, { label: 'Main', order: 1, duration_sec: null }];

const fetchCalls = [];
let fetchPlan = [];
function fakeFetch(url, opts){
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  fetchCalls.push({ url: String(url), method: (opts && opts.method) || 'GET', body });
  const step = fetchPlan.length ? fetchPlan.shift() : { ok: true, rows: [{ id: 'new-cw-1' }] };
  if(step.ok){
    return Promise.resolve({ ok: true, json: function(){ return Promise.resolve(step.rows || []); } });
  }
  return Promise.resolve({ ok: false, json: function(){ return Promise.resolve(step.err); } });
}

const els = {
  'edit-cw-name': { value: 'Renamed workout' },
  'edit-cw-desc': { value: 'New description' },
  'edit-cw-save': { disabled: false, textContent: '' },
  'new-a-msg': { innerHTML: '' }
};
const ctx = {
  console, JSON, Date, Array, Object, String, Number, Math, Promise,
  SB_URL: 'https://example.supabase.co',
  sbHeaders: function(){ return { apikey: 'k' }; },
  fetch: fakeFetch,
  document: { getElementById: function(id){ return els[id] || null; } },
  escapeHtml: function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); },
  normalizeTrainingFocus: function(f){ return f || null; },
  itemTrainingFocus: function(i){ return (i && i.training_focus) || null; },
  parseAssignWizardDurationSec: function(v){ return v == null ? null : Number(v); },
  hydrateAssignWizardExercises: function(){ return []; },
  cleanedAssignWizardSections: function(){ return 'LEGACY_CLEANED'; },
  goAssignWizardStep: function(){},
  closeAssignWizardOverlay: function(){},
  resetAssignWizard: function(){},
  showAssignSavedBanner: function(){},
  showCoachToast: function(){},
  friendlyErrorMessage: function(e, f){ return f; },
  loadCoachWorkoutLibrary: function(){ return Promise.resolve([]); },
  _coachLibCache: [],
  _assignWizard: { sections: [], editingCustomWorkoutId: null, editingShapedRaw: null },
  _assignWizardCtx: { token: 't', coachUser: { id: 'coach-1' } }
};
vm.createContext(ctx);
['parseWorkoutSections', 'sectionsAreShaped', 'shapedBlockName', 'shapedBlockSummary', 'shapedBlocksPreviewHtml',
 'createCoachCustomWorkout', 'saveEditCustomWorkout', 'duplicateCoachCustomWorkout', 'enterEditCustomWorkout',
 'sectionsFromLibraryItem'].forEach(function(n){ vm.runInContext(extractFn(n), ctx); });
// the coach block builder module (vars + functions) up to the save helper
const cwbStart = dash.indexOf('  // ---------- Coach block builder ----------');
const cwbEnd = dash.indexOf('  function cwbSectionsForSave(');
assert.ok(cwbStart > 0 && cwbEnd > cwbStart, 'coach block builder module present');
vm.runInContext(dash.slice(cwbStart, cwbEnd), ctx);
const run = function(code){ return vm.runInContext(code, ctx); };

// 1. shaped detection
assert.strictEqual(run('sectionsAreShaped')(SHAPED), true);
assert.strictEqual(run('sectionsAreShaped')(JSON.stringify(SHAPED)), true, 'JSON string form');
assert.strictEqual(run('sectionsAreShaped')(LEGACY), false);
assert.strictEqual(run('sectionsAreShaped')(null), false);
assert.strictEqual(run('sectionsAreShaped')([]), false);

// 2. preview names + summaries (same names as the athlete builder)
const html = run('shapedBlocksPreviewHtml')(SHAPED);
['Climbing (EMOM)', 'Hangboard / repeaters', 'Rest', 'Mental', 'Strength'].forEach(function(n){
  assert.ok(html.indexOf(n) !== -1, 'preview shows ' + n + '\n' + html);
});
assert.ok(html.indexOf('2 rounds · 3 boulders') !== -1, 'EMOM summary');
assert.ok(html.indexOf('half crimp · +20 lb · 1 set') !== -1, 'hangboard summary');
assert.ok(html.indexOf('10 min') !== -1, 'rest summary');
assert.ok(html.indexOf('Box breathing 4 min') !== -1, 'mental summary');
assert.ok(html.indexOf('3 rounds · Pull-ups') !== -1, 'strength summary');

// 3. entering edit on a shaped workout keeps the raw blocks and skips the legacy editor state
run('enterEditCustomWorkout')({ id: 'cw-shaped', name: 'Emom + Repeaters', description: 'd', sections: SHAPED, training_focus: 'Boulders' });
assert.strictEqual(ctx._assignWizard.editingCustomWorkoutId, 'cw-shaped');
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx._assignWizard.editingShapedRaw)), SHAPED);
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx._assignWizard.sections)), []);

// 4. saving a shaped workout never sends sections
await run('saveEditCustomWorkout')();
await new Promise(function(r){ setTimeout(r, 20); });
let patch = fetchCalls.filter(function(c){ return c.method === 'PATCH'; }).pop();
assert.ok(patch && patch.url.indexOf('/rest/v1/custom_workouts?id=eq.cw-shaped') !== -1, 'PATCH hits the workout');
assert.deepStrictEqual(Object.keys(patch.body).sort(), ['description', 'name'], 'shaped PATCH has only name+description: ' + JSON.stringify(Object.keys(patch.body)));
assert.strictEqual(patch.body.name, 'Renamed workout');

// 4b. editing a block in the builder sends the changed blocks, with state reset removed
fetchCalls.length = 0;
run('enterEditCustomWorkout')({ id: 'cw-shaped', name: 'Emom + Repeaters', description: 'd', sections: SHAPED, training_focus: 'Boulders' });
ctx._assignWizard.blocks[0].title = '  EMOM changed ';
ctx._assignWizard.blocks[0].rounds[0].boulders[0].text = ' v6 ';
await run('saveEditCustomWorkout')();
await new Promise(function(r){ setTimeout(r, 20); });
patch = fetchCalls.filter(function(c){ return c.method === 'PATCH'; }).pop();
assert.deepStrictEqual(Object.keys(patch.body).sort(), ['description', 'name', 'sections'], 'changed blocks are saved');
assert.strictEqual(patch.body.sections.length, SHAPED.length, 'no block lost');
assert.strictEqual(patch.body.sections[0].title, 'EMOM changed');
assert.strictEqual(patch.body.sections[0].rounds[0].boulders[0].text, 'v6');
assert.strictEqual(patch.body.sections[1].grip, 'half crimp', 'untouched blocks keep their fields');

// 5. legacy workouts still save their sections
fetchCalls.length = 0;
run('enterEditCustomWorkout')({ id: 'cw-legacy', name: 'Old', description: '', sections: LEGACY, training_focus: 'Boulders' });
assert.strictEqual(ctx._assignWizard.editingShapedRaw, null);
await run('saveEditCustomWorkout')();
await new Promise(function(r){ setTimeout(r, 20); });
patch = fetchCalls.filter(function(c){ return c.method === 'PATCH'; }).pop();
assert.strictEqual(patch.body.sections, 'LEGACY_CLEANED', 'legacy path unchanged');

// 6. duplicating a shaped workout copies blocks exactly, as a coach-owned row
fetchCalls.length = 0;
fetchPlan = [{ ok: true, rows: [{ id: 'copy-1' }] }];
run('duplicateCoachCustomWorkout')({ id: 'cw-shaped', _source: 'custom', name: 'Emom + Repeaters', description: 'd', sections: SHAPED, training_focus: 'Boulders', _focus: 'Boulders' });
await new Promise(function(r){ setTimeout(r, 30); });
const post = fetchCalls.filter(function(c){ return c.method === 'POST'; })[0];
assert.ok(post, 'duplicate POSTs a new custom_workouts row');
assert.deepStrictEqual(post.body.sections, SHAPED, 'duplicate keeps every shaped field');
assert.strictEqual(post.body.created_by_role, 'coach');
assert.strictEqual(post.body.created_by, 'coach-1');
assert.strictEqual(post.body.name, 'Emom + Repeaters (copy)');

// 7. created_by_role written on create, with missing-column fallback
fetchCalls.length = 0;
fetchPlan = [{ ok: true, rows: [{ id: 'n1' }] }];
await run('createCoachCustomWorkout')('t', { id: 'coach-1' }, { trainingFocus: 'Boulders', name: 'X', description: null, sections: null });
assert.strictEqual(fetchCalls[0].body.created_by_role, 'coach');
assert.strictEqual(fetchCalls[0].body.training_focus, 'Boulders');

fetchCalls.length = 0;
fetchPlan = [
  { ok: false, err: { code: 'PGRST204', message: "Could not find the 'created_by_role' column of 'custom_workouts' in the schema cache" } },
  { ok: true, rows: [{ id: 'n2' }] }
];
const row = await run('createCoachCustomWorkout')('t', { id: 'coach-1' }, { trainingFocus: 'Boulders', name: 'X', description: null, sections: null });
assert.strictEqual(row.id, 'n2');
assert.strictEqual(fetchCalls.length, 2);
assert.ok(!('created_by_role' in fetchCalls[1].body), 'retry drops the missing column');
assert.strictEqual(fetchCalls[1].body.training_focus, 'Boulders', 'retry keeps training_focus');

fetchCalls.length = 0;
fetchPlan = [
  { ok: false, err: { code: 'PGRST204', message: "Could not find the 'training_focus' column" } },
  { ok: false, err: { code: 'PGRST204', message: "Could not find the 'created_by_role' column" } },
  { ok: true, rows: [{ id: 'n3' }] }
];
await run('createCoachCustomWorkout')('t', { id: 'coach-1' }, { trainingFocus: 'Boulders', name: 'X', description: null, sections: null });
assert.strictEqual(fetchCalls.length, 3);
assert.ok(!('training_focus' in fetchCalls[2].body) && !('created_by_role' in fetchCalls[2].body));

fetchCalls.length = 0;
fetchPlan = [{ ok: false, err: { code: '42501', message: 'permission denied' } }];
await assert.rejects(function(){ return run('createCoachCustomWorkout')('t', { id: 'coach-1' }, { trainingFocus: 'Boulders', name: 'X' }); });
assert.strictEqual(fetchCalls.length, 1, 'non-schema errors are not retried');

// 8. library load hides soft-deleted customs first, legacy fallbacks remain
const loadSrc = extractFn('loadCoachWorkoutLibrary');
assert.ok(/created_by_role&deleted_at=is\.null/.test(loadSrc), 'first custom_workouts query filters deleted_at');
assert.ok(/',training_focus,sections'\)/.test(loadSrc), 'fallback without deleted filter kept');

// 9. the legacy wizard must not rewrite a shaped workout elsewhere
assert.ok(/editingShapedRaw/.test(extractFn('saveEditCustomWorkout')));
assert.ok(/sectionsAreShaped/.test(extractFn('duplicateCoachCustomWorkout')));

console.log('coach-shaped-workout-safety: ok');
