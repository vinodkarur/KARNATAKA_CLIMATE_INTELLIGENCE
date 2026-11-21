/* model_monitoring.js — Model and Data Monitoring Console */

let driftChart = null;
let outlierChart = null;
let lastDriftData = null;

async function renderModelMonitoring() {
  const main = layout("model-monitoring");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Model and Data Monitoring Console</h1>
        <p class="page-description">
          Automated continuous auditing of production machine learning pipelines: two-sample Kolmogorov-Smirnov statistical data drift detection, dataset completeness, atmospheric constraint validation, and dual-database telemetry.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <span class="badge badge-normal" id="monitoringLiveStatus">TELEMETRY: ONLINE</span>
        <button class="btn btn-secondary" onclick="reloadMonitoringData()">🔄 Refresh Diagnostics</button>
      </div>
    </div>

    <!-- KPI ROW -->
    <div class="grid grid-4" style="margin-bottom:20px">
      <div class="card kpi-card">
        <div class="kpi-label">OVERALL DRIFT STATUS</div>
        <div class="kpi-value" id="kpiDriftStatus" style="font-size:18px; color:#10b981">--</div>
        <div class="kpi-sub" id="kpiDriftSub">KS two-sample test</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">DATASET COMPLETENESS</div>
        <div class="kpi-value" id="kpiCompleteness" style="color:var(--cyan)">-- %</div>
        <div class="kpi-sub" id="kpiQualityScore">Quality index: --</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">DATABASE INTEGRITY LEDGER</div>
        <div class="kpi-value" id="kpiDbStatus" style="color:#38bdf8; font-size:18px">--</div>
        <div class="kpi-sub" id="kpiTotalRecords">-- records stored</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">SERVER UPTIME & HEALTH</div>
        <div class="kpi-value" id="kpiUptime" style="color:#f59e0b; font-size:18px">--</div>
        <div class="kpi-sub">Local engine active</div>
      </div>
    </div>

    <!-- CHARTS ROW: CDF DRIFT & OUTLIER RATES -->
    <div class="grid grid-2" style="margin-bottom:20px">
      <!-- CDF DRIFT CURVE -->
      <div class="card">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
          <span>📈 Empirical CDF Distribution Comparison (Drift)</span>
          <select id="driftFeatureSelect" class="form-select" onchange="renderSelectedFeatureCdf(this.value)" style="background:var(--card-bg); color:var(--text-primary); border:1px solid var(--border-color); padding:4px 8px; border-radius:4px; font-size:12px"></select>
        </div>
        <div style="height:280px; position:relative; margin-top:10px">
          <canvas id="driftCdfChart"></canvas>
        </div>
      </div>

      <!-- OUTLIER FREQUENCY BAR -->
      <div class="card">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
          <span>🔬 Outlier Detection & Z-Score Violations</span>
          <span style="font-size:12px; color:var(--text-muted)">Z > 3.5 Extreme Events</span>
        </div>
        <div style="height:280px; position:relative; margin-top:10px">
          <canvas id="outlierFrequencyChart"></canvas>
        </div>
      </div>
    </div>

    <!-- KOLMOGOROV-SMIRNOV DRIFT TABLE -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
        <span>📊 Statistical Data Drift Analysis: Baseline (1981–2015) vs Evaluation (2016–2024)</span>
        <span class="badge badge-normal" id="ksBadge">KS TEST RUN</span>
      </div>
      <div style="overflow-x:auto; margin-top:12px">
        <table class="table" id="driftMetricsTable">
          <thead>
            <tr>
              <th>Monitored Feature</th>
              <th>Baseline Mean (34y)</th>
              <th>Evaluation Mean (9y)</th>
              <th>Mean Shift (Δ)</th>
              <th>KS Statistic</th>
              <th>p-Value</th>
              <th>Drift Status</th>
            </tr>
          </thead>
          <tbody id="driftMetricsTbody">
            <tr><td colspan="7" style="text-align:center; padding:20px">Computing Kolmogorov-Smirnov test statistics...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- OPERATIONAL TELEMETRY & MODEL PIPELINE TABLE -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-title">🖥️ Service Latencies & Pipeline Health Ledger</div>
      <div style="overflow-x:auto; margin-top:12px">
        <table class="table" id="telemetryTable">
          <thead>
            <tr>
              <th>Subsystem / Model Pipeline</th>
              <th>Operational Status</th>
              <th>Latency</th>
              <th>Role & Details</th>
            </tr>
          </thead>
          <tbody id="telemetryTbody">
            <tr><td colspan="4" style="text-align:center; padding:20px">Querying system telemetry...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  await reloadMonitoringData();
}

async function reloadMonitoringData() {
  try {
    const drift = await api("/api/model-monitoring/drift");
    const quality = await api("/api/model-monitoring/quality");
    const telemetry = await api("/api/model-monitoring/telemetry");

    lastDriftData = drift;
    updateMonitoringUI(drift, quality, telemetry);
  } catch (err) {
    console.error("Monitoring fetch error:", err);
  }
}

function updateMonitoringUI(drift, quality, telemetry) {
  // KPIs
  const driftStatEl = document.getElementById("kpiDriftStatus");
  driftStatEl.textContent = drift.overall_drift_status || "--";
  driftStatEl.style.color = drift.overall_color || "#10b981";
  document.getElementById("kpiDriftSub").textContent = `${drift.features_drifted || 0} of ${drift.features_monitored || 0} features drifted`;

  document.getElementById("kpiCompleteness").textContent = `${quality.completeness_pct ?? "--"} %`;
  document.getElementById("kpiQualityScore").textContent = `Scorecard: ${quality.overall_quality} (${quality.quality_score}/100)`;

  const db = telemetry.database || {};
  const isMysql = db.status === "connected";
  document.getElementById("kpiDbStatus").textContent = isMysql ? "MySQL 8.0 ONLINE" : "SQLite Local FALLBACK";
  const tbls = db.tables || {};
  const totalRows = (tbls.predictions || 0) + (tbls.alerts || 0) + (tbls.weather || 0);
  document.getElementById("kpiTotalRecords").textContent = `${totalRows.toLocaleString()} total historical records`;

  const srv = telemetry.server || {};
  document.getElementById("kpiUptime").textContent = srv.uptime || "--";

  // Populate Drift Feature Selector
  const sel = document.getElementById("driftFeatureSelect");
  sel.innerHTML = "";
  (drift.feature_reports || []).forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.feature;
    opt.textContent = f.label;
    sel.appendChild(opt);
  });

  if (drift.feature_reports && drift.feature_reports.length > 0) {
    renderSelectedFeatureCdf(drift.feature_reports[0].feature);
  }

  // Render Outliers Chart
  renderOutliersChart(quality.outliers || []);

  // Render Drift Table
  renderDriftTable(drift.feature_reports || []);

  // Render Telemetry Table
  renderTelemetryTable(telemetry);
}

function renderSelectedFeatureCdf(featureName) {
  if (!lastDriftData || !lastDriftData.feature_reports) return;
  const f = lastDriftData.feature_reports.find(item => item.feature === featureName);
  if (!f) return;

  const ctx = document.getElementById("driftCdfChart")?.getContext("2d");
  if (!ctx) return;
  if (driftChart) driftChart.destroy();

  const labels = f.quantile_grid.map(q => `${Math.round(q * 100)}%`);

  driftChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Baseline (1981–2015)",
          data: f.baseline_cdf,
          borderColor: "#38bdf8",
          borderWidth: 2,
          pointRadius: 2,
        },
        {
          label: "Evaluation (2016–2024)",
          data: f.current_cdf,
          borderColor: f.drift_color || "#00f0ff",
          borderWidth: 2,
          borderDash: [4, 4],
          pointRadius: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "var(--text-muted)" } },
        x: { grid: { display: false }, ticks: { color: "var(--text-muted)", maxTicksLimit: 7 } }
      },
      plugins: {
        legend: { labels: { color: "var(--text-primary)" } }
      }
    }
  });
}

function renderOutliersChart(outliers) {
  const ctx = document.getElementById("outlierFrequencyChart")?.getContext("2d");
  if (!ctx) return;
  if (outlierChart) outlierChart.destroy();

  const labels = outliers.map(o => o.feature.replace(/_/g, " "));
  const rates = outliers.map(o => o.outlier_rate_pct);

  outlierChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Outlier Frequency (%)",
        data: rates,
        backgroundColor: rates.map(r => r > 1.5 ? "#f59e0b" : "#10b981"),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "var(--text-muted)" } },
        x: { grid: { display: false }, ticks: { color: "var(--text-muted)", font: { size: 10 } } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderDriftTable(reports) {
  const tbody = document.getElementById("driftMetricsTbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  reports.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:600">${escapeHtml(r.label)}</td>
      <td>${r.baseline_mean} (±${r.baseline_std})</td>
      <td>${r.current_mean} (±${r.current_std})</td>
      <td style="font-weight:600; color:${r.mean_shift > 0 ? '#ef4444' : '#38bdf8'}">${r.mean_shift > 0 ? '+' : ''}${r.mean_shift} (${r.pct_shift > 0 ? '+' : ''}${r.pct_shift}%)</td>
      <td style="font-family:'JetBrains Mono',monospace">${r.ks_statistic}</td>
      <td style="font-family:'JetBrains Mono',monospace">${r.p_value}</td>
      <td>
        <span class="badge" style="background:${r.drift_color}; color:#000; font-size:11px">
          ${r.drift_status}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTelemetryTable(telemetry) {
  const tbody = document.getElementById("telemetryTbody");
  if (!tbody) return;

  const pipelines = telemetry.model_pipeline_status || [];
  tbody.innerHTML = "";

  pipelines.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:600">${escapeHtml(p.model)}</td>
      <td><span class="badge badge-normal" style="font-size:10px">${escapeHtml(p.status)}</span></td>
      <td style="font-family:'JetBrains Mono',monospace; color:var(--cyan)">${escapeHtml(p.latency)}</td>
      <td style="color:var(--text-muted)">Operational In-Memory Service</td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", renderModelMonitoring);
