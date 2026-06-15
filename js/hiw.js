// ── HOW IT WORKS / RESEARCH TOGGLES ─────────────────────
function toggleRes(header){
  var body=header.nextElementSibling,chevron=header.querySelector(".res-card-chevron");
  body.classList.toggle("open");chevron.classList.toggle("open");
}

// ── TOAST ─────────────────────────────────────────────────
function showToast(msg){var t=document.getElementById("toast-el");t.textContent=msg;t.classList.add("show");setTimeout(function(){t.classList.remove("show");},2200);}
function showError(msg){var t=document.getElementById("error-toast-el");t.textContent=msg;t.classList.add("show");setTimeout(function(){t.classList.remove("show");},3500);}
function setSaveInd(id,html){var el=document.getElementById(id);if(el)el.innerHTML=html;}

// ── ROUTE DETAILS FUNCTIONS ──────────────────────────
var rdHeightUnit='ft';
function initRouteDetails(){
  var lbl=document.getElementById("rd-label");
  if(lbl)lbl.textContent=(logState.grade||"--")+" . "+(logState.terrain||"--");
  var ni=document.getElementById("rd-route-name");
  if(ni)ni.value=logState.routeName||"";
  document.getElementById("rd-outdoor-fields").style.display="none";
  rdHeightUnit='ft';
}
function rdSelectDisc(el,val){
  el.closest("div").querySelectorAll(".chip").forEach(function(b){b.classList.remove("selected");});
  el.classList.add("selected");logState.discipline=val;
  var bg=document.getElementById("rd-bolt-group");
  if(bg)bg.style.display=val==="Sport"?"block":"none";
}
function rdSelectEnv(val){
  logState.environment=val;
  document.getElementById("rd-indoor").classList.toggle("selected",val==="indoor");
  document.getElementById("rd-outdoor").classList.toggle("selected",val==="outdoor");
  var od=document.getElementById("rd-outdoor-fields");
  if(od)od.style.display=val==="outdoor"?"flex":"none";
}
function rdSelectRock(el,val){
  el.closest("div").querySelectorAll(".chip").forEach(function(b){b.classList.remove("selected");});
  el.classList.add("selected");logState.rockType=val;
}
function rdAdjBolt(d){
  if(logState.boltCount===null)logState.boltCount=0;
  logState.boltCount=Math.max(0,logState.boltCount+d);
  document.getElementById("rd-bolt-val").textContent=logState.boltCount||"--";
}
function rdSetUnit(u){
  rdHeightUnit=u;
  document.getElementById("rd-unit-ft").style.background=u==="ft"?"rgba(232,118,58,.12)":"var(--surface)";
  document.getElementById("rd-unit-ft").style.borderColor=u==="ft"?"var(--accent)":"var(--border)";
  document.getElementById("rd-unit-ft").style.color=u==="ft"?"var(--accent)":"var(--muted)";
  document.getElementById("rd-unit-m").style.background=u==="m"?"rgba(232,118,58,.12)":"var(--surface)";
  document.getElementById("rd-unit-m").style.borderColor=u==="m"?"var(--accent)":"var(--border)";
  document.getElementById("rd-unit-m").style.color=u==="m"?"var(--accent)":"var(--muted)";
  document.getElementById("rd-height-unit").textContent=u;
  if(logState.routeHeight!==null){
    logState.routeHeight=u==="m"?Math.round(logState.routeHeight*.3048):Math.round(logState.routeHeight*3.28084);
    document.getElementById("rd-height-val").textContent=logState.routeHeight;
  }
}
function rdAdjHeight(d){
  var step=rdHeightUnit==="ft"?5:1;
  if(logState.routeHeight===null)logState.routeHeight=rdHeightUnit==="ft"?50:15;
  logState.routeHeight=Math.max(0,logState.routeHeight+d*step);
  document.getElementById("rd-height-val").textContent=logState.routeHeight;
}
function saveRouteDetails(){
  logState.routeName=document.getElementById("rd-route-name").value.trim()||null;
  logState.routeHeight=logState.routeHeight&&rdHeightUnit==="m"?Math.round(logState.routeHeight*3.28084):logState.routeHeight;
  if(!logState.sessId){showScreen("screen-reflection");return;}
  setSaveInd("rd-save-ind","<span class='save-spinner'></span>Saving…");
  if(logState.sessId)sbU("sessions",logState.sessId,{route_name:logState.routeName,discipline:logState.discipline,environment:logState.environment,rock_type:logState.rockType,bolt_count:logState.boltCount,route_height_ft:logState.routeHeight}).then(function(r){
    setSaveInd("rd-save-ind","");
    showScreen("screen-reflection");
  }).catch(function(){
    setSaveInd("rd-save-ind","");
    showError("Could not save route details. Please try again.");
  });
}

// ── HOW IT WORKS INTERACTIVE ─────────────────────────────
var hiwFlowData = {
  prepare: {
    title: "Prepare for a Climb",
    sub: "Use this before you commit to a route -- at the base, before you leave the ground.",
    steps: [
      {icon:"◉", label:"Breath check", text:"What is your breathing doing right now -- before you think about the route."},
      {icon:"◎", label:"Gut check", text:"What is your gut reporting. Settled, mild flutter, noticeable tension."},
      {icon:"⊙", label:"Body scan", text:"Head to toe. What are you already holding? Tension in shoulders, chest, core."},
      {icon:"◈", label:"Route context", text:"Style, experience, first time on this. The context that shapes the shift."},
      {icon:"◉", label:"Second check-in", text:"Breath and gut again -- after thinking through the route. The delta is the signal."},
      {icon:"◆", label:"Zone result", text:"Your specific somatic data mapped to a zone. Not a generic label."}
    ]
  },
  log: {
    title: "Log a Climb",
    sub: "Use this after you climb -- 60 seconds captures what happened and builds your picture.",
    steps: [
      {icon:"◈", label:"Grade + system", text:"Yosemite, Hueco, French, or UK Tech. Pick the grade you climbed."},
      {icon:"◎", label:"Terrain feature", text:"Slab, vertical, overhang, roof, arête, dihedral, crack. What the wall demanded."},
      {icon:"◆", label:"Sent or attempt", text:"No judgment either way. Attempt is data too."},
      {icon:"◉", label:"Go Deeper (optional)", text:"4 questions: breathing during, gut sensation, crux moment, body state. Maps to your zone."},
      {icon:"⊙", label:"Reflection", text:"Zone dot, session arc, terrain map update. Your picture grows."}
    ]
  }
};

function hiwZoneTog(id){
  var det=document.getElementById('hzd-'+id);
  var chev=document.getElementById('hzc-'+id);
  if(!det)return;
  var open=det.style.display!=='none';
  det.style.display=open?'none':'block';
  if(chev)chev.style.transform=open?'':'rotate(90deg)';
}

function hiwTog(id){
  var det=document.getElementById('hd-'+id);
  var chev=document.getElementById('hc-'+id);
  if(!det)return;
  var open=det.style.display!=='none';
  det.style.display=open?'none':'block';
  if(chev)chev.style.transform=open?'':'rotate(90deg)';
}

function hiwSelectFlow(flow) {
  var detail = document.getElementById('hiw-flow-detail');
  var detailContent = document.getElementById('hiw-flow-detail-content');
  var prepBox = document.getElementById('hiw-prepare-box');
  var logBox = document.getElementById('hiw-log-box');
  var prepSteps = document.getElementById('hiw-prepare-steps');
  var logSteps = document.getElementById('hiw-log-steps');
  var prepLine = document.getElementById('hiw-prep-line');
  var logLine = document.getElementById('hiw-log-line');

  var d = hiwFlowData[flow];
  var otherFlow = flow === 'prepare' ? 'log' : 'prepare';

  // Highlight selected, dim other
  if(prepBox) {
    prepBox.setAttribute('fill', flow==='prepare' ? 'rgba(232,118,58,.15)' : 'var(--surface2)');
    prepBox.setAttribute('stroke', flow==='prepare' ? '#e8763a' : 'var(--border2)');
  }
  if(logBox) {
    logBox.setAttribute('fill', flow==='log' ? 'rgba(232,118,58,.15)' : 'var(--surface2)');
    logBox.setAttribute('stroke', flow==='log' ? '#e8763a' : 'var(--border2)');
  }

  // Show/hide step bubbles
  if(prepSteps) prepSteps.style.display = flow==='prepare' ? 'block' : 'none';
  if(logSteps) logSteps.style.display = flow==='log' ? 'block' : 'none';

  // Brighten relevant line
  if(prepLine) prepLine.setAttribute('stroke', flow==='prepare' ? 'rgba(232,118,58,.8)' : 'rgba(232,118,58,.2)');
  if(logLine) logLine.setAttribute('stroke', flow==='log' ? 'rgba(232,118,58,.8)' : 'rgba(232,118,58,.2)');

  // Build detail panel
  detailContent.innerHTML =
    '<div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:4px;">' + d.title + '</div>' +
    '<div style="font-size:14px;color:var(--muted);margin-bottom:16px;line-height:1.5;">' + d.sub + '</div>' +
    d.steps.map(function(s, i) {
      return '<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px;">' +
        '<div style="width:28px;height:28px;border-radius:8px;background:rgba(232,118,58,.12);border:1px solid rgba(232,118,58,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;color:#e8763a;font-weight:700;">' + (i+1) + '</div>' +
        '<div><div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:2px;">' + s.label + '</div>' +
        '<div style="font-size:13px;color:var(--muted);line-height:1.5;">' + s.text + '</div></div>' +
        '</div>';
    }).join('');

  detail.style.display = 'block';
}
