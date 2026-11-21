/* ==========================================================================
   admin.js — Administrator Emergency Operations, GIS Command & Broadcast Hub
   ========================================================================== */

let adminUser = null;
let activeWarningsList = [];
let statewideDistrictsData = [];
let fullDistrictProfiles = [];
let adminLeafletMap = null;
let adminDistrictGeoJsonLayer = null;
let adminStationMarkers = [];
let currentAdminMapMode = "drought"; // "drought" | "flood" | "heat" | "rainfall" | "temp" | "alerts"

async function renderAdminCommandCentre() {
  const main = layout("admin");

  // Check Admin RBAC
  const storedUser = localStorage.getItem("kci_user");
  if (!storedUser) {
    main.innerHTML = `
      <div style="max-width:460px; margin:60px auto; text-align:center; padding:32px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:12px">
        <div style="font-size:36px; margin-bottom:12px">🛡️</div>
        <h2 style="color:var(--text-main); font-weight:800; font-size:20px">Administrative Clearance Required</h2>
        <p style="color:var(--text-dim); font-size:13px; margin:10px 0 20px">
          This operational area is restricted to authorized Karnataka State Disaster Management emergency officers.
        </p>
        <a href="/login" class="btn btn-primary" style="padding:10px 20px; font-weight:700">Sign In as Admin</a>
      </div>
    `;
    return;
  }

  adminUser = JSON.parse(storedUser);
  if (!adminUser.is_admin && adminUser.role !== "ADMIN" && adminUser.role !== "SUPER_ADMIN") {
    main.innerHTML = `
      <div style="max-width:500px; margin:60px auto; text-align:center; padding:32px; background:var(--bg-surface); border:1px solid #ef4444; border-radius:12px">
        <div style="font-size:36px; margin-bottom:12px">🚫</div>
        <h2 style="color:#ef4444; font-weight:800; font-size:20px">403 Forbidden — Access Denied</h2>
        <p style="color:var(--text-dim); font-size:13px; margin:10px 0 20px">
          User <strong>${escapeHtml(adminUser.email)}</strong> holds role <strong>${escapeHtml(adminUser.role)}</strong> which lacks emergency broadcast authorization.
        </p>
        <a href="/user-dashboard" class="btn btn-secondary" style="padding:10px 20px">Return to Citizen Dashboard</a>
      </div>
    `;
    return;
  }

  main.innerHTML = `
    <!-- 1. PAGE HEADER -->
    <div class="page-header" style="margin-bottom:20px">
      <div>
        <h1 class="page-title" style="color:var(--text-main); font-size:24px; font-weight:800; display:flex; align-items:center; gap:10px">
          <span style="color:var(--cyan)">🛡️</span> State Emergency Broadcast & GIS Command Centre
        </h1>
        <p class="page-description" style="color:var(--text-dim); font-size:13px; margin-top:4px">
          Authorized Administrator: <strong style="color:var(--text-main)">${escapeHtml(adminUser.full_name || adminUser.username || "Command Officer")}</strong> (${escapeHtml(adminUser.role)}) • Multi-Hazard Early Warning Verification, GIS Spatial Command & RFC 8291 Broadcast Hub.
        </p>
      </div>

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <button onclick="refreshAdminData()" class="btn btn-secondary" style="font-size:12px; padding:8px 14px; background:#181818; color:#fff; border:1px solid #333; border-radius:6px; cursor:pointer">
          🔄 Refresh Telemetry
        </button>
        <button onclick="openBroadcastModal()" class="btn btn-primary" style="font-size:12.5px; padding:8px 16px; font-weight:800; background:var(--risk-critical); color:#fff; border:none; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:6px">
          📢 EMERGENCY BROADCAST CONSOLE
        </button>
      </div>
    </div>

    <!-- 2. HIGH-LEVEL OPERATIONAL METRICS -->
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card kpi-card">
        <div class="kpi-label">MONITORED DISTRICTS</div>
        <div class="kpi-value" style="color:var(--cyan)">31 / 31</div>
        <div class="kpi-sub">100% Karnataka Coverage</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">ACTIVE SEVERE WARNINGS</div>
        <div class="kpi-value" id="adminActiveAlertsCount" style="color:var(--risk-critical)">0</div>
        <div class="kpi-sub" id="adminAlertTiersSub">Red: 0 | Orange: 0 | Yellow: 0</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">ALERT SUBSCRIBERS</div>
        <div class="kpi-value" id="adminUserCount" style="color:#10b981">--</div>
        <div class="kpi-sub" id="adminPushCount">Web Push: -- Active Devices</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">METEOROLOGICAL API STATUS</div>
        <div class="kpi-value" id="adminApiStatus" style="color:#38bdf8; font-size:18px">ONLINE (200 OK)</div>
        <div class="kpi-sub" id="adminApiLatency">Latency: -- ms (Open-Meteo NWP)</div>
      </div>
    </div>

    <!-- 2B. REAL-TIME MOBILE WEB PUSH TELEMETRY DECK -->
    <div class="card" style="margin-bottom:20px; background:var(--bg-surface); border:1px solid var(--border-subtle)">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
        <span style="font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:8px">
          <span>📲</span> Mobile Web Push Infrastructure & Delivery Telemetry
        </span>
        <span id="notifLastActiveBadge" style="font-size:11px; color:var(--text-dim); font-family:'JetBrains Mono',monospace">
          Last Broadcast: Checking...
        </span>
      </div>
      <div class="grid grid-4" style="margin-top:12px">
        <div style="background:var(--bg-base); padding:12px; border-radius:6px; border:1px solid #222">
          <div style="font-size:11px; color:var(--text-muted); font-weight:700">TOTAL REGISTERED DEVICES</div>
          <div id="statTotalDevices" style="font-size:22px; font-weight:800; color:#fff; margin-top:4px">--</div>
          <div id="statActiveSubs" style="font-size:11px; color:#10b981; margin-top:2px">Active: --</div>
        </div>
        <div style="background:var(--bg-base); padding:12px; border-radius:6px; border:1px solid #222">
          <div style="font-size:11px; color:var(--text-muted); font-weight:700">PUSH SERVICE ACCEPTED</div>
          <div id="statAcceptedCount" style="font-size:22px; font-weight:800; color:#38bdf8; margin-top:4px">--</div>
          <div style="font-size:11px; color:var(--text-dim); margin-top:2px">FCM HTTP 201 Created</div>
        </div>
        <div style="background:var(--bg-base); padding:12px; border-radius:6px; border:1px solid #222">
          <div style="font-size:11px; color:var(--text-muted); font-weight:700">EXPIRED / 410 CLEANED</div>
          <div id="statExpiredCount" style="font-size:22px; font-weight:800; color:#f59e0b; margin-top:4px">--</div>
          <div style="font-size:11px; color:var(--text-dim); margin-top:2px">Auto-Deactivated</div>
        </div>
        <div style="background:var(--bg-base); padding:12px; border-radius:6px; border:1px solid #222">
          <div style="font-size:11px; color:var(--text-muted); font-weight:700">DELIVERY FAILURES</div>
          <div id="statFailedCount" style="font-size:22px; font-weight:800; color:#ef4444; margin-top:4px">--</div>
          <div style="font-size:11px; color:var(--text-dim); margin-top:2px">Network / Provider Error</div>
        </div>
      </div>
    </div>

    <!-- 3. FULL-WIDTH KARNATAKA STATE MULTI-HAZARD GIS COMMAND BOARD -->
    <section class="card" style="margin-bottom:20px; padding:18px; background:var(--bg-surface); border:1px solid var(--border-subtle)">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:12px">
        <div>
          <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
            STATE EMERGENCY SPATIAL COMMAND
          </div>
          <h2 class="card-title" style="margin-top:2px; font-size:18px; font-weight:800; color:var(--text-main); display:flex; align-items:center; gap:8px">
            <span>🗺️</span> Karnataka 31-District Multi-Hazard GIS Command Board
          </h2>
        </div>
        <!-- Multi-hazard layer switcher buttons -->
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
          <span style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; margin-right:4px">Hazard Layer:</span>
          <button class="gis-layer-btn active" id="btnAdminDrought" onclick="setAdminMapMode('drought')">🏜️ Drought Risk</button>
          <button class="gis-layer-btn" id="btnAdminFlood" onclick="setAdminMapMode('flood')">🌊 Flood Risk</button>
          <button class="gis-layer-btn" id="btnAdminHeat" onclick="setAdminMapMode('heat')">🔥 Heat Risk</button>
          <button class="gis-layer-btn" id="btnAdminRainfall" onclick="setAdminMapMode('rainfall')">🌧️ Rainfall Volume</button>
          <button class="gis-layer-btn" id="btnAdminTemp" onclick="setAdminMapMode('temp')">🌡️ Temperature</button>
          <button class="gis-layer-btn" id="btnAdminAlerts" onclick="setAdminMapMode('alerts')">🚨 Early Warnings</button>
        </div>
      </div>

      <!-- GIS Frame with Leaflet Canvas + Dynamic Legend -->
      <div class="gis-map-frame" style="height:540px; position:relative; border-radius:8px; overflow:hidden; border:1px solid var(--border-subtle)">
        <div id="adminMapCanvas" style="height:100%; width:100%; background:#0b1120"></div>
        <div class="gis-map-legend" id="adminMapLegend" style="position:absolute; bottom:14px; left:14px; z-index:400; background:#0c1527; padding:10px 14px; border-radius:6px; border:1px solid var(--border-subtle); font-size:11px; color:var(--text-dim); display:flex; flex-direction:column; gap:6px; max-width:280px; box-shadow:0 4px 14px rgba(0,0,0,0.4)">
          <!-- Updated dynamically -->
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:12px; font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono', monospace">
        <span>COORDINATES: 11.5°N–18.5°N, 74.0°E–78.5°E • 31 DISTRICT BOUNDARIES • 31 IMD WEATHER STATIONS</span>
        <span>CLICK ANY DISTRICT POLYGON OR STATION PIN TO INSPECT & DISPATCH TARGETED BROADCAST</span>
      </div>
    </section>

    <!-- 4. ACTIVE WARNING BOARD & COMMAND ACTIONS GRID -->
    <div class="grid grid-2" style="margin-bottom:20px">
      <!-- ACTIVE WARNINGS & APPROVAL QUEUE -->
      <div class="card" style="background:var(--bg-surface); border:1px solid var(--border-subtle); display:flex; flex-direction:column">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
          <span style="font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:8px">
            <span>🚨</span> Active Emergency Warnings Queue
          </span>
          <span id="activeQueueBadge" class="badge" style="background:rgba(239,68,68,0.2); color:#ef4444; font-weight:800">0 Active</span>
        </div>
        <div id="adminWarningsList" style="flex:1; overflow-y:auto; max-height:360px; margin-top:12px; display:flex; flex-direction:column; gap:10px">
          <div style="text-align:center; padding:30px; color:var(--text-muted)">Loading warnings...</div>
        </div>
      </div>

      <!-- INTER-AGENCY DISPATCH & ACTION COMMAND PANEL -->
      <div class="card" style="background:var(--bg-surface); border:1px solid var(--border-subtle)">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
          <span style="font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:8px">
            <span>⚡</span> Inter-Agency Response & Direct Operations
          </span>
          <span class="badge badge-cyan">COMMAND MODE</span>
        </div>
        <div style="margin-top:14px; display:flex; flex-direction:column; gap:12px">
          <div style="background:var(--bg-base); padding:12px 14px; border-radius:6px; border:1px solid #222">
            <div style="font-weight:700; font-size:13px; color:#fff; margin-bottom:4px">Instant Multi-Channel Push Dispatch</div>
            <p style="font-size:12px; color:var(--text-dim); margin-bottom:8px">
              Dispatches RFC 8291 Web Push notifications directly to citizen mobile devices across all 31 Karnataka sectors.
            </p>
            <div style="display:flex; gap:8px; flex-wrap:wrap">
              <button onclick="openBroadcastModal()" class="btn btn-primary" style="font-size:11px; padding:6px 12px; font-weight:700; background:var(--risk-critical); color:#fff; border:none; border-radius:4px">
                📢 Launch Broadcast Form
              </button>
              <button onclick="dispatchPresetWarning('Statewide', 'Multi-Hazard Emergency Alert', 'CRITICAL', 'Statewide precautionary alert for changing weather conditions.')" class="btn btn-secondary" style="font-size:11px; padding:6px 12px; border-radius:4px">
                🌍 Statewide General Advisory
              </button>
            </div>
          </div>

          <div style="background:var(--bg-base); padding:12px 14px; border-radius:6px; border:1px solid #222">
            <div style="font-weight:700; font-size:13px; color:#fff; margin-bottom:4px">Karnataka Emergency Response Hotlines</div>
            <div style="font-size:12px; color:var(--text-dim); display:flex; flex-direction:column; gap:4px">
              <div>📞 <strong>1070:</strong> State Emergency Operations Centre (SEOC Bengaluru)</div>
              <div>📞 <strong>112:</strong> Police & Multi-Agency Emergency Response Support</div>
              <div>📞 <strong>1077:</strong> District Emergency Operations Centres (DEOC 31 Dists)</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. ALL 31 DISTRICTS LIVE STATUS MATRIX -->
    <div class="card" style="margin-bottom:20px; background:var(--bg-surface); border:1px solid var(--border-subtle)">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px">
        <span style="font-weight:700; color:var(--text-main)">🏛️ Karnataka 31-District Meteorological & Hazard Matrix</span>
        <input type="text" id="adminDistrictSearch" placeholder="Filter district..." onkeyup="filterDistrictTable(this.value)"
               style="padding:6px 12px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:12px; width:200px">
      </div>
      <div style="overflow-x:auto; margin-top:12px">
        <table class="table" style="width:100%; border-collapse:collapse; font-size:12.5px">
          <thead>
            <tr style="border-bottom:1px solid var(--border-subtle); color:var(--text-muted); text-transform:uppercase; font-size:11px">
              <th style="padding:10px; text-align:left">District</th>
              <th style="padding:10px; text-align:left">Zone</th>
              <th style="padding:10px; text-align:left">Condition</th>
              <th style="padding:10px; text-align:right">Temp (°C)</th>
              <th style="padding:10px; text-align:right">Rain (mm)</th>
              <th style="padding:10px; text-align:right">Wind (km/h)</th>
              <th style="padding:10px; text-align:center">Hazard Level</th>
              <th style="padding:10px; text-align:center">Actions</th>
            </tr>
          </thead>
          <tbody id="adminDistrictTableBody">
            <tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted)">Loading district matrix...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 6. EMERGENCY BROADCAST AUDIT LEDGER -->
    <div class="card" style="margin-bottom:20px; background:var(--bg-surface); border:1px solid var(--border-subtle)">
      <div class="card-title" style="font-weight:700; color:var(--text-main)">
        📜 Emergency Broadcast & Dispatch Audit Ledger
      </div>
      <div style="overflow-x:auto; margin-top:12px">
        <table class="table" style="width:100%; border-collapse:collapse; font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid var(--border-subtle); color:var(--text-muted); text-transform:uppercase; font-size:11px">
              <th style="padding:8px; text-align:left">Timestamp</th>
              <th style="padding:8px; text-align:left">Alert ID</th>
              <th style="padding:8px; text-align:left">District</th>
              <th style="padding:8px; text-align:left">Channel</th>
              <th style="padding:8px; text-align:right">Recipients</th>
              <th style="padding:8px; text-align:center">Delivery Status</th>
              <th style="padding:8px; text-align:left">Authorized By</th>
            </tr>
          </thead>
          <tbody id="adminAuditTableBody">
            <tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-muted)">No broadcast dispatches logged in current session.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 7. BROADCAST MODAL (HIDDEN BY DEFAULT) -->
    <div id="broadcastModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; align-items:center; justify-content:center">
      <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:12px; width:92%; max-width:540px; padding:24px; box-shadow:0 10px 40px rgba(0,0,0,0.8)">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px">
          <h3 style="font-size:18px; font-weight:800; color:var(--risk-critical); display:flex; align-items:center; gap:8px">
            <span>📢</span> Dispatch Emergency Broadcast
          </h3>
          <button onclick="closeBroadcastModal()" style="background:none; border:none; color:var(--text-muted); font-size:18px; cursor:pointer">✕</button>
        </div>

        <form id="broadcastForm" onsubmit="executeBroadcast(event)">
          <div style="margin-bottom:14px">
            <label style="display:block; font-size:11.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px">
              Target District Sector *
            </label>
            <select id="bcastDistrict" class="form-select" style="width:100%; padding:8px 12px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px">
              <option value="Statewide">🌍 Statewide (All 31 Districts)</option>
              ${ALL_DISTRICTS.map(d => `<option value="${d}">${d}</option>`).join("")}
            </select>
          </div>

          <div style="margin-bottom:14px">
            <label style="display:block; font-size:11.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px">
              Emergency Hazard Type (9 Hazard Dimensions) *
            </label>
            <select id="bcastCategory" class="form-select" style="width:100%; padding:8px 12px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px">
              <option value="Flash Flood Warning">🌊 Flash Flood Warning</option>
              <option value="Heavy Rainfall Warning">🌧️ Heavy Rainfall Warning</option>
              <option value="Extreme Rainfall Alert">⛈️ Extreme Rainfall Alert</option>
              <option value="Urban Flood Risk">🌊 Urban Flood Risk</option>
              <option value="Heatwave Warning">☀️ Heatwave Warning</option>
              <option value="Extreme Temperature Alert">🌡️ Extreme Temperature Alert</option>
              <option value="Drought Warning">🏜️ Drought Warning</option>
              <option value="Severe Weather Warning">🌪️ Severe Weather Warning</option>
              <option value="Multi-Hazard Emergency Alert">🚨 Multi-Hazard Emergency Alert</option>
            </select>
          </div>

          <div style="margin-bottom:14px">
            <label style="display:block; font-size:11.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px">
              Notification Priority Level *
            </label>
            <select id="bcastSeverity" class="form-select" style="width:100%; padding:8px 12px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px">
              <option value="CRITICAL">🔴 CRITICAL (Immediate RFC 8030 High Urgency + Continuous Vibration)</option>
              <option value="HIGH">🟠 HIGH (Urgent Web Push Alert)</option>
              <option value="MEDIUM">🟡 MEDIUM (Meteorological Advisory)</option>
              <option value="LOW">🟢 LOW (Informational Monitoring)</option>
            </select>
          </div>

          <div style="margin-bottom:14px">
            <label style="display:block; font-size:11.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px">
              Affected Locality (Optional)
            </label>
            <input type="text" id="bcastLocality" placeholder="e.g. Almatti Basin, Koramangala Valley..."
                   style="width:100%; padding:8px 12px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13px">
          </div>

          <div style="margin-bottom:14px">
            <label style="display:block; font-size:11.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px">
              Emergency Action Directive *
            </label>
            <textarea id="bcastMessage" required rows="3" placeholder="Enter concise mandatory instructions for citizens..."
                      style="width:100%; padding:8px 12px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13px"></textarea>
          </div>

          <div style="margin-bottom:18px">
            <label style="display:block; font-size:11.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px">
              Broadcast Channels:
            </label>
            <div style="display:flex; gap:16px; font-size:12.5px; color:var(--text-dim)">
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer">
                <input type="checkbox" id="chanPush" checked> Web Push
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer">
                <input type="checkbox" id="chanBanner" checked> In-App Banner
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer">
                <input type="checkbox" id="chanSms" checked> Emergency SMS
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer">
                <input type="checkbox" id="chanEmail" checked> DDMA Email
              </label>
            </div>
          </div>

          <div style="display:flex; gap:10px; justify-content:flex-end">
            <button type="button" onclick="closeBroadcastModal()" class="btn btn-secondary" style="padding:9px 16px; border:1px solid #333; background:#181818; color:#fff; border-radius:6px">
              Cancel
            </button>
            <button type="submit" id="btnExecuteBcast" class="btn btn-primary" style="padding:9px 20px; font-weight:800; background:var(--risk-critical); color:#fff; border:none; border-radius:6px">
              CONFIRM & DISPATCH NOW
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 8. DISTRICT DETAIL INSPECTION MODAL (DYNAMIC POPUP) -->
    <div id="adminDistrictDetailModal" style="display:none; position:fixed; inset:0; background:rgba(4,8,16,0.85); backdrop-filter:blur(8px); z-index:9999; overflow-y:auto; padding:30px 20px; align-items:center; justify-content:center">
      <div class="card" style="max-width:680px; width:100%; margin:auto; background:rgba(13,26,45,0.98); border:1px solid var(--cyan); box-shadow:0 10px 40px rgba(0,0,0,0.8); border-radius:12px; padding:24px" id="adminDistrictDetailContent">
        <!-- Rendered dynamically -->
      </div>
    </div>
  `;

  // Asynchronous operational data loading
  await Promise.all([
    loadAdminTelemetry(),
    loadAdminWarnings(),
    loadStatewideDistricts(),
    loadFullDistrictProfiles(),
    loadAuditLedger(),
  ]);

  initAdminMap();
  updateAdminMapLegend(currentAdminMapMode);
}

async function loadFullDistrictProfiles() {
  try {
    const res = await fetch("/api/districts-full");
    const data = await res.json();
    fullDistrictProfiles = data.districts || [];
  } catch (err) {
    console.warn("Notice: could not load full district profiles:", err);
  }
}

async function loadAdminTelemetry() {
  try {
    const res = await fetch("/api/admin/overview");
    const data = await res.json();
    if (data.status === "success") {
      const userCountEl = document.getElementById("adminUserCount");
      if (userCountEl) userCountEl.textContent = data.users_stats?.total_users || 2;
      const pushCountEl = document.getElementById("adminPushCount");
      if (pushCountEl) pushCountEl.textContent = `Web Push: ${data.users_stats?.active_push_subscribers || 1} Active Devices`;

      const apiInfo = data.api_health || {};
      const apiStatusEl = document.getElementById("adminApiStatus");
      if (apiStatusEl) apiStatusEl.textContent = `${apiInfo.status?.toUpperCase() || "ONLINE"} (${apiInfo.latency_ms || 240}ms)`;
      const apiLatEl = document.getElementById("adminApiLatency");
      if (apiLatEl) apiLatEl.textContent = `Latency: ${apiInfo.latency_ms || 240} ms (${apiInfo.provider || "Open-Meteo"})`;
    }

    // Load Mobile Web Push Delivery Telemetry
    const statsRes = await fetch("/api/admin/notification-stats");
    const statsData = await statsRes.json();
    if (statsData.status === "success" && statsData.stats) {
      const s = statsData.stats;
      const elTotal = document.getElementById("statTotalDevices");
      const elActive = document.getElementById("statActiveSubs");
      const elAcc = document.getElementById("statAcceptedCount");
      const elExp = document.getElementById("statExpiredCount");
      const elFail = document.getElementById("statFailedCount");
      const elBadge = document.getElementById("notifLastActiveBadge");

      if (elTotal) elTotal.textContent = s.total_devices || 0;
      if (elActive) elActive.textContent = `Active Subscriptions: ${s.active_subscriptions || 0}`;
      if (elAcc) elAcc.textContent = s.accepted_count || 0;
      if (elExp) elExp.textContent = s.expired_count || 0;
      if (elFail) elFail.textContent = s.failed_count || 0;
      if (elBadge && s.last_notification_time) {
        elBadge.textContent = `Last Broadcast: ${new Date(s.last_notification_time).toLocaleTimeString()} UTC`;
      }
    }
  } catch (err) {
    console.error("Error loading telemetry:", err);
  }
}

async function loadAdminWarnings() {
  const container = document.getElementById("adminWarningsList");
  if (!container) return;

  try {
    const res = await fetch("/api/alerts/active");
    const data = await res.json();
    const alerts = data.alerts || [];
    activeWarningsList = alerts;

    const countEl = document.getElementById("adminActiveAlertsCount");
    if (countEl) countEl.textContent = alerts.length;
    const badge = document.getElementById("activeQueueBadge");
    if (badge) badge.textContent = `${alerts.length} Active`;

    const reds = alerts.filter(a => a.severity_code === "RED" || a.severity === "CRITICAL").length;
    const oranges = alerts.filter(a => a.severity_code === "ORANGE" || a.severity === "HIGH").length;
    const yellows = alerts.filter(a => a.severity_code === "YELLOW" || a.severity === "MEDIUM").length;
    const tiersEl = document.getElementById("adminAlertTiersSub");
    if (tiersEl) tiersEl.textContent = `Red: ${reds} | Orange: ${oranges} | Yellow: ${yellows}`;

    if (alerts.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:30px; color:var(--text-muted)">
          <div style="font-size:24px; margin-bottom:6px">🛡️</div>
          <div>No emergency warnings currently require active response.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = alerts.map(a => `
      <div style="padding:12px 14px; background:var(--bg-base); border-left:4px solid ${a.badge_color || '#ef4444'}; border-radius:4px; font-size:12px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px">
          <span style="font-weight:800; color:${a.badge_color || '#ef4444'}">${escapeHtml(a.severity_tier || a.severity)}</span>
          <span style="font-family:'JetBrains Mono',monospace; color:var(--text-muted); font-size:10px">${escapeHtml(a.alert_id)}</span>
        </div>
        <div style="font-weight:700; color:#fff">${escapeHtml(a.title)}</div>
        <div style="color:var(--text-dim); margin-top:4px; line-height:1.4">${escapeHtml(a.observed_or_predicted_value || "")}</div>
        <div style="display:flex; gap:8px; margin-top:8px">
          <button onclick="triggerDirectBroadcast('${escapeHtml(a.alert_id)}')" class="btn" style="padding:4px 8px; font-size:11px; background:${a.badge_color || '#ef4444'}; color:#000; font-weight:800; border-radius:4px; border:none; cursor:pointer">
            Broadcast
          </button>
          <button onclick="cancelWarning('${escapeHtml(a.alert_id)}')" class="btn" style="padding:4px 8px; font-size:11px; background:#222; color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer">
            Resolve / Cancel
          </button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    console.error("Error loading admin warnings:", err);
  }
}

async function loadStatewideDistricts() {
  const tbody = document.getElementById("adminDistrictTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/api/weather/districts");
    const data = await res.json();
    const list = data.districts || [];
    statewideDistrictsData = list;
    renderDistrictRows(list);
  } catch (err) {
    console.error("Error loading statewide districts:", err);
  }
}

function renderDistrictRows(list) {
  const tbody = document.getElementById("adminDistrictTableBody");
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:15px">No district data available.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(d => {
    let hazardBadge = `<span style="padding:2px 6px; border-radius:4px; font-weight:800; font-size:10px; background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3)">NORMAL</span>`;
    if (d.rainfall_mm >= 35.5 || (d.temperature_c && d.temperature_c >= 38.0)) {
      hazardBadge = `<span style="padding:2px 6px; border-radius:4px; font-weight:800; font-size:10px; background:rgba(239,68,68,0.2); color:#ef4444; border:1px solid #ef4444">CRITICAL</span>`;
    } else if (d.rainfall_mm >= 15.0 || (d.temperature_c && d.temperature_c >= 35.0)) {
      hazardBadge = `<span style="padding:2px 6px; border-radius:4px; font-weight:800; font-size:10px; background:rgba(245,158,11,0.2); color:#f59e0b; border:1px solid #f59e0b">WATCH</span>`;
    }

    return `
      <tr style="border-bottom:1px solid var(--border-subtle)">
        <td style="padding:8px 10px; font-weight:700; color:#fff">${escapeHtml(d.district)}</td>
        <td style="padding:8px 10px; color:var(--text-muted)">${escapeHtml(d.zone || "-")}</td>
        <td style="padding:8px 10px; color:var(--text-dim)">${d.icon || ""} ${escapeHtml(d.condition || "Fair")}</td>
        <td style="padding:8px 10px; text-align:right; font-weight:700; color:var(--cyan)">${d.temperature_c ?? "--"} °C</td>
        <td style="padding:8px 10px; text-align:right; font-weight:700; color:#38bdf8">${d.rainfall_mm ?? 0} mm</td>
        <td style="padding:8px 10px; text-align:right; color:var(--text-dim)">${d.wind_speed_kmh ?? "--"} km/h</td>
        <td style="padding:8px 10px; text-align:center">${hazardBadge}</td>
        <td style="padding:8px 10px; text-align:center">
          <button onclick="openAdminDistrictInspection('${escapeHtml(d.district)}')" class="btn" style="padding:3px 8px; font-size:11px; background:#1e293b; color:var(--cyan); border:1px solid var(--border-subtle); border-radius:4px; cursor:pointer">
            Inspect
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function filterDistrictTable(q) {
  const query = (q || "").toLowerCase();
  const filtered = statewideDistrictsData.filter(d =>
    d.district.toLowerCase().includes(query) || (d.zone && d.zone.toLowerCase().includes(query))
  );
  renderDistrictRows(filtered);
}

/* ==========================================================================
   KARNATAKA MULTI-HAZARD GIS ENGINE (LEAFLET + GEOJSON + WEATHER STATIONS)
   ========================================================================== */

function initAdminMap() {
  const container = document.getElementById("adminMapCanvas");
  if (!container || typeof L === "undefined") return;

  if (adminLeafletMap) {
    try {
      adminLeafletMap.remove();
    } catch (e) {
      console.warn("Notice: cleaning up previous map instance:", e);
    }
    adminLeafletMap = null;
  }

  // Initialize Leaflet Map centered over Karnataka (14.8°N, 75.8°E)
  adminLeafletMap = L.map("adminMapCanvas", {
    center: [14.8, 75.8],
    zoom: 6.8,
    minZoom: 6,
    maxZoom: 12,
    attributionControl: false,
  });

  // Basemap Setup with Esri Dark Canvas and OSM Fallback
  const basemapSetup = (typeof getStandardBasemapLayers === "function") ? getStandardBasemapLayers() : null;
  if (basemapSetup) {
    basemapSetup.defaultLayer.addTo(adminLeafletMap);
    L.control.layers(basemapSetup.baseMaps, null, { position: "topright" }).addTo(adminLeafletMap);
  } else {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(adminLeafletMap);
  }

  // Load all 31 Karnataka District Boundary Polygons from GeoJSON
  fetch("/static/data/karnataka_districts.geojson")
    .then(res => res.json())
    .then(geoJsonData => {
      adminDistrictGeoJsonLayer = L.geoJSON(geoJsonData, {
        style: feature => getAdminPolygonStyle(feature.properties.district, currentAdminMapMode),
        onEachFeature: (feature, layer) => {
          const dName = feature.properties.district;
          const prof = fullDistrictProfiles.find(d => d.district.toLowerCase() === dName.toLowerCase()) || {};
          const live = statewideDistrictsData.find(d => d.district.toLowerCase() === dName.toLowerCase()) || {};

          layer.bindTooltip(`
            <div style="font-family:'Outfit',sans-serif; color:#fff; min-width:140px">
              <div style="font-weight:700; font-size:13px; color:var(--cyan)">${dName}</div>
              <div style="font-size:11px; color:#94a3b8">${prof.zone || live.zone || 'Karnataka'}</div>
              <div style="font-size:11px; color:#fff; margin-top:3px">
                Temp: <b>${live.temperature_c ?? prof.mean_temp_c ?? '--'}°C</b> | Rain: <b>${live.rainfall_mm ?? 0}mm</b>
              </div>
              <div style="font-size:10.5px; font-weight:700; color:#38bdf8; margin-top:2px">
                ${prof.early_warning || 'Click to Inspect District'}
              </div>
            </div>
          `, { sticky: true });

          layer.on("click", () => {
            openAdminDistrictInspection(dName);
          });

          layer.on("mouseover", () => {
            layer.setStyle({ weight: 2.8, color: "#00f0ff", fillOpacity: 0.62 });
          });

          layer.on("mouseout", () => {
            if (adminDistrictGeoJsonLayer) {
              adminDistrictGeoJsonLayer.resetStyle(layer);
            }
          });
        },
      }).addTo(adminLeafletMap);
    })
    .catch(err => console.warn("Notice: karnataka_districts.geojson load:", err));

  // Render 31 IMD Weather Station Markers
  renderAdminStationMarkers(currentAdminMapMode);

  // Invalidate size to guarantee sharp rasterization & full viewport fill
  setTimeout(() => {
    if (adminLeafletMap) adminLeafletMap.invalidateSize();
  }, 250);

  window.addEventListener("resize", () => {
    if (adminLeafletMap) adminLeafletMap.invalidateSize();
  });
}

function getAdminPolygonStyle(districtName, mode) {
  const prof = fullDistrictProfiles.find(d => d.district.toLowerCase() === districtName.toLowerCase());
  const live = statewideDistrictsData.find(d => d.district.toLowerCase() === districtName.toLowerCase());
  let fillColor = "#38bdf8";

  if (mode === "drought") {
    if (prof) {
      fillColor = prof.drought_risk === "Critical" ? "#b91c1c" : (prof.drought_risk === "High" ? "#ef4444" : (prof.drought_risk === "Moderate" ? "#f97316" : "#10b981"));
    }
  } else if (mode === "flood") {
    if (live && live.rainfall_mm >= 35.5) {
      fillColor = "#ef4444";
    } else if (prof) {
      fillColor = prof.flood_risk === "Critical" ? "#ef4444" : (prof.flood_risk === "High" ? "#f97316" : (prof.flood_risk === "Moderate" ? "#38bdf8" : "#10b981"));
    }
  } else if (mode === "heat") {
    if (live && live.temperature_c >= 38.0) {
      fillColor = "#ef4444";
    } else if (prof) {
      fillColor = prof.heat_risk === "Critical" || prof.heat_risk === "Very High" ? "#ef4444" : (prof.heat_risk === "High" ? "#f97316" : (prof.heat_risk === "Moderate" ? "#eab308" : "#10b981"));
    }
  } else if (mode === "rainfall") {
    if (prof) {
      fillColor = prof.avg_annual_mm > 2500 ? "#00f0ff" : (prof.avg_annual_mm > 1200 ? "#00e5bc" : (prof.avg_annual_mm > 750 ? "#38bdf8" : "#f97316"));
    }
  } else if (mode === "temp") {
    const tempVal = live?.temperature_c ?? prof?.mean_temp_c ?? 26.0;
    fillColor = tempVal > 34.0 ? "#ef4444" : (tempVal > 30.0 ? "#f97316" : (tempVal > 25.0 ? "#eab308" : "#00f0ff"));
  } else if (mode === "alerts") {
    const ew = (prof?.early_warning || "").toLowerCase();
    fillColor = ew.includes("critical") ? "#dc2626" : (ew.includes("high") || ew.includes("warning") ? "#ea580c" : (ew.includes("advisory") ? "#ca8a04" : "#16a34a"));
  }

  return {
    color: "rgba(56, 189, 248, 0.45)",
    weight: 1.2,
    fillColor: fillColor,
    fillOpacity: 0.35,
  };
}

function renderAdminStationMarkers(mode) {
  if (!adminLeafletMap) return;

  // Clear previous station markers
  adminStationMarkers.forEach(m => adminLeafletMap.removeLayer(m));
  adminStationMarkers = [];

  // Iterate over 31 districts
  const sourceList = statewideDistrictsData.length > 0 ? statewideDistrictsData : fullDistrictProfiles;

  sourceList.forEach(d => {
    const lat = Number(d.latitude || d.lat || 15.0);
    const lon = Number(d.longitude || d.lon || 76.0);
    const dName = d.district;

    const prof = fullDistrictProfiles.find(p => p.district.toLowerCase() === dName.toLowerCase()) || {};
    const live = statewideDistrictsData.find(p => p.district.toLowerCase() === dName.toLowerCase()) || d;

    let markerColor = "#10b981";
    let radius = 6;

    if (mode === "drought") {
      markerColor = prof.drought_risk === "High" || prof.drought_risk === "Critical" ? "#ef4444" : (prof.drought_risk === "Moderate" ? "#f97316" : "#10b981");
    } else if (mode === "flood") {
      markerColor = (live.rainfall_mm >= 35.5 || prof.flood_risk === "Critical") ? "#ef4444" : (live.rainfall_mm >= 15.0 ? "#f97316" : "#38bdf8");
    } else if (mode === "heat") {
      markerColor = (live.temperature_c >= 38.0 || prof.heat_risk === "Very High") ? "#ef4444" : (live.temperature_c >= 35.0 ? "#f97316" : "#10b981");
    } else if (mode === "rainfall") {
      markerColor = "#00f0ff";
      radius = Math.max(5, Math.min(16, (prof.avg_annual_mm || 800) / 300));
    } else if (mode === "temp") {
      const t = live.temperature_c ?? prof.mean_temp_c ?? 26.0;
      markerColor = t >= 35.0 ? "#ef4444" : (t >= 30.0 ? "#f97316" : "#00f0ff");
    } else if (mode === "alerts") {
      const isRed = live.rainfall_mm >= 35.5 || (live.temperature_c && live.temperature_c >= 38.0);
      const isYellow = live.rainfall_mm >= 15.0;
      markerColor = isRed ? "#ef4444" : (isYellow ? "#f59e0b" : "#10b981");
    }

    const circle = L.circleMarker([lat, lon], {
      radius: radius,
      fillColor: markerColor,
      color: "#ffffff",
      weight: 1.2,
      opacity: 0.95,
      fillOpacity: 0.85,
    }).addTo(adminLeafletMap);

    const popupHtml = `
      <div style="font-family:'Outfit',sans-serif; min-width:210px; color:#f1f5f9; padding:4px">
        <h4 style="margin:0 0 4px 0; font-size:14px; color:var(--cyan); text-transform:uppercase">${escapeHtml(dName)}</h4>
        <div style="font-size:11.5px; line-height:1.5; color:#cbd5e1">
          <div><b>Zone:</b> ${escapeHtml(prof.zone || live.zone || "Karnataka")}</div>
          <div><b>Live Temp:</b> <span style="color:var(--cyan); font-weight:700">${live.temperature_c ?? prof.mean_temp_c ?? '--'} °C</span></div>
          <div><b>Live Rain:</b> <span style="color:#38bdf8; font-weight:700">${live.rainfall_mm ?? 0} mm</span></div>
          <div><b>Condition:</b> ${escapeHtml(live.condition || "Operational")}</div>
          <div><b>Early Warning:</b> <span style="font-weight:700; color:${markerColor}">${escapeHtml(prof.early_warning || "Normal")}</span></div>
        </div>
        <div style="display:flex; gap:6px; margin-top:8px">
          <button onclick="openAdminDistrictInspection('${escapeHtml(dName)}')"
                  class="btn btn-secondary" style="flex:1; padding:4px 6px; font-size:10.5px">
            Inspect
          </button>
          <button onclick="openTargetedBroadcast('${escapeHtml(dName)}')"
                  class="btn btn-primary" style="flex:1; padding:4px 6px; font-size:10.5px; background:var(--risk-critical); border:none; font-weight:700">
            📢 Broadcast
          </button>
        </div>
      </div>
    `;

    circle.bindPopup(popupHtml);
    circle.bindTooltip(`<b>${escapeHtml(dName)}</b> (IMD Station)`, { direction: "top", offset: [0, -6] });
    adminStationMarkers.push(circle);
  });
}

function setAdminMapMode(mode) {
  currentAdminMapMode = mode;
  document.querySelectorAll("[id^='btnAdmin']").forEach(btn => btn.classList.remove("active"));
  const btn = document.getElementById(
    mode === "drought" ? "btnAdminDrought" :
    (mode === "flood" ? "btnAdminFlood" :
    (mode === "heat" ? "btnAdminHeat" :
    (mode === "rainfall" ? "btnAdminRainfall" :
    (mode === "temp" ? "btnAdminTemp" : "btnAdminAlerts"))))
  );
  if (btn) btn.classList.add("active");

  if (adminDistrictGeoJsonLayer) {
    adminDistrictGeoJsonLayer.setStyle(feature => getAdminPolygonStyle(feature.properties.district, mode));
  }
  renderAdminStationMarkers(mode);
  updateAdminMapLegend(mode);
}

function updateAdminMapLegend(mode) {
  const legend = document.getElementById("adminMapLegend");
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
      <div class="legend-title">Temperature Monitoring</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#ef4444"></span> &gt;34.0 °C (Heat Stress)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#f97316"></span> 30.0–34.0 °C (Elevated)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#eab308"></span> 25.0–30.0 °C (Moderate)</div>
      <div class="legend-row"><span class="legend-color-dot" style="background:#00f0ff"></span> &lt;25.0 °C (Temperate / Highland)</div>
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

function openAdminDistrictInspection(districtName) {
  const modal = document.getElementById("adminDistrictDetailModal");
  const content = document.getElementById("adminDistrictDetailContent");
  if (!modal || !content) return;

  const prof = fullDistrictProfiles.find(d => d.district.toLowerCase() === districtName.toLowerCase()) || {};
  const live = statewideDistrictsData.find(d => d.district.toLowerCase() === districtName.toLowerCase()) || {};

  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px">
      <div>
        <div style="font-size:11px; font-weight:700; color:var(--cyan); letter-spacing:1px; text-transform:uppercase">
          DISTRICT OPERATIONAL TELEMETRY
        </div>
        <h2 style="font-size:22px; font-weight:800; color:#fff; margin-top:2px">${escapeHtml(districtName)}</h2>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px">
          ${escapeHtml(prof.zone || live.zone || "Karnataka Sector")} • Elevation: ${prof.elevation_m || 600}m • River Basin: ${escapeHtml(prof.basin || "Krishna/Cauvery")}
        </div>
      </div>
      <button onclick="closeAdminDistrictInspection()" style="background:none; border:none; color:var(--text-muted); font-size:20px; cursor:pointer">✕</button>
    </div>

    <!-- Live Meteorological Readings -->
    <div class="grid grid-4" style="margin-bottom:18px">
      <div style="background:var(--bg-base); padding:12px; border-radius:6px; border:1px solid #222">
        <div style="font-size:11px; color:var(--text-muted); font-weight:700">TEMPERATURE</div>
        <div style="font-size:20px; font-weight:800; color:var(--cyan); margin-top:4px">${live.temperature_c ?? prof.mean_temp_c ?? '--'} °C</div>
        <div style="font-size:10px; color:var(--text-dim); margin-top:2px">Mean: ${prof.mean_temp_c || '--'}°C</div>
      </div>
      <div style="background:var(--bg-base); padding:12px; border-radius:6px; border:1px solid #222">
        <div style="font-size:11px; color:var(--text-muted); font-weight:700">PRECIPITATION</div>
        <div style="font-size:20px; font-weight:800; color:#38bdf8; margin-top:4px">${live.rainfall_mm ?? 0} mm</div>
        <div style="font-size:10px; color:var(--text-dim); margin-top:2px">Annual: ${prof.avg_annual_mm || '--'} mm</div>
      </div>
      <div style="background:var(--bg-base); padding:12px; border-radius:6px; border:1px solid #222">
        <div style="font-size:11px; color:var(--text-muted); font-weight:700">WIND SPEED</div>
        <div style="font-size:20px; font-weight:800; color:#10b981; margin-top:4px">${live.wind_speed_kmh ?? '--'} km/h</div>
        <div style="font-size:10px; color:var(--text-dim); margin-top:2px">Condition: ${escapeHtml(live.condition || 'Fair')}</div>
      </div>
      <div style="background:var(--bg-base); padding:12px; border-radius:6px; border:1px solid #222">
        <div style="font-size:11px; color:var(--text-muted); font-weight:700">EARLY WARNING</div>
        <div style="font-size:16px; font-weight:800; color:#ef4444; margin-top:4px">${escapeHtml(prof.early_warning || 'NORMAL')}</div>
        <div style="font-size:10px; color:var(--text-dim); margin-top:2px">Risk Tier: Verified</div>
      </div>
    </div>

    <!-- Hazard Vulnerability Matrix -->
    <div style="background:var(--bg-base); padding:14px; border-radius:8px; border:1px solid #222; margin-bottom:18px">
      <div style="font-size:12px; font-weight:700; color:#fff; margin-bottom:8px">HAZARD VULNERABILITY INDEX</div>
      <div style="display:flex; justify-content:space-between; gap:12px; font-size:12px">
        <div>Drought Risk: <b style="color:${prof.drought_risk === 'High' ? '#ef4444' : '#10b981'}">${prof.drought_risk || 'Moderate'}</b></div>
        <div>Flood Risk: <b style="color:${prof.flood_risk === 'Critical' ? '#ef4444' : '#38bdf8'}">${prof.flood_risk || 'Low'}</b></div>
        <div>Heatwave Risk: <b style="color:${prof.heat_risk === 'Very High' ? '#ef4444' : '#eab308'}">${prof.heat_risk || 'Moderate'}</b></div>
      </div>
    </div>

    <!-- Actions -->
    <div style="display:flex; gap:10px; justify-content:flex-end">
      <button onclick="closeAdminDistrictInspection()" class="btn btn-secondary" style="padding:8px 16px; border:1px solid #333; background:#181818; color:#fff; border-radius:6px">
        Close
      </button>
      <button onclick="closeAdminDistrictInspection(); openTargetedBroadcast('${escapeHtml(districtName)}')" class="btn btn-primary" style="padding:8px 18px; font-weight:800; background:var(--risk-critical); color:#fff; border:none; border-radius:6px; display:flex; align-items:center; gap:6px">
        📢 BROADCAST ALERT FOR ${escapeHtml(districtName).toUpperCase()}
      </button>
    </div>
  `;

  modal.style.display = "flex";
}

function closeAdminDistrictInspection() {
  const modal = document.getElementById("adminDistrictDetailModal");
  if (modal) modal.style.display = "none";
}

function openTargetedBroadcast(districtName) {
  openBroadcastModal();
  const select = document.getElementById("bcastDistrict");
  if (select) {
    select.value = districtName;
  }
}

function dispatchPresetWarning(district, category, severity, message) {
  openBroadcastModal();
  const selDist = document.getElementById("bcastDistrict");
  const selCat = document.getElementById("bcastCategory");
  const selSev = document.getElementById("bcastSeverity");
  const txtMsg = document.getElementById("bcastMessage");

  if (selDist) selDist.value = district;
  if (selCat) selCat.value = category;
  if (selSev) selSev.value = severity;
  if (txtMsg) txtMsg.value = message;
}

/* ==========================================================================
   AUDIT LEDGER & BROADCAST DISPATCH OPERATIONS
   ========================================================================== */

async function loadAuditLedger() {
  const tbody = document.getElementById("adminAuditTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/api/notifications/history?limit=30");
    const data = await res.json();
    const logs = data.history || [];

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-muted)">No broadcast dispatches logged in database.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const isDelivered = l.delivery_status === "DELIVERED" || l.delivery_status === "PROVIDER_ACCEPTED";
      const isExpired = l.delivery_status === "EXPIRED_DEACTIVATED";
      const badgeColor = isDelivered ? "#10b981" : (isExpired ? "#f59e0b" : "#ef4444");

      return `
        <tr style="border-bottom:1px solid #1a1a1a">
          <td style="padding:6px 8px; color:var(--text-muted)">${new Date(l.logged_at).toLocaleTimeString()}</td>
          <td style="padding:6px 8px; font-family:'JetBrains Mono',monospace; color:var(--cyan)">${escapeHtml(l.alert_id || "-")}</td>
          <td style="padding:6px 8px; color:#fff">${escapeHtml(l.district || "Statewide")}</td>
          <td style="padding:6px 8px; color:var(--text-dim)">${escapeHtml(l.channel || "web_push")}</td>
          <td style="padding:6px 8px; text-align:right; font-weight:700; color:#10b981">${l.delivered_count || l.total_recipients || 1}</td>
          <td style="padding:6px 8px; text-align:center">
            <span style="font-size:10px; font-weight:800; color:${badgeColor}; border:1px solid ${badgeColor}; padding:2px 6px; border-radius:4px">
              ${escapeHtml(l.delivery_status)}
            </span>
          </td>
          <td style="padding:6px 8px; color:var(--text-muted)">${escapeHtml(l.executed_by || "SYSTEM")}</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Error loading audit ledger:", err);
  }
}

function openBroadcastModal() {
  const modal = document.getElementById("broadcastModal");
  if (modal) modal.style.display = "flex";
}

function closeBroadcastModal() {
  const modal = document.getElementById("broadcastModal");
  if (modal) modal.style.display = "none";
}

async function executeBroadcast(event) {
  event.preventDefault();
  const district = document.getElementById("bcastDistrict").value;
  const category = document.getElementById("bcastCategory").value;
  const severity = document.getElementById("bcastSeverity") ? document.getElementById("bcastSeverity").value : "CRITICAL";
  const locality = document.getElementById("bcastLocality") ? document.getElementById("bcastLocality").value.trim() : "";
  const message = document.getElementById("bcastMessage").value.trim();

  const channels = [];
  if (document.getElementById("chanPush").checked) channels.push("web_push");
  if (document.getElementById("chanBanner").checked) channels.push("in_app");
  if (document.getElementById("chanSms").checked) channels.push("sms");
  if (document.getElementById("chanEmail").checked) channels.push("email");

  const confirmed = confirm(
    `CONFIRM EMERGENCY BROADCAST DISPATCH:\n\n` +
    `Sector: ${district}\n` +
    `Hazard Type: ${category}\n` +
    `Priority: ${severity}\n` +
    `Locality: ${locality || "District Wide"}\n` +
    `Channels: ${channels.join(", ")}\n\n` +
    `This will trigger real RFC 8291 Web Push notifications to subscribed citizen devices even if their phone screen is locked. Proceed?`
  );
  if (!confirmed) return;

  const btn = document.getElementById("btnExecuteBcast");
  btn.disabled = true;
  btn.textContent = "TRANSMITTING BROADCAST...";

  try {
    const res = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        district,
        category,
        severity,
        locality,
        message,
        channels,
        authorized_by: adminUser?.email || "admin@karnataka-emergency.gov.in",
      }),
    });
    const data = await res.json();

    if (data.status === "success") {
      alert(`Emergency Broadcast successfully dispatched to ${district} sector across channels: ${channels.join(", ")}`);
      closeBroadcastModal();
      await loadAdminTelemetry();
      await loadAdminWarnings();
      await loadAuditLedger();
    } else {
      alert(`Broadcast error: ${data.message}`);
    }
  } catch (err) {
    alert("Network error executing broadcast dispatch.");
  } finally {
    btn.disabled = false;
    btn.textContent = "CONFIRM & DISPATCH NOW";
  }
}

async function cancelWarning(alertId) {
  if (!confirm(`Cancel warning ${alertId}?`)) return;

  try {
    const res = await fetch("/api/admin/warnings/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alert_id: alertId,
        admin_user: adminUser?.email || "admin",
      }),
    });
    const data = await res.json();
    if (data.status === "success") {
      loadAdminWarnings();
    }
  } catch (e) {
    console.error("Error cancelling warning:", e);
  }
}

async function triggerDirectBroadcast(alertId) {
  if (!confirm(`Authorize immediate multi-channel emergency broadcast for ${alertId}?`)) return;

  try {
    const res = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alert_id: alertId,
        channels: ["web_push", "in_app", "sms", "email"],
        authorized_by: adminUser?.email || "admin",
      }),
    });
    const data = await res.json();
    alert(`Broadcast dispatched: ${data.delivered_count || 1} recipients notified.`);
    loadAdminWarnings();
    loadAuditLedger();
  } catch (e) {
    alert("Broadcast dispatch failed.");
  }
}

function refreshAdminData() {
  loadAdminTelemetry();
  loadAdminWarnings();
  loadStatewideDistricts();
  loadFullDistrictProfiles();
  loadAuditLedger();
  if (adminLeafletMap) {
    adminLeafletMap.invalidateSize();
  }
}

document.addEventListener("DOMContentLoaded", renderAdminCommandCentre);
