"""Automated test suite for the Karnataka El Nino-aware climate risk system.

These tests exercise the real saved models, the real engineered dataset and the
real Flask API contracts.  They do not require a live MySQL server or a Gemini
API key: both integrations intentionally fall back to CSV / offline modes.
"""

from __future__ import annotations

import io
import json
import sys
import time
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Import the Flask application (adds backend/ to the import path)
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app import (  # noqa: E402
    app,
    feature_columns,
    rainfall_model,
    store,
    temperature_model,
    thresholds,
)
from database.db import check_db_health  # noqa: E402
from services.risk import (  # noqa: E402
    classify_drought,
    classify_rainfall,
    classify_temperature,
    drought_recommendations,
    rainfall_recommendations,
    sector_adaptation_matrix,
    temperature_recommendations,
)


class TestDatasetIntegrity(unittest.TestCase):
    """Verify the engineered dataset and prove there is no future leakage."""

    @classmethod
    def setUpClass(cls):
        cls.features = store.features.copy()
        cls.weather = store.weather.copy().set_index("Date")

    def test_no_duplicate_or_unsorted_dates(self):
        self.assertEqual(int(self.features["Date"].duplicated().sum()), 0)
        self.assertTrue(self.features["Date"].is_monotonic_increasing)

    def test_targets_are_exactly_next_day_observations(self):
        weather = self.weather
        checked = 0
        for _, row in self.features.iloc[200:260].iterrows():
            next_day = row["Date"] + pd.Timedelta(days=1)
            if next_day not in weather.index:
                continue
            observed_temp = float(weather.loc[next_day, "Mean_Temperature"])
            observed_rain = float(weather.loc[next_day, "Rainfall"])
            self.assertAlmostEqual(
                float(row["Target_Next_Day_Temperature"]), observed_temp, places=3
            )
            self.assertAlmostEqual(
                float(row["Target_Next_Day_Rainfall"]), observed_rain, places=3
            )
            checked += 1
        self.assertGreater(checked, 20)

    def test_lag_features_use_past_weather_only(self):
        weather = self.weather
        checked = 0
        for _, row in self.features.iloc[100:140].iterrows():
            previous_day = row["Date"] - pd.Timedelta(days=1)
            if previous_day not in weather.index:
                continue
            self.assertAlmostEqual(
                float(row["Temperature_Lag_1"]),
                float(weather.loc[previous_day, "Mean_Temperature"]),
                places=3,
            )
            self.assertAlmostEqual(
                float(row["Rainfall_Lag_1"]),
                float(weather.loc[previous_day, "Rainfall"]),
                places=3,
            )
            checked += 1
        self.assertGreater(checked, 20)

    def test_rolling_windows_are_backward_looking(self):
        weather = self.weather
        row = self.features.iloc[400]
        window_dates = pd.date_range(end=row["Date"], periods=7, freq="D")
        expected_temp = float(weather.loc[window_dates, "Mean_Temperature"].mean())
        expected_rain = float(weather.loc[window_dates, "Rainfall"].mean())
        self.assertAlmostEqual(
            float(row["Temperature_Rolling_7"]), expected_temp, places=3
        )
        self.assertAlmostEqual(
            float(row["Rainfall_Rolling_7"]), expected_rain, places=3
        )

    def test_feature_columns_match_dataset(self):
        self.assertEqual(len(feature_columns), 32)
        for column in feature_columns:
            self.assertIn(column, self.features.columns)
        self.assertNotIn("Target_Next_Day_Temperature", feature_columns)
        self.assertNotIn("Target_Next_Day_Rainfall", feature_columns)

    def test_no_null_values_in_model_features(self):
        nulls = self.features[feature_columns].isna().sum().sum()
        self.assertEqual(int(nulls), 0)


class TestModelIntegrity(unittest.TestCase):
    """Verify that the saved models still reproduce their documented metrics."""

    @classmethod
    def setUpClass(cls):
        data = store.features
        split = int(len(data) * 0.8)
        cls.test_frame = data.iloc[split:].reset_index(drop=True)

    def test_temperature_metrics_reproduce(self):
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

        frame = self.test_frame
        predictions = temperature_model.predict(frame[feature_columns])
        actual = frame["Target_Next_Day_Temperature"].to_numpy()
        self.assertAlmostEqual(mean_absolute_error(actual, predictions), 0.725237, places=3)
        self.assertAlmostEqual(
            float(np.sqrt(mean_squared_error(actual, predictions))), 0.926273, places=3
        )
        self.assertAlmostEqual(r2_score(actual, predictions), 0.939791, places=3)

    def test_rainfall_metrics_reproduce(self):
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

        frame = self.test_frame
        predictions = rainfall_model.predict(frame[feature_columns])
        actual = frame["Target_Next_Day_Rainfall"].to_numpy()
        self.assertAlmostEqual(mean_absolute_error(actual, predictions), 4.541498, places=3)
        self.assertAlmostEqual(
            float(np.sqrt(mean_squared_error(actual, predictions))), 7.340111, places=3
        )
        self.assertAlmostEqual(r2_score(actual, predictions), 0.231950, places=3)

    def test_predictions_are_physically_plausible(self):
        sample = store.features[feature_columns].iloc[[0, 5000, 10000, 16039]]
        temperatures = temperature_model.predict(sample)
        rainfall = rainfall_model.predict(sample)
        for value in temperatures:
            self.assertGreater(float(value), 5.0)
            self.assertLess(float(value), 45.0)
        for value in rainfall:
            self.assertTrue(np.isfinite(float(value)))


class TestRiskClassification(unittest.TestCase):
    def test_temperature_percentile_tiers(self):
        p50 = thresholds["Temperature_50th_Percentile"]
        p75 = thresholds["Temperature_75th_Percentile"]
        p90 = thresholds["Temperature_90th_Percentile"]
        self.assertEqual(classify_temperature(p50 - 1.0, thresholds), "Low")
        self.assertEqual(classify_temperature(p50 + 0.01, thresholds), "Moderate")
        self.assertEqual(classify_temperature(p75 + 0.01, thresholds), "High")
        self.assertEqual(classify_temperature(p90 + 0.01, thresholds), "Very High")

    def test_rainfall_percentile_tiers(self):
        p25 = thresholds["Rainfall_25th_Percentile"]
        p75 = thresholds["Rainfall_75th_Percentile"]
        p90 = thresholds["Rainfall_90th_Percentile"]
        self.assertEqual(classify_rainfall(p25 - 0.01, thresholds), "Low")
        self.assertEqual(classify_rainfall(p25 + 0.01, thresholds), "Normal")
        self.assertEqual(classify_rainfall(p75 + 0.01, thresholds), "High")
        self.assertEqual(classify_rainfall(p90 + 0.01, thresholds), "Very High")

    def test_drought_percentile_tiers(self):
        percentiles = store.drought_thresholds_cache["rolling_30d_rainfall_percentiles"]
        self.assertEqual(classify_drought(percentiles["P10"] - 1.0, percentiles), "High")
        self.assertEqual(classify_drought(percentiles["P25"] - 0.01, percentiles), "Moderate")
        self.assertEqual(classify_drought(percentiles["P75"], percentiles), "Low")

    def test_sector_adaptation_matrix_structure(self):
        matrix = sector_adaptation_matrix("Very High", "High")
        required = [
            "public_health",
            "urban_infrastructure",
            "stormwater_drainage",
            "water_and_agriculture",
        ]
        for sector in required:
            self.assertIn(sector, matrix)
            self.assertTrue(matrix[sector]["tier"])
            self.assertGreater(len(matrix[sector]["action"]), 20)

    def test_recommendation_text_for_every_tier(self):
        for level in ("Low", "Moderate", "High", "Very High"):
            self.assertGreater(len(temperature_recommendations(level)), 20)
        for level in ("Low", "Normal", "High", "Very High"):
            self.assertGreater(len(rainfall_recommendations(level)), 20)
        for level in ("Low", "Moderate", "High"):
            self.assertGreater(len(drought_recommendations(level)), 20)


class TestPageRoutes(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_all_pages_render(self):
        pages = {
            "/": "Dashboard",
            "/climate": "Climate",
            "/predict": "Prediction",
            "/explain": "SHAP",
            "/adaptation": "Adaptation",
            "/district": "District",
            "/risk": "Risk",
            "/drought": "Drought",
            "/history": "History",
            "/chat": "Assistant",
            "/methodology": "Methodology",
            "/about": "About",
        }
        for route in pages:
            response = self.client.get(route)
            self.assertEqual(response.status_code, 200, f"{route} returned {response.status_code}")
            self.assertEqual(response.mimetype, "text/html")
            self.assertIn(b"<!DOCTYPE html>", response.data)

    def test_unknown_page_returns_html_404(self):
        response = self.client.get("/does-not-exist")
        self.assertEqual(response.status_code, 404)
        self.assertIn(b"Page not found", response.data)


class TestAPIContracts(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    # -- metadata ---------------------------------------------------------
    def test_health_endpoint(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "operational")
        self.assertIn(data["persistence"], {"mysql", "sqlite_local", "csv_report_fallback"})
        self.assertIn("database", data)
        self.assertTrue(data["models"]["loaded"])
        self.assertEqual(data["models"]["feature_count"], 32)
        self.assertEqual(data["records"]["total"], len(store.features))

    def test_features_endpoint(self):
        data = self.client.get("/api/features").get_json()
        self.assertEqual(data["total_features"], 32)
        self.assertEqual(data["feature_count"], 32)
        self.assertEqual(len(data["feature_columns"]), 32)
        self.assertEqual(data["date_range"]["min"], store.date_min)
        self.assertEqual(data["date_range"]["max"], store.date_max)
        self.assertIn("calendar", data["feature_groups"])

    def test_dashboard_endpoint(self):
        data = self.client.get("/api/dashboard").get_json()
        for key in ("summary", "yearly", "monthly", "enso", "shap", "evaluation", "thresholds"):
            self.assertIn(key, data)
        self.assertEqual(len(data["yearly"]["year"]), len(data["yearly"]["mean_temperature"]))
        self.assertEqual(len(data["monthly"]["month"]), 12)

    def test_shap_endpoint(self):
        data = self.client.get("/api/shap").get_json()
        self.assertGreater(len(data["temperature_ranked"]), 0)
        self.assertGreater(len(data["rainfall_ranked"]), 0)
        for item in data["temperature_ranked"][:5]:
            self.assertIn("feature", item)
            self.assertIn("importance", item)
        self.assertGreaterEqual(
            data["temperature_ranked"][0]["importance"],
            data["temperature_ranked"][-1]["importance"],
        )

    # -- district ---------------------------------------------------------
    def test_district_list(self):
        data = self.client.get("/api/district").get_json()
        self.assertEqual(data["count"], 25)
        self.assertEqual(len(data["districts"]), 25)
        sample = data["districts"][0]
        for key in (
            "District",
            "mean_daily",
            "max_daily",
            "drought_risk",
            "flood_risk",
            "avg_annual_mm",
            "rainfall_trend_mm_per_year",
        ):
            self.assertIn(key, sample)

    def test_district_sample_quality_flags(self):
        """Sparse gauge districts must be flagged, not presented as solid averages."""
        data = self.client.get("/api/district").get_json()
        haveri = next(d for d in data["districts"] if d["District"] == "Haveri")
        self.assertLess(haveri["total_obs"], 365)
        self.assertEqual(haveri["data_quality"]["level"], "sparse")
        self.assertIn("indicative only", haveri["data_quality"]["message"])

        detail = self.client.get("/api/district/Haveri").get_json()
        self.assertEqual(detail["stats"]["data_quality"]["level"], "sparse")
        self.assertIn("Data quality:", detail["note"])

    def test_district_detail_and_unknown(self):
        detail = self.client.get("/api/district/Mysore")
        self.assertEqual(detail.status_code, 200)
        data = detail.get_json()
        self.assertGreater(len(data["annual_series"]), 0)
        self.assertEqual(data["stats"]["District"], "Mysore")

        missing = self.client.get("/api/district/Atlantis")
        self.assertEqual(missing.status_code, 404)
        self.assertIn("error", missing.get_json())

    # -- thresholds -------------------------------------------------------
    def test_risk_thresholds_payload_and_performance(self):
        start = time.perf_counter()
        response = self.client.get("/api/risk-thresholds")
        elapsed = time.perf_counter() - start
        self.assertEqual(response.status_code, 200)
        self.assertLess(elapsed, 0.25, "risk-thresholds should be pre-computed")

        data = response.get_json()
        self.assertEqual(data["record_count"], len(store.weather))
        for key in ("temperature_distribution", "rainfall_distribution"):
            self.assertAlmostEqual(sum(data[key].values()), 100.0, delta=0.4)
        self.assertLess(
            data["temperature_percentiles"]["P50"],
            data["temperature_percentiles"]["P75"],
        )
        self.assertLess(
            data["rainfall_percentiles"]["P25"],
            data["rainfall_percentiles"]["P90"],
        )

    def test_drought_thresholds_payload(self):
        data = self.client.get("/api/drought-thresholds").get_json()
        percentiles = data["rolling_30d_rainfall_percentiles"]
        ordered = [percentiles[key] for key in ("P5", "P10", "P25", "P50", "P75", "P90", "P95")]
        self.assertEqual(ordered, sorted(ordered))
        self.assertEqual(sum(data["district_drought_counts"].values()), 25)
        self.assertEqual(len(data["driest_districts"]), 5)

    def test_recommendations_full_and_scenario(self):
        full = self.client.get("/api/recommendations")
        self.assertEqual(full.status_code, 200)
        payload = full.get_json()
        self.assertEqual(len(payload["temperature_levels"]), 4)
        self.assertEqual(len(payload["rainfall_levels"]), 4)

        scenario = self.client.get(
            "/api/recommendations?temperature_level=Very%20High&rainfall_level=High"
        )
        self.assertEqual(scenario.status_code, 200)
        scenario_data = scenario.get_json()["scenario"]
        self.assertEqual(scenario_data["temperature_level"], "Very High")
        self.assertIn("stormwater_drainage", scenario_data["sector_matrix"])

    def test_recommendations_reject_invalid_tier(self):
        response = self.client.get("/api/recommendations?temperature_level=Apocalyptic")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    def test_methodology_endpoint(self):
        data = self.client.get("/api/methodology").get_json()
        self.assertEqual(data["feature_count"], 32)
        self.assertGreaterEqual(len(data["datasets"]), 4)
        self.assertGreater(len(data["limitations"]), 3)
        top = data["shap"]["top_temperature_features"]
        self.assertEqual(len(top), 5)
        self.assertGreaterEqual(top[0]["importance"], top[-1]["importance"])

    # -- prediction -------------------------------------------------------
    def test_predict_from_date_returns_next_day_forecast(self):
        response = self.client.post(
            "/api/predict-from-date", json={"date": "2024-05-15"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()

        self.assertEqual(data["status"], "success")
        self.assertEqual(data["observation_date"], "2024-05-15")
        self.assertEqual(data["target_date"], "2024-05-16")
        self.assertEqual(data["date"], "2024-05-16")
        self.assertEqual(data["prediction_horizon_days"], 1)
        self.assertEqual(len(data["features_used"]), 32)

        for key in (
            "predicted_temperature_C",
            "predicted_rainfall_mm",
            "temperature_level",
            "rainfall_level",
            "drought_risk",
            "sector_adaptation",
            "heat_stress_score",
        ):
            self.assertIn(key, data)

        self.assertGreaterEqual(data["predicted_rainfall_mm"], 0.0)
        self.assertGreater(data["predicted_temperature_C"], 5.0)
        self.assertLess(data["predicted_temperature_C"], 45.0)

    def test_predict_from_date_returns_real_local_shap(self):
        data = self.client.post(
            "/api/predict-from-date", json={"date": "2023-04-10"}
        ).get_json()
        shap_data = data["shap"]
        self.assertEqual(len(shap_data["temperature"]), 8)
        self.assertEqual(len(shap_data["rainfall"]), 8)

        for target in ("temperature", "rainfall"):
            items = shap_data[target]
            self.assertGreater(sum(abs(item["shap_value"]) for item in items), 0.0)
            absolute = [abs(item["shap_value"]) for item in items]
            self.assertEqual(absolute, sorted(absolute, reverse=True))
            for item in items:
                self.assertIn(item["feature"], feature_columns)
                self.assertIn(item["direction"], {"increases", "decreases"})
                self.assertIn("feature_value", item)

    def test_predict_from_invalid_dates(self):
        outside = self.client.post(
            "/api/predict-from-date", json={"date": "1960-01-01"}
        )
        self.assertEqual(outside.status_code, 404)
        self.assertIn("date_range", outside.get_json())

        malformed = self.client.post(
            "/api/predict-from-date", json={"date": "not-a-date"}
        )
        self.assertEqual(malformed.status_code, 400)

        missing = self.client.post("/api/predict-from-date", json={})
        self.assertEqual(missing.status_code, 400)

    def test_direct_predict_round_trip(self):
        generated = self.client.post(
            "/api/predict-from-date", json={"date": "2022-08-20"}
        ).get_json()
        payload = dict(generated["features_used"])
        payload["date"] = generated["observation_date"]

        response = self.client.post("/api/predict", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertAlmostEqual(
            data["predicted_temperature_C"],
            generated["predicted_temperature_C"],
            delta=0.05,
        )
        self.assertAlmostEqual(
            data["predicted_rainfall_mm"],
            generated["predicted_rainfall_mm"],
            delta=0.05,
        )

    def test_direct_predict_rejects_missing_or_invalid_features(self):
        missing = self.client.post(
            "/api/predict", json={"date": "2024-05-15", "Month": 5}
        )
        self.assertEqual(missing.status_code, 400)
        self.assertIn("missing_features", missing.get_json())

        generated = self.client.post(
            "/api/predict-from-date", json={"date": "2024-05-15"}
        ).get_json()
        payload = dict(generated["features_used"])
        payload["date"] = "2024-05-15"
        payload["ONI"] = "not-a-number"
        invalid = self.client.post("/api/predict", json=payload)
        self.assertEqual(invalid.status_code, 400)

        not_json = self.client.post(
            "/api/predict", data="not json", content_type="text/plain"
        )
        self.assertEqual(not_json.status_code, 400)

    # -- history / export -------------------------------------------------
    def test_history_endpoint(self):
        data = self.client.get("/api/history?limit=10").get_json()
        self.assertIn(data["source"], {"mysql", "sqlite_local", "csv_report_fallback"})
        self.assertLessEqual(data["count"], 10)
        self.assertEqual(data["count"], len(data["rows"]))

    def test_export_csv_endpoint(self):
        response = self.client.get("/api/export-history-csv?limit=20")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "text/csv")
        self.assertIn(b"Predicted_Temperature_C", response.data)
        frame = pd.read_csv(io.BytesIO(response.data))
        self.assertLessEqual(len(frame), 20)
        self.assertIn("Predicted_Rainfall_mm", frame.columns)

    # -- chatbot / errors -------------------------------------------------
    def test_chat_endpoint(self):
        response = self.client.post(
            "/api/chat", json={"message": "What is the Oceanic Nino Index?"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("reply", data)
        self.assertIn("source", data)
        self.assertGreater(len(data["reply"]), 20)

    def test_chat_rejects_empty_message(self):
        response = self.client.post("/api/chat", json={"message": "   "})
        self.assertEqual(response.status_code, 400)

    def test_unknown_api_returns_json_404(self):
        response = self.client.get("/api/does-not-exist")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.mimetype, "application/json")
        self.assertIn("error", response.get_json())

    def test_security_headers_present(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(response.headers.get("X-Frame-Options"), "SAMEORIGIN")
        self.assertIn("Referrer-Policy", response.headers)

    def test_api_responses_are_strict_json(self):
        """NaN/Infinity tokens would make browser JSON.parse fail."""
        def reject_constant(token):
            raise ValueError(f"Non-standard JSON token: {token}")

        endpoints = (
            "/api/health",
            "/api/dashboard",
            "/api/features",
            "/api/shap",
            "/api/district",
            "/api/district/Haveri",
            "/api/risk-thresholds",
            "/api/drought-thresholds",
            "/api/recommendations",
            "/api/methodology",
        )
        for endpoint in endpoints:
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, 200, endpoint)
            raw = response.data.decode("utf-8")
            # json.loads rejects the non-standard constants via parse_constant.
            json.loads(raw, parse_constant=reject_constant)


class TestDatabaseLayer(unittest.TestCase):
    def test_health_check_is_non_fatal(self):
        health = check_db_health()
        self.assertIn("status", health)
        self.assertIn(health["status"], {"connected", "disconnected", "sqlite_local"})
        if health["status"] == "disconnected":
            self.assertIn("hint", health)

    def test_history_falls_back_without_mysql(self):
        # The API must still answer when MySQL is unavailable.
        client = app.test_client()
        response = client.get("/api/history?limit=5")
        self.assertEqual(response.status_code, 200)
        self.assertIn("rows", response.get_json())



    def test_early_warnings_endpoint(self):
        client = app.test_client()
        response = client.get("/api/alerts")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "success")
        self.assertIn("early_warnings", data)
        ew = data["early_warnings"]
        self.assertIn("status", ew)
        self.assertIn("color", ew)
        self.assertIn("alerts", ew)
        self.assertGreaterEqual(len(ew["alerts"]), 1)

    def test_district_gis_spatial_data(self):
        client = app.test_client()
        response = client.get("/api/district")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["count"], 25)
        for dist in data["districts"]:
            self.assertIn("lat", dist)
            self.assertIn("lon", dist)
            self.assertGreater(dist["lat"], 11.0)
            self.assertLess(dist["lat"], 19.0)
            self.assertGreater(dist["lon"], 73.0)
            self.assertLess(dist["lon"], 79.0)
            self.assertIn("drought_risk", dist)
            self.assertIn("flood_risk", dist)



class TestEnsoAndDistrictRainfallFixes(unittest.TestCase):
    """Rigorous verification for ENSO API and 31-District Rainfall data integrity."""

    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_enso_endpoint_complete_contract(self):
        """Verify /api/enso delivers NOAA CPC 920-month timeline, latest August 2026 and metadata."""
        res = self.client.get("/api/enso")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")

        # 1. Latest observation (August 2026)
        latest = data["latest"]
        self.assertEqual(latest["year"], 2026)
        self.assertEqual(latest["month"], 8)
        self.assertEqual(latest["month_name"], "August")
        self.assertEqual(latest["oni"], 2.16)
        self.assertEqual(latest["phase"], "El Niño")
        self.assertTrue(latest["is_historical_reanalysis"])

        # 2. Multi-decadal summary (1950 to 2026, 920 months)
        summary = data["summary"]
        self.assertEqual(summary["total_months"], 920)
        self.assertEqual(summary["start_year"], 1950)
        self.assertEqual(summary["end_year"], 2026)
        self.assertEqual(summary["el_nino_months"], 234)
        self.assertEqual(summary["la_nina_months"], 238)
        self.assertEqual(summary["neutral_months"], 448)

        # 3. Timeline & Historical Events
        self.assertEqual(len(data["timeline"]), 920)
        self.assertGreaterEqual(len(data["historical_events"]), 6)

    def test_enso_endpoint_filters(self):
        """Verify year and phase filtering on /api/enso."""
        # Year filter (2026 -> 8 months)
        res_2026 = self.client.get("/api/enso?year=2026")
        self.assertEqual(res_2026.status_code, 200)
        data_2026 = res_2026.get_json()
        self.assertEqual(len(data_2026["timeline"]), 8)

        # Phase filter (El Niño >= 0.5)
        res_el = self.client.get("/api/enso?phase=el_nino")
        self.assertEqual(res_el.status_code, 200)
        data_el = res_el.get_json()
        self.assertEqual(len(data_el["timeline"]), 234)
        for m in data_el["timeline"]:
            self.assertGreaterEqual(m["oni"], 0.5)

    def test_district_rainfall_integrity_all_31(self):
        """Verify empirical raingauge data for 25 districts and clean unavailable state for 6."""
        res = self.client.get("/api/districts-full")
        self.assertEqual(res.status_code, 200)
        districts = res.get_json()["districts"]
        self.assertEqual(len(districts), 31)

        # Mysuru (Verified Gauge District)
        res_mys = self.client.get("/api/district/Mysuru")
        self.assertEqual(res_mys.status_code, 200)
        mys = res_mys.get_json()
        self.assertTrue(mys["weather"]["has_gauge_data"])
        self.assertGreater(mys["weather"]["annual_rainfall_mm"], 0)
        self.assertEqual(len(mys["weather"]["monthly_climatology"]), 12)
        self.assertGreater(len(mys["annual_series"]), 0)

        # Bengaluru Urban (Non-gauge District - No fabricated values)
        res_blr = self.client.get("/api/district/Bengaluru Urban")
        self.assertEqual(res_blr.status_code, 200)
        blr = res_blr.get_json()
        self.assertFalse(blr["weather"]["has_gauge_data"])
        self.assertIsNone(blr["weather"]["annual_rainfall_mm"])
        self.assertEqual(len(blr["weather"]["monthly_climatology"]), 0)
        self.assertEqual(len(blr["annual_series"]), 0)
        self.assertIn("Data unavailable", blr["weather"]["data_status"])




class TestMultiHazardEarlyWarningSystem(unittest.TestCase):
    """Verify the multi-hazard early warning engine, database persistence, and REST APIs."""

    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        cls.client = app.test_client()

    def test_statewide_alerts_endpoint(self):
        """Verify GET /api/alerts returns statewide summary and all 31 districts."""
        res = self.client.get("/api/alerts")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["district"], "Statewide")
        self.assertIn("early_warnings", data)
        self.assertIn("status", data["early_warnings"])
        self.assertIn("district_summaries", data)
        self.assertEqual(len(data["district_summaries"]), 31)

        # Dynamic risk matrix structure
        self.assertIn("risk_matrix", data)
        cells = data["risk_matrix"]["cell_counts"]
        for r in ["L4", "L3", "L2", "L1"]:
            for c in ["I1", "I2", "I3", "I4"]:
                self.assertIn(f"{r}-{c}", cells)

    def test_district_specific_alerts_endpoint(self):
        """Verify GET /api/alerts?district=Ballari returns downscaled district alerts."""
        res = self.client.get("/api/alerts?district=Ballari")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["district"], "Ballari")
        self.assertIn("early_warnings", data)
        ew = data["early_warnings"]
        self.assertIn(ew["status"], ["CRITICAL ALERT", "HIGH WATCH", "ADVISORY", "NORMAL BASELINE"])

        # Structured metadata
        alerts = ew.get("alerts", [])
        self.assertGreater(len(alerts), 0)
        top = alerts[0]
        self.assertIn("alert_id", top)
        self.assertIn("observed_or_predicted_value", top)
        self.assertIn("threshold_value", top)
        self.assertIn("likelihood", top)
        self.assertIn("impact", top)
        self.assertIn("matrix_cell", top)

    def test_non_gauge_district_rainfall_handling(self):
        """Verify non-gauge district Bengaluru Urban explicitly marks raingauge unmonitored without fabricating data."""
        res = self.client.get("/api/alerts?district=Bengaluru Urban")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertFalse(data["summary"]["has_gauge_data"])
        self.assertIsNone(data["summary"]["predicted_rainfall_mm"])

        ew = data["early_warnings"]
        rain_alerts = [a for a in ew.get("alerts", []) if "Precipitation" in a.get("hazard_category", "")]
        self.assertGreater(len(rain_alerts), 0)
        self.assertIn("Data Unavailable", rain_alerts[0]["observed_or_predicted_value"])

    def test_alert_persistence_and_history_api(self):
        """Verify alerts are saved and retrieved via GET /api/alerts/history."""
        # Trigger an alert generation to ensure persistence
        self.client.get("/api/alerts?district=Kalaburagi")

        res = self.client.get("/api/alerts/history?district=Kalaburagi")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertGreaterEqual(data["count"], 1)

        # Verify record fields
        rec = data["records"][0]
        self.assertEqual(rec["District"], "Kalaburagi")
        self.assertIn("Hazard_Category", rec)
        self.assertIn("Severity", rec)
        self.assertIn("Rationale", rec)

    def test_alert_csv_export(self):
        """Verify GET /api/alerts/export produces valid CSV file download."""
        res = self.client.get("/api/alerts/export")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/csv", res.headers.get("Content-Type", ""))
        self.assertIn("attachment; filename=", res.headers.get("Content-Disposition", ""))

        csv_text = res.get_data(as_text=True)
        lines = csv_text.strip().split("\n")
        self.assertGreaterEqual(len(lines), 2)
        header = lines[0]
        for field in ["Alert_ID", "Date", "District", "Hazard_Category", "Severity"]:
            self.assertIn(field, header)

    def test_risk_matrix_endpoint(self):
        """Verify GET /api/alerts/matrix returns full 4x4 matrix and status counts."""
        res = self.client.get("/api/alerts/matrix")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertIn("matrix_distribution", data)
        self.assertIn("status_counts", data)
        self.assertEqual(sum(data["status_counts"].values()), 31)


class TestAlgorithmComparisonLab(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_compare_endpoint_validation(self):
        """Verify POST /api/algorithm-lab/compare rejects fewer than 2 algorithms with HTTP 400."""
        res_empty = self.client.post("/api/algorithm-lab/compare", json={"target": "temperature", "algorithms": []})
        self.assertEqual(res_empty.status_code, 400)
        self.assertIn("at least 2 algorithms", res_empty.get_json()["message"])

        res_single = self.client.post("/api/algorithm-lab/compare", json={"target": "temperature", "algorithms": ["Linear Regression"]})
        self.assertEqual(res_single.status_code, 400)
        self.assertIn("at least 2 algorithms", res_single.get_json()["message"])

    def test_compare_endpoint_execution(self):
        """Verify POST /api/algorithm-lab/compare trains and benchmarks selected models."""
        res = self.client.post("/api/algorithm-lab/compare", json={
            "target": "temperature",
            "algorithms": ["Linear Regression", "Decision Tree Regressor"],
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["algorithms_evaluated"], 2)
        self.assertIn("results", data)
        self.assertIn("comparison_charts", data)
        self.assertEqual(len(data["results"]), 2)
        for r in data["results"]:
            self.assertIn("mae", r)
            self.assertIn("rmse", r)
            self.assertIn("r2", r)
            self.assertIn("training_time_sec", r)

    def test_active_model_persistence(self):
        """Verify GET and POST /api/algorithm-lab/active-model persist model selection."""
        res_post = self.client.post("/api/algorithm-lab/active-model", json={
            "target": "temperature",
            "algorithm_name": "Random Forest Regressor",
            "metrics": {
                "r2": 0.9521,
                "mae": 0.4812,
                "rmse": 0.6231,
                "mse": 0.3883,
                "training_time_sec": 1.25,
                "prediction_time_ms": 0.045,
            },
        })
        self.assertEqual(res_post.status_code, 200)
        post_data = res_post.get_json()
        self.assertEqual(post_data["status"], "success")

        res_get = self.client.get("/api/algorithm-lab/active-model?target=temperature")
        self.assertEqual(res_get.status_code, 200)
        get_data = res_get.get_json()
        self.assertEqual(get_data["status"], "success")
        self.assertEqual(get_data["active_model"]["algorithm_name"], "Random Forest Regressor")
        self.assertEqual(get_data["active_model"]["is_active"], 1)



if __name__ == "__main__":
    unittest.main(verbosity=2)
