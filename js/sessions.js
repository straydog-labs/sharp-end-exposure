// ── MY SESSIONS SCREEN ───────────────────────────────────
function generateRuleBasedInsight(sessions){
  if(!sessions||!sessions.length)return{short:"No sessions yet. Log your first climb to start building your picture.",long:null};
  var total=sessions.length;
  var zones=sessions.map(function(s){return s.baseline_zone;}).filter(Boolean);
  var comfort=zones.filter(function(z){return z==='comfort';}).length;
  var learning=zones.filter(function(z){return z==='learning';}).length;
  var panic=zones.filter(function(z){return z==='panic';}).length;
  var last3=zones.slice(-3);
  var lastZone=zones[zones.length-1]||'unknown';
  var panicPct=Math.round(panic/zones.length*100);
  var learningPct=Math.round(learning/zones.length*100);
  var short='',long='';
  // Trend analysis
  var recentPanic=last3.filter(function(z){return z==='panic';}).length;
  var recentLearning=last3.filter(function(z){return z==='learning';}).length;
  if(total<3){short="Your picture is just starting. Each session adds signal -- the patterns will emerge.";long=null;}
  else if(recentLearning>=2&&panic>0){short="Recent sessions in the Learning zone — the conscious step is working. Earlier Panic spikes marked where the edge was.";long="Learning-zone activation following earlier Panic spikes is consistent with progressive exposure adaptation. What once felt like the edge is shifting — the pattern is adapting.";}
  else if(recentPanic>=2){short="Panic-zone activation in recent sessions. The edge is being exposed — worth asking: conscious step or reactive response?";long="Repeated unprocessed Panic experiences can condition avoidance rather than growth. A deliberate step back to the Learning fringe is not retreat — it’s calibration.";}
  else if(learningPct>=55){short="Most sessions in the Learning zone — "+learningPct+"% of "+total+" logged. Awareness is building at the edge.";long="Consistent Learning-zone activation across "+total+" sessions indicates deliberate edge exposure. The arc should show gradual outward movement as the comfort zone expands.";}
  else if(comfort>=learning&&comfort>=panic){short="Most sessions in the Comfort zone — "+Math.round(comfort/zones.length*100)+"%. The edge is available whenever you choose to step toward it.";long="High Comfort-zone frequency may indicate deliberate recovery climbing, or routes that no longer challenge current experience. The data is worth noticing — passive repetition produces limited adaptation.";}
  else{short="Your last session: "+lastZone+" zone. "+total+" sessions logged. The picture builds with each one.";long=null;}
  return{short:short,long:long};
}

async function generateAiInsight(sessions){
  if(!sessions||sessions.length<3)return null;
  var summary=sessions.slice(-10).map(function(s){return(s.baseline_zone||'?')+' . '+(s.grade_value||'?')+' . '+(s.tag||'?');}).join(', ');
  try{
    var resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-6',
        max_tokens:200,
        system:"You are a sport psychology data analyst for a climbing app. Given a climber's recent session data (zone, grade, terrain), write ONE insight sentence (max 25 words) about activation pattern. Be specific, use Comfort/Learning/Panic zones. No fluff. Second sentence for say more (max 40 words). JSON only: {\"short\":\"...\",\"long\":\"...\"}",

        messages:[{role:'user',content:'Recent sessions (newest last): '+summary}]
      })
    });
    var data=await resp.json();
    var txt=data.content&&data.content[0]&&data.content[0].text;
    if(txt){var parsed=JSON.parse(txt.replace(/```json|```/g,'').trim());return parsed;}
  }catch(e){console.warn('AI insight failed, using rule-based',e);}
  return null;
}

function toggleAiMore(){
  var more=document.getElementById('ai-more-text');
  var btn=document.getElementById('ai-say-more-btn');
  if(!more||!btn)return;
  var open=more.style.display==='block';
  more.style.display=open?'none':'block';
  btn.textContent=open?'Say more →':'Show less ↑';
}

function toggleHomeSayMore(){
  var btn=document.getElementById('home-say-more-btn');
  var txt=document.getElementById('home-say-more-text');
  if(!btn||!txt)return;
  var open=txt.style.display==='block';
  txt.style.display=open?'none':'block';
  btn.textContent=open?'Say more ›':'› Less';
}

function buildHomeArc(sessions){
  var svg=document.getElementById('home-arc-svg');
  if(!svg)return;
  var W=380,H=72,bandH=H/3;
  var ns='http://www.w3.org/2000/svg';
  svg.innerHTML='';
  // filter to real climbs only (no check-ins)
  var climbs=sessions.filter(function(s){return !s.is_checkin&&s.baseline_zone;});
  if(!climbs.length)return;
  // Zone bands
  var bands=[['rgba(232,68,68,.06)',0],['rgba(245,166,35,.06)',1],['rgba(126,200,122,.07)',2]];
  bands.forEach(function(b){
    var r=document.createElementNS(ns,'rect');
    r.setAttribute('x',0);r.setAttribute('y',bandH*(2-b[1]));
    r.setAttribute('width',W);r.setAttribute('height',bandH);
    r.setAttribute('fill',b[0]);svg.appendChild(r);
  });
  // Labels
  var lbls=[['PANIC','rgba(232,68,68,.4)',2],['LEARNING','rgba(245,166,35,.4)',1],['COMFORT','rgba(126,200,122,.4)',0]];
  lbls.forEach(function(l){
    var t=document.createElementNS(ns,'text');
    t.setAttribute('x',6);t.setAttribute('y',bandH*(2-l[2])+bandH/2+3);
    t.setAttribute('font-family','Space Grotesk,sans-serif');t.setAttribute('font-size','8');
    t.setAttribute('font-weight','700');t.setAttribute('fill',l[1]);
    t.setAttribute('letter-spacing','.07em');t.textContent=l[0];
    svg.appendChild(t);
  });
  if(climbs.length<2){
    var zoneY={'comfort':bandH*2+bandH/2,'learning':bandH+bandH/2,'panic':bandH/2};
    var cy=zoneY[climbs[0].baseline_zone]||bandH+bandH/2;
    var zc={'comfort':'rgba(126,200,122,.8)','learning':'rgba(245,166,35,.8)','panic':'rgba(232,68,68,.8)'};
    var c=document.createElementNS(ns,'circle');
    c.setAttribute('cx',W/2);c.setAttribute('cy',cy);c.setAttribute('r',7);
    c.setAttribute('fill',zc[climbs[0].baseline_zone]||'rgba(245,166,35,.8)');
    svg.appendChild(c);return;
  }
  var margin=44,usableW=W-margin-20;
  var zoneY={'comfort':bandH*2+bandH/2,'learning':bandH+bandH/2,'panic':bandH/2};
  var zoneColors={'comfort':'rgba(126,200,122,.85)','learning':'rgba(245,166,35,.85)','panic':'rgba(232,68,68,.85)'};
  var pts=climbs.map(function(s,i){
    return {x:margin+(i/(climbs.length-1))*usableW,y:zoneY[s.baseline_zone]||bandH+bandH/2,z:s.baseline_zone,g:s.grade_value,t:s.tag};
  });
  // Connecting line
  var pl=document.createElementNS(ns,'polyline');
  pl.setAttribute('points',pts.map(function(p){return p.x+','+p.y;}).join(' '));
  pl.setAttribute('fill','none');pl.setAttribute('stroke','rgba(255,255,255,.1)');
  pl.setAttribute('stroke-width','1.5');pl.setAttribute('stroke-linecap','round');
  pl.setAttribute('stroke-linejoin','round');svg.appendChild(pl);
  // Dots
  pts.forEach(function(p,i){
    var isLast=i===climbs.length-1;
    if(isLast){
      var glow=document.createElementNS(ns,'circle');
      glow.setAttribute('cx',p.x);glow.setAttribute('cy',p.y);glow.setAttribute('r',12);
      glow.setAttribute('fill',(zoneColors[p.z]||'rgba(245,166,35,.85)').replace('.85','.15'));
      svg.appendChild(glow);
    }
    var c=document.createElementNS(ns,'circle');
    c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);
    c.setAttribute('r',isLast?7:4);
    c.setAttribute('fill',zoneColors[p.z]||'rgba(245,166,35,.85)');
    svg.appendChild(c);
    if(isLast){
      var ring=document.createElementNS(ns,'circle');
      ring.setAttribute('cx',p.x);ring.setAttribute('cy',p.y);ring.setAttribute('r',11);
      ring.setAttribute('fill','none');
      ring.setAttribute('stroke',(zoneColors[p.z]||'rgba(245,166,35,.85)').replace('.85','.35'));
      ring.setAttribute('stroke-width','1.5');svg.appendChild(ring);
    }
  });
}

function getHomeArcRead(climbs){
  if(!climbs||!climbs.length)return{short:'',long:''};
  var zones=climbs.map(function(s){return s.baseline_zone;});
  var hasP=zones.some(function(z){return z==='panic';});
  var hasL=zones.some(function(z){return z==='learning';});
  var hasC=zones.some(function(z){return z==='comfort';});
  var last=zones[zones.length-1];
  var n=climbs.length;
  var short='',long='';
  if(hasP&&hasC){short='<strong>Panic → Learning → Comfort.</strong> The edge is moving outward.';long='Reported activation has shifted across '+n+' sessions — consistent with progressive exposure adaptation. What once felt like the edge is shifting — the pattern is adapting.';}
  else if(hasP&&hasL&&!hasC){short='<strong>Panic → Learning.</strong> Activation is settling.';long='Panic-zone sessions early, Learning-zone more recently — the edge is being exposed deliberately. Comfort zone will follow as the pattern solidifies.';}
  else if(!hasP&&hasL&&hasC){short='<strong>Learning → Comfort.</strong> Awareness is sharpening.';long='Consistent Learning and Comfort zone activation across '+n+' sessions. The edge is stable and productive. Consider stepping toward new terrain or grades to continue exposing the edge.';}
  else if(zones.every(function(z){return z==='comfort';})){short='<strong>Consistent Comfort zone</strong> across '+n+' sessions.';long='The edge is available when you choose to step toward it. Consistent Comfort activation may indicate deliberate recovery climbing — or routes that no longer challenge current experience.';}
  else if(zones.every(function(z){return z==='learning';})){short='<strong>Consistent Learning zone</strong> across '+n+' sessions.';long='Deliberate edge exposure across all logged sessions. Awareness is sharpening here. This is the productive practice window.';}
  else if(zones.every(function(z){return z==='panic';})){short='<strong>Consistent Panic zone</strong> across '+n+' sessions.';long='Repeated Panic-zone activation without processing can condition avoidance rather than growth. Consider a deliberate step back to the Learning fringe — not retreat, calibration.';}
  else{short='<strong>Mixed activation</strong> across '+n+' sessions.';long='Your picture is building. Each session adds a data point — the pattern will emerge.';}
  return{short:short,long:long};
}

async function loadHomeInsight(){
  var card=document.getElementById('home-insight-card');
  var firstCard=document.getElementById('home-first-card');
  var buildingCard=document.getElementById('home-building-card');
  if(!card||!firstCard)return;
  var sessions=await sbS('sessions',{device_id:'eq.'+DID,order:'created_at.asc',limit:100});
  if(!sessions||!sessions.length){firstCard.style.display='block';return;}
  // Filter real climbs (no check-ins)
  var climbs=sessions.filter(function(s){return !s.is_checkin&&s.baseline_zone;});
  var n=climbs.length;
  if(n<5){
    if(buildingCard){
      buildingCard.style.display='block';
      var pct=Math.min((n/5)*100,100);
      var fill=document.getElementById('home-progress-fill');
      var lbl=document.getElementById('home-progress-label');
      var txt=document.getElementById('home-building-text');
      if(fill)fill.style.width=pct+'%';
      if(lbl)lbl.textContent=n+' of 5 sessions';
      if(txt)txt.textContent='Log '+(5-n)+' more session'+(5-n===1?'':'s')+' to unlock your zone arc, terrain radar, and grade range.';
    }
    return;
  }
  // 5+ sessions — show arc card
  card.style.display='block';
  buildHomeArc(climbs);
  var last=climbs[climbs.length-1];
  // Last badge
  var badge=document.getElementById('home-last-badge');
  if(badge&&last){
    var zc={'comfort':'rgba(126,200,122,.8)','learning':'rgba(245,166,35,.8)','panic':'rgba(232,68,68,.8)'};
    var zb={'comfort':'rgba(126,200,122,.12)','learning':'rgba(245,166,35,.12)','panic':'rgba(232,68,68,.12)'};
    var zBorder={'comfort':'rgba(126,200,122,.3)','learning':'rgba(245,166,35,.3)','panic':'rgba(232,68,68,.3)'};
    var z=last.baseline_zone||'learning';
    badge.style.background=zb[z]||zb.learning;
    badge.style.color=zc[z]||zc.learning;
    badge.style.border='1px solid '+(zBorder[z]||zBorder.learning);
    badge.textContent=(z.charAt(0).toUpperCase()+z.slice(1))+' · last';
  }
  // Insight text
  var read=getHomeArcRead(climbs);
  var insightEl=document.getElementById('home-insight-text');
  var countEl=document.getElementById('home-sess-count');
  if(insightEl)insightEl.innerHTML=read.short;
  if(countEl)countEl.textContent=n+' sessions';
  // Say more
  if(read.long){
    var smWrap=document.getElementById('home-say-more-wrap');
    var smTxt=document.getElementById('home-say-more-text');
    if(smWrap)smWrap.style.display='block';
    if(smTxt)smTxt.textContent=read.long;
  }
  // Session count label
  var lblEl=document.getElementById('home-insight-label');
  if(lblEl)lblEl.textContent='Pattern insight · '+n+' sessions';
}

function loadSessionsScreen(){
  sbS("sessions",{device_id:"eq."+DID,limit:200,order:"created_at.asc"}).then(function(rows){
    previousRoutes=[...new Set((rows||[]).filter(function(r){return r.route_name;}).map(function(r){return r.route_name;}))];
    var real=rows&&rows.length?rows.filter(function(r){return r.grade_value;}):[];
    // Session count
    var countEl=document.getElementById('sess-total-count');
    if(countEl&&rows&&rows.length)countEl.textContent=rows.length+' session'+(rows.length===1?'':'s');
    // AI insight card
    var aiCard=document.getElementById('ai-insight-card');
    var emptyState=document.getElementById('sessions-empty-state');
    var emptyTxt=document.getElementById('sessions-empty-text');
    if(rows&&rows.length>=1&&aiCard){
      aiCard.style.display='block';
      var ruleInsight=generateRuleBasedInsight(rows);
      document.getElementById('ai-insight-text').textContent=ruleInsight.short;
      var sayMore=document.getElementById('ai-say-more-btn');
      var moreText=document.getElementById('ai-more-text');
      if(ruleInsight.long&&sayMore&&moreText){sayMore.style.display='block';moreText.textContent=ruleInsight.long;}
      generateAiInsight(rows).then(function(aiR){
        if(aiR&&aiR.short){
          document.getElementById('ai-insight-text').textContent=aiR.short;
          if(aiR.long&&sayMore&&moreText){sayMore.style.display='block';moreText.textContent=aiR.long;}
        }
      });
    }
    if(rows&&rows.length<5&&emptyState){
      emptyState.style.display='block';
      if(emptyTxt){var left=5-rows.length;emptyTxt.textContent='Log '+(left===1?'1 more session':left+' more sessions')+' to unlock zone distribution, terrain patterns, and grade range.';}
    }
    renderSessionsPreview();
    renderRealData(real);
    renderRoutesSection(real);
  });
}

// ── PREVIEW DATA ──────────────────────────────────────────
var PREVIEW_DATA=[
  {g:"5.9",t:"Slab",z:"comfort",r:"sent",b:"Easy and steady",cr:"No standout moment",d:"Jan 3"},
  {g:"5.10a",t:"Vertical",z:"comfort",r:"sent",b:"Easy and steady",cr:"No standout moment",d:"Jan 5"},
  {g:"5.10c",t:"Overhang",z:"panic",r:"attempt",b:"I held my breath",cr:"Yes -- I backed off",d:"Jan 8"},
  {g:"5.10b",t:"Vertical",z:"learning",r:"sent",b:"Slightly faster",cr:"Yes -- I pushed through",d:"Jan 10"},
  {g:"5.10c",t:"Overhang",z:"panic",r:"attempt",b:"Shallow or tight",cr:"Yes -- I paused",d:"Jan 12"},
  {g:"5.10d",t:"Overhang",z:"learning",r:"sent",b:"Slightly faster",cr:"Yes -- I pushed through",d:"Jan 15"},
  {g:"5.10b",t:"Slab",z:"comfort",r:"sent",b:"Easy and steady",cr:"No standout moment",d:"Jan 17"},
  {g:"5.11a",t:"Overhang",z:"learning",r:"attempt",b:"Slightly faster",cr:"Yes -- I paused",d:"Jan 20"},
  {g:"5.10d",t:"Vertical",z:"comfort",r:"sent",b:"Easy and steady",cr:"No standout moment",d:"Jan 22"},
  {g:"5.11b",t:"Overhang",z:"learning",r:"sent",b:"Slightly faster",cr:"Yes -- I pushed through",d:"Jan 25"},
  {g:"5.11a",t:"Arête",z:"learning",r:"attempt",b:"Slightly faster",cr:"Yes -- I paused",d:"Jan 27"},
  {g:"5.10c",t:"Crack",z:"comfort",r:"sent",b:"Easy and steady",cr:"No standout moment",d:"Jan 29"},
  {g:"5.11c",t:"Roof",z:"panic",r:"attempt",b:"I held my breath",cr:"Yes -- I backed off",d:"Feb 1"},
  {g:"5.11b",t:"Overhang",z:"learning",r:"sent",b:"Slightly faster",cr:"Yes -- I pushed through",d:"Feb 3"},
  {g:"5.11c",t:"Overhang",z:"learning",r:"sent",b:"Slightly faster",cr:"Yes -- I pushed through",d:"Feb 6"},
  {g:"5.11b",t:"Vertical",z:"comfort",r:"sent",b:"Easy and steady",cr:"No standout moment",d:"Feb 8"},
  {g:"5.11c",t:"Roof",z:"panic",r:"attempt",b:"Shallow or tight",cr:"Yes -- I backed off",d:"Feb 10"},
  {g:"5.11d",t:"Overhang",z:"learning",r:"attempt",b:"Slightly faster",cr:"Yes -- I paused",d:"Feb 12"},
  {g:"5.11c",t:"Overhang",z:"learning",r:"sent",b:"Easy and steady",cr:"Yes -- I pushed through",d:"Feb 14"},
  {g:"5.11c",t:"Overhang",z:"learning",r:"sent",b:"Easy and steady",cr:"No standout moment",d:"Feb 16"}
];

var TC_COLORS={Slab:"#7ec87a",Vertical:"#e8763a",Overhang:"#f5a623",Arête:"#7ecfff",Dihedral:"#c084fc",Crack:"#f472b6",Roof:"#e84444"};
var Z_COLORS={comfort:"#7ec87a",learning:"#f5a623",panic:"#e84444"};

function renderSessionsPreview(){
  // Stats
  var total=PREVIEW_DATA.length;
  var sents=PREVIEW_DATA.filter(function(r){return r.r==="sent";}).length;
  var zc={comfort:0,learning:0,panic:0};
  PREVIEW_DATA.forEach(function(r){zc[r.z]++;});
  var topZ=Object.keys(zc).sort(function(a,b){return zc[b]-zc[a];})[0];
  var hardestSent=PREVIEW_DATA.filter(function(r){return r.r==="sent";}).pop();

  // Render arc
  renderArcSVG("arc-dots-preview",PREVIEW_DATA.map(function(r){return r.z;}));

  // Render radar
  var tc={Slab:0,Vertical:0,Overhang:0,Arête:0,Dihedral:0,Crack:0,Roof:0};
  PREVIEW_DATA.forEach(function(r){if(tc[r.t]!==undefined)tc[r.t]++;});
  renderRadarSVG("preview-radar-svg","preview-radar-breakdown",tc);

  // Grade distribution
  renderGradeDist("preview-grade-dist",PREVIEW_DATA);

  // Zone by terrain
  renderZoneByTerrain("preview-zone-terrain",PREVIEW_DATA);

  // Breathing bars
  renderBreathBars("preview-breath-bars",PREVIEW_DATA);

  // Sent breakdown
  renderSentBreakdown("preview-sent-breakdown",PREVIEW_DATA);
}

function renderArcSVG(dotsId,zones){
  var el=document.getElementById(dotsId);if(!el)return;
  var ZY={comfort:92,learning:55,panic:10};
  var n=zones.length,W=300,xStep=n>1?W/(n-1):W/2;
  var pts=zones.map(function(z,i){return {x:10+i*xStep,y:ZY[z]||55,c:Z_COLORS[z]||"#888"};});
  var line=n>1?'<polyline points="'+pts.map(function(p){return p.x+","+p.y;}).join(" ")+'" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1.5" stroke-linejoin="round"/>':'';
  var dots=pts.map(function(p,i){
    var isLast=i===pts.length-1;
    return '<circle cx="'+p.x+'" cy="'+p.y+'" r="'+(isLast?5.5:3.5)+'" fill="'+p.c+'" opacity="'+(isLast?1:.8)+'"/>'+
    (isLast?'<circle cx="'+p.x+'" cy="'+p.y+'" r="9" fill="none" stroke="'+p.c+'" stroke-width="1.5" opacity=".35"/>':'');
  }).join("");
  el.innerHTML=line+dots;
}

function renderRadarSVG(svgId,bdId,tc){
  var svg=document.getElementById(svgId);if(!svg)return;
  var tkeys=Object.keys(tc),n=tkeys.length,cx=110,cy=110,R=78;
  var maxC=Math.max.apply(null,Object.values(tc))||1;
  var ang=tkeys.map(function(_,i){return -Math.PI/2+(2*Math.PI*i/n);});
  var norm=tkeys.map(function(tk){return Math.max(0.08,tc[tk]/maxC);});
  var pts=norm.map(function(v,i){return {x:cx+R*v*Math.cos(ang[i]),y:cy+R*v*Math.sin(ang[i])};});
  // Rings -- more visible
  var rings=[.33,.66,1].map(function(r2){
    return '<polygon points="'+ang.map(function(a){return (cx+R*r2*Math.cos(a))+","+(cy+R*r2*Math.sin(a));}).join(" ")+'" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>';
  }).join("");
  // Axes -- more visible, colored
  var axes=tkeys.map(function(tk,i){
    return '<line x1="'+cx+'" y1="'+cy+'" x2="'+(cx+R*Math.cos(ang[i]))+'" y2="'+(cy+R*Math.sin(ang[i]))+'" stroke="'+(TC_COLORS[tk]||"rgba(255,255,255,.3)")+'" stroke-width="1.5" opacity=".5"/>';
  }).join("");
  // Filled polygon -- brighter fill and stroke
  var poly=pts.map(function(p){return p.x+","+p.y;}).join(" ");
  var hasData=tkeys.some(function(tk){return tc[tk]>0;});
  var polygonEl='<polygon points="'+poly+'" fill="rgba(232,118,58,'+(hasData?.18:.05)+')" stroke="#e8763a" stroke-width="'+(hasData?2.5:1)+'" stroke-linejoin="round" opacity="'+(hasData?1:.4)+'"/>';
  // Dots + labels -- much more visible
  var dots=tkeys.map(function(tk,i){
    var hasVal=tc[tk]>0;
    var dotR=hasVal?5:3;
    var dotOpacity=hasVal?1:.35;
    var labelOpacity=hasVal?.85:.3;
    var col=TC_COLORS[tk]||"#e8763a";
    return (hasVal?'<text x="'+pts[i].x+'" y="'+(pts[i].y-11)+'" text-anchor="middle" font-family="Space Mono,monospace" font-size="10" fill="'+col+'" font-weight="700">'+tc[tk]+"</text>":"")+
    '<circle cx="'+pts[i].x+'" cy="'+pts[i].y+'" r="'+dotR+'" fill="'+col+'" opacity="'+dotOpacity+'"/>'+
    (hasVal?'<circle cx="'+pts[i].x+'" cy="'+pts[i].y+'" r="'+(dotR+4)+'" fill="none" stroke="'+col+'" stroke-width="1" opacity=".3"/>':'')+
    '<text x="'+(cx+(R+22)*Math.cos(ang[i]))+'" y="'+(cy+(R+22)*Math.sin(ang[i])+4)+'" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="9.5" font-weight="600" fill="rgba(255,255,255,'+labelOpacity+')">'+tk+"</text>";
  }).join("");
  svg.innerHTML=rings+axes+polygonEl+dots;
  var bd=document.getElementById(bdId);
  if(bd){
    var maxV=Math.max.apply(null,Object.values(tc))||1;
    var withData=tkeys.filter(function(tk){return tc[tk]>0;});
    if(!withData.length){
      bd.innerHTML='<div style="font-size:13px;color:var(--muted);line-height:1.6;">Log climbs with terrain tags to build your radar.</div>';
      return;
    }
    bd.innerHTML=withData.map(function(tk){
      var w=Math.round((tc[tk]/maxV)*100);
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;">'+
      '<div style="width:8px;height:8px;border-radius:50%;background:'+(TC_COLORS[tk]||"#e8763a")+';flex-shrink:0;"></div>'+
      '<div style="flex:1;"><div style="font-size:14px;font-weight:600;color:var(--text);">'+tk+'</div>'+
      '<div style="height:4px;background:rgba(255,255,255,.1);border-radius:99px;margin-top:4px;">'+
      '<div style="height:100%;width:'+w+'%;background:'+(TC_COLORS[tk]||"#e8763a")+';border-radius:99px;opacity:.85;"></div></div></div>'+
      '<div style="font-size:13px;font-weight:700;color:var(--text);min-width:18px;text-align:right;font-family:Space Mono,monospace;">'+tc[tk]+'</div></div>';
    }).join("");
  }
}

function renderGradeDist(elId,data){
  var el=document.getElementById(elId);if(!el)return;
  var gc={};
  data.forEach(function(r){if(!gc[r.g])gc[r.g]={comfort:0,learning:0,panic:0,total:0};gc[r.g][r.z]++;gc[r.g].total++;});
  var grades=Object.keys(gc);
  var maxT=Math.max.apply(null,grades.map(function(g){return gc[g].total;}));
  el.innerHTML=grades.map(function(g){
    var d=gc[g],topZ=["learning","comfort","panic"].sort(function(a,b){return d[b]-d[a];})[0];
    var h=Math.round((d.total/maxT)*64)+8;
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;min-width:0;">'+
    '<div style="width:100%;height:'+h+'px;background:'+(Z_COLORS[topZ]||"#888")+';border-radius:4px 4px 0 0;opacity:.75;"></div>'+
    '<div style="font-size:9px;color:var(--muted);font-family:Space Mono,monospace;text-align:center;white-space:nowrap;overflow:hidden;max-width:100%;font-weight:500;">'+g.replace("5.","")+'</div></div>';
  }).join("");
}

function renderZoneByTerrain(elId,data){
  var el=document.getElementById(elId);if(!el)return;
  var terrains=["Overhang","Roof","Slab","Vertical","Crack","Arête"];
  var zones=["comfort","learning","panic"];
  var zLabels={comfort:"Comfort",learning:"Learning",panic:"Panic"};
  var zColors={comfort:"rgba(126,200,122,",learning:"rgba(245,166,35,",panic:"rgba(232,68,68,"};
  // Build matrix
  var matrix={};
  terrains.forEach(function(t){
    matrix[t]={comfort:0,learning:0,panic:0,total:0};
    data.filter(function(r){return r.t===t;}).forEach(function(r){
      if(matrix[t][r.z]!==undefined)matrix[t][r.z]++;
      matrix[t].total++;
    });
  });
  var rows=terrains.filter(function(t){return matrix[t].total>0;});
  if(!rows.length){el.innerHTML='<div style="font-size:13px;color:var(--muted);padding:12px 0;">No terrain data yet.</div>';return;}
  // Max value for intensity scaling
  var maxVal=0;
  rows.forEach(function(t){zones.forEach(function(z){if(matrix[t][z]>maxVal)maxVal=matrix[t][z];});});
  // Header
  var html='<div style="display:grid;grid-template-columns:88px 1fr 1fr 1fr;gap:4px;margin-bottom:6px;">';
  html+='<div></div>';
  zones.forEach(function(z){
    html+='<div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:'+zColors[z]+'0.65);text-align:center;">'+zLabels[z]+'</div>';
  });
  html+='</div>';
  // Rows
  rows.forEach(function(t){
    html+='<div style="display:grid;grid-template-columns:88px 1fr 1fr 1fr;gap:4px;margin-bottom:4px;align-items:center;">';
    html+='<div style="font-size:12px;font-weight:500;color:var(--text);padding-right:8px;">'+t+'</div>';
    zones.forEach(function(z){
      var val=matrix[t][z];
      var intensity=maxVal>0?(val/maxVal):0;
      var bg=val===0?'rgba(255,255,255,.03)':zColors[z]+(0.08+intensity*0.65)+')';
      var border=val===0?'rgba(255,255,255,.06)':zColors[z]+(0.1+intensity*0.5)+')';
      var textColor=val===0?'rgba(255,255,255,.2)':val===maxVal?'rgba(255,255,255,.9)':zColors[z]+(0.5+intensity*0.4)+')';
      var fw=val===maxVal?'700':'400';
      html+='<div style="background:'+bg+';border:1px solid '+border+';border-radius:6px;padding:10px 4px;text-align:center;">';
      html+='<div style="font-size:13px;font-weight:'+fw+';color:'+textColor+';font-family:Space Mono,monospace;">'+(val>0?val:'--')+'</div>';
      html+='</div>';
    });
    html+='</div>';
  });
  html+='<div style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.6;padding:8px 12px;background:rgba(232,118,58,.04);border-radius:6px;border-left:2px solid rgba(232,118,58,.2);font-style:italic;">Cell intensity reflects session frequency at each terrain-zone intersection. Correlation only -- terrain type does not cause activation state.</div>';
  el.innerHTML=html;
}

function renderBreathBars(elId,data){
  var el=document.getElementById(elId);if(!el)return;
  var order=["Easy and steady","Slightly faster","Shallow or tight","I held my breath","Didn't notice"];
  var cols={"Easy and steady":"rgba(126,200,122,.8)","Slightly faster":"rgba(245,166,35,.8)","Shallow or tight":"rgba(232,118,58,.75)","I held my breath":"rgba(232,68,68,.75)","Didn't notice":"rgba(160,160,160,.4)"};
  var bc={};
  data.filter(function(r){return r.b;}).forEach(function(r){bc[r.b]=(bc[r.b]||0)+1;});
  var total=Object.values(bc).reduce(function(s,v){return s+v;},0);
  if(!total){el.innerHTML='<div style="font-size:13px;color:var(--muted);padding:12px 0;">No breathing data yet. Complete Go Deeper sessions to populate.</div>';return;}
  // Build donut SVG using stroke-dasharray technique
  var cx=55,cy=55,r=40,circ=2*Math.PI*r;
  var segments=[];var offset=0;
  // Start from top (-90deg = -PI/2)
  order.forEach(function(k){
    if(!bc[k])return;
    var frac=bc[k]/total;
    segments.push({k:k,v:bc[k],frac:frac,offset:offset,col:cols[k]});
    offset+=frac;
  });
  var svgParts=['<svg width="110" height="110" viewBox="0 0 110 110" style="flex-shrink:0;display:block;">'];
  var startAngle=-Math.PI/2;
  segments.forEach(function(seg){
    var dashLen=seg.frac*circ;
    var gapLen=circ-dashLen;
    var rotation=(seg.offset*360)-90;
    svgParts.push('<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+seg.col+'" stroke-width="14" stroke-dasharray="'+dashLen.toFixed(1)+' '+gapLen.toFixed(1)+'" transform="rotate('+rotation.toFixed(1)+' '+cx+' '+cy+')" stroke-linecap="butt"/>');
  });
  svgParts.push('<text x="'+cx+'" y="'+cy+'" dy="-6" text-anchor="middle" font-size="20" font-family="Space Mono,monospace" font-weight="400" fill="rgba(255,255,255,.85)">'+total+'</text>');
  svgParts.push('<text x="'+cx+'" y="'+cy+'" dy="12" text-anchor="middle" font-size="9" font-family="Space Grotesk,sans-serif" fill="rgba(255,255,255,.3)">sessions</text>');
  svgParts.push('</svg>');
  var legendParts=order.filter(function(k){return bc[k];}).map(function(k){
    return '<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">'+
    '<div style="width:8px;height:8px;border-radius:50%;background:'+cols[k]+';flex-shrink:0;"></div>'+
    '<div style="flex:1;font-size:13px;color:var(--muted);line-height:1.3;">'+k+'</div>'+
    '<div style="font-size:12px;font-weight:600;color:var(--text);font-family:Space Mono,monospace;">'+bc[k]+'</div></div>';
  });
  var insight='<div style="font-size:12px;color:var(--muted);margin-top:10px;line-height:1.6;padding:8px 12px;background:rgba(232,118,58,.04);border-radius:6px;border-left:2px solid rgba(232,118,58,.2);font-style:italic;">Open breathing reported in '+(Math.round(((bc["Easy and steady"]||0)+(bc["Slightly faster"]||0))/total*100))+'% of sessions. Restricted or held breathing co-occurs with Panic-zone reports in the majority of instances.</div>';
  el.innerHTML='<div style="display:flex;align-items:center;gap:16px;margin-bottom:0;">'+svgParts.join("")+'<div style="flex:1;min-width:0;">'+legendParts.join("")+'</div></div>'+insight;
}

function renderSentBreakdown(elId,data){
  var el=document.getElementById(elId);if(!el)return;
  var zones=["comfort","learning","panic"];
  var labels={comfort:"Comfort",learning:"Learning",panic:"Panic"};
  var zColors2={comfort:"rgba(126,200,122,",learning:"rgba(245,166,35,",panic:"rgba(232,68,68,"};
  var html='<div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.5;">Each point = one session. Filled = sent. Hollow = attempt.</div>';
  zones.forEach(function(z){
    var subset=data.filter(function(r){return r.z===z;});
    if(!subset.length)return;
    var sents=subset.filter(function(r){return r.r==="sent";}).length;
    var attempts=subset.length-sents;
    var pct=Math.round((sents/subset.length)*100);
    html+='<div style="margin-bottom:14px;">';
    html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">';
    html+='<span style="font-size:13px;font-weight:600;color:'+zColors2[z]+'0.9);">'+labels[z]+'</span>';
    html+='<span style="font-size:12px;font-family:Space Mono,monospace;color:'+zColors2[z]+'0.7);">'+pct+'% sent</span>';
    html+='</div>';
    html+='<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    for(var i=0;i<sents;i++){
      html+='<div style="width:12px;height:12px;border-radius:50%;background:'+zColors2[z]+'0.75);"></div>';
    }
    for(var j=0;j<attempts;j++){
      html+='<div style="width:12px;height:12px;border-radius:50%;border:1.5px solid '+zColors2[z]+'0.35);"></div>';
    }
    html+='</div></div>';
  });
  html+='<div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.6;padding:8px 12px;background:rgba(232,118,58,.04);border-radius:6px;border-left:2px solid rgba(232,118,58,.2);font-style:italic;">Send rate: Comfort '+Math.round((data.filter(function(r){return r.z==="comfort"&&r.r==="sent";}).length/Math.max(data.filter(function(r){return r.z==="comfort";}).length,1))*100)+'%, Learning '+Math.round((data.filter(function(r){return r.z==="learning"&&r.r==="sent";}).length/Math.max(data.filter(function(r){return r.z==="learning";}).length,1))*100)+'%, Panic '+Math.round((data.filter(function(r){return r.z==="panic"&&r.r==="sent";}).length/Math.max(data.filter(function(r){return r.z==="panic";}).length,1))*100)+'%. Activation state shows a consistent inverse relationship with completion rate. This is a pattern, not a ceiling.</div>';
  el.innerHTML=html;
}

// ── REAL DATA RENDER ──────────────────────────────────────
function renderRealData(rows){
  var total=rows.length;
  var el_total=document.getElementById("real-total");
  var el_sent=document.getElementById("real-sent");
  if(el_total)el_total.textContent=total||"0";
  if(el_sent){
    if(total){
      var sents=rows.filter(function(r){return r.baseline_zone==="sent";}).length;
      el_sent.textContent=Math.round((sents/total)*100)+"%";
    } else {
      el_sent.textContent="--";
    }
  }
  // Arc
  var arcEl=document.getElementById("arc-dots-real");
  if(arcEl){
    if(total){
      var zones=rows.slice().reverse().map(function(r){return r.deeper_zone||r.baseline_zone||"learning";});
      renderArcSVG("arc-dots-real",zones);
      var ins=document.getElementById("sessions-arc-insight");
      if(ins){var last=zones[zones.length-1];ins.textContent="Last session: "+last[0].toUpperCase()+last.slice(1)+" zone.";}
    } else {
      arcEl.innerHTML='<text x="160" y="55" text-anchor="middle" font-family="Space Grotesk,sans-serif" font-size="12" fill="rgba(255,255,255,.12)">Log climbs to build your arc</text>';
    }
  }
  // Radar
  renderSessionsRadar(rows,!total);
  // List
  renderSessionsList(rows);
}

function renderSessionsRadar(rows,showDummy){
  var svg=document.getElementById("radar-svg"),bd=document.getElementById("radar-breakdown");
  if(!svg)return;
  var tc={Slab:0,Vertical:0,Overhang:0,Arête:0,Dihedral:0,Crack:0,Roof:0};
  if(!showDummy&&rows.length){rows.forEach(function(r){if(r.tag&&tc[r.tag]!==undefined)tc[r.tag]++;});}
  else{tc={Slab:0,Vertical:0,Overhang:0,Arête:0,Dihedral:0,Crack:0,Roof:0};}
  renderRadarSVG("radar-svg","radar-breakdown",tc);
  var ri=document.getElementById("radar-insight");
  if(ri){
    var sorted=Object.keys(tc).sort(function(a,b){return tc[b]-tc[a];});
    if(tc[sorted[0]]>0){ri.style.display="block";ri.textContent="Most volume on "+sorted[0]+" ("+tc[sorted[0]]+" sessions).";}
    else{ri.style.display="none";}
  }
}

function renderSessionsArc(rows,showDummy){}// kept for compatibility -- real arc handled in renderRealData

function renderSessionsList(rows){
  var list=document.getElementById("sessions-climb-list");if(!list)return;
  var real=rows.filter(function(r){return r.grade_value;});
  if(!real.length){list.innerHTML='<div style="text-align:center;padding:24px 0;font-size:15px;color:var(--muted);">Log your first climb to start building history.</div>';return;}
  // Show even 1 session -- every session counts
  var ZN={comfort:"zone-comfort",learning:"zone-learning",panic:"zone-panic"};
  list.innerHTML=real.slice(0,15).map(function(r){
    var z=r.deeper_zone||r.baseline_zone||"learning";
    var hasProject=r.project_id||r.route_name;
    var projBtn=hasProject?
      '<button onclick="event.stopPropagation();openProject(\''+( r.route_name||"").replace(/'/g,"\\'")+'\')" style="background:rgba(126,200,122,.1);border:1px solid rgba(126,200,122,.3);border-radius:8px;color:#7ec87a;font-family:Space Grotesk,sans-serif;font-size:11px;font-weight:700;padding:4px 10px;cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent;">Project ›</button>':
      "";
    return '<div class="climb-list-row" style="flex-wrap:wrap;gap:8px;">'+
    '<div class="climb-list-grade">'+(r.grade_value||"--")+'</div>'+
    '<div class="climb-list-detail" style="flex:1;min-width:0;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px;">'+(r.route_name||r.tag||"--")+'</span><span class="climb-list-zone '+(ZN[z]||"zone-learning")+'">'+(z[0].toUpperCase()+z.slice(1))+'</span></div>'+
    '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">'+
    (projBtn?projBtn:"")+
    '<div class="climb-list-result '+(r.baseline_zone==="sent"?"sent":"attempt")+'">'+(r.baseline_zone==="sent"?"Sent":"Attempt")+'</div>'+
    "</div></div>";
  }).join("")+(real.length>15?'<div style="font-size:12px;color:var(--muted);text-align:center;padding-top:10px;">Showing 15 most recent</div>':"");
}
