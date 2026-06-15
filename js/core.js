// ── SUPABASE ─────────────────────────────────────────────
var SB="https://kwtbqgoqtewrlsjgepwq.supabase.co",SK="sb_publishable_cPznnRs3-ega2M1aYoEpDw_bJVQFS1t";
function sbI(t,d){return fetch(SB+"/rest/v1/"+t,{method:"POST",headers:{"Content-Type":"application/json","apikey":SK,"Authorization":"Bearer "+SK,"Prefer":"return=representation"},body:JSON.stringify(d)}).then(function(r){return r.json().then(function(j){if(!r.ok)return j;return Array.isArray(j)?j[0]:j;});}).catch(function(e){console.warn("sb",e);return null;});}
function sbS(t,p){var q=Object.keys(p).map(function(k){var v=p[k];if(typeof v==="string"&&(v.indexOf("eq.")===0||v.indexOf("like.")===0)){var pfx=v.substring(0,v.indexOf(".")+1);var val=v.substring(pfx.length);v=pfx+encodeURIComponent(val);}return k+"="+v;}).join("&");return fetch(SB+"/rest/v1/"+t+"?"+q,{headers:{"apikey":SK,"Authorization":"Bearer "+SK}}).then(function(r){return r.json();}).catch(function(){return[];});}
function getDID(){var id=localStorage.getItem("see_did");if(!id){id=([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));localStorage.setItem("see_did",id);}return id;}
var DID=getDID();

// ── SCREEN ROUTING ───────────────────────────────────────
function showScreen(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  var el=document.getElementById(id);if(el)el.classList.add("active");
  window.scrollTo(0,0);
  var map={"screen-sessions":"fnav-sessions","screen-projects":"fnav-projects","screen-research":"fnav-research","screen-feedback":"fnav-feedback"};
  document.querySelectorAll(".footer-btn").forEach(b=>b.classList.remove("active"));
  if(map[id])document.getElementById(map[id]).classList.add("active");
  if(id==="screen-sessions")loadSessionsScreen();
  if(id==="screen-home"){loadHomeInsight();currentProjectId=null;currentProjectName=null;}
  if(id==="screen-projects")loadProjectsScreen();
  // Load home insight on initial page load
  if(id==="screen-feedback")initFeedback();
  if(id==="screen-route-details")initRouteDetails();
  if(id==="screen-celebrate")showFocusBlockIfProject();
  if(id==="screen-project")window.scrollTo(0,0);
  if(id==="screen-start-project")initStartProject();
}
// Legacy show() for prepare flow compatibility
function show(id){showScreen(id);}
