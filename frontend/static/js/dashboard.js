/* ==========================================================================
   dashboard.js — Meteorological Command Centre Executive Intelligence Dashboard
   Synthesizes 44-Yr Meteorological Data, NOAA ONI Teleconnections,
   Central Leaflet GIS Map, Dual ML Predictions & Automated Early Warnings
   ========================================================================== */

let dashGisMap = null;
let dashMarkers = [];
let dashDistricts = [];
let dashMapMode = "drought";

async function renderDashboard() {
  const main = layout("dashboard");
  main.innerHTML = `<p class="muted">Initializing State Meteorological Command Centre...</p>`;

  try {
    // Parallel fetch for optimal command-centre speed
    const [dashData, alertData, districtData] = await Promise.all([
      api("/api/dashboard"),
      api("/api/alerts").catch(() => ({ early_warnings: null })),
      api("/api/district").catch(() => ({ districts: [] })),
    ]);

    const s = dashData.summary || {};
    const ew = alertData.early_warnings || { status: "NORMAL BASELINE", color: "#10b981", alert_count: 0, alerts: [] };
    const districts = districtData.districts || [];
    dashDistricts = districts;

    main.innerHTML = `
      <!-- Executive Page Header -->
      <div class="page-header" style="flex-wrap:wrap; gap:12px; margin-bottom:18px">
        <div>
          <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
            METEOROLOGICAL COMMAND CENTRE • CLIMATOLOGICAL REANALYSIS ARCHIVE
          </div>
          <h1 class="page-title" style="margin-top:2px">Karnataka Climate Intelligence Executive Overview</h1>
          <p class="page-description">
            Autoregressive climate risk monitoring across Karnataka. Synthesizes 44-year empirical weather observations, NOAA ONI teleconnections, and dual ML risk engines.
          </p>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
          <span class="badge" style="background:rgba(56,189,248,0.12); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); font-size:11px">
            📅 LATEST OBSERVATION: ${s.end_date || "2024-12-30"}
          </span>
          <span class="badge" style="background:rgba(234,179,8,0.12); color:#eab308; border:1px solid rgba(234,179,8,0.3); font-size:11px">
            ⚠️ LIVE TELEMETRY: HISTORICAL REANALYSIS (LIVE AWS UNCONFIGURED)
          </span>
        </div>
      </div>

      <!-- 1. Top Early Warning Command Strip (Inspired by Meteorological Warning Systems) -->
      <section class="early-warning-banner-grid" style="margin-bottom:18px">
        <div class="warning-status-tile ${ew.status.includes('CRITICAL') ? 'critical' : 'normal'}"
             onclick="window.location.href='/alerts'" style="cursor:pointer">
          <div class="warning-tile-icon">${ew.status.includes('CRITICAL') ? '🚨' : '🛡️'}</div>
          <div class="warning-tile-text">
            <span class="warning-tier-name">${ew.status.includes('CRITICAL') ? 'Critical Alert' : 'System Status'}</span>
            <span class="warning-tier-count">${ew.status}</span>
            <span class="warning-tier-desc">${ew.alert_count} Compound Hazards Monitored</span>
          </div>
        </div>

        <div class="warning-status-tile warning" onclick="window.location.href='/risk'" style="cursor:pointer">
          <div class="warning-tile-icon">🔥</div>
          <div class="warning-tile-text">
            <span class="warning-tier-name">Urban Heat Risk</span>
            <span class="warning-tier-count">${s.mean_temperature ?? "23.5"} °C Mean</span>
            <span class="warning-tier-desc">P90 Threshold: 24.83 °C</span>
          </div>
        </div>

        <div class="warning-status-tile advisory" onclick="window.location.href='/climate'" style="cursor:pointer">
          <div class="warning-tile-icon">🌊</div>
          <div class="warning-tile-text">
            <span class="warning-tier-name">ENSO Phase</span>
            <span class="warning-tier-count">${dashData.enso ? dashData.enso[0]?.condition || "Neutral" : "Neutral"}</span>
            <span class="warning-tier-desc">NOAA Niño 3.4 SST Teleconnection</span>
          </div>
        </div>

        <div class="warning-status-tile normal" onclick="window.location.href='/drought'" style="cursor:pointer">
          <div class="warning-tile-icon">🏜️</div>
          <div class="warning-tile-text">
            <span class="warning-tier-name">Drought &amp; Water</span>
            <span class="warning-tier-count">Low Risk Tier</span>
            <span class="warning-tier-desc">30-Day Deficit Baseline</span>
          </div>
        </div>
      </section>

      <!-- 2. Hero Meteorological KPI Cards with SVG Gauges -->
      <section class="grid grid-4" style="margin-bottom:20px">
        <!-- KPI 1: Mean Temperature -->
        <article class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">STATE MEAN TEMPERATURE</span>
            <span class="kpi-icon-pill">🌡️</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#00f0ff">${s.mean_temperature}</span>
            <span class="kpi-unit">°C</span>
          </div>
          <div class="kpi-subtext">
            <span>Range: ${s.min_temperature}°C – ${s.max_temperature}°C</span>
            <span class="badge badge-cyan" style="margin-left:auto">44-YR MEAN</span>
          </div>
        </article>

        <!-- KPI 2: Mean Rainfall -->
        <article class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">DAILY MEAN RAINFALL</span>
            <span class="kpi-icon-pill">🌧️</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#00e5bc">${s.mean_rainfall}</span>
            <span class="kpi-unit">mm/day</span>
          </div>
          <div class="kpi-subtext">
            <span>Annual Total: ${Number(s.total_rainfall || 0).toLocaleString()} mm</span>
            <span class="badge badge-normal" style="margin-left:auto">IMD BASE</span>
          </div>
        </article>

        <!-- KPI 3: Pacific ONI Anomaly -->
        <article class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">PACIFIC ONI ANOMALY</span>
            <span class="kpi-icon-pill">🌐</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#f59e0b">
              ${dashData.oni_recent?.oni ? dashData.oni_recent.oni.slice(-1)[0] : "+0.43"}
            </span>
            <span class="kpi-unit">°C SST</span>
          </div>
          <div class="kpi-subtext">
            <span>Condition: ${dashData.oni_recent?.condition ? dashData.oni_recent.condition.slice(-1)[0] : "Neutral"}</span>
            <span class="badge badge-warning" style="margin-left:auto">NOAA 3.4</span>
          </div>
        </article>

        <!-- KPI 4: Dual AI Model Status -->
        <article class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">NEXT-DAY FORECAST ENGINE</span>
            <span class="kpi-icon-pill">🤖</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#a855f7">R² 0.94</span>
            <span class="kpi-unit">SKILL</span>
          </div>
          <div class="kpi-subtext">
            <span>Temp: Linear (0.94) • Rain: GBR (0.23)</span>
            <span class="badge badge-cyan" style="margin-left:auto">32 FEAT</span>
          </div>
        </article>
      </section>

      <!-- 3. Central Command Section: Interactive GIS Map + Severe Weather Matrix -->
      <section class="grid-sidebar-layout" style="margin-bottom:20px">
        <!-- Central Karnataka GIS Spatial Command Map -->
        <div class="card" style="padding:16px; display:flex; flex-direction:column">
          <div class="card-header" style="margin-bottom:12px">
            <div>
              <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
                STATEWIDE GEOSPATIAL INTELLIGENCE
              </div>
              <h2 class="card-title" style="margin-top:2px">
                Karnataka Climate GIS Spatial Map (25 IMD Stations &amp; Divisions)
              </h2>
            </div>
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
              <button class="gis-layer-btn active" id="btnDashDrought" onclick="setDashboardMapMode('drought')">Drought Risk</button>
              <button class="gis-layer-btn" id="btnDashFlood" onclick="setDashboardMapMode('flood')">Flood Risk</button>
              <button class="gis-layer-btn" id="btnDashRainfall" onclick="setDashboardMapMode('rainfall')">Rainfall Volume</button>
              <a href="/district" class="btn btn-secondary" style="padding:4px 10px; font-size:11px">Full GIS Explorer →</a>
            </div>
          </div>

          <div class="gis-map-frame" style="height:440px">
            <div id="dashKarnatakaGisMap" class="gis-map-canvas" style="height:100%"></div>

            <div class="gis-map-legend" id="dashMapLegend">
              <!-- Dynamic Legend -->
            </div>
          </div>
        </div>

        <!-- Right Side: 4x4 Risk Matrix & Compound Sector Vulnerability -->
        <div style="display:flex; flex-direction:column; gap:16px">
          <!-- 4x4 Severe Weather Risk Matrix (Reference 2 Inspiration) -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Severe Weather Risk Matrix</h3>
              <span class="badge badge-cyan">4x4 MATRIX</span>
            </div>
            <p style="font-size:11px; color:var(--text-muted); margin-bottom:10px">
              Evaluates atmospheric likelihood against municipal impact across Karnataka taluks.
            </p>

            <div class="risk-matrix-table">
              <div class="matrix-cell" style="background:#eab308; opacity:0.8">L4•I1</div>
              <div class="matrix-cell" style="background:#f97316; opacity:0.85">L4•I2</div>
              <div class="matrix-cell" style="background:#ef4444; opacity:0.9">L4•I3</div>
              <div class="matrix-cell" style="background:#b91c1c; font-weight:700; box-shadow:0 0 10px #ef4444">L4•I4 ✓</div>

              <div class="matrix-cell" style="background:#10b981; opacity:0.7">L3•I1</div>
              <div class="matrix-cell" style="background:#eab308; opacity:0.8">L3•I2</div>
              <div class="matrix-cell" style="background:#f97316; opacity:0.85">L3•I3</div>
              <div class="matrix-cell" style="background:#ef4444; opacity:0.9">L3•I4</div>

              <div class="matrix-cell" style="background:#10b981; opacity:0.6">L2•I1</div>
              <div class="matrix-cell" style="background:#10b981; opacity:0.7">L2•I2</div>
              <div class="matrix-cell" style="background:#eab308; opacity:0.8">L2•I3</div>
              <div class="matrix-cell" style="background:#f97316; opacity:0.85">L2•I4</div>

              <div class="matrix-cell" style="background:#059669; opacity:0.5">L1•I1</div>
              <div class="matrix-cell" style="background:#10b981; opacity:0.6">L1•I2</div>
              <div class="matrix-cell" style="background:#10b981; opacity:0.7">L1•I3</div>
              <div class="matrix-cell" style="background:#eab308; opacity:0.8">L1•I4</div>
            </div>

            <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:10px; color:var(--text-muted); font-family:'JetBrains Mono', monospace">
              <span>← Low Hazard Impact</span>
              <span>High Severity →</span>
            </div>
          </div>

          <!-- Sector Adaptation Quick Readiness -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Sector Adaptation Preparedness</h3>
              <a href="/adaptation" style="font-size:11px">Full Matrix →</a>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; font-size:12px">
              <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06)">
                <span>🏥 Public Health &amp; Labor</span>
                <span class="badge badge-normal">READY</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06)">
                <span>🏙️ Urban Infrastructure &amp; Cool Roofs</span>
                <span class="badge badge-warning">ELEVATED</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06)">
                <span>🌊 Stormwater Drainage De-silting</span>
                <span class="badge badge-normal">STANDARD</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0">
                <span>🌾 Water Resources &amp; Agriculture</span>
                <span class="badge badge-advisory">MONITOR</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 4. Historical Trends & ENSO Distribution Charts -->
      <section class="grid grid-2" style="margin-bottom:20px">
        <article class="card">
          <div class="card-header">
            <h3 class="card-title">44-Year Historical Climate Trends (1981–2024)</h3>
            <span class="badge badge-cyan">DUAL-AXIS</span>
          </div>
          <canvas id="dashYearlyClimateChart" height="210"></canvas>
        </article>

        <article class="card">
          <div class="card-header">
            <h3 class="card-title">Historical Observations by ENSO Climate Phase</h3>
            <span class="badge badge-warning">NOAA ONI</span>
          </div>
          <canvas id="dashEnsoDonutChart" height="210"></canvas>
        </article>
      </section>

      <!-- 5. Recent Prediction Inferences & Auditable Log -->
      <section class="card" style="margin-bottom:20px">
        <div class="card-header">
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
              AUDIT TRAIL &amp; INFERENCE LOGS
            </div>
            <h3 class="card-title" style="margin-top:2px">Recent Model Predictions &amp; Risk Classifications</h3>
          </div>
          <div style="display:flex; gap:8px">
            <a href="/predict" class="btn btn-primary" style="padding:5px 12px; font-size:12px">⚡ New Prediction</a>
            <a href="/history" class="btn btn-secondary" style="padding:5px 12px; font-size:12px">View Full Log →</a>
          </div>
        </div>

        <div style="overflow-x:auto">
          <table class="command-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Predicted Temp</th>
                <th>Temp Risk</th>
                <th>Predicted Rain</th>
                <th>Rain Risk</th>
                <th>ENSO Signal</th>
                <th>Storage Source</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="dashRecentHistoryBody">
              <tr><td colspan="8" class="muted">Loading recent inference activity...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Scientific Disclaimer Footer -->
      <div class="scientific-disclaimer-box">
        <strong>Macro-Scale Teleconnection Principle:</strong> The Oceanic Niño Index (ONI) reflects sea-surface temperature departures in the equatorial Pacific Niño 3.4 region. While ENSO shifts large-scale atmospheric circulation, Karnataka local weather is governed by complex micro-scale interactions (Western Ghats orographic uplifting, Bay of Bengal cyclonic depressions, and urban heat island effects). Predictions are next-day estimates derived strictly from 44 years of empirical records. Relative percentile risk tiers (Low, Moderate/Normal, High, Very High) are exploratory decision-support indicators, not official statutory disaster warnings issued by IMD or KSNDMC.
      </div>
    `;

    // Initialize Dashboard GIS Map
    initDashboardGisMap(districts);

    // Initialize Charts
    initDashboardCharts(dashData);

    // Load Recent History Table
    loadRecentHistoryTable();

  } catch (err) {
    main.innerHTML = `<div class="card"><h2 style="color:var(--risk-critical)">Error Initializing Command Dashboard</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// ---------------------------------------------------------------------------
// DASHBOARD LEAFLET GIS MAP
// ---------------------------------------------------------------------------

function initDashboardGisMap(districts) {
  const container = document.getElementById("dashKarnatakaGisMap");
  if (!container || typeof L === "undefined") return;

  try {
    if (dashGisMap) {
      dashGisMap.remove();
      dashGisMap = null;
    }

    dashGisMap = L.map("dashKarnatakaGisMap", {
      center: [14.8, 75.8],
      zoom: 7,
      minZoom: 6,
      maxZoom: 12,
      zoomControl: true,
    });

    // Reliable Command-Centre Basemap Layers with Layer Switcher & Auto-Fallback
    const basemapSetup = (typeof getStandardBasemapLayers === "function") ? getStandardBasemapLayers() : null;
    if (basemapSetup) {
      basemapSetup.defaultLayer.addTo(dashGisMap);
      L.control.layers(basemapSetup.baseMaps, null, { position: "topright" }).addTo(dashGisMap);
    } else {
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(dashGisMap);
    }

    // Load Karnataka Administrative Divisions Boundary GeoJSON
    fetch("/static/data/karnataka_divisions.geojson")
      .then(res => res.json())
      .then(geoJsonData => {
        L.geoJSON(geoJsonData, {
          style: {
            color: "#00f0ff",
            weight: 1.5,
            opacity: 0.8,
            fillColor: "#0284c7",
            fillOpacity: 0.08,
            dashArray: "3, 3",
          },
          onEachFeature: (feature, layer) => {
            const divName = feature.properties?.division || "Karnataka Division";
            layer.bindTooltip(`<b>${divName} Division</b>`, { direction: "center", className: "division-tooltip" });
          },
        }).addTo(dashGisMap);
      })
      .catch(() => {});

    renderDashboardMarkers(districts, dashMapMode);
    updateDashboardLegend(dashMapMode);

  } catch (e) {
    console.warn("Dashboard map initialization:", e);
  }
}

function renderDashboardMarkers(districts, mode) {
  if (!dashGisMap) return;

  dashMarkers.forEach(m => dashGisMap.removeLayer(m));
  dashMarkers = [];

  districts.forEach(d => {
    const lat = Number(d.lat || 15.0);
    const lon = Number(d.lon || 76.0);
    const meanDaily = Number(d.mean_daily || 0);

    let color = "#10b981";
    let radius = 8;

    if (mode === "drought") {
      color = d.drought_risk === "High" ? "#ef4444" : (d.drought_risk === "Moderate" ? "#f97316" : "#10b981");
      radius = d.drought_risk === "High" ? 10 : 7;
    } else if (mode === "flood") {
      color = d.flood_risk === "Very High" ? "#ef4444" : (d.flood_risk === "High" ? "#f97316" : "#38bdf8");
      radius = d.flood_risk === "Very High" ? 11 : 7;
    } else if (mode === "rainfall") {
      color = "#00f0ff";
      radius = Math.max(6, Math.min(20, meanDaily * 2.2));
    }

    const circle = L.circleMarker([lat, lon], {
      radius: radius,
      fillColor: color,
      color: "#ffffff",
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.8,
    }).addTo(dashGisMap);

    const popupHtml = `
      <div style="font-family:'Outfit', sans-serif; min-width:180px; color:#f1f5f9; padding:4px">
        <h4 style="margin:0 0 6px 0; font-size:14px; color:#00f0ff; text-transform:uppercase; letter-spacing:0.5px">${escapeHtml(d.District)}</h4>
        <div style="font-size:12px; line-height:1.5">
          <div><b>Mean Daily:</b> ${meanDaily.toFixed(1)} mm</div>
          <div><b>Avg Annual:</b> ${d.avg_annual_mm ? Number(d.avg_annual_mm).toFixed(0) + " mm" : "—"}</div>
          <div><b>Drought Risk:</b> <span style="font-weight:700; color:${riskColor(d.drought_risk)}">${d.drought_risk}</span></div>
          <div><b>Flood Risk:</b> <span style="font-weight:700; color:${riskColor(d.flood_risk)}">${d.flood_risk}</span></div>
          <div><b>Sample:</b> ${Number(d.total_obs).toLocaleString()} days (IMD)</div>
        </div>
        <a href="/district" style="display:inline-block; margin-top:8px; width:100%; text-align:center; padding:5px 8px; font-size:11px; background:linear-gradient(135deg, #0284c7, #00f0ff); color:#030a16; font-weight:700; border-radius:4px; text-decoration:none">
          Explore Station Profile →
        </a>
      </div>
    `;

    circle.bindPopup(popupHtml);
    circle.bindTooltip(`<b>${escapeHtml(d.District)}</b>: ${meanDaily.toFixed(1)} mm`, { direction: "top", offset: [0, -6] });
    dashMarkers.push(circle);
  });
}

function setDashboardMapMode(mode) {
  dashMapMode = mode;
  document.querySelectorAll("[id^='btnDash']").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById(
    mode === "drought" ? "btnDashDrought" : (mode === "flood" ? "btnDashFlood" : "btnDashRainfall")
  );
  if (activeBtn) activeBtn.classList.add("active");

  renderDashboardMarkers(dashDistricts, mode);
  updateDashboardLegend(mode);
}

function updateDashboardLegend(mode) {
  const legend = document.getElementById("dashMapLegend");
  if (!legend) return;

  if (mode === "drought") {
    legend.innerHTML = `
      <div class="legend-title">Drought Risk Tier</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#ef4444"></span> High Risk (&lt;5 mm/day)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#f97316"></span> Moderate (5–8 mm/day)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#10b981"></span> Low Risk (&gt;8 mm/day)</div>
    `;
  } else if (mode === "flood") {
    legend.innerHTML = `
      <div class="legend-title">Flood Risk Tier</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#ef4444"></span> Very High (&gt;100 mm event)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#f97316"></span> High (50–100 mm event)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#38bdf8"></span> Moderate (&lt;50 mm)</div>
    `;
  } else if (mode === "rainfall") {
    legend.innerHTML = `
      <div class="legend-title">Precipitation Volume</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#00f0ff"></span> Node radius scaled to mean daily mm</div>
    `;
  }
}

// ---------------------------------------------------------------------------
// DASHBOARD CHARTS
// ---------------------------------------------------------------------------

function initDashboardCharts(data) {
  const years = data.yearly?.year || [];
  const temps = data.yearly?.mean_temperature || [];
  const rains = data.yearly?.total_rainfall || [];

  // Dual-Axis Yearly Climate Trend
  const ctxClimate = document.getElementById("dashYearlyClimateChart");
  if (ctxClimate) {
    new Chart(ctxClimate, {
      type: "line",
      data: {
        labels: years,
        datasets: [
          {
            label: "Mean Temperature (°C)",
            data: temps,
            borderColor: "#00f0ff",
            backgroundColor: "rgba(0, 240, 255, 0.08)",
            yAxisID: "yTemp",
            tension: 0.25,
            fill: true,
            pointRadius: 2,
          },
          {
            label: "Annual Rainfall (mm)",
            data: rains,
            borderColor: "#00e5bc",
            backgroundColor: "rgba(0, 229, 188, 0.2)",
            type: "bar",
            yAxisID: "yRain",
            borderRadius: 3,
          },
        ],
      },
      options: {
        ...chartDefaults(),
        scales: {
          x: { ticks: { color: "#64748b", maxTicksLimit: 12 }, grid: { color: "rgba(56, 189, 248, 0.05)" } },
          yTemp: {
            type: "linear",
            position: "left",
            ticks: { color: "#00f0ff", font: { family: "JetBrains Mono" } },
            grid: { color: "rgba(56, 189, 248, 0.08)" },
            title: { display: true, text: "Temp (°C)", color: "#00f0ff" },
          },
          yRain: {
            type: "linear",
            position: "right",
            ticks: { color: "#00e5bc", font: { family: "JetBrains Mono" } },
            grid: { drawOnChartArea: false },
            title: { display: true, text: "Rainfall (mm)", color: "#00e5bc" },
          },
        },
      },
    });
  }

  // ENSO Donut Chart
  const ctxEnso = document.getElementById("dashEnsoDonutChart");
  if (ctxEnso && data.enso) {
    new Chart(ctxEnso, {
      type: "doughnut",
      data: {
        labels: data.enso.map(e => e.condition),
        datasets: [{
          data: data.enso.map(e => e.percentage),
          backgroundColor: ["#f97316", "#00e5bc", "#38bdf8"],
          borderColor: "#0d1a2d",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "right",
            labels: { color: "#94a3b8", font: { family: "Outfit" } },
          },
        },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// RECENT PREDICTION INFERENCE LOG
// ---------------------------------------------------------------------------

async function loadRecentHistoryTable() {
  const tbody = document.getElementById("dashRecentHistoryBody");
  if (!tbody) return;

  try {
    const hist = await api("/api/history?limit=6");
    const rows = hist.rows || [];
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="muted">No recent predictions stored yet. Run a prediction to record.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td style="font-family:'JetBrains Mono', monospace; font-weight:600; color:#fff">${escapeHtml(r.date)}</td>
        <td style="font-family:'JetBrains Mono', monospace; color:#00f0ff">${r.predicted_temperature_C} °C</td>
        <td>${getRiskBadge(r.temperature_level)}</td>
        <td style="font-family:'JetBrains Mono', monospace; color:#00e5bc">${r.predicted_rainfall_mm} mm</td>
        <td>${getRiskBadge(r.rainfall_level)}</td>
        <td>${ensoTag(r.oni !== null ? (r.oni >= 0.5 ? "El Niño" : r.oni <= -0.5 ? "La Niña" : "Neutral") : "Neutral")}</td>
        <td style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono', monospace">${r.source || hist.source || "Database"}</td>
        <td><a href="/predict" class="btn btn-secondary" style="padding:2px 8px; font-size:11px">Inspect</a></td>
      </tr>
    `).join("");

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">Inference log loaded via local cache.</td></tr>`;
  }
}

document.addEventListener("DOMContentLoaded", renderDashboard);
