// ── PREPARE FLOW (index 35 logic preserved) ──────────────
var cur=0,baseScore=0,ctLabel="",isDeeper=false,pauseShown=false;
var ans={};
var bodyScanShown=false,lastZone="learning";
var prepSessId=null,procAns=null,procShown=false;
var bodyScanZones=[],bodyScanQ2=null,bodyScanQ3=null;

function startPrepare(){showScreen("screen-prepare");}
function startPrepareFlow(){cur=0;ans={};pauseShown=false;bodyScanShown=false;showScreen("s-assess");render();}
function dismissPause(){pauseShown=true;showScreen("s-assess");render();}

var PAUSE_AFTER=3;
var BV={effortless:1,slight:2,noticeable:3,restricted:4};
var GV={settled:1,mild:2,unsettled:3,knotted:4};
var BL={effortless:"effortless",slight:"slight effort",noticeable:"noticeable effort",restricted:"restricted"};
var GL={settled:"settled",mild:"mild sensation",unsettled:"unsettled",knotted:"knotted"};
var ZC_MAP={comfort:"#c8f55a",learning:"#f5a623",panic:"#ff5c3a"};

// ── ASSESSMENT QUESTIONS (from index 35) ─────────────────
var PAUSE_AFTER_Q=4;
var Qs=[
  {id:"breath1",phase:"somatic",text:"Notice your breathing right now.",hint:"Not what you think it should be -- what is it actually doing?",bodyNote:"Take a breath before you answer. Report what you observe -- not what you expect.",opts:[{l:"Effortless",s:"No effort needed",v:"effortless",sc:1},{l:"Slight effort",s:"Noticeable but manageable",v:"slight",sc:2},{l:"Noticeable effort",s:"Shortened or labored",v:"noticeable",sc:3},{l:"Restricted",s:"Tight or held",v:"restricted",sc:4}]},
  {id:"gut1",phase:"somatic",text:"Notice your gut right now.",hint:"Tightness, butterflies, pulling -- or neutral calm.",bodyNote:"Your gut is already reporting something. What is it?",opts:[{l:"Settled",s:"No sensation",v:"settled",sc:1},{l:"Mild sensation",s:"Butterflies or mild tightness",v:"mild",sc:2},{l:"Unsettled",s:"Noticeable tension",v:"unsettled",sc:3},{l:"Knotted",s:"Tight pulling sensation",v:"knotted",sc:4}]},
  {id:"style",phase:"context",ctx:true,text:"What are you climbing today?",hint:"",opts:[{l:"Top rope",s:"Protected from above",v:"Top rope",sc:0},{l:"Sport lead",s:"Clipping bolts",v:"Sport lead",sc:1},{l:"Trad lead",s:"Self-placed gear",v:"Trad lead",sc:2}]},
  {id:"experience",phase:"context",text:"How experienced are you in this terrain?",hint:"What you've physically done -- not what you know.",opts:[{l:"Extensive experience",s:"Done this many times",v:"extensive",sc:0},{l:"Some experience",s:"Done this a few times",v:"some",sc:1},{l:"Limited experience",s:"Once or twice",v:"limited",sc:2},{l:"First time",s:"No prior experience",v:"first",sc:3}]},
  {id:"route",phase:"context",text:"First time on this route or something similar?",hint:"Your experience on this specific route matters.",opts:[{l:"No -- I know this route",s:"Attempted before",v:"know",sc:0},{l:"Similar but not this one",s:"Comparable terrain",v:"similar",sc:1},{l:"Yes -- first attempt",s:"First time on this one",v:"first",sc:2}]},
  {id:"breath2",phase:"somatic2",text:"Notice your breathing again.",hint:"After thinking through this route -- what do you notice now?",bodyNote:"Take a breath before answering. Has anything shifted?",opts:[{l:"Effortless",s:"No effort needed",v:"effortless",sc:1},{l:"Slight effort",s:"Noticeable but manageable",v:"slight",sc:2},{l:"Noticeable effort",s:"Shortened or labored",v:"noticeable",sc:3},{l:"Restricted",s:"Tight or held",v:"restricted",sc:4}]},
  {id:"gut2",phase:"somatic2",text:"Notice your gut again.",hint:"Has anything shifted since the first gut check?",bodyNote:"This shift is the primary data this tool captures.",opts:[{l:"Settled",s:"No sensation",v:"settled",sc:1},{l:"Mild sensation",s:"Butterflies or mild tightness",v:"mild",sc:2},{l:"Unsettled",s:"Noticeable tension",v:"unsettled",sc:3},{l:"Knotted",s:"Tight pulling sensation",v:"knotted",sc:4}]},
  {id:"mental",phase:"context",text:"Mental state right now?",hint:"What's actually present -- not what should be.",opts:[{l:"Focused and present",v:"focused",sc:1},{l:"Energized",s:"Some activation",v:"energized",sc:2},{l:"Distracted or unsettled",v:"distracted",sc:3},{l:"Anxious",s:"Something feels off",v:"anxious",sc:4}]},
  {id:"motivation",phase:"context",text:"Why are you attempting this today?",hint:"Your actual motivation -- not what seems right.",opts:[{l:"Skill development",s:"Here to learn",v:"skill",sc:0},{l:"Performance goal",s:"Want to send",v:"performance",sc:1},{l:"Curiosity",s:"Want to see how it feels",v:"curiosity",sc:1},{l:"Unclear",s:"Drawn to it, unsure why",v:"unclear",sc:3}]}
];

var DQs=[
  {text:"How are you approaching this climb?",opts:[{l:"Onsight -- no prior beta",sc:2},{l:"Redpoint -- I know the moves",sc:0},{l:"Projecting -- still working it",sc:1},{l:"Following",sc:-1}]},
  {text:"Distance between bolts or gear placements?",opts:[{l:"Close -- short falls",sc:0},{l:"Normal spacing",sc:1},{l:"Spread out -- longer falls",sc:2},{l:"Significant runout",sc:3}]},
  {text:"The crux fall zone?",hint:"If you come off at the hardest point -- what does that fall look like?",opts:[{l:"Well protected -- clean fall",sc:0},{l:"Minor concern",sc:1},{l:"The fall at the crux concerns me",sc:2},{l:"The fall could be serious",sc:3}]},
  {text:"Visibility of protection from the ground?",opts:[{l:"Full visibility",sc:0},{l:"Mostly visible",sc:1},{l:"Limited visibility",sc:2}]},
  {text:"Swing or pendulum fall risk?",opts:[{l:"No swing risk -- straight line",sc:0},{l:"Minor deviation",sc:1},{l:"Traversing or roof -- swing is a factor",sc:2},{l:"Significant swing potential",sc:3}]},
  {text:"Physical state today?",hint:"Sleep, hydration, warmup.",opts:[{l:"Strong -- rested and warmed up",sc:0},{l:"Decent -- minor fatigue",sc:1},{l:"Below par -- tired",sc:2},{l:"Not great -- shouldn't push hard",sc:3}]},
  {text:"Partner dynamic today?",opts:[{l:"Neutral",sc:0},{l:"Supportive -- they match my pace",sc:0},{l:"Pushing -- their presence raises my effort",sc:1},{l:"Social pressure to perform",sc:2}]},
  {text:"Where in your session is this climb?",opts:[{l:"Fresh -- first or second route",sc:0},{l:"Mid-session -- well warmed up",sc:0},{l:"Later -- some fatigue",sc:1},{l:"End of session -- significantly fatigued",sc:2}]},
  {text:"Objective fall consequence?",hint:"Rate the route -- not your fear level.",opts:[{l:"Minimal",s:"Short falls, clean landing",sc:0},{l:"Moderate",s:"Falls manageable",sc:1},{l:"Significant",s:"Longer falls, elevated hazard",sc:2},{l:"Severe",s:"High fall distance, serious injury potential",sc:3}]},
  {text:"What would make this session worthwhile -- regardless of outcome?",hint:"Process, not outcome.",opts:[{l:"I climbed deliberately and stayed present",sc:0},{l:"I tried something that genuinely challenged me",sc:0},{l:"I learned something specific about my climbing",sc:0},{l:"I am focused on the send",sc:1}]}
];

var G={
  comfort_deep:{badge:"Comfort zone",bc:"z-comfort",heroB:"rgba(200,245,90,.05)",text:"Reported data places this well within current experience. Movement is familiar here. Passive repetition in the Comfort zone produces limited adaptation — but deliberate attention sharpens awareness even on known terrain. The edge is always available as a conscious step outward.",process:"Name one specific thing to sharpen awareness on — movement pattern, breath, or grip — rather than an outcome."},
  comfort_center:{badge:"Comfort zone",bc:"z-comfort",heroB:"rgba(200,245,90,.05)",text:"Reported data places this within current experience. Comfort zone sessions sharpen awareness when attention is deliberately directed. Without a specific focus, volume here produces limited transfer.",process:"Identify what you want to notice on this route before you leave the ground. Naming it sharpens the signal."},
  comfort_learning:{badge:"Comfort zone",bc:"z-comfort",heroB:"rgba(200,245,90,.05)",text:"Reported data places this near the Comfort/Learning fringe — the most productive zone for deliberate practice. Awareness is sharpening. This is where the edge begins to be exposed.",process:"Notice what you observe as you approach the route. Whatever you notice — or don't — is the data."},
  learning_comfort:{badge:"Learning zone",bc:"z-learning",heroB:"rgba(245,166,35,.05)",text:"Reported data places this at the Learning fringe -- where perceived demand slightly exceeds current experience. This is the optimal range for adaptation. Skill acquisition is most likely here.",process:"Identify the most likely challenge point. What do you notice when you consider it right now?"},
  learning_center:{badge:"Learning zone",bc:"z-learning",heroB:"rgba(245,166,35,.05)",text:"Reported data places activation within the optimal learning window. Demand is high enough to require full engagement -- not so high that judgment narrows. This is where the most productive climbing happens.",process:"Determine your response strategy for the anticipated crux before leaving the ground. Commit to it."},
  learning_panic:{badge:"Learning zone",bc:"z-learning",heroB:"rgba(245,166,35,.05)",text:"Reported data places activation near the Learning/Panic boundary. You are at the edge of the productive window. Attention is heightened -- and judgment can start to narrow from here. A conscious decision about engagement is the practice.",process:"Identify the primary risk factor. Make a deliberate decision about proceeding before you leave the ground -- not on the wall."},
  panic_learning:{badge:"Panic zone",bc:"z-panic",heroB:"rgba(255,92,58,.05)",text:"Reported data indicates perceived demand is outpacing current experience. At this activation level, fine motor control narrows, working memory is reduced, and new skill encoding is impaired. These are physiological responses -- not indicators of capability. If you did not choose to be here, that is worth noticing.",process:"Is this a conscious risk decision, or did you arrive here reactively? The distinction matters for what you take from this session."},
  panic_center:{badge:"Panic zone",bc:"z-panic",heroB:"rgba(255,92,58,.05)",text:"Reported data indicates perceived demand exceeded current experience. At this activation level, conditions for skill acquisition are limited for most climbers — though responses vary. Repeated unprocessed Panic experiences can reinforce avoidance patterns over time. The edge has been exposed. What you do with that is the decision.",process:"If proceeding -- identify one thing you can control right now. If stepping back -- that is a conscious risk decision, not a failure."},
  panic_deep:{badge:"Panic zone",bc:"z-panic",heroB:"rgba(255,92,58,.05)",text:"Reported data indicates a substantial gap between route demands and current experience. At this level, conditions for skill acquisition are significantly limited for most climbers. A learning-zone variant is likely to produce more adaptation. If you choose to proceed, do so with full awareness of what your body is reporting -- that awareness is what separates conscious risk-taking from reactive exposure.",process:"Notice your breathing before anything else. What do you observe? That signal — if present — arrived before this question did."}
};

function getZone(p){return p<=0.38?"comfort":p<=0.65?"learning":"panic";}
function getGK(p){if(p<0.20)return"comfort_deep";if(p<0.32)return"comfort_center";if(p<0.42)return"comfort_learning";if(p<0.52)return"learning_comfort";if(p<0.62)return"learning_center";if(p<0.72)return"learning_panic";if(p<0.82)return"panic_learning";if(p<0.91)return"panic_center";return"panic_deep";}
function dotPos(p){var r=6+p*82;r=Math.max(6,Math.min(82,r));var a=Math.random()*2*Math.PI;return{x:100+r*Math.cos(a),y:100+r*Math.sin(a)};}

function render(){
  var q=Qs[cur],tot=Qs.length;
  document.getElementById("prog").style.width=((cur/tot)*100)+"%";
  var pm={somatic:"pt-somatic",somatic2:"pt-somatic",context:"pt-context"};
  var pt={somatic:"Somatic check-in",somatic2:"Somatic check-in",context:"Context"};
  document.getElementById("phase-lbl").innerHTML="Question "+(cur+1)+" of "+tot+' <span class="phase-tag '+(pm[q.phase]||"pt-context")+'">'+(pt[q.phase]||"Context")+"</span>";
  document.getElementById("q-text").textContent=q.text;
  document.getElementById("q-hint").textContent=q.hint||"";
  var bn=document.getElementById("q-body-note");if(q.bodyNote){bn.textContent=q.bodyNote;bn.style.display="block";}else bn.style.display="none";
  document.getElementById("btn-back").style.opacity=cur===0?"0":"1";
  document.getElementById("btn-back").disabled=cur===0;
  document.getElementById("btn-next").textContent=cur===Qs.length-1?"See result":"Continue";
  document.getElementById("btn-next").disabled=!ans[q.id];
  var wrap=document.getElementById("q-wrap");wrap.innerHTML="";
  var c=document.createElement("div");c.className="options";
  q.opts.forEach(opt=>{
    var el=document.createElement("div");el.className="option"+(ans[q.id]===opt.v?" selected":"");
    el.innerHTML="<div class='opt-marker'></div><div class='opt-label'>"+opt.l+(opt.s?"<div class='opt-sub'>"+opt.s+"</div>":"")+"</div>";
    el.onclick=()=>{ans[q.id]=opt.v;if(q.ctx)ctLabel=opt.v;render();};
    c.appendChild(el);
  });
  wrap.appendChild(c);
}
function goBack(){if(cur>0){cur--;render();}}
function goNext(){
  if(!ans[Qs[cur].id])return;
  if(cur===1&&!bodyScanShown){bodyScanShown=true;showBodyScan();return;}
  if(cur===PAUSE_AFTER_Q&&!pauseShown){showScreen("s-pause");return;}
  if(cur<Qs.length-1){cur++;render();}else computeResult(false);
}

// Body scan
function showBodyScan(){showScreen("s-body-scan");bodyScanZones=[];bodyScanQ2=null;bodyScanQ3=null;updateScanUI();}
function scanToggle(zone){
  var idx=bodyScanZones.indexOf(zone);
  if(idx>=0)bodyScanZones.splice(idx,1);else bodyScanZones.push(zone);
  ["head","shoulders","chest","core","lower"].forEach(function(z){
    var row=document.getElementById("sz-"+z);
    if(!row)return;
    var on=bodyScanZones.includes(z);
    row.style.background=on?"rgba(245,166,35,.1)":"var(--surface2)";
    row.style.borderColor=on?"rgba(245,166,35,.55)":"var(--border)";
    var check=row.querySelector(".sz-check");
    var name=row.querySelector(".sz-name");
    if(check){check.style.background=on?"#f5a623":"transparent";check.style.borderColor=on?"#f5a623":"var(--border2)";check.innerHTML=on?"<svg width='10' height='10' viewBox='0 0 10 10' fill='none'><polyline points='1.5,5 4,7.5 8.5,2.5' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>":"";}
    if(name)name.style.color=on?"#f5a623":"var(--text)";
  });
  updateScanUI();
}
function updateScanUI(){
  var sel=document.getElementById("scan-selections");
  if(sel)sel.textContent=bodyScanZones.length?bodyScanZones.join(", "):"Nothing selected";
  var q2=document.getElementById("scan-q2-wrap");
  if(q2)q2.style.display=bodyScanZones.length>0?"block":"none";
  if(bodyScanZones.length>0){
    var q2opts=document.getElementById("scan-q2-opts");
    if(!q2opts.children.length){
      var opts2=["Tension / holding","Soreness","Tightness","Fatigue","Something else","Nothing specific"];
      var c2=document.createElement("div");c2.className="options";c2.style.gap="6px";
      opts2.forEach(function(o2txt){
        var el2=document.createElement("div");el2.className="option";el2.style.padding="10px 14px";
        el2.innerHTML="<div class='opt-marker'></div><div class='opt-label' style='font-size:13px'>"+o2txt+"</div>";
        el2.onclick=function(){
          document.querySelectorAll("#scan-q2-opts .option").forEach(function(x){x.classList.remove("selected");});
          el2.classList.add("selected");bodyScanQ2=o2txt;
          var q3w=document.getElementById("scan-q3-wrap");
          if(q3w)q3w.style.display=(o2txt==="Nothing specific")?"none":"block";
          if(o2txt!=="Nothing specific"&&!document.getElementById("scan-q3-opts").children.length){
            var opts3=["Yes -- this is how I usually feel","Somewhat -- slightly more than usual","No -- this is new today","Not sure"];
            var c3=document.createElement("div");c3.className="options";c3.style.gap="6px";
            opts3.forEach(function(o3txt){
              var el3=document.createElement("div");el3.className="option";el3.style.padding="10px 14px";
              el3.innerHTML="<div class='opt-marker'></div><div class='opt-label' style='font-size:13px'>"+o3txt+"</div>";
              el3.onclick=function(){
                document.querySelectorAll("#scan-q3-opts .option").forEach(function(x){x.classList.remove("selected");});
                el3.classList.add("selected");bodyScanQ3=o3txt;updateScanContinue();
              };c3.appendChild(el3);
            });
            document.getElementById("scan-q3-opts").appendChild(c3);
          }
          updateScanContinue();
        };c2.appendChild(el2);
      });
      q2opts.appendChild(c2);
    }
  }
  if(bodyScanQ2&&bodyScanQ2!=="Nothing specific"){
    var q3el=document.getElementById("scan-q3-wrap");if(q3el)q3el.style.display="block";
  }
  updateScanContinue();
}
function updateScanContinue(){
  var btn=document.getElementById("scan-continue");
  var nothingSpecific=bodyScanQ2==="Nothing specific";
  if(btn)btn.disabled=!(bodyScanZones.length===0||(bodyScanQ2&&(bodyScanQ3||nothingSpecific)));
  if(btn&&bodyScanZones.length===0)btn.disabled=false;
}
function skipBodyScan(){window.bodyScanData=null;cur++;render();showScreen("s-assess");}
function continueFromScan(){
  window.bodyScanData=bodyScanZones.length?{zones:bodyScanZones,sensation:bodyScanQ2,typical:bodyScanQ3}:null;
  cur++;render();showScreen("s-assess");
}

function computeResult(deeper){
  isDeeper=deeper;
  var cs=0;Qs.forEach(q=>{var o=q.opts.find(o=>o.v===ans[q.id]);if(o)cs+=o.sc||0;});
  var b1v=BV[ans.breath1]||2,g1v=GV[ans.gut1]||2;
  cs-=(b1v-1)+(g1v-1);
  var maxCtx=14,sBase=((b1v-1)+(g1v-1))/6;
  var fp=Math.max(0,Math.min(1,(Math.max(0,cs)/maxCtx)*0.6+sBase*0.4));
  baseScore=cs;
  var fz=getZone(fp),gk=getGK(fp),cp=fp;
  lastZone=fz;
  if(deeper){var ds=deepAns.reduce((s,a,i)=>s+(a!==null?DQs[i].opts[a].sc:0),0),maxD=DQs.reduce((s,q)=>s+Math.max(...q.opts.map(o=>o.sc)),0);cp=fp*0.55+(ds/Math.max(maxD,1))*0.45;fz=getZone(cp);gk=getGK(cp);}
  if(!G[gk])gk=fz+"_center";
  var g=G[gk];
  var b2v=BV[ans.breath2]||2,g2v=GV[ans.gut2]||2,bd=b2v-b1v,gd=g2v-g1v,td=bd+gd;
  var bl1=BL[ans.breath1]||"--",bl2=BL[ans.breath2]||"--",gl1=GL[ans.gut1]||"--",gl2=GL[ans.gut2]||"--";
  var dc=document.getElementById("delta-card");
  dc.className="delta-card "+(td>=2?"delta-shifted":td>=1?"delta-mild":"delta-stable");
  document.getElementById("delta-eyebrow").textContent=td>=2?"Significant somatic shift":td>=1?"Mild somatic shift":td<0?"Somatic state settled":"Somatic state consistent";
  document.getElementById("delta-before").textContent="Breath: "+bl1+" . Gut: "+gl1;
  document.getElementById("delta-after").textContent="Breath: "+bl2+" . Gut: "+gl2;
  var hl="",db_="";
  if(td>=2){hl="Your body shifted meaningfully after thinking through this route.";db_=bd>=2&&gd>=2?"Both signals tightened -- breathing moved from "+bl1+" to "+bl2+", gut from "+gl1+" to "+gl2+". When both systems shift together, the body is registering something specific about this route.":bd>=2?"Breathing moved from "+bl1+" to "+bl2+". Breath is one of the first systems to respond to perceived threat.":"Gut sensation moved from "+gl1+" to "+gl2+". Gut sensation is a pre-decision somatic signal (Damasio, 1994) -- not a metaphor.";}
  else if(td>=1){hl="A small shift occurred after thinking through this route.";db_="Signals moved slightly -- "+( bd>0?"breathing from "+bl1+" to "+bl2+". ":"")+(gd>0?"Gut from "+gl1+" to "+gl2+".":"")+" Mild shifts can be early signals before fuller activation.";}
  else if(td<0){hl="Your signals softened after thinking through this route.";db_=(bd<0?"Breathing eased from "+bl1+" to "+bl2+". ":"")+(gd<0?"Gut settled from "+gl1+" to "+gl2+". ":"")+"Some climbers find that thinking through a route reduces activation once familiarity registers.";}
  else{hl="No shift between your first and second check-in.";db_="Breath: "+bl2+". Gut: "+gl2+". Consistent somatic state can indicate clarity about the route -- or that the route hasn't fully registered yet.";}
  document.getElementById("delta-headline").textContent=hl;
  document.getElementById("delta-body").textContent=db_;
  document.getElementById("zone-badge").textContent=g.badge;
  document.getElementById("zone-badge").className="zone-badge "+g.bc;
  document.getElementById("result-hero").style.background=g.heroB;
  var ct=document.getElementById("ct-tag-result");ct.textContent=ctLabel;ct.style.display=ctLabel?"block":"none";
  document.getElementById("res-subtitle").textContent=[ans.experience,ans.mental].filter(Boolean).join(" . ");
  var raCta=document.getElementById("route-analysis-cta");
  if(raCta){var z=getZone(fp);raCta.style.display=(z==="panic"||z==="learning_panic")?"block":"none";}
  document.getElementById("refined-lbl").style.display=deeper?"inline":"none";
  document.getElementById("small-step").style.display=fz==="panic"?"block":"none";
  document.getElementById("deeper-gate").style.display=deeper?"none":"block";
  document.getElementById("g-text").textContent=g.text;
  document.getElementById("g-process").textContent=g.process;
  // Body scan note
  var bsn=document.getElementById("body-scan-note");
  if(window.bodyScanData&&bsn){bsn.style.display="block";bsn.textContent="Body scan: "+window.bodyScanData.zones.join(", ")+". Noticing: "+window.bodyScanData.sensation+". Typical: "+window.bodyScanData.typical+".";}
  else if(bsn)bsn.style.display="none";
  showScreen("s-result");
  // Zone dot animation
  var col=ZC_MAP[fz],pt=dotPos(cp);
  setTimeout(()=>{
    var d=document.getElementById("zone-dot"),r=document.getElementById("zone-dot-ring");
    if(d){d.setAttribute("cx",pt.x);d.setAttribute("cy",pt.y);d.setAttribute("fill",col);d.setAttribute("opacity","1");}
    if(r){r.setAttribute("cx",pt.x);r.setAttribute("cy",pt.y);r.setAttribute("stroke",col);r.setAttribute("opacity",".3");}
  },150);
  // Save to Supabase
  var si=document.getElementById("save-ind");if(si)si.textContent="Saving...";
  sbI("sessions",{device_id:DID,is_checkin:true,climbing_type:ctLabel,baseline_score:baseScore,baseline_zone:getZone(fp),did_go_deeper:deeper,deeper_zone:deeper?fz:null,breathing_baseline:ans.breath1,gut_baseline:ans.gut1,breathing_after:ans.breath2,gut_after:ans.gut2,session_hour:new Date().getHours(),body_scan_zones:window.bodyScanData?window.bodyScanData.zones.join(","):null,body_scan_sensation:window.bodyScanData?window.bodyScanData.sensation:null,body_scan_typical:window.bodyScanData?window.bodyScanData.typical:null}).then(saved=>{
    if(saved&&saved.id){
      prepSessId=saved.id;
      if(si)si.textContent="";
      loadHomeInsight();
    } else if(si)si.textContent="";
    setTimeout(function(){if(si)si.textContent="";},2500);
  });
}

// Route analysis — visual interactive
var deepCur=0, deepAns=[];
function startDeeperPrepare(){
  deepCur=0;
  deepAns=new Array(DQs.length).fill(null);
  showScreen("s-deeper");
  renderDeeper();
}

function buildDots(){
  var el=document.getElementById("deep-dots");
  if(!el)return;
  el.innerHTML=DQs.map(function(_,i){
    var active=i===deepCur;
    var done=deepAns[i]!==null;
    return '<div style="height:3px;border-radius:99px;flex:1;background:'+(active?"#f5a623":done?"rgba(245,166,35,.4)":"rgba(255,255,255,.1)")+';transition:all .2s;"></div>';
  }).join("");
}

// SVG illustrations per question
var DQ_VISUALS=[
  // Q1 Approach — familiarity spectrum
  function(sel){
    var opts=["onsight","following","projecting","redpoint"];
    var w=85;
    var svgW=360;
    var items=opts.map(function(o,i){
      var x=10+i*(w+3);
      var isActive=sel===i;
      return '<rect x="'+x+'" y="8" width="'+w+'" height="36" rx="8" fill="'+(isActive?"rgba(245,166,35,.18)":"rgba(255,255,255,.03)")+'" stroke="'+(isActive?"#f5a623":"rgba(255,255,255,.1)")+'" stroke-width="'+(isActive?"2":"1.5")+'" style="cursor:pointer" onclick="deepSelVisual('+i+')"/>'+
             '<text x="'+(x+w/2)+'" y="30" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="11" font-weight="'+(isActive?"700":"400")+'" fill="'+(isActive?"#f5a623":"rgba(255,255,255,.4")+')">'+o+'</text>';
    });
    return '<svg width="100%" viewBox="0 0 360 54" fill="none">'+items.join("")+'<text x="10" y="52" font-family="Space Grotesk,sans-serif" font-size="9" fill="rgba(255,255,255,.15)" letter-spacing=".06em">NO BETA</text><text x="350" y="52" text-anchor="end" font-family="Space Grotesk,sans-serif" font-size="9" fill="rgba(255,255,255,.15)" letter-spacing=".06em">FULL BETA</text></svg>';
  },
  // Q2 Bolt spacing — walls
  function(sel){
    var configs=[[18,32,46,60,74],[18,40,62],[18,52],[18,74]];
    var labels=["close","normal","spread","runout"];
    var colors=["rgba(126,200,122,.6)","rgba(245,166,35,.6)","rgba(232,118,58,.6)","rgba(232,68,68,.7)"];
    var items=configs.map(function(bolts,i){
      var x=10+i*87;
      var isActive=sel===i;
      var boltDots=bolts.map(function(y){return '<circle cx="'+(x+20)+'" cy="'+y+'" r="4" fill="'+colors[i]+'"/>';}).join("");
      return '<rect x="'+x+'" y="5" width="74" height="82" rx="8" fill="'+(isActive?"rgba(245,166,35,.08)":"rgba(255,255,255,.02")+'" stroke="'+(isActive?"#f5a623":"rgba(255,255,255,.08)")+'" stroke-width="'+(isActive?"2":"1")+'" style="cursor:pointer" onclick="deepSelVisual('+i+')"/>'+
             '<line x1="'+(x+20)+'" y1="10" x2="'+(x+20)+'" y2="80" stroke="rgba(255,255,255,.15)" stroke-width="2" stroke-linecap="round"/>'+
             boltDots+
             '<text x="'+(x+37)+'" y="92" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="9" fill="'+(isActive?"#f5a623":"rgba(255,255,255,.3)")+'" font-weight="'+(isActive?"700":"400")+'">'+labels[i]+'</text>';
    });
    return '<svg width="100%" viewBox="0 0 360 100" fill="none">'+items.join("")+'</svg>';
  },
  // Q3 Crux fall — arcs
  function(sel){
    var arcs=[
      {d:"M50 16 Q78 34 86 60",cx:86,cy:60,label:"clean",col:"rgba(126,200,122,.5)"},
      {d:"M50 16 Q115 40 135 72",cx:135,cy:72,label:"minor",col:"rgba(245,166,35,.5)"},
      {d:"M50 16 Q185 48 218 80",cx:218,cy:80,label:"concerns me",col:"rgba(232,118,58,.5)"},
      {d:"M50 16 Q260 56 308 88",cx:308,cy:88,label:"serious",col:"rgba(232,68,68,.6)"}
    ];
    var wall='<line x1="50" y1="5" x2="50" y2="95" stroke="rgba(255,255,255,.15)" stroke-width="2" stroke-linecap="round"/><circle cx="50" cy="26" r="4" fill="rgba(255,255,255,.25)"/><circle cx="50" cy="10" r="6" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.5"/>';
    var items=arcs.map(function(a,i){
      var isActive=sel===i;
      return '<g style="cursor:pointer" onclick="deepSelVisual('+i+')">'+
             '<path d="'+a.d+'" fill="none" stroke="'+(isActive?"#f5a623":a.col)+'" stroke-width="'+(isActive?"3":"2")+'" stroke-linecap="round" '+(isActive?"":"stroke-dasharray="+(i>1?"4,3":"none"))+'/>' +
             '<circle cx="'+a.cx+'" cy="'+a.cy+'" r="'+(isActive?"9":"6")+'" fill="'+(isActive?"rgba(245,166,35,.2)":"rgba(255,255,255,.05)")+'" stroke="'+(isActive?"#f5a623":a.col)+'" stroke-width="'+(isActive?"2":"1.5")+'"/>'+
             '<text x="'+(a.cx+(i<2?14:-2))+'" y="'+(a.cy+4)+'" text-anchor="'+(i>=2?"end":"start")+'" font-family="Space Grotesk,sans-serif" font-size="10" fill="'+(isActive?"#f5a623":a.col)+'">'+a.label+'</text>'+
             '</g>';
    });
    return '<svg width="100%" viewBox="0 0 360 100" fill="none">'+wall+items.join("")+'</svg>';
  },
  // Q4 Visibility — eye states
  function(sel){
    var states=[
      {label:"full",sub:"all bolts visible"},
      {label:"mostly",sub:"some hidden"},
      {label:"limited",sub:"can't see"}
    ];
    var items=states.map(function(s,i){
      var x=10+i*118;
      var isActive=sel===i;
      var eyeOpacity=1-i*0.3;
      return '<g style="cursor:pointer" onclick="deepSelVisual('+i+')">'+
             '<rect x="'+x+'" y="8" width="108" height="62" rx="10" fill="'+(isActive?"rgba(245,166,35,.1)":"rgba(255,255,255,.02)")+'" stroke="'+(isActive?"#f5a623":"rgba(255,255,255,.08)")+'" stroke-width="'+(isActive?"2":"1.5")+'"/>'+
             '<path d="'+(x+14)+' 38 Q'+(x+54)+' '+(38-18*eyeOpacity)+' '+(x+94)+' 38 Q'+(x+54)+' '+(38+18*eyeOpacity)+' '+(x+14)+' 38Z" fill="none" stroke="'+(isActive?"#f5a623":"rgba(255,255,255,.2)")+'" stroke-width="1.5"/>'+
             '<circle cx="'+(x+54)+'" cy="38" r="'+(8*eyeOpacity+2)+'" fill="'+(isActive?"rgba(245,166,35,.2)":"rgba(255,255,255,.08)")+'" stroke="'+(isActive?"#f5a623":"rgba(255,255,255,.2)")+'" stroke-width="1.2"/>'+
             '<circle cx="'+(x+54)+'" cy="38" r="'+(3*eyeOpacity)+'" fill="'+(isActive?"#f5a623":"rgba(255,255,255,.3)")+'"/>'+
             '<text x="'+(x+54)+'" y="81" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="10" fill="'+(isActive?"#f5a623":"rgba(255,255,255,.3)")+'" font-weight="'+(isActive?"700":"400")+'">'+s.label+'</text>'+
             '</g>';
    });
    return '<svg width="100%" viewBox="0 0 360 88" fill="none">'+items.join("")+'</svg>';
  },
  // Q5 Swing — fall lines
  function(sel){
    var lines=[
      {path:"M180 12 L180 80",label:"straight",lx:196,ly:80},
      {path:"M180 12 Q205 46 215 80",label:"minor",lx:230,ly:80},
      {path:"M180 12 Q240 50 268 80",label:"traverse",lx:280,ly:78},
      {path:"M180 12 Q85 34 52 76",label:"swing",lx:16,ly:74}
    ];
    var anchor='<circle cx="180" cy="8" r="5" fill="rgba(255,255,255,.2)"/>';
    var items=lines.map(function(l,i){
      var isActive=sel===i;
      return '<g style="cursor:pointer" onclick="deepSelVisual('+i+')">'+
             '<path d="'+l.path+'" fill="none" stroke="'+(isActive?"#f5a623":"rgba(255,255,255,.2)")+'" stroke-width="'+(isActive?"3":"2")+'" stroke-linecap="round"/>'+
             '<text x="'+l.lx+'" y="'+l.ly+'" font-family="Space Grotesk,sans-serif" font-size="10" fill="'+(isActive?"#f5a623":"rgba(255,255,255,.3)")+'" font-weight="'+(isActive?"700":"400")+'">'+l.label+'</text>'+
             '</g>';
    });
    return '<svg width="100%" viewBox="0 0 360 90" fill="none">'+anchor+items.join("")+'</svg>';
  },
  // Q6 Physical state — tap segment of bar
  function(sel){
    var segs=[
      {label:"strong",sublabel:"rested",col:"rgba(126,200,122,"},
      {label:"decent",sublabel:"minor fatigue",col:"rgba(245,166,35,"},
      {label:"below par",sublabel:"tired",col:"rgba(232,118,58,"},
      {label:"not great",sublabel:"depleted",col:"rgba(232,68,68,"}
    ];
    var items=segs.map(function(s,i){
      var x=20+i*80;
      var isActive=sel===i;
      var lx=20+i*80+80/2;
      return '<g style="cursor:pointer" onclick="deepSelVisual('+i+')">'+
             '<rect x="'+x+'" y="20" width="80" height="28" fill="'+(isActive?s.col+"0.25)":s.col+"0.08)")+'" stroke="'+(isActive?s.col+"0.7)":"none")+'" stroke-width="1.5"/>'+
             '<text x="'+lx+'" y="38" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="11" fill="'+(isActive?"#f5a623":s.col+"0.5)")+'" font-weight="'+(isActive?"700":"400")+'">'+s.label+'</text>'+
             '<text x="'+lx+'" y="62" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="9" fill="'+(isActive?"rgba(245,166,35,.6)":"rgba(255,255,255,.2)")+'">'+(isActive?s.sublabel:"")+'</text>'+
             '</g>';
    });
    var dividers='<line x1="100" y1="20" x2="100" y2="48" stroke="rgba(0,0,0,.3)" stroke-width="1"/><line x1="180" y1="20" x2="180" y2="48" stroke="rgba(0,0,0,.3)" stroke-width="1"/><line x1="260" y1="20" x2="260" y2="48" stroke="rgba(0,0,0,.3)" stroke-width="1"/>';
    var bar='<rect x="20" y="20" width="320" height="28" rx="14" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="1.5"/>';
    return '<svg width="100%" viewBox="0 0 360 70" fill="none">'+bar+items.join("")+dividers+'</svg>';
  },
  // Q7 Partner — tap the dynamic
  function(sel){
    var dynamics=[
      {label:"neutral",arrow:""},
      {label:"supportive",arrow:'<path d="M130 32 Q135 26 140 32" fill="none" stroke="rgba(126,200,122,.6)" stroke-width="1.5" stroke-linecap="round"/>'},
      {label:"pushing",arrow:'<path d="M226 28 L218 32 L226 36" fill="none" stroke="rgba(245,166,35,.6)" stroke-width="1.5" stroke-linecap="round"/>'},
      {label:"pressure",arrow:'<path d="M305 26 L313 32 L305 38" fill="none" stroke="rgba(232,68,68,.5)" stroke-width="1.5" stroke-linecap="round"/><path d="M311 26 L317 32 L311 38" fill="none" stroke="rgba(232,68,68,.35)" stroke-width="1.5" stroke-linecap="round"/>'}
    ];
    var items=dynamics.map(function(d,i){
      var x=8+i*88;
      var isActive=sel===i;
      var c1x=x+24, c2x=x+58, cy=32;
      return '<g style="cursor:pointer" onclick="deepSelVisual('+i+')">'+
             '<rect x="'+x+'" y="8" width="80" height="58" rx="10" fill="'+(isActive?"rgba(245,166,35,.08)":"rgba(255,255,255,.02)")+'" stroke="'+(isActive?"#f5a623":"rgba(255,255,255,.07)")+'" stroke-width="'+(isActive?"2":"1.5")+'"/>'+
             '<circle cx="'+c1x+'" cy="'+cy+'" r="10" fill="none" stroke="'+(isActive?"#f5a623":"rgba(255,255,255,.25)")+'" stroke-width="1.5"/>'+
             '<circle cx="'+c2x+'" cy="'+cy+'" r="10" fill="none" stroke="'+(isActive?"rgba(245,166,35,.5)":"rgba(255,255,255,.2)")+'" stroke-width="1.5"/>'+
             '<line x1="'+(c1x+10)+'" y1="'+cy+'" x2="'+(c2x-10)+'" y2="'+cy+'" stroke="rgba(255,255,255,.12)" stroke-width="1"/>'+
             d.arrow+
             '<text x="'+(x+40)+'" y="75" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="9" fill="'+(isActive?"#f5a623":"rgba(255,255,255,.3)")+'" font-weight="'+(isActive?"700":"400")+'">'+d.label+'</text>'+
             '</g>';
    });
    return '<svg width="100%" viewBox="0 0 360 82" fill="none">'+items.join("")+'</svg>';
  },
  // Q8 Session position — tap the timeline dot
  function(sel){
    var pts=[
      {cx:30,label:"fresh",col:"rgba(126,200,122,"},
      {cx:130,label:"warmed",col:"rgba(126,200,122,"},
      {cx:230,label:"later",col:"rgba(245,166,35,"},
      {cx:330,label:"end",col:"rgba(232,68,68,"}
    ];
    var line='<line x1="30" y1="32" x2="330" y2="32" stroke="rgba(255,255,255,.07)" stroke-width="2" stroke-linecap="round"/>';
    var fatigue='<path d="M30 27 Q130 20 230 25 Q280 29 330 36" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="8" stroke-linecap="round"/>';
    var items=pts.map(function(p,i){
      var isActive=sel===i;
      return '<g style="cursor:pointer" onclick="deepSelVisual('+i+')">'+
             '<circle cx="'+p.cx+'" cy="32" r="22" fill="transparent"/>'+
             '<circle cx="'+p.cx+'" cy="32" r="'+(isActive?"12":"8")+'" fill="'+(isActive?"rgba(245,166,35,.2)":p.col+"0.08)")+'" stroke="'+(isActive?"#f5a623":p.col+"0.4)")+'" stroke-width="'+(isActive?"2":"1.5")+'"/>'+
             '<text x="'+p.cx+'" y="58" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="9" fill="'+(isActive?"#f5a623":"rgba(255,255,255,.3)")+'" font-weight="'+(isActive?"700":"400")+'">'+p.label+'</text>'+
             '</g>';
    });
    return '<svg width="100%" viewBox="0 0 360 68" fill="none">'+line+fatigue+items.join("")+'</svg>';
  },
  // Q9 Consequence — rising bars
  function(sel){
    var bars=[
      {x:20,h:18,label:"minimal",sub:"clean falls",col:"rgba(126,200,122,"},
      {x:100,h:30,label:"moderate",sub:"manageable",col:"rgba(245,166,35,"},
      {x:196,h:46,label:"significant",sub:"longer falls",col:"rgba(232,118,58,"},
      {x:278,h:62,label:"severe",sub:"serious risk",col:"rgba(232,68,68,"}
    ];
    var baseline='<line x1="10" y1="68" x2="350" y2="68" stroke="rgba(255,255,255,.06)" stroke-width="1"/>';
    var items=bars.map(function(b,i){
      var isActive=sel===i;
      var barW=72, y=68-b.h;
      return '<g style="cursor:pointer" onclick="deepSelVisual('+i+')">'+
             '<rect x="'+b.x+'" y="'+y+'" width="'+barW+'" height="'+b.h+'" rx="4" fill="'+(isActive?b.col+"0.3)":b.col+"0.15)")+'" stroke="'+(isActive?"#f5a623":b.col+"0.45)")+'" stroke-width="'+(isActive?"2":"1.5")+'"/>'+
             '<text x="'+(b.x+barW/2)+'" y="80" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="9" fill="'+(isActive?"#f5a623":"rgba(255,255,255,.3)")+'" font-weight="'+(isActive?"700":"400")+'">'+b.label+'</text>'+
             '<text x="'+(b.x+barW/2)+'" y="91" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="8" fill="'+(isActive?"rgba(245,166,35,.6)":"rgba(255,255,255,.18)")+'">'+b.sub+'</text>'+
             '</g>';
    });
    return '<svg width="100%" viewBox="0 0 360 96" fill="none">'+baseline+items.join("")+'</svg>';
  },
  // Q10 Intention — all equal weight
  function(sel){
    var opts=[
      {label:"I climbed deliberately and stayed present.",sub:"process · attention · noticing"},
      {label:"I tried something that genuinely challenged me.",sub:"growth · edge · chosen"},
      {label:"I learned something specific about my climbing.",sub:"skill · insight · deliberate practice"},
      {label:"I sent it — the outcome is what I came for.",sub:"performance · result · target"}
    ];
    var items=opts.map(function(o,i){
      var y=8+i*52;
      var isActive=sel===i;
      return '<g style="cursor:pointer" onclick="deepSelVisual('+i+')">'+
             '<rect x="8" y="'+y+'" width="344" height="46" rx="10" fill="'+(isActive?"rgba(245,166,35,.1)":"rgba(255,255,255,.03)")+'" stroke="'+(isActive?"#f5a623":"rgba(255,255,255,.1)")+'" stroke-width="'+(isActive?"2":"1.5")+'"/>'+
             '<circle cx="28" cy="'+(y+23)+'" r="7" fill="'+(isActive?"rgba(245,166,35,.2)":"rgba(255,255,255,.06)")+'" stroke="'+(isActive?"#f5a623":"rgba(255,255,255,.15)")+'" stroke-width="1.2"/>'+
             '<text x="44" y="'+(y+19)+'" font-family="Space Grotesk,sans-serif" font-size="12" font-weight="600" fill="'+(isActive?"#f5a623":"rgba(255,255,255,.75)")+'">'+o.label+'</text>'+
             '<text x="44" y="'+(y+34)+'" font-family="Space Grotesk,sans-serif" font-size="10" fill="'+(isActive?"rgba(245,166,35,.5)":"rgba(255,255,255,.28)")+'">'+o.sub+'</text>'+
             '</g>';
    });
    return '<svg width="100%" viewBox="0 0 360 218" fill="none">'+items.join("")+'</svg>';
  }
];

function deepSelVisual(i){
  deepAns[deepCur]=i;
  renderDeeper();
}

function renderDeeper(){
  var q=DQs[deepCur];
  if(!q)return;
  document.getElementById("deep-phase-lbl").textContent="Route Analysis";
  document.getElementById("deep-step-lbl").textContent=(deepCur+1)+" of "+DQs.length;
  document.getElementById("deep-q-text").textContent=q.text;
  document.getElementById("deep-q-hint").textContent=q.hint||"";
  document.getElementById("deep-next").disabled=deepAns[deepCur]===null;
  // Progress dots
  buildDots();
  // Visual illustration
  var vis=document.getElementById("deep-visual");
  if(vis&&DQ_VISUALS[deepCur]){
    vis.innerHTML=DQ_VISUALS[deepCur](deepAns[deepCur]);
  }
  // No separate text options needed — visual IS the answer
  var wrap=document.getElementById("deep-q-wrap");
  if(wrap)wrap.innerHTML="";
  // Scroll to top
  window.scrollTo(0,0);
}

function deepBack(){
  if(deepCur>0){deepCur--;renderDeeper();}
  else show("s-result");
}
function deepNext(){
  if(deepAns[deepCur]===null)return;
  if(deepCur<DQs.length-1){deepCur++;renderDeeper();}
  else{saveRouteAnalysis();computeResult(true);}
}

function saveRouteAnalysis(){
  var labels=[
    ["onsight","following","projecting","redpoint"],
    ["close","normal","spread","runout"],
    ["clean","minor","concerning","serious"],
    ["full","mostly","limited"],
    ["none","minor","traverse","significant"],
    ["strong","decent","below","notgreat"],
    ["neutral","supportive","pushing","pressure"],
    ["fresh","warmed","later","end"],
    ["minimal","moderate","significant","severe"],
    ["present","challenged","learned","send"]
  ];
  var payload={
    device_id:DID,
    session_id:prepSessId||null,
    approach:labels[0][deepAns[0]]||null,
    bolt_spacing:labels[1][deepAns[1]]||null,
    crux_fall:labels[2][deepAns[2]]||null,
    visibility:labels[3][deepAns[3]]||null,
    swing_risk:labels[4][deepAns[4]]||null,
    physical_state:labels[5][deepAns[5]]||null,
    partner_dynamic:labels[6][deepAns[6]]||null,
    session_position:labels[7][deepAns[7]]||null,
    consequence:labels[8][deepAns[8]]||null,
    intention:labels[9][deepAns[9]]||null
  };
  sbI("route_analysis",payload).catch(function(e){console.warn("route_analysis save failed",e);});
}

function startLogFromPrepare(){
  logState={grade:null,terrain:null,result:null,zone:null,sessId:prepSessId,discipline:null,environment:null,routeName:null,rockType:null,boltCount:null,routeHeight:null,heightUnit:'ft'};
  buildGradeGrid(logGradeSystem);
  document.querySelectorAll(".chip[onclick*='selectTerrain']").forEach(b=>b.classList.remove("selected"));
  document.getElementById("btn-sent").classList.remove("selected-send");
  document.getElementById("btn-attempt").classList.remove("selected-attempt");
  checkLogReady();
  showScreen("screen-log");
}

function restart(){cur=0;ans={};pauseShown=false;bodyScanShown=false;prepSessId=null;window.bodyScanData=null;showScreen("screen-prepare");}
