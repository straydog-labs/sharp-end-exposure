// ── PROJECT TRACKING ─────────────────────────────────────
var currentProject=null;
var currentProjectId=null;
var currentProjectName=null;

function logAgainstProject(projId,projName){
  // Set project context so the session links automatically
  currentProjectId=projId||null;
  currentProjectName=projName;
  // Pre-set route name in log state
  logState.routeName=projName;
  // Reset rest of log state
  logState.grade=null;logState.terrain=null;logState.result=null;
  logState.zone=null;logState.sessId=null;
  logState.sessionFocus=null;
  // Rebuild grade grid and reset UI
  buildGradeGrid(logGradeSystem);
  document.querySelectorAll(".chip[onclick*='selectTerrain']").forEach(function(b){b.classList.remove("selected");});
  document.getElementById("btn-sent").classList.remove("selected-send");
  document.getElementById("btn-attempt").classList.remove("selected-attempt");
  checkLogReady();
  // Show a small toast so user knows context is set
  showToast('Logging for: '+projName);
  showScreen("screen-log");
}

function selectFocus(el,val){
  document.querySelectorAll('#focus-chips .chip').forEach(function(b){b.classList.remove('selected');});
  el.classList.add('selected');
  logState.sessionFocus=val;
  // Save focus to session immediately
  if(logState.sessId){
    if(logState.sessId)sbU('sessions',logState.sessId,{session_focus:val});
  }
}

function showFocusBlockIfProject(){
  var block=document.getElementById('session-focus-block');
  if(!block)return;
  // Show if the logged route matches an active project
  if(logState.routeName&&currentProjectName&&logState.routeName.toLowerCase()===currentProjectName.toLowerCase()){
    block.style.display='block';
  } else if(currentProjectId&&!logState.routeName){
    block.style.display='block';
  } else {
    block.style.display='none';
  }
}

function openProjectById(projId,name){
  currentProjectId=projId;
  currentProjectName=name;
  sbS('sessions',{device_id:'eq.'+DID,'project_id':'eq.'+projId,limit:100,order:'created_at.asc'}).then(function(rows){
    sbS('sessions',{device_id:'eq.'+DID,limit:500,order:'created_at.asc'}).then(function(allRows){
      currentProject={id:projId,name:name,sessions:rows||[]};
      renderProjectScreen(name,rows||[],allRows||[]);
      showScreen('screen-project');
    });
  }).catch(function(){
    showScreen('screen-sessions');
  });
}

function markProjectSent(projId){
  sbU('projects',projId,{status:'sent',sent_at:new Date().toISOString()}).then(function(){
    showToast('Send confirmed! 🎉');
    if(currentProject)currentProject.status='sent';
    document.getElementById('proj-sent-btn').style.display='none';
    document.getElementById('proj-abandoned-btn').style.display='none';
    document.getElementById('proj-status-badge').textContent='Sent ✓';
    document.getElementById('proj-status-badge').style.background='rgba(126,200,122,.15)';
    document.getElementById('proj-status-badge').style.color='#7ec87a';
  });
}

function markProjectAbandoned(projId){
  if(!confirm('Mark this project as abandoned? It will move to your history.'))return;
  sbU('projects',projId,{status:'abandoned',abandoned_at:new Date().toISOString()}).then(function(){
    showToast('Project archived.');
    showScreen('screen-sessions');
  });
}

function renderRoutesSection(rows){
  var namedRoutes={};
  rows.filter(function(r){return r.route_name&&r.grade_value;}).forEach(function(r){
    if(!namedRoutes[r.route_name])namedRoutes[r.route_name]={sessions:[],grade:r.grade_value,discipline:r.discipline,rock:r.rock_type};
    namedRoutes[r.route_name].sessions.push(r);
  });
  var routeNames=Object.keys(namedRoutes);
  var sec=document.getElementById("real-routes-section");
  var list=document.getElementById("real-routes-list");
  if(!list)return;
  if(!routeNames.length){
    // Also check projects table for any started projects
    sbS("projects",{device_id:"eq."+DID,limit:20}).then(function(projs){
      if(projs&&projs.length){
        if(sec)sec.style.display="block";
        list.innerHTML=projs.map(function(p){
          var statusColor=p.status==="sent"?"#7ec87a":p.status==="abandoned"?"#888780":"#f5a623";
          var statusLabel=p.status==="sent"?"Sent ✓":p.status==="abandoned"?"Archived":"Projecting";
          return '<div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openProject(\''+p.route_name+'\')">'+ 
            '<div style="width:10px;height:10px;border-radius:50%;background:'+statusColor+';flex-shrink:0;"></div>'+ 
            '<div style="flex:1;min-width:0;"><div style="font-size:15px;font-weight:600;color:var(--text);">'+p.route_name+'</div>'+ 
            '<div style="font-size:13px;color:var(--muted);margin-top:2px;">'+(p.grade_value||"")+(p.discipline?" . "+p.discipline:"")+"</div></div>"+ 
            '<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:rgba(126,200,122,.12);color:'+statusColor+';">'+statusLabel+'</span>'+ 
            '<div style="color:var(--accent);font-size:18px;margin-left:4px;">›</div></div>';
        }).join("")+'<div style="height:4px;"></div>';
      } else {
        if(sec){
          sec.style.display="block";
          list.innerHTML='<div style="padding:20px 0;text-align:center;"><div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px;">No projects yet</div><div style="font-size:14px;color:var(--muted);line-height:1.6;">Tap <strong style="color:var(--comfort);">+ Start a project</strong> below, or from the celebrate screen after logging a climb.</div></div>';
        }
      }
    });
    return;
  }
  if(sec)sec.style.display="block";
  var ZC={comfort:"#7ec87a",learning:"#f5a623",panic:"#e84444"};
  list.innerHTML='';
  routeNames.forEach(function(name){
    var r=namedRoutes[name];
    var sent=r.sessions.some(function(s){return s.baseline_zone==="sent";});
    var lastZone=r.sessions[0]?r.sessions[0].deeper_zone||r.sessions[0].baseline_zone||"learning":"learning";
    var dotColor=ZC[lastZone]||ZC.learning;
    var meta=[r.grade,r.discipline,r.rock].filter(Boolean).join(" . ")+" . "+r.sessions.length+" session"+(r.sessions.length!==1?"s":"");
    var row=document.createElement("div");
    row.style.cssText="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);cursor:pointer;";
    (function(n){row.onclick=function(){openProject(n);};})(name);
    var sentBadge='<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:rgba(126,200,122,.12);color:#7ec87a;">Sent ✓</span>';
    var projBadge='<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:rgba(245,166,35,.12);color:#f5a623;">Projecting</span>';
    row.innerHTML=
      '<div style="width:10px;height:10px;border-radius:50%;background:'+dotColor+';flex-shrink:0;"></div>'+
      '<div style="flex:1;min-width:0;"><div style="font-size:15px;font-weight:600;color:var(--text);">'+name+'</div>'+
      '<div style="font-size:13px;color:var(--muted);margin-top:2px;">'+meta+'</div></div>'+
      (sent?sentBadge:projBadge)+
      '<div style="color:var(--accent);font-size:18px;margin-left:4px;">›</div>';
    list.appendChild(row);
  });
  var sp=document.createElement("div");sp.style.height="4px";list.appendChild(sp);
}

function openProject(routeName){
  // Try to find the project in projects table first
  sbS("projects",{device_id:"eq."+DID,"route_name":"eq."+routeName,limit:1}).then(function(projs){
    var proj=projs&&projs.length?projs[0]:null;
    var query=proj
      ?{device_id:"eq."+DID,"project_id":"eq."+proj.id,limit:100}
      :{device_id:"eq."+DID,"route_name":"eq."+routeName,limit:100};
    sbS("sessions",query).then(function(rows){
      currentProject={id:proj?proj.id:null,name:routeName,sessions:rows||[],status:proj?proj.status:'active'};
      currentProjectId=proj?proj.id:null;
      currentProjectName=routeName;
      sbS("sessions",{device_id:"eq."+DID,limit:500}).then(function(allRows){
        renderProjectScreen(routeName,rows||[],allRows||[],proj);
        showScreen("screen-project");
      }).catch(function(){
        renderProjectScreen(routeName,rows||[],[],proj);
        showScreen("screen-project");
      });
    });
  }).catch(function(){
    // Fallback to route_name match
    sbS("sessions",{device_id:"eq."+DID,"route_name":"eq."+routeName,limit:100}).then(function(rows){
      currentProject={id:null,name:routeName,sessions:rows||[],status:'active'};
      sbS("sessions",{device_id:"eq."+DID,limit:500}).then(function(allRows){
        renderProjectScreen(routeName,rows||[],allRows||[],null);
        showScreen("screen-project");
      });
    });
  });
}

function renderProjectScreen(name,rows,allRows,proj){
  var byDate=rows.slice().sort(function(a,b){return new Date(a.created_at)-new Date(b.created_at);});
  var first=byDate[0];
  var total=rows.length;
  var sents=rows.filter(function(r){return r.baseline_zone==="sent";}).length;
  var sent=sents>0;
  var days=first?Math.max(1,Math.round((Date.now()-new Date(first.created_at))/(1000*60*60*24))):0;

  // Hero
  document.getElementById("proj-grade").textContent=first?(first.grade_value||proj&&proj.grade_value||"—"):(proj&&proj.grade_value||"—");
  document.getElementById("proj-name").textContent=name;
  var badge=document.getElementById("proj-status-badge");
  if(sent){badge.textContent="Sent ✓";badge.style.background="rgba(126,200,122,.12)";badge.style.color="#7ec87a";}
  else{badge.textContent="Projecting";badge.style.background="rgba(245,166,35,.12)";badge.style.color="#f5a623";}
  document.getElementById("proj-stat-sessions").textContent=total;
  document.getElementById("proj-stat-sends").textContent=sents||"0";
  document.getElementById("proj-stat-days").textContent=days;

  // Tags — guard against empty project (no sessions yet)
  var projInfo=proj||{}; // use project record for meta if no sessions
  var tags=first?[first.discipline,first.environment,first.rock_type,
    first.bolt_count?first.bolt_count+" bolts":null,
    first.route_height_ft?first.route_height_ft+" ft":null
  ].filter(Boolean):[];
  document.getElementById("proj-tags").innerHTML=tags.map(function(t){
    return '<span style="font-size:12px;padding:5px 12px;border-radius:99px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);">'+t+'</span>';
  }).join("");

  // Zone arc
  var zones=byDate.map(function(r){return r.deeper_zone||r.baseline_zone||"learning";});
  // Empty state for new projects
  var projEmptyState=document.getElementById("proj-empty-state");
  if(projEmptyState){projEmptyState.style.display=total===0?"block":"none";}
  var arcDots=document.getElementById("proj-arc-dots");
  if(arcDots){
    var ZY={comfort:85,learning:50,panic:15};
    var ZC={comfort:"rgba(126,200,122,.8)",learning:"rgba(245,166,35,.8)",panic:"rgba(232,68,68,.8)"};
    var W=300,n=zones.length,xStep=n>1?W/(n-1):W/2;
    var pts=zones.map(function(z,i){return{x:10+i*xStep,y:ZY[z]||50,c:ZC[z]||ZC.learning};});
    var line=n>1?'<polyline points="'+pts.map(function(p){return p.x+","+p.y;}).join(" ")+'" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1.5" stroke-linejoin="round"/>':'';
    var dots=pts.map(function(p,i){
      var isLast=i===pts.length-1;
      return '<circle cx="'+p.x+'" cy="'+p.y+'" r="'+(isLast?6:4)+'" fill="'+p.c+'"/>'+
        (isLast?'<circle cx="'+p.x+'" cy="'+p.y+'" r="10" fill="none" stroke="'+p.c+'" stroke-width="1.5" opacity=".4"/>':'');
    }).join("");
    arcDots.innerHTML=line+dots;
    // Insight
    var panicCount=zones.filter(function(z){return z==="panic";}).length;
    var comfortCount=zones.filter(function(z){return z==="comfort";}).length;
    var ins=document.getElementById("proj-arc-insight");
    if(ins&&n>1){
      var txt="";
      if(panicCount>0&&zones.slice(-3).indexOf("panic")<0)txt="Panic-zone activation in early sessions. Last 3 sessions consistently "+zones.slice(-1)[0]+".";
      else if(comfortCount===n)txt="All sessions in the Comfort zone on this route.";
      else txt=n+" sessions logged. Most recent: "+zones[zones.length-1]+" zone.";
      ins.textContent=txt;ins.style.display="block";
    }
  }

  // Breathing donut
  var breathData={};
  var breathOrder=["Easy and steady","Slightly faster","Shallow or tight","I held my breath","Didn't notice"];
  var breathColors={"Easy and steady":"rgba(126,200,122,.8)","Slightly faster":"rgba(245,166,35,.8)","Shallow or tight":"rgba(232,118,58,.75)","I held my breath":"rgba(232,68,68,.75)","Didn't notice":"rgba(160,160,160,.4)"};
  rows.filter(function(r){return r.breathing_post;}).forEach(function(r){breathData[r.breathing_post]=(breathData[r.breathing_post]||0)+1;});
  var bTotal=Object.values(breathData).reduce(function(s,v){return s+v;},0);
  var bsvg=document.getElementById("proj-breath-svg");
  var bleg=document.getElementById("proj-breath-legend");
  if(bsvg&&bTotal){
    var cx=50,cy=50,r=38,circ=2*Math.PI*r;
    var segs=[];var off=0;
    breathOrder.forEach(function(k){if(!breathData[k])return;segs.push({k:k,v:breathData[k],frac:breathData[k]/bTotal,off:off,col:breathColors[k]||"rgba(160,160,160,.4)"});off+=breathData[k]/bTotal;});
    bsvg.innerHTML=segs.map(function(s){
      var dl=s.frac*circ,gl=circ-dl,rot=(s.off*360)-90;
      return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+s.col+'" stroke-width="12" stroke-dasharray="'+dl.toFixed(1)+' '+gl.toFixed(1)+'" transform="rotate('+rot.toFixed(1)+' '+cx+' '+cy+')" stroke-linecap="butt"/>';
    }).join("")+
    '<text x="'+cx+'" y="'+cy+'" dy="-5" text-anchor="middle" font-size="18" font-family="Space Mono,monospace" font-weight="700" fill="rgba(255,255,255,.85)">'+bTotal+'</text>'+
    '<text x="'+cx+'" y="'+cy+'" dy="12" text-anchor="middle" font-size="9" font-family="Space Grotesk,sans-serif" fill="rgba(255,255,255,.3)">sessions</text>';
    if(bleg)bleg.innerHTML=breathOrder.filter(function(k){return breathData[k];}).map(function(k){
      return '<div><span style="color:'+breathColors[k]+';">●</span>&nbsp;'+k+' -- <strong style="color:var(--text);">'+breathData[k]+'</strong></div>';
    }).join("");
    // Insight
    var bi=document.getElementById("proj-breath-insight");
    if(bi){
      var negCount=(breathData["Shallow or tight"]||0)+(breathData["I held my breath"]||0);
      if(negCount>0&&negCount<bTotal)bi.textContent="Restricted breathing reported in "+negCount+" of "+bTotal+" sessions. Tracking whether this shifts as the route becomes more familiar.";
      else if(negCount===0)bi.textContent="Open breathing across all sessions on this route.";
      bi.style.display="block";
    }
  } else if(bsvg){
    bsvg.innerHTML='<text x="50" y="55" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="10" fill="rgba(255,255,255,.2)">No data yet</text>';
    if(bleg)bleg.textContent="Complete Go Deeper sessions to see breathing patterns.";
  }

  // Body state
  var bodyStates={comfort:0,learning:0,panic:0,unsure:0};
  var bodyLabels={comfort:"Settled and in control",learning:"Activated but manageable",panic:"Tight and reactive",unsure:"Hard to read"};
  var bodyColors={comfort:"#7ec87a",learning:"#f5a623",panic:"#e84444",unsure:"#888780"};
  rows.filter(function(r){return r.body_state;}).forEach(function(r){if(bodyStates[r.body_state]!==undefined)bodyStates[r.body_state]++;});
  var bsTotal=Object.values(bodyStates).reduce(function(s,v){return s+v;},0);
  var bsEl=document.getElementById("proj-body-state");
  if(bsEl){
    if(bsTotal){
      var maxBS=Math.max.apply(null,Object.values(bodyStates));
      bsEl.innerHTML=["panic","learning","comfort","unsure"].filter(function(k){return bodyStates[k]>0;}).map(function(k){
        var pct=Math.round((bodyStates[k]/bsTotal)*100);
        var barW=Math.round((bodyStates[k]/maxBS)*100);
        return '<div>'+
          '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">'+
          '<span style="font-size:14px;color:var(--muted);">'+bodyLabels[k]+'</span>'+
          '<span style="font-size:13px;font-weight:600;color:'+bodyColors[k]+';font-family:Space Mono,monospace;">'+pct+'%</span></div>'+
          '<div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden;">'+
          '<div style="height:100%;width:'+barW+'%;background:'+bodyColors[k]+';border-radius:99px;opacity:.8;transition:width .4s;"></div></div>'+
          '</div>';
      }).join("");
      var bsIns=document.getElementById("proj-body-insight");
      if(bsIns&&bsTotal>1){
        var firstState=byDate[0]?byDate[0].body_state||"learning":"learning";
        var lastState=byDate[byDate.length-1]?byDate[byDate.length-1].body_state||"learning":"learning";
        if(firstState!==lastState)bsIns.textContent="Body state shifted from "+bodyLabels[firstState]+" (session 1) to "+bodyLabels[lastState]+" (most recent). Pattern visible across "+bsTotal+" sessions.";
        else bsIns.textContent="Consistent body state across sessions on this route -- "+bodyLabels[lastState]+".";
        bsIns.style.display="block";
      }
    } else {
      bsEl.innerHTML='<div style="font-size:14px;color:var(--muted);padding:8px 0;">Complete Go Deeper sessions to see body state patterns.</div>';
    }
  }

  // Session log
  var logEl=document.getElementById("proj-session-log");
  if(logEl){
    var ZDot={comfort:"#7ec87a",learning:"#f5a623",panic:"#e84444"};
    logEl.innerHTML=byDate.map(function(r,i){
      var z=r.deeper_zone||r.baseline_zone||"learning";
      var sent=r.baseline_zone==="sent";
      var d=r.created_at?new Date(r.created_at).toLocaleDateString([],{month:"short",day:"numeric"}):"--";
      var details=[r.breathing_post,r.body_state?({comfort:"Settled",learning:"Activated",panic:"Tight",unsure:"Unclear"}[r.body_state]||r.body_state):null].filter(Boolean).join(" . ");
      return '<div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);">'+
        '<div style="width:8px;height:8px;border-radius:50%;background:'+(ZDot[z]||ZDot.learning)+';flex-shrink:0;"></div>'+
        '<div style="font-size:12px;color:var(--muted);min-width:44px;font-family:Space Mono,monospace;">'+d+'</div>'+
        '<div style="flex:1;font-size:13px;color:var(--text);">'+(details||z[0].toUpperCase()+z.slice(1)+" zone")+'</div>'+
        '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:'+(sent?"#7ec87a":"#f5a623")+';">'+(sent?"Sent ✓":"Attempt "+(i+1))+'</div>'+
        '</div>';
    }).join("")+'<div style="height:4px;"></div>';
  }

  // ── FOCUS DISTRIBUTION ──────────────────────────────
  var focusCard=document.getElementById('proj-focus-card');
  var focusContent=document.getElementById('proj-focus-content');
  var focusLabels={crux_movement:'Crux movement',clipping:'Clipping position',footwork:'Footwork',fear_management:'Fear management',fitness:'Fitness / endurance',route_reading:'Route reading',fall_practice:'Fall practice',general:'General attempt'};
  var focusColors={crux_movement:'#e8763a',clipping:'#f5a623',footwork:'#7ec87a',fear_management:'#e84444',fitness:'#BA7517',route_reading:'#7ec87a',fall_practice:'#f5a623',general:'#888780'};
  var focusCounts={};
  rows.filter(function(r){return r.session_focus;}).forEach(function(r){focusCounts[r.session_focus]=(focusCounts[r.session_focus]||0)+1;});
  var focusTotal=Object.values(focusCounts).reduce(function(s,v){return s+v;},0);
  if(focusContent&&focusTotal>0){
    focusCard.style.display='block';
    var maxF=Math.max.apply(null,Object.values(focusCounts));
    // Zone by focus insight
    var fearSessions=rows.filter(function(r){return r.session_focus==='fear_management';});
    var fearPanic=fearSessions.filter(function(r){return (r.deeper_zone||r.baseline_zone)==='panic';}).length;
    focusContent.innerHTML=Object.keys(focusCounts).sort(function(a,b){return focusCounts[b]-focusCounts[a];}).map(function(k){
      var pct=Math.round((focusCounts[k]/focusTotal)*100);
      var w=Math.round((focusCounts[k]/maxF)*100);
      var col=focusColors[k]||'#888780';
      // Zone breakdown for this focus
      var fSess=rows.filter(function(r){return r.session_focus===k;});
      var fZones={comfort:0,learning:0,panic:0};
      fSess.forEach(function(r){var z=r.deeper_zone||r.baseline_zone||'learning';if(fZones[z]!==undefined)fZones[z]++;});
      var zBar=fSess.length?'<div style="display:flex;height:4px;border-radius:99px;overflow:hidden;gap:1px;margin-top:6px;">'+
        (fZones.comfort?'<div style="flex:'+fZones.comfort+';background:#7ec87a;opacity:.8;"></div>':'')+
        (fZones.learning?'<div style="flex:'+fZones.learning+';background:#f5a623;opacity:.8;"></div>':'')+
        (fZones.panic?'<div style="flex:'+fZones.panic+';background:#e84444;opacity:.8;"></div>':'')+
        '</div>':'';
      return '<div style="margin-bottom:14px;">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'+
        '<span style="font-size:15px;font-weight:600;color:var(--text);">'+(focusLabels[k]||k)+'</span>'+
        '<span style="font-size:13px;font-family:Space Mono,monospace;color:'+col+';">'+focusCounts[k]+' session'+(focusCounts[k]!==1?'s':'')+'</span></div>'+
        '<div style="height:7px;background:var(--border2);border-radius:99px;overflow:hidden;">'+
        '<div style="height:100%;width:'+w+'%;background:'+col+';border-radius:99px;opacity:.85;"></div></div>'+
        zBar+'</div>';
    }).join('');
    // Insight
    if(fearSessions.length&&fearPanic>0){
      focusContent.innerHTML+='<div style="font-size:13px;color:var(--muted);font-style:italic;margin-top:4px;line-height:1.65;padding:10px 14px;background:rgba(232,118,58,.05);border-radius:8px;border-left:2px solid rgba(232,118,58,.3);">When your focus was Fear management, Panic-zone activation occurred in '+fearPanic+' of '+fearSessions.length+' sessions. This is the route\u2019s psychological signature.</div>';
    }
  }

  // ── UPDATE PROJECT ID on currentProject ──────────────
  if(currentProject)currentProject.id=currentProject.id||null;

  // ── UPDATE SENT/ABANDONED BUTTONS ────────────────────
  var sentBtn=document.getElementById('proj-sent-btn');
  var abanBtn=document.getElementById('proj-abandoned-btn');
  var actionsEl=document.getElementById('proj-actions');
  if(sent){if(sentBtn)sentBtn.style.display='none';if(abanBtn)abanBtn.style.display='none';}

  // ── COMPARISON CARD ──────────────────────────────────
  var cmpCard=document.getElementById("proj-comparison-card");
  var cmpContent=document.getElementById("proj-comparison-content");
  var cmpLbl=cmpCard?cmpCard.querySelector(".insight-label"):null;
  if(cmpContent&&allRows&&allRows.length>0){
    if(cmpLbl)cmpLbl.textContent="This route vs your overall patterns";
    // Update sub label with route name
    var cmpSub=cmpCard?cmpCard.querySelector("div[style*='margin-bottom:16px']"):null;
    if(cmpSub)cmpSub.textContent="How "+name+" compares to your typical activation across all logged climbs.";
    cmpCard.style.display="block";
    var allZ={comfort:0,learning:0,panic:0};
    var routeZ={comfort:0,learning:0,panic:0};
    var allBreath={restricted:0,total:0};
    var routeBreath={restricted:0,total:0};
    var allSent=0,allAttempts=0;
    var routeSent=0,routeAttempts=rows.length;
    allRows.forEach(function(r){
      var z=r.deeper_zone||r.baseline_zone||"learning";
      if(allZ[z]!==undefined)allZ[z]++;
      if(r.breathing_post){allBreath.total++;if(r.breathing_post==="Shallow or tight"||r.breathing_post==="I held my breath")allBreath.restricted++;}
      if(r.baseline_zone==="sent")allSent++;
      allAttempts++;
    });
    rows.forEach(function(r){
      var z=r.deeper_zone||r.baseline_zone||"learning";
      if(routeZ[z]!==undefined)routeZ[z]++;
      if(r.breathing_post){routeBreath.total++;if(r.breathing_post==="Shallow or tight"||r.breathing_post==="I held my breath")routeBreath.restricted++;}
      if(r.baseline_zone==="sent")routeSent++;
    });
    var allTotal=allAttempts||1;
    var routeTotal=routeAttempts||1;
    var routeBreathPct=routeBreath.total?Math.round((routeBreath.restricted/routeBreath.total)*100):0;
    var allBreathPct=allBreath.total?Math.round((allBreath.restricted/allBreath.total)*100):0;
    var routeSentPct=Math.round((routeSent/routeTotal)*100);
    var allSentPct=Math.round((allSent/allTotal)*100);
    var rC=Math.round((routeZ.comfort/routeTotal)*100),rL=Math.round((routeZ.learning/routeTotal)*100),rP=Math.round((routeZ.panic/routeTotal)*100);
    var aC=Math.round((allZ.comfort/allTotal)*100),aL=Math.round((allZ.learning/allTotal)*100),aP=Math.round((allZ.panic/allTotal)*100);
    function cmpBar(label,rVal,aVal,color,suffix){
      suffix=suffix||"%";
      var maxV=Math.max(rVal,aVal,1);
      var rW=Math.round((rVal/maxV)*100),aW=Math.round((aVal/maxV)*100);
      return '<div style="margin-bottom:16px;">'+
        '<div style="font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.04em;margin-bottom:8px;">'+label+'</div>'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">'+
        '<div style="font-size:11px;color:var(--muted2);min-width:72px;text-align:right;">This route</div>'+
        '<div style="flex:1;height:7px;background:var(--border);border-radius:99px;overflow:hidden;"><div style="height:100%;width:'+rW+'%;background:'+color+';border-radius:99px;opacity:.85;"></div></div>'+
        '<div style="font-size:12px;font-family:Space Mono,monospace;color:var(--text);min-width:32px;text-align:right;">'+rVal+suffix+'</div>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:8px;">'+
        '<div style="font-size:11px;color:var(--muted2);min-width:72px;text-align:right;">All climbs</div>'+
        '<div style="flex:1;height:7px;background:var(--border);border-radius:99px;overflow:hidden;"><div style="height:100%;width:'+aW+'%;background:'+color+';border-radius:99px;opacity:.45;"></div></div>'+
        '<div style="font-size:12px;font-family:Space Mono,monospace;color:var(--muted);min-width:32px;text-align:right;">'+aVal+suffix+'</div>'+
        '</div>'+
        '</div>';
    }
    // Zone bars -- stacked
    var zoneHtml='<div style="margin-bottom:16px;">'+
      '<div style="font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.04em;margin-bottom:8px;">Zone distribution</div>'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">'+
      '<div style="font-size:11px;color:var(--muted2);min-width:72px;text-align:right;">This route</div>'+
      '<div style="flex:1;height:7px;border-radius:99px;overflow:hidden;display:flex;gap:1px;">'+
      '<div style="width:'+rC+'%;background:#7ec87a;opacity:.8;"></div>'+
      '<div style="width:'+rL+'%;background:#f5a623;opacity:.8;"></div>'+
      '<div style="width:'+rP+'%;background:#e84444;opacity:.8;"></div>'+
      '</div>'+
      '<div style="font-size:11px;color:var(--muted2);min-width:32px;text-align:right;">'+rC+'/'+rL+'/'+rP+'</div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px;">'+
      '<div style="font-size:11px;color:var(--muted2);min-width:72px;text-align:right;">All climbs</div>'+
      '<div style="flex:1;height:7px;border-radius:99px;overflow:hidden;display:flex;gap:1px;">'+
      '<div style="width:'+aC+'%;background:#7ec87a;opacity:.45;"></div>'+
      '<div style="width:'+aL+'%;background:#f5a623;opacity:.45;"></div>'+
      '<div style="width:'+aP+'%;background:#e84444;opacity:.45;"></div>'+
      '</div>'+
      '<div style="font-size:11px;color:var(--muted2);min-width:32px;text-align:right;">'+aC+'/'+aL+'/'+aP+'</div>'+
      '</div>'+
      '</div>';
    var sep='<div style="height:0.5px;background:var(--border);margin:4px 0 16px;"></div>';
    // Insight
    var cmpInsight="";
    if(rP>aP+10)cmpInsight="Panic-zone rate on this route ("+rP+"%) is higher than your overall rate ("+aP+"%). This route is operating at your edge.";
    else if(rC>aC+10)cmpInsight="More Comfort-zone sessions on this route than your overall average. You're dialling this one in.";
    else cmpInsight="Zone distribution on this route is broadly consistent with your overall patterns.";
    if(routeSentPct<allSentPct-20)cmpInsight+=" Send rate here is lower than your overall average -- expected for a project at this grade.";
    cmpContent.innerHTML=zoneHtml+sep+
      cmpBar("Restricted breathing",routeBreathPct,allBreathPct,"#e8763a")+sep+
      cmpBar("Send rate",routeSentPct,allSentPct,"#7ec87a")+
      '<div style="font-size:13px;color:var(--muted);font-style:italic;margin-top:4px;line-height:1.65;padding:10px 13px;background:rgba(232,118,58,.05);border-radius:8px;border-left:2px solid rgba(232,118,58,.3);">'+cmpInsight+'</div>';
  }

  // ── TREND CARD ───────────────────────────────────────
  var trendCard=document.getElementById("proj-trend-card");
  var trendContent=document.getElementById("proj-trend-content");
  if(trendContent&&byDate.length>=4){
    trendCard.style.display="block";
    var first3=byDate.slice(0,3);
    var last3=byDate.slice(-3);
    var ZLabel={comfort:"Comfort",learning:"Learning",panic:"Panic"};
    var ZColor={comfort:"#7ec87a",learning:"#f5a623",panic:"#e84444"};
    var ZBg={comfort:"rgba(126,200,122,.08)",learning:"rgba(245,166,35,.08)",panic:"rgba(232,68,68,.08)"};
    function trendBlock(sessions,label){
      var zones=sessions.map(function(r){return r.deeper_zone||r.baseline_zone||"learning";});
      var panicCount=zones.filter(function(z){return z==="panic";}).length;
      var comfortCount=zones.filter(function(z){return z==="comfort";}).length;
      var dominant=panicCount>=2?"panic":comfortCount>=2?"comfort":"learning";
      var breathRestricted=sessions.filter(function(r){return r.breathing_post==="Shallow or tight"||r.breathing_post==="I held my breath";}).length;
      var breathTotal=sessions.filter(function(r){return r.breathing_post;}).length;
      return '<div style="background:var(--surface2);border-radius:12px;padding:14px;">'+
        '<div style="font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">'+label+'</div>'+
        '<div style="display:flex;gap:4px;margin-bottom:10px;">'+
        zones.map(function(z){return '<div style="flex:1;height:6px;border-radius:99px;background:'+ZColor[z]+';opacity:.8;"></div>';}).join("")+
        '</div>'+
        '<div style="font-size:13px;font-weight:600;color:'+ZColor[dominant]+';margin-bottom:4px;">'+ZLabel[dominant]+' zone</div>'+
        (breathTotal>0?'<div style="font-size:12px;color:var(--muted);">Breath restricted: '+breathRestricted+'/'+breathTotal+' sessions</div>':'')+
        '</div>';
    }
    var f3=trendBlock(first3,"First "+first3.length+" sessions");
    var l3=trendBlock(last3,"Last "+last3.length+" sessions");
    // Overall trend insight
    var firstZones=first3.map(function(r){return r.deeper_zone||r.baseline_zone||"learning";});
    var lastZones=last3.map(function(r){return r.deeper_zone||r.baseline_zone||"learning";});
    var firstPanic=firstZones.filter(function(z){return z==="panic";}).length;
    var lastPanic=lastZones.filter(function(z){return z==="panic";}).length;
    var firstBreath=first3.filter(function(r){return r.breathing_post==="Shallow or tight"||r.breathing_post==="I held my breath";}).length;
    var lastBreath=last3.filter(function(r){return r.breathing_post==="Shallow or tight"||r.breathing_post==="I held my breath";}).length;
    var trendInsight="";
    if(lastPanic<firstPanic)trendInsight="Panic-zone activation reduced from "+firstPanic+" to "+lastPanic+" sessions in the last block.";
    else if(lastPanic>firstPanic)trendInsight="Panic-zone activation increased in recent sessions -- assess whether conditions or grade are factors.";
    else trendInsight="Zone activation is consistent across early and recent sessions.";
    if(lastBreath<firstBreath)trendInsight+=" Breathing is opening up -- restricted reports dropped from "+firstBreath+" to "+lastBreath+".";
    trendContent.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">'+f3+l3+'</div>'+
      (trendInsight?'<div style="font-size:13px;color:var(--muted);font-style:italic;line-height:1.65;padding:10px 13px;background:rgba(232,118,58,.05);border-radius:8px;border-left:2px solid rgba(232,118,58,.3);">'+trendInsight+'</div>':"");
  }
}

// ── START A PROJECT ──────────────────────────────────────
var spState={name:null,grade:null,gradeSystem:'YDS',discipline:null,environment:null,rockType:null,boltCount:null,routeHeight:null,heightUnit:'ft'};

function spCheckReady(){
  spState.name=document.getElementById('sp-name').value.trim()||null;
  var btn=document.getElementById('sp-submit-btn');
  if(btn){
    var ready=!!(spState.name&&spState.name.length>0);
    btn.style.opacity=ready?'1':'0.3';
    btn.style.pointerEvents=ready?'all':'none';
  }
}

function spSetGradeSys(sys){
  spState.gradeSystem=sys;spState.grade=null;
  ['V','YDS','FR','UK'].forEach(function(s){
    var b=document.getElementById('sp-btn-'+s);
    if(b)b.classList.toggle('active',s===sys);
  });
  buildSpGradeGrid();
}
// legacy alias
function spPickSys(sys,el){spSetGradeSys(sys);}

function buildSpGradeGrid(){
  var el=document.getElementById('sp-grade-grid');if(!el)return;
  el.innerHTML='';
  gradeSystems[spState.gradeSystem].forEach(function(g){
    var b=document.createElement('button');
    b.className='grade-btn';b.textContent=g;
    b.onclick=function(){
      document.querySelectorAll('#sp-grade-grid .grade-btn').forEach(function(x){x.classList.remove('selected');});
      b.classList.add('selected');spState.grade=g;
      spCheckReady();
    };
    el.appendChild(b);
  });
}

function spPickDisc(el,val){
  el.closest('div').querySelectorAll('.chip').forEach(function(b){b.classList.remove('selected');});
  el.classList.add('selected');spState.discipline=val;
  var bg=document.getElementById('sp-bolt-group');
  if(bg)bg.style.display=val==='Sport'?'block':'none';
  if(val!=='Sport')spState.boltCount=null;
}

function spPickEnv(val){
  spState.environment=val;
  document.getElementById('sp-env-in').classList.toggle('selected',val==='indoor');
  document.getElementById('sp-env-out').classList.toggle('selected',val==='outdoor');
  // Rock type only shows for outdoor
  var rockGrp=document.getElementById('sp-rock-group');
  if(rockGrp)rockGrp.style.display=val==='outdoor'?'block':'none';
  // Bolt count and height show for both
  var boltGrp=document.getElementById('sp-bolt-group');
  var heightGrp=document.getElementById('sp-height-group');
  var extraFields=document.getElementById('sp-extra-fields');
  if(extraFields)extraFields.style.display='flex';
  if(boltGrp&&spState.discipline==='Sport')boltGrp.style.display='block';
  if(heightGrp)heightGrp.style.display='block';
}

function spPickRock(el,val){
  el.closest('div').querySelectorAll('.chip').forEach(function(b){b.classList.remove('selected');});
  el.classList.add('selected');spState.rockType=val;
}

function spAdjBolt(d){
  if(spState.boltCount===null)spState.boltCount=0;
  spState.boltCount=Math.max(0,spState.boltCount+d);
  document.getElementById('sp-bolt-val').textContent=spState.boltCount||'--';
}

function spSetUnit(u){
  spState.heightUnit=u;
  var ftBtn=document.getElementById('sp-unit-ft');
  var mBtn=document.getElementById('sp-unit-m');
  if(ftBtn){ftBtn.style.background=u==='ft'?'rgba(232,118,58,.15)':'var(--surface)';ftBtn.style.borderColor=u==='ft'?'var(--accent)':'var(--border)';ftBtn.style.color=u==='ft'?'var(--accent)':'var(--muted)';}
  if(mBtn){mBtn.style.background=u==='m'?'rgba(232,118,58,.15)':'var(--surface)';mBtn.style.borderColor=u==='m'?'var(--accent)':'var(--border)';mBtn.style.color=u==='m'?'var(--accent)':'var(--muted)';}
  document.getElementById('sp-height-unit-lbl').textContent=u;
  if(spState.routeHeight!==null){
    spState.routeHeight=u==='m'?Math.round(spState.routeHeight*.3048):Math.round(spState.routeHeight*3.28084);
    document.getElementById('sp-height-val').textContent=spState.routeHeight;
  }
}

function spAdjHeight(d){
  var step=spState.heightUnit==='ft'?5:1;
  if(spState.routeHeight===null)spState.routeHeight=spState.heightUnit==='ft'?50:15;
  spState.routeHeight=Math.max(0,spState.routeHeight+d*step);
  document.getElementById('sp-height-val').textContent=spState.routeHeight;
}

function loadProjectsScreen(){
  var activeList=document.getElementById('projects-active-list');
  var sentList=document.getElementById('projects-sent-list');
  var archivedList=document.getElementById('projects-archived-list');
  var sentSec=document.getElementById('projects-sent-section');
  var archSec=document.getElementById('projects-archived-section');
  if(activeList)activeList.innerHTML='<div style="text-align:center;padding:24px 0;font-size:15px;color:var(--muted);">Loading...</div>';

  sbS('projects',{device_id:'eq.'+DID,limit:50}).then(function(projs){
    if(!projs||!projs.length){
      if(activeList)activeList.innerHTML=
        '<div style="padding:32px 0;text-align:center;">'+
        '<div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px;">No projects yet</div>'+
        '<div style="font-size:15px;color:var(--muted);line-height:1.6;">Name a route and track every session,<br>focus, and zone shift across attempts.</div>'+
        '</div>';
      return;
    }

    var active=projs.filter(function(p){return p.status==='active';});
    var sent=projs.filter(function(p){return p.status==='sent';});
    var archived=projs.filter(function(p){return p.status==='abandoned';});

    function projectCard(p){
      var statusColor=p.status==='sent'?'#7ec87a':p.status==='abandoned'?'var(--muted2)':'#f5a623';
      var statusLabel=p.status==='sent'?'Sent ✓':p.status==='abandoned'?'Archived':'Active';
      var meta=[p.grade_value,p.discipline,p.environment].filter(Boolean).join(' . ');
      var safeName=p.route_name.replace(/'/g,"\'");
      var safeId=p.id||'';
      var html='<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;margin-bottom:8px;overflow:hidden;">';
      html+='<div onclick="openProject(\'' +safeName+ '\')" style="display:flex;align-items:center;gap:14px;padding:14px 16px;cursor:pointer;-webkit-tap-highlight-color:transparent;">';
      html+='<div style="flex:1;min-width:0;">';
      html+='<div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:2px;">'+p.route_name+'</div>';
      if(meta)html+='<div style="font-size:13px;color:var(--muted);">'+meta+'</div>';
      html+='</div>';
      html+='<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">';
      html+='<span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;background:rgba(126,200,122,.1);color:'+statusColor+';">'+statusLabel+'</span>';
      html+='<span style="font-size:20px;color:var(--accent);">›</span>';
      html+='</div></div>';
      html+='<div style="padding:0 12px 12px;">';
      html+='<button onclick="event.stopPropagation();logAgainstProject(\'' +safeId+ '\',\'' +safeName+ '\')" style="width:100%;background:rgba(232,118,58,.1);border:1px solid rgba(232,118,58,.3);border-radius:10px;color:var(--accent);font-family:Space Grotesk,sans-serif;font-size:14px;font-weight:700;padding:11px;cursor:pointer;-webkit-tap-highlight-color:transparent;">+ Log a session</button>';
      html+='</div></div>';
      return html;
    }
    if(activeList){
      if(active.length){
        activeList.innerHTML=active.map(projectCard).join('');
      } else {
        activeList.innerHTML='<div style="padding:16px 0;font-size:15px;color:var(--muted);">No active projects.</div>';
      }
    }
    if(sentList&&sent.length){
      sentSec.style.display='block';
      sentList.innerHTML=sent.map(projectCard).join('');
    }
    if(archivedList&&archived.length){
      archSec.style.display='block';
      archivedList.innerHTML=archived.map(projectCard).join('');
    }
  }).catch(function(){
    if(activeList)activeList.innerHTML='<div style="padding:16px 0;font-size:15px;color:var(--muted);">Could not load projects.</div>';
  });
}

function submitProject(){
  spState.name=document.getElementById('sp-name').value.trim()||null;
  if(!spState.name){showError('Please enter a route name.');return;}
  var heightFt=spState.routeHeight&&spState.heightUnit==='m'?Math.round(spState.routeHeight*3.28084):spState.routeHeight;
  setSaveInd('sp-save-ind','<span class="save-spinner"></span>Saving\u2026');
  var projectName=spState.name;
  // Build payload with only confirmed columns
  var payload={device_id:DID,route_name:projectName,status:'active'};
  if(spState.grade)payload.grade_value=spState.grade;
  if(spState.discipline)payload.discipline=spState.discipline;
  if(spState.environment)payload.environment=spState.environment;
  if(spState.gradeSystem)payload.grade_system=spState.gradeSystem;
  fetch(SB+'/rest/v1/projects',{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':SK,'Authorization':'Bearer '+SK,'Prefer':'return=representation'},
    body:JSON.stringify(payload)
  }).then(function(r){
    return r.json().then(function(j){return{ok:r.ok,status:r.status,data:j};});
  }).then(function(res){
    setSaveInd('sp-save-ind','');
    if(res.ok){
      var saved=Array.isArray(res.data)?res.data[0]:res.data;
      currentProjectId=saved&&saved.id?saved.id:null;
      currentProjectName=projectName;
      spState={name:null,grade:null,gradeSystem:'YDS',discipline:null,environment:null,rockType:null,boltCount:null,routeHeight:null,heightUnit:'ft'};
      showToast('Project started!');
      if(currentProjectId){
        setTimeout(function(){openProjectById(currentProjectId,projectName);},300);
      } else {
        showScreen('screen-projects');
        setTimeout(loadProjectsScreen,400);
      }
    } else {
      // Surface the actual error
      var msg=res.data&&res.data.message?res.data.message:'Could not save project ('+res.status+').';
      console.error('Project save error:',res.data);
      setSaveInd('sp-save-ind','');
      showError(msg);
    }
  }).catch(function(e){
    setSaveInd('sp-save-ind','');
    console.error('Project save catch:',e);
    showError('Could not save project. Check your connection.');
  });
}

function initStartProject(){
  // Reset form
  document.getElementById('sp-name').value='';
  spState={name:null,grade:null,gradeSystem:'YDS',discipline:null,environment:null,rockType:null,boltCount:null,routeHeight:null,heightUnit:'ft'};
  document.getElementById('sp-submit-btn').style.opacity='0.3';
  document.getElementById('sp-submit-btn').style.pointerEvents='none';
  var rg=document.getElementById('sp-rock-group');if(rg)rg.style.display='none';
  var ef=document.getElementById('sp-extra-fields');if(ef)ef.style.display='none';
  document.getElementById('sp-env-in').classList.remove('selected');
  document.getElementById('sp-env-out').classList.remove('selected');
  ['V','YDS','FR','UK'].forEach(function(s){
    var b=document.getElementById('sp-btn-'+s);
    if(b)b.classList.toggle('active',s==='YDS');
  });
  buildSpGradeGrid();
}
