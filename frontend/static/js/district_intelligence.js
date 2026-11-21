/* ==========================================================================
   district_intelligence.js — 31-District Climate Intelligence Command Module
   ========================================================================== */

let allDistricts = [];
let selectedDistrict = "Bengaluru Urban";
let comparisonBuffer = ["Bengaluru Urban", "Kalaburagi"];
let districtGeoJsonLayer = null;
let districtMap = null;
let monthlyClimatologyChart = null;
let annualTrendChart = null;
let compRainChart = null;
let compTempChart = null;

async function initDistrictIntelligence() {
  const main = layout("district-intelligence");

  // Read URL query param if present
  const urlParams = new URLSearchParams(window.location.search);
  const paramDist = urlParams.get("district");
  if (paramDist) {
    selectedDistrict = paramDist;
  }

  main.innerHTML = `
    <!-- 1. Header Bar -->
    <div class="page-header">
      <div>
        <h1 class="page-title">District-wise Climate Intelligence</h1>
        <p class="page-description">
          Granular meteorological monitoring, downscaled AI predictions, multi-hazard risk profiles, and local adaptation directives across all 31 Karnataka administrative districts.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center">
        <button class="btn btn-secondary" id="openComparisonModalBtn">
          ⚖️ Compare Districts (<span id="compBadgeCount">2</span>)
        </button>
        <span class="badge badge-cyan" id="stateTelemetryBadge">31 DISTRICTS ACTIVE</span>
      </div>
    </div>

    <!-- 2. District Selection Command Strip (Search, Dropdown & Filters) -->
    <div class="card" style="margin-bottom:20px; padding:16px 20px">
      <div style="display:flex; flex-wrap:wrap; gap:14px; align-items:flex-end">
        <div style="flex:1; min-width:220px">
          <label class="form-label" for="districtSelectDropdown">SELECT DISTRICT (ALL 31 KARNATAKA DISTRICTS):</label>
          <select id="districtSelectDropdown" class="form-control" style="font-weight:600; color:var(--cyan)">
            <option value="" disabled>Loading districts...</option>
          </select>
        </div>

        <div style="width:200px">
          <label class="form-label" for="zoneFilterSelect">AGRO-CLIMATIC ZONE:</label>
          <select id="zoneFilterSelect" class="form-control">
            <option value="ALL">All Zones (31)</option>
            <option value="Northern Dry Zone">Northern Dry Zone</option>
            <option value="North East Dry Zone">North East Dry Zone</option>
            <option value="Central Dry Zone">Central Dry Zone</option>
            <option value="Eastern Dry Zone">Eastern Dry Zone</option>
            <option value="Southern Dry Zone">Southern Dry Zone</option>
            <option value="Northern Transition Zone">Northern Transition</option>
            <option value="Southern Transition Zone">Southern Transition</option>
            <option value="Coastal Zone">Coastal Zone</option>
            <option value="Hilly / Malnad Zone">Hilly / Malnad Zone</option>
          </select>
        </div>

        <div style="flex:1; min-width:200px">
          <label class="form-label" for="districtSearchInput">QUICK FILTER DISTRICT CARDS:</label>
          <input type="text" id="districtSearchInput" class="form-control" placeholder="Search by name, HQ, river basin...">
        </div>

        <button id="toggleMapBtn" class="btn btn-secondary" style="height:38px">
          🗺️ Toggle District Map
        </button>
      </div>
    </div>

    <!-- 3. Interactive District Map Section (Collapsible) -->
    <div id="districtMapContainer" class="card" style="margin-bottom:24px; padding:0; overflow:hidden">
      <div style="padding:12px 18px; background:rgba(8, 17, 29, 0.9); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center">
        <div style="display:flex; align-items:center; gap:8px">
          <span style="font-size:13px; font-weight:600; color:#fff">INTERACTIVE KARNATAKA DISTRICT MAP</span>
          <span class="badge badge-cyan">CLICK BOUNDARY TO EXPLORE</span>
        </div>
        <div style="display:flex; gap:6px" id="mapLayerPills">
          <button class="gis-layer-btn active" data-layer="risk">🚨 Hazard Status</button>
          <button class="gis-layer-btn" data-layer="rainfall">🌧️ Rainfall</button>
          <button class="gis-layer-btn" data-layer="temp">🌡️ Temperature</button>
        </div>
      </div>
      <div class="gis-map-frame" style="border:none; border-radius:0">
        <div id="districtLeafletMap" class="gis-map-canvas" style="height:440px"></div>
        <div class="gis-map-legend" id="districtMapLegend">
          <div class="legend-title">District Hazard Status</div>
          <div class="legend-row"><span class="legend-color-dot" style="background:#ef4444"></span> Critical Alert / High Heat</div>
          <div class="legend-row"><span class="legend-color-dot" style="background:#f97316"></span> High Watch / Water Deficit</div>
          <div class="legend-row"><span class="legend-color-dot" style="background:#eab308"></span> Advisory / Moderate</div>
          <div class="legend-row"><span class="legend-color-dot" style="background:#10b981"></span> Baseline Normal</div>
        </div>
      </div>
    </div>

    <!-- 4. District Selection Cards (Horizontal Scroll or Grid) -->
    <div style="margin-bottom:24px">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">
        <span style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--text-muted); font-family:'JetBrains Mono',monospace">
          DISTRICT OVERVIEW TILES (CLICK TO LOAD DASHBOARD):
        </span>
        <span id="filteredCountLabel" style="font-size:11px; color:var(--cyan); font-family:'JetBrains Mono',monospace">31 Districts</span>
      </div>
      <div id="districtCardsGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:12px; max-height:260px; overflow-y:auto; padding-right:4px">
        <!-- Rendered dynamically -->
      </div>
    </div>

    <!-- 5. INDIVIDUAL DISTRICT DASHBOARD (Primary Content) -->
    <div id="individualDistrictDashboard">
      <div class="card" style="text-align:center; padding:40px">
        <div style="font-family:'JetBrains Mono',monospace; color:var(--cyan)">Loading District Climate Intelligence...</div>
      </div>
    </div>

    <!-- 6. DISTRICT COMPARISON MODAL -->
    <div id="districtComparisonModal" style="display:none; position:fixed; inset:0; background:rgba(4,8,16,0.85); backdrop-filter:blur(8px); z-index:2000; overflow-y:auto; padding:30px 20px">
      <div class="card" style="max-width:1200px; margin:0 auto; background:rgba(13,26,45,0.98); border:1px solid var(--cyan)">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-subtle); padding-bottom:14px; margin-bottom:18px">
          <div>
            <h2 style="font-size:18px; color:#fff; margin:0">Multi-District Climate & Risk Comparison</h2>
            <p style="font-size:12px; color:var(--text-dim); margin-top:4px">Side-by-side comparative analytics, thermal envelopes, and precipitation anomalies.</p>
          </div>
          <button id="closeCompModalBtn" class="btn btn-secondary" style="font-size:14px; padding:6px 14px">✕ Close</button>
        </div>

        <div style="margin-bottom:18px">
          <label class="form-label">ADD DISTRICT TO COMPARISON (MAX 5):</label>
          <div style="display:flex; gap:10px">
            <select id="addCompDistrictSelect" class="form-control" style="flex:1"></select>
            <button id="addCompDistrictBtn" class="btn btn-primary">Add District</button>
          </div>
        </div>

        <!-- Comparative Table -->
        <div style="overflow-x:auto; margin-bottom:24px">
          <table class="command-table" id="comparisonTable">
            <!-- Rendered dynamically -->
          </table>
        </div>

        <!-- Comparative Charts -->
        <div class="grid grid-2">
          <div class="card" style="padding:16px; background:rgba(8,17,29,0.7)">
            <div class="card-title" style="font-size:13px; margin-bottom:12px">Monthly Rainfall Comparison (mm)</div>
            <div style="height:260px"><canvas id="compRainCanvas"></canvas></div>
          </div>
          <div class="card" style="padding:16px; background:rgba(8,17,29,0.7)">
            <div class="card-title" style="font-size:13px; margin-bottom:12px">Monthly Mean Temperature Comparison (°C)</div>
            <div style="height:260px"><canvas id="compTempCanvas"></canvas></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Fetch all 31 districts
  try {
    const res = await api("/api/districts-full");
    allDistricts = res.districts || [];
    populateDistrictControls();
    initDistrictLeafletMap();
    renderDistrictCards();
    loadIndividualDistrict(selectedDistrict);
    bindEvents();
  } catch (err) {
    main.innerHTML = `<div class="card" style="border-color:var(--risk-critical); color:var(--risk-critical)">Failed to initialize district intelligence: ${err.message}</div>`;
  }
}

function populateDistrictControls() {
  const dropdown = document.getElementById("districtSelectDropdown");
  const compDropdown = document.getElementById("addCompDistrictSelect");
  
  dropdown.innerHTML = allDistricts
    .map(d => `<option value="${d.district}" ${d.district === selectedDistrict ? "selected" : ""}>${d.district} (${d.zone})</option>`)
    .join("");

  compDropdown.innerHTML = allDistricts
    .map(d => `<option value="${d.district}">${d.district}</option>`)
    .join("");
}

function renderDistrictCards(filterZone = "ALL", searchTerm = "") {
  const container = document.getElementById("districtCardsGrid");
  const countLabel = document.getElementById("filteredCountLabel");

  const filtered = allDistricts.filter(d => {
    const matchesZone = filterZone === "ALL" || d.zone.toLowerCase().includes(filterZone.toLowerCase());
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = !term ||
      d.district.toLowerCase().includes(term) ||
      d.hq.toLowerCase().includes(term) ||
      d.basin.toLowerCase().includes(term);
    return matchesZone && matchesSearch;
  });

  countLabel.textContent = `${filtered.length} of 31 Districts`;

  container.innerHTML = filtered.map(d => {
    const isSelected = d.district === selectedDistrict;
    return `
      <div class="card district-card-item ${isSelected ? 'active-district-card' : ''}"
           data-district="${d.district}"
           style="padding:12px 14px; cursor:pointer; border-color:${isSelected ? 'var(--cyan)' : 'var(--border-subtle)'}; background:${isSelected ? 'rgba(0,240,255,0.08)' : 'var(--bg-glass-card)'}; transition:all 0.15s ease">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px">
          <div>
            <div style="font-weight:700; color:#fff; font-size:14px">${d.district}</div>
            <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">${d.hq}</div>
          </div>
          ${getRiskBadge(d.early_warning)}
        </div>
        <div style="font-size:11.5px; color:var(--text-dim); margin-bottom:8px; line-height:1.4">
          <div>Zone: <span style="color:#fff">${d.zone}</span></div>
          <div>Annual Rain: <span style="color:var(--teal); font-family:'JetBrains Mono',monospace">${d.has_gauge_data && d.avg_annual_mm != null ? d.avg_annual_mm + ' mm' : 'Data unavailable'}</span></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(56,189,248,0.08); padding-top:6px">
          <span style="font-size:10px; color:var(--text-muted)">Elev: ${d.elevation_m}m</span>
          <button class="add-to-comp-btn" data-district="${d.district}" style="background:transparent; border:none; color:var(--blue-bright); font-size:11px; cursor:pointer">
            + Compare
          </button>
        </div>
      </div>
    `;
  }).join("");

  // Attach card click handlers
  container.querySelectorAll(".district-card-item").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("add-to-comp-btn")) return;
      const dist = el.dataset.district;
      loadIndividualDistrict(dist);
    });
  });

  // Attach add to comparison handlers
  container.querySelectorAll(".add-to-comp-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dist = btn.dataset.district;
      if (!comparisonBuffer.includes(dist)) {
        if (comparisonBuffer.length >= 5) comparisonBuffer.shift();
        comparisonBuffer.push(dist);
        updateComparisonUI();
      }
    });
  });
}

function initDistrictLeafletMap() {
  const mapEl = document.getElementById("districtLeafletMap");
  if (!mapEl || districtMap) return;

  districtMap = L.map("districtLeafletMap", {
    center: [14.8, 75.8],
    zoom: 6.8,
    minZoom: 6,
    maxZoom: 11,
    zoomControl: true,
  });

  const basemapSetup = (typeof getStandardBasemapLayers === "function") ? getStandardBasemapLayers() : null;
  if (basemapSetup) {
    basemapSetup.defaultLayer.addTo(districtMap);
    L.control.layers(basemapSetup.baseMaps, null, { position: "topright" }).addTo(districtMap);
  } else {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(districtMap);
  }

  // Load 31-District GeoJSON boundaries
  fetch("/static/data/karnataka_districts.geojson")
    .then(r => r.json())
    .then(geoData => {
      districtGeoJsonLayer = L.geoJSON(geoData, {
        style: feature => {
          const dName = feature.properties.district;
          const reg = allDistricts.find(d => d.district.toLowerCase() === dName.toLowerCase());
          const isSelected = dName === selectedDistrict;
          let fillColor = "#38bdf8";
          if (reg) {
            if (reg.early_warning === "Critical Alert") fillColor = "#ef4444";
            else if (reg.early_warning === "High Watch") fillColor = "#f97316";
            else if (reg.early_warning === "Advisory") fillColor = "#eab308";
            else fillColor = "#10b981";
          }
          return {
            color: isSelected ? "#00f0ff" : "rgba(56, 189, 248, 0.45)",
            weight: isSelected ? 3 : 1.2,
            fillColor: fillColor,
            fillOpacity: isSelected ? 0.45 : 0.22,
          };
        },
        onEachFeature: (feature, layer) => {
          const dName = feature.properties.district;
          const reg = allDistricts.find(d => d.district.toLowerCase() === dName.toLowerCase());
          
          layer.bindTooltip(`
            <div style="font-weight:700; color:#fff">${dName}</div>
            <div style="font-size:11px; color:#94a3b8">${reg ? reg.zone : ''}</div>
            <div style="font-size:11px; color:#00f0ff">${reg ? reg.early_warning : ''}</div>
          `, { sticky: true, className: "custom-leaflet-tooltip" });

          layer.on("click", () => {
            loadIndividualDistrict(dName);
          });

          layer.on("mouseover", () => {
            layer.setStyle({ weight: 2.5, color: "#00f0ff", fillOpacity: 0.5 });
          });

          layer.on("mouseout", () => {
            if (dName !== selectedDistrict) {
              districtGeoJsonLayer.resetStyle(layer);
            }
          });
        }
      }).addTo(districtMap);

      // Add headquarters circle markers
      allDistricts.forEach(d => {
        const marker = L.circleMarker([d.lat, d.lon], {
          radius: 5,
          color: "#00f0ff",
          fillColor: "#08111d",
          fillOpacity: 0.9,
          weight: 1.5,
        }).addTo(districtMap);

        marker.bindPopup(`
          <div style="font-weight:700; color:#fff; font-size:13px">${d.district}</div>
          <div style="font-size:11px; color:var(--text-dim); margin:4px 0">${d.zone}</div>
          <div style="font-size:11px">Annual Rainfall: <strong>${d.avg_annual_mm} mm</strong></div>
          <div style="margin-top:6px">
            <button class="btn btn-primary" style="padding:4px 8px; font-size:10px" onclick="loadIndividualDistrict('${d.district}')">Open Dashboard</button>
          </div>
        `);
      });
    })
    .catch(err => console.error("Could not load district geojson:", err));
}

async function loadIndividualDistrict(districtName) {
  selectedDistrict = districtName;

  // Update controls
  const dropdown = document.getElementById("districtSelectDropdown");
  if (dropdown) dropdown.value = districtName;

  // Highlight card
  renderDistrictCards(
    document.getElementById("zoneFilterSelect")?.value || "ALL",
    document.getElementById("districtSearchInput")?.value || ""
  );

  // Update GeoJSON highlight if map exists
  if (districtGeoJsonLayer) {
    districtGeoJsonLayer.eachLayer(layer => {
      const dName = layer.feature.properties.district;
      if (dName === selectedDistrict) {
        layer.setStyle({ weight: 3.5, color: "#00f0ff", fillOpacity: 0.55 });
        layer.bringToFront();
      } else {
        districtGeoJsonLayer.resetStyle(layer);
      }
    });
  }

  const container = document.getElementById("individualDistrictDashboard");
  container.innerHTML = `
    <div class="card" style="text-align:center; padding:40px">
      <div style="font-family:'JetBrains Mono',monospace; color:var(--cyan)">Loading ${escapeHtml(districtName)} Intelligence Dashboard...</div>
    </div>
  `;

  try {
    const data = await api(`/api/district/${encodeURIComponent(districtName)}`);
    renderIndividualDashboard(data);
  } catch (err) {
    container.innerHTML = `<div class="card" style="border-color:var(--risk-critical); color:var(--risk-critical)">Failed to load district data: ${err.message}</div>`;
  }
}

function renderIndividualDashboard(data) {
  const container = document.getElementById("individualDistrictDashboard");
  const prof = data.profile || {};
  const weath = data.weather || {};
  const ai = data.ai_predictions || {};
  const risk = data.risk_monitoring || {};
  const ew = data.early_warnings || {};
  const hist = data.historical_analytics || {};
  const adapt = data.adaptation_recommendations || {};

  container.innerHTML = `
    <!-- Top District Banner -->
    <div class="card" style="margin-bottom:20px; border-left:4px solid var(--cyan); background:linear-gradient(135deg, rgba(16,31,54,0.9) 0%, rgba(13,26,45,0.7) 100%)">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:14px">
        <div>
          <div style="display:flex; align-items:center; gap:10px">
            <h2 style="font-size:24px; font-weight:700; color:#fff; margin:0">${escapeHtml(data.district)}</h2>
            <span class="badge ${prof.is_gauge_primary ? 'badge-normal' : 'badge-cyan'}">
              ${prof.is_gauge_primary ? 'DIRECT IMD RAINGAUGE' : 'REGIONAL CLIMATOLOGICAL MODEL'}
            </span>
            ${getRiskBadge(ew.status)}
          </div>
          <div style="font-size:13px; color:var(--text-dim); margin-top:6px; display:flex; flex-wrap:wrap; gap:16px">
            <span>HQ: <strong style="color:#fff">${escapeHtml(prof.hq)}</strong></span>
            <span>Zone: <strong style="color:var(--cyan)">${escapeHtml(prof.zone)}</strong></span>
            <span>Elevation: <strong style="color:#fff">${prof.elevation_m}m ASL</strong></span>
            <span>Basin: <strong style="color:#fff">${escapeHtml(prof.basin)}</strong></span>
          </div>
        </div>

        <div style="display:flex; gap:10px">
          <button class="btn btn-secondary" onclick="addToComparison('${escapeHtml(data.district)}')">
            + Compare with Another District
          </button>
          <a href="/alerts" class="btn btn-primary">
            View State Alerts 🚨
          </a>
        </div>
      </div>
    </div>

    <!-- D. Dedicated Early Warning Callout Bulletin -->
    <div class="card" style="margin-bottom:20px; border-color:${ew.status === 'Critical Alert' ? 'var(--risk-critical)' : 'rgba(56,189,248,0.3)'}; background:${ew.status === 'Critical Alert' ? 'rgba(239,68,68,0.08)' : 'rgba(13,26,45,0.6)'}">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">
        <div style="display:flex; align-items:center; gap:8px">
          <span style="font-size:16px">🚨</span>
          <span style="font-size:14px; font-weight:700; color:#fff; font-family:'JetBrains Mono',monospace">OPERATIONAL EARLY WARNING BULLETIN: ${ew.status.toUpperCase()}</span>
        </div>
        <span class="badge badge-cyan">${escapeHtml(ew.affected_zone)}</span>
      </div>
      <div style="font-size:13.5px; line-height:1.6; color:#fff; margin-bottom:8px">
        ${escapeHtml(ew.bulletin)}
      </div>
      <div style="font-size:12px; color:var(--text-dim); background:rgba(8,17,29,0.7); padding:8px 12px; border-radius:4px; border-left:3px solid var(--cyan)">
        <strong>Municipal Priority Directive:</strong> ${escapeHtml(ew.recommended_action)}
      </div>
    </div>

    <!-- A. Current and Historical Weather Profiling (KPIs) -->
    <div style="font-size:13px; font-weight:700; text-transform:uppercase; color:var(--text-muted); font-family:'JetBrains Mono',monospace; margin-bottom:10px">
      SECTION A: CURRENT & HISTORICAL METEOROLOGICAL PROFILE
    </div>
    <div class="grid grid-4" style="margin-bottom:20px">
      <div class="hero-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">ANNUAL MEAN TEMP</span>
          <div class="kpi-icon-pill">🌡️</div>
        </div>
        <div class="kpi-value-row">
          <span class="kpi-value">${weath.mean_temperature_c}</span>
          <span class="kpi-unit">°C</span>
        </div>
        <div class="kpi-subtext">Peak Summer: ${weath.max_temperature_c}°C</div>
      </div>

      <div class="hero-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">ANNUAL RAINFALL NORMAL</span>
          <div class="kpi-icon-pill" style="color:var(--teal)">🌧️</div>
        </div>
        <div class="kpi-value-row">
          ${weath.has_gauge_data && weath.annual_rainfall_mm != null
            ? `<span class="kpi-value">${weath.annual_rainfall_mm}</span><span class="kpi-unit">mm</span>`
            : `<span class="kpi-value" style="font-size:16px; color:var(--text-muted)">Data unavailable</span>`}
        </div>
        <div class="kpi-subtext">
          ${weath.has_gauge_data && weath.rainy_days != null
            ? `Avg Rainy Days: ${weath.rainy_days} days/yr`
            : `No direct raingauge in 1991–2020 record`}
        </div>
      </div>

      <div class="hero-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">RECORD DAILY RAINFALL</span>
          <div class="kpi-icon-pill" style="color:var(--cyan)">🌊</div>
        </div>
        <div class="kpi-value-row">
          ${weath.has_gauge_data && weath.max_daily_rainfall_mm != null
            ? `<span class="kpi-value">${weath.max_daily_rainfall_mm}</span><span class="kpi-unit">mm/day</span>`
            : `<span class="kpi-value" style="font-size:16px; color:var(--text-muted)">Data unavailable</span>`}
        </div>
        <div class="kpi-subtext">
          ${weath.has_gauge_data
            ? `Max localized single-day event`
            : `Raingauge extreme records unavailable`}
        </div>
      </div>

      <div class="hero-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">DATA PROVENANCE</span>
          <div class="kpi-icon-pill">📊</div>
        </div>
        <div class="kpi-value-row">
          <span class="kpi-value" style="font-size:16px; color:var(--cyan)">${prof.is_gauge_primary ? '1991–2020' : 'Reanalysis'}</span>
        </div>
        <div class="kpi-subtext">${escapeHtml(prof.provenance)}</div>
      </div>
    </div>

    <!-- Monthly Climatological Cycles Chart -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <div>
          <div class="card-title">Monthly Temperature & Rainfall Distribution (${escapeHtml(data.district)})</div>
          <div class="card-subtitle">Empirical 12-month climatological envelopes derived from long-term observational records:</div>
        </div>
        ${!weath.has_gauge_data ? '<span class="badge badge-warning">RAINGAUGE DATA UNAVAILABLE</span>' : '<span class="badge badge-normal">IMD GAUGE VERIFIED</span>'}
      </div>
      ${weath.has_gauge_data && weath.monthly_climatology && weath.monthly_climatology.length > 0 ? `
        <div style="height:280px">
          <canvas id="districtMonthlyCanvas"></canvas>
        </div>
      ` : `
        <div style="background:rgba(8,17,29,0.6); border:1px solid var(--border-subtle); border-radius:8px; padding:36px 20px; text-align:center">
          <div style="font-size:28px; margin-bottom:8px">🌧️</div>
          <div style="font-size:14px; font-weight:600; color:#fff; font-family:'JetBrains Mono',monospace">Historical IMD Raingauge Data Unavailable</div>
          <p style="font-size:12px; color:var(--text-dim); max-width:560px; margin:8px auto 0; line-height:1.6">
            ${escapeHtml(data.district)} does not host direct manual raingauge stations in the 1991–2020 IMD observational archive. Climatological model projections are displayed under Section B (Downscaled AI Predictions).
          </p>
          <span class="badge badge-cyan" style="margin-top:12px; display:inline-block">DATA BOUNDARY RESPECTED — NO FABRICATED VALUES</span>
        </div>
      `}
    </div>

    <!-- B & C. AI Predictions & Hazard Risk Monitoring -->
    <div class="grid grid-2" style="margin-bottom:24px">
      <!-- B. AI Predictions -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">SECTION B: DOWNSCALED AI MODEL PREDICTIONS</div>
          <span class="badge badge-cyan">${escapeHtml(ai.date)}</span>
        </div>
        
        <div class="grid grid-2" style="margin-bottom:14px">
          <div style="background:rgba(8,17,29,0.7); padding:12px; border-radius:6px; border:1px solid var(--border-subtle)">
            <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">PREDICTED TEMPERATURE</div>
            <div style="font-size:24px; font-weight:700; color:var(--cyan); font-family:'JetBrains Mono',monospace; margin-top:4px">
              ${ai.predicted_temperature_c} °C
            </div>
            <div style="margin-top:6px">${getRiskBadge(ai.heat_risk_level)}</div>
          </div>

          <div style="background:rgba(8,17,29,0.7); padding:12px; border-radius:6px; border:1px solid var(--border-subtle)">
            <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">PREDICTED RAINFALL</div>
            <div style="font-size:24px; font-weight:700; color:var(--teal); font-family:'JetBrains Mono',monospace; margin-top:4px">
              ${ai.predicted_rainfall_mm} mm
            </div>
            <div style="margin-top:6px">${getRiskBadge(ai.rainfall_risk_level)}</div>
          </div>
        </div>

        <div style="font-size:12px; line-height:1.6; color:var(--text-dim); background:rgba(8,17,29,0.5); padding:10px 14px; border-radius:6px; border:1px solid var(--border-subtle)">
          <div><strong>Statewide Baseline ML Inferences:</strong> Temp: ${ai.statewide_model_base_temp}°C | Rain: ${ai.statewide_model_base_rain}mm</div>
          <div><strong>Elevation & Latitudinal Offset:</strong> ${ai.elevation_temp_adjustment > 0 ? '+' : ''}${ai.elevation_temp_adjustment}°C vs Statewide Normal</div>
          <div><strong>Orographic Moisture Multiplier:</strong> ${ai.orographic_rain_multiplier}x precipitation ratio</div>
          <div style="margin-top:4px; font-size:11px; color:var(--cyan)">${escapeHtml(ai.model_provenance)}</div>
        </div>
      </div>

      <!-- C. Climate Risk Monitoring -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">SECTION C: CLIMATE RISK & HAZARD METRICS</div>
          <span class="badge badge-normal">ENSO: ${escapeHtml(risk.enso_background_phase)}</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:12px">
          <div>
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px">
              <span>Extreme Heat Vulnerability Index</span>
              <strong style="color:var(--risk-warning); font-family:'JetBrains Mono',monospace">${risk.extreme_heat_index}%</strong>
            </div>
            <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden">
              <div style="width:${risk.extreme_heat_index}%; height:100%; background:linear-gradient(90deg, #10b981, #f97316, #ef4444)"></div>
            </div>
          </div>

          <div>
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px">
              <span>30-Day Precipitation Deficit Indicator</span>
              <strong style="color:${risk.rainfall_deficit_pct < 0 ? 'var(--risk-critical)' : 'var(--teal)'}; font-family:'JetBrains Mono',monospace">${risk.rainfall_deficit_pct}%</strong>
            </div>
            <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden">
              <div style="width:${Math.min(100, Math.abs(risk.rainfall_deficit_pct) * 2)}%; height:100%; background:var(--cyan)"></div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:4px">
            <div style="background:rgba(8,17,29,0.7); padding:10px; border-radius:6px; border:1px solid var(--border-subtle)">
              <div style="font-size:11px; color:var(--text-muted)">DROUGHT VULNERABILITY</div>
              <div style="margin-top:4px">${getRiskBadge(risk.drought_risk_level)}</div>
            </div>
            <div style="background:rgba(8,17,29,0.7); padding:10px; border-radius:6px; border:1px solid var(--border-subtle)">
              <div style="font-size:11px; color:var(--text-muted)">FLOOD / INUNDATION TIER</div>
              <div style="margin-top:4px">${getRiskBadge(risk.flood_risk_level)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- E. Historical Analytics (Annual Rainfall Trends & ENSO Teleconnection) -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <div>
          <div class="card-title">SECTION E: HISTORICAL CLIMATE ANALYTICS & ENSO TELECONNECTIONS</div>
          <div class="card-subtitle">Long-term precipitation fluctuations and Pacific sea surface temperature anomaly teleconnections for ${escapeHtml(data.district)}:</div>
        </div>
        ${!hist.has_gauge_data ? '<span class="badge badge-warning">ANNUAL GAUGE TIMESERIES UNAVAILABLE</span>' : '<span class="badge badge-normal">OBSERVED ANNUAL SERIES</span>'}
      </div>

      <div class="grid grid-sidebar-layout">
        ${hist.has_gauge_data && hist.annual_series && hist.annual_series.length > 0 ? `
          <div style="height:260px">
            <canvas id="districtAnnualCanvas"></canvas>
          </div>
        ` : `
          <div style="background:rgba(8,17,29,0.6); border:1px solid var(--border-subtle); border-radius:8px; padding:36px 20px; text-align:center; display:flex; flex-direction:column; justify-content:center; align-items:center">
            <div style="font-size:28px; margin-bottom:8px">📊</div>
            <div style="font-size:14px; font-weight:600; color:#fff; font-family:'JetBrains Mono',monospace">Annual Gauge Timeseries Unavailable</div>
            <p style="font-size:12px; color:var(--text-dim); max-width:480px; margin:6px auto 0; line-height:1.5">
              No multi-decadal annual raingauge observations exist for ${escapeHtml(data.district)} in the 1991–2020 IMD archive. No artificial numbers are synthesized.
            </p>
          </div>
        `}

        <div style="display:flex; flex-direction:column; gap:10px; justify-content:center">
          <div style="background:rgba(8,17,29,0.7); border:1px solid var(--border-subtle); padding:12px; border-radius:6px">
            <div style="font-size:11px; color:var(--risk-warning); font-weight:700">EL NIÑO PHASE IMPACT</div>
            <div style="font-size:18px; font-weight:700; color:#fff; font-family:'JetBrains Mono',monospace">
              ${hist.enso_comparison?.El_Nino?.mean_rainfall_mm != null ? hist.enso_comparison.El_Nino.mean_rainfall_mm + ' mm' : 'Data unavailable'}
            </div>
            <div style="font-size:11px; color:var(--text-dim)">Avg temp: ${hist.enso_comparison?.El_Nino?.mean_temp_c || '—'}°C (Rain suppression)</div>
          </div>

          <div style="background:rgba(8,17,29,0.7); border:1px solid var(--border-subtle); padding:12px; border-radius:6px">
            <div style="font-size:11px; color:var(--cyan); font-weight:700">LA NIÑA PHASE IMPACT</div>
            <div style="font-size:18px; font-weight:700; color:#fff; font-family:'JetBrains Mono',monospace">
              ${hist.enso_comparison?.La_Nina?.mean_rainfall_mm != null ? hist.enso_comparison.La_Nina.mean_rainfall_mm + ' mm' : 'Data unavailable'}
            </div>
            <div style="font-size:11px; color:var(--text-dim)">Avg temp: ${hist.enso_comparison?.La_Nina?.mean_temp_c || '—'}°C (Enhanced rainfall)</div>
          </div>
        </div>
      </div>
    </div>

    <!-- F. Tailored District Adaptation Recommendations -->
    <div style="font-size:13px; font-weight:700; text-transform:uppercase; color:var(--text-muted); font-family:'JetBrains Mono',monospace; margin-bottom:10px">
      SECTION F: OPERATIONAL MUNICIPAL & SECTOR ADAPTATION DIRECTIVES
    </div>
    <div class="grid grid-2" style="margin-bottom:20px">
      <div class="adaptation-sector-card">
        <div class="sector-card-top">
          <div class="sector-card-title">
            <div class="sector-icon-pill">🏥</div>
            <div>
              <div>Public Health & Heat Wave Emergency</div>
              <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">${escapeHtml(data.district)} Health Cadre</div>
            </div>
          </div>
          ${getRiskBadge(ai.heat_risk_level)}
        </div>
        <div class="sector-action-text">${escapeHtml(adapt.public_health)}</div>
      </div>

      <div class="adaptation-sector-card">
        <div class="sector-card-top">
          <div class="sector-card-title">
            <div class="sector-icon-pill">🌾</div>
            <div>
              <div>Agriculture, Irrigation & Water Security</div>
              <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">${escapeHtml(prof.basin)} Basin Directorate</div>
            </div>
          </div>
          ${getRiskBadge(risk.drought_risk_level)}
        </div>
        <div class="sector-action-text">${escapeHtml(adapt.agriculture_water)}</div>
      </div>

      <div class="adaptation-sector-card">
        <div class="sector-card-top">
          <div class="sector-card-title">
            <div class="sector-icon-pill">🏙️</div>
            <div>
              <div>Urban Cooling & Microclimate Management</div>
              <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">${escapeHtml(prof.hq)} City Corporation</div>
            </div>
          </div>
          ${getRiskBadge(ai.heat_risk_level)}
        </div>
        <div class="sector-action-text">${escapeHtml(adapt.urban_cooling)}</div>
      </div>

      <div class="adaptation-sector-card">
        <div class="sector-card-top">
          <div class="sector-card-title">
            <div class="sector-icon-pill">🌊</div>
            <div>
              <div>Stormwater Drainage & Flood Containment</div>
              <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">Municipal Engineering Division</div>
            </div>
          </div>
          ${getRiskBadge(risk.flood_risk_level)}
        </div>
        <div class="sector-action-text">${escapeHtml(adapt.drainage_flood)}</div>
      </div>
    </div>
  `;

  // Render Charts
  renderDistrictCharts(weath.monthly_climatology || [], hist.annual_series || []);
}

function renderDistrictCharts(monthlyData, annualData) {
  // 1. Monthly Dual-Axis Chart
  const mCtx = document.getElementById("districtMonthlyCanvas");
  if (monthlyClimatologyChart) {
    monthlyClimatologyChart.destroy();
    monthlyClimatologyChart = null;
  }
  if (mCtx && monthlyData && monthlyData.length > 0) {
    monthlyClimatologyChart = new Chart(mCtx, {
      type: "bar",
      data: {
        labels: monthlyData.map(d => d.month),
        datasets: [
          {
            label: "Monthly Rainfall (mm)",
            data: monthlyData.map(d => d.rainfall_mm),
            backgroundColor: "rgba(0, 240, 255, 0.4)",
            borderColor: "#00f0ff",
            borderWidth: 1,
            yAxisID: "yRain",
            order: 2,
          },
          {
            label: "Mean Temperature (°C)",
            data: monthlyData.map(d => d.temperature_c),
            type: "line",
            borderColor: "#f97316",
            backgroundColor: "#f97316",
            borderWidth: 2,
            pointRadius: 3,
            yAxisID: "yTemp",
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#94a3b8", font: { family: "Outfit" } } },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || "";
                const val = context.raw;
                if (label.includes("Rainfall")) {
                  return ` ${label}: ${val} mm`;
                }
                return ` ${label}: ${val} °C`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.05)" } },
          yRain: {
            type: "linear",
            position: "left",
            title: { display: true, text: "Rainfall (mm)", color: "#00f0ff" },
            ticks: { color: "#94a3b8" },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
          yTemp: {
            type: "linear",
            position: "right",
            title: { display: true, text: "Temperature (°C)", color: "#f97316" },
            ticks: { color: "#94a3b8" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  // 2. Annual Historical Series Chart
  const aCtx = document.getElementById("districtAnnualCanvas");
  if (annualTrendChart) {
    annualTrendChart.destroy();
    annualTrendChart = null;
  }
  if (aCtx && annualData && annualData.length > 0) {
    annualTrendChart = new Chart(aCtx, {
      type: "line",
      data: {
        labels: annualData.map(d => d.year),
        datasets: [
          {
            label: "Annual Cumulative Rainfall (mm)",
            data: annualData.map(d => d.rainfall_mm),
            borderColor: "#00e5bc",
            backgroundColor: "rgba(0, 229, 188, 0.15)",
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: "#00e5bc",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#94a3b8", font: { family: "Outfit" } } },
          tooltip: {
            callbacks: {
              label: (context) => ` Annual Total: ${context.raw} mm`
            }
          }
        },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.05)" } },
          y: {
            ticks: { color: "#94a3b8" },
            title: { display: true, text: "Annual Rainfall (mm)", color: "#00e5bc" },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
        },
      },
    });
  }
}

function bindEvents() {
  // Dropdown selector change
  document.getElementById("districtSelectDropdown").addEventListener("change", (e) => {
    loadIndividualDistrict(e.target.value);
  });

  // Zone filter
  document.getElementById("zoneFilterSelect").addEventListener("change", (e) => {
    renderDistrictCards(e.target.value, document.getElementById("districtSearchInput").value);
  });

  // Search input
  document.getElementById("districtSearchInput").addEventListener("input", (e) => {
    renderDistrictCards(document.getElementById("zoneFilterSelect").value, e.target.value);
  });

  // Toggle map container
  document.getElementById("toggleMapBtn").addEventListener("click", () => {
    const c = document.getElementById("districtMapContainer");
    c.style.display = c.style.display === "none" ? "block" : "none";
    if (districtMap) districtMap.invalidateSize();
  });

  // Comparison modal buttons
  document.getElementById("openComparisonModalBtn").addEventListener("click", () => {
    openComparisonModal();
  });

  document.getElementById("closeCompModalBtn").addEventListener("click", () => {
    document.getElementById("districtComparisonModal").style.display = "none";
  });

  document.getElementById("addCompDistrictBtn").addEventListener("click", () => {
    const dist = document.getElementById("addCompDistrictSelect").value;
    if (dist && !comparisonBuffer.includes(dist)) {
      if (comparisonBuffer.length >= 5) comparisonBuffer.shift();
      comparisonBuffer.push(dist);
      updateComparisonUI();
      renderComparisonData();
    }
  });
}

function addToComparison(dist) {
  if (!comparisonBuffer.includes(dist)) {
    if (comparisonBuffer.length >= 5) comparisonBuffer.shift();
    comparisonBuffer.push(dist);
  }
  updateComparisonUI();
  openComparisonModal();
}

function updateComparisonUI() {
  const badge = document.getElementById("compBadgeCount");
  if (badge) badge.textContent = comparisonBuffer.length;
}

async function openComparisonModal() {
  document.getElementById("districtComparisonModal").style.display = "block";
  updateComparisonUI();
  await renderComparisonData();
}

async function renderComparisonData() {
  const table = document.getElementById("comparisonTable");
  table.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--cyan)">Computing multi-district comparison analytics...</td></tr>`;

  try {
    const res = await api("/api/district/compare", {
      method: "POST",
      body: JSON.stringify({ districts: comparisonBuffer }),
    });

    if (res.status !== "success" || !res.comparison_table) {
      table.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--risk-critical)">Could not compute comparison.</td></tr>`;
      return;
    }

    // Render table
    table.innerHTML = `
      <thead>
        <tr>
          <th>District</th>
          <th>Zone</th>
          <th>Elevation</th>
          <th>Annual Rainfall</th>
          <th>Forecast Temp</th>
          <th>Heat Risk</th>
          <th>Forecast Rain</th>
          <th>Flood Risk</th>
          <th>Drought Risk</th>
          <th>Early Warning</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${res.comparison_table.map(row => `
          <tr>
            <td><strong style="color:#fff">${escapeHtml(row.district)}</strong></td>
            <td><span style="font-size:11px; color:var(--text-dim)">${escapeHtml(row.zone)}</span></td>
            <td>${row.elevation_m}m</td>
            <td><span style="color:var(--teal); font-family:'JetBrains Mono',monospace">${row.annual_rainfall_mm} mm</span></td>
            <td><span style="color:var(--cyan); font-family:'JetBrains Mono',monospace">${row.predicted_temp_c} °C</span></td>
            <td>${getRiskBadge(row.heat_risk)}</td>
            <td><span style="color:var(--teal); font-family:'JetBrains Mono',monospace">${row.predicted_rain_mm} mm</span></td>
            <td>${getRiskBadge(row.flood_risk)}</td>
            <td>${getRiskBadge(row.drought_risk)}</td>
            <td>${getRiskBadge(row.early_warning)}</td>
            <td>
              <button class="btn btn-secondary" style="padding:2px 8px; font-size:10px" onclick="removeCompDistrict('${escapeHtml(row.district)}')">Remove</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    `;

    // Render comparative charts
    const rainCtx = document.getElementById("compRainCanvas");
    const tempCtx = document.getElementById("compTempCanvas");
    const colorPalette = ["#00f0ff", "#f97316", "#00e5bc", "#a855f7", "#eab308"];

    if (compRainChart) compRainChart.destroy();
    compRainChart = new Chart(rainCtx, {
      type: "bar",
      data: {
        labels: res.months,
        datasets: res.monthly_rainfall_series.map((s, idx) => ({
          label: s.district,
          data: s.data,
          backgroundColor: colorPalette[idx % colorPalette.length],
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: "#94a3b8" } },
          y: { ticks: { color: "#94a3b8" }, title: { display: true, text: "Rainfall (mm)", color: "#00f0ff" } },
        },
      },
    });

    if (compTempChart) compTempChart.destroy();
    compTempChart = new Chart(tempCtx, {
      type: "line",
      data: {
        labels: res.months,
        datasets: res.monthly_temperature_series.map((s, idx) => ({
          label: s.district,
          data: s.data,
          borderColor: colorPalette[idx % colorPalette.length],
          backgroundColor: colorPalette[idx % colorPalette.length],
          borderWidth: 2,
          tension: 0.3,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: "#94a3b8" } },
          y: { ticks: { color: "#94a3b8" }, title: { display: true, text: "Temp (°C)", color: "#f97316" } },
        },
      },
    });

  } catch (err) {
    table.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--risk-critical)">Error loading comparison: ${err.message}</td></tr>`;
  }
}

function removeCompDistrict(dist) {
  comparisonBuffer = comparisonBuffer.filter(d => d !== dist);
  updateComparisonUI();
  renderComparisonData();
}

// Initialise
initDistrictIntelligence();
