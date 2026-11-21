/* ==========================================================================
   algorithm_lab.js — Interactive Machine Learning Algorithm Comparison Lab
   Karnataka Climate Intelligence Platform (Dark Command-Centre Edition)
   ========================================================================== */

const ALGORITHMS_METADATA = [
  {
    id: "Linear Regression",
    name: "Linear Regression",
    badge: "Parametric Baseline",
    desc: "Standardized closed-form ordinary least squares regression. High computational speed with low variance.",
  },
  {
    id: "Support Vector Regression (SVR)",
    name: "Support Vector Regression (SVR)",
    badge: "RBF Kernel",
    desc: "Dual quadratic optimization with Radial Basis Function kernel and epsilon-insensitive error margins.",
  },
  {
    id: "Gradient Boosting Regressor",
    name: "Gradient Boosting Regressor",
    badge: "Sequential Ensemble",
    desc: "Forward stage-wise sequential boosting of shallow regression trees minimizing empirical loss gradients.",
  },
  {
    id: "Random Forest Regressor",
    name: "Random Forest Regressor",
    badge: "Bagging Ensemble",
    desc: "Ensemble of de-correlated decision trees with randomized feature subsets and bootstrap aggregation.",
  },
  {
    id: "Extra Trees Regressor",
    name: "Extra Trees Regressor",
    badge: "Extremely Randomized",
    desc: "Fully randomized decision splits optimizing variance reduction and training efficiency on large tabular series.",
  },
  {
    id: "Decision Tree Regressor",
    name: "Decision Tree Regressor",
    badge: "CART Hierarchy",
    desc: "Hierarchical orthogonal feature partitioning optimizing mean squared error splits without parametric priors.",
  },
];

let selectedAlgorithms = [
  "Linear Regression",
  "Support Vector Regression (SVR)",
  "Gradient Boosting Regressor",
  "Random Forest Regressor",
  "Extra Trees Regressor",
  "Decision Tree Regressor",
];

let currentLabData = null;
let activeInspectAlgo = null;
let isEvaluating = false;
let currentSortColumn = "r2";
let currentSortAsc = false;

// Chart instances
let chartMae = null;
let chartRmse = null;
let chartR2 = null;
let chartTime = null;
let predictionChart = null;

// ==========================================================================
// RENDER MAIN APPLICATION VIEW
// ==========================================================================

async function renderAlgorithmLab() {
  const main = layout("algorithm-lab");
  main.innerHTML = `
    <!-- 1. PAGE HEADER & TARGET CONTROLS -->
    <div class="page-header" style="margin-bottom:20px">
      <div>
        <h1 class="page-title" style="color:var(--text-main); font-size:24px; font-weight:800; display:flex; align-items:center; gap:10px">
          <span style="color:var(--cyan)">🧪</span> ML Algorithm Comparison Lab
        </h1>
        <p class="page-description" style="color:var(--text-dim); font-size:13px; margin-top:4px">
          Interactive benchmarking and production model selection across 6 machine learning algorithms against 44 years of Karnataka climate records (1981–2024). Strictly evaluated on an unseen 20% chronological holdout forward split.
        </p>
      </div>
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap">
        <div style="display:flex; align-items:center; gap:8px">
          <label for="labTargetSelect" style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase">Target Metric:</label>
          <select id="labTargetSelect" class="form-select" onchange="onTargetChanged()" style="background:var(--bg-surface); color:var(--text-main); border:1px solid var(--border-subtle); padding:8px 14px; border-radius:6px; font-weight:600; font-size:13px">
            <option value="temperature">Next-Day Mean Temperature (°C)</option>
            <option value="rainfall">Next-Day Daily Rainfall (mm)</option>
          </select>
        </div>
        <span class="badge" id="algoLabStateBadge" style="font-size:12px; font-weight:700; padding:8px 14px; background:rgba(0, 240, 255, 0.12); color:var(--cyan); border:1px solid rgba(0, 240, 255, 0.3); border-radius:6px">READY</span>
        <button id="btnCompareAlgorithms" class="btn" onclick="runAlgorithmComparison()" style="font-size:13px; font-weight:700; padding:9px 20px; background:var(--cyan); color:#060b14; border:none; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:8px; box-shadow:0 0 15px rgba(0, 240, 255, 0.25)">
          <span>▶</span> COMPARE SELECTED ALGORITHMS
        </button>
      </div>
    </div>

    <!-- 2. ALGORITHM SELECTION PANEL -->
    <div class="card" style="margin-bottom:24px">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px">
        <div>
          <span style="font-size:15px; font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:8px">
            <span>⚙️</span> Select Algorithms to Compare
          </span>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px">
            Select at least 2 algorithms to benchmark on the forward chronological test split.
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px">
          <span id="selectionCounterBadge" class="badge" style="background:rgba(0, 240, 255, 0.12); color:var(--cyan); font-weight:700; border:1px solid rgba(0, 240, 255, 0.3); padding:6px 12px">
            Selected: 6 of 6
          </span>
          <button class="btn btn-secondary btn-sm" onclick="selectAllAlgorithms()" style="font-size:12px; font-weight:600; padding:5px 12px">
            Select All
          </button>
          <button class="btn btn-secondary btn-sm" onclick="clearAlgorithmSelection()" style="font-size:12px; font-weight:600; padding:5px 12px">
            Clear Selection
          </button>
        </div>
      </div>

      <!-- VALIDATION WARNING BANNER -->
      <div id="algoValidationBanner" style="display:none; margin-top:12px; padding:10px 14px; background:rgba(239, 68, 68, 0.15); border:1.5px solid #ef4444; border-radius:6px; color:#f87171; font-size:13px; font-weight:600; align-items:center; gap:8px">
        <span>⚠️</span> Please select at least 2 algorithms to compare.
      </div>

      <!-- 6 ALGORITHM SELECTION CARDS -->
      <div class="algo-selection-grid" id="algoCardsContainer">
        <!-- Rendered by renderAlgorithmCards() -->
      </div>
    </div>

    <!-- 3. EXECUTIVE KPI ROW -->
    <div class="grid grid-4" style="margin-bottom:24px; gap:16px">
      <div class="card kpi-card" style="border-left:4px solid var(--cyan)">
        <div class="kpi-label">🏆 MODEL RANKING #1</div>
        <div class="kpi-value" id="kpiBestAlgo" style="color:var(--cyan); font-size:18px">Ready</div>
        <div class="kpi-sub" id="kpiBestScore">Execute comparison to evaluate</div>
      </div>
      <div class="card kpi-card" style="border-left:4px solid #10b981">
        <div class="kpi-label">📉 LOWEST ABSOLUTE ERROR</div>
        <div class="kpi-value" id="kpiLowestError" style="color:#10b981; font-size:18px">--</div>
        <div class="kpi-sub" id="kpiLowestErrorSub">Minimum test MAE</div>
      </div>
      <div class="card kpi-card" style="border-left:4px solid #f59e0b">
        <div class="kpi-label">⚡ FASTEST EXECUTION</div>
        <div class="kpi-value" id="kpiFastestAlgo" style="color:#f59e0b; font-size:18px">--</div>
        <div class="kpi-sub" id="kpiFastestTime">Training duration</div>
      </div>
      <div class="card kpi-card" style="border-left:4px solid #a855f7">
        <div class="kpi-label">🚀 ACTIVE PRODUCTION MODEL</div>
        <div class="kpi-value" id="kpiActiveModel" style="color:#a855f7; font-size:17px">Loading...</div>
        <div class="kpi-sub" id="kpiActiveModelSub">MySQL / SQLite persisted</div>
      </div>
    </div>

    <!-- 4. ACTIVE PRODUCTION MODEL SELECTION & PERSISTENCE CARD -->
    <div class="active-model-hero-card" id="productionDeploymentSection" style="margin-bottom:24px">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px">
        <div>
          <div style="display:flex; align-items:center; gap:10px">
            <span style="font-size:22px">🎯</span>
            <span style="font-size:16px; font-weight:800; color:#ffffff">Production Model Deployment & Persistence</span>
            <span class="badge" id="liveProductionBadge" style="background:rgba(16, 185, 129, 0.2); color:#34d399; border:1px solid #10b981; font-weight:700">ONLINE</span>
          </div>
          <div style="font-size:13px; color:var(--text-dim); margin-top:4px">
            Current designated model for <strong id="productionTargetLabel">Next-Day Temperature</strong>:
            <span id="currentActiveModelText" style="font-weight:700; color:var(--cyan)">Linear Regression</span>
            <span id="currentActiveMetricsSummary" style="color:var(--text-muted); font-size:12px; margin-left:8px">(R²=0.9412, MAE=0.5281)</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
          <select id="preferredModelSelect" class="form-select" style="background:var(--bg-surface); color:var(--text-main); border:1.5px solid var(--cyan); padding:8px 14px; border-radius:6px; font-weight:600; font-size:13px; min-width:240px">
            <option value="">-- Choose Evaluated Model --</option>
          </select>
          <button id="btnDeployActiveModel" class="btn" onclick="savePreferredModel()" style="background:#10b981; color:#ffffff; font-weight:700; padding:9px 18px; border:none; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 0 10px rgba(16, 185, 129, 0.3)">
            <span>✓</span> USE SELECTED ALGORITHM
          </button>
        </div>
      </div>
      <!-- Persistence Feedback Toast -->
      <div id="deploymentFeedbackToast" style="display:none; margin-top:14px; padding:10px 14px; border-radius:6px; font-size:13px; font-weight:600"></div>
    </div>

    <!-- 5. COMPARISON TABLE & ACTUAL VS PREDICTED (ROW 1) -->
    <div class="grid grid-2" style="margin-bottom:24px; gap:20px">
      <!-- TABLE: ALGORITHM COMPARISON -->
      <div class="card" style="display:flex; flex-direction:column">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:10px; margin-bottom:12px">
          <span style="font-size:15px; font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:8px">
            <span>📋</span> Algorithm Comparison Table
          </span>
          <span class="badge" id="tableCountBadge" style="background:rgba(0, 240, 255, 0.12); color:var(--cyan); border:1px solid rgba(0, 240, 255, 0.3); font-weight:700">
            6 EVALUATED
          </span>
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px">
          Click column headers to sort metrics dynamically. Lowest error and highest R² are badged.
        </div>
        <div style="overflow-x:auto; flex:1">
          <table class="table" id="leaderboardTable" style="width:100%; font-size:13px">
            <thead>
              <tr style="background:rgba(255,255,255,0.03); border-bottom:1.5px solid var(--border-subtle)">
                <th class="sortable-th" onclick="sortTable('rank')" style="width:50px">Rank <span class="sort-icon" id="sortIcon_rank">↕</span></th>
                <th class="sortable-th" onclick="sortTable('algorithm')">Algorithm <span class="sort-icon" id="sortIcon_algorithm">↕</span></th>
                <th class="sortable-th" onclick="sortTable('mae')">MAE <span class="sort-icon" id="sortIcon_mae">↕</span></th>
                <th class="sortable-th" onclick="sortTable('mse')">MSE <span class="sort-icon" id="sortIcon_mse">↕</span></th>
                <th class="sortable-th" onclick="sortTable('rmse')">RMSE <span class="sort-icon" id="sortIcon_rmse">↕</span></th>
                <th class="sortable-th" onclick="sortTable('r2')">R² Score <span class="sort-icon" id="sortIcon_r2">↕</span></th>
                <th class="sortable-th" onclick="sortTable('training_time_sec')">Train Time <span class="sort-icon" id="sortIcon_training_time_sec">↕</span></th>
                <th style="width:70px">Inspect</th>
              </tr>
            </thead>
            <tbody id="leaderboardTbody">
              <tr>
                <td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted)">
                  Click <strong>COMPARE SELECTED ALGORITHMS</strong> above to benchmark models on the hold-out dataset.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- CHART: ACTUAL VS PREDICTED CURVE -->
      <div class="card" style="display:flex; flex-direction:column">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:10px; margin-bottom:12px">
          <span style="font-size:15px; font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:8px">
            <span>📈</span> Actual vs Predicted Curve
          </span>
          <span id="activeInspectAlgoBadge" class="badge" style="background:rgba(0, 240, 255, 0.12); color:var(--cyan); border:1px solid rgba(0, 240, 255, 0.3); font-weight:700">
            Linear Regression
          </span>
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px">
          Chronological sequence of actual observations vs predicted values on the unseen forward test set.
        </div>
        <div id="actualVsPredContainer" style="height:320px; position:relative; flex:1">
          <canvas id="actualVsPredChart"></canvas>
        </div>
      </div>
    </div>

    <!-- 6. FOUR BENCHMARK COMPARISON CHARTS (2x2 GRID) -->
    <div style="margin-bottom:24px">
      <div style="font-size:16px; font-weight:800; color:var(--text-main); margin-bottom:14px; display:flex; align-items:center; gap:8px">
        <span>📊</span> Multi-Algorithm Metric Comparison
      </div>
      <div class="grid grid-2" style="gap:20px">
        <!-- 1. MAE CHART -->
        <div class="card">
          <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
            <span style="font-size:14px; font-weight:700">📉 Mean Absolute Error (MAE)</span>
            <span class="badge" style="background:rgba(245, 158, 11, 0.2); color:#fbbf24; font-size:11px">Lower is Better</span>
          </div>
          <div style="height:220px; position:relative; margin-top:12px">
            <canvas id="chartMaeCanvas"></canvas>
          </div>
        </div>

        <!-- 2. RMSE CHART -->
        <div class="card">
          <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
            <span style="font-size:14px; font-weight:700">📉 Root Mean Squared Error (RMSE)</span>
            <span class="badge" style="background:rgba(236, 72, 153, 0.2); color:#f472b6; font-size:11px">Lower is Better</span>
          </div>
          <div style="height:220px; position:relative; margin-top:12px">
            <canvas id="chartRmseCanvas"></canvas>
          </div>
        </div>

        <!-- 3. R2 SCORE CHART -->
        <div class="card">
          <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
            <span style="font-size:14px; font-weight:700">📈 Coefficient of Determination (R²)</span>
            <span class="badge" style="background:rgba(0, 240, 255, 0.12); color:var(--cyan); font-size:11px">Higher is Better (Max 1.0)</span>
          </div>
          <div style="height:220px; position:relative; margin-top:12px">
            <canvas id="chartR2Canvas"></canvas>
          </div>
        </div>

        <!-- 4. EXECUTION TIME CHART -->
        <div class="card">
          <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
            <span style="font-size:14px; font-weight:700">⏱️ Model Training Time (Seconds)</span>
            <span class="badge" style="background:rgba(16, 185, 129, 0.2); color:#34d399; font-size:11px">Faster is Better</span>
          </div>
          <div style="height:220px; position:relative; margin-top:12px">
            <canvas id="chartTimeCanvas"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;

  // Render algorithm checkboxes and load initial active model + comparison
  renderAlgorithmCards();
  await loadActiveModel();
  await runAlgorithmComparison();
}

// ==========================================================================
// ALGORITHM SELECTION CARDS MANAGEMENT
// ==========================================================================

function renderAlgorithmCards() {
  const container = document.getElementById("algoCardsContainer");
  if (!container) return;

  container.innerHTML = ALGORITHMS_METADATA.map((meta) => {
    const isChecked = selectedAlgorithms.includes(meta.id);
    return `
      <div class="algo-card ${isChecked ? "selected" : ""}" id="card_${escapeAttr(meta.id)}" onclick="toggleAlgorithmSelection('${escapeAttr(meta.id)}')">
        <div class="algo-card-header">
          <input type="checkbox" class="algo-checkbox" id="chk_${escapeAttr(meta.id)}"
                 ${isChecked ? "checked" : ""} onclick="event.stopPropagation(); toggleAlgorithmSelection('${escapeAttr(meta.id)}')" />
          <div style="flex:1">
            <div class="algo-card-title">${escapeHtml(meta.name)}</div>
            <span class="algo-card-badge">${escapeHtml(meta.badge)}</span>
          </div>
        </div>
        <div class="algo-card-desc">${escapeHtml(meta.desc)}</div>
      </div>
    `;
  }).join("");

  updateSelectionCounter();
}

function toggleAlgorithmSelection(algoId) {
  const idx = selectedAlgorithms.indexOf(algoId);
  if (idx > -1) {
    selectedAlgorithms.splice(idx, 1);
  } else {
    selectedAlgorithms.push(algoId);
  }

  // Update card styling and checkbox state
  const card = document.getElementById(`card_${escapeAttr(algoId)}`);
  const chk = document.getElementById(`chk_${escapeAttr(algoId)}`);
  if (card && chk) {
    const isSel = selectedAlgorithms.includes(algoId);
    chk.checked = isSel;
    if (isSel) {
      card.classList.add("selected");
    } else {
      card.classList.remove("selected");
    }
  }

  updateSelectionCounter();
  validateSelection();
}

function selectAllAlgorithms() {
  selectedAlgorithms = ALGORITHMS_METADATA.map((m) => m.id);
  renderAlgorithmCards();
  validateSelection();
}

function clearAlgorithmSelection() {
  selectedAlgorithms = [];
  renderAlgorithmCards();
  validateSelection();
}

function updateSelectionCounter() {
  const counter = document.getElementById("selectionCounterBadge");
  if (counter) {
    counter.textContent = `Selected: ${selectedAlgorithms.length} of ${ALGORITHMS_METADATA.length}`;
    if (selectedAlgorithms.length < 2) {
      counter.style.background = "rgba(239, 68, 68, 0.2)";
      counter.style.color = "#f87171";
      counter.style.borderColor = "#ef4444";
    } else {
      counter.style.background = "rgba(0, 240, 255, 0.12)";
      counter.style.color = "var(--cyan)";
      counter.style.borderColor = "rgba(0, 240, 255, 0.3)";
    }
  }
}

function validateSelection() {
  const banner = document.getElementById("algoValidationBanner");
  if (!banner) return true;
  if (selectedAlgorithms.length < 2) {
    banner.style.display = "flex";
    return false;
  } else {
    banner.style.display = "none";
    return true;
  }
}

function escapeAttr(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, "_");
}

// ==========================================================================
// TARGET SWITCHING & ACTIVE MODEL FETCHING
// ==========================================================================

async function onTargetChanged() {
  await loadActiveModel();
  await runAlgorithmComparison();
}

async function loadActiveModel() {
  const target = document.getElementById("labTargetSelect")?.value || "temperature";
  const targetLabel = target === "rainfall" ? "Next-Day Daily Rainfall" : "Next-Day Mean Temperature";
  const labelEl = document.getElementById("productionTargetLabel");
  if (labelEl) labelEl.textContent = targetLabel;

  try {
    const res = await api(`/api/algorithm-lab/active-model?target=${encodeURIComponent(target)}`);
    if (res && res.active_model) {
      const am = res.active_model;
      const modelNameEl = document.getElementById("currentActiveModelText");
      const summaryEl = document.getElementById("currentActiveMetricsSummary");
      const kpiModelEl = document.getElementById("kpiActiveModel");
      const kpiSubEl = document.getElementById("kpiActiveModelSub");

      if (modelNameEl) modelNameEl.textContent = am.algorithm_name;
      if (summaryEl) {
        summaryEl.textContent = `(R²=${am.r2 ?? "-"}, MAE=${am.mae ?? "-"}, RMSE=${am.rmse ?? "-"})`;
      }
      if (kpiModelEl) kpiModelEl.textContent = am.algorithm_name;
      if (kpiSubEl) {
        kpiSubEl.textContent = `R² = ${am.r2 ?? "-"} • MAE = ${am.mae ?? "-"}`;
      }
    }
  } catch (err) {
    console.warn("Could not fetch active model:", err);
  }
}

// ==========================================================================
// LIVE ALGORITHM COMPARISON EXECUTION
// ==========================================================================

async function runAlgorithmComparison() {
  if (isEvaluating) return;

  if (!validateSelection()) {
    return;
  }

  const target = document.getElementById("labTargetSelect")?.value || "temperature";
  const btn = document.getElementById("btnCompareAlgorithms");
  const stateBadge = document.getElementById("algoLabStateBadge");
  const tbody = document.getElementById("leaderboardTbody");

  isEvaluating = true;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="display:inline-block; animation:spin 1s linear infinite">⏳</span> BENCHMARKING ${selectedAlgorithms.length} ALGORITHMS...`;
  }
  if (stateBadge) {
    stateBadge.textContent = "TRAINING...";
    stateBadge.style.background = "rgba(245, 158, 11, 0.2)";
    stateBadge.style.color = "#fbbf24";
  }

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:30px; color:var(--cyan)">
          <div style="font-size:15px; font-weight:700">⚡ Training & Benchmarking ${selectedAlgorithms.length} Selected Algorithms...</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px">
            Chronological 80/20 train/test evaluation on 44-year Karnataka climate dataset.
          </div>
        </td>
      </tr>
    `;
  }

  try {
    const res = await api("/api/algorithm-lab/compare", {
      method: "POST",
      body: JSON.stringify({
        target: target,
        algorithms: selectedAlgorithms,
      }),
    });

    currentLabData = res;
    updateComparisonUI(res);

    if (stateBadge) {
      stateBadge.textContent = "COMPLETED";
      stateBadge.style.background = "rgba(16, 185, 129, 0.2)";
      stateBadge.style.color = "#34d399";
    }
  } catch (err) {
    console.error("Comparison error:", err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#ef4444; padding:20px; font-weight:600">Comparison Failed: ${escapeHtml(err.message)}</td></tr>`;
    }
    if (stateBadge) {
      stateBadge.textContent = "ERROR";
      stateBadge.style.background = "rgba(239, 68, 68, 0.2)";
      stateBadge.style.color = "#f87171";
    }
  } finally {
    isEvaluating = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>▶</span> COMPARE SELECTED ALGORITHMS`;
    }
  }
}

// ==========================================================================
// UPDATE COMPARISON UI (KPIS, TABLE, CHARTS, SELECTOR)
// ==========================================================================

function updateComparisonUI(data) {
  const results = data.results || [];
  if (results.length === 0) return;

  const bestAlgo = data.best_algorithm || results[0].algorithm;
  const models = data.models || {};
  const bestModel = models[bestAlgo] || results[0];

  // 1. Update KPIs
  const kpiBest = document.getElementById("kpiBestAlgo");
  const kpiBestScore = document.getElementById("kpiBestScore");
  if (kpiBest) kpiBest.textContent = bestAlgo;
  if (kpiBestScore) kpiBestScore.textContent = `Leader: R² = ${bestModel.r2} (MAE = ${bestModel.mae})`;

  // Lowest Error KPI
  let lowestMae = results[0].mae;
  let lowestMaeAlgo = results[0].algorithm;
  let fastestTime = results[0].training_time_sec;
  let fastestAlgo = results[0].algorithm;

  results.forEach((r) => {
    if (r.mae !== undefined && r.mae < lowestMae) {
      lowestMae = r.mae;
      lowestMaeAlgo = r.algorithm;
    }
    if (r.training_time_sec !== undefined && r.training_time_sec < fastestTime) {
      fastestTime = r.training_time_sec;
      fastestAlgo = r.algorithm;
    }
  });

  const kpiErr = document.getElementById("kpiLowestError");
  const kpiErrSub = document.getElementById("kpiLowestErrorSub");
  if (kpiErr) kpiErr.textContent = `${lowestMae} (${data.unit || "°C"})`;
  if (kpiErrSub) kpiErrSub.textContent = lowestMaeAlgo;

  const kpiFast = document.getElementById("kpiFastestAlgo");
  const kpiFastTime = document.getElementById("kpiFastestTime");
  if (kpiFast) kpiFast.textContent = `${fastestTime}s`;
  if (kpiFastTime) kpiFastTime.textContent = fastestAlgo;

  // 2. Populate Preferred Model Dropdown
  const prefSelect = document.getElementById("preferredModelSelect");
  if (prefSelect) {
    prefSelect.innerHTML = `<option value="">-- Choose Evaluated Model --</option>` +
      results.map((r) => `<option value="${escapeHtml(r.algorithm)}" ${r.algorithm === bestAlgo ? "selected" : ""}>${escapeHtml(r.algorithm)} (R²=${r.r2}, MAE=${r.mae})</option>`).join("");
  }

  // 3. Render Dynamic Comparison Table
  renderComparisonTable(results, bestAlgo);

  // 4. Render 4 Comparison Bar Charts
  renderComparisonCharts(data.comparison_charts || {}, bestAlgo);

  // 5. Render Actual vs Predicted Curve for the leader or active inspection model
  if (!activeInspectAlgo || !models[activeInspectAlgo]) {
    activeInspectAlgo = bestAlgo;
  }
  inspectModel(activeInspectAlgo);
}

// ==========================================================================
// DYNAMIC COMPARISON TABLE RENDERING & SORTING
// ==========================================================================

function renderComparisonTable(results, bestAlgo) {
  const tbody = document.getElementById("leaderboardTbody");
  const countBadge = document.getElementById("tableCountBadge");
  if (!tbody) return;

  if (countBadge) {
    countBadge.textContent = `${results.length} EVALUATED`;
  }

  // Find extreme metrics for badging
  let minMae = Math.min(...results.map((r) => r.mae ?? 999));
  let minMse = Math.min(...results.map((r) => r.mse ?? 999));
  let minRmse = Math.min(...results.map((r) => r.rmse ?? 999));
  let maxR2 = Math.max(...results.map((r) => r.r2 ?? -999));
  let minTrainTime = Math.min(...results.map((r) => r.training_time_sec ?? 999));

  tbody.innerHTML = results.map((m, idx) => {
    const isTop = m.algorithm === bestAlgo;
    const isInspecting = m.algorithm === activeInspectAlgo;
    const isMinMae = m.mae === minMae;
    const isMinRmse = m.rmse === minRmse;
    const isMaxR2 = m.r2 === maxR2;
    const isFastest = m.training_time_sec === minTrainTime;

    return `
      <tr style="background:${isInspecting ? "rgba(0, 240, 255, 0.12)" : (isTop ? "rgba(245, 158, 11, 0.1)" : "transparent")}; border-bottom:1px solid var(--border-subtle)">
        <td style="font-weight:700; color:${idx === 0 ? "#fbbf24" : "var(--text-muted)"}">
          ${idx === 0 ? "🏆 1" : idx + 1}
        </td>
        <td>
          <div style="font-weight:700; color:${isTop ? "var(--cyan)" : "var(--text-main)"}">
            ${escapeHtml(m.algorithm)}
          </div>
          ${isTop ? '<span class="badge" style="font-size:10px; background:rgba(245, 158, 11, 0.2); color:#fbbf24; font-weight:700">LEADER #1</span>' : ""}
        </td>
        <td style="font-family:\'JetBrains Mono\',monospace; font-weight:600; color:var(--text-main)">
          ${m.mae ?? "-"}
          ${isMinMae ? '<span class="badge-best">BEST</span>' : ""}
        </td>
        <td style="font-family:\'JetBrains Mono\',monospace; color:var(--text-muted)">
          ${m.mse ?? "-"}
        </td>
        <td style="font-family:\'JetBrains Mono\',monospace; font-weight:600; color:var(--text-main)">
          ${m.rmse ?? "-"}
          ${isMinRmse ? '<span class="badge-best">BEST</span>' : ""}
        </td>
        <td style="font-family:\'JetBrains Mono\',monospace; font-weight:700; color:${(m.r2 ?? 0) > 0.8 ? "#34d399" : ((m.r2 ?? 0) > 0.2 ? "#fbbf24" : "#f87171")}">
          ${m.r2 ?? "-"}
          ${isMaxR2 ? '<span class="badge-best">BEST</span>' : ""}
        </td>
        <td style="font-size:12px; font-family:\'JetBrains Mono\',monospace; color:var(--text-muted)">
          ${m.training_time_sec ?? "-"}s
          ${isFastest ? '<span class="badge-best" style="background:rgba(0, 240, 255, 0.2); color:var(--cyan); border-color:var(--cyan)">FAST</span>' : ""}
        </td>
        <td>
          <button class="btn btn-sm ${isInspecting ? "btn-primary" : "btn-secondary"}"
                  onclick="inspectModel('${escapeHtml(m.algorithm)}')"
                  style="font-size:11px; padding:4px 10px; font-weight:700">
            ${isInspecting ? "Active" : "Inspect"}
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function sortTable(column) {
  if (!currentLabData || !currentLabData.results) return;

  if (currentSortColumn === column) {
    currentSortAsc = !currentSortAsc;
  } else {
    currentSortColumn = column;
    // For R2, default descending (higher is better). For errors/times, default ascending (lower is better).
    currentSortAsc = (column === "mae" || column === "mse" || column === "rmse" || column === "training_time_sec");
  }

  // Update header icons
  document.querySelectorAll(".sort-icon").forEach((el) => el.textContent = "↕");
  const activeIcon = document.getElementById(`sortIcon_${column}`);
  if (activeIcon) {
    activeIcon.textContent = currentSortAsc ? "▲" : "▼";
  }

  currentLabData.results.sort((a, b) => {
    let valA = a[column];
    let valB = b[column];
    if (column === "rank") {
      valA = a.r2;
      valB = b.r2;
      return currentSortAsc ? valB - valA : valA - valB;
    }
    if (typeof valA === "string") {
      return currentSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return currentSortAsc ? (valA - valB) : (valB - valA);
  });

  renderComparisonTable(currentLabData.results, currentLabData.best_algorithm);
}

// ==========================================================================
// FIVE COMPARISON CHARTS RENDERING
// ==========================================================================

function renderComparisonCharts(chartsData, bestAlgo) {
  const labels = chartsData.labels || [];
  const maeValues = chartsData.mae || [];
  const rmseValues = chartsData.rmse || [];
  const r2Values = chartsData.r2 || [];
  const timeValues = chartsData.training_time_sec || [];

  const defaults = chartDefaults();

  function makeBarChart(canvasId, currentInstance, label, data, colorPalette, isHigherBetter = false) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (currentInstance) currentInstance.destroy();

    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: data,
          backgroundColor: labels.map((l) => (l === bestAlgo ? colorPalette.leaderBg : colorPalette.bg)),
          borderColor: labels.map((l) => (l === bestAlgo ? colorPalette.leaderBorder : colorPalette.border)),
          borderWidth: 1.5,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(255, 255, 255, 0.06)" },
            ticks: { color: "#94a3b8", font: { family: "JetBrains Mono", size: 11 } },
          },
          x: {
            grid: { display: false },
            ticks: { color: "#e2e8f0", font: { size: 11, weight: "600" }, maxRotation: 20 },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(12, 21, 39, 0.95)",
            titleColor: "#00f0ff",
            bodyColor: "#f1f5f9",
            borderColor: "rgba(0, 240, 255, 0.3)",
            borderWidth: 1,
            callbacks: {
              label: (item) => ` ${label}: ${item.parsed.y}`,
            },
          },
        },
      },
    });
  }

  // 1. MAE Chart (Amber)
  chartMae = makeBarChart("chartMaeCanvas", chartMae, "MAE", maeValues, {
    leaderBg: "rgba(245, 158, 11, 0.85)",
    bg: "rgba(245, 158, 11, 0.4)",
    leaderBorder: "#d97706",
    border: "#f59e0b",
  });

  // 2. RMSE Chart (Rose)
  chartRmse = makeBarChart("chartRmseCanvas", chartRmse, "RMSE", rmseValues, {
    leaderBg: "rgba(236, 72, 153, 0.85)",
    bg: "rgba(236, 72, 153, 0.4)",
    leaderBorder: "#be185d",
    border: "#ec4899",
  });

  // 3. R² Score Chart (Electric Cyan)
  chartR2 = makeBarChart("chartR2Canvas", chartR2, "R² Score", r2Values, {
    leaderBg: "#00f0ff",
    bg: "rgba(0, 240, 255, 0.45)",
    leaderBorder: "#00e5bc",
    border: "#00f0ff",
  }, true);

  // 4. Execution Time Chart (Emerald)
  chartTime = makeBarChart("chartTimeCanvas", chartTime, "Training Time (s)", timeValues, {
    leaderBg: "rgba(16, 185, 129, 0.85)",
    bg: "rgba(16, 185, 129, 0.4)",
    leaderBorder: "#059669",
    border: "#10b981",
  });
}

function inspectModel(algoKey) {
  activeInspectAlgo = algoKey;
  const badge = document.getElementById("activeInspectAlgoBadge");
  if (badge) badge.textContent = algoKey;

  if (!currentLabData || !currentLabData.models || !currentLabData.models[algoKey]) {
    return;
  }

  const m = currentLabData.models[algoKey];
  const container = document.getElementById("actualVsPredContainer");
  if (!container) return;

  if (predictionChart) {
    predictionChart.destroy();
    predictionChart = null;
  }

  container.innerHTML = `<canvas id="actualVsPredChart"></canvas>`;
  const ctx = document.getElementById("actualVsPredChart").getContext("2d");
  const dates = m.chart_dates || m.chart_actual.map((_, i) => `Point ${i + 1}`);

  predictionChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        {
          label: "Actual Observation",
          data: m.chart_actual,
          borderColor: "#00f0ff",
          backgroundColor: "rgba(0, 240, 255, 0.12)",
          borderWidth: 2,
          pointRadius: 2.5,
          tension: 0.15,
        },
        {
          label: `Predicted (${algoKey})`,
          data: m.chart_predicted,
          borderColor: "#ef4444",
          borderDash: [4, 4],
          borderWidth: 2,
          pointRadius: 2.5,
          tension: 0.15,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      scales: {
        y: {
          grid: { color: "rgba(255, 255, 255, 0.06)" },
          ticks: { color: "#94a3b8", font: { family: "JetBrains Mono", size: 11 } },
          title: { display: true, text: currentLabData.unit || "Value", color: "#94a3b8" },
        },
        x: {
          grid: { display: false },
          ticks: { color: "#94a3b8", maxTicksLimit: 8, font: { family: "JetBrains Mono", size: 10 } },
        },
      },
      plugins: {
        legend: {
          display: true,
          labels: { color: "#ffffff", boxWidth: 14, font: { weight: "600" } },
        },
        tooltip: {
          backgroundColor: "rgba(12, 21, 39, 0.95)",
          titleColor: "#00f0ff",
          bodyColor: "#f1f5f9",
          borderColor: "rgba(0, 240, 255, 0.3)",
          borderWidth: 1,
          callbacks: {
            afterBody: function (items) {
              const idx = items[0].dataIndex;
              const act = m.chart_actual[idx];
              const pred = m.chart_predicted[idx];
              if (act !== undefined && pred !== undefined) {
                const residual = Math.abs(act - pred).toFixed(2);
                return `Absolute Error: ${residual} ${currentLabData.unit || ""}`;
              }
              return "";
            },
          },
        },
      },
    },
  });

  // Re-highlight table rows
  if (currentLabData.results) {
    renderComparisonTable(currentLabData.results, currentLabData.best_algorithm);
  }
}

// ==========================================================================
// PERSIST PREFERRED PRODUCTION MODEL
// ==========================================================================

async function savePreferredModel() {
  const select = document.getElementById("preferredModelSelect");
  const selectedAlgo = select ? select.value : "";
  const toast = document.getElementById("deploymentFeedbackToast");
  const btn = document.getElementById("btnDeployActiveModel");

  if (!selectedAlgo) {
    if (toast) {
      toast.style.display = "block";
      toast.style.background = "rgba(239, 68, 68, 0.15)";
      toast.style.color = "#f87171";
      toast.style.border = "1.5px solid #ef4444";
      toast.innerHTML = "⚠️ Please select a model from the dropdown to activate.";
    }
    return;
  }

  const target = document.getElementById("labTargetSelect")?.value || "temperature";
  const modelMetrics = currentLabData?.models?.[selectedAlgo] || {};

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="display:inline-block; animation:spin 1s linear infinite">⏳</span> SAVING...`;
  }

  try {
    const res = await api("/api/algorithm-lab/active-model", {
      method: "POST",
      body: JSON.stringify({
        target: target,
        algorithm_name: selectedAlgo,
        metrics: {
          r2: modelMetrics.r2,
          mae: modelMetrics.mae,
          rmse: modelMetrics.rmse,
          mse: modelMetrics.mse,
          training_time_sec: modelMetrics.training_time_sec,
          prediction_time_ms: modelMetrics.prediction_time_ms,
        },
      }),
    });

    if (toast) {
      toast.style.display = "block";
      toast.style.background = "rgba(16, 185, 129, 0.15)";
      toast.style.color = "#34d399";
      toast.style.border = "1.5px solid #10b981";
      toast.innerHTML = `✅ Successfully designated <strong>${escapeHtml(selectedAlgo)}</strong> as the active production model for <strong>${target === "rainfall" ? "Rainfall" : "Temperature"}</strong> (saved to MySQL/SQLite).`;
    }

    await loadActiveModel();
  } catch (err) {
    if (toast) {
      toast.style.display = "block";
      toast.style.background = "rgba(239, 68, 68, 0.15)";
      toast.style.color = "#f87171";
      toast.style.border = "1.5px solid #ef4444";
      toast.innerHTML = `❌ Error saving production model: ${escapeHtml(err.message)}`;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>✓</span> USE SELECTED ALGORITHM`;
    }
  }
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================

document.addEventListener("DOMContentLoaded", renderAlgorithmLab);
