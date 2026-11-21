/* adaptation.js — Municipal Climate Adaptation Command Matrix */

async function renderAdaptationPlanning() {
  const main = layout("adaptation");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Municipal Climate Adaptation Command Matrix</h1>
        <p class="page-description">
          Cross-sector municipal resilience protocols dynamically calibrated against Karnataka's 44-year empirical percentiles (P50, P75, P90) and NOAA ONI macro-teleconnections.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center">
        <span class="badge badge-cyan">DECISION SUPPORT MATRIX</span>
        <button class="btn btn-secondary" onclick="window.print()" style="font-size:12px; padding:6px 12px">🖨️ Export Plan</button>
      </div>
    </div>
    <div class="card" style="text-align:center; padding:40px">
      <div style="font-family:'JetBrains Mono',monospace; color:var(--cyan)">Initializing municipal adaptation protocols...</div>
    </div>
  `;

  try {
    const data = await api("/api/dashboard");
    const th = data.thresholds;

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Municipal Climate Adaptation Command Matrix</h1>
          <p class="page-description">
            Cross-sector municipal resilience protocols dynamically calibrated against Karnataka's 44-year empirical percentiles (P50, P75, P90) and NOAA ONI macro-teleconnections.
          </p>
        </div>
        <div style="display:flex; gap:10px; align-items:center">
          <span class="badge badge-cyan">DECISION SUPPORT MATRIX</span>
          <button class="btn btn-secondary" onclick="window.print()" style="font-size:12px; padding:6px 12px">🖨️ Export Directives</button>
        </div>
      </div>

      <!-- Baseline Empirical Threshold Cards -->
      <div class="grid grid-4" style="margin-bottom:20px">
        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">MODERATE HEAT (P50)</span>
            <div class="kpi-icon-pill">🌡️</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${th.Temperature_50th_Percentile.toFixed(2)}</span>
            <span class="kpi-unit">°C</span>
          </div>
          <div class="kpi-subtext">Median baseline historical temperature</div>
        </div>

        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">HIGH HEAT WATCH (P75)</span>
            <div class="kpi-icon-pill" style="color:var(--risk-warning)">🔥</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${th.Temperature_75th_Percentile.toFixed(2)}</span>
            <span class="kpi-unit">°C</span>
          </div>
          <div class="kpi-subtext">Upper quartile heat stress threshold</div>
        </div>

        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">CRITICAL HEAT ALERT (P90)</span>
            <div class="kpi-icon-pill" style="color:var(--risk-critical)">🚨</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${th.Temperature_90th_Percentile.toFixed(2)}</span>
            <span class="kpi-unit">°C</span>
          </div>
          <div class="kpi-subtext">Top 10% extreme thermal anomaly</div>
        </div>

        <div class="hero-kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">HEAVY RAIN ALERT (P90)</span>
            <div class="kpi-icon-pill" style="color:var(--cyan)">🌊</div>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${th.Rainfall_90th_Percentile.toFixed(2)}</span>
            <span class="kpi-unit">mm</span>
          </div>
          <div class="kpi-subtext">Localized intense cloudburst hazard</div>
        </div>
      </div>

      <!-- Interactive Scenario Selector -->
      <div class="card" style="margin-bottom:24px">
        <div class="card-header">
          <div>
            <div class="card-title">Interactive Multi-Hazard Simulator</div>
            <div class="card-subtitle">Adjust real-time hazard parameters to evaluate municipal operational actions across all four urban services:</div>
          </div>
          <div style="display:flex; gap:8px">
            <button class="chip-btn" id="presetHeatwave">🔥 Heatwave Preset</button>
            <button class="chip-btn" id="presetFlood">🌊 Flood Risk Preset</button>
            <button class="chip-btn" id="presetBaseline">⚖️ Baseline Normal</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:18px; margin-top:8px">
          <div class="form-group">
            <label class="form-label" for="tempSimSelect">SIMULATED TEMPERATURE HAZARD TIER:</label>
            <select id="tempSimSelect" class="form-control">
              <option value="Very High">🚨 Critical Heat Alert (> ${th.Temperature_90th_Percentile.toFixed(1)} °C)</option>
              <option value="High">⚠️ High Heat Watch (${th.Temperature_75th_Percentile.toFixed(1)} – ${th.Temperature_90th_Percentile.toFixed(1)} °C)</option>
              <option value="Moderate" selected>⚡ Moderate Heat Advisory (${th.Temperature_50th_Percentile.toFixed(1)} – ${th.Temperature_75th_Percentile.toFixed(1)} °C)</option>
              <option value="Low">✅ Normal Thermal Baseline (≤ ${th.Temperature_50th_Percentile.toFixed(1)} °C)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="rainSimSelect">SIMULATED PRECIPITATION HAZARD TIER:</label>
            <select id="rainSimSelect" class="form-control">
              <option value="Very High">🌊 Critical Downpour Alert (> ${th.Rainfall_90th_Percentile.toFixed(1)} mm)</option>
              <option value="High">🌧️ Heavy Rainfall Watch (${th.Rainfall_75th_Percentile.toFixed(1)} – ${th.Rainfall_90th_Percentile.toFixed(1)} mm)</option>
              <option value="Normal" selected>💧 Standard Rainfall Envelope (${th.Rainfall_25th_Percentile.toFixed(2)} – ${th.Rainfall_75th_Percentile.toFixed(1)} mm)</option>
              <option value="Low">☀️ Deficit / Drought Risk (≤ ${th.Rainfall_25th_Percentile.toFixed(2)} mm)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Sector-wise Action Directives -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px">
        <h2 style="font-size:16px; font-weight:700; color:#fff; text-transform:uppercase; letter-spacing:0.5px">
          Operational Directives by Municipal Sector
        </h2>
        <span class="badge" id="currentScenarioTag" style="font-size:12px">ACTIVE SCENARIO: MODERATE HEAT + NORMAL RAIN</span>
      </div>

      <div class="grid grid-2" id="sectorDisplayGrid">
        <!-- Rendered dynamically below -->
      </div>

      <div class="scientific-disclaimer-box">
        <strong>Statutory Operational Protocol:</strong> These adaptation directives are engineered for civic planning, municipal simulation, and academic study. Operational disaster response mobilizations must be executed in strict concordance with official advisories issued by the India Meteorological Department (IMD) and the Karnataka State Natural Disaster Monitoring Centre (KSNDMC).
      </div>
    `;

    const sectorMatrix = {
      health: {
        "Very High": {
          title: "Public Health & Heat Wave Emergency",
          action: "Deploy emergency ORS distribution booths at transit hubs, metro stations, and major bus terminals; equip government hospitals with dedicated cooling wards and IV rehydration fluids; enforce mandatory cessation of strenuous outdoor construction between 12:00 PM and 3:30 PM; initiate active tele-welfare checks on elderly and vulnerable populations.",
          icon: "🏥",
          leadAgency: "Health & Family Welfare Dept / BBMP Health Division",
          priority: "CRITICAL ACTION",
          priorityClass: "badge-critical"
        },
        "High": {
          title: "Public Health & Labor Protection",
          action: "Mandate shaded rest breaks and free electrolyte hydration for municipal sanitation crews, traffic police, and courier personnel; broadcast heat safety bulletins across local radio, digital billboards, and mobile channels; activate primary health center heatstroke triage desks.",
          icon: "🩺",
          leadAgency: "Labour Department / Municipal Health Cadres",
          priority: "HIGH PRIORITY",
          priorityClass: "badge-warning"
        },
        "Moderate": {
          title: "Public Health & General Preparedness",
          action: "Encourage consistent hydration practices in educational institutions and commercial offices; verify passive ventilation and backup power in clinics; maintain surveillance over pediatric and geriatric dehydration metrics.",
          icon: "💧",
          leadAgency: "District Health Offices",
          priority: "ADVISORY",
          priorityClass: "badge-advisory"
        },
        "Low": {
          title: "Public Health & Baseline Operations",
          action: "Execute routine public health surveillance and standard clinical supply replenishment; maintain baseline community health monitoring.",
          icon: "✅",
          leadAgency: "Municipal Health Directorate",
          priority: "ROUTINE",
          priorityClass: "badge-normal"
        },
      },
      urban: {
        "Very High": {
          title: "Urban Cooling & Infrastructure Relief",
          action: "Apply high-albedo cool-roof elastomeric coatings to government schools and transit shelters; deploy mobile water misting trucks across congested commercial squares and high-density heat corridors; designate air-conditioned civic centers and libraries as public cooling sanctuaries during peak afternoon hours.",
          icon: "🏙️",
          leadAgency: "Urban Development Directorate / Smart City Corp",
          priority: "CRITICAL ACTION",
          priorityClass: "badge-critical"
        },
        "High": {
          title: "Urban Greening & Microclimate Management",
          action: "Schedule evening sprinkler irrigation of urban green belts and roadside canopy trees; verify functional status of public drinking water fountains; inspect high-density asphalt surfaces for structural heat buckling.",
          icon: "🌳",
          leadAgency: "Horticulture Department / Urban Local Bodies",
          priority: "HIGH PRIORITY",
          priorityClass: "badge-warning"
        },
        "Moderate": {
          title: "Urban Infrastructure Maintenance",
          action: "Conduct scheduled inspections of bus shelter canopies, tensile shade structures, and civic parks; review energy demand profiles for cooling loads in municipal facilities.",
          icon: "🏗️",
          leadAgency: "Public Works Department (PWD)",
          priority: "ADVISORY",
          priorityClass: "badge-advisory"
        },
        "Low": {
          title: "Urban Canopy Expansion & Planning",
          action: "Optimal window for mass urban forestry planting of indigenous drought-resilient saplings; conduct thermal satellite GIS canopy assessments to prioritize future cool corridor interventions.",
          icon: "🌱",
          leadAgency: "Urban Forestry Division",
          priority: "ROUTINE",
          priorityClass: "badge-normal"
        },
      },
      drainage: {
        "Very High": {
          title: "Stormwater Drainage & Flood Containment",
          action: "Pre-position high-capacity diesel dewatering pump units at known arterial underpasses and severe bottleneck culverts; clear primary storm water drains (Rajakaluves) of plastic choke points; activate ward-level flood quick response squads; monitor lake sluice gates and balancing reservoirs.",
          icon: "🌊",
          leadAgency: "Stormwater Drainage Division / Fire & Emergency Services",
          priority: "CRITICAL ACTION",
          priorityClass: "badge-critical"
        },
        "High": {
          title: "Secondary Drainage & Culvert Desilting",
          action: "Conduct urgent desilting of roadside catch basins and cross-culverts; inspect retention pond inflows; establish 24/7 pumping readiness in flood-prone low-lying tenements.",
          icon: "🚜",
          leadAgency: "Municipal Engineering Division",
          priority: "HIGH PRIORITY",
          priorityClass: "badge-warning"
        },
        "Normal": {
          title: "Routine Stormwater Maintenance",
          action: "Verify unobstructed hydraulic flow through arterial drainage conduits; inspect rainwater harvesting desilting chambers and filtration sumps.",
          icon: "🔄",
          leadAgency: "Local Ward Engineers",
          priority: "ADVISORY",
          priorityClass: "badge-advisory"
        },
        "Low": {
          title: "Dry Season Drainage Rehabilitation",
          action: "Optimal period for heavy structural excavation, concrete drain relining, and heavy silt clearance across the entire urban stormwater drainage network.",
          icon: "🛠️",
          leadAgency: "PWD / Urban Infrastructure Authorities",
          priority: "ROUTINE",
          priorityClass: "badge-normal"
        },
      },
      water: {
        "Very High": {
          title: "Surface Inflow & Dam Reservoir Management",
          action: "Maximize retention in multi-tiered rainwater harvesting catchments; coordinate with irrigation authorities regarding dam crest gate discharges; safeguard low-lying agricultural floodplains from saturated run-off.",
          icon: "🚰",
          leadAgency: "Water Resources Department / Minor Irrigation",
          priority: "CRITICAL ACTION",
          priorityClass: "badge-critical"
        },
        "High": {
          title: "Agricultural Drainage & Aquifer Infiltration",
          action: "Advise farmers on furrow drainage in heavy black cotton soil districts; inspect percolation tanks and check dams; capture peak surface run-off for managed aquifer recharge.",
          icon: "🌾",
          leadAgency: "Agriculture Dept / Groundwater Authority",
          priority: "HIGH PRIORITY",
          priorityClass: "badge-warning"
        },
        "Normal": {
          title: "Standard Water Resource Scheduling",
          action: "Maintain balanced municipal potable supply scheduling; sustain planned canal irrigation rotation cycles; recharge urban borewell replenishment structures.",
          icon: "📊",
          leadAgency: "Water Supply & Sewerage Board (BWSSB/KUWSDB)",
          priority: "ADVISORY",
          priorityClass: "badge-advisory"
        },
        "Low": {
          title: "Water Conservation & Drought Precaution",
          action: "Enforce domestic water rationing protocols; mandate micro-drip irrigation in agricultural zones; restrict non-potable commercial and landscaping consumption; prepare emergency tanker logistics for arid rural taluks.",
          icon: "⚠️",
          leadAgency: "Disaster Management & Water Boards",
          priority: "HIGH PRIORITY",
          priorityClass: "badge-warning"
        },
      },
    };

    function updateSectors() {
      const tLevel = document.getElementById("tempSimSelect").value;
      const rLevel = document.getElementById("rainSimSelect").value;
      const container = document.getElementById("sectorDisplayGrid");
      const tag = document.getElementById("currentScenarioTag");

      tag.textContent = `SIMULATION ACTIVE: ${tLevel.toUpperCase()} HEAT + ${rLevel.toUpperCase()} RAIN`;

      const h = sectorMatrix.health[tLevel];
      const u = sectorMatrix.urban[tLevel];
      const d = sectorMatrix.drainage[rLevel];
      const w = sectorMatrix.water[rLevel];

      container.innerHTML = `
        <div class="adaptation-sector-card">
          <div class="sector-card-top">
            <div class="sector-card-title">
              <div class="sector-icon-pill">${h.icon}</div>
              <div>
                <div>${h.title}</div>
                <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">${h.leadAgency}</div>
              </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px">
              ${getRiskBadge(tLevel)}
              <span class="badge ${h.priorityClass}">${h.priority}</span>
            </div>
          </div>
          <div class="sector-action-text">${h.action}</div>
        </div>

        <div class="adaptation-sector-card">
          <div class="sector-card-top">
            <div class="sector-card-title">
              <div class="sector-icon-pill">${u.icon}</div>
              <div>
                <div>${u.title}</div>
                <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">${u.leadAgency}</div>
              </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px">
              ${getRiskBadge(tLevel)}
              <span class="badge ${u.priorityClass}">${u.priority}</span>
            </div>
          </div>
          <div class="sector-action-text">${u.action}</div>
        </div>

        <div class="adaptation-sector-card">
          <div class="sector-card-top">
            <div class="sector-card-title">
              <div class="sector-icon-pill">${d.icon}</div>
              <div>
                <div>${d.title}</div>
                <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">${d.leadAgency}</div>
              </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px">
              ${getRiskBadge(rLevel)}
              <span class="badge ${d.priorityClass}">${d.priority}</span>
            </div>
          </div>
          <div class="sector-action-text">${d.action}</div>
        </div>

        <div class="adaptation-sector-card">
          <div class="sector-card-top">
            <div class="sector-card-title">
              <div class="sector-icon-pill">${w.icon}</div>
              <div>
                <div>${w.title}</div>
                <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace">${w.leadAgency}</div>
              </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px">
              ${getRiskBadge(rLevel)}
              <span class="badge ${w.priorityClass}">${w.priority}</span>
            </div>
          </div>
          <div class="sector-action-text">${w.action}</div>
        </div>
      `;
    }

    document.getElementById("tempSimSelect").addEventListener("change", updateSectors);
    document.getElementById("rainSimSelect").addEventListener("change", updateSectors);

    // Preset Buttons
    document.getElementById("presetHeatwave").addEventListener("click", () => {
      document.getElementById("tempSimSelect").value = "Very High";
      document.getElementById("rainSimSelect").value = "Low";
      updateSectors();
    });

    document.getElementById("presetFlood").addEventListener("click", () => {
      document.getElementById("tempSimSelect").value = "Moderate";
      document.getElementById("rainSimSelect").value = "Very High";
      updateSectors();
    });

    document.getElementById("presetBaseline").addEventListener("click", () => {
      document.getElementById("tempSimSelect").value = "Moderate";
      document.getElementById("rainSimSelect").value = "Normal";
      updateSectors();
    });

    updateSectors();

  } catch (err) {
    main.innerHTML = `<div class="card" style="border-color:var(--risk-critical); color:var(--risk-critical)">Failed to initialize adaptation matrix: ${err.message}</div>`;
  }
}

renderAdaptationPlanning();
