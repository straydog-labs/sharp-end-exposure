import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

const step3 = dash.match(/if\(step === 3\)\{[\s\S]*?return;\n    \}\n\n    setAssignWizardChrome\('Due date/);
assert.ok(step3, 'step 3 block');
assert.ok(/new-a-name-edit/.test(step3[0]));
assert.ok(/assignWizardWarmupPickerHtml/.test(step3[0]));
assert.ok(!/new-a-desc/.test(step3[0]), 'description is not on step 3');
assert.ok(!/Coach\\'s instructions/.test(step3[0]));

const step4 = dash.match(/setAssignWizardChrome\('Due date & resource'[\s\S]*?function readAssignWizardReviewFields/);
assert.ok(step4, 'step 4 block');
assert.ok(/new-a-due/.test(step4[0]) && /new-a-link/.test(step4[0]));
assert.ok(/Coach\\'s instructions/.test(step4[0]));
assert.ok(/id="new-a-desc"/.test(step4[0]));
assert.ok(/a note for the athlete about this assignment/.test(step4[0]));
assert.ok(/escapeHtml\(_assignWizard\.assignDescription/.test(step4[0]), 'edit/repeat prefill');
assert.ok(/readAssignWizardReviewFields\(\)/.test(step4[0]));

const submit = dash.match(/function submitAssignWizard\(\)\{[\s\S]*?\n  function startQuickAssignment/);
assert.ok(submit);
assert.ok(/readAssignWizardReviewFields\(\)/.test(submit[0]));
assert.ok(/var assignDescription = \(_assignWizard\.assignDescription \|\| ''\)\.trim\(\) \|\| null/.test(submit[0]));
assert.ok(/description: assignDescription/.test(submit[0]));

const fromAssign = dash.match(/function startAssignWizardFromAssignment\([\s\S]*?\n  function renderNewAssignmentForm/);
assert.ok(fromAssign);
assert.ok(/_assignWizard\.assignDescription = assignment\.description \|\| ''/.test(fromAssign[0]));

assert.ok(/id="aw-athlete-side"/.test(dash));
assert.ok(/function paintAssignWizardAthleteSide/.test(dash));
assert.ok(/function loadAssignWizardSideAssignments/.test(dash));
assert.ok(/_rosterInsightsByAthlete\[ctx\.athleteId\]/.test(dash));
assert.ok(/zoneBarSegsHtml\(zones\)/.test(dash));
assert.ok(/No zone data yet/.test(dash));
assert.ok(/order=created_at\.desc/.test(dash.match(/function loadAssignWizardSideAssignments[\s\S]*?\n  function openAssignWizardOverlay/)[0]));
assert.ok(!/_lastCoachAssignments/.test(dash.match(/function loadAssignWizardSideAssignments[\s\S]*?\n  function openAssignWizardOverlay/)[0]));
assert.ok(/paintAssignWizardAthleteSide\(\)/.test(dash.match(/function openAssignWizardOverlay\(\)\{[\s\S]*?\n  function closeAssignWizardOverlay/)[0]));

assert.ok(/#assign-wizard-overlay \.aw-layout/.test(dash));
assert.ok(/#assign-wizard-overlay\.aw-quick \.aw-athlete-side\{display:none;\}/.test(dash));
assert.ok(/#coach-log-overlay/.test(dash));
assert.ok(/\.aw-content\{\s*max-width:520px/.test(dash), 'log overlay still uses narrow .aw-content');
assert.ok(/@media \(max-width: 820px\)\{\s*#assign-wizard-overlay \.aw-layout/.test(dash));

const quick = dash.match(/function renderQuickAssignmentForm\(\)\{[\s\S]*?\n  function submitQuickAssignment/);
assert.ok(quick);
assert.ok(/Coach\\'s instructions/.test(quick[0]));
assert.ok(/id="quick-a-desc"/.test(quick[0]));

const pick = dash.match(/function applyWizardLibraryPick\(item\)\{[\s\S]*?\n  function enterCreateCustomWorkout/);
assert.ok(pick, 'library pick handler');
assert.ok(/_assignWizard\.libraryDescription = item\.description \|\| ''/.test(pick[0]));
assert.ok(!/_assignWizard\.assignDescription = item\.description/.test(pick[0]), 'pick does not seed coach note');

const createNext = dash.match(/var libDesc = \(document\.getElementById\('new-a-lib-desc'\)\.value \|\| ''\)\.trim\(\);[\s\S]*?goAssignWizardStep\(3\);/);
assert.ok(createNext, 'custom-create next');
assert.ok(/_assignWizard\.libraryDescription = libDesc/.test(createNext[0]));
assert.ok(!/_assignWizard\.assignDescription = libDesc/.test(createNext[0]), 'create next does not seed coach note');

const pathFn = dash.match(/function wizardPathSummaryHtml\(\)\{[\s\S]*?\n  function setAssignWizardChrome/);
assert.ok(pathFn, 'path summary');
assert.ok(/aw-workout-details/.test(pathFn[0]));
assert.ok(/Workout details/.test(pathFn[0]));
assert.ok(/libraryDescription/.test(pathFn[0]));
assert.ok(/<details class="aw-workout-details">/.test(pathFn[0]));
assert.ok(!/\bopen\b/.test(pathFn[0]), 'details collapsed by default');
assert.ok(!/new-a-desc/.test(pathFn[0]), 'protocol expander is not the coach-note field');
assert.ok(/white-space:pre-wrap/.test(dash));

function extractFn(src, name, nextName){
  const start = src.indexOf('function ' + name + '(');
  const end = src.indexOf('function ' + nextName + '(', start + 1);
  assert.ok(start >= 0 && end > start, 'extract ' + name);
  return src.slice(start, end);
}

const ctx = {
  _assignWizard: {
    assignDescription: '',
    libraryDescription: '',
    drillName: '',
    trainingFocus: null,
    createMode: false,
    createEntryStep: 1,
    editingCustomWorkoutId: null,
    libraryItemId: null,
    customWorkoutItemId: null,
    itemSource: null
  },
  _coachLibSelectedId: null,
  isWarmUpLibraryItem: function(){ return false; },
  itemTrainingFocus: function(){ return 'Boulders'; },
  coachLibFocusLabel: function(f){ return f; },
  goAssignWizardStep: function(){},
  assignmentWarmupId: function(){ return null; },
  warmupCustomWorkoutRows: function(){ return []; },
  escapeHtml: function(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
};
vm.createContext(ctx);
vm.runInContext(extractFn(dash, 'applyWizardLibraryPick', 'enterCreateCustomWorkout'), ctx);
vm.runInContext(extractFn(dash, 'wizardPathSummaryHtml', 'setAssignWizardChrome'), ctx);
vm.runInContext(
  'applyWizardLibraryPick({ id: "emom-1", name: "EMOM", description: "Set a timer for 8-10 minutes...", _source: "foundational", _focus: "Boulders" });',
  ctx
);
assert.strictEqual(ctx._assignWizard.assignDescription, '', 'new pick leaves coach instructions blank');
assert.strictEqual(ctx._assignWizard.libraryDescription, 'Set a timer for 8-10 minutes...');
assert.strictEqual(ctx._assignWizard.drillName, 'EMOM');
const pathHtml = vm.runInContext('wizardPathSummaryHtml()', ctx);
assert.ok(/Boulders/.test(pathHtml) && /EMOM/.test(pathHtml));
assert.ok(/<details class="aw-workout-details">/.test(pathHtml));
assert.ok(/<summary>Workout details<\/summary>/.test(pathHtml));
assert.ok(/Set a timer for 8-10 minutes\.\.\./.test(pathHtml));
assert.ok(!/\sopen/.test(pathHtml), 'expander starts collapsed');
assert.ok(!/id="new-a-desc"/.test(pathHtml));

ctx._assignWizard.assignDescription = 'Stay on the 45';
ctx._assignWizard.libraryDescription = 'Set a timer for 8-10 minutes...';
const editPath = vm.runInContext('wizardPathSummaryHtml()', ctx);
assert.ok(/Set a timer for 8-10 minutes\.\.\./.test(editPath));
assert.ok(!/Stay on the 45/.test(editPath), 'expander is protocol, not the coach note');

console.log('coach-wizard-instructions-sidebar tests: ok');
