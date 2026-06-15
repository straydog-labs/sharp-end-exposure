// ── FEEDBACK ─────────────────────────────────────────────
var FBQs=[
  {text:"Which did you use most?",key:"simplicity",icon:"📊",opts:["Log a Climb -- after climbing","Prepare -- before committing","Both equally","Neither yet"]},
  {text:"Did the somatic check-in feel real?",key:"somatic_real",icon:"🫁",opts:["Yes -- I noticed something I wasn\'t aware of before","The questions made me more aware than I expected","Somewhat -- noticed but not surprising","Not really -- I answered but didn\'t physically feel it"]},
  {text:"Did the result change what you decided to do on the route?",key:"delta_accurate",icon:"🧭",opts:["Yes -- I adjusted my approach","Yes -- I decided not to attempt it","Somewhat -- it confirmed what I already felt","Not really -- I wasn\'t sure what to do with it"]},
  {text:"Did you notice anything about your body you weren\'t already aware of?",key:"body_awareness",icon:"🔍",opts:["Yes -- something I hadn\'t noticed before","Somewhat -- sharpened existing awareness","Not this time -- but I can see how it would build","Not really"]},
  {text:"Did you try project tracking?",key:"project_useful",icon:"🏔",opts:["Yes -- very useful","Yes -- too early to tell","Not yet","Couldn\'t find it"]}
];
var fbCur=0,fbAns={};
function initFeedback(){fbCur=0;fbAns={};document.getElementById("fb-content").style.display="block";document.getElementById("fb-success").style.display="none";renderFb();}
function renderFb(){
  var prog=document.getElementById("fb-prog"),stepLbl=document.getElementById("fb-step-lbl"),qEl=document.getElementById("fb-q"),optsEl=document.getElementById("fb-opts"),openEl=document.getElementById("fb-open"),nextBtn=document.getElementById("fb-next-btn");
  if(fbCur<FBQs.length){
    var q=FBQs[fbCur];
    prog.style.width=((fbCur/(FBQs.length+1))*100)+"%";
    stepLbl.textContent=(q.icon?" "+q.icon+" ":"")+"Question "+(fbCur+1)+" of "+FBQs.length;
    qEl.textContent=q.text;openEl.style.display="none";
    optsEl.innerHTML="";
    q.opts.forEach(function(o){
      var btn=document.createElement("button");
      btn.className="fb-opt"+(fbAns[q.key]===o?" selected":"");
      btn.textContent=o;
      btn.onclick=function(){selectFbOpt(btn,q.key,o);};
      optsEl.appendChild(btn);
    });
    var skipBtn=document.createElement("button");
    skipBtn.style.cssText="background:none;border:none;color:var(--muted);font-family:'Space Grotesk',sans-serif;font-size:13px;cursor:pointer;margin-top:8px;text-decoration:underline;text-underline-offset:3px;padding:4px 0;display:block;";
    skipBtn.textContent="Skip this question";
    skipBtn.onclick=function(){feedbackNext();};
    optsEl.appendChild(skipBtn);
    nextBtn.className="fb-next-btn"+(fbAns[q.key]?" ready":"");nextBtn.textContent="Continue";
  } else {
    prog.style.width="90%";stepLbl.textContent="Almost done";qEl.textContent="Anything else you want to share?";optsEl.innerHTML="";openEl.style.display="block";nextBtn.className="fb-next-btn ready";nextBtn.textContent="Submit feedback";
  }
}
function selectFbOpt(el,key,val){fbAns[key]=val;renderFb();}
function feedbackNext(){
  if(fbCur<FBQs.length){fbCur++;renderFb();}
  else{
    var SIMPLICITY_MAP={"Log a Climb — after climbing":"log","Prepare — before committing":"prepare","Both equally":"both","Neither yet":"neither"};
    var SOMATIC_MAP={"Yes — I noticed something I wasn’t aware of before":"yes_noticed","The questions made me more aware than I expected":"more_aware","Somewhat — noticed but not surprising":"somewhat","Not really — I answered but didn’t physically feel it":"not_really"};
    var DELTA_MAP={"Yes — I adjusted my approach":"yes_adjusted","Yes — I decided not to attempt it":"yes_didnt_attempt","Somewhat — it confirmed what I already felt":"confirmed","Not really — I wasn’t sure what to do with it":"unsure"};
    var BODY_MAP={"Yes — something I hadn’t noticed before":"yes_new","Somewhat — sharpened existing awareness":"sharpened","Not this time — but I can see how it would build":"not_yet","Not really":"not_really"};
    var PROJECT_MAP={"Yes — very useful":"yes_useful","Yes — too early to tell":"yes_early","Not yet":"not_yet","Couldn’t find it":"didnt_find"};
    var payload={device_id:DID,app_version:"index80",simplicity:SIMPLICITY_MAP[fbAns.simplicity]||fbAns.simplicity||null,somatic_real:SOMATIC_MAP[fbAns.somatic_real]||fbAns.somatic_real||null,delta_accurate:DELTA_MAP[fbAns.delta_accurate]||fbAns.delta_accurate||null,project_useful:PROJECT_MAP[fbAns.project_useful]||fbAns.project_useful||null,open_notes:document.getElementById("fb-open-text").value||null};
    if(fbAns.body_awareness&&!payload.open_notes)payload.open_notes="body_awareness: "+(BODY_MAP[fbAns.body_awareness]||fbAns.body_awareness);
    sbI("feedback",payload).then(function(saved){
      document.getElementById("fb-content").style.display="none";
      document.getElementById("fb-success").style.display="block";
      if(!saved||!saved.id)showError("Feedback may not have saved -- check connection.");
    }).catch(function(){
      document.getElementById("fb-content").style.display="none";
      document.getElementById("fb-success").style.display="block";
      showError("Feedback could not be saved. Check your connection.");
    });
  }
}
