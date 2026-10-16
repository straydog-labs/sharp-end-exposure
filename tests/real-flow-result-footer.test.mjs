import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, readyDial, waitForScreen,
  continueNewLogIfPicker, sessionRow, USER_ID, ROUTE, GRADE, TERRAIN, CLIMB_ID
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const SHOT_DIR = '/opt/cursor/artifacts/screenshots';
const SIZES = [
  { width: 390, height: 667 },
  { width: 390, height: 844 }
];

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index316'/.test(index));
assert.ok(/APP_VERSION = 'index316'/.test(sw));
assert.ok(/id="log-send-group"/.test(index));
assert.ok(/id="log-take-group"/.test(index));
assert.ok(/id="log-result-continue"/.test(index));
assert.ok(/class="log-flow-footer"/.test(index));
assert.ok(/--log-flow-footer-h/.test(index));
assert.ok(/function syncLogFlowChrome/.test(index));
assert.ok(/id="edit-sheet-footer"/.test(index));
assert.ok(/id="edit-sheet-body"/.test(index));
assert.ok(/\.screen\.active\.log-flow-screen\{[\s\S]*?min-height:0/.test(index.replace(/\s+/g, '')));
assert.ok(/\.log-flow-footer\{[\s\S]*?position:relative/.test(index.replace(/\s+/g, '')));
assert.ok(/\.log-flow-body\{[\s\S]*?overflow-y:auto/.test(index.replace(/\s+/g, '')));

function rectsOverlap(a, b){
  if(!a || !b) return true;
  return !(a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5 || a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5);
}

async function authPage(page){
  await page.waitForFunction(function(){
    return typeof window.startLogFlow === 'function' && typeof window.selectLogResult === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(uid){
    window._authUser = { id: uid };
    window._authToken = 'test-token';
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window._cachedClimbs = [];
    window._homeDataReady = true;
  }, USER_ID);
  // Boot routing (routeOnLoad) must land before we open the log wizard,
  // otherwise getSession/home/sessions will steal .screen.active later.
  await page.waitForFunction(function(){
    var el = document.querySelector('.screen.active');
    return el && (el.id === 'screen-home' || el.id === 'screen-sessions' || el.id === 'screen-auth' || el.id === 'screen-baseline');
  }, null, { timeout: 8000 });
}

async function toResultStep(page){
  await authPage(page);
  await page.evaluate(function(){ startLogFlow({ skipPick: true }); });
  await continueNewLogIfPicker(page);
  await waitForScreen(page, 'screen-log-act');
  await page.waitForTimeout(80);
  await readyDial(page);
  await tap(page, '#log-act-continue');
  await waitForScreen(page, 'screen-log-result');
}

async function scrollScreenBottom(page, screenId){
  await page.evaluate(function(id){
    var screen = document.getElementById(id);
    var body = screen && screen.querySelector('.log-flow-body');
    var scroller = body || screen;
    if(scroller) scroller.scrollTop = scroller.scrollHeight;
  }, screenId);
  await page.waitForTimeout(60);
}

async function layoutDump(page){
  return page.evaluate(function(){
    function box(id){
      var el = document.getElementById(id);
      if(!el) return null;
      var r = el.getBoundingClientRect();
      var cs = window.getComputedStyle(el);
      return {
        id: id,
        x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, top: r.top,
        display: cs.display,
        visible: cs.display !== 'none' && el.offsetWidth > 0 && el.offsetHeight > 0
      };
    }
    var screen = document.getElementById('screen-log-result');
    var footer = screen ? screen.querySelector('.log-flow-footer') : null;
    var fr = footer ? footer.getBoundingClientRect() : null;
    var cs = screen ? window.getComputedStyle(screen) : null;
    return {
      innerH: window.innerHeight,
      padBottom: cs ? cs.paddingBottom : null,
      footerH: fr ? fr.height : null,
      footerTop: fr ? fr.top : null,
      send: box('log-send-group'),
      take: box('log-take-group'),
      fall: box('log-fall-group'),
      backoff: box('log-backoff-group'),
      practice: box('log-fall-practice-group'),
      cta: box('log-result-continue'),
      cssFooterH: cs ? getComputedStyle(document.documentElement).getPropertyValue('--log-flow-footer-h') : '',
      screenActive: !!(screen && screen.classList.contains('active')),
      activeId: (document.querySelector('.screen.active') || {}).id || null
    };
  });
}

function assertClearsFooter(content, cta, label){
  assert.ok(content && content.visible, label + ': content missing/hidden');
  assert.ok(cta && cta.visible, label + ': Continue missing');
  assert.ok(
    content.bottom <= cta.y + 0.5,
    label + ': Continue covers content. content.bottom=' + content.bottom + ' cta.y=' + cta.y +
      ' overlap=' + rectsOverlap(
        { x: content.x, y: content.y, width: content.w, height: content.h },
        { x: cta.x, y: cta.y, width: cta.w, height: cta.h }
      )
  );
}

async function shot(page, name){
  if(!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true });
  var dest = join(SHOT_DIR, name);
  await page.evaluate(function(){ return document.fonts ? document.fonts.ready : null; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: dest });
}

async function assertGroupClearsCta(page, result, groupId, label, expandFn){
  await waitForScreen(page, 'screen-log-result');
  await tap(page, '#btn-' + result);
  await page.waitForFunction(function(args){
    var screen = document.getElementById('screen-log-result');
    var g = document.getElementById(args.groupId);
    return !!(screen && screen.classList.contains('active') && g && g.style.display === 'block' && g.offsetHeight > 0);
  }, { groupId: groupId }, { timeout: 8000 });
  if(expandFn) await expandFn();
  await page.evaluate(function(gid){
    var g = document.getElementById(gid);
    var body = document.querySelector('#screen-log-result .log-flow-body');
    if(g && body){
      var er = g.getBoundingClientRect();
      var br = body.getBoundingClientRect();
      body.scrollTop += (er.bottom - br.bottom + 8);
    }
  }, groupId);
  await page.waitForTimeout(60);
  var info = await page.evaluate(function(gid){
    var g = document.getElementById(gid);
    var cta = document.getElementById('log-result-continue');
    var screen = document.getElementById('screen-log-result');
    if(!g || !cta) return { ok: false, reason: 'missing' };
    var er = g.getBoundingClientRect();
    var cr = cta.getBoundingClientRect();
    return {
      ok: g.offsetHeight > 0 && g.style.display !== 'none' && er.bottom <= cr.top + 0.5,
      display: g.style.display,
      h: g.offsetHeight,
      gBottom: er.bottom,
      ctaTop: cr.top,
      ctaH: cta.offsetHeight,
      screenActive: screen && screen.classList.contains('active'),
      activeId: (document.querySelector('.screen.active') || {}).id || null
    };
  }, groupId);
  assert.ok(info.ok, label + ' ' + JSON.stringify(info));
}

async function runSize(browser, port, size, results){
  var tag = size.width + 'x' + size.height;
  await withPage(browser, port, { viewport: size }, async function(page){
    await toResultStep(page);
    await tap(page, '#btn-sent');
    await tap(page, '#btn-tick-flash');
    await scrollScreenBottom(page, 'screen-log-result');
    var dump = await layoutDump(page);
    console.log('sent+' + tag, JSON.stringify({
      padBottom: dump.padBottom, footerH: dump.footerH, footerTop: dump.footerTop,
      sendBottom: dump.send && dump.send.bottom, ctaY: dump.cta && dump.cta.y,
      cssFooterH: dump.cssFooterH, innerH: dump.innerH,
      screenActive: dump.screenActive, activeId: dump.activeId
    }));
    assert.ok(dump.screenActive, 'result screen lost after sent+tick ' + tag + ' active=' + dump.activeId);
    assertClearsFooter(dump.send, dump.cta, 'sent tick ' + tag);
    results['sent-tick-' + tag] = 'PASS';
    await shot(page, 'result-footer-sent-' + tag + '.png');

    await page.evaluate(function(){ if(typeof toggleSendSection === 'function') toggleSendSection(); });
    await scrollScreenBottom(page, 'screen-log-result');
    var expanded = await layoutDump(page);
    assertClearsFooter(expanded.send, expanded.cta, 'sent expanded ' + tag);
    results['sent-expanded-' + tag] = 'PASS';

    await page.evaluate(function(){
      var ta = document.getElementById('send-notes-text');
      if(ta) ta.focus();
      if(typeof syncLogFlowChrome === 'function') syncLogFlowChrome();
    });
    await page.waitForTimeout(40);
    var keyed = await page.evaluate(function(){
      var ta = document.getElementById('send-notes-text');
      var cta = document.getElementById('log-result-continue');
      if(!ta || !cta) return { ok: false, reason: 'missing' };
      var tr = ta.getBoundingClientRect();
      var cr = cta.getBoundingClientRect();
      return { ok: tr.height > 0 && tr.bottom <= cr.top + 0.5, taBottom: tr.bottom, ctaTop: cr.top };
    });
    assert.ok(keyed.ok, 'keyboard send notes ' + tag + ' ' + JSON.stringify(keyed));
    results['sent-keyboard-' + tag] = 'PASS';

    await assertGroupClearsCta(page, 'took', 'log-take-group', 'took-' + tag, async function(){
      await page.evaluate(function(){ if(typeof toggleTakeSection === 'function') toggleTakeSection(); });
    });
    results['took-' + tag] = 'PASS';

    await assertGroupClearsCta(page, 'fell', 'log-fall-group', 'fell-' + tag);
    results['fell-' + tag] = 'PASS';

    await assertGroupClearsCta(page, 'dna', 'log-backoff-group', 'dna-' + tag);
    results['dna-' + tag] = 'PASS';

    await assertGroupClearsCta(page, 'fall_practice', 'log-fall-practice-group', 'fall_practice-' + tag);
    results['fall_practice-' + tag] = 'PASS';
  });

  await withPage(browser, port, { viewport: size }, async function(page){
    await authPage(page);
    await page.evaluate(function(args){
      window._cachedClimbs = [args.session];
      editClimbFromLog(args.session.id, 'climb-table');
    }, { session: sessionRow({
      id: 'sess-edit-footer',
      climb_id: CLIMB_ID,
      baseline_zone: 'sent',
      tick_type: 'flash',
      created_at: '2026-10-01T12:00:00.000Z'
    }) });
    await page.waitForFunction(function(){
      var sheet = document.getElementById('edit-sheet');
      var g = document.getElementById('edit-tick-type-group');
      return sheet && sheet.style.display !== 'none' && g && g.style.display === 'block';
    }, null, { timeout: 8000 });
    await page.evaluate(function(){
      var body = document.getElementById('edit-sheet-body');
      var ticks = document.getElementById('edit-tick-type-group');
      if(body && ticks){
        var er = ticks.getBoundingClientRect();
        var br = body.getBoundingClientRect();
        body.scrollTop += (er.bottom - br.bottom + 8);
      }
    });
    await page.waitForTimeout(60);
    var edit = await page.evaluate(function(){
      function box(id){
        var el = document.getElementById(id);
        if(!el) return null;
        var r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, visible: r.height > 0 };
      }
      var sheet = document.getElementById('edit-sheet');
      var cs = sheet ? window.getComputedStyle(sheet) : null;
      return {
        ticks: box('edit-tick-type-group'),
        save: box('edit-save-changes-btn'),
        display: sheet ? sheet.style.display : null,
        flex: cs ? cs.display : null
      };
    });
    assert.ok(edit.ticks && edit.ticks.visible, 'edit ticks hidden ' + tag);
    assert.ok(edit.save && edit.save.visible, 'edit save hidden ' + tag);
    assert.ok(
      edit.ticks.bottom <= edit.save.y + 0.5,
      'edit sheet save covers tick chips ' + tag +
        ' ticks.bottom=' + edit.ticks.bottom + ' save.y=' + edit.save.y
    );
    results['edit-' + tag] = 'PASS';
  });
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  var results = {};
  try{
    var i;
    for(i = 0; i < SIZES.length; i++){
      await runSize(browser, port, SIZES[i], results);
    }
    console.log('result-footer tests: ok');
    console.log(JSON.stringify(results));
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
