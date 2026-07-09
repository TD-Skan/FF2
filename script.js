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
const $ = id => document.getElementById(id);

const profiles = {
  balanced: { label: "Balanced", positionBoost: {}, pickOrder: ["FWD", "MID", "MID", "FWD", "DEF", "MID", "DEF", "GKP", "MID", "DEF", "FWD", "MID", "DEF", "GKP", "DEF"], safe: 1, upside: 1, differential: 1 },
  safe: { label: "Safe", positionBoost: { GKP: 1.04, DEF: 1.03 }, pickOrder: ["MID", "DEF", "GKP", "MID", "DEF", "FWD", "MID", "DEF", "GKP", "MID", "DEF", "FWD", "MID", "DEF", "FWD"], safe: 1.14, upside: .92, differential: .95 },
  aggressive: { label: "Risky", positionBoost: { MID: 1.04, FWD: 1.06 }, pickOrder: ["FWD", "FWD", "MID", "MID", "FWD", "MID", "DEF", "MID", "DEF", "GKP", "DEF", "MID", "DEF", "GKP", "DEF"], safe: .9, upside: 1.15, differential: 1.06 },
  "attack-heavy": { label: "Attack-heavy", positionBoost: { MID: 1.08, FWD: 1.12, DEF: .95, GKP: .92 }, pickOrder: ["FWD", "FWD", "MID", "MID", "FWD", "MID", "MID", "DEF", "GKP", "DEF", "MID", "DEF", "DEF", "GKP", "DEF"], safe: .95, upside: 1.12, differential: 1.03 },
  "defence-value": { label: "Defence value", positionBoost: { GKP: 1.08, DEF: 1.10, MID: .98, FWD: .96 }, pickOrder: ["DEF", "GKP", "DEF", "MID", "DEF", "MID", "FWD", "DEF", "MID", "GKP", "DEF", "MID", "FWD", "MID", "FWD"], safe: 1.08, upside: .96, differential: .98 },
  differential: { label: "Differential", positionBoost: { MID: 1.03, FWD: 1.03 }, pickOrder: ["MID", "FWD", "MID", "FWD", "DEF", "MID", "FWD", "DEF", "GKP", "MID", "DEF", "MID", "DEF", "GKP", "DEF"], safe: .92, upside: 1.08, differential: 1.25 }
};

function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function r(v, d = 2) { const m = Math.pow(10, d); return Math.round((n(v) + Number.EPSILON) * m) / m; }
function money(v) { return `£${r(v, 1).toFixed(1)}m`; }
function status(msg, err = false) { $("statusMessage").textContent = msg; $("statusMessage").style.color = err ? "#c1121f" : "#69728a"; }
function sortPred(a, b) { return b.predictedPoints - a.predictedPoints; }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
async function fetchJson(url, optional = false) { const res = await fetch(url, { cache: "no-store" }); if (!res.ok) { if (optional) return null; throw new Error(`${url} returned ${res.status}`); } return await res.json(); }

function validateData() {
  if (!bootstrapData || !Array.isArray(bootstrapData.elements) || !Array.isArray(bootstrapData.events) || !Array.isArray(bootstrapData.teams) || !Array.isArray(bootstrapData.element_types)) throw new Error("data/bootstrap-static.json is not populated yet. Run the GitHub Action named 'Update FPL Data' once, then refresh.");
  if (!Array.isArray(allFixtures)) throw new Error("data/fixtures.json is not populated yet. Run the GitHub Action named 'Update FPL Data' once, then refresh.");
}
function lookup(list, k, v) { const m = new Map(); list.forEach(x => m.set(Number(x[k]), x[v])); return m; }
function inferSeason(events) { const years = events.map(e => e.deadline_time).filter(Boolean).map(d => Number(String(d).slice(0, 4))).filter(Number.isFinite); if (!years.length) return "Unknown"; return `${Math.min(...years)}/${String(Math.max(...years)).slice(-2)}`; }
function detectGameweek() { let e = bootstrapData.events.find(x => x.is_next === true) || bootstrapData.events.find(x => x.is_current === true); if (e) return e; const u = bootstrapData.events.filter(x => x.finished === false).sort((a, b) => a.id - b.id); return u[0] || bootstrapData.events.slice().sort((a, b) => a.id - b.id)[0]; }
function selectedGameweek() { return $("gameweekSelect").value === "auto" ? detectGameweek().id : Number($("gameweekSelect").value); }
function profile() { return profiles[$("riskProfile").value] || profiles.balanced; }

async function loadData(auto = false) {
  try {
    status(auto ? "Auto-loading repository JSON data…" : "Reloading repository JSON data…");
    $("predictButton").disabled = true;
    $("downloadButton").disabled = true;
    bootstrapData = await fetchJson(BOOTSTRAP_URL);
    allFixtures = await fetchJson(FIXTURES_URL);
    metadata = await fetchJson(METADATA_URL, true);
    validateData();
    currentGameweekId = detectGameweek().id;
    fixturesData = allFixtures.filter(f => Number(f.event) === Number(currentGameweekId));
    allPlayers = buildAllPlayers(false);
    populateControls();
    renderTopPlayersTable();
    $("summarySeason").textContent = metadata?.inferred_season || inferSeason(bootstrapData.events);
    $("summaryGameweek").textContent = `GW${currentGameweekId}`;
    $("predictButton").disabled = false;
    status(`Data loaded automatically: ${allPlayers.length} players. Configure options, then click Predict team.`);
  } catch (e) {
    console.error(e);
    status(e.message, true);
    renderTopPlayersTable();
  }
}

function populateControls() {
  $("gameweekSelect").innerHTML = '<option value="auto">Auto detect</option>';
  bootstrapData.events.forEach(e => { const o = document.createElement('option'); o.value = e.id; o.textContent = `${e.name || "GW" + e.id} (${e.id})`; $("gameweekSelect").appendChild(o); });
  const opts = allPlayers.slice().sort((a, b) => a.name.localeCompare(b.name));
  $("playerOptions").innerHTML = opts.map(p => `<option value="${esc(p.name)}">${esc(p.team)} · ${esc(p.position)} · ${money(p.price)}</option>`).join('');
  const html = '<option value="">Select player</option>' + opts.map(p => `<option value="${p.id}">${esc(p.name)} - ${esc(p.team)} (${esc(p.position)})</option>`).join('');
  $("compareA").innerHTML = html;
  $("compareB").innerHTML = html;
  $("playerSearchButton").disabled = false;
  $("compareButton").disabled = false;
}

function buildFixtureLookup() {
  const raw = new Map();
  fixturesData.forEach(f => {
    if (!raw.has(Number(f.team_h))) raw.set(Number(f.team_h), []);
    if (!raw.has(Number(f.team_a))) raw.set(Number(f.team_a), []);
    raw.get(Number(f.team_h)).push(n(f.team_h_difficulty));
    raw.get(Number(f.team_a)).push(n(f.team_a_difficulty));
  });
  const out = new Map();
  raw.forEach((vals, teamId) => out.set(teamId, { averageDifficulty: r(vals.reduce((a, b) => a + b, 0) / vals.length, 2), fixtureCount: vals.length }));
  return out;
}

function scorePlayer(p, fxLookup) {
  const cfg = profile();
  const epNext = n(p.ep_next), epThis = n(p.ep_this), form = n(p.form), ppg = n(p.points_per_game);
  let base = ppg;
  if (epNext > 0) base = epNext; else if (epThis > 0) base = epThis; else if (form > 0) base = form;
  let fixtureMult = .70;
  const fx = fxLookup.get(Number(p.team));
  if (fx) { fixtureMult = 1 + ((3 - fx.averageDifficulty) * .08); if (fx.fixtureCount > 1) fixtureMult += (fx.fixtureCount - 1) * .15; }
  const mins = n(p.minutes);
  let minutesMult = mins >= 900 ? 1 : mins >= 450 ? .85 : mins > 0 ? .65 : .35;
  minutesMult = 1 + ((minutesMult - 1) * cfg.safe);
  let availMult = .4;
  if (p.chance_of_playing_next_round !== null && p.chance_of_playing_next_round !== undefined) availMult = n(p.chance_of_playing_next_round) / 100;
  else if (p.status === 'a') availMult = 1;
  availMult = 1 + ((availMult - 1) * cfg.safe);
  const own = n(p.selected_by_percent);
  let pop = own >= 20 ? 1.04 : own >= 10 ? 1.02 : 1;
  if (cfg.differential > 1 && own < 10) pop *= cfg.differential;
  const pos = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' }[Number(p.element_type)] || 'UNK';
  const posBoost = cfg.positionBoost[pos] || 1;
  const upsideBoost = 1 + ((fixtureMult - 1) * (cfg.upside - 1));
  return r(base * fixtureMult * minutesMult * availMult * pop * posBoost * upsideBoost, 2);
}

function buildAllPlayers(applyChance = true) {
  const teams = lookup(bootstrapData.teams, 'id', 'name');
  const positions = lookup(bootstrapData.element_types, 'id', 'singular_name_short');
  const fx = buildFixtureLookup();
  const minChance = Number($("chanceInput")?.value ?? 0);
  return bootstrapData.elements
    .filter(p => { if (!applyChance) return true; if (p.status === 'a') return true; const c = p.chance_of_playing_next_round; if (c === null || c === undefined) return minChance === 0; return Number(c) >= minChance; })
    .map(p => {
      const price = r(n(p.now_cost) / 10, 1);
      const pred = scorePlayer(p, fx);
      return { id: Number(p.id), name: p.web_name || `${p.first_name} ${p.second_name}`, fullName: `${p.first_name || ''} ${p.second_name || ''}`.trim(), teamId: Number(p.team), team: teams.get(Number(p.team)) || 'Unknown', position: positions.get(Number(p.element_type)) || 'UNK', nowCost: Number(p.now_cost), price, totalPoints: Number(p.total_points) || 0, form: n(p.form), pointsPerGame: n(p.points_per_game), expectedNext: n(p.ep_next), expectedThis: n(p.ep_this), minutes: Number(p.minutes) || 0, selectedByPercent: n(p.selected_by_percent), status: p.status, news: p.news || '', goals: Number(p.goals_scored) || 0, assists: Number(p.assists) || 0, cleanSheets: Number(p.clean_sheets) || 0, bonus: Number(p.bonus) || 0, predictedPoints: pred, valueScore: price > 0 ? r(pred / price, 2) : 0 };
    });
}

function renderTopPlayersTable() {
  const tbody = $("topPlayersBody");
  if (!tbody) return;

  if (!allPlayers || allPlayers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty">Top players will appear once the FPL data has loaded.</td></tr>`;
    return;
  }

  const positionFilter = $("topPlayersPositionFilter") ? $("topPlayersPositionFilter").value : "all";
  const searchText = $("topPlayersSearchInput") ? $("topPlayersSearchInput").value.trim().toLowerCase() : "";

  const rows = allPlayers
    .filter(player => {
      if (positionFilter !== "all" && player.position !== positionFilter) return false;
      if (!searchText) return true;
      return `${player.name} ${player.fullName} ${player.team}`.toLowerCase().includes(searchText);
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 50);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty">No players found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((player, index) => {
    const rank = index + 1;
    const rankClass = rank <= 3 ? "rank-badge top-three" : "rank-badge";
    return `<tr><td><span class="${rankClass}">${rank}</span></td><td><span class="pill">${esc(player.position)}</span></td><td>${esc(player.name)}</td><td>${esc(player.team)}</td><td>${money(player.price).replace("m", "")}</td><td class="total-points">${player.totalPoints}</td><td>${player.pointsPerGame}</td><td>${player.form}</td><td>${player.goals}</td><td>${player.assists}</td><td>${player.selectedByPercent}%</td></tr>`;
  }).join("");
}

function buildPlayerPool() { playerPool = buildAllPlayers(true); }
function minRemainingCost(rem) { let total = 0; for (const pos of Object.keys(rem)) { const need = rem[pos]; if (need <= 0) continue; const cheapest = playerPool.filter(p => p.position === pos).sort((a, b) => a.nowCost - b.nowCost).slice(0, need); if (cheapest.length < need) return 999999; total += cheapest.reduce((s, p) => s + p.nowCost, 0); } return total; }
function pickBest(pos, rem, budget, clubs) { const chosen = new Set(selectedSquad.map(p => p.id)); const candidates = playerPool.filter(p => p.position === pos && !chosen.has(p.id) && p.nowCost <= budget).sort(sortPred); for (const c of candidates) { if ((clubs.get(c.teamId) || 0) >= maxPlayersPerClub) continue; const test = { ...rem }; test[pos] -= 1; if (budget - c.nowCost >= minRemainingCost(test)) return c; } return null; }
function selectSquad() { selectedSquad = []; let budget = Math.round(Number($("budgetInput").value) * 10); const rem = { ...requiredSquad }, clubs = new Map(); for (const pos of profile().pickOrder) { if (rem[pos] <= 0) continue; const best = pickBest(pos, rem, budget, clubs); if (!best) throw new Error(`Could not find a valid ${pos} within budget. Try increasing budget or reducing the chance filter.`); selectedSquad.push(best); budget -= best.nowCost; rem[pos] -= 1; clubs.set(best.teamId, (clubs.get(best.teamId) || 0) + 1); } return budget; }
function allowedFormations() { const pref = $("formationSelect").value; const all = [{ name: '3-4-3', DEF: 3, MID: 4, FWD: 3 }, { name: '3-5-2', DEF: 3, MID: 5, FWD: 2 }, { name: '4-3-3', DEF: 4, MID: 3, FWD: 3 }, { name: '4-4-2', DEF: 4, MID: 4, FWD: 2 }, { name: '4-5-1', DEF: 4, MID: 5, FWD: 1 }, { name: '5-3-2', DEF: 5, MID: 3, FWD: 2 }, { name: '5-4-1', DEF: 5, MID: 4, FWD: 1 }]; return pref === 'auto' ? all : all.filter(f => f.name === pref); }
function bestXI() { let best = { formation: '', players: [], score: -1 }; for (const f of allowedFormations()) { const players = [...selectedSquad.filter(p => p.position === 'GKP').sort(sortPred).slice(0, 1), ...selectedSquad.filter(p => p.position === 'DEF').sort(sortPred).slice(0, f.DEF), ...selectedSquad.filter(p => p.position === 'MID').sort(sortPred).slice(0, f.MID), ...selectedSquad.filter(p => p.position === 'FWD').sort(sortPred).slice(0, f.FWD)]; if (players.length !== 11) continue; const score = r(players.reduce((s, p) => s + p.predictedPoints, 0), 2); if (score > best.score) best = { formation: f.name, players, score }; } return best; }

async function predictTeam() {
  try {
    if (!bootstrapData) throw new Error('Data is still loading.');
    $("predictButton").disabled = true;
    $("downloadButton").disabled = true;
    currentGameweekId = selectedGameweek();
    fixturesData = allFixtures.filter(f => Number(f.event) === Number(currentGameweekId));
    allPlayers = buildAllPlayers(false);
    renderTopPlayersTable();
    buildPlayerPool();
    const remaining = selectSquad();
    const xi = bestXI();
    if (!xi.players.length) throw new Error('Selected formation could not be built from the generated squad. Choose Auto best formation.');
    startingXI = xi.players;
    const ids = new Set(startingXI.map(p => p.id));
    bench = selectedSquad.filter(p => !ids.has(p.id)).sort(sortPred);
    render(xi, remaining);
    $("downloadButton").disabled = false;
    status(`Prediction complete for GW${currentGameweekId}.`);
  } catch (e) {
    console.error(e);
    status(e.message, true);
  } finally {
    $("predictButton").disabled = false;
  }
}

function renderPitch(formation) { const groups = { GKP: [], DEF: [], MID: [], FWD: [] }; startingXI.forEach(p => groups[p.position]?.push(p)); const line = (cls, arr) => `<div class="pitch-line ${cls}">${arr.map(token).join('')}</div>`; $("pitch").innerHTML = line('fwd', groups.FWD.sort(sortPred)) + line('mid', groups.MID.sort(sortPred)) + line('def', groups.DEF.sort(sortPred)) + line('gkp', groups.GKP.sort(sortPred)); $("formationText").textContent = `Formation: ${formation}`; $("benchStrip").innerHTML = bench.map(p => `<span class="bench-chip">${esc(p.position)} · ${esc(p.name)} · ${p.predictedPoints.toFixed(2)}</span>`).join(''); }
function token(p) { return `<div class="player-token"><div class="shirt">${esc(p.position)}</div><strong>${esc(p.name)}</strong><span>${esc(p.team)} · ${p.predictedPoints.toFixed(2)}</span></div>`; }
function row(p, full = false) { return `<tr><td><span class="pill">${p.position}</span></td><td>${esc(p.name)}</td><td>${esc(p.team)}</td><td>${money(p.price).replace('m', '')}</td><td class="pred">${p.predictedPoints.toFixed(2)}</td>${full ? `<td>${p.valueScore.toFixed(2)}</td>` : ''}<td>${p.expectedNext}</td><td>${p.form}</td>${full ? `<td>${p.minutes}</td>` : `<td>${p.pointsPerGame}</td>`}<td>${p.totalPoints}</td>${full ? '' : `<td>${p.selectedByPercent}%</td>`}</tr>`; }
function renderTable(el, rows, full = false) { el.innerHTML = rows.length ? rows.map(p => row(p, full)).join('') : `<tr><td colspan="10" class="empty">No players found.</td></tr>`; }
function renderSquad() { const q = $("squadSearchInput").value.trim().toLowerCase(); const rows = selectedSquad.filter(p => !q || `${p.name} ${p.fullName} ${p.team} ${p.position}`.toLowerCase().includes(q)).sort(sortPred); renderTable($("squadBody"), rows, true); }
function render(xi, remaining) { const total = selectedSquad.reduce((s, p) => s + p.nowCost, 0) / 10, ordered = [...startingXI].sort(sortPred), captain = ordered[0], vice = ordered[1]; $("summaryGameweek").textContent = `GW${currentGameweekId}`; $("summarySeason").textContent = metadata?.inferred_season || inferSeason(bootstrapData.events); $("summaryConfig").textContent = `${$("formationSelect").value === 'auto' ? 'Auto' : $("formationSelect").value} · ${profile().label}`; $("summaryCost").textContent = money(total); $("summaryPoints").textContent = xi.score.toFixed(2); $("summaryCaptain").textContent = captain && vice ? `${captain.name} / ${vice.name}` : '-'; renderPitch(xi.formation); renderTable($("startingBody"), startingXI.sort((a, b) => a.position.localeCompare(b.position) || b.predictedPoints - a.predictedPoints)); renderSquad(); renderWildcardPicks(); }
function renderWildcardPicks() { if (!allPlayers.length) { $("wildcardList").innerHTML = '<p class="empty">Load data first.</p>'; return; } const selectedIds = new Set(selectedSquad.map(p => p.id)); let picks = []; if (currentWildcardTab === 'differentials') picks = allPlayers.filter(p => !selectedIds.has(p.id) && p.selectedByPercent < 10 && p.predictedPoints > 0).sort(sortPred).slice(0, 8); if (currentWildcardTab === 'value') picks = allPlayers.filter(p => !selectedIds.has(p.id) && p.valueScore > 0).sort((a, b) => b.valueScore - a.valueScore).slice(0, 8); if (currentWildcardTab === 'upside') picks = allPlayers.filter(p => !selectedIds.has(p.id) && p.predictedPoints >= 3).sort(sortPred).slice(0, 8); $("wildcardList").innerHTML = picks.length ? picks.map(p => `<div class="mini-card"><span class="badge">${p.position}</span><div><strong>${esc(p.name)}</strong><small>${esc(p.team)} · ${money(p.price)} · own ${p.selectedByPercent}%</small></div><span class="metric">${currentWildcardTab === 'value' ? p.valueScore.toFixed(2) : p.predictedPoints.toFixed(2)}</span></div>`).join('') : '<p class="empty">No wildcard picks found.</p>'; }
function findPlayerBySearch() { const q = $("playerSearchInput").value.trim().toLowerCase(); return allPlayers.find(p => p.name.toLowerCase() === q || p.fullName.toLowerCase() === q) || allPlayers.find(p => `${p.name} ${p.fullName}`.toLowerCase().includes(q)); }
function statsGrid(p) { const stats = [['Price', money(p.price)], ['Predicted', p.predictedPoints.toFixed(2)], ['Value', p.valueScore.toFixed(2)], ['EP Next', p.expectedNext], ['Form', p.form], ['PPG', p.pointsPerGame], ['Total', p.totalPoints], ['Minutes', p.minutes], ['Goals', p.goals], ['Assists', p.assists], ['Clean sheets', p.cleanSheets], ['Ownership', `${p.selectedByPercent}%`]]; return `<div class="stats-grid">${stats.map(([a, b]) => `<div class="stat"><span>${a}</span><strong>${b}</strong></div>`).join('')}</div>`; }
function loadPlayerStats() { const p = findPlayerBySearch(); $("playerStatsPanel").innerHTML = p ? `<h3>${esc(p.name)} <small>${esc(p.team)} · ${esc(p.position)}</small></h3>${statsGrid(p)}${p.news ? `<p><strong>News:</strong> ${esc(p.news)}</p>` : ''}` : '<p class="empty">Player not found. Load data first or check spelling.</p>'; }
function comparePlayers() { const a = allPlayers.find(p => p.id === Number($("compareA").value)), b = allPlayers.find(p => p.id === Number($("compareB").value)); if (!a || !b) { $("comparisonPanel").innerHTML = '<p class="empty">Select two players to compare.</p>'; return; } const metrics = [['Price', money(a.price), money(b.price)], ['Predicted points', a.predictedPoints.toFixed(2), b.predictedPoints.toFixed(2)], ['Value score', a.valueScore.toFixed(2), b.valueScore.toFixed(2)], ['EP next', a.expectedNext, b.expectedNext], ['Form', a.form, b.form], ['PPG', a.pointsPerGame, b.pointsPerGame], ['Total points', a.totalPoints, b.totalPoints], ['Minutes', a.minutes, b.minutes], ['Goals', a.goals, b.goals], ['Assists', a.assists, b.assists], ['Ownership', `${a.selectedByPercent}%`, `${b.selectedByPercent}%`]]; $("comparisonPanel").innerHTML = `<table class="compare-table"><thead><tr><th>Metric</th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr></thead><tbody>${metrics.map(m => `<tr><td>${m[0]}</td><td>${m[1]}</td><td>${m[2]}</td></tr>`).join('')}</tbody></table>`; }
function downloadCsv() { const headers = ['Position', 'Name', 'FullName', 'Team', 'Price', 'PredictedPoints', 'ValueScore', 'ExpectedNext', 'Form', 'PointsPerGame', 'TotalPoints', 'Minutes', 'SelectedByPercent', 'Status']; const rows = selectedSquad.sort(sortPred).map(p => [p.position, p.name, p.fullName, p.team, p.price, p.predictedPoints, p.valueScore, p.expectedNext, p.form, p.pointsPerGame, p.totalPoints, p.minutes, p.selectedByPercent, p.status]); const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Predicted-FPL-Team-GW${currentGameweekId}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

$("predictButton").addEventListener('click', predictTeam);
$("reloadButton").addEventListener('click', () => loadData(false));
$("downloadButton").addEventListener('click', downloadCsv);
$("squadSearchInput").addEventListener('input', renderSquad);
$("playerSearchButton").addEventListener('click', loadPlayerStats);
$("compareButton").addEventListener('click', comparePlayers);
$("budgetInput").addEventListener('input', () => { $("budgetDisplay").textContent = money(Number($("budgetInput").value)); });
$("topPlayersPositionFilter").addEventListener('change', renderTopPlayersTable);
$("topPlayersSearchInput").addEventListener('input', renderTopPlayersTable);
document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentWildcardTab = btn.dataset.tab; renderWildcardPicks(); }));
document.addEventListener('DOMContentLoaded', () => loadData(true));
