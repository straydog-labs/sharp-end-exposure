import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap,
  COACH_ID, ATHLETE_ID, sessionRow
} from './harness.mjs';

function recent(overrides){
  return sessionRow(Object.assign({
    user_id: ATHLETE_ID,
    created_at: new Date().toISOString(),
    is_baseline: false,
    is_checkin: false,
    deleted_at: null,
    baseline_zone: 'sent',
    zone: 'learning',
    climbing_type: 'Vertical'
  }, overrides || {}));
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    const now = Date.now();
    const sessions = [
      recent({ id: 's1', zone: 'comfort', created_at: new Date(now - 1 * 86400000).toISOString() }),
      recent({ id: 's2', zone: 'learning', created_at: new Date(now - 2 * 86400000).toISOString() }),
      recent({ id: 's3', zone: 'learning', created_at: new Date(now - 3 * 86400000).toISOString() }),
      recent({ id: 's4', zone: 'panic', created_at: new Date(now - 4 * 86400000).toISOString() }),
      recent({ id: 's5', zone: 'comfort', created_at: new Date(now - 5 * 86400000).toISOString() }),
      recent({ id: 's6', zone: 'comfort', created_at: new Date(now - 6 * 86400000).toISOString() })
    ];
    await withPage(browser, port, {
      path: '/coach-dashboard.html',
      session: {
        access_token: 'test-token',
        user: { id: COACH_ID, email: 'coach@test.local' }
      },
      sessions: sessions
    }, async function(page){
      await page.waitForSelector('.roster-row', { timeout: 15000 });
      await tap(page, '.roster-row');
      await page.waitForSelector('#athlete-progress-body .stretch-share-unit', { timeout: 15000 });
      var info = await page.evaluate(function(){
        var unit = document.querySelector('#athlete-progress-body .stretch-share-unit');
        var svg = unit ? unit.querySelector('svg.stretch-share-svg') : null;
        var title = unit ? unit.querySelector('.insight-chart-help summary') : null;
        var nLabels = svg ? Array.prototype.map.call(svg.querySelectorAll('.stretch-n-label'), function(t){
          return t.textContent;
        }) : [];
        var note = document.querySelector('#athlete-progress-panel .team-zone-note');
        return {
          hasUnit: !!unit,
          hasSvg: !!svg,
          title: title ? title.textContent : '',
          nLabels: nLabels,
          orange: svg ? !!svg.querySelector('circle[fill="#e89252"], polyline[stroke="#e89252"]') : false,
          redLine: svg ? /#e84444/.test(svg.innerHTML) : true,
          strip: !!document.querySelector('#athlete-progress-body .progress-week-bars'),
          descriptive: note ? note.textContent : ''
        };
      });
      assert.ok(info.hasUnit, 'stretch-share unit rendered');
      assert.ok(info.hasSvg, 'stretch-share svg rendered');
      assert.ok(/Stretch share/.test(info.title));
      assert.ok(info.nLabels.some(function(t){ return /^n=\d+$/.test(t); }), 'n labels present');
      assert.ok(info.orange, 'one orange hue');
      assert.ok(!info.redLine, 'line is not panic red');
      assert.ok(info.strip, 'weekly color strip still present');
      assert.ok(/Descriptive/.test(info.descriptive));
    });
    console.log('real-flow-coach-stretch-share: ok');
  }finally{
    await browser.close();
    server.close();
  }
}

run().catch(function(err){
  console.error(err);
  process.exit(1);
});
