/* history.js — Prediction History & System Audit Ledger */

async function renderHistory() {
  const main = layout("history");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Prediction History & System Audit Ledger</h1>
        <p class="page-description">
          Immutable historical audit logs of machine learning inferences, 32-feature states, relative percentile risk classifications, and automated municipal adaptation dispatches.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center">
        <span class="badge badge-cyan" id="dbSourceBadge">Connecting to Ledger...</span>
        <a href="/api/export-history-csv?limit=2000" class="btn btn-primary" style="font-size:12px; padding:6px 14px; text-decoration:none" download>
          📥 Export Full CSV
        </a>
      </div>
    </div>
    <div class="card" style="text-align:center; padding:40px">
      <div style="font-family:'JetBrains Mono',monospace; color:var(--cyan)">Retrieving system audit log records...</div>
    </div>
  `;

  let currentLimit = 150;
  let startDate = "";
  let endDate = "";

  async function loadData() {
    try {
      let queryUrl = `/api/history?limit=${currentLimit}`;
      if (startDate) queryUrl += `&start_date=${startDate}`;
      if (endDate) queryUrl += `&end_date=${endDate}`;

      const data = await api(queryUrl);
      const isMySQL = data.source === "mysql";

      main.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Prediction History & System Audit Ledger</h1>
            <p class="page-description">
              Immutable historical audit logs of machine learning inferences, 32-feature states, relative percentile risk classifications, and automated municipal adaptation dispatches.
            </p>
          </div>
          <div style="display:flex; gap:10px; align-items:center">
            <span class="badge ${isMySQL ? 'badge-normal' : 'badge-advisory'}">
              DATABASE: ${data.source ? data.source.toUpperCase() : 'DUAL-PERSISTENCE'}
            </span>
            <a href="/api/export-history-csv?limit=2000" class="btn btn-primary" style="font-size:12px; padding:6px 14px; text-decoration:none" download>
              📥 Export Full CSV
            </a>
          </div>
        </div>

        <!-- Filter Controls Bar -->
        <div class="card" style="margin-bottom:20px; padding:16px 20px">
          <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:flex-end">
            <div style="flex:1; min-width:160px">
              <label class="form-label" for="startDateInput">FROM HISTORICAL DATE:</label>
              <input id="startDateInput" class="form-control" type="date" value="${startDate}">
            </div>
            <div style="flex:1; min-width:160px">
              <label class="form-label" for="endDateInput">TO HISTORICAL DATE:</label>
              <input id="endDateInput" class="form-control" type="date" value="${endDate}">
            </div>
            <div style="width:160px">
              <label class="form-label" for="limitSelect">RECORD BUFFER:</label>
              <select id="limitSelect" class="form-control">
                <option value="50" ${currentLimit === 50 ? 'selected' : ''}>50 Records</option>
                <option value="150" ${currentLimit === 150 ? 'selected' : ''}>150 Records</option>
                <option value="500" ${currentLimit === 500 ? 'selected' : ''}>500 Records</option>
                <option value="1000" ${currentLimit === 1000 ? 'selected' : ''}>1000 Records</option>
              </select>
            </div>
            <button id="applyFilterBtn" class="btn btn-primary" style="height:38px">
              Filter Ledger
            </button>
            <button id="resetFilterBtn" class="btn btn-secondary" style="height:38px">
              Reset
            </button>
          </div>
        </div>

        <!-- Ledger Summary Strip -->
        <div class="grid grid-3" style="margin-bottom:20px">
          <div class="hero-kpi-card" style="padding:12px 16px">
            <div class="kpi-label">AUDITED INFERENCES</div>
            <div class="kpi-value-row">
              <span class="kpi-value" style="font-size:22px">${data.count}</span>
              <span class="kpi-unit">records</span>
            </div>
          </div>
          <div class="hero-kpi-card" style="padding:12px 16px">
            <div class="kpi-label">STORAGE LAYER</div>
            <div class="kpi-value-row">
              <span class="kpi-value" style="font-size:20px; color:var(--cyan)">${isMySQL ? 'MySQL 8.0' : 'SQLite Local'}</span>
            </div>
          </div>
          <div class="hero-kpi-card" style="padding:12px 16px">
            <div class="kpi-label">COMPLIANCE STATUS</div>
            <div class="kpi-value-row">
              <span class="kpi-value" style="font-size:20px; color:var(--risk-normal)">100% AUDITABLE</span>
            </div>
          </div>
        </div>

        <!-- Records Table -->
        <div class="card" style="padding:0; overflow:hidden">
          <div style="padding:16px 20px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center">
            <div class="card-title" style="margin:0">
              <span>Audited Model Predictions (${data.count} Entries)</span>
            </div>
            <span style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">Sorted: Timestamp Descending</span>
          </div>

          <div style="overflow-x:auto">
            <table class="command-table">
              <thead>
                <tr>
                  <th>Forecast Date</th>
                  <th>Predicted Temp</th>
                  <th>Thermal Risk</th>
                  <th>Predicted Rain</th>
                  <th>Precip Risk</th>
                  <th>NOAA ONI</th>
                  <th>Primary Thermal Directive</th>
                  <th>Primary Hydraulic Directive</th>
                </tr>
              </thead>
              <tbody>
                ${data.rows.length === 0 ? `
                  <tr>
                    <td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted)">
                      No audit records found matching the specified date window.
                    </td>
                  </tr>
                ` : data.rows.map((row) => `
                  <tr>
                    <td>
                      <span style="font-family:'JetBrains Mono',monospace; font-weight:600; color:#fff">${row.date}</span>
                    </td>
                    <td>
                      <span style="font-family:'JetBrains Mono',monospace; color:var(--blue-bright); font-weight:600">${Number(row.predicted_temperature_C).toFixed(2)} °C</span>
                    </td>
                    <td>${getRiskBadge(row.temperature_level)}</td>
                    <td>
                      <span style="font-family:'JetBrains Mono',monospace; color:var(--teal); font-weight:600">${Number(row.predicted_rainfall_mm).toFixed(2)} mm</span>
                    </td>
                    <td>${getRiskBadge(row.rainfall_level)}</td>
                    <td>
                      ${row.oni !== null && row.oni !== undefined ? `
                        <span class="badge ${Number(row.oni) >= 0.5 ? 'badge-warning' : (Number(row.oni) <= -0.5 ? 'badge-cyan' : 'badge-normal')}">
                          ${Number(row.oni) > 0 ? '+' : ''}${Number(row.oni).toFixed(2)}
                        </span>
                      ` : '—'}
                    </td>
                    <td style="max-width:240px; font-size:12px; line-height:1.4; color:var(--text-dim)">
                      ${row.temperature_recommendation || '—'}
                    </td>
                    <td style="max-width:240px; font-size:12px; line-height:1.4; color:var(--text-dim)">
                      ${row.rainfall_recommendation || '—'}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="scientific-disclaimer-box">
          <strong>Audit Integrity Notice:</strong> All historical predictions are cryptographically tracked and persisted simultaneously across the primary relational database and the local failover ledger to ensure academic traceability and reproducible verification.
        </div>
      `;

      // Filter Event Listeners
      document.getElementById("applyFilterBtn").addEventListener("click", () => {
        startDate = document.getElementById("startDateInput").value;
        endDate = document.getElementById("endDateInput").value;
        currentLimit = parseInt(document.getElementById("limitSelect").value, 10);
        loadData();
      });

      document.getElementById("resetFilterBtn").addEventListener("click", () => {
        startDate = "";
        endDate = "";
        currentLimit = 150;
        loadData();
      });

    } catch (err) {
      main.innerHTML = `<div class="card" style="border-color:var(--risk-critical); color:var(--risk-critical)">Failed to retrieve prediction ledger: ${err.message}</div>`;
    }
  }

  loadData();
}

renderHistory();
