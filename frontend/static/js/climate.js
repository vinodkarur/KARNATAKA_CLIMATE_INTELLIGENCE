/* ==========================================================================
   climate.js — Weather Intelligence & ENSO Teleconnection Analysis
   ========================================================================== */

async function renderClimateAnalysis() {
  const main = layout("climate");
  main.innerHTML = `<p class="muted">Loading Karnataka climate trends and NOAA ONI teleconnections...</p>`;

  try {
    const data = await api("/api/dashboard");
    const s = data.summary || {};
    const enso = data.enso || [];
    const yearly = data.yearly || {};
    const monthly = data.monthly || {};

    main.innerHTML = `
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Weather Intelligence &amp; ENSO Teleconnection Analysis</h1>
          <p class="page-description">
            44-year continuous Karnataka meteorological records (1981–2024) integrated with NOAA Oceanic Niño Index (ONI) phase variations.
            Analyzes macro-scale Pacific SST anomalies and regional seasonal precipitation shifts.
          </p>
        </div>
        <div class="badge badge-cyan" style="font-size:12px">1981–2024 • 16,071 DAILY RECORDS</div>
      </div>

      <!-- Historical Extreme Summary Cards -->
      <section class="grid grid-4" style="margin-bottom:20px">
        <article class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">HOTTEST DAY ON RECORD</span>
            <span class="kpi-icon-pill">🔥</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#ef4444">${s.hottest_day.temperature}</span>
            <span class="kpi-unit">°C</span>
          </div>
          <div class="kpi-subtext">
            <span>Date: ${s.hottest_day.date}</span>
            <span class="badge badge-critical" style="margin-left:auto">${s.hottest_day.condition}</span>
          </div>
        </article>

        <article class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">MAX SINGLE-DAY RAINFALL</span>
            <span class="kpi-icon-pill">🌊</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#00f0ff">${s.wettest_day.rainfall}</span>
            <span class="kpi-unit">mm</span>
          </div>
          <div class="kpi-subtext">
            <span>Date: ${s.wettest_day.date}</span>
            <span class="badge badge-cyan" style="margin-left:auto">${s.wettest_day.condition}</span>
          </div>
        </article>

        <article class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">LONG-TERM MEAN TEMP</span>
            <span class="kpi-icon-pill">🌡️</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#38bdf8">${s.mean_temperature}</span>
            <span class="kpi-unit">°C</span>
          </div>
          <div class="kpi-subtext">
            <span>Min: ${s.min_temperature}°C | Max: ${s.max_temperature}°C</span>
          </div>
        </article>

        <article class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">CONTINUOUS OBSERVATIONS</span>
            <span class="kpi-icon-pill">📊</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#00e5bc">${s.records.toLocaleString()}</span>
            <span class="kpi-unit">DAYS</span>
          </div>
          <div class="kpi-subtext">
            <span>1981-01-01 to 2024-12-30</span>
          </div>
        </article>
      </section>

      <!-- ENSO Phase Comparative Cards -->
      <div class="card-header" style="margin-bottom:12px">
        <div>
          <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
            PACIFIC BASIN TELECONNECTION PHASES
          </div>
          <h2 class="card-title" style="margin-top:2px">Comparative Climate State by ENSO Phase (NOAA ONI)</h2>
        </div>
        <span class="badge badge-cyan">3.4 REGION SST</span>
      </div>

      <section class="grid grid-3" style="margin-bottom:20px">
        ${enso.map((e) => {
          const isElNino = e.condition.includes("Niño") || e.condition.includes("El");
          const isLaNina = e.condition.includes("Niña") || e.condition.includes("La");
          const color = isElNino ? "#f97316" : isLaNina ? "#00e5bc" : "#38bdf8";

          return `
            <article class="card" style="border-top:3px solid ${color}">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                <h3 style="margin:0; font-size:18px; color:#fff">${e.condition}</h3>
                <span class="badge" style="background:${color}22; color:${color}; border:1px solid ${color}55">${e.percentage}% of Days</span>
              </div>
              <p style="font-size:12px; color:var(--text-muted); margin:0 0 12px">
                Total observed: <b style="color:#fff">${e.days.toLocaleString()} days</b>
              </p>
              <div class="grid grid-2" style="gap:8px">
                <div style="background:rgba(8,17,29,0.7); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle)">
                  <div style="font-size:10px; color:var(--text-muted)">MEAN TEMPERATURE</div>
                  <div style="font-size:18px; font-weight:700; font-family:'JetBrains Mono'; color:#00f0ff">${e.mean_temperature} °C</div>
                </div>
                <div style="background:rgba(8,17,29,0.7); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle)">
                  <div style="font-size:10px; color:var(--text-muted)">DAILY MEAN RAINFALL</div>
                  <div style="font-size:18px; font-weight:700; font-family:'JetBrains Mono'; color:#00e5bc">${e.mean_rainfall} mm</div>
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </section>

      <!-- Charts Section -->
      <section class="grid grid-2" style="margin-bottom:20px">
        <article class="card">
          <div class="card-header">
            <h3 class="card-title">Yearly Mean Temperature &amp; Rainfall Trends (1981–2024)</h3>
            <span class="badge badge-cyan">44 YEARS</span>
          </div>
          <canvas id="yearlyChart" height="210"></canvas>
        </article>

        <article class="card">
          <div class="card-header">
            <h3 class="card-title">Monthly Seasonal Climatology (Statewide Averages)</h3>
            <span class="badge badge-normal">12 MONTHS</span>
          </div>
          <canvas id="monthlyChart" height="210"></canvas>
        </article>
      </section>

      <!-- NOAA ONI Anomaly Timeline Chart -->
      <section class="card" style="margin-bottom:20px">
        <div class="card-header">
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
              NOAA OCEANIC NIÑO INDEX TIMELINE (1950–2026)
            </div>
            <h3 class="card-title" style="margin-top:2px">SST Anomaly Trajectory &amp; Historical Thresholds (±0.5 °C)</h3>
          </div>
          <span class="badge badge-warning">NIÑO 3.4 SATELLITE &amp; BUOY</span>
        </div>
        <canvas id="oniTimelineChart" height="120"></canvas>
      </section>

      <!-- Scientific Teleconnection Disclaimer -->
      <div class="scientific-disclaimer-box">
        <strong>Teleconnection Grounding:</strong> ENSO modulates large-scale tropical walker circulation, jet streams, and Indian Ocean Dipole (IOD) interactions. However, Karnataka’s localized weather is shaped by the Western Ghats orographic barrier, coastal troughs, and Bay of Bengal cyclonic systems. The system strictly analyzes statistical associations and does not assert determinism.
      </div>
    `;

    // Initialize Charts
    initClimateCharts(data);

  } catch (err) {
    main.innerHTML = `<div class="card"><h2 style="color:var(--risk-critical)">Error Loading Climate Analytics</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function initClimateCharts(data) {
  const yearly = data.yearly || {};
  const monthly = data.monthly || {};
  const oniRecent = data.oni_recent || {};

  // Yearly Dual Axis
  const ctxYearly = document.getElementById("yearlyChart");
  if (ctxYearly) {
    new Chart(ctxYearly, {
      type: "line",
      data: {
        labels: yearly.year || [],
        datasets: [
          {
            label: "Mean Temperature (°C)",
            data: yearly.mean_temperature || [],
            borderColor: "#00f0ff",
            backgroundColor: "rgba(0, 240, 255, 0.08)",
            yAxisID: "yTemp",
            tension: 0.25,
            fill: true,
            pointRadius: 2,
          },
          {
            label: "Total Rainfall (mm)",
            data: yearly.total_rainfall || [],
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
            ticks: { color: "#00f0ff" },
            title: { display: true, text: "Temp (°C)", color: "#00f0ff" },
            grid: { color: "rgba(56, 189, 248, 0.08)" },
          },
          yRain: {
            type: "linear",
            position: "right",
            ticks: { color: "#00e5bc" },
            title: { display: true, text: "Rainfall (mm)", color: "#00e5bc" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  // Monthly Cycle
  const ctxMonthly = document.getElementById("monthlyChart");
  if (ctxMonthly) {
    new Chart(ctxMonthly, {
      type: "bar",
      data: {
        labels: monthly.month_name || ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
        datasets: [
          {
            label: "Mean Daily Rainfall (mm)",
            data: monthly.mean_rainfall || [],
            backgroundColor: "rgba(0, 229, 188, 0.6)",
            borderColor: "#00e5bc",
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: "yRain",
          },
          {
            label: "Mean Temp (°C)",
            data: monthly.mean_temperature || [],
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.1)",
            type: "line",
            tension: 0.3,
            yAxisID: "yTemp",
            pointRadius: 3,
          },
        ],
      },
      options: {
        ...chartDefaults(),
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(56, 189, 248, 0.05)" } },
          yRain: {
            type: "linear",
            position: "left",
            ticks: { color: "#00e5bc" },
            title: { display: true, text: "Rainfall (mm)", color: "#00e5bc" },
            grid: { color: "rgba(56, 189, 248, 0.08)" },
          },
          yTemp: {
            type: "linear",
            position: "right",
            ticks: { color: "#f59e0b" },
            title: { display: true, text: "Temp (°C)", color: "#f59e0b" },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  // NOAA ONI Timeline
  const ctxOni = document.getElementById("oniTimelineChart");
  if (ctxOni && oniRecent.date) {
    const dates = oniRecent.date || [];
    const values = oniRecent.oni || [];

    new Chart(ctxOni, {
      type: "line",
      data: {
        labels: dates,
        datasets: [
          {
            label: "ONI SST Anomaly (°C)",
            data: values,
            borderColor: "#f59e0b",
            borderWidth: 2,
            tension: 0.25,
            pointRadius: 0,
            fill: {
              target: { value: 0 },
              above: "rgba(249, 115, 22, 0.2)",
              below: "rgba(0, 229, 188, 0.2)",
            },
          },
        ],
      },
      options: {
        ...chartDefaults(),
        scales: {
          x: { ticks: { color: "#64748b", maxTicksLimit: 12 }, grid: { color: "rgba(56, 189, 248, 0.05)" } },
          y: {
            ticks: { color: "#94a3b8" },
            title: { display: true, text: "ONI Anomaly (°C)", color: "#94a3b8" },
            grid: { color: "rgba(56, 189, 248, 0.08)" },
          },
        },
      },
    });
  }
}

document.addEventListener("DOMContentLoaded", renderClimateAnalysis);
