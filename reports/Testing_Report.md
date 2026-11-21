# Comprehensive QA & Testing Report

**Project:** AI-Driven El Niño-Aware Urban Heat Risk Prediction and Adaptation Planning System for Karnataka  
**Test Suite:** `tests/test_system.py`  
**Execution Timestamp:** 2026-11-03  
**Result:** 15/15 Tests Passed (100% Success Rate)  

---

## 1. Test Environment Specification

- **Operating System:** Microsoft Windows 10 Pro (x86_64)
- **Python Runtime:** Python 3.14 (with Scikit-learn 1.9.1, Pandas 2.2+, NumPy, Flask 3.1)
- **Machine Learning Pipelines:**
  - Temperature Model: `StandardScaler` + `LinearRegression` (`models/Temperature_Prediction_Model.pkl`)
  - Rainfall Model: `GradientBoostingRegressor` (`models/Rainfall_Prediction_Model.pkl`)
  - Feature Space: 32 Dimensions (`models/Model_Feature_Columns.pkl`)
- **Database Engine:** MySQL 8.0 Server (Running on localhost:3306) with Automatic Failover to Cleaned Historical Datasets

---

## 2. Test Execution Summary

| Test Category | Test Case Method | Description | Input / Condition | Actual Output | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Model Integrity** | `test_feature_columns_count_and_order` | Validates all 32 engineered features are present in strict order | Loaded `Model_Feature_Columns.pkl` | Exactly 32 features matched | **PASS** |
| **Model Integrity** | `test_temperature_model_prediction` | Validates Linear Regression pipeline output | First row of feature dataset | Continuous °C in valid Karnataka range (10–45 °C) | **PASS** |
| **Model Integrity** | `test_rainfall_model_prediction` | Validates Gradient Boosting Regressor output | First row of feature dataset | Non-negative precipitation value | **PASS** |
| **Risk Classification** | `test_temperature_percentile_classification` | Validates historical percentiles (P50, P75, P90) | P50 (21.32 °C), P75 (23.89 °C), P90 (24.83 °C) | Low, Moderate, High, Very High tiers | **PASS** |
| **Risk Classification** | `test_rainfall_percentile_classification` | Validates historical percentiles (P25, P75, P90) | P25 (0.006 mm), P75 (7.35 mm), P90 (16.22 mm) | Low, Normal, High, Very High tiers | **PASS** |
| **Risk Classification** | `test_sector_adaptation_matrix_structure` | Validates multi-sector action directives | `Very High` Heat, `High` Rain | Directives for Public Health, Urban, Drainage, Water | **PASS** |
| **Frontend Routes** | `test_page_routes_return_200` | Validates all HTML template pages render | `GET /`, `/climate`, `/predict`, `/explain`, `/adaptation`, `/history`, `/chat`, `/about` | HTTP 200 for all 8 views | **PASS** |
| **REST API** | `test_api_health_endpoint` | Validates server health check | `GET /api/health` | HTTP 200, status details for DB, models, gemini | **PASS** |
| **REST API** | `test_api_features_endpoint` | Validates feature metadata and date bounds | `GET /api/features` | HTTP 200, 32 features, min: 1981-01-31, max: 2024-12-30 | **PASS** |
| **REST API** | `test_api_dashboard_endpoint` | Validates cached analytical summaries | `GET /api/dashboard` | HTTP 200, yearly, monthly, enso, thresholds returned | **PASS** |
| **Prediction API** | `test_predict_from_valid_date` | Validates automated feature synthesis & local SHAP | `POST /api/predict-from-date {"date": "2024-05-15"}` | HTTP 200, Temp: 23.46 °C, Rain: 5.73 mm, 32 features auto-extracted | **PASS** |
| **Prediction API** | `test_predict_from_invalid_date_returns_404` | Validates handling of out-of-bounds dates | `POST /api/predict-from-date {"date": "1960-01-01"}` | HTTP 404 with error message and valid range | **PASS** |
| **Prediction API** | `test_direct_predict_missing_features_returns_400`| Validates payload missing required features | `POST /api/predict {"date": "2024-05-15", "Month": 5}` | HTTP 400 rejecting incomplete feature sets | **PASS** |
| **Data Export** | `test_export_csv_endpoint` | Validates CSV generation for Power BI/audits | `GET /api/export-history-csv?limit=20` | HTTP 200, `text/csv`, header with predictions | **PASS** |
| **Chatbot API** | `test_chat_endpoint_grounded_response` | Validates domain-grounded response engine | `POST /api/chat {"message": "What is the Oceanic Nino Index?"}` | HTTP 200, grounded answer with source indicator | **PASS** |

---

## 3. Detailed Component Verification

### A. Machine Learning Pipeline Verification
- **Model Files:** `models/Temperature_Prediction_Model.pkl` (3 KB), `models/Rainfall_Prediction_Model.pkl` (203 KB).
- **Feature Columns:** 32 features loaded from `models/Model_Feature_Columns.pkl`.
- **Accuracy Audit (Step 10):**
  - Temperature (Linear Regression): MAE = 0.7252 °C, RMSE = 0.9263 °C, R² = 0.9398.
  - Rainfall (Gradient Boosting): MAE = 4.5415 mm, RMSE = 7.3401 mm, R² = 0.2320.
- **Zero Manual Technical Entry:** Verified that users only provide a calendar date; all 32 lag and rolling features are synthesized deterministically without data leakage.

### B. Local and Global SHAP Explainability
- **Linear SHAP:** Applied to StandardScaler + Linear Regression pipeline for temperature.
- **Tree SHAP:** Applied to Gradient Boosting Regressor for precipitation.
- **Verification:** Both explainers returned additive feature contribution vectors that match the prediction shift relative to baseline expectation.

### C. MySQL Database Connectivity & Resilient Fallback
- **Connection Configuration:** Externalized via environment variables (`MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_PORT`, `MYSQL_DATABASE`).
- **Resilience:** When credentials are not yet supplied or MySQL authentication fails, the platform traps the error gracefully (`1045 Access denied`) and serves prediction history from verified historical CSV reports without crashing.

### D. Gemini Chatbot Integration
- **Grounding:** Injected with 44-year Karnataka meteorological summary, ENSO teleconnection science, model performance statistics, and historical percentiles.
- **Security:** API key managed strictly via environment variable `GEMINI_API_KEY`. Frontend code contains zero API keys.
- **Offline Reliability:** Verified that when `GEMINI_API_KEY` is omitted, the domain knowledge engine answers queries accurately with technical rigor.
