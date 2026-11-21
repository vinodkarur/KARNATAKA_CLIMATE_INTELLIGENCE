/* ==========================================================================
   alerts.js — Meteorological Multi-Hazard Early Warning Centre (Karnataka)
   ========================================================================== */

let currentAlertData = null;
let currentDistrictsList = [];
let currentSelectedDistrict = "Statewide";
let currentSelectedDate = "2024-12-30";
let activeTab = "bulletins"; // "bulletins" | "map" | "matrix" | "history"
let alertGisMap = null;
let alertGeoJsonLayer = null;
let activeMatrixFilter = null;
let activeSeverityFilter = null;

const KARNATAKA_31_DISTRICTS = [
  "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban",
  "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga",
  "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan",
  "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal",
  "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga",
  "Tumakuru", "Udupi", "Uttara Kannada", "Vijayapura", "Vijayanagara", "Yadgir"
];

async function renderAlerts() {
  const main = layout("alerts");
  main.innerHTML = `<div class="card" style="text-align:center; padding:40px">
    <div style="font-family:'JetBrains Mono',monospace; color:var(--cyan)">Initializing Karnataka Meteorological Early Warning Centre...</div>
  </div>`;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const dateParam = urlParams.get("date") || currentSelectedDate;
    const distParam = urlParams.get("district") || currentSelectedDistrict;

    currentSelectedDate = dateParam;
    currentSelectedDistrict = distParam;

    const alertUrl = distParam && distParam !== "Statewide"
      ? `/api/alerts?date=${encodeURIComponent(dateParam)}&district=${encodeURIComponent(distParam)}`
      : `/api/alerts?date=${encodeURIComponent(dateParam)}`;

    const res = await api(alertUrl);
    currentAlertData = res;

    // Cache district summaries if available
    if (res.district_summaries) {
      currentDistrictsList = res.district_summaries;
    }

    renderAlertsUI(main);

  } catch (err) {
    main.innerHTML = `
      <div class="card">
        <h2 style="color:var(--risk-critical)">Early Warning System Offline</h2>
        <p>${escapeHtml(err.message)}</p>
        <button class="btn btn-secondary" onclick="window.location.href='/alerts'">Reset to Baseline</button>
      </div>`;
  }
}

function renderAlertsUI(main) {
  const d = currentAlertData;
  const ew = d.early_warnings || {};
  const summary = d.summary || {};
  const isDistrictMode = d.district && d.district !== "Statewide";
  const statusCounts = d.status_counts || {
    "CRITICAL ALERT": 0, "HIGH WATCH": 0, "ADVISORY": 0, "NORMAL": 0
  };

  // Severity counts
  const criticalCount = isDistrictMode
    ? (ew.alerts ? ew.alerts.filter(a => a.severity === 'CRITICAL ALERT').length : 0)
    : statusCounts["CRITICAL ALERT"];
  const highWatchCount = isDistrictMode
    ? (ew.alerts ? ew.alerts.filter(a => a.severity === 'HIGH WATCH').length : 0)
    : statusCounts["HIGH WATCH"];
  const advisoryCount = isDistrictMode
    ? (ew.alerts ? ew.alerts.filter(a => a.severity === 'ADVISORY').length : 0)
    : statusCounts["ADVISORY"];
  const normalCount = isDistrictMode
    ? (ew.status && ew.status.includes('NORMAL') ? 1 : 0)
    : statusCounts["NORMAL"];

  main.innerHTML = `
    <!-- Page Header with District & Date Controls -->
    <div class="page-header" style="flex-wrap:wrap; gap:16px">
      <div>
        <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
          STATE DISASTER EARLY WARNING FRAMEWORK • 31 KARNATAKA DISTRICTS
        </div>
        <h1 class="page-title" style="margin-top:2px">
          ${isDistrictMode ? `Early Warning Bulletin: ${escapeHtml(d.district)}` : 'State Meteorological Early Warning Centre'}
        </h1>
        <p class="page-description">
          ${isDistrictMode
            ? `Localized compound hazard monitoring, downscaled thermal anomalies, precipitation readiness, and taluk adaptation protocols.`
            : `Automated compound climate hazard detection across Karnataka. Synthesizes thermal extremes, precipitation flash waterlogging, moisture deficits, and NOAA ONI teleconnections.`
          }
        </p>
      </div>

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <!-- District Dropdown -->
        <select id="alertDistrictSelector" class="form-control" style="width:200px" onchange="onDistrictChange(this.value)">
          <option value="Statewide" ${currentSelectedDistrict === 'Statewide' ? 'selected' : ''}>📍 Statewide Overview (31 Districts)</option>
          ${KARNATAKA_31_DISTRICTS.map(dist => `
            <option value="${dist}" ${currentSelectedDistrict === dist ? 'selected' : ''}>${dist}</option>
          `).join("")}
        </select>

        <!-- Date Selector -->
        <input type="date" id="alertDateSelector" value="${d.date}" min="1981-01-31" max="2024-12-30"
               class="form-control" style="width:150px; font-family:'JetBrains Mono', monospace"
               onchange="onDateChange(this.value)">

        <!-- Export CSV Button -->
        <button class="btn btn-secondary" onclick="exportAlertsCSV()" title="Export CSV for audit & reporting">
          📥 Export CSV
        </button>

        ${isDistrictMode ? `
          <button class="btn btn-primary" onclick="onDistrictChange('Statewide')" style="font-size:12px">
            ← Statewide Overview
          </button>
        ` : ''}
      </div>
    </div>

    <!-- 4-Tier Warning Status Banners -->
    <section class="early-warning-banner-grid" style="margin-bottom:20px">
      <div class="warning-status-tile critical ${activeSeverityFilter === 'CRITICAL ALERT' ? 'active-tile' : (ew.status && ew.status.includes('CRITICAL') ? 'active-tile' : '')}"
           style="cursor:pointer" onclick="toggleSeverityFilter('CRITICAL ALERT')">
        <div class="warning-tile-icon">🚨</div>
        <div class="warning-tile-text">
          <span class="warning-tier-name">Critical Alert</span>
          <span class="warning-tier-count">${criticalCount} ${isDistrictMode ? 'Active Hazards' : 'Districts'}</span>
          <span class="warning-tier-desc">> P90 Extreme Heat / Flood</span>
        </div>
      </div>

      <div class="warning-status-tile warning ${activeSeverityFilter === 'HIGH WATCH' ? 'active-tile' : (ew.status && (ew.status.includes('HIGH') || ew.status.includes('WARNING')) ? 'active-tile' : '')}"
           style="cursor:pointer" onclick="toggleSeverityFilter('HIGH WATCH')">
        <div class="warning-tile-icon">⚠️</div>
        <div class="warning-tile-text">
          <span class="warning-tier-name">High Watch</span>
          <span class="warning-tier-count">${highWatchCount} ${isDistrictMode ? 'Active Hazards' : 'Districts'}</span>
          <span class="warning-tier-desc">P75–P90 Elevated Hazards</span>
        </div>
      </div>

      <div class="warning-status-tile advisory ${activeSeverityFilter === 'ADVISORY' ? 'active-tile' : (ew.status && ew.status.includes('ADVISORY') ? 'active-tile' : '')}"
           style="cursor:pointer" onclick="toggleSeverityFilter('ADVISORY')">
        <div class="warning-tile-icon">ℹ️</div>
        <div class="warning-tile-text">
          <span class="warning-tier-name">Advisory</span>
          <span class="warning-tier-count">${advisoryCount} ${isDistrictMode ? 'Active Hazards' : 'Districts'}</span>
          <span class="warning-tier-desc">ENSO / Moderate Deficit</span>
        </div>
      </div>

      <div class="warning-status-tile normal ${activeSeverityFilter === 'NORMAL' ? 'active-tile' : (ew.status && ew.status.includes('NORMAL') ? 'active-tile' : '')}"
           style="cursor:pointer" onclick="toggleSeverityFilter('NORMAL')">
        <div class="warning-tile-icon">✅</div>
        <div class="warning-tile-text">
          <span class="warning-tier-name">Normal Baseline</span>
          <span class="warning-tier-count">${normalCount} ${isDistrictMode ? 'Tier' : 'Districts'}</span>
          <span class="warning-tier-desc">Seasonal Normals</span>
        </div>
      </div>
    </section>

    <!-- Operational View Tabs -->
    <div style="display:flex; gap:8px; border-bottom:1px solid var(--border-subtle); margin-bottom:18px; flex-wrap:wrap">
      <button class="tab-btn ${activeTab === 'bulletins' ? 'active' : ''}" onclick="switchAlertTab('bulletins')">
        📋 Active Warnings Bulletin
      </button>
      <button class="tab-btn ${activeTab === 'map' ? 'active' : ''}" onclick="switchAlertTab('map')">
        🗺️ Karnataka District Status Map
      </button>
      <button class="tab-btn ${activeTab === 'matrix' ? 'active' : ''}" onclick="switchAlertTab('matrix')">
        🎯 4x4 Compound Risk Matrix
      </button>
      <button class="tab-btn ${activeTab === 'history' ? 'active' : ''}" onclick="switchAlertTab('history')">
        📜 Alert Audit Log & History
      </button>
    </div>

    <!-- Tab Content Containers -->
    <div id="alertTabContent"></div>
  `;

  renderActiveTab();
}

function renderActiveTab() {
  const container = document.getElementById("alertTabContent");
  if (!container) return;

  if (activeTab === "bulletins") {
    renderBulletinsTab(container);
  } else if (activeTab === "map") {
    renderMapTab(container);
  } else if (activeTab === "matrix") {
    renderMatrixTab(container);
  } else if (activeTab === "history") {
    renderHistoryTab(container);
  }
}

function switchAlertTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  const found = Array.from(document.querySelectorAll(".tab-btn")).find(b => b.textContent.includes(
    tabName === 'bulletins' ? 'Active Warnings' : (tabName === 'map' ? 'District Status Map' : (tabName === 'matrix' ? '4x4' : 'Audit Log'))
  ));
  if (found) found.classList.add("active");
  renderActiveTab();
}

/* ==========================================================================
   TAB 1: Active Bulletins Tab
   ========================================================================== */
function renderBulletinsTab(container) {
  const d = currentAlertData;
  const ew = d.early_warnings || {};
  const summary = d.summary || {};
  const isDistrictMode = d.district && d.district !== "Statewide";
  const prof = d.profile || {};

  let alerts = ew.alerts || [];
  if (activeSeverityFilter) {
    alerts = alerts.filter(a => a.severity === activeSeverityFilter);
  }
  if (activeMatrixFilter) {
    alerts = alerts.filter(a => a.matrix_cell === activeMatrixFilter);
  }

  const urlParams = new URLSearchParams(window.location.search);
  const targetAlertId = urlParams.get("id") || urlParams.get("alert_id");
  let matchedAlert = null;
  if (targetAlertId) {
    matchedAlert = alerts.find(a =>
      String(a.alert_id || "").toLowerCase() === String(targetAlertId).toLowerCase() ||
      String(a.id || "").toLowerCase() === String(targetAlertId).toLowerCase()
    );
  }

  container.innerHTML = `
    <div class="grid-sidebar-layout">
      <!-- Left Column: Active Compound Hazard Bulletins -->
      <div style="display:flex; flex-direction:column; gap:16px">
        <div class="card" style="border-left:5px solid ${ew.color || '#38bdf8'}">
          <div class="card-header">
            <div>
              <div style="font-size:11px; font-weight:700; color:${ew.color}; letter-spacing:1px; text-transform:uppercase">
                ACTIVE DISPATCH STATUS • ${d.date} • ${d.district || 'Statewide'}
              </div>
              <h2 style="margin:4px 0 0 0; font-size:22px; color:#fff">
                ${ew.icon || '⚠️'} ${ew.status || 'NORMAL BASELINE'}
              </h2>
            </div>
            <div style="display:flex; gap:8px; align-items:center">
              ${activeSeverityFilter ? `
                <button class="btn btn-secondary" style="font-size:11px; padding:4px 8px" onclick="clearFilters()">
                  Clear Filter: ${activeSeverityFilter} ✕
                </button>
              ` : ''}
              ${activeMatrixFilter ? `
                <button class="btn btn-secondary" style="font-size:11px; padding:4px 8px" onclick="clearFilters()">
                  Matrix Cell: ${activeMatrixFilter} ✕
                </button>
              ` : ''}
              <span class="badge" style="background:${ew.color}22; color:${ew.color}; border:1px solid ${ew.color}66; font-size:12px">
                ${alerts.length} COMPOUND ADVISORIES
              </span>
            </div>
          </div>

          <!-- Meteorological Synopsis Bar -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; background:rgba(8,17,29,0.7); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); margin-bottom:16px">
            <div>
              <div style="font-size:11px; color:var(--text-muted)">TARGET TEMPERATURE</div>
              <div style="font-size:18px; font-weight:700; font-family:'JetBrains Mono', monospace; color:#38bdf8">
                ${summary.predicted_temperature_C !== null && summary.predicted_temperature_C !== undefined ? summary.predicted_temperature_C : "—"} °C
              </div>
              <div style="font-size:11px; margin-top:2px">${getRiskBadge(summary.temperature_level)}</div>
            </div>
            <div>
              <div style="font-size:11px; color:var(--text-muted)">TARGET PRECIPITATION</div>
              <div style="font-size:18px; font-weight:700; font-family:'JetBrains Mono', monospace; color:#00e5bc">
                ${summary.predicted_rainfall_mm !== null && summary.predicted_rainfall_mm !== undefined ? `${summary.predicted_rainfall_mm} mm` : "Data Unavailable"}
              </div>
              <div style="font-size:11px; margin-top:2px">${getRiskBadge(summary.rainfall_level)}</div>
            </div>
            <div>
              <div style="font-size:11px; color:var(--text-muted)">ENSO TELECONNECTION</div>
              <div style="font-size:18px; font-weight:700; font-family:'JetBrains Mono', monospace; color:#f59e0b">
                ONI ${summary.oni !== null && summary.oni !== undefined ? summary.oni : "0.0"}
              </div>
              <div style="font-size:11px; margin-top:2px">${ensoTag(summary.oni_phase)}</div>
            </div>
            <div>
              <div style="font-size:11px; color:var(--text-muted)">DROUGHT WATCH</div>
              <div style="font-size:18px; font-weight:700; font-family:'JetBrains Mono', monospace; color:#f97316">
                ${summary.drought_risk || "Low"}
              </div>
              <div style="font-size:11px; margin-top:2px">${getRiskBadge(summary.drought_risk)}</div>
            </div>
          </div>

          ${isDistrictMode ? `
            <!-- District Geographic & Sensor Provenance Bar -->
            <div style="background:rgba(0,240,255,0.04); border:1px solid rgba(0,240,255,0.2); padding:10px 14px; border-radius:var(--radius-sm); margin-bottom:16px; font-size:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px">
              <div>
                <strong style="color:var(--cyan)">District Profile:</strong> ${escapeHtml(prof.hq || d.district)} • ${escapeHtml(prof.zone || '')} • Elevation: ${prof.elevation_m || '—'}m
              </div>
              <div>
                <span class="badge ${prof.is_gauge_primary ? 'badge-cyan' : 'badge-warning'}">
                  ${prof.is_gauge_primary ? 'IMD Manual Raingauge Monitored' : 'Raingauge Unmonitored (Regional Proxy)'}
                </span>
              </div>
            </div>
          ` : ''}

          ${targetAlertId ? (
            matchedAlert ? `
              <div class="card" style="border: 2px solid var(--cyan); background: rgba(0, 240, 255, 0.08); padding: 14px 18px; margin-bottom: 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px">
                <div>
                  <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">DIRECT DISPATCH NOTIFICATION TARGET</div>
                  <div style="font-size:15px; font-weight:700; color:#fff; margin-top:2px">Viewing Broadcast Warning: ${escapeHtml(matchedAlert.title || '')} (${escapeHtml(targetAlertId)})</div>
                </div>
                <a href="/alerts" class="btn btn-secondary" style="font-size:11px; padding:4px 10px">View All Bulletins</a>
              </div>
            ` : `
              <div class="card" style="border: 1px solid rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.08); padding: 14px 18px; margin-bottom: 16px; display:flex; align-items:center; gap:14px">
                <span style="font-size:26px">ℹ️</span>
                <div>
                  <div style="font-weight:700; color:#f59e0b; font-size:14px">Emergency Warning Concluded or Archived</div>
                  <div style="font-size:12px; color:var(--text-secondary); margin-top:2px">
                    Emergency Warning <code>${escapeHtml(targetAlertId)}</code> has concluded its active lifecycle or been resolved by the state command centre. Current active state meteorological bulletins are displayed below.
                  </div>
                </div>
              </div>
            `
          ) : ''}

          <!-- Individual Hazard Advisories List with Full Structured Metadata -->
          <div style="display:flex; flex-direction:column; gap:14px">
            ${alerts.length === 0 ? `
              <div style="text-align:center; padding:30px; color:var(--text-muted)">
                No active hazard bulletins match the selected filter.
              </div>
            ` : alerts.map(a => {
              const isTarget = targetAlertId && (
                String(a.alert_id || "").toLowerCase() === String(targetAlertId).toLowerCase() ||
                String(a.id || "").toLowerCase() === String(targetAlertId).toLowerCase()
              );
              return `
              <div ${isTarget ? 'id="target-alert-card"' : ''} style="background:rgba(8,17,29,0.85); border:1px solid ${isTarget ? 'var(--cyan)' : (a.badge_color + '44')}; ${isTarget ? 'box-shadow: 0 0 16px rgba(0,240,255,0.35);' : ''} border-radius:var(--radius-sm); padding:16px; position:relative; overflow:hidden">
                <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:${isTarget ? 'var(--cyan)' : a.badge_color}"></div>
                
                <div style="display:flex; justify-content:space-between; align-items:start; flex-wrap:wrap; gap:8px; margin-bottom:8px">
                  <div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
                      <strong style="color:#fff; font-size:16px">${escapeHtml(a.title)}</strong>
                      <span class="badge" style="background:${a.badge_color}22; color:${a.badge_color}; border:1px solid ${a.badge_color}55">
                        ${escapeHtml(a.category || a.hazard_category)}
                      </span>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono', monospace; margin-top:2px">
                      ID: ${escapeHtml(a.alert_id || 'ALT-KA')} • District: ${escapeHtml(a.district || d.district)}
                    </div>
                  </div>

                  <div style="display:flex; gap:6px; align-items:center">
                    <span class="badge" style="background:rgba(255,255,255,0.06); font-family:'JetBrains Mono', monospace">
                      Likelihood: ${a.likelihood || 'L2'}
                    </span>
                    <span class="badge" style="background:rgba(255,255,255,0.06); font-family:'JetBrains Mono', monospace">
                      Impact: ${a.impact || 'I2'}
                    </span>
                    <span class="badge badge-${(a.severity || 'ADVISORY').toLowerCase().replace(' ', '-')}">
                      ${a.severity}
                    </span>
                  </div>
                </div>

                <!-- Scientific Value vs Threshold Badge -->
                <div style="display:flex; gap:12px; margin-bottom:10px; font-size:12px; background:rgba(0,0,0,0.3); padding:8px 12px; border-radius:var(--radius-sm); flex-wrap:wrap">
                  <div>
                    <span style="color:var(--text-muted)">Observed/Predicted:</span>
                    <strong style="color:#fff; margin-left:4px">${escapeHtml(a.observed_or_predicted_value || '—')}</strong>
                  </div>
                  <div>
                    <span style="color:var(--text-muted)">Climatological Threshold:</span>
                    <strong style="color:var(--cyan); margin-left:4px">${escapeHtml(a.threshold_value || 'Historical Envelope')}</strong>
                  </div>
                  <div style="color:var(--text-muted)">
                    Source: <span style="color:#fff">${escapeHtml(a.threshold_source || '44-Yr Historical Climatology')}</span>
                  </div>
                </div>

                <p style="font-size:13px; color:var(--text-dim); margin:0 0 12px 0; line-height:1.5">
                  ${escapeHtml(a.rationale)}
                </p>

                <!-- Operational Action Protocols -->
                <div style="background:rgba(0,0,0,0.25); padding:10px 14px; border-radius:var(--radius-sm); margin-bottom:10px">
                  <div style="font-size:11px; font-weight:700; color:var(--cyan); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px">
                    OPERATIONAL PROTOCOL CHECKLIST
                  </div>
                  <ul style="margin:0; padding-left:18px; font-size:12px; color:var(--text-main); display:flex; flex-direction:column; gap:5px">
                    ${(a.actions || []).map(act => `<li>${escapeHtml(act)}</li>`).join("")}
                  </ul>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--text-muted); flex-wrap:wrap; gap:8px">
                  <span>Stakeholders: <b>${(a.stakeholders || []).join(", ") || 'District Disaster Management'}</b></span>
                  <span style="font-family:'JetBrains Mono', monospace">Attribution: ${escapeHtml(a.data_source || 'Statewide ML Pipeline')}</span>
                </div>
              </div>
            `; }).join("")}
          </div>
        </div>
      </div>

      <!-- Right Column: Dynamic 4x4 Risk Matrix & Dispatch Hotlines -->
      <div style="display:flex; flex-direction:column; gap:16px">
        <!-- 4x4 Risk Matrix Widget -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Compound Hazard Risk Matrix</h3>
            <span class="badge badge-cyan">DYNAMIC 4x4 GRID</span>
          </div>
          <p style="font-size:11px; color:var(--text-muted); margin-bottom:12px">
            Maps atmospheric breach likelihood ($L1$–$L4$) against municipal impact ($I1$–$I4$). Click any cell to filter advisories.
          </p>

          ${renderDynamicRiskMatrixHTML(d.risk_matrix ? d.risk_matrix.cell_counts : (ew.risk_matrix ? ew.risk_matrix.cell_counts : {}))}

          <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:10px; color:var(--text-muted); font-family:'JetBrains Mono', monospace">
            <span>← Low Impact (I1)</span>
            <span>Extreme Impact (I4) →</span>
          </div>
        </div>

        <!-- Inter-Agency Dispatch Hotlines -->
        <div class="card">
          <h3 class="card-title">Inter-Agency Dispatch Contacts</h3>
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px; font-size:12px">
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06)">
              <span>KSNDMC Emergency Operations</span>
              <span style="font-family:'JetBrains Mono', monospace; color:var(--cyan)">080-22340676</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06)">
              <span>BBMP Stormwater Control</span>
              <span style="font-family:'JetBrains Mono', monospace; color:var(--cyan)">1533</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06)">
              <span>Health Emergency & ORS</span>
              <span style="font-family:'JetBrains Mono', monospace; color:var(--cyan)">108 / 104</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0">
              <span>IMD Bengaluru Weather Line</span>
              <span style="font-family:'JetBrains Mono', monospace; color:var(--cyan)">080-22211997</span>
            </div>
          </div>
        </div>

        <!-- Model Accuracy & Scientific Uncertainty Disclosure -->
        <div class="card" style="font-size:11px; line-height:1.6; border:1px solid var(--border-subtle)">
          <div style="font-weight:700; color:var(--cyan); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px">
            SCIENTIFIC CONFIDENCE & MODEL LIMITATIONS
          </div>
          <div>• <b>Thermal Inference:</b> Scaled Linear Regression (R² ≈ 0.94, MAE ≈ 0.73 °C). High deterministic correlation with seasonal trajectories.</div>
          <div>• <b>Precipitation Inference:</b> Gradient Boosting (R² ≈ 0.23, MAE ≈ 4.54 mm). Precipitation is convective and stochastic; outputs represent probabilistic directional risk bands, NOT deterministic localized flash-flood forecasts.</div>
          <div>• <b>District Downscaling:</b> Statewide ML baseline adjusted via physical elevation lapse rates (-1.2 °C to +1.8 °C) and orographic factors; not 31 independent local models.</div>
          <div>• <b>Statutory Forecasts:</b> Automated early warnings do not replace official statutory bulletins from IMD or KSNDMC.</div>
        </div>

        <!-- Scientific Disclaimer -->
        <div class="scientific-disclaimer-box" style="margin-top:0">
          <strong>Operational Note:</strong> Historical dataset observation date: <b>2024-12-30</b>. Live AWS sensor streaming is unconfigured; system operates in verified historical reanalysis mode.
        </div>
      </div>
    </div>
  `;

  if (matchedAlert) {
    setTimeout(() => {
      const el = document.getElementById("target-alert-card");
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }
}

/* ==========================================================================
   TAB 2: Karnataka District Status GIS Map Tab
   ========================================================================== */
function renderMapTab(container) {
  const d = currentAlertData;
  const summaries = d.district_summaries || currentDistrictsList || [];

  container.innerHTML = `
    <div class="card" style="margin-bottom:16px; padding:18px">
      <div class="card-header" style="margin-bottom:12px">
        <div>
          <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
            GEOSPATIAL MULTI-HAZARD EARLY WARNING OVERLAY
          </div>
          <h2 class="card-title" style="margin-top:2px">Karnataka 31-District Active Alert Status Map</h2>
        </div>
        <div style="display:flex; gap:8px; align-items:center">
          <span class="badge" style="background:#dc262622; color:#dc2626; border:1px solid #dc262666">🚨 Critical</span>
          <span class="badge" style="background:#ea580c22; color:#ea580c; border:1px solid #ea580c66">⚠️ High Watch</span>
          <span class="badge" style="background:#ca8a0422; color:#ca8a04; border:1px solid #ca8a0466">ℹ️ Advisory</span>
          <span class="badge" style="background:#16a34a22; color:#16a34a; border:1px solid #16a34a66">✅ Normal</span>
        </div>
      </div>

      <div class="gis-map-frame" style="height:480px; position:relative">
        <div id="alertGisMapCanvas" style="height:100%; width:100%; border-radius:var(--radius-sm)"></div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono', monospace">
        <span>31 DISTRICT BOUNDARIES • CARTO-DB DARK MATTER TILE LAYER</span>
        <span>CLICK ANY DISTRICT POLYGON TO VIEW ITS EARLY WARNING DOSSIER</span>
      </div>
    </div>

    <!-- District Status Table -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">District Hazard Status Register</h3>
        <input type="text" placeholder="Search district..." class="form-control" style="width:220px; font-size:12px"
               oninput="filterDistrictStatusTable(this.value)">
      </div>
      <div style="overflow-x:auto">
        <table class="table" id="districtStatusTable" style="font-size:12px">
          <thead>
            <tr>
              <th>District</th>
              <th>Agro-Climatic Zone</th>
              <th>Alert Tier</th>
              <th>Pred Temp</th>
              <th>Pred Rain</th>
              <th>Primary Hazard Bulletin</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${summaries.map(s => `
              <tr class="dist-row" data-name="${s.district.toLowerCase()}">
                <td><strong>${escapeHtml(s.district)}</strong></td>
                <td style="color:var(--text-dim)">${escapeHtml(s.zone || '—')}</td>
                <td><span class="badge" style="background:${s.color}22; color:${s.color}; border:1px solid ${s.color}55">${s.status}</span></td>
                <td style="font-family:'JetBrains Mono', monospace">${s.predicted_temperature_c} °C</td>
                <td style="font-family:'JetBrains Mono', monospace">${s.predicted_rainfall_mm !== null ? `${s.predicted_rainfall_mm} mm` : '<span style="color:var(--text-muted)">Unmonitored</span>'}</td>
                <td style="color:var(--text-dim)">${escapeHtml(s.top_alert || 'Seasonal normal baseline')}</td>
                <td>
                  <button class="btn btn-secondary" style="font-size:11px; padding:3px 8px" onclick="onDistrictChange('${escapeHtml(s.district)}')">
                    Inspect 🔍
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  setTimeout(initAlertMap, 50);
}

function initAlertMap() {
  const container = document.getElementById("alertGisMapCanvas");
  if (!container || typeof L === "undefined") return;

  if (alertGisMap) {
    alertGisMap.remove();
    alertGisMap = null;
  }

  alertGisMap = L.map("alertGisMapCanvas", {
    center: [14.8, 75.8],
    zoom: 7,
    minZoom: 6,
    maxZoom: 11,
  });

  const basemapSetup = (typeof getStandardBasemapLayers === "function") ? getStandardBasemapLayers() : null;
  if (basemapSetup) {
    basemapSetup.defaultLayer.addTo(alertGisMap);
    L.control.layers(basemapSetup.baseMaps, null, { position: "topright" }).addTo(alertGisMap);
  } else {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(alertGisMap);
  }

  const summaries = currentAlertData ? (currentAlertData.district_summaries || currentDistrictsList || []) : [];

  fetch("/static/data/karnataka_districts.geojson")
    .then(res => res.json())
    .then(geoJson => {
      alertGeoJsonLayer = L.geoJSON(geoJson, {
        style: feature => {
          const name = feature.properties.district;
          const match = summaries.find(s => s.district.toLowerCase() === name.toLowerCase());
          const color = match ? match.color : "#16a34a";
          return {
            color: "rgba(56, 189, 248, 0.4)",
            weight: 1.2,
            fillColor: color,
            fillOpacity: 0.42,
          };
        },
        onEachFeature: (feature, layer) => {
          const name = feature.properties.district;
          const match = summaries.find(s => s.district.toLowerCase() === name.toLowerCase());

          layer.bindTooltip(`
            <div style="font-weight:700; color:#fff">${name}</div>
            <div style="font-size:11px; color:#94a3b8">${match ? match.zone : ''}</div>
            <div style="font-size:12px; font-weight:700; color:${match ? match.color : '#16a34a'}">
              ${match ? match.status : 'NORMAL'}
            </div>
            <div style="font-size:11px; color:#cbd5e1">
              Temp: ${match ? match.predicted_temperature_c : '—'} °C | Rain: ${match && match.predicted_rainfall_mm !== null ? `${match.predicted_rainfall_mm} mm` : 'Unmonitored'}
            </div>
          `, { sticky: true });

          layer.on("click", () => {
            onDistrictChange(name);
          });

          layer.on("mouseover", () => {
            layer.setStyle({ weight: 2.5, color: "#00f0ff", fillOpacity: 0.65 });
          });

          layer.on("mouseout", () => {
            alertGeoJsonLayer.resetStyle(layer);
          });
        },
      }).addTo(alertGisMap);
    })
    .catch(err => console.warn("Notice: GeoJSON load:", err));
}

function filterDistrictStatusTable(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll("#districtStatusTable .dist-row").forEach(row => {
    const name = row.getAttribute("data-name") || "";
    row.style.display = name.includes(q) ? "" : "none";
  });
}

/* ==========================================================================
   TAB 3: Dynamic 4x4 Risk Matrix Tab
   ========================================================================== */
function renderMatrixTab(container) {
  const d = currentAlertData;
  const matrixData = d.risk_matrix || {};
  const counts = matrixData.cell_counts || {};
  const distMap = matrixData.cell_districts || {};

  container.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <div>
          <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
            OPERATIONAL MULTI-HAZARD RISK MATRIX
          </div>
          <h2 class="card-title" style="margin-top:2px">Dynamic 4x4 Atmospheric Likelihood vs Municipal Impact Grid</h2>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="clearFilters()">Reset Matrix Filter</button>
        </div>
      </div>
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:16px">
        Each cell categorizes atmospheric threshold breach likelihood ($L1$ to $L4$) against socio-economic municipal impact ($I1$ to $I4$).
        Numbers inside cells represent active district hazard advisories. Click a cell to inspect affected districts and response protocols.
      </p>

      <div style="max-width:560px; margin:0 auto">
        ${renderDynamicRiskMatrixHTML(counts, true)}
      </div>

      <div style="display:flex; justify-content:space-between; max-width:560px; margin:8px auto 20px auto; font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono', monospace">
        <span>← Low Impact (I1)</span>
        <span>Catastrophic Impact (I4) →</span>
      </div>

      <!-- Matrix Breakdown Table -->
      <div id="matrixBreakdownSection" style="margin-top:24px; border-top:1px solid var(--border-subtle); padding-top:16px">
        <h3 style="font-size:15px; color:#fff; margin-bottom:10px">
          ${activeMatrixFilter ? `Active Bulletins in Cell ${activeMatrixFilter}` : 'Matrix Distribution Summary'}
        </h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px">
          ${["L4-I4", "L4-I3", "L3-I3", "L3-I4", "L3-I2", "L2-I2", "L1-I1"].map(cell => {
            const count = counts[cell] || 0;
            const dists = distMap[cell] || [];
            return `
              <div style="background:rgba(8,17,29,0.7); border:1px solid ${count > 0 ? 'var(--cyan)' : 'var(--border-subtle)'}; padding:12px; border-radius:var(--radius-sm)">
                <div style="display:flex; justify-content:space-between; align-items:center">
                  <strong style="color:#fff; font-family:'JetBrains Mono', monospace">${cell}</strong>
                  <span class="badge ${count > 0 ? 'badge-cyan' : ''}">${count} Hazards</span>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:6px">
                  ${dists.length > 0 ? `Districts: ${dists.slice(0, 4).join(", ")}${dists.length > 4 ? ` +${dists.length - 4} more` : ''}` : 'No active alerts'}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderDynamicRiskMatrixHTML(cellCounts, isLarge = false) {
  const sizeStyle = isLarge ? "height:70px; font-size:13px" : "height:48px; font-size:11px";

  // Grid rows: L4, L3, L2, L1; Columns: I1, I2, I3, I4
  const rows = [
    [
      { id: "L4-I1", label: "L4•I1", bg: "#ca8a04", op: 0.75 },
      { id: "L4-I2", label: "L4•I2", bg: "#ea580c", op: 0.85 },
      { id: "L4-I3", label: "L4•I3", bg: "#ef4444", op: 0.95 },
      { id: "L4-I4", label: "L4•I4", bg: "#b91c1c", op: 1.0, bold: true },
    ],
    [
      { id: "L3-I1", label: "L3•I1", bg: "#16a34a", op: 0.65 },
      { id: "L3-I2", label: "L3•I2", bg: "#ca8a04", op: 0.75 },
      { id: "L3-I3", label: "L3•I3", bg: "#ea580c", op: 0.85 },
      { id: "L3-I4", label: "L3•I4", bg: "#ef4444", op: 0.95 },
    ],
    [
      { id: "L2-I1", label: "L2•I1", bg: "#16a34a", op: 0.55 },
      { id: "L2-I2", label: "L2•I2", bg: "#16a34a", op: 0.65 },
      { id: "L2-I3", label: "L2•I3", bg: "#ca8a04", op: 0.75 },
      { id: "L2-I4", label: "L2•I4", bg: "#ea580c", op: 0.85 },
    ],
    [
      { id: "L1-I1", label: "L1•I1", bg: "#059669", op: 0.45 },
      { id: "L1-I2", label: "L1•I2", bg: "#16a34a", op: 0.55 },
      { id: "L1-I3", label: "L1•I3", bg: "#16a34a", op: 0.65 },
      { id: "L1-I4", label: "L1•I4", bg: "#ca8a04", op: 0.75 },
    ],
  ];

  return `
    <div class="risk-matrix-table" style="gap:6px">
      ${rows.flatMap(r => r.map(c => {
        const count = cellCounts ? (cellCounts[c.id] || 0) : 0;
        const isSelected = activeMatrixFilter === c.id;
        const border = isSelected ? "3px solid #00f0ff" : (count > 0 ? "1px solid rgba(255,255,255,0.4)" : "1px solid transparent");
        const shadow = count > 0 ? "box-shadow: 0 0 10px rgba(0,240,255,0.3)" : "";
        return `
          <div class="matrix-cell" style="background:${c.bg}; opacity:${c.op}; ${sizeStyle}; ${border}; ${shadow}"
               onclick="toggleMatrixCellFilter('${c.id}')"
               title="${c.id}: ${count} active alerts">
            <div style="display:flex; flex-direction:column; align-items:center; line-height:1.1">
              <span>${c.label}</span>
              ${count > 0 ? `<span style="font-size:10px; font-weight:700; background:rgba(0,0,0,0.5); padding:1px 5px; border-radius:10px; margin-top:2px">(${count})</span>` : ''}
            </div>
          </div>
        `;
      })).join("")}
    </div>
  `;
}

function toggleMatrixCellFilter(cellId) {
  if (activeMatrixFilter === cellId) {
    activeMatrixFilter = null;
  } else {
    activeMatrixFilter = cellId;
    activeTab = "bulletins";
  }
  renderAlertsUI(document.querySelector("main.content"));
}

function toggleSeverityFilter(tier) {
  if (activeSeverityFilter === tier) {
    activeSeverityFilter = null;
  } else {
    activeSeverityFilter = tier;
    activeTab = "bulletins";
  }
  renderAlertsUI(document.querySelector("main.content"));
}

function clearFilters() {
  activeMatrixFilter = null;
  activeSeverityFilter = null;
  renderAlertsUI(document.querySelector("main.content"));
}

/* ==========================================================================
   TAB 4: Alert Audit History & CSV Export Tab
   ========================================================================== */
async function renderHistoryTab(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header" style="flex-wrap:wrap; gap:12px">
        <div>
          <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
            PERSISTENT EARLY WARNING AUDIT LOG
          </div>
          <h2 class="card-title" style="margin-top:2px">Historical Hazard Records (MySQL / SQLite Dual-Layer Persistence)</h2>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
          <button class="btn btn-primary" onclick="exportAlertsCSV()">
            📥 Export Historical CSV
          </button>
        </div>
      </div>

      <div style="display:flex; gap:10px; align-items:center; margin-bottom:14px; flex-wrap:wrap">
        <select id="histDistFilter" class="form-control" style="width:160px" onchange="filterHistoryTable()">
          <option value="all">All Districts</option>
          ${KARNATAKA_31_DISTRICTS.map(d => `<option value="${d}">${d}</option>`).join("")}
        </select>
        <select id="histSevFilter" class="form-control" style="width:160px" onchange="filterHistoryTable()">
          <option value="all">All Severities</option>
          <option value="CRITICAL ALERT">Critical Alert</option>
          <option value="HIGH WATCH">High Watch</option>
          <option value="ADVISORY">Advisory</option>
          <option value="NORMAL">Normal</option>
        </select>
      </div>

      <div id="historyTableContainer">
        <p class="muted">Loading historical alert audit records from database...</p>
      </div>
    </div>
  `;

  try {
    const histData = await api("/api/alerts/history?limit=250");
    const records = histData.records || [];
    window._cachedHistoryRecords = records;
    displayHistoryTable(records);
  } catch (err) {
    document.getElementById("historyTableContainer").innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

function displayHistoryTable(records) {
  const container = document.getElementById("historyTableContainer");
  if (!container) return;

  if (records.length === 0) {
    container.innerHTML = `<p class="muted" style="padding:20px 0; text-align:center">No alert history records found for the given criteria.</p>`;
    return;
  }

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="table" style="font-size:12px">
        <thead>
          <tr>
            <th>Date</th>
            <th>District</th>
            <th>Hazard Category</th>
            <th>Severity</th>
            <th>Title</th>
            <th>Value vs Threshold</th>
            <th>Likelihood / Impact</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${records.map(r => `
            <tr>
              <td style="font-family:'JetBrains Mono', monospace">${escapeHtml(r.Date)}</td>
              <td><strong>${escapeHtml(r.District || 'Statewide')}</strong></td>
              <td><span class="badge badge-cyan">${escapeHtml(r.Hazard_Category)}</span></td>
              <td><span class="badge badge-${(r.Severity || 'ADVISORY').toLowerCase().replace(' ', '-')}">${escapeHtml(r.Severity)}</span></td>
              <td>${escapeHtml(r.Title)}</td>
              <td style="font-family:'JetBrains Mono', monospace; font-size:11px">
                ${escapeHtml(r.Observed_Or_Predicted_Value || '—')} / ${escapeHtml(r.Threshold_Value || '—')}
              </td>
              <td style="font-family:'JetBrains Mono', monospace">${escapeHtml(r.Likelihood || '—')} • ${escapeHtml(r.Impact || '—')}</td>
              <td><span class="badge">${escapeHtml(r.Resolution_Status || 'ACTIVE')}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function filterHistoryTable() {
  const dist = document.getElementById("histDistFilter")?.value || "all";
  const sev = document.getElementById("histSevFilter")?.value || "all";
  let recs = window._cachedHistoryRecords || [];

  if (dist !== "all") {
    recs = recs.filter(r => (r.District || "").toLowerCase() === dist.toLowerCase());
  }
  if (sev !== "all") {
    recs = recs.filter(r => (r.Severity || "").toUpperCase() === sev.toUpperCase());
  }

  displayHistoryTable(recs);
}

/* ==========================================================================
   Navigation Handlers & CSV Export
   ========================================================================== */
function onDistrictChange(districtName) {
  currentSelectedDistrict = districtName;
  activeMatrixFilter = null;
  activeSeverityFilter = null;
  const newUrl = `/alerts?date=${currentSelectedDate}&district=${encodeURIComponent(districtName)}`;
  window.history.pushState(null, "", newUrl);
  renderAlerts();
}

function onDateChange(newDate) {
  currentSelectedDate = newDate;
  activeMatrixFilter = null;
  activeSeverityFilter = null;
  const newUrl = `/alerts?date=${newDate}&district=${encodeURIComponent(currentSelectedDistrict)}`;
  window.history.pushState(null, "", newUrl);
  renderAlerts();
}

function exportAlertsCSV() {
  const dist = currentSelectedDistrict !== "Statewide" ? `&district=${encodeURIComponent(currentSelectedDistrict)}` : "";
  const date = currentSelectedDate ? `&start_date=${encodeURIComponent(currentSelectedDate)}` : "";
  window.location.href = `/api/alerts/export?download=1${dist}${date}`;
}

document.addEventListener("DOMContentLoaded", renderAlerts);
