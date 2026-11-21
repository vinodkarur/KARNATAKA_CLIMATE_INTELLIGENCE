/* flood.js — Rainfall & Flood Risk Monitoring Module */

async function renderFloodRisk() {
  const main = layout("flood");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Rainfall & Flood Risk Monitoring</h1>
        <p class="page-description">
          Real-time hydrometeorological surveillance, intense precipitation thresholds, catchment inundation alerts, and municipal stormwater containment protocols across Karnataka.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center">
        <span class="badge badge-cyan">HYDROMETEOROLOGICAL SURVEILLANCE</span>
      </div>
    </div>
    <div class="card" style="text-align:center; padding:40px">
      <div style="font-family:'JetBrains Mono',monospace; color:var(--cyan)">Retrieving rainfall and flood risk telemetry...</div>
    </div>
  `;

  try {
    const data = await api("/api/dashboard");
    const th = data.thresholds || {};

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Rainfall & Flood Risk Monitoring</h1>
          <p class="page-description">
            Real-time hydrometeorological surveillance, intense precipitation thresholds, catchment inundation alerts, and municipal stormwater containment protocols across Karnataka.
          </p>
        </div>
        <div style="display:flex; gap:10px; align-items:center">
          <span class="badge badge-critical">ACTIVE INUNDATION WATCH</span>
          <a href="/alerts" class="btn btn-secondary" style="font-size:12px; padding:6px 12px">🚨 Early Warnings</a>
        </div>
      </div>

      <!-- Hero KPI Stat Cards -->
      <div class="grid grid-4" style="margin-bottom:20px">
        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">VERY HIGH RAIN (P90)</span>
            <div class="kpi-icon-pill" style="color:var(--cyan)">🌊</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${(th.Rainfall_90th_Percentile || 16.22).toFixed(2)}</span>
            <span class="kpi-unit">mm</span>
          </div>
          <div class="kpi-subtext">Historical 90th percentile heavy downpour threshold</div>
        </div>

        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">HIGH RAIN THRESHOLD (P75)</span>
            <div class="kpi-icon-pill" style="color:var(--teal)">🌧️</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${(th.Rainfall_75th_Percentile || 7.35).toFixed(2)}</span>
            <span class="kpi-unit">mm</span>
          </div>
          <div class="kpi-subtext">Upper quartile localized precipitation tier</div>
        </div>

        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">COASTAL PEAK RECORD</span>
            <div class="kpi-icon-pill" style="color:var(--risk-critical)">🚨</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">360.0</span>
            <span class="kpi-unit">mm</span>
          </div>
          <div class="kpi-subtext">24-hour maximum recorded at coastal station</div>
        </div>

        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">CRITICAL FLOOD BASINS</span>
            <div class="kpi-icon-pill" style="color:var(--risk-warning)">🏔️</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">5</span>
            <span class="kpi-unit">basins</span>
          </div>
          <div class="kpi-subtext">Netravati, Cauvery, Tunga-Bhadra, Kali, Sharavathi</div>
        </div>
      </div>

      <!-- Heavy Precipitation Risk Simulator -->
      <div class="card" style="margin-bottom:24px">
        <div class="card-header">
          <div>
            <div class="card-title">Interactive Heavy Precipitation & Inundation Simulator</div>
            <div class="card-subtitle">Evaluate municipal flood containment protocols across simulated rainfall intensity brackets:</div>
          </div>
          <div style="display:flex; gap:8px">
            <button class="chip-btn" onclick="setFloodSim(10.0)">🌧️ Moderate Rain (10mm)</button>
            <button class="chip-btn" onclick="setFloodSim(25.0)">🌊 Heavy Cloudburst (25mm)</button>
            <button class="chip-btn" onclick="setFloodSim(65.0)">🚨 Extreme Deluge (65mm)</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 2fr; gap:20px; align-items:center">
          <div>
            <label class="form-label" for="floodSimInput">SIMULATED 24-HR LOCAL RAINFALL (MM):</label>
            <input type="range" id="floodSimSlider" min="0" max="100" step="1" value="18" class="form-control" style="accent-color:var(--cyan)">
            <div style="display:flex; justify-content:space-between; margin-top:6px; font-family:'JetBrains Mono',monospace; font-size:13px">
              <span id="floodSimVal" style="font-weight:700; color:var(--cyan)">18.0 mm</span>
              <span id="floodSimTierBadge" class="badge badge-warning">HIGH RAINFALL RISK</span>
            </div>
          </div>

          <div id="floodSimDirectiveBox" style="background:rgba(8,17,29,0.7); border:1px solid var(--border-subtle); padding:14px 18px; border-radius:8px">
            <!-- Dynamic Directive -->
          </div>
        </div>
      </div>

      <!-- Regional Hydrological Vulnerability Analysis -->
      <div class="grid grid-2" style="margin-bottom:24px">
        <!-- Chart -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Regional Rainfall Climatology by Terrain Zone</div>
          </div>
          <div style="height:280px">
            <canvas id="regionalRainChart"></canvas>
          </div>
        </div>

        <!-- Vulnerable River Basins Table -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Top Flood-Vulnerable Catchment Basins</div>
          </div>
          <div style="overflow-x:auto">
            <table class="command-table">
              <thead>
                <tr>
                  <th>River Basin</th>
                  <th>Primary Districts</th>
                  <th>Flood Vulnerability</th>
                  <th>Key Hazard Trigger</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Netravati & Gurupura</strong></td>
                  <td>Dakshina Kannada</td>
                  <td><span class="badge badge-critical">CRITICAL</span></td>
                  <td>Steep Ghats runoff & tidal backwaters</td>
                </tr>
                <tr>
                  <td><strong>Upper Cauvery Basin</strong></td>
                  <td>Kodagu, Hassan, Mysuru</td>
                  <td><span class="badge badge-critical">CRITICAL</span></td>
                  <td>Rapid reservoir filling & slope mudslides</td>
                </tr>
                <tr>
                  <td><strong>Tunga-Bhadra Basin</strong></td>
                  <td>Shivamogga, Chikkamagaluru</td>
                  <td><span class="badge badge-warning">HIGH</span></td>
                  <td>Downstream dam discharge surges</td>
                </tr>
                <tr>
                  <td><strong>Kali & Aghanashini</strong></td>
                  <td>Uttara Kannada</td>
                  <td><span class="badge badge-warning">HIGH</span></td>
                  <td>Coastal flash floods & river swells</td>
                </tr>
                <tr>
                  <td><strong>Vrishabhavathi & Pinakini</strong></td>
                  <td>Bengaluru Urban / Rural</td>
                  <td><span class="badge badge-warning">HIGH (URBAN)</span></td>
                  <td>Stormwater drain bottlenecking & underpasses</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Municipal Action Framework -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Municipal Flood Management & Drainage Action Framework</div>
        </div>
        <div class="grid grid-3">
          <div style="background:rgba(8,17,29,0.7); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
            <div style="font-weight:700; color:var(--cyan); margin-bottom:6px">1. Arterial Drain Clearance</div>
            <div style="font-size:12.5px; line-height:1.6; color:var(--text-dim)">
              Inspect primary Rajakaluves and desilt cross-culverts to prevent hydraulic backpressure. Deploy trash booms at choke points.
            </div>
          </div>
          <div style="background:rgba(8,17,29,0.7); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
            <div style="font-weight:700; color:var(--teal); margin-bottom:6px">2. Underpass Dewatering Readiness</div>
            <div style="font-size:12.5px; line-height:1.6; color:var(--text-dim)">
              Pre-position mobile diesel pump sets at arterial vehicular underpasses. Synchronize traffic police diversions when sensors exceed 15cm.
            </div>
          </div>
          <div style="background:rgba(8,17,29,0.7); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
            <div style="font-weight:700; color:var(--risk-warning); margin-bottom:6px">3. Low-Lying Ward Protection</div>
            <div style="font-size:12.5px; line-height:1.6; color:var(--text-dim)">
              Broadcast SMS alert bulletins to informal settlements adjacent to lake buffer zones and low-gradient river floodplains.
            </div>
          </div>
        </div>
      </div>
    `;

    initFloodSimulator();
    initRegionalChart();

  } catch (err) {
    main.innerHTML = `<div class="card" style="border-color:var(--risk-critical); color:var(--risk-critical)">Failed to initialize flood risk module: ${err.message}</div>`;
  }
}

function initFloodSimulator() {
  const slider = document.getElementById("floodSimSlider");
  if (!slider) return;

  function update() {
    const val = parseFloat(slider.value);
    document.getElementById("floodSimVal").textContent = `${val.toFixed(1)} mm`;
    const badge = document.getElementById("floodSimTierBadge");
    const directiveBox = document.getElementById("floodSimDirectiveBox");

    if (val > 25) {
      badge.className = "badge badge-critical";
      badge.textContent = "CRITICAL INUNDATION ALERT (>25mm)";
      directiveBox.innerHTML = `
        <div style="color:var(--risk-critical); font-weight:700; margin-bottom:4px">CRITICAL PROTOCOL ACTIVATION</div>
        <div style="font-size:13px; color:#fff; line-height:1.5">
          Deploy emergency dewatering squads to known underpass vulnerability coordinates. Initiate precautionary evacuation in low-lying riparian tenements. Restrict non-essential vehicular movement in waterlogged corridors.
        </div>
      `;
    } else if (val > 12) {
      badge.className = "badge badge-warning";
      badge.textContent = "HIGH RAINFALL WATCH (12–25mm)";
      directiveBox.innerHTML = `
        <div style="color:var(--risk-warning); font-weight:700; margin-bottom:4px">ELEVATED DRAINAGE WATCH</div>
        <div style="font-size:13px; color:#fff; line-height:1.5">
          Maintain 24/7 pumping readiness at storm-water drain bottlenecks. Clear debris from roadside catch basins and monitor municipal balancing reservoir levels.
        </div>
      `;
    } else if (val > 4) {
      badge.className = "badge badge-normal";
      badge.textContent = "NORMAL RAINFALL ENVELOPE (4–12mm)";
      directiveBox.innerHTML = `
        <div style="color:var(--risk-normal); font-weight:700; margin-bottom:4px">ROUTINE RUNOFF MANAGEMENT</div>
        <div style="font-size:13px; color:#fff; line-height:1.5">
          Standard gravity drainage operating within hydraulic capacity. Optimal period for routine stormwater desilting and rainwater harvesting percolation recharge.
        </div>
      `;
    } else {
      badge.className = "badge badge-advisory";
      badge.textContent = "LOW / DRY BASELINE (<4mm)";
      directiveBox.innerHTML = `
        <div style="color:var(--risk-advisory); font-weight:700; margin-bottom:4px">DRY PROFILE / MINIMAL RUNOFF</div>
        <div style="font-size:13px; color:#fff; line-height:1.5">
          Zero flood hazard. Focus on surface reservoir conservation and deep-channel maintenance across urban water bodies.
        </div>
      `;
    }
  }

  slider.addEventListener("input", update);
  update();
}

function setFloodSim(val) {
  const slider = document.getElementById("floodSimSlider");
  if (slider) {
    slider.value = val;
    slider.dispatchEvent(new Event("input"));
  }
}

function initRegionalChart() {
  const ctx = document.getElementById("regionalRainChart");
  if (!ctx) return;

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Coastal Zone", "Hilly / Malnad", "Southern Transition", "South Interior", "Central Dry", "Northern Dry"],
      datasets: [
        {
          label: "Normal Annual Precipitation (mm)",
          data: [3850, 2200, 1150, 880, 640, 580],
          backgroundColor: [
            "rgba(0, 240, 255, 0.7)",
            "rgba(0, 229, 188, 0.7)",
            "rgba(56, 189, 248, 0.6)",
            "rgba(168, 85, 247, 0.6)",
            "rgba(249, 115, 22, 0.6)",
            "rgba(239, 68, 68, 0.6)",
          ],
          borderColor: "#08111d",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { ticks: { color: "#94a3b8", font: { family: "Outfit", size: 11 } }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#94a3b8" }, title: { display: true, text: "Annual Rainfall (mm)", color: "#00f0ff" }, grid: { color: "rgba(255,255,255,0.05)" } },
      },
    },
  });
}

renderFloodRisk();
