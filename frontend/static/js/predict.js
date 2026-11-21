/* ==========================================================================
   predict.js — AI Dual Model Forecast, Early Warning Dispatch & Local SHAP
   ========================================================================== */

async function renderPredict() {
  const main = layout("predict");
  let range = { min: "1981-01-31", max: "2024-12-30" };
  try {
    const features = await api("/api/features");
    range = features.date_range;
  } catch (error) {
    /* fallback to defaults */
  }

  main.innerHTML = `
    <!-- Page Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">AI Climate Predictions &amp; Scenario Forecasting</h1>
        <p class="page-description">
          Select any historical observation date (1981–2024). The engine automatically extracts all 32 autoregressive lag and rolling features, executes dual Scikit-learn inference, classifies compound hazard tiers, and computes local SHAP feature contributions.
        </p>
      </div>
      <div class="badge badge-cyan" style="font-size:12px">DUAL ML PIPELINE • 32 FEAT VECTOR</div>
    </div>

    <section class="grid grid-sidebar-layout">
      <!-- Left Column: Date Selector & Model Specs -->
      <article class="card">
        <div class="card-header">
          <h2 class="card-title">Observation Date Vector Selection</h2>
          <span class="badge badge-cyan">AUTOREGRESSIVE D+1</span>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-top:-4px; margin-bottom:14px">
          Technical lags (1–30d), rolling averages (7–30d), and cyclical calendar features are loaded automatically without manual input.
        </p>

        <form id="predict-form">
          <div class="form-group">
            <label class="form-label" for="date">Observation Calendar Date (${range.min} to ${range.max}):</label>
            <input id="date" name="date" type="date" min="${range.min}" max="${range.max}" value="2024-05-15" required class="form-control" style="font-family:'JetBrains Mono', monospace">
          </div>

          <!-- Quick Season Preset Buttons -->
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px">
            <span style="font-size:11px; color:var(--text-muted); align-self:center">Presets:</span>
            <button type="button" class="btn btn-secondary" style="padding:3px 8px; font-size:11px" onclick="setPresetDate('2024-05-15')">Summer Heat (2024)</button>
            <button type="button" class="btn btn-secondary" style="padding:3px 8px; font-size:11px" onclick="setPresetDate('2023-08-20')">Monsoon El Niño (2023)</button>
            <button type="button" class="btn btn-secondary" style="padding:3px 8px; font-size:11px" onclick="setPresetDate('2024-12-30')">Winter Baseline (2024)</button>
            <button type="button" class="btn btn-secondary" style="padding:3px 8px; font-size:11px" onclick="setPresetDate('2010-02-15')">Strong El Niño (2010)</button>
          </div>

          <div style="display:flex; gap:10px">
            <button type="submit" id="submitBtn" class="btn btn-primary" style="flex:1">⚡ Execute AI Inference</button>
            <button type="button" class="btn btn-secondary" id="randomDateBtn">🎲 Random Date</button>
          </div>

          <p id="form-error" class="error" style="margin-top:10px; font-size:12px; color:var(--risk-critical)"></p>

          <div style="margin-top:16px; background:rgba(8,17,29,0.7); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:11px; line-height:1.6">
            <div style="font-weight:700; color:var(--cyan); margin-bottom:4px">MODEL SPECIFICATIONS &amp; BENCHMARKS:</div>
            <div>• <b>Temperature:</b> StandardScaler + LinearRegression (<span style="color:#00f0ff">R² ≈ 0.94</span>, MAE ≈ 0.73 °C)</div>
            <div>• <b>Rainfall:</b> GradientBoostingRegressor (<span style="color:#00e5bc">R² ≈ 0.23</span>, MAE ≈ 4.54 mm)</div>
            <div>• <b>Feature Space:</b> 32 engineered dimensions (Calendar, ONI, Lags 1–30, Rolling 7–30)</div>
          </div>
        </form>
      </article>

      <!-- Right Column: Prediction Outlook & Early Warning Bulletin -->
      <article class="card" id="result-card">
        <div class="card-header">
          <h2 class="card-title">Forecast Outlook &amp; Risk Classification</h2>
          <span class="badge badge-normal">AWAITING RUN</span>
        </div>
        <p class="muted" style="padding:20px 0; text-align:center">
          Select an observation date and click "Execute AI Inference" to run dual Scikit-learn pipelines and local SHAP analysis.
        </p>
      </article>
    </section>

    <!-- Full 32-Feature Transparency Table -->
    <section class="card" id="featureTransparencyCard" style="display:none; margin-top:20px">
      <div class="card-header">
        <div>
          <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
            MODEL TRANSPARENCY &amp; FEATURE INPUTS
          </div>
          <h2 class="card-title" style="margin-top:2px">Verified 32-Dimensional Input Vector</h2>
        </div>
        <button class="btn btn-secondary" id="toggleFeaturesBtn" style="padding:4px 10px; font-size:11px">Hide Feature Grid</button>
      </div>
      <p style="font-size:12px; color:var(--text-muted); margin-top:-4px; margin-bottom:12px">
        Verified input vector loaded into Scikit-learn pipelines with zero manual technical entry:
      </p>
      <div class="grid" id="featureGridContainer" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:8px"></div>
    </section>
  `;

  // Random Date Picker
  document.getElementById("randomDateBtn").addEventListener("click", () => {
    const minTimestamp = new Date(range.min).getTime();
    const maxTimestamp = new Date(range.max).getTime();
    const randomTimestamp = minTimestamp + Math.random() * (maxTimestamp - minTimestamp);
    const randomDate = new Date(randomTimestamp).toISOString().split("T")[0];
    document.getElementById("date").value = randomDate;
    document.getElementById("submitBtn").click();
  });

  // Submit Handler
  document.getElementById("predict-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = document.getElementById("form-error");
    const result = document.getElementById("result-card");
    const featureCard = document.getElementById("featureTransparencyCard");
    const featureGrid = document.getElementById("featureGridContainer");

    errorBox.textContent = "";
    const submitBtn = document.getElementById("submitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Executing Inference...";
    result.innerHTML = `<p class="muted" style="padding:20px 0; text-align:center">Synthesizing 32 features and executing dual Scikit-learn inference pipelines...</p>`;

    try {
      const selectedDate = document.getElementById("date").value;
      const payload = await api("/api/predict-from-date", {
        method: "POST",
        body: JSON.stringify({ date: selectedDate, include_shap: true }),
      });

      const tempShap = (payload.shap && payload.shap.temperature) || [];
      const rainShap = (payload.shap && payload.shap.rainfall) || [];
      const ew = payload.early_warnings;

      result.innerHTML = `
        <div class="card-header" style="margin-bottom:12px">
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
              NEXT-DAY PREDICTED METEOROLOGICAL STATE
            </div>
            <h2 class="card-title" style="margin-top:2px">Target Date: ${payload.date}</h2>
            <div style="font-size:11px; color:var(--text-muted)">Observed: ${selectedDate} • Horizon: Next Day (D+1)</div>
          </div>
          ${ensoTag(payload.oni_phase)}
        </div>

        <!-- Metric KPI Pills -->
        <div class="grid grid-2" style="margin-bottom:14px; gap:10px">
          <div style="background:rgba(8,17,29,0.8); border:1px solid rgba(0,240,255,0.25); border-radius:var(--radius-sm); padding:12px">
            <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase">Predicted Mean Temp</div>
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:4px">
              <span style="font-size:26px; font-weight:700; font-family:'JetBrains Mono'; color:#00f0ff">${payload.predicted_temperature_C} °C</span>
              ${getRiskBadge(payload.temperature_level)}
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px">Heat Stress Proxy: <b>${payload.heat_stress_score}/100</b></div>
          </div>

          <div style="background:rgba(8,17,29,0.8); border:1px solid rgba(0,229,188,0.25); border-radius:var(--radius-sm); padding:12px">
            <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase">Predicted Rainfall</div>
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:4px">
              <span style="font-size:26px; font-weight:700; font-family:'JetBrains Mono'; color:#00e5bc">${payload.predicted_rainfall_mm} mm</span>
              ${getRiskBadge(payload.rainfall_level)}
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px">Trailing 30d: <b>${payload.rainfall_rolling_30d_mm ?? "—"} mm</b> (${payload.drought_risk} Drought Risk)</div>
          </div>
        </div>

        <!-- Automated Early Warning Bulletin -->
        ${ew ? `
          <div style="background:rgba(8,17,29,0.9); border:1px solid ${ew.color}55; border-left:5px solid ${ew.color}; border-radius:var(--radius-sm); padding:12px; margin-bottom:14px">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px">
              <div style="display:flex; align-items:center; gap:8px">
                <span style="font-size:18px">${ew.icon}</span>
                <strong style="color:${ew.color}; font-size:13px; text-transform:uppercase; letter-spacing:0.5px">EARLY WARNING: ${ew.status}</strong>
              </div>
              <span class="badge" style="background:${ew.color}22; color:${ew.color}; border:1px solid ${ew.color}55; font-size:10px">
                ${ew.alert_count} Active Advisory
              </span>
            </div>
            <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px">
              ${(ew.alerts || []).map(a => `
                <div style="background:rgba(255,255,255,0.03); padding:8px 10px; border-radius:4px; font-size:12px">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px">
                    <span style="font-weight:600; color:${a.badge_color}">${escapeHtml(a.title)}</span>
                    <span class="badge badge-${a.severity.toLowerCase()}" style="font-size:9px">${a.severity}</span>
                  </div>
                  <div style="font-size:11px; color:var(--text-dim)">${escapeHtml(a.rationale)}</div>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

        <!-- Adaptation Guidance Accordion -->
        <div style="display:flex; flex-direction:column; gap:8px; font-size:12px; margin-bottom:14px">
          <div style="background:rgba(13,26,45,0.6); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle)">
            <strong style="color:#00f0ff">🌡️ Heat Adaptation Action:</strong>
            <p style="margin:2px 0 0; color:var(--text-dim)">${escapeHtml(payload.temperature_recommendation || "")}</p>
          </div>
          <div style="background:rgba(13,26,45,0.6); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle)">
            <strong style="color:#00e5bc">🌧️ Rainfall Adaptation Action:</strong>
            <p style="margin:2px 0 0; color:var(--text-dim)">${escapeHtml(payload.rainfall_recommendation || "")}</p>
          </div>
        </div>

        <!-- Local SHAP Feature Explanations -->
        <div class="card-header" style="margin-bottom:6px">
          <h3 class="card-title" style="font-size:13px">Local SHAP Feature Contributions (Top Drivers)</h3>
          <span class="badge ${payload.shap_available === false ? 'badge-warning' : 'badge-cyan'}">
            ${payload.shap_available === false ? 'EXPLAINABILITY PAUSED' : 'EXPLAINABLE AI'}
          </span>
        </div>
        ${payload.shap_available === false ? `
          <div style="background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.3); border-radius:var(--radius-sm); padding:12px; margin-bottom:10px">
            <div style="font-weight:700; color:#fbbf24; font-size:12px; display:flex; align-items:center; gap:6px">
              <span>⚠️</span> SHAP EXPLAINABILITY TEMPORARILY UNAVAILABLE
            </div>
            <p style="font-size:11.5px; color:var(--text-dim); margin:4px 0 0; line-height:1.5">
              Windows Smart App Control or an Application Control policy has blocked the compiled SHAP binary dependency.
              All machine learning forecast predictions, compound multi-hazard classifications, and early warnings above remain fully operational and verified.
            </p>
          </div>
        ` : `
          <p style="font-size:11px; color:var(--text-muted); margin-bottom:8px">Positive SHAP pushes forecast higher; negative moderates lower.</p>
          <div class="grid grid-2" style="gap:10px">
            <div>
              <div style="font-size:11px; color:#00f0ff; margin-bottom:4px">Temperature Model (Linear SHAP)</div>
              <canvas id="localTempShapChart" height="180"></canvas>
            </div>
            <div>
              <div style="font-size:11px; color:#00e5bc; margin-bottom:4px">Rainfall Model (Tree SHAP)</div>
              <canvas id="localRainShapChart" height="180"></canvas>
            </div>
          </div>
        `}

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono', monospace">
          <span>STORAGE: ${payload.database || "Database Logged"}</span>
          <a href="/history" style="color:var(--cyan)">Audit Trail →</a>
        </div>
      `;

      // Render Local SHAP Charts if SHAP is active
      if (payload.shap_available !== false) {
        renderLocalShapCharts(tempShap, rainShap);
      }

      // Render 32 Features Table if features available
      if (payload.features_used) {
        featureCard.style.display = "block";
        featureGrid.innerHTML = Object.entries(payload.features_used).map(([k, v]) => `
          <div style="background:rgba(8,17,29,0.7); padding:6px 10px; border-radius:4px; border:1px solid var(--border-subtle); font-size:11px; display:flex; justify-content:space-between">
            <span style="color:var(--text-dim); font-family:'JetBrains Mono', monospace">${escapeHtml(k)}</span>
            <span style="color:var(--cyan); font-family:'JetBrains Mono', monospace; font-weight:600">${Number(v).toFixed(3)}</span>
          </div>
        `).join("");
      }

    } catch (err) {
      errorBox.textContent = err.message || "Prediction execution failed.";
      result.innerHTML = `<p class="error" style="padding:20px 0; text-align:center">Error: ${escapeHtml(err.message)}</p>`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "⚡ Execute AI Inference";
    }
  });

  // Feature Toggle Button
  document.getElementById("toggleFeaturesBtn")?.addEventListener("click", () => {
    const grid = document.getElementById("featureGridContainer");
    const btn = document.getElementById("toggleFeaturesBtn");
    const isHidden = grid.style.display === "none";
    grid.style.display = isHidden ? "grid" : "none";
    btn.textContent = isHidden ? "Hide Feature Grid" : "Show Feature Grid";
  });
}

function setPresetDate(dateStr) {
  const input = document.getElementById("date");
  if (input) {
    input.value = dateStr;
    document.getElementById("submitBtn").click();
  }
}

function renderLocalShapCharts(tempShap, rainShap) {
  const topTemp = [...tempShap].sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value)).slice(0, 6);
  const topRain = [...rainShap].sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value)).slice(0, 6);

  const ctxTemp = document.getElementById("localTempShapChart");
  if (ctxTemp && topTemp.length > 0) {
    new Chart(ctxTemp, {
      type: "bar",
      data: {
        labels: topTemp.map(d => d.feature.replace(/_/g, " ")),
        datasets: [{
          label: "SHAP (°C)",
          data: topTemp.map(d => Number(d.shap_value).toFixed(2)),
          backgroundColor: topTemp.map(d => d.shap_value >= 0 ? "#00f0ff" : "#3b82f6"),
          borderRadius: 2,
        }],
      },
      options: {
        indexAxis: "y",
        ...chartDefaults(),
        plugins: { legend: { display: false } },
      },
    });
  }

  const ctxRain = document.getElementById("localRainShapChart");
  if (ctxRain && topRain.length > 0) {
    new Chart(ctxRain, {
      type: "bar",
      data: {
        labels: topRain.map(d => d.feature.replace(/_/g, " ")),
        datasets: [{
          label: "SHAP (mm)",
          data: topRain.map(d => Number(d.shap_value).toFixed(2)),
          backgroundColor: topRain.map(d => d.shap_value >= 0 ? "#00e5bc" : "#f59e0b"),
          borderRadius: 2,
        }],
      },
      options: {
        indexAxis: "y",
        ...chartDefaults(),
        plugins: { legend: { display: false } },
      },
    });
  }
}

document.addEventListener("DOMContentLoaded", renderPredict);
