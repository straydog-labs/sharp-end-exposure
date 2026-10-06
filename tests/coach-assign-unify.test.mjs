import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');

function extractFn(src, name, nextName){
  const start = src.indexOf('function ' + name + '(');
  const end = nextName ? src.indexOf('function ' + nextName + '(', start + 1) : src.length;
  assert.ok(start >= 0 && end > start, 'extract ' + name);
  return src.slice(start, end);
}

assert.ok(/function startAssign\(opts\)/.test(dash));
assert.ok(/function renderAssignKindChoice/.test(dash));
assert.ok(/What are you assigning\?/.test(dash));
assert.ok(/id="assign-kind-workout"/.test(dash));
assert.ok(/id="assign-kind-task"/.test(dash));
assert.ok(/Athlete gets a Start button in Train\./.test(dash));
assert.ok(/Homework with an optional checklist\. No Start button\./.test(dash));

const startAssignSrc = extractFn(dash, 'startAssign', 'renderAssignKindChoice');
assert.ok(/opts\.starterShortlist/.test(startAssignSrc));
assert.ok(/startAssignWizard\(\{ starterShortlist: true \}\)/.test(startAssignSrc));
assert.ok(/renderAssignKindChoice\(\)/.test(startAssignSrc));
assert.ok(!/startQuickAssignment/.test(startAssignSrc), 'starter skip does not open Task');

const choiceSrc = extractFn(dash, 'renderAssignKindChoice', 'startQuickAssignment');
assert.ok(/startAssignWizard\(\)/.test(choiceSrc), 'Workout opens existing wizard');
assert.ok(/startQuickAssignment/.test(choiceSrc), 'Task opens existing quick form');

const invite = extractFn(dash, 'openJoinedAthleteAssignWizard', 'loadRoster');
assert.ok(/startAssign\(\{ starterShortlist: true \}\)/.test(invite));
assert.ok(!/renderAssignKindChoice/.test(invite));

const wire = extractFn(dash, 'wireCoachAssignmentActions', 'softDeleteCoachAssignment');
assert.ok(/startAssignWizardFromAssignment\(src, 'edit'\)/.test(wire));
assert.ok(/startAssignWizardFromAssignment\(src, 'repeat'\)/.test(wire));
assert.ok(!/startAssign\(/.test(wire), 'Edit/Repeat skip the choice step');

const fromAssign = extractFn(dash, 'startAssignWizardFromAssignment', 'renderNewAssignmentForm');
assert.ok(!/startAssign\(/.test(fromAssign));
assert.ok(!/renderAssignKindChoice/.test(fromAssign));

const submitLabel = extractFn(dash, 'wizardSubmitLabel', 'wizardBusyLabel');
assert.ok(/Save changes/.test(submitLabel));
assert.ok(/Create workout assignment/.test(submitLabel));
assert.ok(!/Create assignment'/.test(submitLabel));

const rosterHtml = extractFn(dash, 'rosterRowSideHtml', 'primeAssignWizardFromRosterRow');
assert.ok(/class="roster-assign-btn">Assign</.test(rosterHtml));
assert.ok(!/New assignment/.test(rosterHtml));
assert.ok(!/Quick assignment/.test(rosterHtml));

const detailForm = dash.match(/function renderNewAssignmentForm[\s\S]*?\n  \/\/ Cancel/);
assert.ok(detailForm, 'detail assign form');
assert.ok(/>Assign</.test(detailForm[0]));
assert.ok(!/New assignment/.test(detailForm[0]));
assert.ok(!/Quick assignment/.test(detailForm[0]));
assert.ok(/startAssign/.test(detailForm[0]));

const wizardSubmitSrc = extractFn(dash, 'submitAssignWizard', 'startAssign');
assert.ok(/var assignPayload = \{[\s\S]*coach_id: coachUser\.id,[\s\S]*athlete_id: athleteId,[\s\S]*title: _assignWizard\.drillName,[\s\S]*description: assignDescription,[\s\S]*due_date: due \|\| null[\s\S]*\};/.test(wizardSubmitSrc));
assert.ok(/if\(link\) assignPayload\.resource_link = link;/.test(wizardSubmitSrc));
assert.ok(/applyAssignmentWarmupField\(assignPayload\)/.test(wizardSubmitSrc));
assert.ok(/custom_workout_item_id: customRow\.id/.test(wizardSubmitSrc));

const quickSubmitSrc = extractFn(dash, 'submitQuickAssignment', 'startAssignWizard');
assert.ok(/var payload = \{[\s\S]*coach_id: coachUser\.id,[\s\S]*athlete_id: athleteId,[\s\S]*title: title,[\s\S]*description: instructions \|\| null,[\s\S]*due_date: due \|\| null,[\s\S]*resource_link: link \|\| null[\s\S]*\};/.test(quickSubmitSrc));
assert.ok(!/library_item_id/.test(quickSubmitSrc));
assert.ok(!/custom_workout_item_id/.test(quickSubmitSrc));
assert.ok(!/warmup_custom_workout_item_id/.test(quickSubmitSrc));

function postedBodies(){
  const posted = [];
  const els = {
    'new-a-msg': { innerHTML: '' },
    'new-a-submit': { disabled: false, textContent: '' },
    'quick-a-submit': { disabled: false, textContent: '' },
    'new-a-due': { value: '' },
    'new-a-link': { value: '' },
    'new-a-desc': { value: '' },
    'quick-a-title': { value: '' },
    'quick-a-desc': { value: '' },
    'quick-a-due': { value: '' },
    'quick-a-link': { value: '' }
  };
  const ctx = {
    _assignWizard: null,
    _assignWizardCtx: {
      token: 'tok',
      coachUser: { id: 'coach-1' },
      athleteId: 'ath-1',
      athleteLabel: 'Anna'
    },
    _detailCtx: null,
    document: {
      getElementById: function(id){ return els[id] || null; }
    },
    assignmentWarmupId: function(){
      var id = ctx._assignWizard && ctx._assignWizard.warmupCustomWorkoutItemId;
      return id ? id : null;
    },
    applyAssignmentWarmupField: function(payload){
      payload.warmup_custom_workout_item_id = ctx.assignmentWarmupId();
      return payload;
    },
    readAssignWizardReviewFields: function(){
      if(!ctx._assignWizard) return;
      var dueInput = ctx.document.getElementById('new-a-due');
      var linkInput = ctx.document.getElementById('new-a-link');
      var descInput = ctx.document.getElementById('new-a-desc');
      if(dueInput) ctx._assignWizard.dueDate = dueInput.value || '';
      if(linkInput) ctx._assignWizard.resourceLink = linkInput.value.trim();
      if(descInput) ctx._assignWizard.assignDescription = descInput.value || '';
    },
    wizardSubmitLabel: function(){
      return (ctx._assignWizard && ctx._assignWizard.mode === 'edit') ? 'Save changes' : 'Create workout assignment';
    },
    wizardBusyLabel: function(){
      return (ctx._assignWizard && ctx._assignWizard.mode === 'edit') ? 'Saving...' : 'Creating...';
    },
    createCoachLibraryAssignment: function(token, payload){
      posted.push({ token: token, payload: JSON.parse(JSON.stringify(payload)) });
      return Promise.resolve({ id: 'asg-1' });
    },
    loadAssignments: function(){ return Promise.resolve(); },
    loadCoachWorkoutLibrary: function(){ return Promise.resolve([]); },
    closeAssignWizardOverlay: function(){},
    resetAssignWizard: function(){},
    syncWizardShellMode: function(){},
    showAssignSavedBanner: function(){},
    isMissingColumnErr: function(){ return false; },
    escapeHtml: function(s){ return String(s == null ? '' : s); },
    friendlyErrorMessage: function(err, fallback){ return (err && err.message) || fallback; },
    normalizeTrainingFocus: function(v){ return v || ''; }
  };
  vm.createContext(ctx);
  vm.runInContext(
    extractFn(dash, 'submitAssignWizard', 'startAssign') +
    extractFn(dash, 'submitQuickAssignment', 'startAssignWizard'),
    ctx
  );
  return { ctx: ctx, posted: posted, els: els };
}

function runWizard(fields){
  const harness = postedBodies();
  harness.ctx._assignWizard = {
    mode: 'create',
    createMode: false,
    drillName: fields.title,
    assignDescription: fields.description || '',
    dueDate: fields.due || '',
    resourceLink: fields.link || '',
    libraryItemId: fields.libraryItemId || null,
    customWorkoutItemId: fields.customWorkoutItemId || null,
    warmupCustomWorkoutItemId: fields.warmup || null,
    editAssignmentId: null
  };
  harness.els['new-a-due'].value = fields.due || '';
  harness.els['new-a-link'].value = fields.link || '';
  harness.els['new-a-desc'].value = fields.description || '';
  harness.ctx.submitAssignWizard();
  return harness.posted;
}

function runTask(fields){
  const harness = postedBodies();
  harness.els['quick-a-title'].value = fields.title;
  harness.els['quick-a-desc'].value = fields.description || '';
  harness.els['quick-a-due'].value = fields.due || '';
  harness.els['quick-a-link'].value = fields.link || '';
  harness.ctx.submitQuickAssignment();
  return harness.posted;
}

const workoutBare = runWizard({
  title: 'EMOM',
  libraryItemId: 'lib-1'
});
assert.strictEqual(workoutBare.length, 1);
assert.deepStrictEqual(workoutBare[0].payload, {
  coach_id: 'coach-1',
  athlete_id: 'ath-1',
  title: 'EMOM',
  description: null,
  due_date: null,
  library_item_id: 'lib-1',
  warmup_custom_workout_item_id: null
});
assert.ok(!Object.prototype.hasOwnProperty.call(workoutBare[0].payload, 'resource_link'));
assert.ok(!Object.prototype.hasOwnProperty.call(workoutBare[0].payload, 'custom_workout_item_id'));

const workoutFull = runWizard({
  title: 'EMOM',
  description: 'Quiet feet',
  due: '2026-10-08',
  link: 'https://example.com/plan',
  libraryItemId: 'lib-1',
  warmup: 'wu-1'
});
assert.deepStrictEqual(workoutFull[0].payload, {
  coach_id: 'coach-1',
  athlete_id: 'ath-1',
  title: 'EMOM',
  description: 'Quiet feet',
  due_date: '2026-10-08',
  library_item_id: 'lib-1',
  resource_link: 'https://example.com/plan',
  warmup_custom_workout_item_id: 'wu-1'
});

const workoutCustom = runWizard({
  title: 'Repeaters',
  customWorkoutItemId: 'cw-1'
});
assert.deepStrictEqual(workoutCustom[0].payload, {
  coach_id: 'coach-1',
  athlete_id: 'ath-1',
  title: 'Repeaters',
  description: null,
  due_date: null,
  custom_workout_item_id: 'cw-1',
  warmup_custom_workout_item_id: null
});
assert.ok(!Object.prototype.hasOwnProperty.call(workoutCustom[0].payload, 'library_item_id'));
assert.ok(!Object.prototype.hasOwnProperty.call(workoutCustom[0].payload, 'resource_link'));

const taskBare = runTask({ title: 'Pick a project' });
assert.strictEqual(taskBare.length, 1);
assert.deepStrictEqual(taskBare[0].payload, {
  coach_id: 'coach-1',
  athlete_id: 'ath-1',
  title: 'Pick a project',
  description: null,
  due_date: null,
  resource_link: null
});
assert.ok(!Object.prototype.hasOwnProperty.call(taskBare[0].payload, 'library_item_id'));
assert.ok(!Object.prototype.hasOwnProperty.call(taskBare[0].payload, 'custom_workout_item_id'));
assert.ok(!Object.prototype.hasOwnProperty.call(taskBare[0].payload, 'warmup_custom_workout_item_id'));

const taskFull = runTask({
  title: 'Pick a project',
  description: '- [ ] Walk the wall',
  due: '2026-10-09',
  link: 'https://example.com/hw'
});
assert.deepStrictEqual(taskFull[0].payload, {
  coach_id: 'coach-1',
  athlete_id: 'ath-1',
  title: 'Pick a project',
  description: '- [ ] Walk the wall',
  due_date: '2026-10-09',
  resource_link: 'https://example.com/hw'
});

console.log('coach-assign-unify tests: ok');
console.log('WORKOUT_BARE ' + JSON.stringify(workoutBare[0].payload));
console.log('WORKOUT_FULL ' + JSON.stringify(workoutFull[0].payload));
console.log('WORKOUT_CUSTOM ' + JSON.stringify(workoutCustom[0].payload));
console.log('TASK_BARE ' + JSON.stringify(taskBare[0].payload));
console.log('TASK_FULL ' + JSON.stringify(taskFull[0].payload));
