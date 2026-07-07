const BOOTSTRAP_URL = "./data/bootstrap-static.json";
const FIXTURES_URL = "./data/fixtures.json";

let bootstrapData = null;
let allFixtures = [];
let fixturesData = [];
let playerPool = [];
let selectedSquad = [];
let startingXI = [];
let bench = [];
let currentGameweekId = null;

const requiredSquad = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
const maxPlayersPerClub = 3;

const els = {
  budgetInput: document.getElementById("budgetInput"), budgetDisplay: document.getElementById("budgetDisplay"),
  gameweekSelect: document.getElementById("gameweekSelect"), chanceInput: document.getElementById("chanceInput"),
  searchInput: document.getElementById("searchInput"), loadButton: document.getElementById("loadButton"),
  predictButton: document.getElementById("predictButton"), downloadButton: document.getElementById("downloadButton"),
  statusMessage: document.getElementById("statusMessage"), summaryGameweek: document.getElementById("summaryGameweek"),
  summaryCost: document.getElementById("summaryCost"), summaryRemaining: document.getElementById("summaryRemaining"),
  summaryPoints: document.getElementById("summaryPoints"), summaryFormation: document.getElementById("summaryFormation"),
  summaryCaptain: document.getElementById("summaryCaptain"), startingBody: document.getElementById("startingBody"),
  benchBody: document.getElementById("benchBody"), squadBody: document.getElementById("squadBody")
};

function n(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
function r(v,d=2){ const m = Math.pow(10,d); return Math.round((n(v)+Number.EPSILON)*m)/m; }
function money(v){ return `£${r(v,1).toFixed(1)}m`; }
function status(msg,err=false){ els.statusMessage.textContent = msg; els.statusMessage.style.color = err ? "#c1121f" : "#69728a"; }
function sortPred(a,b){ return b.predictedPoints - a.predictedPoints; }

async function fetchJson(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`${url} returned ${res.status}`);
  return await res.json();
}

function validateData(){
  if(!bootstrapData || !Array.isArray(bootstrapData.elements) || !Array.isArray(bootstrapData.teams) || !Array.isArray(bootstrapData.events) || !Array.isArray(bootstrapData.element_types)){
    throw new Error("data/bootstrap-static.json is not populated yet. Run the GitHub Action named 'Update FPL Data' once, then refresh the site.");
  }
  if(!Array.isArray(allFixtures)) throw new Error("data/fixtures.json is not populated yet. Run the GitHub Action named 'Update FPL Data' once, then refresh the site.");
}

function detectGameweek(){
  let e = bootstrapData.events.find(x => x.is_next === true);
  if(e) return e;
  e = bootstrapData.events.find(x => x.is_current === true);
  if(e) return e;
  const unfinished = bootstrapData.events.filter(x => x.finished === false).sort((a,b)=>a.id-b.id);
  if(unfinished.length) return unfinished[0];
  return bootstrapData.events.slice().sort((a,b)=>a.id-b.id)[0];
}

function populateGameweeks(){
  els.gameweekSelect.innerHTML = '<option value="auto">Auto detect</option>';
  bootstrapData.events.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = `${e.name || 'GW ' + e.id} (${e.id})`;
    els.gameweekSelect.appendChild(opt);
  });
}

async function loadData(){
  try{
    status("Loading repository JSON data...");
    els.loadButton.disabled = true; els.predictButton.disabled = true; els.downloadButton.disabled = true;
    bootstrapData = await fetchJson(BOOTSTRAP_URL);
    allFixtures = await fetchJson(FIXTURES_URL);
    validateData();
    populateGameweeks();
    currentGameweekId = detectGameweek().id;
    fixturesData = allFixtures.filter(f => Number(f.event) === Number(currentGameweekId));
    els.predictButton.disabled = false;
    status(`Loaded ${bootstrapData.elements.length} players. Auto gameweek: GW${currentGameweekId}.`);
  }catch(e){ console.error(e); status(e.message, true); }
  finally{ els.loadButton.disabled = false; }
}

function lookup(list, keyField, valueField){ const m = new Map(); list.forEach(x => m.set(Number(x[keyField]), x[valueField])); return m; }

function selectedGameweek(){
  if(els.gameweekSelect.value === 'auto') return detectGameweek().id;
  return Number(els.gameweekSelect.value);
}

function buildFixtureLookup(){
  const raw = new Map();
  fixturesData.forEach(f => {
    if(!raw.has(Number(f.team_h))) raw.set(Number(f.team_h), []);
    if(!raw.has(Number(f.team_a))) raw.set(Number(f.team_a), []);
    raw.get(Number(f.team_h)).push(n(f.team_h_difficulty));
    raw.get(Number(f.team_a)).push(n(f.team_a_difficulty));
  });
  const out = new Map();
  raw.forEach((vals, teamId) => {
    out.set(teamId, { averageDifficulty: r(vals.reduce((a,b)=>a+b,0)/vals.length,2), fixtureCount: vals.length });
  });
  return out;
}

function scorePlayer(p, fixtureLookup){
  const epNext = n(p.ep_next), epThis = n(p.ep_this), form = n(p.form), ppg = n(p.points_per_game);
  let base = ppg;
  if(epNext > 0) base = epNext; else if(epThis > 0) base = epThis; else if(form > 0) base = form;
  let fixtureMult = 0.70;
  const fx = fixtureLookup.get(Number(p.team));
  if(fx){ fixtureMult = 1 + ((3 - fx.averageDifficulty) * 0.08); if(fx.fixtureCount > 1) fixtureMult += (fx.fixtureCount - 1) * 0.15; }
  const mins = n(p.minutes);
  let minutesMult = mins >= 900 ? 1 : mins >= 450 ? 0.85 : mins > 0 ? 0.65 : 0.35;
  let availMult = 0.4;
  if(p.chance_of_playing_next_round !== null && p.chance_of_playing_next_round !== undefined) availMult = n(p.chance_of_playing_next_round) / 100;
  else if(p.status === 'a') availMult = 1;
  const own = n(p.selected_by_percent);
  const popMult = own >= 20 ? 1.04 : own >= 10 ? 1.02 : 1;
  return r(base * fixtureMult * minutesMult * availMult * popMult, 2);
}

function buildPlayerPool(){
  const teams = lookup(bootstrapData.teams, 'id', 'name');
  const positions = lookup(bootstrapData.element_types, 'id', 'singular_name_short');
  const fixtureLookup = buildFixtureLookup();
  const minChance = Number(els.chanceInput.value);
  playerPool = bootstrapData.elements.filter(p => {
    if(p.status === 'a') return true;
    const c = p.chance_of_playing_next_round;
    if(c === null || c === undefined) return minChance === 0;
    return Number(c) >= minChance;
  }).map(p => {
    const price = r(n(p.now_cost)/10,1);
    const pred = scorePlayer(p, fixtureLookup);
    return {
      id:Number(p.id), name:p.web_name || `${p.first_name} ${p.second_name}`, fullName:`${p.first_name || ''} ${p.second_name || ''}`.trim(),
      teamId:Number(p.team), team:teams.get(Number(p.team)) || 'Unknown', position:positions.get(Number(p.element_type)) || 'UNK', nowCost:Number(p.now_cost), price,
      totalPoints:Number(p.total_points)||0, form:n(p.form), pointsPerGame:n(p.points_per_game), expectedNext:n(p.ep_next), minutes:Number(p.minutes)||0,
      selectedByPercent:n(p.selected_by_percent), status:p.status, predictedPoints:pred, valueScore:price>0 ? r(pred/price,2) : 0
    };
  });
}

function minRemainingCost(rem){
  let total=0;
  for(const pos of Object.keys(rem)){
    const need = rem[pos]; if(need<=0) continue;
    const cheapest = playerPool.filter(p=>p.position===pos).sort((a,b)=>a.nowCost-b.nowCost).slice(0, need);
    if(cheapest.length < need) return 999999;
    total += cheapest.reduce((s,p)=>s+p.nowCost,0);
  }
  return total;
}

function pickBest(pos, rem, budget, clubCounts){
  const chosen = new Set(selectedSquad.map(p=>p.id));
  const candidates = playerPool.filter(p=>p.position===pos && !chosen.has(p.id) && p.nowCost<=budget).sort(sortPred);
  for(const c of candidates){
    const clubCount = clubCounts.get(c.teamId) || 0;
    if(clubCount >= maxPlayersPerClub) continue;
    const testRem = {...rem}; testRem[pos] -= 1;
    const testBudget = budget - c.nowCost;
    if(testBudget >= minRemainingCost(testRem)) return c;
  }
  return null;
}

function selectSquad(){
  selectedSquad=[];
  let budget = Math.round(Number(els.budgetInput.value)*10);
  const rem = {...requiredSquad};
  const clubs = new Map();
  const order = ['FWD','MID','MID','FWD','DEF','MID','DEF','GKP','MID','DEF','FWD','MID','DEF','GKP','DEF'];
  for(const pos of order){
    if(rem[pos] <= 0) continue;
    const best = pickBest(pos, rem, budget, clubs);
    if(!best) throw new Error(`Could not find a valid ${pos} within budget. Try increasing budget or reducing chance filter.`);
    selectedSquad.push(best); budget -= best.nowCost; rem[pos] -= 1; clubs.set(best.teamId, (clubs.get(best.teamId)||0)+1);
  }
  return budget;
}

function bestXI(){
  const formations = [{DEF:3,MID:4,FWD:3},{DEF:3,MID:5,FWD:2},{DEF:4,MID:3,FWD:3},{DEF:4,MID:4,FWD:2},{DEF:4,MID:5,FWD:1},{DEF:5,MID:3,FWD:2},{DEF:5,MID:4,FWD:1}];
  let best = {formation:'', players:[], score:-1};
  for(const f of formations){
    const players = [
      ...selectedSquad.filter(p=>p.position==='GKP').sort(sortPred).slice(0,1),
      ...selectedSquad.filter(p=>p.position==='DEF').sort(sortPred).slice(0,f.DEF),
      ...selectedSquad.filter(p=>p.position==='MID').sort(sortPred).slice(0,f.MID),
      ...selectedSquad.filter(p=>p.position==='FWD').sort(sortPred).slice(0,f.FWD)
    ];
    if(players.length !== 11) continue;
    const score = r(players.reduce((s,p)=>s+p.predictedPoints,0),2);
    if(score > best.score) best = {formation:`${f.DEF}-${f.MID}-${f.FWD}`, players, score};
  }
  return best;
}

async function predictTeam(){
  try{
    if(!bootstrapData) throw new Error('Load data first.');
    els.predictButton.disabled = true; els.downloadButton.disabled = true;
    currentGameweekId = selectedGameweek();
    fixturesData = allFixtures.filter(f => Number(f.event) === Number(currentGameweekId));
    buildPlayerPool();
    if(playerPool.length < 15) throw new Error('Not enough eligible players in data. Try minimum chance = Include all.');
    const remaining = selectSquad();
    const xi = bestXI();
    startingXI = xi.players;
    const ids = new Set(startingXI.map(p=>p.id));
    bench = selectedSquad.filter(p=>!ids.has(p.id)).sort(sortPred);
    render(xi, remaining);
    els.downloadButton.disabled = false;
    status(`Prediction complete for GW${currentGameweekId}.`);
  }catch(e){ console.error(e); status(e.message, true); }
  finally{ els.predictButton.disabled = false; }
}

function row(p, full=false){
  return `<tr><td><span class="pill">${p.position}</span></td><td>${esc(p.name)}</td><td>${esc(p.team)}</td><td>${money(p.price).replace('m','')}</td><td class="pred">${p.predictedPoints.toFixed(2)}</td>${full?`<td>${p.valueScore.toFixed(2)}</td>`:''}<td>${p.expectedNext}</td><td>${p.form}</td>${full?`<td>${p.minutes}</td>`:`<td>${p.pointsPerGame}</td>`}<td>${p.totalPoints}</td>${full?'':`<td>${p.selectedByPercent}%</td>`}</tr>`;
}
function esc(v){ return String(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function renderTable(el, rows, full=false){ el.innerHTML = rows.length ? rows.map(p=>row(p, full)).join('') : `<tr><td colspan="10" class="empty">No players found.</td></tr>`; }
function renderSquad(){
  const q = els.searchInput.value.trim().toLowerCase();
  const rows = selectedSquad.filter(p => !q || `${p.name} ${p.fullName} ${p.team} ${p.position}`.toLowerCase().includes(q)).sort(sortPred);
  renderTable(els.squadBody, rows, true);
}
function render(xi, remaining){
  const totalCost = selectedSquad.reduce((s,p)=>s+p.nowCost,0)/10;
  const orderedXI = [...startingXI].sort(sortPred);
  const captain = orderedXI[0], vice = orderedXI[1];
  els.summaryGameweek.textContent = `GW${currentGameweekId}`;
  els.summaryCost.textContent = money(totalCost);
  els.summaryRemaining.textContent = money(remaining/10);
  els.summaryPoints.textContent = xi.score.toFixed(2);
  els.summaryFormation.textContent = xi.formation;
  els.summaryCaptain.textContent = captain && vice ? `${captain.name} / ${vice.name}` : '-';
  renderTable(els.startingBody, startingXI.sort((a,b)=>a.position.localeCompare(b.position)||b.predictedPoints-a.predictedPoints));
  renderTable(els.benchBody, bench);
  renderSquad();
}

function downloadCsv(){
  const headers = ['Position','Name','FullName','Team','Price','PredictedPoints','ValueScore','ExpectedNext','Form','PointsPerGame','TotalPoints','Minutes','SelectedByPercent','Status'];
  const rows = selectedSquad.sort(sortPred).map(p => [p.position,p.name,p.fullName,p.team,p.price,p.predictedPoints,p.valueScore,p.expectedNext,p.form,p.pointsPerGame,p.totalPoints,p.minutes,p.selectedByPercent,p.status]);
  const csv = [headers,...rows].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`Predicted-FPL-Team-GW${currentGameweekId}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

els.loadButton.addEventListener('click', loadData);
els.predictButton.addEventListener('click', predictTeam);
els.downloadButton.addEventListener('click', downloadCsv);
els.searchInput.addEventListener('input', renderSquad);
els.budgetInput.addEventListener('input', () => { els.budgetDisplay.textContent = money(Number(els.budgetInput.value)); });
