import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');
const index = readFileSync(join(__dirname, '../index.html'), 'utf8');

assert.ok(/id="assign-launch-btn"/.test(dash));
assert.ok(/id="assign-quick-btn"/.test(dash) && />Quick assignment</.test(dash));
assert.ok(/class="roster-quick-assign-btn">Quick assignment</.test(dash));
assert.ok(/assign-launch-secondary/.test(dash), 'hub quick path is visually secondary');

assert.ok(/function startQuickAssignment/.test(dash));
assert.ok(/function renderQuickAssignmentForm/.test(dash));
assert.ok(/function submitQuickAssignment/.test(dash));
assert.ok(/Coach\\'s instructions/.test(dash) || /Coach's instructions/.test(dash));
assert.ok(/- \[ \]/.test(dash), 'markdown checklist tip in placeholder');

const quickFn = dash.match(/function submitQuickAssignment\(\)\{[\s\S]*?\n  function startAssignWizard/);
assert.ok(quickFn, 'submitQuickAssignment extracted');
assert.ok(/createCoachLibraryAssignment\(token, payload\)/.test(quickFn[0]));
assert.ok(!/library_item_id/.test(quickFn[0]), 'omits library_item_id');
assert.ok(!/custom_workout_item_id/.test(quickFn[0]), 'omits custom_workout_item_id');
assert.ok(!/createCoachCustomWorkout/.test(quickFn[0]), 'does not insert a custom workout');
assert.ok(/https\?:\\\/\\\//.test(quickFn[0]) || /https\?:\/\//.test(quickFn[0]));
assert.ok(/loadAssignments\(token, coachUser, athleteId\)/.test(quickFn[0]));
assert.ok(/showAssignSavedBanner\('Assignment saved\.'\)/.test(quickFn[0]));
assert.ok(/Title is required/.test(quickFn[0]));

const wizardSubmit = dash.match(/function submitAssignWizard\(\)\{[\s\S]*?\n  function startQuickAssignment/);
assert.ok(wizardSubmit, 'structured submit still present');
assert.ok(/library_item_id/.test(wizardSubmit[0]), 'structured path still links a workout');
assert.ok(/function goAssignWizardStep/.test(dash));
assert.ok(/Step ' \+ step \+ ' of 4/.test(dash));

assert.ok(/startQuickAssignment/.test(dash.match(/function renderNewAssignmentForm[\s\S]*?\n  \/\/ Cancel/)[0]));
assert.ok(/roster-quick-assign-btn[\s\S]{0,400}startQuickAssignment/.test(dash));
assert.ok(/getElementById\('assign-launch-btn'\)[\s\S]{0,80}startAssignWizard/.test(dash));

const trainCard = index.match(/function trainCardHtml\(a\)\{[\s\S]*?\nfunction renderTrainList/);
assert.ok(trainCard);
assert.ok(/hasLinkedItem = !!\(a\.library_item_id \|\| a\.custom_workout_item_id\)/.test(trainCard[0]));
assert.ok(/Start session/.test(trainCard[0]));
assert.ok(/Mark complete/.test(trainCard[0]));
assert.ok(/renderTrainDescriptionHtml/.test(trainCard[0]));

console.log('coach-quick-assignment tests: ok');
