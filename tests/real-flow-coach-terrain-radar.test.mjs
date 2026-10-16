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
    zone: 'learning'
  }, overrides || {}));
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  try{
    const sessions = [
      recent({ id: 's-slab-1', climbing_type: 'Slab' }),
      recent({ id: 's-slab-2', climbing_type: 'Slab' }),
      recent({ id: 's-vert', climbing_type: 'Vertical' }),
      recent({ id: 's-over', climbing_type: 'Overhang' }),
      recent({ id: 's-roof', climbing_type: 'Roof' }),
      recent({ id: 's-dna', climbing_type: 'Crack', baseline_zone: 'dna' }),
      recent({ id: 's-base', climbing_type: 'Crack', is_baseline: true }),
      recent({ id: 's-fp', climbing_type: 'Dihedral', baseline_zone: 'fall_practice' }),
      recent({ id: 's-check', climbing_type: 'Arête', is_checkin: true, baseline_zone: 'checkin' })
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
      await page.waitForSelector('#athlete-progress-body .terrain-volume-radar', { timeout: 15000 });
      var info = await page.evaluate(function(){
        var unit = document.querySelector('#athlete-progress-body [data-terrain-volume]');
        var svg = document.querySelector('#athlete-progress-body svg.terrain-volume-radar');
        var verts = Array.prototype.map.call(svg.querySelectorAll('.radar-vertex'), function(c){
          return {
            terrain: c.getAttribute('data-terrain'),
            count: parseInt(c.getAttribute('data-count'), 10),
            r: parseFloat(c.getAttribute('data-r'))
          };
        });
        var labels = Array.prototype.map.call(svg.querySelectorAll('.radar-axis-label'), function(t){
          return t.textContent;
        });
        return {
          mode: unit ? unit.getAttribute('data-terrain-volume') : '',
          verts: verts,
          labels: labels,
          bars: document.querySelectorAll('#athlete-progress-body .terrain-volume-bar').length,
          note: document.querySelector('#athlete-progress-panel .team-zone-note')
            ? document.querySelector('#athlete-progress-panel .team-zone-note').textContent
            : ''
        };
      });
      assert.strictEqual(info.mode, 'radar');
      assert.strictEqual(info.labels.length, 7, '7 radar axis labels');
      assert.ok(!info.verts.some(function(v){ return v.count === 0; }), 'zero axes render no marker');
      assert.strictEqual(info.bars, 6, 'bars remain as the exact-numbers readout');
      var byTerrain = {};
      info.verts.forEach(function(v){ byTerrain[v.terrain] = v; });
      assert.strictEqual(byTerrain.Slab.count, 2);
      assert.strictEqual(byTerrain.Vertical.count, 1);
      assert.strictEqual(byTerrain.Crack.count, 1, 'DNA Crack is counted');
      assert.strictEqual(byTerrain.Dihedral.count, 1, 'fall-practice Dihedral is counted');
      assert.ok(!byTerrain['Arête'], 'check-in Arête has no marker');
      assert.ok(info.labels.indexOf('Arête 0') !== -1);
      assert.ok(info.labels.indexOf('Slab 2') !== -1);
      assert.ok(/Descriptive/.test(info.note));
      assert.ok(!/\b(because|caused|due to)\b/i.test(info.note));
    });
    console.log('real-flow-coach-terrain-radar: ok');
  }finally{
    await browser.close();
    server.close();
  }
}

run().catch(function(err){
  console.error(err);
  process.exit(1);
});
