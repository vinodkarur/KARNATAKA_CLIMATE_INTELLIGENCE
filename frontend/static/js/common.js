/* ==========================================================================
   common.js — Command Centre Navigation, Shared Layout & Meteorological Utilities
   ========================================================================== */

window.ALL_DISTRICTS = [
  "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban",
  "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga",
  "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri",
  "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur",
  "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada",
  "Vijayanagara", "Vijayapura", "Yadgir"
];
var ALL_DISTRICTS = window.ALL_DISTRICTS;

// ---------------------------------------------------------------------------
// Standard High-Performance Basemap Provider with Automatic Fallback (No Key Needed)
// ---------------------------------------------------------------------------
function getStandardBasemapLayers() {
  // 1. ESRI World Dark Gray Canvas (High-tech Dark Command Centre aesthetic, zero watermark, zero private API key)
  const darkGray = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: '&copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> &copy; OpenStreetMap',
      maxZoom: 16,
      subdomains: ["server", "services"],
    }
  );

  // 2. OpenStreetMap Standard (Global open tile service, zero key)
  const osmStandard = L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }
  );

  // 3. ESRI World Satellite Imagery (High-resolution imagery)
  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: '&copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Earthstar Geographics',
      maxZoom: 18,
    }
  );

  // 4. ESRI World Topographic (Terrain and relief)
  const topo = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: '&copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, USGS',
      maxZoom: 18,
    }
  );

  // Resilient fallback mechanism: if any tile errors out, swap tile source to OpenStreetMap
  darkGray.on("tileerror", function (e) {
    if (e.tile && !e.tile._failed) {
      e.tile._failed = true;
      const c = e.coords;
      e.tile.src = `https://tile.openstreetmap.org/${c.z}/${c.x}/${c.y}.png`;
    }
  });

  return {
    baseMaps: {
      "Command Dark Gray": darkGray,
      "OpenStreetMap Standard": osmStandard,
      "Satellite Imagery": satellite,
      "Topographic Terrain": topo,
    },
    defaultLayer: darkGray,
  };
}
window.getStandardBasemapLayers = getStandardBasemapLayers;

// ---------------------------------------------------------------------------
// 5 Command-Centre Navigation Groups (Verified Existing Flask Routes Only)
// ---------------------------------------------------------------------------
const NAV_GROUPS = [
  {
    id: "group-monitoring",
    category: "OPERATIONAL MONITORING",
    icon: "📡",
    items: [
      ["/", "Executive Dashboard", "⚡", "OVERVIEW", false],
      ["/user-dashboard", "Citizen Portal", "👤", "PORTAL", false],
      ["/live-climate", "Live Weather Centre", "📡", "LIVE 7-DAY", false],
      ["/climate", "Weather Intelligence", "🌦️", "", false],
      ["/district-intelligence", "District Intelligence", "🏛️", "31 DIST", false],
      ["/gis", "Karnataka GIS Explorer", "🗺️", "GIS", false],
    ],
  },
  {
    id: "group-hazards",
    category: "HAZARDS & EARLY WARNING",
    icon: "🚨",
    items: [
      ["/alerts", "Early Warning Centre", "🚨", "ACTIVE", false],
      ["/risk", "Urban Heat Risk", "🔥", "", false],
      ["/flood", "Flood Monitoring", "🌊", "", false],
      ["/drought", "Drought Monitoring", "🏜️", "", false],
      ["/enso", "El Niño / La Niña Monitor", "🌀", "", false],
      ["/scenario-simulator", "Multi-Hazard Assessment", "🧪", "STRESS", false],
    ],
  },
  {
    id: "group-ai",
    category: "ANALYTICS & AI",
    icon: "🤖",
    items: [
      ["/predict", "AI Predictions", "🤖", "32-D", false],
      ["/ensemble-prediction", "Ensemble Prediction", "🔮", "MULTI", false],
      ["/model-monitoring", "Model Performance", "📈", "DRIFT", false],
      ["/explainable-ai", "Explainable AI (XAI)", "🔍", "SHAP", false],
      ["/algorithm-lab", "Algorithm Comparison", "🧪", "6 ALGO", false],
      ["/chat", "Gemini AI Assistant", "💬", "GEMINI", false],
    ],
  },
  {
    id: "group-emergency",
    category: "EMERGENCY OPERATIONS",
    icon: "📢",
    items: [
      ["/admin", "Emergency Broadcast", "📢", "BROADCAST", true], // adminOnly
      ["/history", "Alert & Dispatch History", "📜", "LEDGER", false],
      ["/adaptation", "Adaptation Action Planner", "🛡️", "", false],
    ],
  },
  {
    id: "group-admin",
    category: "ADMINISTRATION",
    icon: "⚙️",
    items: [
      ["/admin", "Admin Command Centre", "🛡️", "ADMIN", true], // adminOnly
      ["/settings", "System Health & Telemetry", "⚙️", "SYS", false],
    ],
  },
];

// Sidebar Toggle Functions
function toggleSidebar() {
  if (window.innerWidth <= 768) {
    toggleMobileSidebar();
  } else {
    const sidebar = document.getElementById("commandSidebar");
    if (!sidebar) return;
    const isCollapsed = sidebar.classList.toggle("collapsed");
    document.body.classList.toggle("sidebar-collapsed", isCollapsed);
    localStorage.setItem("kci_sidebar_collapsed", isCollapsed ? "true" : "false");
  }
}
window.toggleSidebar = toggleSidebar;

function toggleMobileSidebar() {
  const sidebar = document.getElementById("commandSidebar");
  const overlay = document.getElementById("mobileNavOverlay");
  if (!sidebar) return;
  const isOpen = sidebar.classList.toggle("mobile-open");
  if (overlay) overlay.style.display = isOpen ? "block" : "none";
}
window.toggleMobileSidebar = toggleMobileSidebar;

function closeMobileSidebar() {
  const sidebar = document.getElementById("commandSidebar");
  const overlay = document.getElementById("mobileNavOverlay");
  if (sidebar) sidebar.classList.remove("mobile-open");
  if (overlay) overlay.style.display = "none";
}
window.closeMobileSidebar = closeMobileSidebar;

function toggleNavGroup(groupId) {
  const groupMenu = document.getElementById(`nav-menu-${groupId}`);
  const chevron = document.getElementById(`chevron-${groupId}`);
  if (!groupMenu) return;

  const isCollapsed = groupMenu.classList.toggle("group-collapsed");
  if (chevron) {
    chevron.textContent = isCollapsed ? "▶" : "▼";
  }
  localStorage.setItem(`kci_group_${groupId}`, isCollapsed ? "collapsed" : "expanded");
}
window.toggleNavGroup = toggleNavGroup;

function layout(activePageKey) {
  const currentPath = window.location.pathname;

  // Check login state and role
  let userNavBadge = "";
  let currentUser = null;
  const storedUser = localStorage.getItem("kci_user");
  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
      const shortName = currentUser.full_name ? currentUser.full_name.split(" ")[0] : "Officer";
      const isAdmin = Boolean(currentUser.is_admin || currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN");
      userNavBadge = `
        <a href="${isAdmin ? '/admin' : '/user-dashboard'}" class="topbar-btn" style="border-color:rgba(0,240,255,0.4); color:var(--cyan)" title="Account Dashboard">
          <span>${isAdmin ? '🛡️' : '👤'} ${escapeHtml(shortName)}</span>
        </a>
      `;
    } catch (e) {}
  } else {
    userNavBadge = `
      <a href="/login" class="topbar-btn" style="border-color:rgba(0,240,255,0.4); color:var(--cyan)" title="Citizen / Admin Sign In">
        <span>🔑 SIGN IN</span>
      </a>
    `;
  }

  const isAdmin = currentUser && Boolean(currentUser.is_admin || currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN");

  // Build accordion navigation items
  let navHtml = "";
  for (const group of NAV_GROUPS) {
    // Filter items based on RBAC (hide admin items for normal citizens)
    const visibleItems = group.items.filter(item => !item[4] || isAdmin);
    if (visibleItems.length === 0) continue;

    // Check if current active page is inside this group
    const hasActiveChild = visibleItems.some(([href]) =>
      currentPath === href ||
      (href !== "/" && currentPath.startsWith(href)) ||
      (href === "/alerts" && currentPath === "/early-warning") ||
      (href === "/gis" && currentPath === "/district") ||
      (href === "/analytics" && currentPath === "/explain")
    );

    const storedState = localStorage.getItem(`kci_group_${group.id}`);
    const isCollapsed = hasActiveChild ? false : (storedState === "collapsed");

    navHtml += `
      <div class="sidebar-group-wrapper" id="wrapper-${group.id}">
        <div class="sidebar-group-header" onclick="toggleNavGroup('${group.id}')" title="Toggle ${group.category}">
          <span class="sidebar-category-title">${group.category}</span>
          <span class="group-chevron" id="chevron-${group.id}">${isCollapsed ? "▶" : "▼"}</span>
        </div>
        <div class="nav-menu ${isCollapsed ? 'group-collapsed' : ''}" id="nav-menu-${group.id}">
    `;

    for (const [href, label, icon, pill] of visibleItems) {
      const isActive =
        currentPath === href ||
        (href !== "/" && currentPath.startsWith(href)) ||
        (href === "/alerts" && currentPath === "/early-warning") ||
        (href === "/gis" && currentPath === "/district") ||
        (href === "/analytics" && currentPath === "/explain");

      navHtml += `
        <a class="nav-link ${isActive ? "active" : ""}" href="${href}" title="${escapeHtml(label)}" onclick="if(window.innerWidth<=768) closeMobileSidebar();">
          <span class="nav-icon">${icon}</span>
          <span class="nav-label">${label}</span>
          ${pill ? `<span class="nav-pill-badge">${pill}</span>` : ""}
        </a>
      `;
    }
    navHtml += `</div></div>`;
  }

  // Restore desktop collapsed state
  const isDesktopCollapsed = localStorage.getItem("kci_sidebar_collapsed") === "true";

  document.body.innerHTML = `
    <div class="app-container">
      <!-- In-App Emergency Broadcast Banner (Appears when active broadcast exists) -->
      <div id="globalEmergencyBroadcastBanner" style="display:none; padding:10px 16px; background:#ef4444; color:#fff; font-weight:800; font-size:13px; text-align:center; position:sticky; top:0; z-index:99999; box-shadow:0 2px 10px rgba(0,0,0,0.5)">
        <span id="globalEmergencyBannerText">🚨 CRITICAL EMERGENCY DIRECTIVE IN EFFECT</span>
        <button onclick="document.getElementById('globalEmergencyBroadcastBanner').style.display='none'" style="margin-left:14px; background:rgba(0,0,0,0.3); border:none; color:#fff; padding:2px 8px; border-radius:4px; cursor:pointer">Dismiss</button>
      </div>

      <!-- 1. TOP COMMAND BAR -->
      <header class="topbar">
        <!-- Hamburger Menu Button -->
        <button class="topbar-hamburger-btn" id="sidebarToggleBtn" onclick="toggleSidebar()" aria-label="Toggle Command Navigation" title="Toggle Navigation Sidebar">
          <span class="hamburger-bar"></span>
          <span class="hamburger-bar"></span>
          <span class="hamburger-bar"></span>
        </button>

        <a href="/" class="topbar-brand">
          <div class="topbar-logo">
            <span style="font-size:18px; filter:drop-shadow(0 0 4px #00f0ff)">📡</span>
          </div>
          <div class="topbar-title-group">
            <span class="topbar-title">KARNATAKA CLIMATE INTELLIGENCE</span>
            <span class="topbar-subtitle">STATE METEOROLOGICAL COMMAND CENTRE</span>
          </div>
        </a>

        <!-- Live Clock & Center Telemetry -->
        <div class="topbar-center">
          <div class="topbar-clock">
            <span class="pulse-beacon"></span>
            <span id="liveClockDisplay">LST --:--:-- IST</span>
          </div>

          <!-- Quick Location Search Selector -->
          <div class="topbar-search-box">
            <span class="topbar-search-icon">🔍</span>
            <input type="text" class="topbar-search-input" id="topbarLocationSearch"
                   placeholder="Search District / Station..."
                   list="karnatakaStationList"
                   onchange="handleLocationJump(this.value)">
            <datalist id="karnatakaStationList">
              ${ALL_DISTRICTS.map(d => `<option value="${d}">`).join("")}
            </datalist>
          </div>
        </div>

        <!-- Right System Actions & Badges -->
        <div class="topbar-actions">
          <div class="topbar-status-pill" style="border-color:rgba(0,240,255,0.3); color:var(--cyan)" title="High-Resolution NWP Open-Meteo">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--cyan)"></span>
            <span>OPEN-METEO LIVE</span>
          </div>
          <div class="topbar-status-pill" id="topbarDbStatus">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#10b981"></span>
            <span>MYSQL 8.0</span>
          </div>

          <a href="/alerts" class="topbar-btn" title="View Active Early Warnings">
            <span>🚨 ALERTS</span>
            <span class="alert-badge-counter" id="topbarAlertCounter">0</span>
          </a>

          <a href="/chat" class="topbar-btn" title="Open AI Climate Assistant">
            <span>💬 AI ASSISTANT</span>
          </a>

          ${userNavBadge}
        </div>
      </header>

      <!-- 2. BODY WRAPPER (SIDEBAR + MAIN CANVAS) -->
      <div class="body-wrapper">
        <!-- Mobile Drawer Dark Overlay -->
        <div id="mobileNavOverlay" class="mobile-nav-overlay" onclick="closeMobileSidebar()"></div>

        <aside class="sidebar ${isDesktopCollapsed ? 'collapsed' : ''}" id="commandSidebar">
          <!-- Mobile Drawer Header -->
          <div class="sidebar-mobile-header">
            <div style="display:flex; align-items:center; gap:8px">
              <span style="font-size:16px">📡</span>
              <span style="font-weight:800; font-size:12px; color:var(--cyan); letter-spacing:0.5px">COMMAND NAVIGATION</span>
            </div>
            <button onclick="closeMobileSidebar()" class="sidebar-close-btn" aria-label="Close Navigation">✕</button>
          </div>

          <nav class="sidebar-nav-container">${navHtml}</nav>

          <div class="sidebar-footer">
            <div class="system-telemetry-box">
              <div class="telemetry-row">
                <span>COVERAGE</span>
                <span class="telemetry-val">31 DISTRICTS</span>
              </div>
              <div class="telemetry-row">
                <span>OBSERVED RECORD</span>
                <span class="telemetry-val">16,071 DAYS</span>
              </div>
              <div class="telemetry-row">
                <span>TIME HORIZON</span>
                <span class="telemetry-val">1981–2026</span>
              </div>
              <div class="telemetry-row">
                <span>IMD STATIONS</span>
                <span class="telemetry-val">25 GAUGES</span>
              </div>
            </div>
            <div class="sidebar-footer-subtext" style="font-size:10px; color:var(--text-muted); margin-top:8px; line-height:1.4">
              Karnataka Disaster Management • Operational Meteorological Warning Platform
            </div>
          </div>
        </aside>

        <!-- Main Content Area -->
        <main class="main-content" id="main-content" data-page="${activePageKey}"></main>
      </div>
    </div>
  `;

  if (isDesktopCollapsed && window.innerWidth > 768) {
    document.body.classList.add("sidebar-collapsed");
  }

  // Start live clock ticking
  initLiveClock();

  // Async health check & alert counter
  fetchSystemTelemetry();

  return document.getElementById("main-content");
}

function initLiveClock() {
  const display = document.getElementById("liveClockDisplay");
  if (!display) return;

  function tick() {
    const now = new Date();
    // Indian Standard Time (UTC+5:30)
    const options = {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    const timeStr = now.toLocaleTimeString("en-GB", options);
    const dateStr = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
    display.textContent = `LST ${timeStr} IST • ${dateStr}`;
  }
  tick();
  setInterval(tick, 1000);
}

function handleLocationJump(val) {
  if (!val) return;
  const cleanName = val.split("(")[0].trim();
  window.location.href = `/district-intelligence?district=${encodeURIComponent(cleanName)}`;
}

async function fetchSystemTelemetry() {
  try {
    const health = await api("/api/health");
    const statusPill = document.getElementById("topbarDbStatus");
    if (statusPill) {
      const mode = health.persistence === "mysql" ? "MySQL 8.0" : "SQLite Local";
      statusPill.innerHTML = `
        <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#10b981"></span>
        <span>${mode.toUpperCase()}</span>
      `;
    }
  } catch (e) {
    /* fallback gracefully */
  }

  try {
    const alerts = await api("/api/alerts");
    const counter = document.getElementById("topbarAlertCounter");
    if (counter && alerts.early_warnings) {
      const count = alerts.early_warnings.alert_count || 0;
      counter.textContent = count;
      if (count > 0) {
        counter.style.background = alerts.early_warnings.color || "var(--risk-critical)";
      } else {
        counter.style.background = "var(--risk-normal)";
      }
    }
  } catch (e) {
    /* ignore alert fetch error */
  }

  // Check active emergency broadcasts
  try {
    const bcast = await api("/api/notifications/active-broadcasts");
    if (bcast.broadcasts && bcast.broadcasts.length > 0) {
      const topB = bcast.broadcasts[0];
      const banner = document.getElementById("globalEmergencyBroadcastBanner");
      const bText = document.getElementById("globalEmergencyBannerText");
      if (banner && bText) {
        banner.style.display = "block";
        bText.innerHTML = `🚨 <strong>EMERGENCY DIRECTIVE (${escapeHtml(topB.district.toUpperCase())}):</strong> ${escapeHtml(topB.title)} — ${escapeHtml(topB.message)}`;
      }
    }
  } catch (e) {
    /* ignore broadcast fetch error */
  }
}

// ---------------------------------------------------------------------------
// SHARED UTILITIES & API HELPERS
// ---------------------------------------------------------------------------

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (parseError) {
    throw new Error(
      response.ok
        ? "The server returned an unreadable response."
        : `Request failed (HTTP ${response.status}). ${raw.slice(0, 160)}`
    );
  }

  if (!response.ok) {
    const detail = Array.isArray(data.missing_features)
      ? ` Missing: ${data.missing_features.slice(0, 5).join(", ")}...`
      : "";
    throw new Error((data.error || data.message || `Request failed (HTTP ${response.status})`) + detail);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

function riskColor(level) {
  const norm = String(level || "").trim().toLowerCase();
  if (norm.includes("very high") || norm.includes("critical")) return "#ef4444";
  if (norm.includes("high") || norm.includes("warning")) return "#f97316";
  if (norm.includes("moderate") || norm.includes("advisory")) return "#eab308";
  return "#10b981";
}

function getRiskBadge(level) {
  const norm = String(level ?? "").trim();
  if (!norm) return '<span class="badge badge-normal">—</span>';
  const color = riskColor(norm);
  const bg = color + "26";
  return `<span class="badge" style="background:${bg}; color:${color}; border:1px solid ${color}66">${escapeHtml(norm)}</span>`;
}

function ensoTag(phase) {
  const label = String(phase || "Neutral").trim();
  let color = "#38bdf8";
  let bg = "rgba(56, 189, 248, 0.15)";
  if (label.includes("El")) {
    color = "#f97316";
    bg = "rgba(249, 115, 22, 0.15)";
  } else if (label.includes("La")) {
    color = "#00e5bc";
    bg = "rgba(0, 229, 188, 0.15)";
  }
  return `<span class="badge" style="background:${bg}; color:${color}; border:1px solid ${color}55">${escapeHtml(label)}</span>`;
}

function chartDefaults() {
  return {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: "#cbd5e1",
          font: { family: "Outfit", size: 12, weight: "500" },
        },
      },
      tooltip: {
        backgroundColor: "rgba(10, 18, 32, 0.95)",
        titleColor: "#00f0ff",
        bodyColor: "#f1f5f9",
        borderColor: "rgba(0, 240, 255, 0.3)",
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
        usePointStyle: true,
      },
    },
    scales: {
      x: {
        ticks: { color: "#94a3b8", font: { family: "JetBrains Mono", size: 11 } },
        grid: { color: "rgba(255, 255, 255, 0.06)" },
      },
      y: {
        ticks: { color: "#94a3b8", font: { family: "JetBrains Mono", size: 11 } },
        grid: { color: "rgba(255, 255, 255, 0.06)" },
      },
    },
  };
}
