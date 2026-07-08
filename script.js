const BOOTSTRAP_URL = "./data/bootstrap-static.json";
const FIXTURES_URL = "./data/fixtures.json";
const METADATA_URL = "./data/metadata.json";

let bootstrapData = null;
let allFixtures = [];
let metadata = null;
let fixturesData = [];
let allPlayers = [];
let playerPool = [];
let selectedSquad = [];
let startingXI = [];
let bench = [];
let currentGameweekId = null;
let currentWildcardTab = "differentials";

const requiredSquad = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
const maxPlayersPerClub = 3;
const els = id => document.getElementById(id);

function n(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
function r(v,d=2){ const m = Math.pow(10,d); return Math.round((n(v)+Number.EPSILON)*m)/m; }
function money(v){ return `£${r(v,1).toFixed(1)}m`; }
function status(msg,err=false){ els("statusMessage").textContent = msg; els("statusMessage").style.color = err ? "#c1121f" : "#69728a"; }
function sortPred(a,b){ return b.predictedPoints - a.predictedPoints; }
function esc(v){ return String(v ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
async function fetchJson(url, optional=false){ const res = await fetch(url, {cache:"no-store"}); if(!res.ok){ if(optional) return null; throw new Error(`${url} returned ${res.status}`); } return await res.json(); }

function validateData(){
  if(!bootstrapData || !Array.isArray(bootstrapData.elements) || !Array.isArray(bootstrapData.teams) || !Array.isArray(bootstrapData.events) || !Array.isArray(bootstrapData.element_types)){
    throw new Error("data/bootstrap-static.json is not populated yet. Run the GitHub Action named 'Update FPL Data' once, then refresh the site.");
  }
  if(!Array.isArray(allFixtures)) throw new Error("data/fixtures.json is not populated yet. Run the GitHub Action named 'Update FPL Data' once, then refresh the site.");
}
function lookup(list, keyField, valueField){ const m = new Map(); list.forEach(x => m.set(Number(x[keyField]), x[valueField])); return m; }
function inferSeason(events){ const years = events.map(e=>e.deadline_time).filter(Boolean).map(d=>Number(String(d).slice(0,4))).filter(Number.isFinite); if(!years.length) return "Unknown"; const a=Math.min(...years), b=Math.max(...years); return `${a}/${String(b).slice(-2)}`; }
function detectGameweek(){ let e = bootstrapData.events.find(x=>x.is_next===true) || bootstrapData.events.find(x=>x.is_current===true); if(e) return e; const u=bootstrapData.events.filter(x=>x.finished===false).sort((a,b)=>a.id-b.id); return u[0] || bootstrapData.events.slice().sort((a,b)=>a.id-b.id)[0]; }
function selectedGameweek(){ return els("gameweekSelect").value === "auto" ? detectGameweek().id : Number(els("gameweekSelect").value); }

function populateControls(){
  els("gameweekSelect").innerHTML = '<option value="auto">Auto detect</option>';
  bootstrapData.events.forEach(e => { const o=document.createElement("option"); o.value=e.id; o.textContent=`${e.name || "GW" + e.id} (${e.id})`; els("gameweekSelect").appendChild(o); });
  const options = allPlayers.slice().sort((a,b)=>a.name.localeCompare(b.name));
  els("playerOptions").innerHTML = options.map(p=>`<option value="${esc(p.name)}">${esc(p.team)} · ${esc(p.position)} · ${money(p.price)}</option>`).join("");
  const selectHtml = '<option value="">Select player</option>' + options.map(p=>`<option value="${p.id}">${esc(p.name)} - ${esc(p.team)} (${esc(p.position)})</option>`).join("");
  els("compareA").innerHTML = selectHtml; els("compareB").innerHTML = selectHtml;
  els("playerSearchButton").disabled = false; els("compareButton").disabled = false;
}

async function loadData(){
  try{
    status("Loading repository JSON data...");
    els("loadButton").disabled=true; els("predictButton").disabled=true; els("downloadButton").disabled=true;
    bootstrapData = await fetchJson(BOOTSTRAP_URL);
    allFixtures = await fetchJson(FIXTURES_URL);
    metadata = await fetchJson(METADATA_URL, true);
    validateData();
    currentGameweekId = detectGameweek().id;
    fixturesData = allFixtures.filter(f=>Number(f.event)===Number(currentGameweekId));
    allPlayers = buildAllPlayers(false);
    populateControls();
    els("summarySeason").textContent = metadata?.inferred_season || inferSeason(bootstrapData.events);
    els("summaryGameweek").textContent = `GW${currentGameweekId}`;
    els("predictButton").disabled=false;
    status(`Loaded ${allPlayers.length} players. Auto gameweek: GW${currentGameweekId}.`);
  }catch(e){ console.error(e); status(e.message,true); }
  finally{ els("loadButton").disabled=false; }
}

function buildFixtureLookup(){
  const raw = new Map();
  fixturesData.forEach(f => { if(!raw.has(Number(f.team_h))) raw.set(Number(f.team_h), []); if(!raw.has(Number(f.team_a))) raw.set(Number(f.team_a), []); raw.get(Number(f.team_h)).push(n(f.team_h_difficulty)); raw.get(Number(f.team_a)).push(n(f.team_a_difficulty)); });
  const out = new Map(); raw.forEach((vals, teamId) => out.set(teamId, {averageDifficulty:r(vals.reduce((a,b)=>a+b,0)/vals.length,2), fixtureCount:vals.length})); return out;
}
function scorePlayer(p, fixtureLookup){
  const epNext=n(p.ep_next), epThis=n(p.ep_this), form=n(p.form), ppg=n(p.points_per_game); let base=ppg; if(epNext>0) base=epNext; else if(epThis>0) base=epThis; else if(form>0) base=form;
  let fixtureMult=.70; const fx=fixtureLookup.get(Number(p.team)); if(fx){ fixtureMult=1+((3-fx.averageDifficulty)*.08); if(fx.fixtureCount>1) fixtureMult+=(fx.fixtureCount-1)*.15; }
  const mins=n(p.minutes); const minutesMult=mins>=900?1:mins>=450?.85:mins>0?.65:.35;
  let availMult=.4; if(p.chance_of_playing_next_round!==null && p.chance_of_playing_next_round!==undefined) availMult=n(p.chance_of_playing_next_round)/100; else if(p.status==='a') availMult=1;
  const own=n(p.selected_by_percent); const pop=own>=20?1.04:own>=10?1.02:1;
  return r(base*fixtureMult*minutesMult*availMult*pop,2);
}
function buildAllPlayers(applyChanceFilter=true){
  const teams=lookup(bootstrapData.teams,'id','name'), positions=lookup(bootstrapData.element_types,'id','singular_name_short'), fixtureLookup=buildFixtureLookup(), minChance=Number(els("chanceInput")?.value ?? 0);
  return bootstrapData.elements.filter(p=>{ if(!applyChanceFilter) return true; if(p.status==='a') return true; const c=p.chance_of_playing_next_round; if(c===null || c===undefined) return minChance===0; return Number(c)>=minChance; }).map(p=>{ const price=r(n(p.now_cost)/10,1), pred=scorePlayer(p,fixtureLookup); return { id:Number(p.id), name:p.web_name || `${p.first_name} ${p.second_name}`, fullName:`${p.first_name||''} ${p.second_name||''}`.trim(), teamId:Number(p.team), team:teams.get(Number(p.team))||'Unknown', position:positions.get(Number(p.element_type))||'UNK', nowCost:Number(p.now_cost), price, totalPoints:Number(p.total_points)||0, form:n(p.form), pointsPerGame:n(p.points_per_game), expectedNext:n(p.ep_next), expectedThis:n(p.ep_this), minutes:Number(p.minutes)||0, selectedByPercent:n(p.selected_by_percent), status:p.status, news:p.news||'', goals:Number(p.goals_scored)||0, assists:Number(p.assists)||0, cleanSheets:Number(p.clean_sheets)||0, bonus:Number(p.bonus)||0, predictedPoints:pred, valueScore:price>0?r(pred/price,2):0 }; });
}
function buildPlayerPool(){ playerPool = buildAllPlayers(true); }
function minRemainingCost(rem){ let total=0; for(const pos of Object.keys(rem)){ const need=rem[pos]; if(need<=0) continue; const cheapest=playerPool.filter(p=>p.position===pos).sort((a,b)=>a.nowCost-b.nowCost).slice(0,need); if(cheapest.length<need) return 999999; total+=cheapest.reduce((s,p)=>s+p.nowCost,0);} return total; }
function pickBest(pos, rem, budget, clubs){ const chosen=new Set(selectedSquad.map(p=>p.id)); const candidates=playerPool.filter(p=>p.position===pos && !chosen.has(p.id) && p.nowCost<=budget).sort(sortPred); for(const c of candidates){ if((clubs.get(c.teamId)||0)>=maxPlayersPerClub) continue; const test={...rem}; test[pos]-=1; if(budget-c.nowCost>=minRemainingCost(test)) return c; } return null; }
function selectSquad(){ selectedSquad=[]; let budget=Math.round(Number(els("budgetInput").value)*10); const rem={...requiredSquad}, clubs=new Map(), order=['FWD','MID','MID','FWD','DEF','MID','DEF','GKP','MID','DEF','FWD','MID','DEF','GKP','DEF']; for(const pos of order){ if(rem[pos]<=0) continue; const best=pickBest(pos,rem,budget,clubs); if(!best) throw new Error(`Could not find a valid ${pos} within budget. Try increasing budget or reducing the chance filter.`); selectedSquad.push(best); budget-=best.nowCost; rem[pos]-=1; clubs.set(best.teamId,(clubs.get(best.teamId)||0)+1); } return budget; }
function bestXI(){ const formations=[{DEF:3,MID:4,FWD:3},{DEF:3,MID:5,FWD:2},{DEF:4,MID:3,FWD:3},{DEF:4,MID:4,FWD:2},{DEF:4,MID:5,FWD:1},{DEF:5,MID:3,FWD:2},{DEF:5,MID:4,FWD:1}]; let best={formation:'',players:[],score:-1}; for(const f of formations){ const players=[...selectedSquad.filter(p=>p.position==='GKP').sort(sortPred).slice(0,1),...selectedSquad.filter(p=>p.position==='DEF').sort(sortPred).slice(0,f.DEF),...selectedSquad.filter(p=>p.position==='MID').sort(sortPred).slice(0,f.MID),...selectedSquad.filter(p=>p.position==='FWD').sort(sortPred).slice(0,f.FWD)]; if(players.length!==11) continue; const score=r(players.reduce((s,p)=>s+p.predictedPoints,0),2); if(score>best.score) best={formation:`${f.DEF}-${f.MID}-${f.FWD}`,players,score}; } return best; }
async function predictTeam(){ try{ if(!bootstrapData) throw new Error('Load data first.'); els("predictButton").disabled=true; els("downloadButton").disabled=true; currentGameweekId=selectedGameweek(); fixturesData=allFixtures.filter(f=>Number(f.event)===Number(currentGameweekId)); allPlayers=buildAllPlayers(false); buildPlayerPool(); const remaining=selectSquad(); const xi=bestXI(); startingXI=xi.players; const ids=new Set(startingXI.map(p=>p.id)); bench=selectedSquad.filter(p=>!ids.has(p.id)).sort(sortPred); render(xi,remaining); els("downloadButton").disabled=false; status(`Prediction complete for GW${currentGameweekId}.`); }catch(e){ console.error(e); status(e.message,true); } finally{ els("predictButton").disabled=false; } }

function renderPitch(formation){ const groups={GKP:[],DEF:[],MID:[],FWD:[]}; startingXI.forEach(p=>groups[p.position]?.push(p)); const line=(cls,arr)=>`<div class="pitch-line ${cls}">${arr.map(token).join('')}</div>`; els("pitch").innerHTML=line('fwd',groups.FWD.sort(sortPred))+line('mid',groups.MID.sort(sortPred))+line('def',groups.DEF.sort(sortPred))+line('gkp',groups.GKP.sort(sortPred)); els("formationText").textContent=`Formation: ${formation}`; els("benchStrip").innerHTML=bench.map(p=>`<span class="bench-chip">${esc(p.position)} · ${esc(p.name)} · ${p.predictedPoints.toFixed(2)}</span>`).join(''); }
function token(p){ return `<div class="player-token"><div class="shirt">${esc(p.position)}</div><strong>${esc(p.name)}</strong><span>${esc(p.team)} · ${p.predictedPoints.toFixed(2)}</span></div>`; }
function row(p, full=false){ return `<tr><td><span class="pill">${p.position}</span></td><td>${esc(p.name)}</td><td>${esc(p.team)}</td><td>${money(p.price).replace('m','')}</td><td class="pred">${p.predictedPoints.toFixed(2)}</td>${full?`<td>${p.valueScore.toFixed(2)}</td>`:''}<td>${p.expectedNext}</td><td>${p.form}</td>${full?`<td>${p.minutes}</td>`:`<td>${p.pointsPerGame}</td>`}<td>${p.totalPoints}</td>${full?'':`<td>${p.selectedByPercent}%</td>`}</tr>`; }
function renderTable(el, rows, full=false){ el.innerHTML = rows.length ? rows.map(p=>row(p,full)).join('') : `<tr><td colspan="10" class="empty">No players found.</td></tr>`; }
function renderSquad(){ const q=els("squadSearchInput").value.trim().toLowerCase(); const rows=selectedSquad.filter(p=>!q || `${p.name} ${p.fullName} ${p.team} ${p.position}`.toLowerCase().includes(q)).sort(sortPred); renderTable(els("squadBody"),rows,true); }
function render(xi,remaining){ const total=selectedSquad.reduce((s,p)=>s+p.nowCost,0)/10, ordered=[...startingXI].sort(sortPred), captain=ordered[0], vice=ordered[1]; els("summaryGameweek").textContent=`GW${currentGameweekId}`; els("summarySeason").textContent=metadata?.inferred_season || inferSeason(bootstrapData.events); els("summaryCost").textContent=money(total); els("summaryRemaining").textContent=money(remaining/10); els("summaryPoints").textContent=xi.score.toFixed(2); els("summaryCaptain").textContent=captain&&vice?`${captain.name} / ${vice.name}`:'-'; renderPitch(xi.formation); renderTable(els("startingBody"),startingXI.sort((a,b)=>a.position.localeCompare(b.position)||b.predictedPoints-a.predictedPoints)); renderSquad(); renderWildcardPicks(); }
function renderWildcardPicks(){ if(!allPlayers.length){ els("wildcardList").innerHTML='<p class="empty">Load data first.</p>'; return; } const selectedIds=new Set(selectedSquad.map(p=>p.id)); let picks=[]; if(currentWildcardTab==='differentials') picks=allPlayers.filter(p=>!selectedIds.has(p.id)&&p.selectedByPercent<10&&p.predictedPoints>0).sort(sortPred).slice(0,8); if(currentWildcardTab==='value') picks=allPlayers.filter(p=>!selectedIds.has(p.id)&&p.valueScore>0).sort((a,b)=>b.valueScore-a.valueScore).slice(0,8); if(currentWildcardTab==='upside') picks=allPlayers.filter(p=>!selectedIds.has(p.id)&&p.predictedPoints>=3).sort((a,b)=>b.predictedPoints-a.predictedPoints).slice(0,8); els("wildcardList").innerHTML=picks.length?picks.map(p=>`<div class="mini-card"><span class="badge">${p.position}</span><div><strong>${esc(p.name)}</strong><small>${esc(p.team)} · ${money(p.price)} · own ${p.selectedByPercent}%</small></div><span class="metric">${currentWildcardTab==='value'?p.valueScore.toFixed(2):p.predictedPoints.toFixed(2)}</span></div>`).join(''):'<p class="empty">No wildcard picks found.</p>'; }
function findPlayerBySearch(){ const q=els("playerSearchInput").value.trim().toLowerCase(); return allPlayers.find(p=>p.name.toLowerCase()===q || p.fullName.toLowerCase()===q) || allPlayers.find(p=>`${p.name} ${p.fullName}`.toLowerCase().includes(q)); }
function loadPlayerStats(){ const p=findPlayerBySearch(); if(!p){ els("playerStatsPanel").innerHTML='<p class="empty">Player not found. Load data first or check spelling.</p>'; return; } els("playerStatsPanel").innerHTML=`<h3>${esc(p.name)} <small>${esc(p.team)} · ${esc(p.position)}</small></h3>${statsGrid(p)}${p.news?`<p class="news"><strong>News:</strong> ${esc(p.news)}</p>`:''}`; }
function statsGrid(p){ const stats=[['Price',money(p.price)],['Predicted',p.predictedPoints.toFixed(2)],['Value',p.valueScore.toFixed(2)],['EP Next',p.expectedNext],['Form',p.form],['PPG',p.pointsPerGame],['Total',p.totalPoints],['Minutes',p.minutes],['Goals',p.goals],['Assists',p.assists],['Clean sheets',p.cleanSheets],['Ownership',`${p.selectedByPercent}%`]]; return `<div class="stats-grid">${stats.map(([a,b])=>`<div class="stat"><span>${a}</span><strong>${b}</strong></div>`).join('')}</div>`; }
function comparePlayers(){ const a=allPlayers.find(p=>p.id===Number(els("compareA").value)); const b=allPlayers.find(p=>p.id===Number(els("compareB").value)); if(!a||!b){ els("comparisonPanel").innerHTML='<p class="empty">Select two players to compare.</p>'; return; } const metrics=[['Price',money(a.price),money(b.price)],['Predicted points',a.predictedPoints.toFixed(2),b.predictedPoints.toFixed(2)],['Value score',a.valueScore.toFixed(2),b.valueScore.toFixed(2)],['EP next',a.expectedNext,b.expectedNext],['Form',a.form,b.form],['PPG',a.pointsPerGame,b.pointsPerGame],['Total points',a.totalPoints,b.totalPoints],['Minutes',a.minutes,b.minutes],['Goals',a.goals,b.goals],['Assists',a.assists,b.assists],['Ownership',`${a.selectedByPercent}%`,`${b.selectedByPercent}%`]]; els("comparisonPanel").innerHTML=`<table class="compare-table"><thead><tr><th>Metric</th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr></thead><tbody>${metrics.map(m=>`<tr><td>${m[0]}</td><td>${m[1]}</td><td>${m[2]}</td></tr>`).join('')}</tbody></table>`; }
function downloadCsv(){ const headers=['Position','Name','FullName','Team','Price','PredictedPoints','ValueScore','ExpectedNext','Form','PointsPerGame','TotalPoints','Minutes','SelectedByPercent','Status']; const rows=selectedSquad.sort(sortPred).map(p=>[p.position,p.name,p.fullName,p.team,p.price,p.predictedPoints,p.valueScore,p.expectedNext,p.form,p.pointsPerGame,p.totalPoints,p.minutes,p.selectedByPercent,p.status]); const csv=[headers,...rows].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n'); const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`Predicted-FPL-Team-GW${currentGameweekId}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

els("loadButton").addEventListener('click',loadData); els("predictButton").addEventListener('click',predictTeam); els("downloadButton").addEventListener('click',downloadCsv); els("squadSearchInput").addEventListener('input',renderSquad); els("playerSearchButton").addEventListener('click',loadPlayerStats); els("compareButton").addEventListener('click',comparePlayers); els("budgetInput").addEventListener('input',()=>{els("budgetDisplay").textContent=money(Number(els("budgetInput").value));}); document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); currentWildcardTab=btn.dataset.tab; renderWildcardPicks();}));
