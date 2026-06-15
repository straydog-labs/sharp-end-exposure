// ── EXPOSURE DRILL ──────────────────────────────────────
var drillState={drillId:null,preZone:null,preScore:null,preBreath:null,routeName:null,preSessId:null};

function saveDrillState(){try{localStorage.setItem("see_drill",JSON.stringify(drillState));}catch(e){}}
function loadDrillState(){try{var d=localStorage.getItem("see_drill");if(d){var s=JSON.parse(d);if(s&&s.drillId&&s.preZone){drillState=s;return true;}}return false;}catch(e){return false;}}
function clearDrillState(){try{localStorage.removeItem("see_drill");}catch(e){}}

function generateDrillId(){
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
    var r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);return v.toString(16);
  });
}

function startExposureDrill(){showScreen('screen-drill');var inp=document.getElementById('drill-route-name');if(inp)inp.value='';}

function startDrillCheckin(){
  drillState.drillId=generateDrillId();
  drillState.routeName=(document.getElementById('drill-route-name')||{}).value||null;
  window._drillMode=true;
  startPrepareFlow();
}

function completeDrillCheckin(zone,score,breath,sessId){
  drillState.preZone=zone;drillState.preScore=score;drillState.preBreath=breath;drillState.preSessId=sessId;
  window._drillMode=false;
  saveDrillState();
  var holdZone=document.getElementById('drill-hold-zone');
  if(holdZone){
    var zL={comfort:'Comfort zone',learning:'Learning zone',panic:'Panic zone'};
    var zC={comfort:'#7ec87a',learning:'#f5a623',panic:'#e84444'};
    var z=zone||'learning';holdZone.textContent=zL[z]||'Learning zone';holdZone.style.color=zC[z]||'#f5a623';
  }
  // Save drill_id to pre session
  if(drillState.drillId&&sessId){sbU('sessions',sessId,{drill_id:drillState.drillId}).catch(function(e){console.warn('drill pre save',e);});}
  showScreen('screen-drill-hold');
}

function completeDrill(){window._drillPostMode=true;showScreen('screen-log');}

function showDrillResult(postZone){
  var preZ=drillState.preZone||'learning';
  var postZ=postZone||'learning';
  var zL={comfort:'Comfort zone',learning:'Learning zone',panic:'Panic zone'};
  var zC={comfort:'#7ec87a',learning:'#f5a623',panic:'#e84444'};
  var before=document.getElementById('drill-res-before');
  var after=document.getElementById('drill-res-after');
  var shiftText=document.getElementById('drill-shift-text');
  if(before){before.textContent=zL[preZ]||preZ;before.style.color=zC[preZ]||'#f5a623';}
  if(after){after.textContent=zL[postZ]||postZ;after.style.color=zC[postZ]||'#f5a623';}
  var zN={comfort:2,learning:1,panic:0};
  var delta=(zN[postZ]||1)-(zN[preZ]||1);
  var text='';
  if(preZ===postZ){text='Activation held steady \u2014 '+zL[preZ]+' before and after. Consistent activation on this route is data. What does that stability tell you about where your edge is on this climb?';}
  else if(delta>0){text='Activation shifted toward Comfort \u2014 from '+zL[preZ]+' before to '+zL[postZ]+' after. The route may be inside your current edge, or the act of climbing settled the pre-climb activation. Both are worth noting.';}
  else{text='Activation increased \u2014 from '+zL[preZ]+' before to '+zL[postZ]+' after. The route exceeded your pre-climb read. That gap between anticipation and reality is the most interesting data in the drill.';}
  if(shiftText)shiftText.textContent=text;
  if(drillState.drillId&&logState.sessId){sbU('sessions',logState.sessId,{drill_id:drillState.drillId}).catch(function(e){console.warn('drill post save',e);});}
  window._drillPostMode=false;
  clearDrillState();
  showScreen('screen-drill-result');
}
// ── END EXPOSURE DRILL ────────────────────────────────────
