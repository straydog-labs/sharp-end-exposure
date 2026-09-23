import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index267'/.test(index));
assert.ok(/APP_VERSION = 'index267'/.test(sw));

assert.ok(/id="screen-train-mindful"/.test(index));
assert.ok(/id="screen-train-run"/.test(index));
assert.ok(/id="train-mindful-continue"/.test(index));
assert.ok(/id="train-mindful-skip"/.test(index));
assert.ok(/Before you start - take a breath\. Notice where your bag is, your water bottle, who's around you\./.test(index));
assert.ok(/class="saw-next" id="train-mindful-continue"/.test(index));
assert.ok(/class="saw-next train-mindful-skip" id="train-mindful-skip"/.test(index));
assert.ok(/finishTrainMindful\('continue'\)/.test(index));
assert.ok(/finishTrainMindful\('skip'\)/.test(index));
assert.ok(/id="train-run-next"/.test(index));
assert.ok(/id="train-run-back"/.test(index));
assert.ok(/id="train-run-prog"/.test(index));
assert.ok(/id="train-sess-run"/.test(index));
assert.ok(/Run step by step/.test(index));
assert.ok(/Edit full session/.test(index));

assert.ok(/function enterTrainSession\(/.test(index));
assert.ok(/function finishTrainMindful\(/.test(index));
assert.ok(/function beginTrainSessionAfterMindful\(/.test(index));
assert.ok(/function renderTrainRunScreen\(/.test(index));
assert.ok(/function trainRunNext\(/.test(index));
assert.ok(/function trainRunBack\(/.test(index));
assert.ok(/function openTrainGuidedRun\(/.test(index));
assert.ok(/function openTrainSessionBuilderFromRun\(/.test(index));
assert.ok(/function sessionShouldUseGuidedRun\(/.test(index));
assert.ok(/function isTrainSessionLiveScreen\(/.test(index));

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

const startBlank = extractFn(index, 'startBlankTrainSession');
const seedFromItem = extractFn(index, 'seedTrainSessionFromItem');
const enter = extractFn(index, 'enterTrainSession');
const finish = extractFn(index, 'finishTrainMindful');
const begin = extractFn(index, 'beginTrainSessionAfterMindful');
const renderRun = extractFn(index, 'renderTrainRunScreen');
const runNext = extractFn(index, 'trainRunNext');
const cancel = extractFn(index, 'cancelTrainSession');
const save = extractFn(index, 'saveTrainSession');
const show = extractFn(index, 'showScreen');
const renderBlock = extractFn(index, 'renderTrainBlockHtml');
const syncFields = extractFn(index, 'syncTrainSessionFieldsFromDom');
const renderBuilder = extractFn(index, 'renderTrainSessionBuilder');

assert.ok(/enterTrainSession\(\)/.test(startBlank));
assert.ok(!/showScreen\('screen-train-session'\)/.test(startBlank));
assert.ok(/enterTrainSession\(\)/.test(seedFromItem));
assert.ok(!/showScreen\('screen-train-session'\)/.test(seedFromItem));

assert.ok(/mindful_shown = true/.test(enter));
assert.ok(/showScreen\('screen-train-mindful'\)/.test(enter));
assert.ok(!/setTimeout/.test(enter));
assert.ok(!/setTimeout/.test(finish));
assert.ok(/mindful_skipped/.test(finish));
assert.ok(/sessionShouldUseGuidedRun\(\)/.test(begin));
assert.ok(/showScreen\('screen-train-run'\)/.test(begin));
assert.ok(/showScreen\('screen-train-session'\)/.test(begin));

assert.ok(/Block /.test(renderRun) && / of /.test(renderRun));
assert.ok(/train-run-step-in/.test(renderRun));
assert.ok(/@keyframes trainRunIn/.test(index));
assert.ok(/Save session/.test(renderRun));
assert.ok(/Up next:/.test(renderRun));
assert.ok(/Last block\. Save when you are done\./.test(renderRun));
assert.ok(/renderTrainBlockHtml/.test(renderRun));
assert.ok(/saveTrainSession\(\)/.test(runNext));

assert.ok(/trainSessionState = null/.test(cancel));
assert.ok(/resetTrainSessionCancelUi/.test(cancel));
assert.ok(/function resetTrainSessionCancelUi\(/.test(index));
assert.ok(/training_sessions/.test(save));
assert.ok(/screen-train-done/.test(save));
assert.ok(/isTrainSessionLiveScreen\(_prevScreen\)/.test(show));
assert.ok(/screen-train-run/.test(show));
assert.ok(/screen-train-mindful/.test(show));

assert.ok(/isTrainRunView\(\)/.test(renderBlock));
assert.ok(/trainRemoveBlock/.test(renderBlock));
assert.ok(/classList\.contains\('active'\)/.test(syncFields));
assert.ok(/train-sess-run/.test(renderBuilder));
const runLinkAt = renderBuilder.indexOf("getElementById('train-sess-run')");
const emptyReturnAt = renderBuilder.indexOf('clearAllTrainBlockTimerIntervals');
assert.ok(runLinkAt !== -1 && emptyReturnAt !== -1 && runLinkAt < emptyReturnAt,
  'hide Run step-by-step before empty-builder early return');

assert.ok(!/screen-train-mindful/.test(dash), 'coach-dashboard must stay untouched');
assert.ok(!/screen-train-run/.test(dash));
assert.ok(!/enterTrainSession/.test(dash));

console.log('train-run-mode tests: ok');
