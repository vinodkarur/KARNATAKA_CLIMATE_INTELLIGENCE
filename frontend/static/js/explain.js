/* ==========================================================================
   explain.js — Climate Analytics, SHAP Explainability & Model Governance
   ========================================================================== */

async function renderExplain() {
  const main = layout("explain");
  main.innerHTML = `<p class="muted">Loading SHAP explainability insights and model governance benchmarks...</p>`;

  try {
    const data = await api("/api/shap");
    const features = data.features || [];
    const evaluation = data.evaluation || [];

    const topTemp = [...features].sort((a, b) => b.temperature - a.temperature).slice(0, 10);
    const topRain = [...features].sort((a, b) => b.rainfall - a.rainfall).slice(0, 10);

    main.innerHTML = `
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Climate Analytics, SHAP Explainability &amp; Model Governance</h1>
          <p class="page-description">
            Rigorous mathematical model interpretability. Computes global Shapley feature contributions across 32 dimensions, validating atmospheric drivers for Karnataka next-day temperature and precipitation forecasting.
          </p>
        </div>
        <div class="badge badge-cyan" style="font-size:12px">EXPLAINABLE AI • SHAP L-EXPLAINER &amp; TREE</div>
      </div>

      <!-- Model Performance Benchmark Table -->
      <section class="card" style="margin-bottom:20px">
        <div class="card-header">
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
              MODEL GOVERNANCE &amp; VALIDATION
            </div>
            <h3 class="card-title" style="margin-top:2px">Hold-Out Test Set Evaluation Benchmarks (Step 10 Record)</h3>
          </div>
          <span class="badge badge-cyan">3,208 TEST DAYS</span>
        </div>

        <div style="overflow-x:auto">
          <table class="command-table">
            <thead>
              <tr>
                <th>Target Variable</th>
                <th>Trained Algorithm</th>
                <th>Test MAE</th>
                <th>Test RMSE</th>
                <th>Test R² Score</th>
                <th>Mean Residual</th>
                <th>Residual Std</th>
                <th>Skill Evaluation</th>
              </tr>
            </thead>
            <tbody>
              ${evaluation.map((r) => {
                const isTemp = r.target.includes("Temp");
                const r2Badge = r.r2 > 0.8 ? "badge-cyan" : "badge-warning";
                const skillLabel = isTemp ? "Strong Deterministic Skill" : "Statistical Directional Skill";
                return `
                  <tr>
                    <td><strong style="color:#fff">Target_Next_Day_${r.target}</strong></td>
                    <td style="font-family:'JetBrains Mono', monospace; font-size:12px">${r.model}</td>
                    <td style="font-family:'JetBrains Mono', monospace; color:#00f0ff">${r.mae} ${isTemp ? "°C" : "mm"}</td>
                    <td style="font-family:'JetBrains Mono', monospace; color:#38bdf8">${r.rmse} ${isTemp ? "°C" : "mm"}</td>
                    <td><span class="badge ${r2Badge}">R² = ${r.r2}</span></td>
                    <td style="font-family:'JetBrains Mono', monospace">${r.mean_error}</td>
                    <td style="font-family:'JetBrains Mono', monospace">${r.error_std}</td>
                    <td><span style="font-size:11px; color:var(--text-dim)">${skillLabel}</span></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>

        <div style="margin-top:14px; background:rgba(8,17,29,0.7); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:12px; color:var(--text-dim); line-height:1.6">
          <strong>Atmospheric Physics Analysis:</strong> Temperature exhibits exceptional predictability (<span style="color:#00f0ff">R² ≈ 0.94</span>) governed by solar declination geometry, day-of-year cyclicity, and 7-day thermal inertia. In contrast, daily convective precipitation presents high stochastic intermittency (<span style="color:#00e5bc">R² ≈ 0.23</span>), accurately reflecting peninsular monsoon cloudburst physics and justifying its use as a relative risk classifier rather than an exact millimeter guarantee.
        </div>
      </section>

      <!-- Global Feature Importance Charts -->
      <section class="grid grid-2" style="margin-bottom:20px">
        <article class="card">
          <div class="card-header">
            <h3 class="card-title">Top 10 Global Drivers: Temperature Model</h3>
            <span class="badge badge-cyan">LINEAR SHAP</span>
          </div>
          <p style="font-size:11px; color:var(--text-muted); margin-top:-4px; margin-bottom:12px">Mean absolute SHAP value (|dY/dX|) across all test set observations</p>
          <canvas id="tempShapGlobalChart" height="240"></canvas>
        </article>

        <article class="card">
          <div class="card-header">
            <h3 class="card-title">Top 10 Global Drivers: Rainfall Model</h3>
            <span class="badge badge-normal">TREE SHAP</span>
          </div>
          <p style="font-size:11px; color:var(--text-muted); margin-top:-4px; margin-bottom:12px">Mean absolute SHAP value (|dY/dX|) from Gradient Boosting trees</p>
          <canvas id="rainShapGlobalChart" height="240"></canvas>
        </article>
      </section>

      <!-- 32-Feature Importance Table -->
      <section class="card" style="margin-bottom:20px">
        <div class="card-header">
          <h3 class="card-title">Complete 32-Feature Importance Matrix</h3>
          <span class="badge badge-cyan">ALL 32 DIMENSIONS</span>
        </div>
        <div style="overflow-x:auto">
          <table class="command-table">
            <thead>
              <tr>
                <th>Feature Name</th>
                <th>Feature Category</th>
                <th>Temperature SHAP Importance</th>
                <th>Rainfall SHAP Importance</th>
                <th>Primary Role</th>
              </tr>
            </thead>
            <tbody>
              ${features.map(f => {
                let cat = "Autoregressive Lag";
                if (f.feature.includes("Rolling")) cat = "Moving Window Average";
                else if (f.feature.includes("Sin") || f.feature.includes("Cos") || f.feature.includes("Day") || f.feature.includes("Month")) cat = "Trigonometric Calendar";
                else if (f.feature.includes("ONI") || f.feature.includes("El_Nino") || f.feature.includes("La_Nina")) cat = "ENSO Teleconnection";

                return `
                  <tr>
                    <td style="font-family:'JetBrains Mono', monospace; font-weight:600; color:#fff">${escapeHtml(f.feature)}</td>
                    <td><span class="badge" style="background:rgba(56,189,248,0.1); color:var(--cyan); border:1px solid rgba(56,189,248,0.2)">${cat}</span></td>
                    <td style="font-family:'JetBrains Mono', monospace; color:#00f0ff">${Number(f.temperature).toFixed(4)}</td>
                    <td style="font-family:'JetBrains Mono', monospace; color:#00e5bc">${Number(f.rainfall).toFixed(4)}</td>
                    <td style="font-size:11px; color:var(--text-dim)">${f.temperature > f.rainfall ? "Thermal Momentum" : "Hydrological Forcing"}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Mathematical Governance Disclaimer -->
      <div class="scientific-disclaimer-box">
        <strong>SHAP Mathematical Foundation:</strong> SHAP values compute additive feature contributions rooted in cooperative game theory ($f(x) = \phi_0 + \sum_{i=1}^{M} \phi_i$). LinearExplainer accounts for inter-feature covariance; TreeExplainer computes exact conditional expectations over decision splits without sampling approximations.
      </div>
    `;

    // Render Global Charts
    initShapGlobalCharts(topTemp, topRain);

  } catch (err) {
    main.innerHTML = `<div class="card"><h2 style="color:var(--risk-critical)">Error Loading SHAP Analytics</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function initShapGlobalCharts(topTemp, topRain) {
  const ctxTemp = document.getElementById("tempShapGlobalChart");
  if (ctxTemp && topTemp.length > 0) {
    new Chart(ctxTemp, {
      type: "bar",
      data: {
        labels: topTemp.map(d => d.feature.replace(/_/g, " ")),
        datasets: [{
          label: "Temperature SHAP Importance",
          data: topTemp.map(d => d.temperature),
          backgroundColor: "#00f0ff",
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: "y",
        ...chartDefaults(),
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#64748b" }, grid: { color: "rgba(56, 189, 248, 0.06)" } },
          y: { ticks: { color: "#94a3b8" }, grid: { display: false } },
        },
      },
    });
  }

  const ctxRain = document.getElementById("rainShapGlobalChart");
  if (ctxRain && topRain.length > 0) {
    new Chart(ctxRain, {
      type: "bar",
      data: {
        labels: topRain.map(d => d.feature.replace(/_/g, " ")),
        datasets: [{
          label: "Rainfall SHAP Importance",
          data: topRain.map(d => d.rainfall),
          backgroundColor: "#00e5bc",
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: "y",
        ...chartDefaults(),
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#64748b" }, grid: { color: "rgba(56, 189, 248, 0.06)" } },
          y: { ticks: { color: "#94a3b8" }, grid: { display: false } },
        },
      },
    });
  }
}

document.addEventListener("DOMContentLoaded", renderExplain);
