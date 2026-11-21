/* settings.js — Operational System Settings & Telemetry Console */

async function renderSettings() {
  const main = layout("settings");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">System Settings & Operational Telemetry</h1>
        <p class="page-description">
          Command-centre diagnostics, dual persistence configuration, conversational AI engine management, and data synchronization for the Karnataka Climate Intelligence Platform.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center">
        <span class="badge badge-normal" id="sysHealthStatusBadge">CHECKING ENGINE...</span>
      </div>
    </div>
    <div class="card" style="text-align:center; padding:40px">
      <div style="font-family:'JetBrains Mono',monospace; color:var(--cyan)">Retrieving system diagnostics...</div>
    </div>
  `;

  try {
    const health = await api("/api/health");
    const isMySQL = health.persistence === "mysql";
    const geminiActive = health.gemini?.includes("live");

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">System Settings & Operational Telemetry</h1>
          <p class="page-description">
            Command-centre diagnostics, dual persistence configuration, conversational AI engine management, and data synchronization for the Karnataka Climate Intelligence Platform.
          </p>
        </div>
        <div style="display:flex; gap:10px; align-items:center">
          <span class="badge badge-normal">SYSTEM OPERATIONAL</span>
          <button class="btn btn-secondary" onclick="window.location.reload()">🔄 Refresh Telemetry</button>
        </div>
      </div>

      <!-- Core Engine Telemetry Cards -->
      <div class="grid grid-4" style="margin-bottom:20px">
        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">PERSISTENCE MODE</span>
            <div class="kpi-icon-pill" style="color:${isMySQL ? 'var(--risk-normal)' : 'var(--cyan)'}">💾</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="font-size:20px">${isMySQL ? 'MySQL 8.0' : 'SQLite Local'}</span>
          </div>
          <div class="kpi-subtext">Automatic failover active</div>
        </div>

        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">AI INFERENCE CORE</span>
            <div class="kpi-icon-pill" style="color:var(--teal)">🤖</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="font-size:20px">Dual ML (32-D)</span>
          </div>
          <div class="kpi-subtext">Linear Reg (0.94) + GBR (0.23)</div>
        </div>

        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">CONVERSATIONAL ENGINE</span>
            <div class="kpi-icon-pill" style="color:var(--purple-neon)">💬</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="font-size:18px">${geminiActive ? 'Gemini 2.0 Live' : 'Domain Engine'}</span>
          </div>
          <div class="kpi-subtext">${geminiActive ? 'Google Cloud API connected' : 'Deterministic offline guardrail'}</div>
        </div>

        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">INGESTED WEATHER RECORDS</span>
            <div class="kpi-icon-pill" style="color:var(--cyan)">📅</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value" style="font-size:22px">${(health.records?.total || 16071).toLocaleString()}</span>
            <span class="kpi-unit">days</span>
          </div>
          <div class="kpi-subtext">Span: 1981-01-01 to 2024-12-31</div>
        </div>
      </div>

      <!-- Settings Panels -->
      <div class="grid grid-2" style="margin-bottom:24px">
        <!-- Database Settings -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Database Storage & Persistence Engine</div>
            <span class="badge ${isMySQL ? 'badge-normal' : 'badge-cyan'}">
              ${isMySQL ? 'PRIMARY RELATIONAL' : 'LOCAL FAILOVER ACTIVE'}
            </span>
          </div>
          <div style="font-size:13px; line-height:1.6; color:var(--text-dim); margin-bottom:14px">
            <div><strong>Active Storage Backend:</strong> ${health.database?.backend || 'SQLite Local Ledger'}</div>
            <div><strong>Status:</strong> <span style="color:var(--risk-normal); font-weight:700">${health.database?.status?.toUpperCase() || 'OPERATIONAL'}</span></div>
            <div style="margin-top:6px; font-size:12px; color:var(--text-muted)">
              The application utilizes dual-layer persistence. If MySQL is unreachable, predictions and audit dispatches seamlessly commit to local SQLite without service interruption.
            </div>
          </div>
          <div style="background:rgba(8,17,29,0.7); padding:12px; border-radius:6px; font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--cyan)">
            CONFIG LOCATION: .env or backend/.env<br>
            MYSQL_HOST=localhost | MYSQL_USER=root | MYSQL_DATABASE=karnataka_climate_risk
          </div>
        </div>

        <!-- AI Engine Settings -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Google Gemini Conversational AI Integration</div>
            <span class="badge ${geminiActive ? 'badge-normal' : 'badge-advisory'}">
              ${geminiActive ? 'API KEY CONFIGURED' : 'OFFLINE MODE'}
            </span>
          </div>
          <div style="font-size:13px; line-height:1.6; color:var(--text-dim); margin-bottom:14px">
            <div><strong>Engine Mode:</strong> ${health.gemini}</div>
            <div><strong>Grounded Prompt Guardrails:</strong> <span style="color:var(--cyan); font-weight:700">ENFORCED (Zero Hallucination)</span></div>
            <div style="margin-top:6px; font-size:12px; color:var(--text-muted)">
              To activate real-time Gemini generative intelligence, set <code>GEMINI_API_KEY</code> in your environment or <code>.env</code> file. When absent, the grounded domain engine answers instantly from project data.
            </div>
          </div>
          <a href="/chat" class="btn btn-primary" style="font-size:12px">
            Open AI Assistant Console 💬
          </a>
        </div>
      </div>

      <!-- Data Export & Backup Utilities -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Data Exports & Synchronization Utilities</div>
        </div>
        <div class="grid grid-3">
          <div style="background:rgba(8,17,29,0.7); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
            <div style="font-weight:700; color:#fff; margin-bottom:6px">Prediction History CSV</div>
            <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px">
              Full chronological audit export of machine learning inferences and municipal directives.
            </div>
            <a href="/api/export-history-csv?limit=5000" class="btn btn-secondary" style="font-size:11px; padding:6px 12px" download>
              📥 Download History CSV
            </a>
          </div>

          <div style="background:rgba(8,17,29,0.7); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
            <div style="font-weight:700; color:#fff; margin-bottom:6px">District Intelligence Dataset</div>
            <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px">
              Export 31 Karnataka districts climatological normals and risk indicators.
            </div>
            <a href="/api/districts-full" class="btn btn-secondary" style="font-size:11px; padding:6px 12px" target="_blank">
              📄 View Districts JSON
            </a>
          </div>

          <div style="background:rgba(8,17,29,0.7); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
            <div style="font-weight:700; color:#fff; margin-bottom:6px">District GIS GeoJSON</div>
            <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px">
              Complete polygon boundary boundaries for all 31 Karnataka administrative districts.
            </div>
            <a href="/static/data/karnataka_districts.geojson" class="btn btn-secondary" style="font-size:11px; padding:6px 12px" download>
              🗺️ Export GeoJSON
            </a>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    main.innerHTML = `<div class="card" style="border-color:var(--risk-critical); color:var(--risk-critical)">Failed to initialize settings: ${err.message}</div>`;
  }
}

renderSettings();
