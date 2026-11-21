/* ensemble_prediction.js — Ensemble Prediction Centre */

let activeDistrict = "Bengaluru Urban";
let activeTarget = "temperature";
let ensembleChart = null;
let weightsChart = null;
let lastEvaluation = null;

async function renderEnsemblePrediction() {
  const main = layout("ensemble-prediction");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Ensemble Prediction Centre</h1>
        <p class="page-description">
          Consensus forecasting combining Ridge Regression, Random Forest, Gradient Boosting, and Decision Trees. Quantifies forecast uncertainty, multi-model variance, and 95% empirical confidence intervals calibrated on hold-out validation splits.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <select id="ensDistrictSelect" class="form-select" onchange="switchEnsDistrict(this.value)" style="background:var(--card-bg); color:var(--text-primary); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px; min-width:180px"></select>
        <select id="ensTargetSelect" class="form-select" onchange="switchEnsTarget(this.value)" style="background:var(--card-bg); color:var(--text-primary); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px">
          <option value="temperature">Target: Mean Temperature (°C)</option>
          <option value="rainfall">Target: Precipitation (mm)</option>
        </select>
        <button class="btn btn-secondary" onclick="loadEnsembleData()">🔄 Recalculate Consensus</button>
      </div>
    </div>

    <!-- KPI ROW -->
    <div class="grid grid-4" style="margin-bottom:20px">
      <div class="card kpi-card">
        <div class="kpi-label">WEIGHTED ENSEMBLE CONSENSUS</div>
        <div class="kpi-value" id="kpiEnsConsensus" style="color:var(--cyan)">--</div>
        <div class="kpi-sub">RMSE-weighted expectation</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">95% CONFIDENCE INTERVAL</div>
        <div class="kpi-value" id="kpiEnsCI" style="color:#38bdf8; font-size:18px">--</div>
        <div class="kpi-sub">Empirical ±1.96σ bounds</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">PREDICTION UNCERTAINTY</div>
        <div class="kpi-value" id="kpiEnsUncertainty" style="color:#10b981; font-size:16px">--</div>
        <div class="kpi-sub" id="kpiEnsScore">Confidence score: --%</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">MODEL SPREAD (MAX - MIN)</div>
        <div class="kpi-value" id="kpiEnsSpread" style="color:#f59e0b">--</div>
        <div class="kpi-sub" id="kpiEnsVar">Variance: --</div>
      </div>
    </div>

    <!-- CHARTS ROW: SPREAD BAR & WEIGHTS DONUT -->
    <div class="grid grid-2" style="margin-bottom:20px">
      <!-- MODEL PREDICTIONS BAR -->
      <div class="card">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
          <span>📊 Individual Models vs Ensemble Consensus</span>
          <span style="font-size:12px; color:var(--text-muted)">Selected District Forecast</span>
        </div>
        <div style="height:280px; position:relative; margin-top:10px">
          <canvas id="ensembleModelsChart"></canvas>
        </div>
      </div>

      <!-- WEIGHTS DOUGHNUT -->
      <div class="card">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
          <span>⚖️ Inverse-RMSE Performance Weights</span>
          <span style="font-size:12px; color:var(--text-muted)">Validation Calibration</span>
        </div>
        <div style="height:280px; position:relative; margin-top:10px">
          <canvas id="ensembleWeightsChart"></canvas>
        </div>
      </div>
    </div>

    <!-- BENCHMARK TABLE: INDIVIDUAL VS ENSEMBLE -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
        <span>🏆 Validation Benchmarks: Individual Base Models vs Ensembles</span>
        <span class="badge badge-normal" id="ensImprovementBadge">ENSEMBLE ADVANTAGE</span>
      </div>
      <div style="overflow-x:auto; margin-top:12px">
        <table class="table" id="ensembleBenchmarkTable">
          <thead>
            <tr>
              <th>Architecture / Method</th>
              <th>Type</th>
              <th>MAE</th>
              <th>RMSE</th>
              <th>R² Score</th>
              <th>Weighting Scheme</th>
            </tr>
          </thead>
          <tbody id="ensembleBenchmarkTbody">
            <tr><td colspan="6" style="text-align:center; padding:20px">Loading validation benchmarks...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  await populateDistricts();
  await loadEnsembleData();
}

async function populateDistricts() {
  const sel = document.getElementById("ensDistrictSelect");
  if (!sel) return;

  const districts = [
    "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban",
    "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga",
    "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri",
    "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur",
    "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada",
    "Vijayanagara", "Vijayapura", "Yadgir"
  ];

  sel.innerHTML = "";
  districts.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    if (d === activeDistrict) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function switchEnsDistrict(d) {
  activeDistrict = d;
  await loadEnsembleData();
}

async function switchEnsTarget(t) {
  activeTarget = t;
  await loadEnsembleData();
}

async function loadEnsembleData() {
  try {
    const evalData = await api(`/api/ensemble-prediction/evaluation?target=${activeTarget}`);
    const predData = await api(`/api/ensemble-prediction/predict?district=${encodeURIComponent(activeDistrict)}&target=${activeTarget}`);

    lastEvaluation = evalData;
    updateEnsembleUI(evalData.data, predData);
  } catch (err) {
    console.error("Ensemble error:", err);
  }
}

function updateEnsembleUI(evalData, predData) {
  const unit = predData.unit || "°C";
  const unc = predData.uncertainty || {};

  document.getElementById("kpiEnsConsensus").textContent = `${predData.recommended_ensemble_prediction} ${unit}`;
  document.getElementById("kpiEnsCI").textContent = unc.ci_95 ? unc.ci_95.format : "--";
  document.getElementById("kpiEnsUncertainty").textContent = unc.uncertainty_level || "--";
  document.getElementById("kpiEnsUncertainty").style.color = unc.badge_color || "#10b981";
  document.getElementById("kpiEnsScore").textContent = `Consensus index: ${unc.confidence_score}%`;
  document.getElementById("kpiEnsSpread").textContent = `${unc.spread_range} ${unit}`;
  document.getElementById("kpiEnsVar").textContent = `Variance σ²: ${unc.variance}`;

  const imp = evalData.rmse_improvement_pct;
  const impBadge = document.getElementById("ensImprovementBadge");
  impBadge.textContent = imp > 0 ? `+${imp}% RMSE IMPROVEMENT OVER BEST BASE MODEL` : "CONSISTENT PERFORMANCE";

  // Render Charts
  renderEnsembleChart(predData.individual_models, predData.ensembles, unit);
  renderWeightsChart(evalData.weights);

  // Render Benchmark Table
  renderBenchmarkTable(evalData);
}

function renderEnsembleChart(indiv, ensembles, unit) {
  const ctx = document.getElementById("ensembleModelsChart")?.getContext("2d");
  if (!ctx) return;
  if (ensembleChart) ensembleChart.destroy();

  const labels = [...Object.keys(indiv || {}), "Weighted Ensemble", "Median Ensemble"];
  const values = [
    ...Object.values(indiv || {}),
    ensembles.performance_weighted ? ensembles.performance_weighted.value : 0,
    ensembles.median_consensus ? ensembles.median_consensus.value : 0,
  ];

  const colors = labels.map(l => {
    if (l === "Weighted Ensemble") return "#00f0ff";
    if (l === "Median Ensemble") return "#10b981";
    return "rgba(56, 189, 248, 0.5)";
  });

  ensembleChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: `Forecast (${unit})`,
        data: values,
        backgroundColor: colors,
        borderColor: colors.map(c => c === "rgba(56, 189, 248, 0.5)" ? "#38bdf8" : c),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "var(--text-muted)" } },
        x: { grid: { display: false }, ticks: { color: "var(--text-muted)", font: { size: 10 } } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderWeightsChart(weights) {
  const ctx = document.getElementById("ensembleWeightsChart")?.getContext("2d");
  if (!ctx || !weights) return;
  if (weightsChart) weightsChart.destroy();

  const labels = Object.keys(weights);
  const values = Object.values(weights).map(v => Math.round(v * 100));

  weightsChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: ["#00f0ff", "#38bdf8", "#10b981", "#f59e0b"],
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { color: "var(--text-primary)" } }
      }
    }
  });
}

function renderBenchmarkTable(evalData) {
  const tbody = document.getElementById("ensembleBenchmarkTbody");
  if (!tbody) return;

  const indiv = evalData.individual_models || {};
  const ens = evalData.ensembles || {};

  tbody.innerHTML = "";

  // Individual models
  Object.keys(indiv).forEach(k => {
    const m = indiv[k];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:600">${escapeHtml(k)}</td>
      <td><span class="badge" style="background:rgba(255,255,255,0.08)">Base Model</span></td>
      <td>${m.mae}</td>
      <td>${m.rmse}</td>
      <td style="font-weight:600; color:${m.r2 > 0.8 ? '#10b981' : '#f59e0b'}">${m.r2}</td>
      <td style="color:var(--text-muted)">Individual Predictor</td>
    `;
    tbody.appendChild(tr);
  });

  // Ensemble models
  Object.keys(ens).forEach(k => {
    const e = ens[k];
    const isWeighted = k === "Performance-Weighted";
    const tr = document.createElement("tr");
    if (isWeighted) tr.style.background = "rgba(0, 240, 255, 0.06)";

    tr.innerHTML = `
      <td style="font-weight:700; color:${isWeighted ? 'var(--cyan)' : 'var(--text-primary)'}">
        ${escapeHtml(k)}
        ${isWeighted ? '<span class="badge badge-normal" style="margin-left:6px; font-size:10px">RECOMMENDED</span>' : ''}
      </td>
      <td><span class="badge badge-advisory" style="background:rgba(0, 240, 255, 0.15); color:var(--cyan)">Ensemble</span></td>
      <td>${e.mae}</td>
      <td style="font-weight:700; color:#10b981">${e.rmse}</td>
      <td style="font-weight:700; color:#10b981">${e.r2}</td>
      <td style="color:var(--text-muted)">${escapeHtml(e.weighting || "Dynamic Inverse RMSE")}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", renderEnsemblePrediction);
