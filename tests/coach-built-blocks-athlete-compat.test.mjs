import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import vm from 'vm';
import { startStaticServer, launchChromium, withPage, USER_ID } from './harness.mjs';

// Blocks produced by the coach block builder must open correctly in the
// athlete Train builder (flag on and flag off).
const __dirname = dirname(fileURLToPath(import.meta.url));
const dash = readFileSync(join(__dirname, '..', 'coach-dashboard.html'), 'utf8');
const start = dash.indexOf('  // ---------- Coach block builder ----------');
const end = dash.indexOf('  function cwbSectionsForSave(');
assert.ok(start > 0 && end > start, 'coach block builder module present');
const ctx = { console, JSON, Date, Math, Array, Object, String, Number, parseInt, isNaN, setTimeout, clearTimeout,
  escapeHtml: function(s){ return String(s); }, shapedBlockName: function(b){ return b.shape; }, shapedBlockSummary: function(){ return ''; },
  _assignWizard: { blocks: [] } };
vm.createContext(ctx);
vm.runInContext(dash.slice(start, end), ctx);
const run = function(code){ return JSON.parse(JSON.stringify(vm.runInContext(code, ctx))); };

// What the coach builder would save for an EMOM + Repeaters session.
const blocks = run(`(function(){
  var e = cwbNewBlock('emom'); e.title = 'EMOM 7 x 2';
  e.rounds[0].boulders[0].text = 'v4 orange'; e.rounds[0].rest_after_sec = 600;
  e.rounds.push(cwbNewRound(e.rounds[0].boulders)); e.rounds[1].rest_after_sec = 600;
  var h = cwbNewBlock('rep_pass_fail'); h.title = 'Repeaters'; h.grip = 'half crimp'; h.assistance = '+35 lb';
  h.sets.push(cwbNewSet(5)); h.sets.forEach(function(s){ s.reps.push({ ok: null }); });
  var m = cwbNewBlock('section'); m.title = 'Mental'; m.notes = 'Box breathing 4 min';
  var r = cwbNewBlock('rest');
  var c = cwbNewBlock('circuit'); c.exercises[0].name = 'Pull-ups'; c.exercises[0].reps = '5';
  return [e, h, m, r, c];
})()`);

async function seeded(flag){
  const browser = await launchChromium();
  const { server, port } = await startStaticServer();
  try{
    let out = null;
    await withPage(browser, port, { path: '/index.html?wk=' + flag }, async function(page){
      await page.waitForFunction(function(){ return typeof window.seedTrainBlocksFromSections === 'function'; }, null, { timeout: 30000 });
      out = await page.evaluate(function(b){ return JSON.parse(JSON.stringify(seedTrainBlocksFromSections(b))); }, blocks);
    });
    return out;
  } finally {
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

for(const flag of ['1', '0']){
  const out = await seeded(flag);
  assert.deepStrictEqual(out.map(function(b){ return b.shape; }), ['emom', 'rep_pass_fail', 'section', 'rest', 'circuit'], 'shapes kept (wk=' + flag + ')');
  assert.strictEqual(out[0].title, 'EMOM 7 x 2');
  assert.strictEqual(out[0].rounds.length, 2, 'both EMOM rounds kept');
  assert.strictEqual(out[0].rounds[0].boulders[0].text, 'v4 orange');
  assert.strictEqual(out[0].rounds[1].boulders[0].text, 'v4 orange', 'copied round keeps boulders');
  assert.strictEqual(out[0].rounds[0].rest_after_sec, 600);
  assert.strictEqual(out[0].complete, false);
  assert.strictEqual(out[1].grip, 'half crimp');
  assert.strictEqual(out[1].assistance, '+35 lb');
  assert.strictEqual(out[1].sets.length, 2, 'two sets kept');
  assert.ok(out[1].sets.every(function(s){ return s.reps.length === 6; }), 'six reps per set kept');
  assert.strictEqual(out[2].title, 'Mental');
  assert.strictEqual(out[2].notes, 'Box breathing 4 min');
  assert.strictEqual(out[3].duration_sec, 600);
  assert.strictEqual(out[4].exercises[0].name, 'Pull-ups');
  if(flag === '1'){
    assert.ok(out[0].rounds.every(function(r){ return r.boulders.every(function(b){ return b.id && b.complete === false; }); }), 'boulders tickable with wk on');
  }
}
console.log('coach-built-blocks-athlete-compat: ok');
