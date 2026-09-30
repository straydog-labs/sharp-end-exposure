import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');
const sql = readFileSync(join(root, 'sql/coach-athlete-pinned-workouts.sql'), 'utf8');

assert.ok(/create table if not exists public\.coach_athlete_pinned_workouts/.test(sql));
assert.ok(/item_source text not null check \(item_source in \('custom', 'foundational'\)\)/.test(sql));
assert.ok(/unique \(coach_id, athlete_id, item_id, item_source\)/.test(sql));
assert.ok(/focus_note text/.test(sql));
assert.ok(/coach_id = auth\.uid\(\)/.test(sql));
assert.ok(/grant select, insert, update, delete/.test(sql));
assert.ok(/standalone per-athlete/.test(sql), 'John flag: standalone skills field is a later add');

assert.ok(/function toggleWizardLibraryPin/.test(dash));
assert.ok(/function saveWizardPinFocusNote/.test(dash));
assert.ok(/function duplicateCoachCustomWorkout/.test(dash));
assert.ok(/function wizardLibraryRowHtml/.test(dash));
assert.ok(/function loadCoachPinnedWorkouts/.test(dash));
assert.ok(/id="new-a-lib-pinned"/.test(dash));
assert.ok(/Pinned for /.test(dash));
assert.ok(/data-pin-id/.test(dash));
assert.ok(/data-dup-id/.test(dash));
assert.ok(/Duplicate/.test(dash));
assert.ok(/Edit note/.test(dash));
assert.ok(/aw-chip-focus-note/.test(dash));
assert.ok(/Skills to focus on/.test(dash));
assert.ok(/ \(copy\)/.test(dash));
assert.ok(/cleanedAssignWizardSections\(\)/.test(dash.match(/function duplicateCoachCustomWorkout[\s\S]*?\n  function wizardLibraryRowHtml/)[0]));
assert.ok(/createCoachCustomWorkout/.test(dash.match(/function duplicateCoachCustomWorkout[\s\S]*?\n  function wizardLibraryRowHtml/)[0]));
assert.ok(/applyWizardLibraryPick\(item\)/.test(dash.match(/function wireWizardSearchResults[\s\S]*?\n  function wizardStepLabel/)[0]));
assert.ok(/toggleWizardLibraryPin/.test(dash.match(/function wireWizardSearchResults[\s\S]*?\n  function wizardStepLabel/)[0]));
assert.ok(/scope === 'all' && !q/.test(dash.match(/function renderWizardLibraryResults[\s\S]*?\n  function findWizardLibItem/)[0]));
assert.ok(/loadCoachPinnedWorkouts/.test(dash.match(/function startAssignWizard\([\s\S]*?\n  function startAssignWizardFromAssignment/)[0]));
assert.ok(/private to you/.test(dash) || /Private to you/.test(dash) || /private to you/.test(dash));

function extractFn(src, name, nextName){
  const start = src.indexOf('function ' + name + '(');
  const end = nextName ? src.indexOf('function ' + nextName + '(', start + 1) : src.length;
  assert.ok(start >= 0 && end > start, 'extract ' + name);
  return src.slice(start, end);
}

const ctx = {
  _assignWizard: { customWorkoutItemId: null, libraryItemId: 'lib-1' },
  _assignWizardCtx: { athleteId: 'ath-1', athleteLabel: 'Anna', coachUser: { id: 'coach-1' } },
  _coachPinnedWorkoutsCache: [
    { id: 'pin-1', item_id: 'lib-1', item_source: 'foundational', focus_note: 'Quiet feet on the slab' }
  ],
  _editingPinNoteKey: null,
  _coachLibCache: [
    { id: 'lib-1', name: 'EMOM', description: 'Timer work', _source: 'foundational', _focus: 'Boulders' },
    { id: 'cw-1', name: 'Repeaters', description: 'Hang repeats', _source: 'custom', created_by: 'coach-1', sections: [{ label: 'warm up', order: 0 }] }
  ],
  isWarmUpLibraryItem: function(){ return false; },
  coachLibFocusLabel: function(f){ return f; },
  sourceBadgeHtml: function(item){
    return item._source === 'custom'
      ? '<span class="aw-src-badge custom">Custom</span>'
      : '<span class="aw-src-badge foundational">Foundational</span>';
  },
  escapeHtml: function(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
};
vm.createContext(ctx);
vm.runInContext(extractFn(dash, 'wizardLibraryItemSource', 'pinItemKey'), ctx);
vm.runInContext(extractFn(dash, 'pinItemKey', 'findCoachPinnedWorkout'), ctx);
vm.runInContext(extractFn(dash, 'findCoachPinnedWorkout', 'isPinnedTableMissing'), ctx);
vm.runInContext(extractFn(dash, 'wizardLibraryRowHtml', 'pinnedWizardLibraryItems'), ctx);

const pinnedRow = vm.runInContext(
  'wizardLibraryRowHtml({ id: "lib-1", name: "EMOM", description: "Timer work", _source: "foundational", _focus: "Boulders" }, { showPathMeta: true })',
  ctx
);
assert.ok(/aw-chip/.test(pinnedRow));
assert.ok(/data-id="lib-1"/.test(pinnedRow));
assert.ok(/aw-pin-btn is-on/.test(pinnedRow) && />Pinned</.test(pinnedRow));
assert.ok(/Quiet feet on the slab/.test(pinnedRow), 'focus_note under title');
assert.ok(/Edit note/.test(pinnedRow));
assert.ok(!/data-edit-id/.test(pinnedRow), 'foundational has no Edit this workout');
assert.ok(!/Duplicate/.test(pinnedRow), 'foundational has no Duplicate');

const customRow = vm.runInContext(
  'wizardLibraryRowHtml({ id: "cw-1", name: "Repeaters", description: "Hang repeats", _source: "custom", created_by: "coach-1" }, { showPathMeta: true })',
  ctx
);
assert.ok(/>Pin</.test(customRow), 'unpinned custom shows Pin');
assert.ok(/Edit this workout/.test(customRow));
assert.ok(/Duplicate/.test(customRow));
assert.ok(!/Edit note/.test(customRow));

ctx._editingPinNoteKey = 'lib-1::foundational';
const editing = vm.runInContext(
  'wizardLibraryRowHtml({ id: "lib-1", name: "EMOM", _source: "foundational", _focus: "Boulders" }, { showPathMeta: true })',
  ctx
);
assert.ok(/aw-pin-note-ta/.test(editing));
assert.ok(/data-pin-note-save/.test(editing));
assert.ok(!/Quiet feet on the slab<\/span>/.test(editing), 'note moves into textarea while editing');

const dupSrc = extractFn(dash, 'duplicateCoachCustomWorkout', 'wizardLibraryRowHtml');
assert.ok(/baseName \+ ' \(copy\)'/.test(dupSrc) || / \(copy\)/.test(dupSrc));
assert.ok(/enterEditCustomWorkout\(created\)/.test(dupSrc));

console.log('coach-pinned-workouts tests passed');
