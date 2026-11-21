/* ==========================================================================
   district.js — Karnataka District GIS & Meteorological Spatial Explorer
   ========================================================================== */

let gisMap = null;
let districtMarkers = [];
let districtGeoJsonLayer = null;
let currentDistricts = [];
let fullDistrictProfiles = [];
let currentMapMode = "drought"; // "drought" | "flood" | "rainfall" | "heat" | "temp"

async function renderDistrict() {
  const main = layout("district");
  main.innerHTML = `<div class="card" style="text-align:center; padding:40px"><div style="font-family:'JetBrains Mono',monospace; color:var(--cyan)">Initializing Karnataka GIS Geospatial Engine...</div></div>`;

  try {
    const [legacyRes, fullRes] = await Promise.all([
      api("/api/district"),
      api("/api/districts-full"),
    ]);

    currentDistricts = legacyRes.districts || [];
    fullDistrictProfiles = fullRes.districts || [];

    main.innerHTML = `
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Karnataka District GIS Spatial Explorer</h1>
          <p class="page-description">
            Multi-layer interactive meteorological cartography across Karnataka. Seamlessly switch between Urban Heat Risk, Precipitation Volume, Drought Vulnerability, and Flood Risk layers across all 31 district boundary polygons.
          </p>
        </div>
        <div style="display:flex; gap:10px; align-items:center">
          <span class="badge badge-cyan">31 DISTRICTS • COMMAND GIS BASEMAP</span>
          <a href="/district-intelligence" class="btn btn-primary" style="font-size:12px">
            🏛️ District-wise Intelligence
          </a>
        </div>
      </div>

      <!-- Karnataka GIS Spatial Map Section -->
      <section class="card" style="margin-bottom:20px; padding:18px">
        <div class="card-header" style="margin-bottom:12px">
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
              GEOSPATIAL COMMAND LAYER
            </div>
            <h2 class="card-title" style="margin-top:2px">Interactive Karnataka Meteorological Spatial Map</h2>
          </div>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
            <span style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; margin-right:4px">Layer View:</span>
            <button class="gis-layer-btn active" id="btnMapDrought" onclick="setMapMode('drought')">🏜️ Drought Risk</button>
            <button class="gis-layer-btn" id="btnMapFlood" onclick="setMapMode('flood')">🌊 Flood Risk</button>
            <button class="gis-layer-btn" id="btnMapHeat" onclick="setMapMode('heat')">🔥 Heat Risk</button>
            <button class="gis-layer-btn" id="btnMapRainfall" onclick="setMapMode('rainfall')">🌧️ Rainfall Volume</button>
            <button class="gis-layer-btn" id="btnMapTemp" onclick="setMapMode('temp')">🌡️ Temperature</button>
            <button class="gis-layer-btn" id="btnMapAlerts" onclick="setMapMode('alerts')">🚨 Early Warnings</button>
          </div>
        </div>

        <div class="gis-map-frame" style="height:540px">
          <div id="karnatakaGisMap" class="gis-map-canvas" style="height:100%"></div>

          <div class="gis-map-legend" id="mapLegend">
            <!-- Dynamic Legend -->
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:12px; font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono', monospace">
          <span>COORDINATES: 11.5°N–18.5°N, 74.0°E–78.5°E • 31 DISTRICT BOUNDARIES LOADED</span>
          <span>CLICK DISTRICT BOUNDARY OR PIN TO INSPECT</span>
        </div>
      </section>

      <!-- District Search + Station Cards Grid -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:12px">
        <div class="topbar-search-box" style="width:100%; max-width:360px">
          <span class="topbar-search-icon">🔍</span>
          <input id="districtSearchInput" type="search" placeholder="Filter districts (e.g. Mysuru, Kalaburagi)..."
                 oninput="filterDistrictCards(this.value)" class="topbar-search-input" style="width:100%">
        </div>
        <div style="font-size:12px; color:var(--text-muted); font-family:'JetBrains Mono', monospace">
          DISTRICTS DISPLAYED: <span id="distCount" style="color:var(--cyan); font-weight:700">${fullDistrictProfiles.length}</span> / 31
        </div>
      </div>

      <!-- District Cards Grid -->
      <section class="grid" id="districtCardsGrid" style="grid-template-columns: repeat(auto-fill, minmax(230px,1fr)); gap:12px; margin-bottom:24px">
        ${fullDistrictProfiles.map(d => `
          <article class="card district-card" data-district="${escapeHtml(d.district)}"
                   style="cursor:pointer; border-left:4px solid ${riskColor(d.drought_risk)}"
                   onclick="loadDistrictDetail('${escapeHtml(d.district)}')">
            <div style="display:flex; justify-content:space-between; align-items:start; gap:8px">
              <strong style="font-size:15px; color:#fff">${escapeHtml(d.district)}</strong>
              ${getRiskBadge(d.early_warning)}
            </div>
            <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; margin-top:8px">Agro-Climatic Zone</div>
            <div style="font-size:13px; font-weight:600; color:var(--cyan)">
              ${escapeHtml(d.zone)}
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:11px; color:var(--text-dim)">
              <span>Avg Annual: <b style="color:#fff">${d.avg_annual_mm} mm</b></span>
              <span>Mean Temp: <b style="color:#fff">${d.mean_temp_c}°C</b></span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:11px">
              <span style="color:var(--text-muted)">Flood: ${getRiskBadge(d.flood_risk)}</span>
              <span style="color:var(--text-muted)">Heat: ${getRiskBadge(d.heat_risk)}</span>
            </div>
          </article>
        `).join("")}
      </section>

      <!-- Selected District Inspection Modal / Drawer -->
      <div id="districtDetailModal" style="display:none; position:fixed; inset:0; background:rgba(4,8,16,0.85); backdrop-filter:blur(8px); z-index:2000; overflow-y:auto; padding:30px 20px">
        <div class="card" style="max-width:850px; margin:0 auto; background:rgba(13,26,45,0.98); border:1px solid var(--cyan)" id="districtDetailContent">
          <!-- Rendered dynamically -->
        </div>
      </div>
    `;

    initGisMap();
    updateMapLegend(currentMapMode);

  } catch (err) {
    main.innerHTML = `<div class="card"><h2 style="color:var(--risk-critical)">Error Loading GIS Explorer</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function initGisMap() {
  const container = document.getElementById("karnatakaGisMap");
  if (!container || typeof L === "undefined") return;

  if (gisMap) {
    gisMap.remove();
    gisMap = null;
  }

  gisMap = L.map("karnatakaGisMap", {
    center: [14.8, 75.8],
    zoom: 7,
    minZoom: 6,
    maxZoom: 12,
  });

  // High-performance Command-Centre Basemap Layers with Layer Switcher & Auto-Fallback
  const basemapSetup = (typeof getStandardBasemapLayers === "function") ? getStandardBasemapLayers() : null;
  if (basemapSetup) {
    basemapSetup.defaultLayer.addTo(gisMap);
    L.control.layers(basemapSetup.baseMaps, null, { position: "topright" }).addTo(gisMap);
  } else {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(gisMap);
  }

  // Load all 31 Karnataka District Boundary Polygons
  fetch("/static/data/karnataka_districts.geojson")
    .then(res => res.json())
    .then(geoJsonData => {
      districtGeoJsonLayer = L.geoJSON(geoJsonData, {
        style: feature => getPolygonStyle(feature.properties.district, currentMapMode),
        onEachFeature: (feature, layer) => {
          const dName = feature.properties.district;
          const prof = fullDistrictProfiles.find(d => d.district.toLowerCase() === dName.toLowerCase());

          layer.bindTooltip(`
            <div style="font-weight:700; color:#fff">${dName}</div>
            <div style="font-size:11px; color:#94a3b8">${prof ? prof.zone : ''}</div>
            <div style="font-size:11px; color:#00f0ff">${prof ? prof.early_warning : ''}</div>
          `, { sticky: true });

          layer.on("click", () => {
            loadDistrictDetail(dName);
          });

          layer.on("mouseover", () => {
            layer.setStyle({ weight: 2.8, color: "#00f0ff", fillOpacity: 0.6 });
          });

          layer.on("mouseout", () => {
            districtGeoJsonLayer.resetStyle(layer);
          });
        },
      }).addTo(gisMap);
    })
    .catch(err => console.warn("Notice: karnataka_districts.geojson load:", err));

  renderDistrictMarkers(currentMapMode);
}

function getPolygonStyle(districtName, mode) {
  const prof = fullDistrictProfiles.find(d => d.district.toLowerCase() === districtName.toLowerCase());
  let fillColor = "#38bdf8";

  if (prof) {
    if (mode === "drought") {
      fillColor = prof.drought_risk === "Critical" ? "#b91c1c" : (prof.drought_risk === "High" ? "#ef4444" : (prof.drought_risk === "Moderate" ? "#f97316" : "#10b981"));
    } else if (mode === "flood") {
      fillColor = prof.flood_risk === "Critical" ? "#ef4444" : (prof.flood_risk === "High" ? "#f97316" : (prof.flood_risk === "Moderate" ? "#38bdf8" : "#10b981"));
    } else if (mode === "heat") {
      fillColor = prof.heat_risk === "Critical" || prof.heat_risk === "Very High" ? "#ef4444" : (prof.heat_risk === "High" ? "#f97316" : (prof.heat_risk === "Moderate" ? "#eab308" : "#10b981"));
    } else if (mode === "rainfall") {
      fillColor = prof.avg_annual_mm > 2500 ? "#00f0ff" : (prof.avg_annual_mm > 1200 ? "#00e5bc" : (prof.avg_annual_mm > 750 ? "#38bdf8" : "#f97316"));
    } else if (mode === "temp") {
      fillColor = prof.mean_temp_c > 27.5 ? "#ef4444" : (prof.mean_temp_c > 25.5 ? "#f97316" : (prof.mean_temp_c > 23.5 ? "#eab308" : "#00f0ff"));
    } else if (mode === "alerts") {
      const ew = (prof.early_warning || "").toLowerCase();
      fillColor = ew.includes("critical") ? "#dc2626" : (ew.includes("high") || ew.includes("warning") ? "#ea580c" : (ew.includes("advisory") ? "#ca8a04" : "#16a34a"));
    }
  }

  return {
    color: "rgba(56, 189, 248, 0.4)",
    weight: 1.2,
    fillColor: fillColor,
    fillOpacity: 0.32,
  };
}

function renderDistrictMarkers(mode) {
  if (!gisMap) return;

  districtMarkers.forEach(m => gisMap.removeLayer(m));
  districtMarkers = [];

  fullDistrictProfiles.forEach(d => {
    const lat = Number(d.lat || 15.0);
    const lon = Number(d.lon || 76.0);

    let color = "#10b981";
    let radius = 6;

    if (mode === "drought") {
      color = d.drought_risk === "High" ? "#ef4444" : (d.drought_risk === "Moderate" ? "#f97316" : "#10b981");
    } else if (mode === "flood") {
      color = d.flood_risk === "Critical" || d.flood_risk === "Very High" ? "#ef4444" : (d.flood_risk === "High" ? "#f97316" : "#38bdf8");
    } else if (mode === "heat") {
      color = d.heat_risk === "Very High" || d.heat_risk === "Critical" ? "#ef4444" : (d.heat_risk === "High" ? "#f97316" : "#10b981");
    } else if (mode === "rainfall") {
      color = "#00f0ff";
      radius = Math.max(5, Math.min(18, (d.avg_annual_mm / 300)));
    } else if (mode === "temp") {
      color = d.mean_temp_c > 27.0 ? "#ef4444" : (d.mean_temp_c > 25.0 ? "#f97316" : "#00f0ff");
    } else if (mode === "alerts") {
      const ew = (d.early_warning || "").toLowerCase();
      color = ew.includes("critical") ? "#dc2626" : (ew.includes("high") || ew.includes("warning") ? "#ea580c" : (ew.includes("advisory") ? "#ca8a04" : "#16a34a"));
    }

    const circle = L.circleMarker([lat, lon], {
      radius: radius,
      fillColor: color,
      color: "#ffffff",
      weight: 1.2,
      opacity: 0.95,
      fillOpacity: 0.85,
    }).addTo(gisMap);

    const popupHtml = `
      <div style="font-family:'Outfit', sans-serif; min-width:200px; color:#f1f5f9; padding:4px">
        <h4 style="margin:0 0 6px 0; font-size:15px; color:#00f0ff; text-transform:uppercase">${escapeHtml(d.district)}</h4>
        <div style="font-size:12px; line-height:1.5">
          <div><b>Zone:</b> ${escapeHtml(d.zone)}</div>
          <div><b>Annual Rain:</b> ${d.avg_annual_mm} mm</div>
          <div><b>Mean Temp:</b> ${d.mean_temp_c} °C</div>
          <div><b>Early Warning:</b> <span style="font-weight:700; color:${riskColor(d.early_warning)}">${d.early_warning}</span></div>
        </div>
        <button onclick="loadDistrictDetail('${escapeHtml(d.district)}')"
                class="btn btn-primary" style="margin-top:10px; width:100%; padding:5px 8px; font-size:11px">
          Inspect Climate Profile
        </button>
      </div>
    `;

    circle.bindPopup(popupHtml);
    circle.bindTooltip(`<b>${escapeHtml(d.district)}</b> (${d.avg_annual_mm} mm)`, { direction: "top", offset: [0, -6] });
    districtMarkers.push(circle);
  });
}

function setMapMode(mode) {
  currentMapMode = mode;
  document.querySelectorAll("[id^='btnMap']").forEach(btn => btn.classList.remove("active"));
  const btn = document.getElementById(
    mode === "drought" ? "btnMapDrought" :
    (mode === "flood" ? "btnMapFlood" :
    (mode === "heat" ? "btnMapHeat" :
    (mode === "rainfall" ? "btnMapRainfall" :
    (mode === "temp" ? "btnMapTemp" : "btnMapAlerts"))))
  );
  if (btn) btn.classList.add("active");

  if (districtGeoJsonLayer) {
    districtGeoJsonLayer.setStyle(feature => getPolygonStyle(feature.properties.district, mode));
  }
  renderDistrictMarkers(mode);
  updateMapLegend(mode);
}

function updateMapLegend(mode) {
  const legend = document.getElementById("mapLegend");
  if (!legend) return;

  if (mode === "drought") {
    legend.innerHTML = `
      <div class="legend-title">Drought Vulnerability</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#ef4444"></span> High Vulnerability</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#f97316"></span> Moderate Deficit Risk</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#10b981"></span> Low / Baseline Safe</div>
    `;
  } else if (mode === "flood") {
    legend.innerHTML = `
      <div class="legend-title">Flood / Inundation Tier</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#ef4444"></span> Critical / Western Ghats Deluge</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#f97316"></span> High Drainage Stress</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#38bdf8"></span> Moderate Runoff</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#10b981"></span> Low Flood Hazard</div>
    `;
  } else if (mode === "heat") {
    legend.innerHTML = `
      <div class="legend-title">Urban & Thermal Heat Tier</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#ef4444"></span> Critical Alert (P90+)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#f97316"></span> High Heat Watch (P75–P90)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#eab308"></span> Moderate (P50–P75)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#10b981"></span> Normal Thermal Baseline</div>
    `;
  } else if (mode === "rainfall") {
    legend.innerHTML = `
      <div class="legend-title">Annual Precipitation</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#00f0ff"></span> &gt;2500 mm (Coastal / Malnad)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#00e5bc"></span> 1200–2500 mm (Transition)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#38bdf8"></span> 750–1200 mm (South Interior)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#f97316"></span> &lt;750 mm (Dry Northern Plains)</div>
    `;
  } else if (mode === "temp") {
    legend.innerHTML = `
      <div class="legend-title">Annual Mean Temperature</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#ef4444"></span> &gt;27.5 °C (North Interior Thermal)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#f97316"></span> 25.5–27.5 °C (Plains)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#00f0ff"></span> &lt;23.5 °C (Western Ghats Highlands)</div>
    `;
  } else if (mode === "alerts") {
    legend.innerHTML = `
      <div class="legend-title">Active Early Warning Level</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#dc2626"></span> Critical Alert (&gt; P90)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#ea580c"></span> High Watch (P75–P90)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#ca8a04"></span> Advisory (ENSO / Deficit)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#16a34a"></span> Normal Baseline</div>
    `;
  }
}

async function loadDistrictDetail(districtName) {
  const modal = document.getElementById("districtDetailModal");
  const content = document.getElementById("districtDetailContent");
  modal.style.display = "block";
  content.innerHTML = `<div style="text-align:center; padding:30px; font-family:'JetBrains Mono',monospace; color:var(--cyan)">Retrieving ${escapeHtml(districtName)} profile...</div>`;

  try {
    const data = await api(`/api/district/${encodeURIComponent(districtName)}`);
    const prof = data.profile || {};
    const weath = data.weather || {};
    const ai = data.ai_predictions || {};
    const risk = data.risk_monitoring || {};

    content.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--border-subtle); padding-bottom:14px; margin-bottom:18px">
        <div>
          <div style="display:flex; align-items:center; gap:10px">
            <h2 style="font-size:22px; color:#fff; margin:0">${escapeHtml(data.district)}</h2>
            ${getRiskBadge(data.early_warnings?.status || "Normal")}
          </div>
          <div style="font-size:12px; color:var(--text-dim); margin-top:4px">
            Zone: <span style="color:var(--cyan)">${escapeHtml(prof.zone || "Karnataka")}</span> | HQ: <strong>${escapeHtml(prof.hq || data.district)}</strong> | Elevation: <strong>${prof.elevation_m || 600}m</strong>
          </div>
        </div>
        <button onclick="document.getElementById('districtDetailModal').style.display='none'" class="btn btn-secondary" style="padding:6px 12px; font-size:13px">✕ Close</button>
      </div>

      <div class="grid grid-3" style="margin-bottom:18px">
        <div style="background:rgba(8,17,29,0.7); padding:12px; border-radius:6px; border:1px solid var(--border-subtle)">
          <div style="font-size:11px; color:var(--text-muted)">NORMAL ANNUAL RAIN</div>
          <div style="font-size:22px; font-weight:700; color:var(--teal); font-family:'JetBrains Mono',monospace">${weath.annual_rainfall_mm || '—'} mm</div>
          <div style="font-size:11px; color:var(--text-dim)">Rainy days: ${weath.rainy_days || '—'} / yr</div>
        </div>

        <div style="background:rgba(8,17,29,0.7); padding:12px; border-radius:6px; border:1px solid var(--border-subtle)">
          <div style="font-size:11px; color:var(--text-muted)">MEAN TEMPERATURE</div>
          <div style="font-size:22px; font-weight:700; color:var(--cyan); font-family:'JetBrains Mono',monospace">${weath.mean_temperature_c || '—'} °C</div>
          <div style="font-size:11px; color:var(--text-dim)">Peak summer: ${weath.max_temperature_c || '—'} °C</div>
        </div>

        <div style="background:rgba(8,17,29,0.7); padding:12px; border-radius:6px; border:1px solid var(--border-subtle)">
          <div style="font-size:11px; color:var(--text-muted)">DOWNSCALED FORECAST</div>
          <div style="font-size:22px; font-weight:700; color:#fff; font-family:'JetBrains Mono',monospace">${ai.predicted_temperature_c || '—'} °C</div>
          <div style="font-size:11px; color:var(--text-dim)">Rain: ${ai.predicted_rainfall_mm || '—'} mm (${ai.heat_risk_level || 'Normal'} Heat)</div>
        </div>
      </div>

      <div style="background:rgba(8,17,29,0.6); padding:14px; border-radius:6px; border-left:3px solid var(--cyan); margin-bottom:18px; font-size:13px; line-height:1.6">
        <strong>Early Warning Directive:</strong> ${escapeHtml(data.early_warnings?.bulletin || "Baseline surveillance active.")}
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px">
        <a href="/district-intelligence?district=${encodeURIComponent(data.district)}" class="btn btn-primary">
          Open Full 6-Section Intelligence Dashboard 🏛️
        </a>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div style="color:var(--risk-critical); padding:20px">Error loading profile: ${escapeHtml(err.message)}</div>`;
  }
}

function filterDistrictCards(query) {
  const q = query.trim().toLowerCase();
  let count = 0;
  document.querySelectorAll(".district-card").forEach(card => {
    const name = card.dataset.district.toLowerCase();
    const show = name.includes(q);
    card.style.display = show ? "" : "none";
    if (show) count++;
  });
  const counter = document.getElementById("distCount");
  if (counter) counter.textContent = count;
}

renderDistrict();
