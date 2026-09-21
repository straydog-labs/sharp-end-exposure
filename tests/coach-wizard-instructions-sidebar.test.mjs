import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

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

console.log('coach-wizard-instructions-sidebar tests: ok');
