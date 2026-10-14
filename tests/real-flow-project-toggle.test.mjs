import assert from 'assert';
import {
  startStaticServer, launchChromium, withPage, tap, readyDial, waitForScreen,
  continueNewLogIfPicker,
  postsTo, firstBody, sessionRow, USER_ID, ROUTE, CLIMB_ID, GRADE, TERRAIN
} from './harness.mjs';

const YELLOW = 'Yellow 30 degree';

function climbPatches(recorded){
  return recorded.filter(function(r){
    return r.method === 'PATCH' && r.url.indexOf('/rest/v1/climbs') !== -1;
  });
}
function sessionPatches(recorded){
  return recorded.filter(function(r){
    return r.method === 'PATCH' && r.url.indexOf('/rest/v1/sessions') !== -1;
  });
}
function climbPosts(recorded){
  return recorded.filter(function(r){
    return r.method === 'POST' && r.url.indexOf('/rest/v1/climbs') !== -1;
  });
}
function patchedId(r){
  var m = String(r.url || '').match(/[?&]id=eq\.([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function projectTrueWrites(recorded){
  return climbPatches(recorded).concat(climbPosts(recorded)).filter(function(r){
    var b = firstBody([r]);
    return b && b.is_project === true;
  });
}
function sessionClimbAttaches(recorded){
  return sessionPatches(recorded).filter(function(r){
    var b = firstBody([r]);
    return b && b.climb_id;
  });
}

const CLIMB_YELLOW_510 = {
  id: 'climb-yellow-510',
  name: YELLOW,
  grade_value: '5.10a',
  climbing_type: 'Slab',
  is_project: false
};
const CLIMB_YELLOW_512 = {
  id: 'climb-yellow-512',
  name: YELLOW,
  grade_value: '5.12a',
  climbing_type: 'Overhang',
  is_project: false
};
const TWO_YELLOWS = [CLIMB_YELLOW_510, CLIMB_YELLOW_512];

function yellowSession(overrides){
  return sessionRow(Object.assign({
    id: 'sess-yellow-512',
    route_name: YELLOW,
    climb_id: null,
    grade_value: '5.12a',
    climbing_type: 'Overhang'
  }, overrides || {}));
}

async function openEditSheet(page, session, climbs){
  await page.evaluate(function(args){
    window._cachedClimbs = args.sessions;
    window._cachedSessions = args.sessions;
    window._climbCache = args.climbs;
    editClimbFromLog(args.sessionId, 'climb-table');
  }, {
    sessions: Array.isArray(session) ? session : [session],
    sessionId: Array.isArray(session) ? session[0].id : session.id,
    climbs: climbs || []
  });
  await page.waitForTimeout(80);
}

async function authPage(page){
  await page.waitForFunction(function(){
    return typeof window.startLogFlow === 'function'
      && typeof window.toggleClimbProject === 'function';
  }, null, { timeout: 30000 });
  await page.evaluate(function(userId){
    window._authUser = { id: userId };
    window._authToken = 'test-token';
    window.loadClimbLog = function(){ return Promise.resolve(); };
    window.loadHomeScreen = function(){ return Promise.resolve(); };
    window.loadHomeInsight = function(){ return Promise.resolve(); };
  }, USER_ID);
}

async function finishLogToName(page){
  await continueNewLogIfPicker(page);
  await page.waitForTimeout(80);
  await readyDial(page);
  await tap(page, '#log-act-continue');
  await waitForScreen(page, 'screen-log-result');
  await tap(page, '#btn-sent');
  await tap(page, '#log-result-continue');
  await page.waitForTimeout(300);
  var catalogOn = await page.evaluate(function(){
    var el = document.getElementById('screen-log-catalog');
    return !!(el && el.classList.contains('active'));
  });
  if(catalogOn) await tap(page, '#gym-catalog-skip');
  await waitForScreen(page, 'screen-log-terrain');
  await tap(page, '.terrain-chips .chip:has-text("Overhang")');
  await tap(page, '#log-terrain-continue');
  await waitForScreen(page, 'screen-log-details');
  await tap(page, '#log-details-continue');
  await waitForScreen(page, 'screen-log-grade');
  await tap(page, '#grade-grid .grade-btn:has-text("5.11a")');
  await tap(page, '#log-grade-continue');
  await waitForScreen(page, 'screen-log-name');
}

async function skipDeeperToDone(page){
  await page.waitForTimeout(400);
  var promptOn = await page.evaluate(function(){
    var el = document.getElementById('screen-log-prompt');
    return !!(el && el.classList.contains('active'));
  });
  if(promptOn){
    await page.evaluate(function(){
      if(typeof logFlowSkipDeeper === 'function') logFlowSkipDeeper();
      else if(typeof finishLogFlowToDone === 'function') finishLogFlowToDone();
    });
  }
  await waitForScreen(page, 'screen-log-done');
}

async function run(){
  const { server, port } = await startStaticServer();
  const browser = await launchChromium();
  var failed = [];
  async function flow(name, fn){
    try{
      await fn();
      console.log('ok - ' + name);
    }catch(e){
      failed.push(name + ': ' + (e && e.message ? e.message : e));
      console.error('not ok - ' + name + ' ' + (e && e.stack ? e.stack : e));
    }
  }

  try{
    // Jess case: named session with climb_id null has no way to project later.
    await flow('jess-null-climb-id-after-log', async function(){
      await withPage(browser, port, {
        sessions: [sessionRow({ id: 'sess-yellow-1', route_name: YELLOW, climb_id: null })]
      }, async function(page, recorded){
        await authPage(page);
        await page.evaluate(function(args){
          window._cachedClimbs = [args.session];
          window._climbCache = [];
          editClimbFromLog(args.session.id, 'climb-table');
        }, { session: sessionRow({ id: 'sess-yellow-1', route_name: YELLOW, climb_id: null }) });
        await page.waitForTimeout(80);
        var toggle = page.locator('#edit-sheet .project-toggle').first();
        assert.ok(await toggle.count(), 'Jess case: edit sheet must show a Project toggle for a named climb with null climb_id');
        await tap(page, '#edit-sheet .project-toggle');
        await page.waitForTimeout(700);
        var cPost = climbPosts(recorded);
        var cPatch = climbPatches(recorded);
        var sPatch = sessionPatches(recorded);
        var starred = cPatch.concat(cPost).some(function(r){
          var b = firstBody([r]);
          return b && b.is_project === true;
        });
        var attached = sPatch.some(function(r){
          var b = firstBody([r]);
          return b && b.climb_id;
        });
        assert.ok(starred, 'Jess case: starring must write climbs.is_project true');
        assert.ok(attached, 'Jess case: starring a null climb_id session must attach a climbs row');
        assert.strictEqual(cPost.filter(function(r){
          var b = firstBody([r]);
          return b && /^Climb\s+\d+$/i.test(b.name || '');
        }).length, 0, 'must not create Climb N placeholders');
      });
    });

    await flow('project-at-log-time', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await authPage(page);
        await page.evaluate(function(){ startLogFlow(); });
        await finishLogToName(page);
        var onResult = await page.evaluate(function(){
          return !!document.querySelector('#log-project-toggle .project-toggle, #screen-log-result .project-toggle, #screen-log-name .project-toggle');
        });
        assert.ok(onResult, 'log screen must show labeled Project toggle');
        await tap(page, '#log-name-project-toggle .project-toggle');
        await page.fill('#log-rname-input', YELLOW);
        await tap(page, '#log-name-save');
        await page.waitForTimeout(700);
        var starred = climbPatches(recorded).concat(climbPosts(recorded)).some(function(r){
          var b = firstBody([r]);
          return b && b.is_project === true;
        });
        assert.ok(starred, 'project at log time must persist climbs.is_project');
        var sess = firstBody(postsTo(recorded, 'sessions', 'POST'));
        assert.ok(sess, 'session POST');
        assert.ok(sess.climb_id, 'named log attaches climb_id');
      });
    });

    await flow('project-after-logging', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await authPage(page);
        await page.evaluate(function(){ startLogFlow(); });
        await finishLogToName(page);
        await page.fill('#log-rname-input', YELLOW);
        await tap(page, '#log-name-save');
        await skipDeeperToDone(page);
        var before = climbPatches(recorded).length;
        await tap(page, '#log-done-project-toggle .project-toggle');
        await page.waitForTimeout(400);
        var after = climbPatches(recorded).slice(before);
        assert.ok(after.some(function(r){ return firstBody([r]) && firstBody([r]).is_project === true; }),
          'log-done toggle must PATCH is_project true');
      });
    });

    await flow('unproject', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await authPage(page);
        await page.evaluate(function(args){
          window._climbCache = [{ id: args.climbId, name: args.route, grade_value: args.grade, climbing_type: args.terrain, is_project: true }];
          window._selectedClimbId = args.climbId;
          logState.sessId = 'sess-proj-1';
          logState.routeName = args.route;
          logState.grade = args.grade;
          logState.terrain = args.terrain;
          logState.result = 'fell';
          finishLogFlowToDone();
        }, { climbId: CLIMB_ID, route: ROUTE, grade: GRADE, terrain: TERRAIN });
        await waitForScreen(page, 'screen-log-done');
        var on = await page.evaluate(function(){
          var btn = document.querySelector('#log-done-project-toggle .project-toggle');
          return !!(btn && btn.classList.contains('is-on'));
        });
        assert.ok(on, 'done screen shows project on');
        await tap(page, '#log-done-project-toggle .project-toggle');
        await page.waitForTimeout(400);
        assert.ok(climbPatches(recorded).some(function(r){
          return firstBody([r]) && firstBody([r]).is_project === false;
        }), 'unproject PATCH is_project false');
        assert.strictEqual(postsTo(recorded, 'sessions', 'DELETE').length, 0, 'unproject must not delete sessions');
        assert.strictEqual(postsTo(recorded, 'climbs', 'DELETE').length, 0, 'unproject must not delete climbs');
      });
    });

    await flow('send-of-project-yes', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await authPage(page);
        await page.evaluate(function(args){
          window._climbCache = [{ id: args.climbId, name: args.route, grade_value: args.grade, climbing_type: args.terrain, is_project: true }];
          window._selectedClimbId = args.climbId;
          logState.sessId = 'sess-sent-1';
          logState.routeName = args.route;
          logState.grade = args.grade;
          logState.terrain = args.terrain;
          logState.result = 'sent';
          finishLogFlowToDone();
        }, { climbId: CLIMB_ID, route: ROUTE, grade: GRADE, terrain: TERRAIN });
        await waitForScreen(page, 'screen-log-done');
        var prompt = page.locator('#log-done-project-complete');
        await prompt.waitFor({ state: 'visible', timeout: 4000 });
        await tap(page, '#log-done-project-yes');
        await page.waitForTimeout(400);
        assert.ok(climbPatches(recorded).some(function(r){
          return firstBody([r]) && firstBody([r]).is_project === false;
        }), 'Yes clears project');
        assert.strictEqual(postsTo(recorded, 'sessions', 'DELETE').length, 0);
      });
    });

    await flow('send-of-project-keep', async function(){
      await withPage(browser, port, {}, async function(page, recorded){
        await authPage(page);
        await page.evaluate(function(args){
          window._climbCache = [{ id: args.climbId, name: args.route, is_project: true }];
          window._selectedClimbId = args.climbId;
          logState.sessId = 'sess-sent-2';
          logState.routeName = args.route;
          logState.result = 'sent';
          finishLogFlowToDone();
        }, { climbId: CLIMB_ID, route: ROUTE });
        await waitForScreen(page, 'screen-log-done');
        await page.locator('#log-done-project-complete').waitFor({ state: 'visible', timeout: 4000 });
        var patchesBefore = climbPatches(recorded).length;
        await tap(page, '#log-done-project-keep');
        await page.waitForTimeout(200);
        var hidden = await page.evaluate(function(){
          var el = document.getElementById('log-done-project-complete');
          return !el || el.hidden || el.style.display === 'none';
        });
        assert.ok(hidden, 'Keep hides the prompt');
        assert.strictEqual(climbPatches(recorded).length, patchesBefore, 'Keep does not PATCH is_project');
      });
    });

    await flow('failure-rolls-back', async function(){
      await withPage(browser, port, {
        stub: async function(route, info){
          if(info.method === 'PATCH' && info.url.indexOf('/rest/v1/climbs') !== -1){
            await route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({ code: 'PGRST204', message: 'Could not find the is_project column' })
            });
            return true;
          }
          return false;
        }
      }, async function(page, recorded){
        await authPage(page);
        await page.evaluate(function(args){
          window._climbCache = [{ id: args.climbId, name: args.route, is_project: false }];
          window._selectedClimbId = args.climbId;
          logState.sessId = 'sess-fail-1';
          logState.routeName = args.route;
          logState.result = 'fell';
          finishLogFlowToDone();
        }, { climbId: CLIMB_ID, route: ROUTE });
        await waitForScreen(page, 'screen-log-done');
        await tap(page, '#log-done-project-toggle .project-toggle');
        await page.waitForTimeout(400);
        var state = await page.evaluate(function(){
          var btn = document.querySelector('#log-done-project-toggle .project-toggle');
          var toast = document.getElementById('error-toast-el') || document.getElementById('toast-el');
          return {
            on: !!(btn && btn.classList.contains('is-on')),
            toast: toast ? toast.textContent : '',
            toastShow: !!(toast && toast.classList.contains('show'))
          };
        });
        assert.strictEqual(state.on, false, 'failed star must roll back');
        assert.ok(state.toastShow || /project|try again|could not/i.test(state.toast),
          'visible error after failed star, got toast=' + state.toast);
      });
    });

    await flow('grade-normalize-5-10a-equals-spaced', async function(){
      await withPage(browser, port, {}, async function(page){
        await authPage(page);
        var out = await page.evaluate(function(){
          if(typeof normalizeClimbGrade !== 'function'){
            return { ok: false, reason: 'normalizeClimbGrade is not a function' };
          }
          var a = normalizeClimbGrade('5.10a');
          var b = normalizeClimbGrade('5.10 a');
          var c = normalizeClimbGrade('5.10A');
          return { ok: a === b && a === c && !!a, a: a, b: b, c: c };
        });
        assert.ok(out.ok, '5.10a / "5.10 a" / 5.10A must normalize equal, got ' + JSON.stringify(out));
      });
    });

    await flow('same-name-stars-session-grade-not-sibling', async function(){
      var sess512 = yellowSession({ id: 'sess-yellow-512' });
      var sessOther = yellowSession({ id: 'sess-yellow-other' });
      await withPage(browser, port, {
        climbs: TWO_YELLOWS,
        sessions: [sess512, sessOther]
      }, async function(page, recorded){
        await authPage(page);
        await openEditSheet(page, [sess512, sessOther], TWO_YELLOWS);
        await tap(page, '#edit-sheet .project-toggle');
        await page.waitForTimeout(700);
        var starred510 = projectTrueWrites(recorded).some(function(r){
          return patchedId(r) === 'climb-yellow-510';
        });
        var starred512 = projectTrueWrites(recorded).some(function(r){
          return patchedId(r) === 'climb-yellow-512';
        });
        var created512 = climbPosts(recorded).some(function(r){
          var b = firstBody([r]);
          return b && b.name === YELLOW && b.grade_value === '5.12a' && b.climbing_type === 'Overhang';
        });
        assert.strictEqual(starred510, false, 'must never set is_project on the 5.10a/Slab sibling');
        assert.ok(starred512 || created512, 'is_project must land on the 5.12a/Overhang row or a new 5.12a row');
        var otherAttached = sessionClimbAttaches(recorded).some(function(r){
          return patchedId(r) === 'sess-yellow-other';
        });
        assert.strictEqual(otherAttached, false, 'second same-name null session must stay detached');
        var editedAttached = sessionClimbAttaches(recorded).some(function(r){
          var b = firstBody([r]);
          return patchedId(r) === 'sess-yellow-512' && b && b.climb_id;
        });
        assert.ok(editedAttached, 'starred session must attach a climb_id');
      });
    });

    await flow('edit-grade-then-star-no-duplicate', async function(){
      var sess = yellowSession({
        id: 'sess-yellow-edit',
        grade_value: '5.10a',
        climbing_type: 'Slab'
      });
      await withPage(browser, port, {
        climbs: TWO_YELLOWS,
        sessions: [sess]
      }, async function(page, recorded){
        await authPage(page);
        await openEditSheet(page, sess, TWO_YELLOWS);
        await tap(page, '#edit-grade-chips .chip:has-text("5.12a")');
        await tap(page, '#edit-terrain-group .chip:has-text("Overhang")');
        await tap(page, '#edit-save-changes-btn');
        await page.waitForTimeout(400);
        var gradePatch = sessionPatches(recorded).some(function(r){
          var b = firstBody([r]);
          return b && b.grade_value === '5.12a' && b.climbing_type === 'Overhang';
        });
        assert.ok(gradePatch, 'edit save must PATCH the session to 5.12a/Overhang');
        var postsBefore = climbPosts(recorded).length;
        await page.evaluate(function(){
          var sess = findClimbLogSession('sess-yellow-edit');
          if(sess){
            sess.grade_value = '5.12a';
            sess.climbing_type = 'Overhang';
          }
          editClimbFromLog('sess-yellow-edit', 'climb-table');
        });
        await page.waitForTimeout(80);
        await tap(page, '#edit-sheet .project-toggle');
        await page.waitForTimeout(700);
        assert.strictEqual(climbPosts(recorded).length, postsBefore, 'editing grade then starring must not create a duplicate climb');
        assert.strictEqual(projectTrueWrites(recorded).some(function(r){
          return patchedId(r) === 'climb-yellow-510';
        }), false, 'must not star the old 5.10a row after the grade edit');
        assert.ok(projectTrueWrites(recorded).some(function(r){
          return patchedId(r) === 'climb-yellow-512';
        }), 'star after grade edit must set is_project on the 5.12a climb');
      });
    });

    await flow('star-uses-session-not-log-form', async function(){
      var sess = yellowSession({ id: 'sess-yellow-old' });
      await withPage(browser, port, {
        climbs: [],
        sessions: [sess]
      }, async function(page, recorded){
        await authPage(page);
        await page.evaluate(function(args){
          window._cachedClimbs = [args.session];
          window._cachedSessions = [args.session];
          window._climbCache = [];
          logState.grade = '5.10a';
          logState.terrain = 'Slab';
          logState.routeName = 'Other Route';
          editClimbFromLog(args.session.id, 'climb-table');
          logState.grade = '5.10a';
          logState.terrain = 'Slab';
          paintEditProjectUi();
        }, { session: sess });
        await page.waitForTimeout(80);
        await tap(page, '#edit-sheet .project-toggle');
        await page.waitForTimeout(700);
        var created = climbPosts(recorded).map(function(r){ return firstBody([r]); }).filter(Boolean);
        var usedSession = created.some(function(b){
          return b.grade_value === '5.12a' && b.climbing_type === 'Overhang';
        });
        var usedForm = created.some(function(b){
          return b.grade_value === '5.10a' || b.climbing_type === 'Slab';
        });
        var starredExisting512 = projectTrueWrites(recorded).some(function(r){
          return patchedId(r) === 'climb-yellow-512';
        });
        assert.ok(usedSession || starredExisting512, 'climb row must use the session 5.12a/Overhang, not the log form');
        assert.strictEqual(usedForm, false, 'must not write the log form 5.10a/Slab onto the climb row');
      });
    });

    await flow('ambiguous-name-prompts-no-write', async function(){
      var sess = yellowSession({
        id: 'sess-yellow-bare',
        grade_value: null,
        climbing_type: null
      });
      await withPage(browser, port, {
        climbs: TWO_YELLOWS,
        sessions: [sess]
      }, async function(page, recorded){
        await authPage(page);
        await openEditSheet(page, sess, TWO_YELLOWS);
        var writesBefore = recorded.length;
        await tap(page, '#edit-sheet .project-toggle');
        await page.waitForTimeout(700);
        assert.strictEqual(climbPosts(recorded).length, 0, 'ambiguous name must not POST a climb');
        assert.strictEqual(projectTrueWrites(recorded).length, 0, 'ambiguous name must not set is_project');
        assert.strictEqual(sessionClimbAttaches(recorded).length, 0, 'ambiguous name must not attach climb_id');
        var prompt = await page.evaluate(function(){
          var el = document.getElementById('project-pick-route');
          var text = (document.body && document.body.innerText) || '';
          return {
            visible: !!(el && !el.hidden && el.style.display !== 'none'),
            text: text
          };
        });
        assert.ok(prompt.visible || /pick the route/i.test(prompt.text),
          'must show a pick-the-route prompt when two same-name climbs and session lacks grade/terrain');
        assert.ok(recorded.length === writesBefore || (
          climbPosts(recorded).length === 0
          && projectTrueWrites(recorded).length === 0
          && sessionClimbAttaches(recorded).length === 0
        ), 'no climb/session write after the prompt');
      });
    });
  }finally{
    await browser.close();
    await new Promise(function(resolve){ server.close(resolve); });
  }

  if(failed.length){
    console.error('\nFAILED\n' + failed.join('\n'));
    process.exit(1);
  }
  console.log('project-toggle tests: ok');
}

run().catch(function(err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
