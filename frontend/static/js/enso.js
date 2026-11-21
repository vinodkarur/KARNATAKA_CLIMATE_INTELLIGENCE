/* ==========================================================================
   enso.js — El Niño / La Niña Climate Teleconnection Monitor
   Full Interactive Implementation connecting to /api/enso
   ========================================================================== */

let ensoData = null;
let ensoChart = null;
let currentTimelineRange = "all"; // 'all', 'last25', 'last10'
let currentPhaseFilter = "all";   // 'all', 'el_nino', 'la_nina', 'neutral'
let selectedYear = 2026;

async function renderEnsoMonitor() {
  const main = layout("enso");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">El Niño & La Niña Climate Teleconnection Monitor</h1>
        <p class="page-description">
          Tropical Pacific sea surface temperature surveillance, NOAA Oceanic Niño Index (ONI v5) analysis, and multi-decadal teleconnection impacts across Karnataka's monsoonal and thermal dynamics.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <span class="badge badge-cyan" id="oniDatasetBadge">NOAA CPC ERSST.v5</span>
        <span class="badge badge-warning" id="oniStatusBadge">LOADING...</span>
      </div>
    </div>
    <div class="card" style="text-align:center; padding:40px">
      <div style="font-family:'JetBrains Mono',monospace; color:var(--cyan)">Retrieving NOAA ONI historical reanalysis dataset (1950–2026)...</div>
    </div>
  `;

  try {
    const res = await api("/api/enso");
    ensoData = res;
    selectedYear = ensoData.latest?.year || 2026;
    buildEnsoPage(main);
  } catch (err) {
    main.innerHTML = `
      <div class="card" style="border-color:var(--risk-critical); color:var(--risk-critical); padding:30px; text-align:center">
        <h3>Failed to load El Niño / La Niña Monitor</h3>
        <p style="margin-top:10px; color:var(--text-dim)">${escapeHtml(err.message)}</p>
        <button class="btn btn-primary" onclick="renderEnsoMonitor()" style="margin-top:16px">Retry Connection</button>
      </div>
    `;
  }
}

function buildEnsoPage(main) {
  const latest = ensoData.latest || {};
  const summary = ensoData.summary || {};
  const karnataka = summary.karnataka_teleconnections || {};
  const elStats = karnataka.el_nino || {};
  const laStats = karnataka.la_nina || {};
  const neuStats = karnataka.neutral || {};

  const isWarm = latest.oni >= 0.5;
  const isCool = latest.oni <= -0.5;
  const statusColor = isWarm ? "var(--risk-critical)" : (isCool ? "var(--cyan)" : "var(--risk-normal)");
  const statusBadgeClass = isWarm ? "badge-critical" : (isCool ? "badge-cyan" : "badge-normal");

  main.innerHTML = `
    <!-- 1. Header Bar with Real Telemetry -->
    <div class="page-header">
      <div>
        <h1 class="page-title">El Niño & La Niña Climate Teleconnection Monitor</h1>
        <p class="page-description">
          Tropical Pacific sea surface temperature surveillance, NOAA Oceanic Niño Index (ONI v5) analysis, and multi-decadal teleconnection impacts across Karnataka's monsoonal and thermal dynamics.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <span class="badge badge-cyan">NOAA CPC ERSST.v5</span>
        <span class="badge ${statusBadgeClass}">LATEST: ${escapeHtml(latest.observation_period)} (${latest.anomaly_str})</span>
        <span class="badge ${statusBadgeClass}">${escapeHtml(latest.phase).toUpperCase()}</span>
        <span class="badge badge-normal">1950–2026 REANALYSIS</span>
      </div>
    </div>

    <!-- 2. Hero KPI Telemetry Strip -->
    <div class="grid grid-4" style="margin-bottom:20px">
      <!-- Latest Available Dataset Observation -->
      <div class="hero-kpi-card" style="border-color:${statusColor}">
        <div class="kpi-top">
          <span class="kpi-label">LATEST DATASET PERIOD</span>
          <div class="kpi-icon-pill" style="color:${statusColor}">📡</div>
        </div>
        <div class="kpi-value-row">
          <span class="kpi-value" style="color:${statusColor}">${latest.anomaly_str}</span>
          <span class="kpi-unit">ONI</span>
        </div>
        <div class="kpi-subtext" style="color:#fff">
          <strong>${escapeHtml(latest.observation_period)}</strong> (${escapeHtml(latest.season)}) — 
          <span style="color:${statusColor}; font-weight:600">${escapeHtml(latest.phase)}</span>
        </div>
      </div>

      <!-- El Niño Impact on Karnataka -->
      <div class="hero-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">EL NIÑO IMPACT (KARNATAKA)</span>
          <div class="kpi-icon-pill" style="color:var(--risk-warning)">🔥</div>
        </div>
        <div class="kpi-value-row">
          <span class="kpi-value" style="color:var(--risk-warning)">${elStats.mean_rainfall_mm_day || '3.12'}</span>
          <span class="kpi-unit">mm/day</span>
        </div>
        <div class="kpi-subtext">Avg temp: ${elStats.mean_temp_c || '21.6'}°C (Monsoon suppression / drought risk)</div>
      </div>

      <!-- La Niña Impact on Karnataka -->
      <div class="hero-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">LA NIÑA IMPACT (KARNATAKA)</span>
          <div class="kpi-icon-pill" style="color:var(--cyan)">🌊</div>
        </div>
        <div class="kpi-value-row">
          <span class="kpi-value" style="color:var(--cyan)">${laStats.mean_rainfall_mm_day || '3.84'}</span>
          <span class="kpi-unit">mm/day</span>
        </div>
        <div class="kpi-subtext">Avg temp: ${laStats.mean_temp_c || '21.2'}°C (Enhanced rainfall / flood risk)</div>
      </div>

      <!-- Historical Distribution -->
      <div class="hero-kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">76-YEAR RECORD (920 MOS)</span>
          <div class="kpi-icon-pill">📊</div>
        </div>
        <div class="kpi-value-row">
          <span class="kpi-value">${summary.total_months || 920}</span>
          <span class="kpi-unit">months</span>
        </div>
        <div class="kpi-subtext">
          🔥 ${summary.el_nino_percentage}% El Niño | 🌊 ${summary.la_nina_percentage}% La Niña | ⚖️ ${summary.neutral_percentage}% Neutral
        </div>
      </div>
    </div>

    <!-- 3. Interactive Filter and Selector Toolbar -->
    <div class="card" style="margin-bottom:20px; padding:16px 20px">
      <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:flex-end">
        <!-- Year Selector Dropdown -->
        <div style="flex:1; min-width:200px">
          <label class="form-label" for="ensoYearSelect">INSPECT SPECIFIC YEAR (1950–2026):</label>
          <select id="ensoYearSelect" class="form-control" style="font-weight:600; color:var(--cyan)">
            ${(ensoData.years_available || []).slice().reverse().map(y => `
              <option value="${y}" ${y === selectedYear ? "selected" : ""}>Year ${y} ${y === 2026 ? '(Latest Observation)' : ''}</option>
            `).join("")}
          </select>
        </div>

        <!-- Major Historical Episodes Quick Selector -->
        <div style="flex:1; min-width:240px">
          <label class="form-label" for="ensoEpisodeSelect">QUICK SELECT HISTORICAL EPISODE:</label>
          <select id="ensoEpisodeSelect" class="form-control">
            <option value="">-- Choose Historical Benchmark Event --</option>
            ${(ensoData.historical_events || []).map(ev => `
              <option value="${ev.period.split('–')[0].trim()}">${ev.period}: ${ev.phase} (${ev.peak_oni}, ${ev.severity})</option>
            `).join("")}
          </select>
        </div>

        <!-- Timeline Display Range -->
        <div>
          <label class="form-label">CHART TIMELINE RANGE:</label>
          <div style="display:flex; gap:6px">
            <button class="btn ${currentTimelineRange === 'all' ? 'btn-primary' : 'btn-secondary'} timeline-range-btn" data-range="all">1950–2026 (Full)</button>
            <button class="btn ${currentTimelineRange === 'last25' ? 'btn-primary' : 'btn-secondary'} timeline-range-btn" data-range="last25">2000–2026 (25Y)</button>
            <button class="btn ${currentTimelineRange === 'last10' ? 'btn-primary' : 'btn-secondary'} timeline-range-btn" data-range="last10">2015–2026 (10Y)</button>
          </div>
        </div>

        <!-- Phase Filter Buttons -->
        <div>
          <label class="form-label">PHASE HIGHLIGHT:</label>
          <div style="display:flex; gap:6px">
            <button class="btn ${currentPhaseFilter === 'all' ? 'btn-primary' : 'btn-secondary'} phase-filter-btn" data-phase="all">All</button>
            <button class="btn ${currentPhaseFilter === 'el_nino' ? 'btn-primary' : 'btn-secondary'} phase-filter-btn" data-phase="el_nino" style="color:#ef4444">El Niño</button>
            <button class="btn ${currentPhaseFilter === 'la_nina' ? 'btn-primary' : 'btn-secondary'} phase-filter-btn" data-phase="la_nina" style="color:#00f0ff">La Niña</button>
            <button class="btn ${currentPhaseFilter === 'neutral' ? 'btn-primary' : 'btn-secondary'} phase-filter-btn" data-phase="neutral" style="color:#10b981">Neutral</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. Selected Year Deep-Dive Grid -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:16px">
        <div>
          <div class="card-title">Monthly ONI Breakdown for Year <span id="displaySelectedYear" style="color:var(--cyan)">${selectedYear}</span></div>
          <div class="card-subtitle">Detailed 3-month running mean anomalies and phase classification thresholds (El Niño ≥ +0.5°C, La Niña ≤ -0.5°C):</div>
        </div>
        <div id="yearDominantBadge"></div>
      </div>
      <div id="monthlyYearGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:10px">
        <!-- Rendered dynamically -->
      </div>
    </div>

    <!-- 5. NOAA ONI Multi-Decadal Historical Trajectory Chart -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <div>
          <div class="card-title">NOAA Oceanic Niño Index (ONI) Multi-Decadal Trajectory (1950–2026)</div>
          <div class="card-subtitle">Tropical Pacific Niño 3.4 SST anomaly (°C) with official NOAA threshold reference boundaries:</div>
        </div>
        <div style="display:flex; gap:12px; font-size:11px; font-family:'JetBrains Mono',monospace; flex-wrap:wrap">
          <span style="color:#ef4444">■ El Niño (≥ +0.5°C)</span>
          <span style="color:#00f0ff">■ La Niña (≤ -0.5°C)</span>
          <span style="color:#10b981">■ Neutral Phase</span>
        </div>
      </div>
      <div style="height:320px; position:relative">
        <canvas id="oniTimelineCanvas"></canvas>
      </div>
    </div>

    <!-- 6. Historical Episodes & Teleconnection Science Matrix -->
    <div class="grid grid-2" style="margin-bottom:24px">
      <!-- Science & Physics Callout -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">ENSO Teleconnection Physics in Karnataka</div>
        </div>
        <div style="font-size:13px; line-height:1.7; color:var(--text-dim)">
          <p style="margin-bottom:12px">
            <strong>Atmospheric Walker Circulation:</strong> During an El Niño event, anomalous convective heating over the central and eastern tropical Pacific drives an anomalous Walker circulation cell, inducing anomalous atmospheric subsidence over peninsular India. This subsidence frequently impedes cross-equatorial monsoon surge development and depresses precipitation across Karnataka's Western Ghats and plateau river basins.
          </p>
          <p style="margin-bottom:12px">
            <strong>Seasonal Teleconnection vs Daily Variance:</strong> While historical seasonal rainfall during El Niño years in Karnataka shows an empirical deficit of ~14% to 22%, the daily correlation between instantaneous Pacific SST anomalies and localized thunderstorm precipitation is near zero (r ≈ 0.003). Local weather is strongly modulated by Arabian Sea cyclonic circulations, mid-tropospheric shear zones, and Western Ghats orographic uplifting.
          </p>
          <div style="background:rgba(8,17,29,0.7); padding:10px 14px; border-radius:6px; border-left:3px solid var(--cyan)">
            <strong>Scientific Boundary:</strong> The NOAA ONI index serves as a macro-climatic background risk state indicator. It provides directional probability weighting for drought and heat preparedness, not deterministic daily rain prediction.
          </div>
        </div>
      </div>

      <!-- Major Historical Benchmarks Table -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Major Historical Benchmarks (1950–2026)</div>
        </div>
        <div style="overflow-x:auto">
          <table class="command-table">
            <thead>
              <tr>
                <th>Episode</th>
                <th>Phase</th>
                <th>Peak Anomaly</th>
                <th>Monsoon / Thermal Impact</th>
              </tr>
            </thead>
            <tbody>
              ${(ensoData.historical_events || []).map(ev => {
                const isEl = ev.phase.includes("El");
                const bClass = isEl ? "badge-critical" : "badge-cyan";
                return `
                  <tr style="cursor:pointer" onclick="selectEnsoYear(${ev.period.split('–')[0].trim()})">
                    <td><strong style="color:#fff">${escapeHtml(ev.period)}</strong></td>
                    <td><span class="badge ${bClass}">${escapeHtml(ev.phase)}</span></td>
                    <td><span style="font-family:'JetBrains Mono',monospace; font-weight:700; color:${isEl ? '#ef4444' : '#00f0ff'}">${escapeHtml(ev.peak_oni)}</span></td>
                    <td style="font-size:11.5px; color:var(--text-dim)">${escapeHtml(ev.monsoon_impact)}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  renderSelectedYearBreakdown();
  initOniChart();
  bindEnsoEvents();
}

function renderSelectedYearBreakdown() {
  const container = document.getElementById("monthlyYearGrid");
  const yearLabel = document.getElementById("displaySelectedYear");
  const badgeContainer = document.getElementById("yearDominantBadge");
  if (!container || !ensoData) return;

  if (yearLabel) yearLabel.textContent = selectedYear;

  // Filter months for selected year from full timeline
  const fullTimeline = ensoData.full_timeline || ensoData.timeline || [];
  const yearMonths = fullTimeline.filter(m => m.year === selectedYear);

  if (yearMonths.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-dim)">No monthly records found for year ${selectedYear}.</div>`;
    return;
  }

  // Calculate year summary
  const avgOni = yearMonths.reduce((sum, m) => sum + m.oni, 0) / yearMonths.length;
  let domPhase = "Neutral";
  let domBadge = "badge-normal";
  if (avgOni >= 0.5) {
    domPhase = "El Niño Dominant";
    domBadge = "badge-critical";
  } else if (avgOni <= -0.5) {
    domPhase = "La Niña Dominant";
    domBadge = "badge-cyan";
  }

  if (badgeContainer) {
    badgeContainer.innerHTML = `
      <span class="badge ${domBadge}">Year Average: ${avgOni >= 0 ? '+' : ''}${avgOni.toFixed(2)}°C (${domPhase})</span>
    `;
  }

  container.innerHTML = yearMonths.map(m => {
    const isEl = m.oni >= 0.5;
    const isLa = m.oni <= -0.5;
    const color = isEl ? "#ef4444" : (isLa ? "#00f0ff" : "#10b981");
    const bg = isEl ? "rgba(239, 68, 68, 0.12)" : (isLa ? "rgba(0, 240, 255, 0.12)" : "rgba(16, 185, 129, 0.08)");
    const badge = isEl ? "badge-critical" : (isLa ? "badge-cyan" : "badge-normal");

    return `
      <div style="background:${bg}; border:1px solid ${color}; border-radius:6px; padding:10px 12px; text-align:center">
        <div style="font-size:12px; font-weight:700; color:#fff">${escapeHtml(m.month_name)}</div>
        <div style="font-size:10px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">${escapeHtml(m.season)}</div>
        <div style="font-size:18px; font-weight:700; color:${color}; font-family:'JetBrains Mono',monospace; margin:4px 0">
          ${m.oni >= 0 ? '+' : ''}${Number(m.oni).toFixed(2)}°C
        </div>
        <div>
          <span class="badge ${badge}" style="font-size:9.5px; padding:2px 6px">${escapeHtml(m.phase)}</span>
        </div>
      </div>
    `;
  }).join("");
}

function initOniChart() {
  const ctx = document.getElementById("oniTimelineCanvas");
  if (!ctx || !ensoData) return;

  if (ensoChart) {
    ensoChart.destroy();
    ensoChart = null;
  }

  const fullTimeline = ensoData.full_timeline || ensoData.timeline || [];

  // Filter based on range
  let displayedTimeline = fullTimeline;
  if (currentTimelineRange === "last25") {
    displayedTimeline = fullTimeline.filter(m => m.year >= 2001);
  } else if (currentTimelineRange === "last10") {
    displayedTimeline = fullTimeline.filter(m => m.year >= 2016);
  }

  // Filter based on phase highlight if not 'all'
  const labels = displayedTimeline.map(m => `${m.month_name.slice(0, 3)} ${m.year}`);
  const onis = displayedTimeline.map(m => m.oni);

  // Determine bar colors
  const backgroundColors = displayedTimeline.map(m => {
    if (currentPhaseFilter === "el_nino" && m.oni < 0.5) return "rgba(255, 255, 255, 0.05)";
    if (currentPhaseFilter === "la_nina" && m.oni > -0.5) return "rgba(255, 255, 255, 0.05)";
    if (currentPhaseFilter === "neutral" && (m.oni >= 0.5 || m.oni <= -0.5)) return "rgba(255, 255, 255, 0.05)";

    if (m.oni >= 0.5) return "rgba(239, 68, 68, 0.8)";
    if (m.oni <= -0.5) return "rgba(0, 240, 255, 0.8)";
    return "rgba(16, 185, 129, 0.5)";
  });

  const borderColors = displayedTimeline.map(m => {
    if (m.oni >= 0.5) return "#ef4444";
    if (m.oni <= -0.5) return "#00f0ff";
    return "#10b981";
  });

  ensoChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "ONI SST Anomaly (°C)",
          data: onis,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => {
              const idx = items[0].dataIndex;
              const d = displayedTimeline[idx];
              return `${d.month_name} ${d.year} (${d.season})`;
            },
            label: context => {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              const phase = val >= 0.5 ? "El Niño Phase" : (val <= -0.5 ? "La Niña Phase" : "Neutral Phase");
              return ` ONI: ${sign}${val.toFixed(2)}°C (${phase})`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#94a3b8",
            maxTicksLimit: currentTimelineRange === "all" ? 25 : 15,
            font: { family: "JetBrains Mono", size: 10 },
          },
          grid: { color: "rgba(255, 255, 255, 0.04)" },
        },
        y: {
          min: -2.5,
          max: 3.0,
          ticks: {
            color: "#94a3b8",
            callback: v => `${v >= 0 ? '+' : ''}${v}°C`,
            font: { family: "JetBrains Mono" },
          },
          title: {
            display: true,
            text: "Niño 3.4 SST Anomaly (°C)",
            color: "#00f0ff",
            font: { family: "Outfit", size: 12 },
          },
          grid: {
            color: context => {
              if (context.tick.value === 0.5) return "rgba(239, 68, 68, 0.35)";
              if (context.tick.value === -0.5) return "rgba(0, 240, 255, 0.35)";
              if (context.tick.value === 0.0) return "rgba(255, 255, 255, 0.2)";
              return "rgba(255, 255, 255, 0.04)";
            },
          },
        },
      },
    },
  });
}

function selectEnsoYear(year) {
  selectedYear = parseInt(year);
  const select = document.getElementById("ensoYearSelect");
  if (select) select.value = selectedYear;
  renderSelectedYearBreakdown();
}

function bindEnsoEvents() {
  // Year selector
  const yearSelect = document.getElementById("ensoYearSelect");
  if (yearSelect) {
    yearSelect.addEventListener("change", e => {
      selectEnsoYear(e.target.value);
    });
  }

  // Episode selector
  const epSelect = document.getElementById("ensoEpisodeSelect");
  if (epSelect) {
    epSelect.addEventListener("change", e => {
      if (e.target.value) {
        selectEnsoYear(e.target.value);
      }
    });
  }

  // Timeline range buttons
  document.querySelectorAll(".timeline-range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentTimelineRange = btn.dataset.range;
      document.querySelectorAll(".timeline-range-btn").forEach(b => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-secondary");
      });
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
      initOniChart();
    });
  });

  // Phase filter buttons
  document.querySelectorAll(".phase-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentPhaseFilter = btn.dataset.phase;
      document.querySelectorAll(".phase-filter-btn").forEach(b => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-secondary");
      });
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
      initOniChart();
    });
  });
}

// Global invocation
renderEnsoMonitor();
