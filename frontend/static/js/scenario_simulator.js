/* scenario_simulator.js — Climate Scenario Simulator & Stress-Testing */

let simChart = null;

async function renderScenarioSimulator() {
  const main = layout("scenario-simulator");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Climate Scenario Simulator</h1>
        <p class="page-description">
          Hypothetical multi-hazard stress testing and 'what-if' climate simulations for disaster management. Perturb temperature, precipitation anomalies, drought deficits, and ENSO states against calibrated 44-year baseline models.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <span class="badge badge-advisory" style="font-size:12px; padding:6px 12px">⚠️ SIMULATION MODE — HYPOTHETICAL STRESS TEST</span>
      </div>
    </div>

    <!-- PRESET BUTTONS ROW -->
    <div class="card" style="margin-bottom:20px; padding:14px 20px">
      <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:8px">QUICK STRESS-TEST PRESETS:</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="applyPreset(3.5, 0, 0, 'Current')">🔥 Severe Heatwave (+3.5°C)</button>
        <button class="btn btn-secondary btn-sm" onclick="applyPreset(1.5, -45, -20, 'El Niño')">🏜️ Compound El Niño Drought (+1.5°C, -45% Rain)</button>
        <button class="btn btn-secondary btn-sm" onclick="applyPreset(-1.0, 75, 15, 'La Niña')">🌊 Monsoonal Deluge (+75% Rain, La Niña)</button>
        <button class="btn btn-secondary btn-sm" onclick="applyPreset(0, 0, 0, 'Current')">🔄 Reset to Normal Baseline</button>
      </div>
    </div>

    <!-- CONTROLS & KPI ROW -->
    <div class="grid grid-2" style="margin-bottom:20px">
      <!-- SLIDERS CARD -->
      <div class="card">
        <div class="card-title">🎛️ Scenario Perturbation Controls</div>

        <div style="margin-top:16px">
          <label style="font-size:13px; font-weight:600; display:flex; justify-content:space-between">
            <span>District / Taluk Target</span>
          </label>
          <select id="simDistrictSelect" class="form-select" onchange="runSim()" style="background:var(--card-bg); color:var(--text-primary); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px; width:100%; margin-top:6px"></select>
        </div>

        <div style="margin-top:18px">
          <label style="font-size:13px; font-weight:600; display:flex; justify-content:space-between">
            <span>Temperature Shift (ΔT)</span>
            <span id="tempVal" style="color:var(--cyan); font-family:'JetBrains Mono',monospace">+0.0 °C</span>
          </label>
          <input type="range" id="simTempSlider" min="-5.0" max="5.0" step="0.5" value="0.0" oninput="updateSliders(); runSim()" style="width:100%; margin-top:6px">
        </div>

        <div style="margin-top:18px">
          <label style="font-size:13px; font-weight:600; display:flex; justify-content:space-between">
            <span>Rainfall Anomaly (ΔP %)</span>
            <span id="rainVal" style="color:var(--cyan); font-family:'JetBrains Mono',monospace">0 %</span>
          </label>
          <input type="range" id="simRainSlider" min="-50" max="100" step="5" value="0" oninput="updateSliders(); runSim()" style="width:100%; margin-top:6px">
        </div>

        <div style="margin-top:18px">
          <label style="font-size:13px; font-weight:600; display:flex; justify-content:space-between">
            <span>30-Day Deficit Shift</span>
            <span id="deficitVal" style="color:var(--cyan); font-family:'JetBrains Mono',monospace">0 mm</span>
          </label>
          <input type="range" id="simDeficitSlider" min="-30" max="50" step="5" value="0" oninput="updateSliders(); runSim()" style="width:100%; margin-top:6px">
        </div>

        <div style="margin-top:18px">
          <label style="font-size:13px; font-weight:600; display:flex; justify-content:space-between">
            <span>ENSO Teleconnection Override</span>
          </label>
          <select id="simEnsoSelect" class="form-select" onchange="runSim()" style="background:var(--card-bg); color:var(--text-primary); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px; width:100%; margin-top:6px">
            <option value="Current">Current Observed Phase</option>
            <option value="Neutral">Neutral (ONI: 0.0)</option>
            <option value="El Niño">Strong El Niño (ONI: +1.8)</option>
            <option value="La Niña">Strong La Niña (ONI: -1.5)</option>
          </select>
        </div>
      </div>

      <!-- COMPARATIVE KPI METRICS -->
      <div class="card">
        <div class="card-title">📊 Baseline vs Simulated Outcomes</div>
        <div class="grid grid-2" style="margin-top:16px; gap:12px">
          <div class="kpi-card" style="padding:14px; background:rgba(0,0,0,0.2)">
            <div class="kpi-label">SURFACE TEMPERATURE</div>
            <div style="display:flex; align-items:baseline; gap:8px; margin-top:6px">
              <span id="simBaseTemp" style="font-size:16px; color:var(--text-muted)">-- °C</span>
              <span style="color:var(--text-muted)">➔</span>
              <span id="simScenTemp" style="font-size:22px; font-weight:700; color:var(--cyan)">-- °C</span>
            </div>
            <div class="kpi-sub" id="simTempDelta">Delta: --</div>
          </div>

          <div class="kpi-card" style="padding:14px; background:rgba(0,0,0,0.2)">
            <div class="kpi-label">PRECIPITATION ESTIMATE</div>
            <div style="display:flex; align-items:baseline; gap:8px; margin-top:6px">
              <span id="simBaseRain" style="font-size:16px; color:var(--text-muted)">-- mm</span>
              <span style="color:var(--text-muted)">➔</span>
              <span id="simScenRain" style="font-size:22px; font-weight:700; color:var(--accent)">-- mm</span>
            </div>
            <div class="kpi-sub" id="simRainDelta">Delta: --</div>
          </div>

          <div class="kpi-card" style="padding:14px; background:rgba(0,0,0,0.2)">
            <div class="kpi-label">HEAT STRESS INDEX</div>
            <div style="display:flex; align-items:baseline; gap:8px; margin-top:6px">
              <span id="simBaseHeat" style="font-size:16px; color:var(--text-muted)">--</span>
              <span style="color:var(--text-muted)">➔</span>
              <span id="simScenHeat" style="font-size:22px; font-weight:700; color:#ef4444">--</span>
            </div>
            <div class="kpi-sub" id="simHeatDelta">Index shift: --</div>
          </div>

          <div class="kpi-card" style="padding:14px; background:rgba(0,0,0,0.2)">
            <div class="kpi-label">DROUGHT DEFICIT RISK</div>
            <div style="display:flex; align-items:baseline; gap:8px; margin-top:6px">
              <span id="simBaseDrought" style="font-size:15px; color:var(--text-muted)">--</span>
              <span style="color:var(--text-muted)">➔</span>
              <span id="simScenDrought" style="font-size:18px; font-weight:700; color:#f59e0b">--</span>
            </div>
            <div class="kpi-sub" id="simDroughtMm">30d rain: -- mm</div>
          </div>
        </div>

        <!-- OVERALL RISK TRANSITION BANNER -->
        <div style="margin-top:16px; padding:12px; border-radius:6px; background:rgba(0,0,0,0.3); border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center">
          <div>
            <span style="font-size:12px; color:var(--text-muted)">OVERALL SYSTEM RISK TRANSITION:</span>
            <div style="font-weight:700; font-size:15px; margin-top:2px" id="simStatusTransition">-- ➔ --</div>
          </div>
          <span class="badge" id="simStatusBadge" style="font-size:12px">--</span>
        </div>
      </div>
    </div>

    <!-- SIMULATED EARLY WARNING ALERTS -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
        <span>🚨 Early Warnings Triggered Under Scenario Shock</span>
        <span class="badge badge-normal" id="simAlertCountBadge">0 ALERTS</span>
      </div>
      <div id="simAlertsContainer" style="margin-top:14px; display:flex; flex-direction:column; gap:10px">
        <div style="text-align:center; padding:20px; color:var(--text-muted)">No active alerts generated.</div>
      </div>
    </div>
  `;

  await populateDistricts();
  updateSliders();
  await runSim();
}

async function populateDistricts() {
  const sel = document.getElementById("simDistrictSelect");
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
    if (d === "Bengaluru Urban") opt.selected = true;
    sel.appendChild(opt);
  });
}

function updateSliders() {
  const temp = parseFloat(document.getElementById("simTempSlider")?.value || "0");
  const rain = parseFloat(document.getElementById("simRainSlider")?.value || "0");
  const def = parseFloat(document.getElementById("simDeficitSlider")?.value || "0");

  document.getElementById("tempVal").textContent = `${temp >= 0 ? "+" : ""}${temp.toFixed(1)} °C`;
  document.getElementById("rainVal").textContent = `${rain >= 0 ? "+" : ""}${rain} %`;
  document.getElementById("deficitVal").textContent = `${def >= 0 ? "+" : ""}${def} mm`;
}

function applyPreset(temp, rain, def, enso) {
  document.getElementById("simTempSlider").value = temp;
  document.getElementById("simRainSlider").value = rain;
  document.getElementById("simDeficitSlider").value = def;
  document.getElementById("simEnsoSelect").value = enso;

  updateSliders();
  runSim();
}

async function runSim() {
  const district = document.getElementById("simDistrictSelect")?.value || "Bengaluru Urban";
  const temp_delta = parseFloat(document.getElementById("simTempSlider")?.value || "0");
  const rain_percent_delta = parseFloat(document.getElementById("simRainSlider")?.value || "0");
  const rain_30d_delta = parseFloat(document.getElementById("simDeficitSlider")?.value || "0");
  const enso_phase_override = document.getElementById("simEnsoSelect")?.value || "Current";

  try {
    const res = await api("/api/scenario-simulator/run", {
      method: "POST",
      body: JSON.stringify({
        district,
        temp_delta,
        rain_percent_delta,
        rain_30d_delta,
        enso_phase_override,
      }),
    });

    updateSimUI(res);
  } catch (err) {
    console.error("Simulation error:", err);
  }
}

function updateSimUI(res) {
  const comp = res.comparison || {};
  const t = comp.temperature || {};
  const r = comp.rainfall || {};
  const h = comp.heat_stress || {};
  const d = comp.drought_deficit || {};
  const stat = comp.overall_status || {};

  document.getElementById("simBaseTemp").textContent = `${t.baseline_c} °C`;
  document.getElementById("simScenTemp").textContent = `${t.scenario_c} °C`;
  document.getElementById("simTempDelta").textContent = `Delta: ${t.delta_c >= 0 ? "+" : ""}${t.delta_c} °C (${t.scenario_tier})`;

  document.getElementById("simBaseRain").textContent = `${r.baseline_mm} mm`;
  document.getElementById("simScenRain").textContent = `${r.scenario_mm} mm`;
  document.getElementById("simRainDelta").textContent = `Delta: ${r.delta_mm >= 0 ? "+" : ""}${r.delta_mm} mm (${r.scenario_tier})`;

  document.getElementById("simBaseHeat").textContent = `${h.baseline_index}`;
  document.getElementById("simScenHeat").textContent = `${h.scenario_index}`;
  document.getElementById("simHeatDelta").textContent = `Index shift: ${h.delta_index >= 0 ? "+" : ""}${h.delta_index}`;

  document.getElementById("simBaseDrought").textContent = `${d.baseline_risk}`;
  document.getElementById("simScenDrought").textContent = `${d.scenario_risk}`;
  document.getElementById("simDroughtMm").textContent = `30d: ${d.scenario_30d_mm} mm`;

  // Status transition
  document.getElementById("simStatusTransition").textContent = `${stat.baseline} ➔ ${stat.scenario}`;
  const badge = document.getElementById("simStatusBadge");
  badge.textContent = stat.scenario;
  badge.style.background = stat.color_scenario || "#10b981";
  badge.style.color = "#000";

  // Alerts
  const alerts = res.scenario_alerts || [];
  const alertBadge = document.getElementById("simAlertCountBadge");
  alertBadge.textContent = `${alerts.length} ALERTS GENERATED`;

  const container = document.getElementById("simAlertsContainer");
  container.innerHTML = "";

  if (alerts.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted)">No hazardous alerts triggered under this scenario.</div>`;
    return;
  }

  alerts.forEach(a => {
    const div = document.createElement("div");
    div.className = "card";
    div.style.borderLeft = `4px solid ${a.badge_color || "#38bdf8"}`;
    div.style.padding = "12px 16px";
    div.style.background = "rgba(0,0,0,0.25)";

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px">
        <span style="font-weight:700; color:${a.badge_color || '#fff'}">${escapeHtml(a.title)}</span>
        <span class="badge" style="background:${a.badge_color || '#38bdf8'}; color:#000">${a.severity}</span>
      </div>
      <div style="font-size:13px; color:var(--text-muted); margin-bottom:6px">${escapeHtml(a.rationale)}</div>
      <div style="font-size:12px; color:var(--cyan)">Observed/Simulated: <strong>${escapeHtml(a.observed_or_predicted_value)}</strong> | Threshold: ${escapeHtml(a.threshold_value)}</div>
    `;
    container.appendChild(div);
  });
}

document.addEventListener("DOMContentLoaded", renderScenarioSimulator);
