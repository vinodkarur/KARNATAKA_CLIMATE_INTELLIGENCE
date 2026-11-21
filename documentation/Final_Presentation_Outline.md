# Final Presentation Outline: Project Viva Defense

## Project Title
**AI-Driven El Niño-Aware Urban Heat Risk Prediction and Adaptation Planning System for Karnataka**

---

### Slide 1: Title & Introduction
- **Project Title:** AI-Driven El Niño-Aware Urban Heat Risk Prediction and Adaptation Planning System for Karnataka
- **Presenter:** Vinod (Student / Developer)
- **Domain:** Artificial Intelligence, Climate Data Science, Full-Stack Software Engineering
- **College / Department:** Computer Science & Engineering / Data Science

### Slide 2: Problem Statement & Motivation
- Escalation of extreme urban heat waves and unpredictable monsoonal rainfall in Karnataka.
- The challenge of relating macro ocean-atmosphere phenomena (El Niño / La Niña) to local weather outcomes.
- Lack of interpretable AI systems that translate raw numerical forecasts into multi-sector urban adaptation policies.

### Slide 3: Project Objectives
- Integrate 44 years of continuous daily weather records (1981–2024) with NOAA Oceanic Niño Index (ONI).
- Engineer 32 automated features (cyclical trigonometric, lags 1–30, rolling stats 7–30).
- Develop dual predictive ML models for Next-Day Mean Temperature and Next-Day Rainfall.
- Provide SHAP explainability for global transparency and local date-specific predictions.
- Map forecasts to historical percentile risk categories (P50, P75, P90).
- Generate municipal adaptation actions across Public Health, Urban Infrastructure, Drainage, and Agriculture.
- Deliver full-stack software: Vanilla JS dashboard, Flask REST APIs, MySQL, Gemini AI chatbot, and Power BI reports.

### Slide 4: Data Engineering & Teleconnection Science
- **Primary Datasets:** 16,071 cleaned daily observations (IMD/NASA POWER) + NOAA ONI (1950–2026).
- **ENSO Phases:** El Niño (ONI ≥ +0.5), Neutral (-0.5 to +0.5), La Niña (ONI ≤ -0.5).
- **Scientific Caveat:** ENSO is a macro-climatic teleconnection, not the sole cause of local Karnataka weather. Local topography (Western Ghats), monsoon troughs, and urban heat island dynamics are crucial.

### Slide 5: The 32 Automated Engineered Features
- **Trigonometric Cyclical Encodings:** `Month_Sin/Cos`, `DayOfYear_Sin/Cos` (preserves circular continuity).
- **Macro Climate States:** `ONI`, `ONI_Lag_30`, `El_Nino`, `La_Nina`, `Neutral`.
- **Autoregressive Lags:** Temperature & Rainfall Lags at 1, 2, 3, 7, 14, 30 days.
- **Moving Window Aggregations:** Rolling 7, 14, 30-day means for Temperature and Rainfall.
- **Zero Manual Input:** User only enters an observation date; all 32 features are generated automatically.

### Slide 6: Machine Learning Models & Evaluation
- **Temperature Pipeline:** StandardScaler + Linear Regression
  - Test MAE: **0.7252 °C** | Test RMSE: **0.9263 °C** | Test R²: **0.9398** (High accuracy).
- **Rainfall Pipeline:** Gradient Boosting Regressor (150 estimators, lr=0.05)
  - Test MAE: **4.5415 mm** | Test RMSE: **7.3401 mm** | Test R²: **0.2320** (Modest skill due to extreme precipitation intermittency).
- **Engineering Honesty:** Rainfall predictions are utilized as relative risk indicators rather than millimeter-exact guarantees.

### Slide 7: Explainable AI (SHAP)
- **Linear SHAP & Tree SHAP:** Unpacks the "black box" of machine learning.
- **Global Findings:** Seasonal geometry and short-term autoregressive lags dominate predictive weight; ONI provides background climate state modulation.
- **Local Explanations:** Live breakdown showing exact positive and negative feature contributions for any selected day.

### Slide 8: Risk Classification & Municipal Adaptation Planning
- **Statistical Percentiles:** Low (≤ P50), Moderate/Normal (P50–P75), High (P75–P90), Very High (> P90).
- **Multi-Sector Matrix:**
  - *Public Health:* ORS booths, cooling centers, labor shift rescheduling.
  - *Urban Infrastructure:* Cool-roof coatings, pedestrian misting, canopy preservation.
  - *Stormwater Drainage:* Pre-emptive drain de-silting, mobile dewatering pumps.
  - *Water Resources & Agriculture:* Rainwater harvesting retention, drip irrigation directives.

### Slide 9: System Architecture & Full-Stack Implementation
- **Frontend:** Vanilla HTML5, CSS3, JavaScript, Chart.js (Fast, responsive, zero heavy framework overhead).
- **Backend:** Python Flask RESTful service with modular database and service layers.
- **Database:** MySQL 8.0 (`elnino_karnataka_db`) with automated fallback to verified CSV reports.
- **Chatbot:** Google Gemini 2.0 Flash integration with grounded domain engine fallback.
- **Power BI:** Comprehensive 4-page dashboard with DAX measures and dimensional data modeling.

### Slide 10: Live Demonstration Walkthrough
- Navigation through all 8 pages: Dashboard, Climate & ENSO, AI Predictions, SHAP Explainability, Adaptation Planning, Prediction History, Gemini Assistant, About.
- Sampling a historical date and demonstrating automatic 32-feature extraction, dual predictions, and local SHAP charts.
- Asking the Gemini chatbot domain-specific questions.

### Slide 11: Limitations & Future Enhancements
- **Limitations:** Daily spatial aggregation; lack of humidity and Wet Bulb Globe Temperature (WBGT) in historical raw set.
- **Future Work:** District-level spatial gridding for all 31 Karnataka districts; Deep Learning Temporal Fusion Transformers; Live telemetric IoT ingestion from KSNDMC.

### Slide 12: Conclusion & Q&A
- Delivered a verified, fully working, scientifically realistic climate intelligence decision-support platform.
- 100% test pass rate across 15 automated integration tests.
- Thank you to evaluators – Open for Questions and Technical Defense.
