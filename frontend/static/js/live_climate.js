/* live_climate.js — Live Climate Data Centre for 31 Karnataka Districts */

let currentDistrict = "Bengaluru Urban";
let hourlyChart = null;
let dailyChart = null;

async function renderLiveClimate() {
  const main = layout("live-climate");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Live Climate Data Centre</h1>
        <p class="page-description">
          Real-time weather observations, high-resolution hourly forecast models, and 7-day synoptic outlooks across all 31 Karnataka districts. Ingests live Open-Meteo NWP feeds, NOAA ONI teleconnections, and IMD surface coordinates.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <select id="districtSelect" class="form-select" onchange="switchDistrict(this.value)" style="background:var(--card-bg); color:var(--text-primary); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px; min-width:180px">
          <!-- Populated dynamically -->
        </select>
        <button id="btnRefreshLive" class="btn btn-secondary" onclick="refreshLiveDistrict()">🔄 Refresh Live Data</button>
      </div>
    </div>

    <!-- PROVENANCE & OBSERVATION STATUS BANNER -->
    <div class="card" id="provenanceCard" style="margin-bottom:20px; padding:14px 20px; border-left:4px solid var(--cyan); background:rgba(0, 240, 255, 0.03)">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px">
        <div style="display:flex; align-items:center; gap:12px">
          <span style="font-size:22px">📡</span>
          <div>
            <div style="font-weight:600; color:var(--cyan)" id="provPrimarySource">Open-Meteo High-Resolution Numerical Weather Model</div>
            <div style="font-size:12px; color:var(--text-muted)" id="provDataType">Real-Time Atmospheric Ingestion & Forecasts • Surface Station Coordinates</div>
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
          <span class="badge badge-normal" id="cacheStatusBadge">LIVE DATA</span>
          <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--text-muted)" id="retrievalTimestamp">Updated: Loading...</span>
        </div>
      </div>
    </div>

    <!-- REAL-TIME OBSERVATION KPI CARDS -->
    <div class="grid grid-4" style="margin-bottom:20px">
      <div class="card kpi-card">
        <div class="kpi-label">SURFACE TEMPERATURE</div>
        <div class="kpi-value" id="kpiTemp" style="color:var(--cyan)">-- °C</div>
        <div class="kpi-sub" id="kpiFeelsLike">Apparent: -- °C</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">CURRENT PRECIPITATION</div>
        <div class="kpi-value" id="kpiRain" style="color:#38bdf8">-- mm</div>
        <div class="kpi-sub" id="kpiCondition">Condition: Loading...</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">RELATIVE HUMIDITY</div>
        <div class="kpi-value" id="kpiHumidity" style="color:#10b981">-- %</div>
        <div class="kpi-sub" id="kpiWind">Wind: -- km/h</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">NOAA ONI TELECONNECTION</div>
        <div class="kpi-value" id="kpiEnso" style="color:#f59e0b; font-size:20px">--</div>
        <div class="kpi-sub" id="kpiAgroZone">Zone: Loading...</div>
      </div>
    </div>

    <!-- CHARTS ROW: 24H HOURLY & 7-DAY OUTLOOK -->
    <div class="grid grid-2" style="margin-bottom:20px">
      <!-- 24H HOURLY FORECAST -->
      <div class="card" style="display:flex; flex-direction:column">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
          <span>⏱️ 24-Hour High-Resolution Hourly Forecast</span>
          <span style="font-size:12px; color:var(--text-muted)">Temperature (°C) & Rain (mm)</span>
        </div>
        <div id="hourlyChartContainer" style="height:280px; position:relative; margin-top:10px">
          <canvas id="hourlyWeatherChart"></canvas>
        </div>
      </div>

      <!-- 7-DAY SYNOPTIC OUTLOOK -->
      <div class="card" style="display:flex; flex-direction:column">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
          <span>📅 7-Day Synoptic Weather Outlook</span>
          <span style="font-size:12px; color:var(--text-muted)">Daily Max / Min / Rain</span>
        </div>
        <div id="dailyChartContainer" style="height:280px; position:relative; margin-top:10px">
          <canvas id="dailyWeatherChart"></canvas>
        </div>
      </div>
    </div>

    <!-- STATEWIDE 31-DISTRICT OVERVIEW TABLE -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
        <span>🗺️ Statewide Multi-District Real-Time Weather Matrix (31 Districts)</span>
        <span class="badge badge-normal" id="statewideDistrictCount">31 DISTRICTS SYNCHRONIZED</span>
      </div>
      <div style="overflow-x:auto; margin-top:12px; max-height:360px">
        <table class="table" id="statewideTable">
          <thead>
            <tr>
              <th>District</th>
              <th>Current Temp</th>
              <th>Condition</th>
              <th>Precipitation</th>
              <th>Humidity</th>
              <th>Wind Speed</th>
              <th>Source & Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="statewideTbody">
            <tr><td colspan="8" style="text-align:center; padding:20px; color:var(--cyan)">Loading statewide weather telemetry...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  await populateDistricts();
  await loadDistrictData(currentDistrict);
  loadStatewideOverview();
}

async function populateDistricts() {
  const sel = document.getElementById("districtSelect");
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
    if (d === currentDistrict) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function switchDistrict(dist) {
  currentDistrict = dist;
  const sel = document.getElementById("districtSelect");
  if (sel && sel.value !== dist) sel.value = dist;
  await loadDistrictData(dist);
}

async function refreshLiveDistrict() {
  const btn = document.getElementById("btnRefreshLive");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Fetching...";
  }
  await loadDistrictData(currentDistrict);
  await loadStatewideOverview();
  if (btn) {
    btn.disabled = false;
    btn.textContent = "🔄 Refresh Live Data";
  }
}

async function loadDistrictData(district) {
  // Show subtle loading state
  const timeEl = document.getElementById("retrievalTimestamp");
  if (timeEl) timeEl.textContent = "Fetching live observations...";

  try {
    const data = await api(`/api/live-climate/current?district=${encodeURIComponent(district)}`);
    updateDistrictUI(data);
  } catch (err) {
    console.error("Live district error:", err);
    if (timeEl) timeEl.textContent = "Error fetching observations.";
  }
}

function updateDistrictUI(data) {
  const curr = data.current || {};
  const prov = data.provenance || {};

  document.getElementById("kpiTemp").textContent = `${curr.temperature_c ?? "--"} °C`;
  document.getElementById("kpiFeelsLike").textContent = `Apparent: ${curr.apparent_temperature_c ?? "--"} °C`;
  document.getElementById("kpiRain").textContent = `${curr.rainfall_mm ?? "0.0"} mm`;
  document.getElementById("kpiCondition").textContent = `${curr.icon || "🌤️"} ${curr.condition || "Clear"}`;
  document.getElementById("kpiHumidity").textContent = `${curr.relative_humidity ?? "--"} %`;
  document.getElementById("kpiWind").textContent = `Wind: ${curr.wind_speed_kmh ?? "--"} km/h`;

  const oni = prov.noaa_enso || {};
  document.getElementById("kpiEnso").textContent = `${oni.phase || "Neutral"} (${oni.oni_value !== undefined ? (oni.oni_value > 0 ? "+" + oni.oni_value : oni.oni_value) : "0.0"})`;
  document.getElementById("kpiAgroZone").textContent = `Zone: ${data.agro_zone || "Karnataka Zone"}`;

  // Provenance & Updated time
  document.getElementById("provPrimarySource").textContent = prov.primary_source || "Open-Meteo High-Resolution NWP";
  document.getElementById("provDataType").textContent = prov.data_type || "Model Estimate";

  let dateDisplay = "Just now";
  if (prov.retrieved_at) {
    try {
      const d = new Date(prov.retrieved_at);
      dateDisplay = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      dateDisplay = "Recent";
    }
  }
  document.getElementById("retrievalTimestamp").textContent = `Updated: ${dateDisplay}`;

  const cacheBadge = document.getElementById("cacheStatusBadge");
  if (prov.is_stale) {
    cacheBadge.textContent = "OFFLINE BASELINE";
    cacheBadge.style.background = "#f59e0b";
    cacheBadge.style.color = "#000";
  } else if (data.is_cached) {
    cacheBadge.textContent = "CACHED (15m)";
    cacheBadge.style.background = "var(--cyan)";
    cacheBadge.style.color = "#000";
  } else {
    cacheBadge.textContent = "LIVE METEOROLOGICAL FEED";
    cacheBadge.style.background = "#10b981";
    cacheBadge.style.color = "#fff";
  }

  // Render Charts
  renderHourlyChart(data.hourly || []);
  renderDailyChart(data.daily || []);
}

function renderHourlyChart(hourly) {
  const container = document.getElementById("hourlyChartContainer");
  if (!container) return;

  if (hourlyChart) {
    hourlyChart.destroy();
    hourlyChart = null;
  }

  if (!hourly || hourly.length === 0) {
    container.innerHTML = `
      <div style="display:flex; height:100%; align-items:center; justify-content:center; color:var(--text-muted); text-align:center; flex-direction:column; gap:8px">
        <span style="font-size:24px">⚠️</span>
        <div>Hourly forecast data currently unavailable for this station.</div>
        <button class="btn btn-secondary btn-sm" onclick="refreshLiveDistrict()">Try Refreshing</button>
      </div>
    `;
    return;
  }

  // Ensure canvas is present
  container.innerHTML = `<canvas id="hourlyWeatherChart"></canvas>`;
  const ctx = document.getElementById("hourlyWeatherChart").getContext("2d");

  const labels = hourly.map(h => h.time || h.hour_label || (h.timestamp ? h.timestamp.slice(11, 16) : "--:--"));
  const temps = hourly.map(h => h.temperature_c ?? h.temp_c ?? null);
  const rains = hourly.map(h => h.precipitation_mm ?? h.rain_mm ?? 0);

  hourlyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Temperature (°C)",
          data: temps,
          borderColor: "#00f0ff",
          backgroundColor: "rgba(0, 240, 255, 0.12)",
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
          yAxisID: "y",
          order: 1,
        },
        {
          label: "Precipitation (mm)",
          data: rains,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.45)",
          type: "bar",
          yAxisID: "y1",
          borderRadius: 3,
          order: 2,
        }
      ]
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
          position: "left",
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "var(--text-muted)" },
          title: { display: true, text: "Temperature (°C)", color: "var(--cyan)", font: { size: 11 } }
        },
        y1: {
          position: "right",
          grid: { display: false },
          ticks: { color: "#38bdf8" },
          title: { display: true, text: "Rainfall (mm)", color: "#38bdf8", font: { size: 11 } },
          beginAtZero: true,
          suggestedMax: 5,
        },
        x: {
          grid: { display: false },
          ticks: { color: "var(--text-muted)", maxTicksLimit: 12 }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: { color: "#ffffff", font: { size: 11, weight: "600" }, boxWidth: 12 }
        },
        tooltip: {
          backgroundColor: "rgba(12, 21, 39, 0.95)",
          titleColor: "#00f0ff",
          bodyColor: "#f1f5f9",
          borderColor: "rgba(0, 240, 255, 0.3)",
          borderWidth: 1,
          callbacks: {
            title: function(items) {
              const idx = items[0].dataIndex;
              const h = hourly[idx] || {};
              return `${labels[idx]} • ${h.icon || "🌤️"} ${h.condition || "Weather"}`;
            },
            label: function(item) {
              if (item.datasetIndex === 0) {
                return ` Temperature: ${item.parsed.y} °C`;
              } else {
                return ` Precipitation: ${item.parsed.y} mm`;
              }
            },
            afterBody: function(items) {
              const idx = items[0].dataIndex;
              const h = hourly[idx] || {};
              const parts = [];
              if (h.humidity !== undefined && h.humidity !== null) parts.push(`Humidity: ${h.humidity}%`);
              if (h.wind_speed_kmh !== undefined && h.wind_speed_kmh !== null) parts.push(`Wind: ${h.wind_speed_kmh} km/h`);
              if (h.precipitation_prob) parts.push(`Rain Probability: ${h.precipitation_prob}%`);
              return parts.length ? parts.join(" | ") : "";
            }
          }
        }
      }
    }
  });
}

function renderDailyChart(daily) {
  const container = document.getElementById("dailyChartContainer");
  if (!container) return;

  if (dailyChart) {
    dailyChart.destroy();
    dailyChart = null;
  }

  if (!daily || daily.length === 0) {
    container.innerHTML = `
      <div style="display:flex; height:100%; align-items:center; justify-content:center; color:var(--text-muted); text-align:center; flex-direction:column; gap:8px">
        <span style="font-size:24px">⚠️</span>
        <div>7-Day synoptic outlook currently unavailable for this station.</div>
        <button class="btn btn-secondary btn-sm" onclick="refreshLiveDistrict()">Try Refreshing</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `<canvas id="dailyWeatherChart"></canvas>`;
  const ctx = document.getElementById("dailyWeatherChart").getContext("2d");

  const labels = daily.map(d => d.display_date || (d.day_name ? `${d.day_name} (${d.date.slice(5)})` : d.date));
  const maxTemps = daily.map(d => d.max_temp ?? d.max_temp_c ?? null);
  const minTemps = daily.map(d => d.min_temp ?? d.min_temp_c ?? null);
  const rainSums = daily.map(d => d.precipitation_sum ?? d.rain_sum_mm ?? 0);

  dailyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Max Temp (°C)",
          data: maxTemps,
          backgroundColor: "rgba(239, 68, 68, 0.75)",
          borderColor: "#ef4444",
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: "y",
          order: 2,
        },
        {
          label: "Min Temp (°C)",
          data: minTemps,
          backgroundColor: "rgba(56, 189, 248, 0.55)",
          borderColor: "#38bdf8",
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: "y",
          order: 3,
        },
        {
          label: "Rain Total (mm)",
          data: rainSums,
          type: "line",
          borderColor: "#00e5bc",
          backgroundColor: "rgba(0, 229, 188, 0.2)",
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#00e5bc",
          yAxisID: "y1",
          order: 1,
        }
      ]
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
          position: "left",
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "var(--text-muted)" },
          title: { display: true, text: "Temperature (°C)", color: "var(--text-muted)", font: { size: 11 } }
        },
        y1: {
          position: "right",
          grid: { display: false },
          ticks: { color: "#00e5bc" },
          title: { display: true, text: "Rainfall (mm)", color: "#00e5bc", font: { size: 11 } },
          beginAtZero: true,
          suggestedMax: 10,
        },
        x: {
          grid: { display: false },
          ticks: { color: "var(--text-muted)", font: { size: 11 } }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: { color: "#ffffff", font: { size: 11, weight: "600" }, boxWidth: 12 }
        },
        tooltip: {
          backgroundColor: "rgba(12, 21, 39, 0.95)",
          titleColor: "#00f0ff",
          bodyColor: "#f1f5f9",
          borderColor: "rgba(0, 240, 255, 0.3)",
          borderWidth: 1,
          callbacks: {
            title: function(items) {
              const idx = items[0].dataIndex;
              const d = daily[idx] || {};
              return `${labels[idx]} • ${d.icon || "🌤️"} ${d.condition || "Outlook"}`;
            },
            afterBody: function(items) {
              const idx = items[0].dataIndex;
              const d = daily[idx] || {};
              const parts = [];
              if (d.wind_speed_max_kmh !== undefined && d.wind_speed_max_kmh !== null) {
                parts.push(`Max Wind: ${d.wind_speed_max_kmh} km/h`);
              }
              if (d.rain_prob !== undefined && d.rain_prob !== null) {
                parts.push(`Rain Probability: ${d.rain_prob}%`);
              }
              return parts.length ? parts.join(" | ") : "";
            }
          }
        }
      }
    }
  });
}

async function loadStatewideOverview() {
  const tbody = document.getElementById("statewideTbody");
  if (!tbody) return;

  try {
    const data = await api("/api/live-climate/statewide");
    const districts = data.all_districts || [];

    tbody.innerHTML = "";
    districts.forEach(d => {
      const tr = document.createElement("tr");
      const isSelected = d.district === currentDistrict;
      if (isSelected) {
        tr.style.background = "rgba(0, 240, 255, 0.08)";
      }

      tr.innerHTML = `
        <td style="font-weight:600; color:${isSelected ? 'var(--cyan)' : 'var(--text-primary)'}">
          ${escapeHtml(d.district)}
          ${isSelected ? ' <span class="badge badge-normal" style="font-size:9px">SELECTED</span>' : ''}
        </td>
        <td style="font-weight:700; color:${(d.temperature_c ?? 25) > 30 ? '#ef4444' : 'var(--text-primary)'}">
          ${d.temperature_c !== undefined && d.temperature_c !== null ? d.temperature_c + " °C" : "--"}
        </td>
        <td>${d.icon || "🌤️"} ${escapeHtml(d.condition || "Clear")}</td>
        <td style="color:${(d.rainfall_mm ?? 0) > 0 ? '#38bdf8' : 'var(--text-muted)'}">
          ${d.rainfall_mm !== undefined && d.rainfall_mm !== null ? d.rainfall_mm + " mm" : "0.0 mm"}
        </td>
        <td>${d.humidity !== undefined && d.humidity !== null ? d.humidity + "%" : "--"}</td>
        <td>${d.wind_speed !== undefined && d.wind_speed !== null ? d.wind_speed + " km/h" : "--"}</td>
        <td>
          <span class="badge ${d.is_stale ? 'badge-advisory' : 'badge-normal'}" style="font-size:10px">
            ${d.is_stale ? 'OFFLINE' : 'LIVE'}
          </span>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="switchDistrict('${escapeHtml(d.district)}')">View</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    const countBadge = document.getElementById("statewideDistrictCount");
    if (countBadge) {
      countBadge.textContent = `${districts.length} DISTRICTS SYNCHRONIZED`;
    }
  } catch (err) {
    console.error("Statewide fetch error:", err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#ef4444; padding:20px">Error loading statewide telemetry: ${escapeHtml(err.message)}</td></tr>`;
  }
}

document.addEventListener("DOMContentLoaded", renderLiveClimate);
