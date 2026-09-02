import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
require(join(__dirname, '../js/coach-stack-nav.js'));
const Nav = globalThis.CoachStackNav;

function fakeEl(extra) {
  const classes = new Set();
  const el = {
    style: { display: '', overflow: '' },
    scrollTop: 180,
    textContent: '',
    attrs: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    setAttribute(k, v) { el.attrs[k] = v; },
    getAttribute(k) { return el.attrs[k]; }
  };
  return Object.assign(el, extra || {});
}

assert.strictEqual(Nav.MOBILE_MQ, '(max-width: 820px)');
assert.strictEqual(Nav.isMobile({ matches: true }), true);
assert.strictEqual(Nav.isMobile({ matches: false }), false);
assert.strictEqual(Nav.isMobile(function (q) {
  assert.strictEqual(q, '(max-width: 820px)');
  return { matches: true };
}), true);

assert.strictEqual(Nav.backAction('journal', true), 'landing');
assert.strictEqual(Nav.backAction(null, true), 'roster');
assert.strictEqual(Nav.backAction('journal', false), 'roster');
assert.strictEqual(Nav.backAction(null, false), 'roster');

const layout = fakeEl();
const panel = fakeEl();
const body = fakeEl();
const landing = fakeEl();
const sub = fakeEl();
landing.style.display = '';
sub.style.display = 'none';
panel.scrollTop = 240;

Nav.openDetail({ layout, panel, body, mobile: true });
assert.ok(layout.classList.contains('detail-open'));
assert.strictEqual(panel.scrollTop, 0, 'opening athlete starts at top');
assert.strictEqual(body.style.overflow, 'hidden');

panel.scrollTop = 400;
Nav.showSubview({ landing, sub, panel });
assert.strictEqual(landing.style.display, 'none');
assert.strictEqual(sub.style.display, '');
assert.strictEqual(panel.scrollTop, 0, 'hub pane starts at top');

panel.scrollTop = 90;
Nav.showLanding({ landing, sub, panel });
assert.strictEqual(landing.style.display, '');
assert.strictEqual(sub.style.display, 'none');
assert.strictEqual(panel.scrollTop, 0, 'back to landing starts at top');

const desktopBody = fakeEl();
const desktopPanel = fakeEl();
desktopPanel.scrollTop = 50;
Nav.openDetail({ layout: fakeEl(), panel: desktopPanel, body: desktopBody, mobile: false });
assert.strictEqual(desktopBody.style.overflow, '', 'desktop keeps side-by-side; no body lock');
assert.strictEqual(desktopPanel.scrollTop, 0);

Nav.closeDetail({ layout, body });
assert.ok(!layout.classList.contains('detail-open'));
assert.strictEqual(body.style.overflow, '');

const btn = fakeEl();
assert.strictEqual(Nav.syncBackButton(btn, { pane: 'chat', hasAthlete: true, athleteLabel: 'Alex' }), 'landing');
assert.strictEqual(btn.textContent, '← Alex');
assert.strictEqual(btn.getAttribute('aria-label'), 'Back to Alex');
assert.strictEqual(Nav.syncBackButton(btn, { pane: null, hasAthlete: true }), 'roster');
assert.strictEqual(btn.textContent, '← Roster');

assert.strictEqual(Nav.bodyOverflowAfterWizardClose({ mobile: true, detailOpen: true }), 'hidden');
assert.strictEqual(Nav.bodyOverflowAfterWizardClose({ mobile: true, detailOpen: false }), '');
assert.strictEqual(Nav.bodyOverflowAfterWizardClose({ mobile: false, detailOpen: true }), '');

const dash = readFileSync(join(__dirname, '../coach-dashboard.html'), 'utf8');
assert.ok(/js\/coach-stack-nav\.js/.test(dash));
assert.ok(/detail-stack-back/.test(dash));
assert.ok(/coach-layout\.detail-open #detail-panel/.test(dash));
assert.ok(/@media \(max-width: 820px\)/.test(dash));

const media = dash.split('@media (max-width: 820px)');
assert.ok(media.length >= 2, 'mobile breakpoint present');
const mobileCss = media.slice(1).join('\n');
assert.ok(/position:\s*fixed/.test(mobileCss));
assert.ok(/inset:\s*0/.test(mobileCss));
assert.ok(/z-index:\s*1500/.test(mobileCss));
assert.ok(/#athlete-subview-back/.test(mobileCss));

const desktopCss = media[0];
assert.ok(!/coach-layout\.detail-open #detail-panel/.test(desktopCss), 'overlay rules are mobile-only');
assert.ok(/grid-template-columns:\s*300px 1fr/.test(desktopCss));

assert.ok(/openCoachDetailOverlay/.test(dash));
assert.ok(/closeCoachDetailToRoster/.test(dash));
assert.ok(!/wes\s*shih|sender\s*one/i.test(dash));

console.log('coach-stack-nav tests: ok');
