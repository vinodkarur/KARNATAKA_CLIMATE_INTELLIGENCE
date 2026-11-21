/* ==========================================================================
   drought.js — Drought Risk & Agricultural Water Security Assessment
   ========================================================================== */

async function renderDrought() {
  const main = layout("drought");
  main.innerHTML = `<p class="muted">Loading agricultural drought and moisture deficit telemetry...</p>`;

  try {
    const [dashData, districtData, droughtData] = await Promise.all([
      api("/api/dashboard"),
      api("/api/district"),
      api("/api/drought-thresholds"),
    ]);

    const summary = dashData.summary || {};
    const monthly = dashData.monthly || {};
    const ensoList = dashData.enso || [];
    const districts = districtData.districts || [];
    const rolling = droughtData.rolling_30d_rainfall_percentiles || {};

    const elNinoRow = ensoList.find((row) => String(row.condition).includes("El"));
    const laNinaRow = ensoList.find((row) => String(row.condition).includes("La"));
    const sorted = [...districts].sort((a, b) => (a.mean_daily || 0) - (b.mean_daily || 0));

    main.innerHTML = `
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Drought Risk &amp; Agricultural Water Security</h1>
          <p class="page-description">
            Analysis of regional rainfall deficits, trailing 30-day moisture anomalies, and historical low-rainfall percentiles.
            Evaluates agricultural vulnerability across 25 Karnataka district gauges.
          </p>
        </div>
        <div class="badge badge-warning" style="font-size:12px">TRAILING 30-DAY MOISTURE METRICS</div>
      </div>

      <!-- KPI Summary Cards -->
      <section class="grid grid-4" style="margin-bottom:20px">
        <article class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">STATEWIDE DAILY MEAN</span>
            <span class="kpi-icon-pill">🌧️</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#00e5bc">${summary.mean_rainfall || "3.42"}</span>
            <span class="kpi-unit">mm</span>
          </div>
          <div class="kpi-subtext">44-year historical average (1981–2024)</div>
        </article>

        <article class="hero-kpi-card" style="border-left:4px solid var(--risk-critical)">
          <div class="kpi-top">
            <span class="kpi-label">DRIEST GAUGE DISTRICT</span>
            <span class="badge badge-critical">HIGH RISK</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#ef4444; font-size:22px">${escapeHtml(sorted[0]?.District || "Bagalkot")}</span>
          </div>
          <div class="kpi-subtext">Mean: <b>${Number(sorted[0]?.mean_daily || 0).toFixed(2)} mm/day</b></div>
        </article>

        <article class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">WETTEST GAUGE DISTRICT</span>
            <span class="badge badge-normal">LOW RISK</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#00f0ff; font-size:22px">${escapeHtml(sorted[sorted.length-1]?.District || "Udupi")}</span>
          </div>
          <div class="kpi-subtext">Mean: <b>${Number(sorted[sorted.length-1]?.mean_daily||0).toFixed(2)} mm/day</b></div>
        </article>

        <article class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">EL NIÑO DROUGHT IMPACT</span>
            <span class="badge badge-warning">TELECONN</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="color:#f59e0b">${elNinoRow ? Number(elNinoRow.mean_rainfall).toFixed(2) : "4.59"}</span>
            <span class="kpi-unit">mm</span>
          </div>
          <div class="kpi-subtext">Historical El Niño phase mean daily rainfall</div>
        </article>
      </section>

      <!-- 30-Day Deficit Benchmarks & Driest Districts Grid -->
      <section class="grid grid-2" style="margin-bottom:20px">
        <article class="card">
          <div class="card-header">
            <h3 class="card-title">Historical 30-Day Cumulative Deficit Percentiles</h3>
            <span class="badge badge-cyan">THRESHOLD GAUGE</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px; margin-top:8px">
            <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); padding:10px 14px; border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center">
              <div>
                <strong style="color:#ef4444">High Drought Risk (P10 Threshold)</strong>
                <div style="font-size:11px; color:var(--text-muted)">Severe moisture deficit triggering agricultural contingency</div>
              </div>
              <span style="font-size:18px; font-weight:700; font-family:'JetBrains Mono'; color:#ef4444">&le; ${rolling.P10 || "0.0"} mm</span>
            </div>

            <div style="background:rgba(249,115,22,0.1); border:1px solid rgba(249,115,22,0.3); padding:10px 14px; border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center">
              <div>
                <strong style="color:#f97316">Moderate Drought Risk (P25 Threshold)</strong>
                <div style="font-size:11px; color:var(--text-muted)">Noticeable rainfall deficit; activate micro-irrigation</div>
              </div>
              <span style="font-size:18px; font-weight:700; font-family:'JetBrains Mono'; color:#f97316">&le; ${rolling.P25 || "0.08"} mm</span>
            </div>

            <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); padding:10px 14px; border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center">
              <div>
                <strong style="color:#10b981">Low Drought Risk (&gt; P25)</strong>
                <div style="font-size:11px; color:var(--text-muted)">Standard moisture balance within seasonal normal</div>
              </div>
              <span style="font-size:18px; font-weight:700; font-family:'JetBrains Mono'; color:#10b981">&gt; ${rolling.P25 || "0.08"} mm</span>
            </div>
          </div>
        </article>

        <!-- Driest Districts Table -->
        <article class="card">
          <div class="card-header">
            <h3 class="card-title">Top 5 Most Drought-Vulnerable Districts (IMD Record)</h3>
            <span class="badge badge-warning">LOWEST MEAN DAILY</span>
          </div>
          <div style="overflow-x:auto">
            <table class="command-table">
              <thead>
                <tr>
                  <th>District Name</th>
                  <th>Mean Daily (mm)</th>
                  <th>Drought Risk</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${sorted.slice(0, 5).map(d => `
                  <tr>
                    <td><strong style="color:#fff">${escapeHtml(d.District)}</strong></td>
                    <td style="font-family:'JetBrains Mono', monospace; color:#00e5bc">${Number(d.mean_daily).toFixed(2)} mm</td>
                    <td>${getRiskBadge(d.drought_risk)}</td>
                    <td><a href="/district?search=${encodeURIComponent(d.District)}" class="btn btn-secondary" style="padding:2px 8px; font-size:11px">Inspect</a></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <!-- Scientific Grounding Disclaimer -->
      <div class="scientific-disclaimer-box">
        <strong>Hydrological Caveat:</strong> Drought risk classifications here are <em>relative statistical indicators</em> derived from empirical historical rainfall percentiles. They are <em>not</em> official IMD or KSNDMC statutory drought declarations. Comprehensive drought assessment incorporates soil moisture, satellite NDVI indices, and reservoir storage levels beyond this atmospheric dataset.
      </div>
    `;

  } catch (err) {
    main.innerHTML = `<div class="card"><h2 style="color:var(--risk-critical)">Error Loading Drought Intelligence</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

document.addEventListener("DOMContentLoaded", renderDrought);
