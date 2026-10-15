import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, sessionRow, USER_ID, CLIMB_ID, ROUTE
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const staging = readFileSync(join(root, 'index-staging.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

assert.strictEqual(index, staging, 'index.html and index-staging.html must match');
assert.ok(/var app_version = 'index312'/.test(index));
assert.ok(/APP_VERSION = 'index312'/.test(sw));
assert.ok(/col-zone/.test(index) && /col-conf/.test(index), 'Zone and Conf columns stay');
assert.ok(/overflow-x:\s*auto/.test(index), 'table wrap scrolls instead of dropping columns');

function extractFn(src, name){
  let start = src.indexOf('function ' + name + '(');
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

const starSrc = extractFn(index, 'climbStarButtonHtml');
const toggleSrc = extractFn(index, 'climbProjectToggleHtml');
assert.ok(/dense:\s*true/.test(starSrc) || /dense:\s*!0/.test(starSrc) || /opts\.dense/.test(starSrc),
  'climbStarButtonHtml must request a dense/icon-only star');
assert.ok(/Add to projects/.test(toggleSrc) && /Remove from projects/.test(toggleSrc),
  'dense star aria-label must be Add/Remove from projects');
assert.ok(/project-toggle-label/.test(toggleSrc), 'labeled Project pill stays for forms');

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    await withPage(browser, port, {
      sessions: [sessionRow({ id: 'sess-dense-1', climb_id: CLIMB_ID, route_name: ROUTE })]
    }, async function(page){
      await page.waitForFunction(function(){
        return typeof window.showClimbTable === 'function'
          && typeof window.climbStarButtonHtml === 'function';
      }, null, { timeout: 30000 });
      await page.evaluate(function(args){
        window._authUser = { id: args.userId };
        window._authToken = 'test-token';
        window._cachedClimbs = [args.session];
        window._climbCache = [{
          id: args.session.climb_id,
          name: args.session.route_name,
          grade_value: args.session.grade_value,
          climbing_type: args.session.climbing_type,
          is_project: true
        }];
        showClimbTable();
      }, { userId: USER_ID, session: sessionRow({ id: 'sess-dense-1', climb_id: CLIMB_ID, route_name: ROUTE }) });
      await page.waitForTimeout(200);
      var info = await page.evaluate(function(){
        var btn = document.querySelector('#climb-table .project-toggle');
        if(!btn) return { missing: true };
        var label = btn.querySelector('.project-toggle-label');
        var svg = btn.querySelector('svg');
        var cs = getComputedStyle(btn);
        var svgBox = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
        var heads = Array.prototype.map.call(document.querySelectorAll('#climb-table thead th'), function(th){
          return th.className + ':' + (th.innerText || '').replace(/\s+/g, ' ').trim();
        });
        return {
          missing: false,
          aria: btn.getAttribute('aria-label') || '',
          title: btn.getAttribute('title') || '',
          labelText: label ? label.textContent.trim() : '',
          labelVisible: !!(label && label.offsetParent !== null && getComputedStyle(label).display !== 'none'),
          hasProjectClass: btn.classList.contains('project-toggle'),
          innerText: (btn.innerText || '').trim(),
          bg: cs.backgroundColor,
          border: cs.borderStyle + ' ' + cs.borderWidth,
          radius: cs.borderRadius,
          svgW: Math.round(svgBox.width),
          svgH: Math.round(svgBox.height),
          valign: getComputedStyle(document.querySelector('#climb-table td')).verticalAlign,
          heads: heads
        };
      });
      assert.strictEqual(info.missing, false, 'dense table row must render a project-toggle');
      assert.ok(/Add to projects|Remove from projects/.test(info.aria),
        'dense star aria-label, got ' + info.aria);
      assert.strictEqual(info.labelVisible, false, 'dense star must not show Project label text');
      assert.ok(!/^Project$/i.test(info.innerText), 'dense star innerText must not be Project, got ' + info.innerText);
      assert.ok(info.hasProjectClass, 'keep .project-toggle for the existing handler');
      assert.ok(info.bg === 'rgba(0, 0, 0, 0)' || info.bg === 'transparent',
        'dense star must be a bare icon, bg=' + info.bg);
      assert.ok(/none/.test(info.border) || /0px/.test(info.border),
        'dense star must have no pill border, got ' + info.border);
      assert.ok(info.svgW <= 22 && info.svgH <= 22, 'dense glyph ~20px, got ' + info.svgW + 'x' + info.svgH);
      assert.strictEqual(info.valign, 'middle', 'row cells vertically centered');
      assert.ok(info.heads.some(function(h){ return /col-zone/.test(h); }), 'Zone column present');
      assert.ok(info.heads.some(function(h){ return /col-conf/.test(h); }), 'Conf column present');

      var form = await page.evaluate(function(){
        var html = climbProjectToggleHtml({ climbId: 'c1', filled: false });
        return html;
      });
      assert.ok(/Project/.test(form) && /project-toggle-label/.test(form),
        'form/edit pill still has a visible Project label');
    });
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }
  console.log('climb-table-dense-star tests: ok');
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
