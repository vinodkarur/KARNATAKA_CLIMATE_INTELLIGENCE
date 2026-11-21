/* methodology.js — Scientific Methodology & Governance Architecture */

function renderMethodology() {
  const main = layout("methodology");

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Scientific Methodology & Governance Architecture</h1>
        <p class="page-description">
          Rigorous technical documentation of meteorological data provenance, mathematical feature derivations, dual ML pipelines, exact SHAP game-theoretic explainability, and climatological caveats.
        </p>
      </div>
      <div style="display:flex; gap:10px; align-items:center">
        <span class="badge badge-cyan">PEER-REVIEW READY SPECIFICATION</span>
      </div>
    </div>

    <!-- Quick Jump Navigation -->
    <div class="toc-nav-pill-group">
      <a href="#datasets" class="toc-pill">1. Datasets & Provenance</a>
      <a href="#preprocessing" class="toc-pill">2. Preprocessing Pipeline</a>
      <a href="#features" class="toc-pill">3. 32-Feature Engineering</a>
      <a href="#models" class="toc-pill">4. ML Algorithms</a>
      <a href="#evaluation" class="toc-pill">5. Model Benchmarks</a>
      <a href="#shap" class="toc-pill">6. SHAP Explainability</a>
      <a href="#risk" class="toc-pill">7. Percentile Risk Tiers</a>
      <a href="#enso" class="toc-pill">8. ENSO Physics</a>
      <a href="#limitations" class="toc-pill">9. Limitations & Caveats</a>
      <a href="#references" class="toc-pill">10. Academic References</a>
    </div>

    <!-- 1. Datasets -->
    <section class="card" id="datasets" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">
          <span class="badge badge-cyan">01</span>
          <span>Primary Meteorological Datasets & Lineage</span>
        </div>
      </div>

      <div style="margin-bottom:18px">
        <h3 style="font-size:14px; font-weight:600; color:var(--blue-bright); margin-bottom:8px">1.1 Karnataka State Daily Weather Reanalysis (1981–2024)</h3>
        <table class="spec-table">
          <tr><td style="width:200px"><strong>Data Origin</strong></td><td>IMD gridded observational network blended with ERA5 historical atmospheric reanalysis.</td></tr>
          <tr><td><strong>Temporal Coverage</strong></td><td>16,071 continuous daily records spanning 44 complete calendar years (January 1, 1981 – December 31, 2024).</td></tr>
          <tr><td><strong>Core Variables</strong></td><td>Daily Mean 2m Temperature (°C), Daily Aggregated Precipitation (mm), Oceanic Niño Index.</td></tr>
          <tr><td><strong>Cleaned Master File</strong></td><td><code>datasets/processed/Karnataka_Final_Cleaned_Dataset.csv</code></td></tr>
        </table>
      </div>

      <div style="margin-bottom:18px">
        <h3 style="font-size:14px; font-weight:600; color:var(--cyan); margin-bottom:8px">1.2 NOAA Oceanic Niño Index (ONI v5)</h3>
        <table class="spec-table">
          <tr><td style="width:200px"><strong>Publishing Authority</strong></td><td>NOAA Climate Prediction Center (CPC) — National Centers for Environmental Prediction.</td></tr>
          <tr><td><strong>Index Formulation</strong></td><td>3-month running mean of ERSST.v5 sea surface temperature (SST) anomalies in the Niño 3.4 basin (5°N–5°S, 120°–170°W).</td></tr>
          <tr><td><strong>Alignment Method</strong></td><td>Monthly anomalies forward-propagated to daily temporal records by exact Year-Month calendar indices.</td></tr>
          <tr><td><strong>Phase Criteria</strong></td><td>El Niño (ONI ≥ +0.5°C), La Niña (ONI ≤ −0.5°C), Neutral (−0.5°C &lt; ONI &lt; +0.5°C).</td></tr>
          <tr><td><strong>Cleaned Master File</strong></td><td><code>datasets/processed/NOAA_ONI_Cleaned.csv</code></td></tr>
        </table>
      </div>

      <div>
        <h3 style="font-size:14px; font-weight:600; color:var(--teal); margin-bottom:8px">1.3 IMD High-Density District Raingauge Network</h3>
        <table class="spec-table">
          <tr><td style="width:200px"><strong>Network Scope</strong></td><td>48,783 daily gauge readings across 25 verified meteorological stations in Karnataka (1991–2020).</td></tr>
          <tr><td><strong>Operational Purpose</strong></td><td>Powers the GIS Spatial Explorer and Drought Risk Assessment modules for localized taluk-level analysis.</td></tr>
        </table>
      </div>
    </section>

    <!-- 2. Preprocessing -->
    <section class="card" id="preprocessing" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">
          <span class="badge badge-cyan">02</span>
          <span>Data Sanitization & Preprocessing Pipeline</span>
        </div>
      </div>
      <div class="tech-metric-grid" style="margin-bottom:16px">
        <div class="tech-metric-card">
          <div class="tech-metric-title">TEMPORAL CONTINUITY</div>
          <div class="tech-metric-val">100% (No Day Gaps)</div>
        </div>
        <div class="tech-metric-card">
          <div class="tech-metric-title">TARGET IMPUTATION</div>
          <div class="tech-metric-val">Zero (Strict Ground Truth)</div>
        </div>
        <div class="tech-metric-card">
          <div class="tech-metric-title">PRECIPITATION FLOOR</div>
          <div class="tech-metric-val">0.00 mm (Non-Negative)</div>
        </div>
        <div class="tech-metric-card">
          <div class="tech-metric-title">TOTAL CLEAN SAMPLES</div>
          <div class="tech-metric-val">16,071 Daily Records</div>
        </div>
      </div>
      <p style="font-size:13px; line-height:1.7; color:var(--text-dim)">
        Data sanitization enforces strict temporal integrity: timestamps are parsed to standardized ISO 8601 timestamps, duplicate records are pruned, physical non-negativity constraints are asserted on rainfall records, and monthly ONI series are seamlessly aligned via calendar merges. No synthetic target values are imputed.
      </p>
    </section>

    <!-- 3. Features -->
    <section class="card" id="features" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">
          <span class="badge badge-cyan">03</span>
          <span>Automated 32-Dimensional Feature Engineering</span>
        </div>
      </div>
      <p style="font-size:13px; line-height:1.7; color:var(--text-dim); margin-bottom:14px">
        All 32 predictors are synthesized exclusively from historical time-lagged parameters. Zero future information is utilized, eliminating data leakage.
      </p>

      <div class="grid grid-2">
        <div style="background:rgba(8,17,29,0.6); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
          <div style="font-weight:600; color:var(--cyan); margin-bottom:8px">1. Cyclical Calendar Projections (5)</div>
          <ul style="padding-left:18px; font-size:12.5px; line-height:1.7; color:var(--text-dim)">
            <li><code>Month_Sin</code>, <code>Month_Cos</code> — Trigonometric projection of solar month \\(\\sin(2\\pi m / 12)\\)</li>
            <li><code>DayOfYear_Sin</code>, <code>DayOfYear_Cos</code> — Continuous annual solar trajectory \\(\\sin(2\\pi d / 365.25)\\)</li>
            <li><code>Day_of_Week</code> — Categorical day index (0–6)</li>
          </ul>
        </div>

        <div style="background:rgba(8,17,29,0.6); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
          <div style="font-weight:600; color:var(--blue-bright); margin-bottom:8px">2. ENSO State & Macro Signals (5)</div>
          <ul style="padding-left:18px; font-size:12.5px; line-height:1.7; color:var(--text-dim)">
            <li><code>ONI</code> — Current month Oceanic Niño Index SST anomaly</li>
            <li><code>ONI_Lag_30</code> — Antecedent 30-day macro Pacific thermal memory</li>
            <li><code>El_Nino</code>, <code>La_Nina</code> — Operational binary climate state flags</li>
            <li><code>Year</code>, <code>Month</code>, <code>Day</code>, <code>Day_of_Year</code> — Integer calendar indices</li>
          </ul>
        </div>

        <div style="background:rgba(8,17,29,0.6); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
          <div style="font-weight:600; color:var(--teal); margin-bottom:8px">3. Autoregressive Temporal Lags (16)</div>
          <ul style="padding-left:18px; font-size:12.5px; line-height:1.7; color:var(--text-dim)">
            <li><code>Temperature_Lag_1</code> through <code>Temperature_Lag_7</code> (Short-term thermal memory)</li>
            <li><code>Temperature_Lag_14</code>, <code>Temperature_Lag_30</code> (Extended synoptic cycles)</li>
            <li><code>Rainfall_Lag_1</code> through <code>Rainfall_Lag_7</code> (Precipitation persistence)</li>
            <li><code>Rainfall_Lag_14</code>, <code>Rainfall_Lag_30</code> (Sub-seasonal soil moisture proxy)</li>
          </ul>
        </div>

        <div style="background:rgba(8,17,29,0.6); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
          <div style="font-weight:600; color:var(--purple-neon); margin-bottom:8px">4. Multi-Horizon Rolling Windows (6)</div>
          <ul style="padding-left:18px; font-size:12.5px; line-height:1.7; color:var(--text-dim)">
            <li><code>Temperature_Rolling_7</code>, <code>14</code>, <code>30</code> — Backward rolling moving averages</li>
            <li><code>Rainfall_Rolling_7</code>, <code>14</code>, <code>30</code> — Backward cumulative precipitation envelopes</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 4. Models -->
    <section class="card" id="models" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">
          <span class="badge badge-cyan">04</span>
          <span>Dual Machine Learning Pipelines</span>
        </div>
      </div>

      <div class="grid grid-2">
        <div style="border:1px solid rgba(56,189,248,0.2); border-radius:8px; padding:16px; background:rgba(8,17,29,0.5)">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">
            <h3 style="font-size:15px; color:var(--cyan); margin:0">StandardScaler + Linear Regression</h3>
            <span class="badge badge-normal">TEMPERATURE ENGINE</span>
          </div>
          <p style="font-size:13px; line-height:1.6; color:var(--text-dim); margin-bottom:10px">
            Atmospheric daily mean temperature exhibits continuous physical persistence governed by solar zenith geometry. Linear Regression provides closed-form, deterministic solutions with complete resistance to catastrophic out-of-distribution drift.
          </p>
          <div style="font-family:'JetBrains Mono',monospace; font-size:11.5px; color:var(--text-muted)">
            Target: T_{t+1} | Pipeline: StandardScaler() -> LinearRegression()
          </div>
        </div>

        <div style="border:1px solid rgba(56,189,248,0.2); border-radius:8px; padding:16px; background:rgba(8,17,29,0.5)">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">
            <h3 style="font-size:15px; color:var(--teal); margin:0">Gradient Boosting Regressor</h3>
            <span class="badge badge-cyan">RAINFALL ENGINE</span>
          </div>
          <p style="font-size:13px; line-height:1.6; color:var(--text-dim); margin-bottom:10px">
            Daily rainfall is zero-inflated and non-linear. An ensemble of 150 gradient-boosted decision trees (learning rate = 0.05, max_depth = 4) captures non-linear threshold dynamics, convective cloud bursts, and dry-spell transitions.
          </p>
          <div style="font-family:'JetBrains Mono',monospace; font-size:11.5px; color:var(--text-muted)">
            Target: R_{t+1} (bounded >= 0) | Loss: Squared Error | Estimators: 150
          </div>
        </div>
      </div>
    </section>

    <!-- 5. Evaluation -->
    <section class="card" id="evaluation" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">
          <span class="badge badge-cyan">05</span>
          <span>Rigorous Test Evaluation & Baseline Comparison</span>
        </div>
      </div>
      <p style="font-size:13px; color:var(--text-dim); margin-bottom:12px">
        Out-of-sample holdout test partition: 3,208 chronologically successive days (March 20, 2016 – December 30, 2024). Evaluated against both Climatology and Persistence (Lag-1) baselines.
      </p>

      <div style="overflow-x:auto">
        <table class="command-table">
          <thead>
            <tr>
              <th>Evaluation Metric</th>
              <th>Climatology (Monthly Mean)</th>
              <th>Persistence (Lag-1)</th>
              <th>Deployed Model Result</th>
              <th>Relative Skill vs Baseline</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Mean Absolute Error (Temp)</strong></td>
              <td>3.31 °C</td>
              <td>0.80 °C</td>
              <td style="color:var(--cyan); font-weight:700">0.73 °C</td>
              <td><span class="badge badge-normal">+8.8% Skill Over Persistence</span></td>
            </tr>
            <tr>
              <td><strong>Root Mean Square Error (Temp)</strong></td>
              <td>3.80 °C</td>
              <td>1.04 °C</td>
              <td style="color:var(--cyan); font-weight:700">0.93 °C</td>
              <td><span class="badge badge-normal">+10.6% Skill Over Persistence</span></td>
            </tr>
            <tr>
              <td><strong>Coefficient of Determination R² (Temp)</strong></td>
              <td>−0.013</td>
              <td>0.923</td>
              <td style="color:var(--cyan); font-weight:700">0.940</td>
              <td><span class="badge badge-normal">Beats All Baselines</span></td>
            </tr>
            <tr>
              <td><strong>Mean Absolute Error (Rain)</strong></td>
              <td>5.89 mm</td>
              <td>5.86 mm</td>
              <td style="color:var(--teal); font-weight:700">4.54 mm</td>
              <td><span class="badge badge-normal">+22.5% Error Reduction</span></td>
            </tr>
            <tr>
              <td><strong>Root Mean Square Error (Rain)</strong></td>
              <td>8.38 mm</td>
              <td>10.37 mm</td>
              <td style="color:var(--teal); font-weight:700">7.34 mm</td>
              <td><span class="badge badge-normal">+29.2% Error Reduction</span></td>
            </tr>
            <tr>
              <td><strong>Coefficient of Determination R² (Rain)</strong></td>
              <td>−0.000</td>
              <td>−0.533</td>
              <td style="color:var(--teal); font-weight:700">0.232</td>
              <td><span class="badge badge-normal">Positive Skill Over Baselines</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 6. SHAP -->
    <section class="card" id="shap" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">
          <span class="badge badge-cyan">06</span>
          <span>SHAP Game-Theoretic Explainability Engine</span>
        </div>
      </div>
      <p style="font-size:13px; line-height:1.7; color:var(--text-dim); margin-bottom:12px">
        SHAP (SHapley Additive exPlanations) grounds each forecast in cooperative game theory. Shapley values uniquely satisfy four fundamental axioms of fair attribution: Efficiency, Symmetry, Dummy Player, and Additivity.
      </p>
      <div class="grid grid-2">
        <div style="background:rgba(8,17,29,0.6); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
          <div style="font-weight:600; color:var(--cyan); margin-bottom:6px">LinearExplainer (Temperature Pipeline)</div>
          <p style="font-size:12.5px; line-height:1.6; color:var(--text-dim)">
            Calculated analytically from regression coefficients and feature covariance matrices without Monte Carlo sampling approximations. Evaluated against 80 representative historical background baseline states.
          </p>
        </div>
        <div style="background:rgba(8,17,29,0.6); padding:14px; border-radius:6px; border:1px solid var(--border-subtle)">
          <div style="font-weight:600; color:var(--teal); margin-bottom:6px">TreeExplainer (Rainfall Ensemble)</div>
          <p style="font-size:12.5px; line-height:1.6; color:var(--text-dim)">
            Computes exact Shapley values directly across all tree split paths in polynomial time O(TLD^2), guaranteeing lossless attribution of non-linear interaction effects.
          </p>
        </div>
      </div>
    </section>

    <!-- 7. Risk Classification -->
    <section class="card" id="risk" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">
          <span class="badge badge-cyan">07</span>
          <span>Empirical Relative Risk Classification</span>
        </div>
      </div>
      <p style="font-size:13px; line-height:1.6; color:var(--text-dim); margin-bottom:14px">
        Risk tiers are strictly relative percentiles calibrated against Karnataka's 44-year empirical climatological distribution (1981–2024, n = 16,071 days):
      </p>
      <table class="spec-table">
        <thead>
          <tr>
            <th>Severity Tier</th>
            <th>Temperature Threshold Boundary</th>
            <th>Precipitation Threshold Boundary</th>
            <th>Operational Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="badge badge-normal">LOW / BASELINE</span></td>
            <td>T ≤ P50 (21.32 °C)</td>
            <td>R ≤ P25 (0.006 mm)</td>
            <td>Within lower 50% / dry baseline conditions.</td>
          </tr>
          <tr>
            <td><span class="badge badge-advisory">MODERATE / NORMAL</span></td>
            <td>P50 &lt; T ≤ P75 (21.32 – 23.89 °C)</td>
            <td>P25 &lt; R ≤ P75 (0.006 – 7.35 mm)</td>
            <td>Typical seasonal weather envelope.</td>
          </tr>
          <tr>
            <td><span class="badge badge-warning">HIGH / WATCH</span></td>
            <td>P75 &lt; T ≤ P90 (23.89 – 24.83 °C)</td>
            <td>P75 &lt; R ≤ P90 (7.35 – 16.22 mm)</td>
            <td>Upper quartile anomaly requiring municipal vigilance.</td>
          </tr>
          <tr>
            <td><span class="badge badge-critical">VERY HIGH / CRITICAL</span></td>
            <td>T &gt; P90 (24.83 °C)</td>
            <td>R &gt; P90 (16.22 mm)</td>
            <td>Top 10% historical extreme; triggers emergency response.</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 8. ENSO Physics -->
    <section class="card" id="enso" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">
          <span class="badge badge-cyan">08</span>
          <span>ENSO Physics & Causality Guardrails</span>
        </div>
      </div>
      <p style="font-size:13px; line-height:1.7; color:var(--text-dim)">
        The Oceanic Niño Index represents a planetary-scale coupled ocean-atmosphere oscillation. While El Niño episodes are statistically linked to weakened Indian Southwest Monsoon circulation at inter-annual horizons, the daily correlation between Niño 3.4 SST anomalies and local Karnataka precipitation is near-zero (Pearson r ≈ 0.003). Therefore, ONI serves as a macro-climatic contextual background feature, never as a sole deterministic trigger of localized weather.
      </p>
    </section>

    <!-- 9. Limitations -->
    <section class="card" id="limitations" style="margin-bottom:20px">
      <div class="card-header">
        <div class="card-title">
          <span class="badge badge-warning">09</span>
          <span>Scientific Limitations & Methodological Constraints</span>
        </div>
      </div>
      <ul style="padding-left:20px; font-size:13px; line-height:1.8; color:var(--text-dim)">
        <li><strong>Stochastic Nature of Rainfall (R² = 0.23):</strong> Daily precipitation exhibits high spatial intermittency. Predictions reflect directional probabilities, not micro-scale rainfall totals.</li>
        <li><strong>Statewide Climatological Aggregation:</strong> Forecasting models operate on Karnataka statewide spatial averages. Microclimates (e.g., Western Ghats vs. Hyderabad-Karnataka arid plains) exhibit distinct local dynamics.</li>
        <li><strong>Absence of Validated 44-Year Relative Humidity:</strong> Continuous hourly wet-bulb temperatures are unavailable, precluding formal Heat Index (HI) computations.</li>
        <li><strong>Historical Research Focus:</strong> The system is designed for retrospective analytical research and scenario simulations, not real-time operational numerical weather prediction.</li>
      </ul>
    </section>

    <!-- 10. References -->
    <section class="card" id="references">
      <div class="card-header">
        <div class="card-title">
          <span class="badge badge-cyan">10</span>
          <span>Academic References & Literature Citations</span>
        </div>
      </div>
      <ol style="padding-left:22px; font-size:12.5px; line-height:1.9; color:var(--text-dim)">
        <li>NOAA Climate Prediction Center. (2024). <em>Oceanic Niño Index (ONI) Operational Table</em>. NOAA/NCEP, Silver Spring, MD.</li>
        <li>Lundberg, S. M., &amp; Lee, S.-I. (2017). A unified approach to interpreting model predictions. <em>Advances in Neural Information Processing Systems (NeurIPS)</em>, 30.</li>
        <li>Lundberg, S. M., et al. (2020). From local explanations to global understanding with explainable AI for trees. <em>Nature Machine Intelligence</em>, 2(1), 56–67.</li>
        <li>Pedregosa, F., et al. (2011). Scikit-learn: Machine learning in Python. <em>Journal of Machine Learning Research</em>, 12, 2825–2830.</li>
        <li>Rajeevan, M., Bhate, J., &amp; Jaswal, A. K. (2008). Analysis of variability and trends of extreme rainfall events over India. <em>Geophysical Research Letters</em>, 35(18).</li>
        <li>Webster, P. J., et al. (1998). Monsoons: Processes, predictability, and the prospects for prediction. <em>Journal of Geophysical Research: Oceans</em>, 103(C7), 14451–14510.</li>
        <li>IPCC. (2021). <em>Climate Change 2021: The Physical Science Basis</em>. Contribution of Working Group I to the Sixth Assessment Report. Cambridge University Press.</li>
      </ol>
    </section>
  `;
}

renderMethodology();
