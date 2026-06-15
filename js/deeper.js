// ── GO DEEPER ────────────────────────────────────────────
var deepAnswers={};
function startDeeper(){
  // Reset reflection state
  reflChips={ww:new Set(),sl:new Set()};
  ["went-well-text","still-learning-text","surprised-text"].forEach(function(id){var el=document.getElementById(id);if(el)el.value="";});
  document.querySelectorAll("#screen-q5 .chip,#screen-q6 .chip,#screen-q7 .chip").forEach(function(c){c.classList.remove("selected");});
  // Sync labels for reflection screens
  var lbl=logState.grade&&logState.terrain?logState.grade+" · "+logState.terrain:"";
  ["q5-label","q6-label","q7-label"].forEach(function(id){var el=document.getElementById(id);if(el)el.textContent=lbl;});
  var label=logState.grade+" . "+logState.terrain;
  ["q1","q2","q3","q4"].forEach(q=>{var el=document.getElementById(q+"-label");if(el)el.textContent=label;});
  document.querySelectorAll(".response-chips .chip").forEach(c=>c.classList.remove("selected"));
  ["next-q1","next-q2","next-q3","next-q4"].forEach(id=>{var el=document.getElementById(id);if(el)el.classList.remove("ready");});
  deepAnswers={};logState.zone=null;
  showScreen("screen-q1");
}
function selectDeepChip(el,group,zone){
  el.closest(".response-chips").querySelectorAll(".chip").forEach(c=>c.classList.remove("selected"));
  el.classList.add("selected");
  deepAnswers[group]=el.textContent;
  if(zone)logState.zone=zone;
  var nb=document.getElementById("next-"+group);if(nb)nb.classList.add("ready");
}
function toggleCtx(id,arrowId){
  var el=document.getElementById(id),arrow=document.getElementById(arrowId);
  el.classList.toggle("open");arrow.textContent=el.classList.contains("open")?"▼":"▶";
  var sciId=id+"-sci";
  var sci=document.getElementById(sciId);
  if(sci)sci.style.display=el.classList.contains("open")?"block":"none";
}

var reflChips={ww:new Set(),sl:new Set()};
function toggleReflChip(el,group){
  var label=el.textContent.trim();
  if(reflChips[group].has(label)){reflChips[group].delete(label);el.classList.remove("selected");}
  else{reflChips[group].add(label);el.classList.add("selected");}
}

function finishDeeper(){
  // Populate label refs for q5/q6/q7
  var q5l=document.getElementById("q5-label");var q6l=document.getElementById("q6-label");var q7l=document.getElementById("q7-label");
  var q1lbl=document.getElementById("q1-label");if(q5l)q5l.textContent=q1lbl?q1lbl.textContent:"";
  if(q6l)q6l.textContent=q5l?q5l.textContent:"";
  if(q7l)q7l.textContent=q5l?q5l.textContent:"";
  // Save reflection to sessions
  if(logState.sessId){
    var wwChips=[...reflChips.ww].join(", ");
    var wwText=(document.getElementById("went-well-text")||{}).value||"";
    var went_well=[wwChips,wwText].filter(Boolean).join(" | ")||null;
    var slChips=[...reflChips.sl].join(", ");
    var slText=(document.getElementById("still-learning-text")||{}).value||"";
    var still_learning=[slChips,slText].filter(Boolean).join(" | ")||null;
    var q7chip=null;
    document.querySelectorAll("#screen-q7 .chip").forEach(function(c){if(c.classList.contains("selected"))q7chip=c.textContent.trim();});
    var surprisedText=(document.getElementById("surprised-text")||{}).value||"";
    var surprised_by=[q7chip,surprisedText].filter(Boolean).join(" | ")||null;
    if(went_well||still_learning||surprised_by){
      if(logState.sessId)sbU("sessions",logState.sessId,{went_well:went_well,still_learning:still_learning,surprised_by:surprised_by}).catch(function(e){console.warn("reflection save",e);});
    }
  }
  var zoneMap={
    comfort:{text:"Somatic data maps to the Comfort zone — familiar territory, movement becoming automatic. The Learning fringe is always available as a conscious step outward.",cls:"zone-comfort",label:"Comfort zone",dotX:100,dotY:100,dotColor:"#c8f55a",riverY:82},
    learning:{text:"Somatic data maps to the Learning zone — activation is present and manageable. This is the deliberate practice window. Awareness sharpens here.",cls:"zone-learning",label:"Learning zone",dotX:100,dotY:68,dotColor:"#f5a623",riverY:50},
    panic:{text:"Somatic data maps to the Panic zone — perceived demand exceeded current experience. This is the edge revealed. Was this a conscious step or a reactive one? Both are data.",cls:"zone-panic",label:"Panic zone",dotX:100,dotY:28,dotColor:"#ff5c3a",riverY:16},
    unsure:{text:"Somatic signal was ambiguous on this climb. That’s valid data — unclear activation is worth tracking as your picture builds across sessions.",cls:"zone-learning",label:"Signal unclear",dotX:100,dotY:68,dotColor:"#f5a623",riverY:50}
  };
  var z=zoneMap[logState.zone]||zoneMap.unsure;
  document.getElementById("insight-text").textContent=z.text;
  document.getElementById("zone-pill-container").innerHTML='<span class="zone-pill '+z.cls+'">'+z.label+"</span>";
  // Zone map dot
  var dot=document.getElementById("zone-dot"),ring=document.getElementById("zone-dot-ring");
  dot.setAttribute("cx",z.dotX);dot.setAttribute("cy",z.dotY);dot.setAttribute("fill",z.dotColor);dot.style.opacity="1";
  ring.setAttribute("cx",z.dotX);ring.setAttribute("cy",z.dotY);ring.setAttribute("stroke",z.dotColor);ring.style.opacity="1";
  // River
  var riverDot=document.getElementById("river-current-dot"),riverRing=document.getElementById("river-current-ring");
  riverDot.setAttribute("cy",z.riverY);riverDot.setAttribute("fill",z.dotColor);
  riverRing.setAttribute("cy",z.riverY);
  document.getElementById("river-line").setAttribute("points","60,82 110,75 160,48 210,40 260,55 300,"+z.riverY);
  var insightMap={comfort:"Comfort zone — familiar territory. The edge is always available as a deliberate step outward.",learning:"Learning zone — activation present and manageable. Awareness sharpens here. This is where the edge gets exposed.",panic:"Panic zone — the edge was exceeded. Conscious or reactive? Naming it is how the pattern shifts.",unsure:"Signal unclear — ambiguous activation is still data. The picture builds with each session."};document.getElementById("river-insight").textContent=insightMap[logState.zone]||"Latest session logged.";
  // Save deeper data to Supabase
  if(logState.sessId){
    if(logState.sessId)sbU("sessions",logState.sessId,{breathing_post:deepAnswers.q1||null,gut_post:deepAnswers.q2||null,crux_response:deepAnswers.q3||null,body_state:logState.zone,session_focus:logState.sessionFocus||null});
  }
  // Populate reflection route context
  var rg=document.getElementById("reflect-grade");var rt=document.getElementById("reflect-terrain");
  var rrl=document.getElementById("reflect-result-lbl");var rzp=document.getElementById("reflect-zone-pill");
  if(rg)rg.textContent=logState.grade||"--";
  if(rt)rt.textContent=logState.terrain||"--";
  if(rrl)rrl.textContent=logState.result==="sent"?"Sent ✓":"Attempt";
  if(rzp){var zLbl=logState.zone?logState.zone[0].toUpperCase()+logState.zone.slice(1)+" zone":"";var zCol=logState.zone==="comfort"?"#7ec87a":logState.zone==="panic"?"#e84444":"#f5a623";rzp.innerHTML=zLbl?'<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:rgba(200,200,200,.1);color:'+zCol+';">'+zLbl+'</span>':"";}
  // If attempt, show incident flow
  if(logState.result==="attempt"){showScreen("screen-incident");initIncident();}
  else showScreen("screen-reflection");
}

// ── FALL / INCIDENT FLOW ─────────────────────────────────
var incidentQ=[
  {id:"what_happened",label:"What happened",text:"What happened on the attempt?",opts:["Slipped off","Got pumped","Fear -- I backed off","Bailed consciously","Something else"]},
  {id:"where_on_route",label:"Where on the route",text:"Where on the route did it happen?",opts:["At the crux","Mid-route","Near the top","At the start","Not sure"]},
  {id:"body_position",label:"Body position",text:"What was your body position at that moment?",opts:["Overextended / off-balance","Solid but physically failed","Tense / rigid","Controlled -- mental decision","Not sure"]},
  {id:"first_time",label:"First time",text:"Was this a first time on this type of move or route?",opts:["Yes -- completely new territory","Similar but not identical","No -- I've done this before","Not sure"]},
  {id:"breathing_during",label:"Breathing",text:"What was your breathing like in the moment?",opts:["Held my breath","Shallow and fast","Open and steady","Didn't notice"]}
];
var incidentCur=0,incidentAns={};

function initIncident(){
  incidentCur=0;incidentAns={};
  renderIncident();
}
function renderIncident(){
  var q=incidentQ[incidentCur];
  document.getElementById("incident-progress").textContent=(incidentCur+1)+" of "+incidentQ.length;
  document.getElementById("incident-next-btn").classList.remove("ready");
  document.getElementById("incident-content").innerHTML=
    '<div class="content" style="padding-top:20px;"><div class="question-card">'+
    '<div class="q-number">'+q.label+'</div>'+
    '<div class="q-text-dark">'+q.text+'</div>'+
    '<div class="response-chips" id="incident-chips">'+
    q.opts.map(o=>'<button class="chip" onclick="selectIncidentChip(this,\''+o.replace(/'/g,"\\'")+'\')">'+ o+"</button>").join("")+
    "</div></div></div>";
}
function selectIncidentChip(el,val){
  el.closest(".response-chips").querySelectorAll(".chip").forEach(c=>c.classList.remove("selected"));
  el.classList.add("selected");
  incidentAns[incidentQ[incidentCur].id]=val;
  document.getElementById("incident-next-btn").classList.add("ready");
}
function incidentNext(){
  if(incidentCur<incidentQ.length-1){incidentCur++;renderIncident();}
  else{
    // Save to Supabase
    sbI("post_climb_incidents",Object.assign({device_id:DID,session_id:logState.sessId||null},incidentAns));
    showScreen("screen-reflection");
  }
}

// ── LOG ANOTHER ──────────────────────────────────────────
function celebrateGoClimb(){
  showToast("Come back after you climb and log your reflection.");
  setTimeout(function(){showScreen('screen-home');},1200);
}
function celebrateBackOff(){
  showToast("Stepping back is a conscious risk decision -- that's data too.");
  setTimeout(function(){showScreen('screen-home');},1400);
}
function openEditSheet(){
  var sheet=document.getElementById("edit-sheet");if(!sheet)return;
  var gc=document.getElementById("edit-grade-chips");
  if(gc&&!gc.children.length){
    (gradeSystems[logGradeSystem]||gradeSystems.YDS).forEach(function(g){
      var b=document.createElement("button");b.className="chip"+(logState.grade===g?" selected":"");b.textContent=g;
      b.onclick=function(){gc.querySelectorAll(".chip").forEach(function(x){x.classList.remove("selected");});b.classList.add("selected");logState.grade=g;};
      gc.appendChild(b);
    });
  }
  sheet.querySelectorAll(".chip[onclick*='editSelTerrain']").forEach(function(b){b.classList.toggle("selected",b.textContent===logState.terrain);});
  var s=document.getElementById("edit-btn-sent"),a=document.getElementById("edit-btn-attempt");
  if(s){s.style.background=logState.result==="sent"?"var(--accent)":"var(--surface2)";s.style.color=logState.result==="sent"?"#fff":"var(--text)";}
  if(a){a.style.background=logState.result==="attempt"?"rgba(245,166,35,.2)":"var(--surface2)";a.style.color=logState.result==="attempt"?"#f5a623":"var(--text)";}
  var rn=document.getElementById("edit-rname");if(rn)rn.value=logState.routeName||"";
  sheet.style.display="block";
}
function editSelTerrain(el,val){
  el.closest("div").querySelectorAll(".chip").forEach(function(b){b.classList.remove("selected");});
  el.classList.add("selected");logState.terrain=val;
}
function editSelResult(val){
  logState.result=val;
  var s=document.getElementById("edit-btn-sent"),a=document.getElementById("edit-btn-attempt");
  if(s){s.style.background=val==="sent"?"var(--accent)":"var(--surface2)";s.style.color=val==="sent"?"#fff":"var(--text)";}
  if(a){a.style.background=val==="attempt"?"rgba(245,166,35,.2)":"var(--surface2)";a.style.color=val==="attempt"?"#f5a623":"var(--text)";}
}
function saveEditedClimb(){
  if(logState.sessId){
    if(logState.sessId)sbU("sessions",logState.sessId,{grade_value:logState.grade,tag:logState.terrain,baseline_zone:logState.result==="sent"?"sent":logState.result==="dna"?"dna":"attempt",route_name:logState.routeName||null}).then(function(){showToast("Climb updated");renderLogCelebration();});
  }
  document.getElementById("edit-sheet").style.display="none";
}
function openStartProjectFromLog(){
  currentProjectName=logState.routeName||null;
  currentProjectId=null;
  showScreen("screen-start-project");
  setTimeout(function(){
    var nameEl=document.getElementById("sp-name");
    if(nameEl&&logState.routeName)nameEl.value=logState.routeName;
    if(logState.grade){spSetGradeSys(logGradeSystem||"YDS");spState.grade=logState.grade;document.querySelectorAll("#sp-grade-grid .grade-btn").forEach(function(b){b.classList.toggle("selected",b.textContent===logState.grade);});}
    spCheckReady();
  },100);
}
function toggleLogProject(){
  logState.trackAsProject=!logState.trackAsProject;
  var check=document.getElementById('log-proj-check');
  var tick=document.getElementById('log-proj-tick');
  if(check){check.style.background=logState.trackAsProject?'rgba(126,200,122,.2)':'transparent';check.style.borderColor=logState.trackAsProject?'#7ec87a':'rgba(126,200,122,.5)';}
  if(tick)tick.style.display=logState.trackAsProject?'block':'none';
}
function logAnother(){
  logState={grade:null,terrain:null,result:null,zone:null,sessId:null,discipline:null,environment:null,routeName:null,rockType:null,boltCount:null,routeHeight:null,heightUnit:'ft',sessionFocus:null,trackAsProject:false};
  var gg=document.getElementById('log-grade-group');var rg=document.getElementById('log-rname-group');var pg=document.getElementById('log-project-group');
  if(gg)gg.style.display='none';if(rg)rg.style.display='none';if(pg)pg.style.display='none';
  var ri=document.getElementById('log-rname-input');if(ri)ri.value='';
  var pc=document.getElementById('log-proj-check');var pt=document.getElementById('log-proj-tick');
  if(pc){pc.style.background='transparent';pc.style.borderColor='rgba(126,200,122,.5)';}if(pt)pt.style.display='none';
  buildGradeGrid(logGradeSystem);
  document.querySelectorAll(".chip[onclick*='selectTerrain']").forEach(b=>b.classList.remove("selected"));
  document.getElementById("btn-sent").classList.remove("selected-send");
  document.getElementById("btn-attempt").classList.remove("selected-attempt");
  checkLogReady();
  showScreen("screen-log");
}
