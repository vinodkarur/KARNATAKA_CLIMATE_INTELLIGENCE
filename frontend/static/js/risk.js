/* ==========================================================================
   risk.js — Urban Heat Risk & Thermal Hazard Assessment
   ========================================================================== */

async function renderRisk() {
  const main = layout("risk");
  main.innerHTML = `<p class="muted">Loading urban heat risk and thermal percentiles analysis...</p>`;

  try {
    const [threshData, dashData] = await Promise.all([
      api("/api/risk-thresholds"),
      api("/api/dashboard"),
    ]);

    const th = threshData.thresholds || {};
    const tDist = threshData.temperature_distribution || {};
    const tPct = threshData.temperature_percentiles || {};
    const rPct = threshData.rainfall_percentiles || {};
    const monthly = dashData.monthly || {};

    main.innerHTML = `
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Urban Heat Risk &amp; Thermal Hazard Assessment</h1>
          <p class="page-description">
            Empirical percentile-based risk classification derived from 44 years of continuous daily Karnataka observations (1981–2024).
            Categorizes thermal stress into actionable municipal operational tiers.
          </p>
        </div>
        <div class="badge badge-warning" style="font-size:12px">HISTORICAL P50 / P75 / P90 THRESHOLDS</div>
      </div>

      <!-- Threshold Reference Cards Grid -->
      <section class="grid grid-4" style="margin-bottom:20px">
        <article class="hero-kpi-card" style="border-left:4px solid var(--risk-normal)">
          <div class="kpi-top">
            <span class="kpi-label">LOW HEAT RISK (&lt; P50)</span>
            <span class="badge badge-normal">&lt; ${tPct.P50 || "21.32"} °C</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#10b981">${tDist.Low || 50.0}%</span>
            <span class="kpi-unit">OF DAYS</span>
          </div>
          <div class="kpi-subtext">Baseline seasonal range; standard urban cooling maintenance.</div>
        </article>

        <article class="hero-kpi-card" style="border-left:4px solid var(--risk-advisory)">
          <div class="kpi-top">
            <span class="kpi-label">MODERATE HEAT (P50–P75)</span>
            <span class="badge badge-advisory">${tPct.P50 || "21.32"}–${tPct.P75 || "23.89"} °C</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#eab308">${tDist.Moderate || 25.0}%</span>
            <span class="kpi-unit">OF DAYS</span>
          </div>
          <div class="kpi-subtext">Enhanced hydration advisory; monitor transit shelters and classrooms.</div>
        </article>

        <article class="hero-kpi-card" style="border-left:4px solid var(--risk-warning)">
          <div class="kpi-top">
            <span class="kpi-label">HIGH HEAT RISK (P75–P90)</span>
            <span class="badge badge-warning">${tPct.P75 || "23.89"}–${tPct.P90 || "24.83"} °C</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#f97316">${tDist.High || 15.0}%</span>
            <span class="kpi-unit">OF DAYS</span>
          </div>
          <div class="kpi-subtext">Mandatory hydration breaks for gig workers; irrigate urban canopy.</div>
        </article>

        <article class="hero-kpi-card" style="border-left:4px solid var(--risk-critical)">
          <div class="kpi-top">
            <span class="kpi-label">VERY HIGH RISK (&gt; P90)</span>
            <span class="badge badge-critical">&gt; ${tPct.P90 || "24.83"} °C</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#ef4444">${tDist["Very High"] || 10.0}%</span>
            <span class="kpi-unit">OF DAYS</span>
          </div>
          <div class="kpi-subtext">Activate Heat Action Plan (HAP); cooling centers; shift outdoor shifts.</div>
        </article>
      </section>

      <!-- Charts Section -->
      <section class="grid grid-2" style="margin-bottom:20px">
        <article class="card">
          <div class="card-header">
            <h3 class="card-title">Historical Daily Observation Distribution by Heat Tier</h3>
            <span class="badge badge-cyan">44-YR SHARE</span>
          </div>
          <canvas id="heatTierPieChart" height="210"></canvas>
        </article>

        <article class="card">
          <div class="card-header">
            <h3 class="card-title">Monthly Mean Temperature Climatology &amp; Risk Envelope</h3>
            <span class="badge badge-warning">SEASONAL PROFILE</span>
          </div>
          <canvas id="monthlyTempProfileChart" height="210"></canvas>
        </article>
      </section>

      <!-- Scientific Percentile Framework Box -->
      <div class="scientific-disclaimer-box">
        <strong>Percentile Methodology:</strong> Risk tiers are anchored to the 50th, 75th, and 90th percentiles of Karnataka’s statewide historical record. Because continuous daily relative humidity was not available in the state-level meteorological record, the Heat Stress Score serves as a temperature-only proxy ($(T - 15) / 25 \times 100$). It represents relative empirical extremity rather than a clinical biometric index.
      </div>
    `;

    // Render Charts
    initRiskCharts(tDist, monthly, tPct);

  } catch (err) {
    main.innerHTML = `<div class="card"><h2 style="color:var(--risk-critical)">Error Loading Risk Assessment</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function initRiskCharts(tDist, monthly, tPct) {
  const ctxPie = document.getElementById("heatTierPieChart");
  if (ctxPie) {
    new Chart(ctxPie, {
      type: "doughnut",
      data: {
        labels: ["Low (<P50)", "Moderate (P50-P75)", "High (P75-P90)", "Very High (>P90)"],
        datasets: [{
          data: [tDist.Low || 50, tDist.Moderate || 25, tDist.High || 15, tDist["Very High"] || 10],
          backgroundColor: ["#10b981", "#eab308", "#f97316", "#ef4444"],
          borderColor: "#0d1a2d",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "right", labels: { color: "#94a3b8", font: { family: "Outfit" } } },
        },
      },
    });
  }

  const ctxMonthly = document.getElementById("monthlyTempProfileChart");
  if (ctxMonthly && monthly.month_name) {
    new Chart(ctxMonthly, {
      type: "line",
      data: {
        labels: monthly.month_name,
        datasets: [
          {
            label: "Mean Temperature (°C)",
            data: monthly.mean_temperature,
            borderColor: "#00f0ff",
            backgroundColor: "rgba(0, 240, 255, 0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
          },
        ],
      },
      options: {
        ...chartDefaults(),
        scales: {
          x: { ticks: { color: "#64748b" }, grid: { color: "rgba(56, 189, 248, 0.05)" } },
          y: {
            ticks: { color: "#00f0ff" },
            title: { display: true, text: "Temperature (°C)", color: "#00f0ff" },
            grid: { color: "rgba(56, 189, 248, 0.08)" },
          },
        },
      },
    });
  }
}

document.addEventListener("DOMContentLoaded", renderRisk);
