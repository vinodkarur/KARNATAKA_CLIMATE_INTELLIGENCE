/* ==========================================================================
   user_dashboard.js — Personalized Citizen Weather & Warning Dashboard
   ========================================================================== */

let currentUser = null;
let activeDistrict = "Bengaluru Urban";
let userForecastData = null;

var ALL_DISTRICTS = window.ALL_DISTRICTS || [
  "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban",
  "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga",
  "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri",
  "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur",
  "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada",
  "Vijayanagara", "Vijayapura", "Yadgir"
];

async function renderUserDashboard() {
  const main = layout("user-dashboard");

  // Check login
  const storedUser = localStorage.getItem("kci_user");
  if (!storedUser) {
    main.innerHTML = `
      <div style="max-width:500px; margin:60px auto; text-align:center; padding:32px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:12px">
        <div style="font-size:36px; margin-bottom:12px">🔒</div>
        <h2 style="color:var(--text-main); font-weight:800; font-size:20px">Authentication Required</h2>
        <p style="color:var(--text-dim); font-size:13px; margin:10px 0 20px">
          Please log in to view your personalized district weather, active emergency warnings, and notification settings.
        </p>
        <div style="display:flex; gap:10px; justify-content:center">
          <a href="/login" class="btn btn-primary" style="padding:10px 20px; font-weight:700">Sign In</a>
          <a href="/register" class="btn btn-secondary" style="padding:10px 20px; font-weight:700">Register</a>
        </div>
      </div>
    `;
    return;
  }

  currentUser = JSON.parse(storedUser);
  activeDistrict = currentUser.primary_district || "Bengaluru Urban";

  const districtOptions = ALL_DISTRICTS.map(d =>
    `<option value="${d}" ${d === activeDistrict ? "selected" : ""}>${d}</option>`
  ).join("");

  main.innerHTML = `
    <!-- 1. DASHBOARD HEADER -->
    <div class="page-header" style="margin-bottom:20px">
      <div>
        <h1 class="page-title" style="color:var(--text-main); font-size:24px; font-weight:800; display:flex; align-items:center; gap:10px">
          <span>👤</span> Citizen Weather & Emergency Dashboard
        </h1>
        <p class="page-description" style="color:var(--text-dim); font-size:13px; margin-top:4px">
          Welcome back, <strong style="color:var(--text-main)">${escapeHtml(currentUser.full_name)}</strong>. 
          Real-time weather telemetry and multi-hazard early warnings for <strong style="color:var(--cyan)" id="displayDistrictName">${activeDistrict}</strong>.
        </p>
      </div>

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <div style="display:flex; align-items:center; gap:8px">
          <label style="font-size:11.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase">Switch District:</label>
          <select id="userDistrictSelect" onchange="changeUserDistrict(this.value)"
                  style="background:var(--bg-surface); color:#fff; border:1px solid var(--border-subtle); padding:7px 12px; border-radius:6px; font-size:13px">
            ${districtOptions}
          </select>
        </div>
        <button onclick="handleLogout()" class="btn btn-secondary" style="font-size:12px; padding:7px 12px; border:1px solid #333; background:#181818; color:#fff; border-radius:6px">
          🚪 Logout
        </button>
      </div>
    </div>

    <!-- 2. EMERGENCY ALERTS BANNER FOR DISTRICT -->
    <div id="userAlertsSection" style="margin-bottom:20px"></div>

    <!-- 3. CURRENT WEATHER & TODAY'S HAZARD KPI CARDS -->
    <div class="grid grid-4" style="margin-bottom:20px">
      <div class="card kpi-card">
        <div class="kpi-label">CURRENT TEMPERATURE</div>
        <div class="kpi-value" id="kpiCurrentTemp" style="color:var(--cyan)">-- °C</div>
        <div class="kpi-sub" id="kpiApparentTemp">Feels like: -- °C</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">PRECIPITATION (CURRENT)</div>
        <div class="kpi-value" id="kpiCurrentRain" style="color:#38bdf8">-- mm</div>
        <div class="kpi-sub" id="kpiRainCondition">Condition: Loading...</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">RELATIVE HUMIDITY</div>
        <div class="kpi-value" id="kpiHumidity" style="color:#10b981">-- %</div>
        <div class="kpi-sub" id="kpiPressure">Pressure: -- hPa</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">SURFACE WIND & GUSTS</div>
        <div class="kpi-value" id="kpiWind" style="color:#f59e0b">-- km/h</div>
        <div class="kpi-sub" id="kpiGusts">Peak Gusts: -- km/h</div>
      </div>
    </div>

    <!-- 4. 7-DAY SYNOPTIC FORECAST HORIZON -->
    <div class="card" style="margin-bottom:20px; background:var(--bg-surface); border:1px solid var(--border-subtle)">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px">
        <div style="font-weight:700; color:var(--text-main); font-size:15px">
          📅 7-Day Numerical Weather Forecast Outlook
        </div>
        <div style="font-size:11.5px; color:var(--text-muted)">
          Provider: Open-Meteo High-Resolution NWP • Updated: <span id="forecastUpdateTime">Live</span>
        </div>
      </div>

      <div id="forecastCardsContainer" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-top:14px">
        <div style="text-align:center; padding:20px; color:var(--text-muted)">Loading 7-day weather forecast...</div>
      </div>
    </div>

    <!-- 5. NOTIFICATION PREFERENCES & DEVICE SUBSCRIPTION -->
    <div class="grid grid-2" style="margin-bottom:20px">
      <!-- Device Push Notification Control -->
      <div class="card" style="background:var(--bg-surface); border:1px solid var(--border-subtle)">
        <div class="card-title" style="font-weight:700; color:var(--text-main); font-size:15px">
          📱 Device Emergency Push Notifications
        </div>
        <p style="font-size:12.5px; color:var(--text-dim); margin-top:6px; line-height:1.5">
          Receive real-time push notifications on this browser for severe weather warnings, flash flood advisories, and extreme heat alerts issued for <strong>${activeDistrict}</strong>.
        </p>

        <!-- Status Summary Banner -->
        <div id="pushStatusBanner" style="margin:14px 0; padding:12px; background:rgba(0,240,255,0.06); border:1px solid rgba(0,240,255,0.25); border-radius:6px; font-size:12.5px">
          Status: <strong id="pushStatusText" style="color:var(--cyan)">Checking subscription...</strong>
        </div>

        <!-- Android Chrome Permission Instructions Box (Dynamic) -->
        <div id="permGuideBox" style="display:none; margin-bottom:12px; padding:12px 14px; background:rgba(234,179,8,0.08); border:1px solid rgba(234,179,8,0.3); border-radius:6px; font-size:12px; color:#fde047; line-height:1.5">
        </div>

        <!-- Primary Action Button -->
        <button id="btnSubscribePush" onclick="togglePushSubscription()" class="btn btn-primary"
                style="padding:12px 18px; font-weight:800; font-size:13px; background:var(--cyan); color:#050505; border:none; border-radius:6px; cursor:pointer; width:100%; margin-bottom:12px; transition:all 0.2s">
          🔔 ENABLE EMERGENCY PUSH NOTIFICATIONS
        </button>

        <!-- Real-Time Push Diagnostic Telemetry Panel (Accurate Required States) -->
        <div style="background:#0a0a0a; border:1px solid #262626; border-radius:6px; padding:12px; font-size:11.5px; font-family:'JetBrains Mono', monospace">
          <div style="color:var(--cyan); font-weight:700; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center">
            <span>🔍 WEB PUSH DIAGNOSTIC TELEMETRY</span>
            <span id="diagDeviceType" style="color:var(--text-muted); font-size:11px">Detecting...</span>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:6px">
            <div>• Service Worker: <span id="diagSwStatus" style="color:#eab308">INACTIVE</span></div>
            <div>• Permission: <span id="diagPermission" style="color:#eab308">DEFAULT</span></div>
            <div>• PushManager: <span id="diagPushManager" style="color:#eab308">CHECKING</span></div>
            <div>• Subscription: <span id="diagSubStatus" style="color:#888">NONE</span></div>
          </div>
          <div style="margin-top:6px; border-top:1px solid #1f1f1f; padding-top:6px; display:grid; grid-template-columns: 1fr 1fr; gap:6px">
            <div>• Endpoint: <span id="diagEndpoint" style="color:#888">NONE</span></div>
            <div>• Backend API: <span id="diagApiStatus" style="color:#eab308">CONNECTING...</span></div>
          </div>
          <div style="margin-top:6px; border-top:1px solid #1f1f1f; padding-top:6px">
            <div>• MySQL: <span id="diagMysqlStatus" style="color:#888">NOT SAVED</span></div>
          </div>
          <div id="diagErrorBox" style="display:none; margin-top:8px; padding:8px; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.4); color:#ef4444; border-radius:4px; font-size:11px; word-break:break-all"></div>
        </div>
      </div>

      <!-- Channel & Threshold Preferences -->
      <div class="card" style="background:var(--bg-surface); border:1px solid var(--border-subtle)">
        <div class="card-title" style="font-weight:700; color:var(--text-main); font-size:15px">
          ⚙️ Notification Channel & Severity Settings
        </div>

        <form id="prefForm" onsubmit="saveNotificationPreferences(event)" style="margin-top:12px">
          <div style="margin-bottom:12px">
            <label style="font-size:11.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; display:block; margin-bottom:6px">
              Minimum Alert Severity to Notify:
            </label>
            <select id="prefMinSeverity" class="form-select" style="width:100%; padding:8px 12px; background:var(--bg-base); color:#fff; border:1px solid var(--border-subtle); border-radius:6px; font-size:13px">
              <option value="YELLOW">🟡 Yellow Advisory (All Alerts)</option>
              <option value="ORANGE" selected>🟠 Orange High Watch (High & Critical)</option>
              <option value="RED">🔴 Red Critical Emergency (Extreme Events Only)</option>
            </select>
          </div>

          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px">
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-dim); cursor:pointer">
              <input type="checkbox" id="prefPush" checked> <span>Web Push & Browser Notification</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-dim); cursor:pointer">
              <input type="checkbox" id="prefEmail" checked> <span>Email Bulletins (${escapeHtml(currentUser.email)})</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-dim); cursor:pointer">
              <input type="checkbox" id="prefSms"> <span>SMS Alerts (${escapeHtml(currentUser.mobile_number || "Not configured")})</span>
            </label>
          </div>

          <button type="submit" id="btnSavePref" class="btn btn-secondary" style="padding:8px 14px; font-size:12.5px; font-weight:700; background:#181818; color:#fff; border:1px solid #333; border-radius:6px">
            Save Preferences
          </button>
          <span id="prefSaveSuccess" style="display:none; color:#10b981; font-size:12px; margin-left:10px; font-weight:700">✓ Saved!</span>
        </form>
      </div>
    </div>
  `;

  await loadUserForecast();
  await loadUserDistrictAlerts();
  checkPushStatus();
}

async function loadUserForecast() {
  try {
    const res = await fetch(`/api/weather/forecast/7day?district=${encodeURIComponent(activeDistrict)}`);
    const data = await res.json();
    userForecastData = data;

    if (data.status === "success" && data.current) {
      const c = data.current;
      document.getElementById("kpiCurrentTemp").textContent = `${c.temperature_c} °C`;
      document.getElementById("kpiApparentTemp").textContent = `Feels like: ${c.apparent_temperature_c} °C`;
      document.getElementById("kpiCurrentRain").textContent = `${c.rainfall_mm} mm`;
      document.getElementById("kpiRainCondition").textContent = `Condition: ${c.condition} ${c.icon || ""}`;
      document.getElementById("kpiHumidity").textContent = `${c.relative_humidity} %`;
      document.getElementById("kpiPressure").textContent = `Pressure: ${c.surface_pressure_hpa || "--"} hPa`;
      document.getElementById("kpiWind").textContent = `${c.wind_speed_kmh} km/h`;
      document.getElementById("kpiGusts").textContent = `Peak Gusts: ${c.wind_gusts_kmh || c.wind_speed_kmh} km/h`;

      if (data.provenance?.retrieved_at) {
        document.getElementById("forecastUpdateTime").textContent = new Date(data.provenance.retrieved_at).toLocaleTimeString();
      }

      // Render 7-day cards
      renderForecastCards(data.daily || []);
    }
  } catch (err) {
    console.error("Error loading user forecast:", err);
  }
}

function renderForecastCards(daily) {
  const container = document.getElementById("forecastCardsContainer");
  if (!container) return;

  if (!daily || daily.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-muted)">Forecast horizon unavailable.</div>`;
    return;
  }

  container.innerHTML = daily.map(d => {
    let badgeBorder = "#252525";
    let badgeBg = "rgba(255,255,255,0.04)";
    let badgeText = "#10b981";

    if (d.hazard_level === "RED") {
      badgeBorder = "#ef4444";
      badgeBg = "rgba(239,68,68,0.15)";
      badgeText = "#ef4444";
    } else if (d.hazard_level === "ORANGE") {
      badgeBorder = "#f97316";
      badgeBg = "rgba(249,115,22,0.15)";
      badgeText = "#f97316";
    } else if (d.hazard_level === "YELLOW") {
      badgeBorder = "#f59e0b";
      badgeBg = "rgba(245,158,11,0.15)";
      badgeText = "#f59e0b";
    }

    return `
      <div style="background:var(--bg-base); border:1px solid ${badgeBorder}; border-radius:8px; padding:12px 10px; text-align:center; display:flex; flex-direction:column; justify-content:space-between">
        <div>
          <div style="font-weight:700; font-size:12px; color:var(--text-main)">${escapeHtml(d.day_name)}</div>
          <div style="font-size:10px; color:var(--text-muted); margin-bottom:6px">${escapeHtml(d.display_date?.split(" ")[1]?.replace("(", "") || d.date)}</div>
          <div style="font-size:24px; margin:4px 0">${d.icon || "🌤️"}</div>
          <div style="font-size:11px; color:var(--text-dim); height:28px; line-height:1.2; display:flex; align-items:center; justify-content:center">
            ${escapeHtml(d.condition)}
          </div>
        </div>

        <div style="margin-top:10px; padding-top:8px; border-top:1px solid #222">
          <div style="font-size:13px; font-weight:800; color:var(--text-main)">
            ${d.max_temp}° <span style="font-size:11px; font-weight:500; color:var(--text-muted)">/ ${d.min_temp}°</span>
          </div>
          <div style="font-size:11px; color:#38bdf8; margin-top:2px">
            💧 ${d.rain_sum_mm}mm <span style="font-size:9.5px">(${d.rain_prob}%)</span>
          </div>
          <div style="margin-top:6px">
            <span style="font-size:9.5px; font-weight:800; padding:2px 6px; border-radius:4px; background:${badgeBg}; color:${badgeText}; border:1px solid ${badgeBorder}">
              ${d.hazard_level}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function loadUserDistrictAlerts() {
  const container = document.getElementById("userAlertsSection");
  if (!container) return;

  try {
    const res = await fetch(`/api/alerts/active?district=${encodeURIComponent(activeDistrict)}`);
    const data = await res.json();
    const alerts = data.alerts || [];

    if (alerts.length === 0) {
      container.innerHTML = `
        <div style="padding:14px 18px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:8px; display:flex; align-items:center; gap:12px">
          <span style="font-size:20px">🛡️</span>
          <div>
            <strong style="color:#10b981; font-size:13.5px">ALL CLEAR — NO ACTIVE EMERGENCY WARNINGS FOR ${activeDistrict.toUpperCase()}</strong>
            <div style="font-size:12px; color:var(--text-dim); margin-top:2px">
              Meteorological parameters are within normal seasonal bounds. Emergency services remain on baseline monitoring.
            </div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = alerts.map(a => `
      <div style="margin-bottom:12px; padding:16px 20px; background:${a.bg_color || "rgba(239,68,68,0.15)"}; border:1px solid ${a.badge_color || "#ef4444"}; border-radius:8px">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px">
          <div style="display:flex; align-items:center; gap:10px">
            <span style="font-size:22px">🚨</span>
            <div>
              <span class="badge" style="background:${a.badge_color}; color:#050505; font-weight:800; font-size:10.5px; padding:3px 8px; border-radius:4px">
                ${escapeHtml(a.severity_tier || a.severity)}
              </span>
              <strong style="font-size:14px; color:#fff; margin-left:8px">${escapeHtml(a.title)}</strong>
            </div>
          </div>
          <div style="font-size:11px; color:var(--text-muted)">
            Alert ID: <span style="font-family:'JetBrains Mono',monospace">${escapeHtml(a.alert_id)}</span>
          </div>
        </div>

        <p style="font-size:13px; color:var(--text-main); margin:10px 0 8px; line-height:1.5">
          ${escapeHtml(a.rationale)}
        </p>

        <div style="font-size:12px; color:var(--text-dim)">
          <strong>Recommended Citizen Action:</strong>
          <ul style="margin:6px 0 0 20px; line-height:1.4">
            ${(a.recommended_actions || []).map(act => `<li>${escapeHtml(act)}</li>`).join("")}
          </ul>
        </div>
      </div>
    `).join("");
  } catch (err) {
    console.error("Error loading district alerts:", err);
  }
}

function changeUserDistrict(newDistrict) {
  activeDistrict = newDistrict;
  const nameEl = document.getElementById("displayDistrictName");
  if (nameEl) nameEl.textContent = newDistrict;
  loadUserForecast();
  loadUserDistrictAlerts();
}

// Universal permission requester with Promise/Callback polyfill & safety timeout
function requestNotificationPermissionWithTimeout(timeoutMs = 12000) {
  return new Promise((resolve) => {
    let finished = false;

    // Safety timeout: never leave the user hanging
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        console.warn("Notification.requestPermission timed out after " + timeoutMs + "ms");
        resolve({ status: Notification.permission, timedOut: true });
      }
    }, timeoutMs);

    const onResult = (perm) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve({ status: perm || Notification.permission, timedOut: false });
      }
    };

    try {
      // Call requestPermission with callback syntax for older WebView/Android, and check returned Promise
      const res = Notification.requestPermission(onResult);
      if (res && typeof res.then === "function") {
        res.then(onResult).catch((err) => {
          console.warn("requestPermission promise rejected:", err);
          onResult(Notification.permission);
        });
      }
    } catch (e) {
      console.warn("requestPermission exception:", e);
      onResult(Notification.permission);
    }
  });
}

function urlBase64ToUint8Array(base64String) {
  const clean = (base64String || "").trim();
  const padding = "=".repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function checkPushStatus() {
  const textEl = document.getElementById("pushStatusText");
  const btn = document.getElementById("btnSubscribePush");
  const guideBox = document.getElementById("permGuideBox");
  const diagDevice = document.getElementById("diagDeviceType");
  const diagSw = document.getElementById("diagSwStatus");
  const diagPerm = document.getElementById("diagPermission");
  const diagPm = document.getElementById("diagPushManager");
  const diagSub = document.getElementById("diagSubStatus");
  const diagEndp = document.getElementById("diagEndpoint");
  const diagApi = document.getElementById("diagApiStatus");
  const diagMysql = document.getElementById("diagMysqlStatus");
  const errBox = document.getElementById("diagErrorBox");

  if (errBox) { errBox.style.display = "none"; errBox.textContent = ""; }

  // 1. Device Telemetry
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isMobile = isAndroid || /iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (diagDevice) {
    diagDevice.textContent = isAndroid ? "Android Chrome 📱" : (isMobile ? "Mobile Browser 📱" : "Desktop Browser 💻");
    diagDevice.style.color = isAndroid ? "#10b981" : "var(--cyan)";
  }

  // 2. Permission Check (Accurate Required States: DEFAULT / GRANTED / DENIED)
  const hasNotif = ("Notification" in window);
  let currentPerm = hasNotif ? Notification.permission : "UNSUPPORTED";
  if (diagPerm) {
    if (currentPerm === "granted") {
      diagPerm.textContent = "GRANTED";
      diagPerm.style.color = "#10b981";
    } else if (currentPerm === "denied") {
      diagPerm.textContent = "DENIED";
      diagPerm.style.color = "#ef4444";
    } else if (currentPerm === "default") {
      diagPerm.textContent = "DEFAULT";
      diagPerm.style.color = "#f59e0b";
    } else {
      diagPerm.textContent = "UNSUPPORTED";
      diagPerm.style.color = "#ef4444";
    }
  }

  // 3. PushManager Availability (Accurate Required States: AVAILABLE / UNAVAILABLE)
  const hasSW = ("serviceWorker" in navigator);
  const hasPM = hasSW && ("PushManager" in window);
  if (diagPm) {
    diagPm.textContent = hasPM ? "AVAILABLE" : "UNAVAILABLE";
    diagPm.style.color = hasPM ? "#10b981" : "#ef4444";
  }

  if (!hasNotif || !hasSW || !hasPM) {
    if (textEl) textEl.textContent = "Web Push notifications are not supported by this browser.";
    if (btn) {
      btn.textContent = "❌ WEB PUSH NOT SUPPORTED";
      btn.disabled = true;
    }
    return;
  }

  // 4. Backend API Connectivity Check (Accurate Required States: CONNECTED / FAILED)
  let backendOk = false;
  try {
    const vRes = await fetch("/api/notifications/vapid-key", { method: "GET" });
    backendOk = vRes.ok;
    if (diagApi) {
      diagApi.textContent = backendOk ? "CONNECTED" : "FAILED";
      diagApi.style.color = backendOk ? "#10b981" : "#ef4444";
    }
  } catch (apiErr) {
    if (diagApi) {
      diagApi.textContent = "FAILED";
      diagApi.style.color = "#ef4444";
    }
  }

  // 5. Service Worker Status (Accurate Required States: ACTIVE / INACTIVE)
  let reg = null;
  try {
    reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
    await navigator.serviceWorker.ready;
    if (diagSw) {
      diagSw.textContent = "ACTIVE";
      diagSw.style.color = "#10b981";
    }
  } catch (swErr) {
    if (diagSw) {
      diagSw.textContent = "INACTIVE";
      diagSw.style.color = "#ef4444";
    }
  }

  // 6. PushSubscription & MySQL Sync Check (Accurate Required States: ACTIVE / NONE, REGISTERED / NONE, SAVED / NOT SAVED)
  try {
    if (reg) {
      const existingSub = await reg.pushManager.getSubscription();
      if (existingSub) {
        if (diagSub) {
          diagSub.textContent = "ACTIVE";
          diagSub.style.color = "#10b981";
        }
        if (diagEndp) {
          const endpStr = existingSub.endpoint || "";
          const masked = endpStr.length > 36 ? endpStr.slice(0, 24) + "..." + endpStr.slice(-8) : endpStr;
          diagEndp.textContent = `REGISTERED (${masked})`;
          diagEndp.style.color = "#10b981";
        }

        // Check MySQL registration
        try {
          const statusRes = await fetch(`/api/notifications/status?endpoint=${encodeURIComponent(existingSub.endpoint)}`);
          const statusData = await statusRes.json();
          if (statusData && statusData.registered && statusData.is_active) {
            if (diagMysql) {
              diagMysql.textContent = `SAVED (ID #${statusData.subscription_id})`;
              diagMysql.style.color = "#10b981";
            }
            if (textEl) {
              textEl.style.color = "#10b981";
              textEl.textContent = `Active (Authorized for ${activeDistrict})`;
            }
            if (btn) {
              btn.textContent = "🔔 NOTIFICATIONS ACTIVE (DEVICE REGISTERED)";
              btn.disabled = false;
            }
            if (guideBox) guideBox.style.display = "none";
            return;
          } else {
            if (diagMysql) {
              diagMysql.textContent = "NOT SAVED";
              diagMysql.style.color = "#f59e0b";
            }
            if (textEl) {
              textEl.style.color = "#f59e0b";
              textEl.textContent = "Subscription exists locally but not confirmed in MySQL. Tap below to sync.";
            }
            if (btn) {
              btn.textContent = "🔄 SYNC SUBSCRIPTION TO DATABASE";
              btn.disabled = false;
            }
            return;
          }
        } catch (dbErr) {
          if (diagMysql) {
            diagMysql.textContent = "NOT SAVED";
            diagMysql.style.color = "#ef4444";
          }
        }
      } else {
        if (diagSub) {
          diagSub.textContent = "NONE";
          diagSub.style.color = currentPerm === "granted" ? "#f59e0b" : "#888";
        }
        if (diagEndp) {
          diagEndp.textContent = "NONE";
          diagEndp.style.color = "#888";
        }
        if (diagMysql) {
          diagMysql.textContent = "NOT SAVED";
          diagMysql.style.color = "#888";
        }
      }
    }
  } catch (subErr) {
    console.warn("Subscription check warning:", subErr);
  }

  // 7. Update UI based on Permission State
  if (currentPerm === "granted") {
    if (textEl) {
      textEl.style.color = "#f59e0b";
      textEl.textContent = "Permission is GRANTED. Tap below to complete device push registration.";
    }
    if (btn) {
      btn.textContent = "🔔 COMPLETE DEVICE PUSH REGISTRATION";
      btn.disabled = false;
    }
    if (guideBox) guideBox.style.display = "none";
  } else if (currentPerm === "denied") {
    if (textEl) {
      textEl.style.color = "#ef4444";
      textEl.textContent = "Notifications are blocked in Chrome site settings.";
    }
    if (btn) {
      btn.textContent = "⚠️ PERMISSION DENIED (VIEW INSTRUCTIONS)";
      btn.disabled = false; // Keep clickable to view instructions!
    }
    if (guideBox) {
      guideBox.style.display = "block";
      guideBox.innerHTML = `
        <strong>⚠️ How to Enable Notifications in Android Chrome:</strong><br>
        1. Tap the tune / lock icon 🔒 on the left of the Chrome address bar.<br>
        2. Tap <strong>Permissions</strong> (or <strong>Site settings</strong>).<br>
        3. Tap <strong>Notifications</strong> and select <strong>Allow</strong>.<br>
        4. Return here and tap the button above to register device.
      `;
    }
  } else {
    // DEFAULT
    if (textEl) {
      textEl.style.color = "var(--text-main)";
      textEl.textContent = `Emergency push alerts not yet enabled for ${activeDistrict}.`;
    }
    if (btn) {
      btn.textContent = "🔔 ENABLE EMERGENCY PUSH NOTIFICATIONS";
      btn.disabled = false;
    }
    if (guideBox) guideBox.style.display = "none";
  }
}

async function togglePushSubscription() {
  const textEl = document.getElementById("pushStatusText");
  const btn = document.getElementById("btnSubscribePush");
  const guideBox = document.getElementById("permGuideBox");
  const diagPerm = document.getElementById("diagPermission");
  const diagSw = document.getElementById("diagSwStatus");
  const diagSub = document.getElementById("diagSubStatus");
  const diagEndp = document.getElementById("diagEndpoint");
  const diagApi = document.getElementById("diagApiStatus");
  const diagMysql = document.getElementById("diagMysqlStatus");
  const errBox = document.getElementById("diagErrorBox");

  if (errBox) { errBox.style.display = "none"; errBox.textContent = ""; }

  // 1. Check browser capabilities
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("Web Push notifications are not supported in this browser.");
    return;
  }

  // 2. Handle DENIED state immediately without calling requestPermission
  if (Notification.permission === "denied") {
    if (guideBox) {
      guideBox.style.display = "block";
      guideBox.innerHTML = `
        <strong>⚠️ Notifications are currently blocked in Chrome:</strong><br>
        1. Tap the tune / lock icon 🔒 on the left of the Chrome address bar.<br>
        2. Tap <strong>Permissions</strong> (or <strong>Site settings</strong>).<br>
        3. Tap <strong>Notifications</strong> and choose <strong>Allow</strong>.<br>
        4. Tap this button again after allowing.
      `;
      guideBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    checkPushStatus();
    return;
  }

  // 3. Handle Permission Request if DEFAULT
  let perm = Notification.permission;
  if (perm !== "granted") {
    btn.textContent = "⏳ WAITING FOR PERMISSION PROMPT...";
    if (textEl) textEl.textContent = "Please tap 'Allow' when Chrome prompts for notification permission...";

    if (guideBox) {
      guideBox.style.display = "block";
      guideBox.innerHTML = `
        <strong>🔔 Action Required:</strong><br>
        Please tap <strong>Allow</strong> on the Chrome notification prompt.<br>
        <em>Note: If no prompt appeared on screen, Android Chrome may have quieter prompts active. Look at the address bar for a small bell icon 🔕 or tap the 🔒 icon next to the URL -> Permissions -> Notifications -> Allow.</em>
      `;
    }

    try {
      const { status, timedOut } = await requestNotificationPermissionWithTimeout(12000);
      perm = status;
      if (timedOut && perm === "default") {
        if (textEl) textEl.textContent = "Permission prompt timed out. Please enable notifications in Chrome settings.";
        if (guideBox) {
          guideBox.innerHTML = `
            <strong>⚠️ Permission prompt timed out or was hidden by Chrome:</strong><br>
            Android Chrome may have suppressed the popup dialog (Quieter Prompts).<br>
            To enable manually:<br>
            1. Tap the tune / lock icon 🔒 in the Chrome address bar.<br>
            2. Tap <strong>Permissions</strong> -> <strong>Notifications</strong> -> <strong>Allow</strong>.<br>
            3. Then tap the button below.
          `;
        }
        btn.textContent = "🔔 RETRY NOTIFICATION REGISTRATION";
        btn.disabled = false;
        checkPushStatus();
        return;
      }
    } catch (permErr) {
      console.warn("Permission error:", permErr);
      perm = Notification.permission;
    }
  }

  if (perm !== "granted") {
    checkPushStatus();
    return;
  }

  // Permission is GRANTED! Proceed to Service Worker & PushManager
  if (guideBox) guideBox.style.display = "none";
  if (diagPerm) {
    diagPerm.textContent = "GRANTED";
    diagPerm.style.color = "#10b981";
  }

  btn.disabled = true;
  btn.textContent = "⏳ INITIALIZING SERVICE WORKER...";
  if (textEl) textEl.textContent = "Activating Service Worker...";

  let reg = null;
  try {
    reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    if (diagSw) {
      diagSw.textContent = "ACTIVE";
      diagSw.style.color = "#10b981";
    }
  } catch (swErr) {
    console.error("SW error:", swErr);
    if (errBox) {
      errBox.style.display = "block";
      errBox.textContent = `Service Worker error: ${swErr.message || swErr}`;
    }
    btn.disabled = false;
    btn.textContent = "🔔 RETRY NOTIFICATION REGISTRATION";
    checkPushStatus();
    return;
  }

  // Fetch VAPID Public Key
  btn.textContent = "⏳ RETRIEVING APPLICATION KEYS...";
  if (textEl) textEl.textContent = "Retrieving VAPID server authorization...";
  let vapidKey = null;
  try {
    const vRes = await fetch("/api/notifications/vapid-key");
    if (!vRes.ok) throw new Error(`VAPID endpoint returned HTTP ${vRes.status}`);
    const vData = await vRes.json();
    vapidKey = (vData.public_key || "").trim();
    if (!vapidKey) throw new Error("VAPID public key empty in response.");
    if (diagApi) {
      diagApi.textContent = "CONNECTED";
      diagApi.style.color = "#10b981";
    }
  } catch (vErr) {
    console.error("VAPID fetch error:", vErr);
    if (errBox) {
      errBox.style.display = "block";
      errBox.textContent = `Server API Error: ${vErr.message || vErr}`;
    }
    if (diagApi) {
      diagApi.textContent = "FAILED";
      diagApi.style.color = "#ef4444";
    }
    btn.disabled = false;
    btn.textContent = "🔔 RETRY NOTIFICATION REGISTRATION";
    checkPushStatus();
    return;
  }

  // Check existing or create new PushSubscription
  btn.textContent = "⏳ CONNECTING TO PUSH SERVICE...";
  if (textEl) textEl.textContent = "Registering push token with Google FCM...";

  let pushSub = null;
  try {
    const applicationServerKey = urlBase64ToUint8Array(vapidKey);
    pushSub = await reg.pushManager.getSubscription();

    if (!pushSub) {
      pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey,
      });
    }
  } catch (subErr) {
    console.error("PushManager.subscribe failed:", subErr);
    if (errBox) {
      errBox.style.display = "block";
      errBox.textContent = `PushManager subscription failed: ${subErr.name}: ${subErr.message}. Ensure Google Play Services are running on device.`;
    }
    btn.disabled = false;
    btn.textContent = "🔔 RETRY NOTIFICATION REGISTRATION";
    checkPushStatus();
    return;
  }

  if (!pushSub) {
    if (errBox) {
      errBox.style.display = "block";
      errBox.textContent = "No push subscription could be created by browser.";
    }
    btn.disabled = false;
    btn.textContent = "🔔 RETRY NOTIFICATION REGISTRATION";
    checkPushStatus();
    return;
  }

  // Update Subscription and Endpoint live state
  if (diagSub) {
    diagSub.textContent = "ACTIVE";
    diagSub.style.color = "#10b981";
  }
  if (diagEndp) {
    const endpStr = pushSub.endpoint || "";
    const masked = endpStr.length > 36 ? endpStr.slice(0, 24) + "..." + endpStr.slice(-8) : endpStr;
    diagEndp.textContent = `REGISTERED (${masked})`;
    diagEndp.style.color = "#10b981";
  }

  // Send to backend
  btn.textContent = "⏳ CONFIRMING WITH DATABASE...";
  if (textEl) textEl.textContent = "Saving subscription in MySQL...";

  const subJson = pushSub.toJSON();
  const payload = {
    endpoint: pushSub.endpoint,
    p256dh: subJson.keys?.p256dh || "",
    auth: subJson.keys?.auth || "",
    district: activeDistrict,
    user_id: currentUser?.id,
  };

  try {
    const saveRes = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const saveData = await saveRes.json();

    if (saveRes.ok && saveData.status === "success") {
      if (diagApi) {
        diagApi.textContent = "CONNECTED";
        diagApi.style.color = "#10b981";
      }
      if (diagMysql) {
        diagMysql.textContent = `SAVED (ID #${saveData.subscription_id || "Active"})`;
        diagMysql.style.color = "#10b981";
      }
      if (textEl) {
        textEl.style.color = "#10b981";
        textEl.textContent = `Active (Authorized for ${activeDistrict})`;
      }
      btn.textContent = "🔔 NOTIFICATIONS ACTIVE (DEVICE REGISTERED)";
      btn.disabled = false;
    } else {
      if (diagMysql) {
        diagMysql.textContent = "NOT SAVED";
        diagMysql.style.color = "#ef4444";
      }
      if (errBox) {
        errBox.style.display = "block";
        errBox.textContent = `Backend registration error: ${saveData.message || "Failed to save subscription"}`;
      }
      btn.disabled = false;
      btn.textContent = "🔔 RETRY NOTIFICATION REGISTRATION";
    }
  } catch (saveErr) {
    console.error("Save error:", saveErr);
    if (diagMysql) {
      diagMysql.textContent = "NOT SAVED";
      diagMysql.style.color = "#ef4444";
    }
    if (diagApi) {
      diagApi.textContent = "FAILED";
      diagApi.style.color = "#ef4444";
    }
    if (errBox) {
      errBox.style.display = "block";
      errBox.textContent = `Network error contacting backend: ${saveErr.message || saveErr}`;
    }
    btn.disabled = false;
    btn.textContent = "🔔 RETRY NOTIFICATION REGISTRATION";
  } finally {
    btn.disabled = false;
  }
}

async function saveNotificationPreferences(event) {
  event.preventDefault();
  const min_severity = document.getElementById("prefMinSeverity").value;
  const push_enabled = document.getElementById("prefPush").checked;
  const email_enabled = document.getElementById("prefEmail").checked;
  const sms_enabled = document.getElementById("prefSms").checked;

  try {
    await fetch("/api/auth/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser?.id,
        min_severity,
        push_enabled,
        email_enabled,
        sms_enabled,
      }),
    });

    const successEl = document.getElementById("prefSaveSuccess");
    if (successEl) {
      successEl.style.display = "inline";
      setTimeout(() => { successEl.style.display = "none"; }, 2500);
    }
  } catch (err) {
    console.error("Save preferences failed:", err);
  }
}

function handleLogout() {
  localStorage.removeItem("kci_user");
  localStorage.removeItem("kci_token");
  window.location.href = "/login";
}

document.addEventListener("DOMContentLoaded", renderUserDashboard);
