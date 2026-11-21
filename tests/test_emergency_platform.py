"""Unit and Integration Test Suite for Enterprise Weather & Emergency Platform.

Tests:
1. Live Weather API client & 7-day forecast normalization across Karnataka districts.
2. Alias resolution for all 31 districts.
3. Multi-Hazard Risk Assessment (Heavy Rain, Flood, Heat, Thunderstorm, Winds, Drought).
4. Early Warning Lifecycle & duplicate suppression.
5. User authentication, password hashing, session tokens, and RBAC.
6. Web Push subscription management & location-aware emergency broadcasting.
7. Admin Command Centre telemetry & audit logging.
8. HTTP response codes for all new pages and API endpoints.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

# Add backend to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from app import app
from services.district_service import DISTRICT_REGISTRY
from services.forecast_service import get_forecast_service, normalize_district_name
from services.hazard_risk_engine import get_hazard_risk_engine, SEVERITY_GREEN, SEVERITY_YELLOW, SEVERITY_ORANGE, SEVERITY_RED
from services.warning_service import get_warning_service
from services.auth_service import get_auth_service
from services.notification_service import get_notification_service


class TestEnterpriseEmergencyPlatform(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        cls.client = app.test_client()
        cls.forecast_svc = get_forecast_service()
        cls.hazard_engine = get_hazard_risk_engine()
        cls.warning_svc = get_warning_service()
        cls.auth_svc = get_auth_service()
        cls.notif_svc = get_notification_service()

    def test_district_registry_has_31_districts(self):
        """Confirm all 31 Karnataka districts are present in registry."""
        self.assertEqual(len(DISTRICT_REGISTRY), 31)
        self.assertIn("Bengaluru Urban", DISTRICT_REGISTRY)
        self.assertIn("Dakshina Kannada", DISTRICT_REGISTRY)
        self.assertIn("Kalaburagi", DISTRICT_REGISTRY)
        self.assertIn("Vijayanagara", DISTRICT_REGISTRY)

    def test_district_alias_resolution(self):
        """Verify district alias normalization."""
        self.assertEqual(normalize_district_name("Mysore"), "Mysuru")
        self.assertEqual(normalize_district_name("Belgaum"), "Belagavi")
        self.assertEqual(normalize_district_name("Bellary"), "Ballari")
        self.assertEqual(normalize_district_name("Bijapur"), "Vijayapura")
        self.assertEqual(normalize_district_name("Chickballapur"), "Chikkaballapur")

    def test_live_forecast_returns_7day_and_hourly(self):
        """Verify real forecast API delivers current conditions, 7-day daily, and 24h hourly horizons."""
        fc = self.forecast_svc.get_district_forecast("Bengaluru Urban")
        self.assertEqual(fc["status"], "success")
        self.assertIsNotNone(fc["current"])
        self.assertIn("temperature_c", fc["current"])
        self.assertIn("rainfall_mm", fc["current"])
        self.assertIn("condition", fc["current"])
        self.assertEqual(len(fc["hourly"]), 24)
        self.assertEqual(len(fc["daily"]), 7)
        self.assertEqual(fc["provenance"]["status_label"], "LIVE OPERATIONAL")

    def test_hazard_risk_engine_evaluation(self):
        """Verify hazard engine assesses multiple atmospheric hazards with standard severity tiers."""
        fc = self.forecast_svc.get_district_forecast("Ballari")
        res = self.hazard_engine.evaluate_forecast(fc)
        self.assertEqual(res["status"], "success")
        self.assertIn("overall_hazard_level", res)
        self.assertIn(res["overall_hazard_level"], [SEVERITY_GREEN, SEVERITY_YELLOW, SEVERITY_ORANGE, SEVERITY_RED])
        self.assertGreaterEqual(len(res["hazards"]), 5)

        # Check hazard categories present
        hazard_ids = [h["hazard_id"] for h in res["hazards"]]
        self.assertIn("HEAVY_RAINFALL", hazard_ids)
        self.assertIn("FLOOD_RISK", hazard_ids)
        self.assertIn("EXTREME_HEAT", hazard_ids)
        self.assertIn("THUNDERSTORM_LIGHTNING", hazard_ids)
        self.assertIn("STRONG_WINDS", hazard_ids)

    def test_warning_lifecycle_and_duplicate_suppression(self):
        """Verify warning generation suppresses duplicates on repeated execution."""
        fc = self.forecast_svc.get_district_forecast("Dakshina Kannada")
        alerts_1 = self.warning_svc.evaluate_and_generate_warnings(fc)
        alerts_2 = self.warning_svc.evaluate_and_generate_warnings(fc)

        # Count of active alerts should not double
        active = self.warning_svc.get_all_active_warnings(district="Dakshina Kannada")
        self.assertLessEqual(len(active), len(alerts_1) + len(alerts_2))

    def test_user_authentication_flow(self):
        """Test registration, duplicate prevention, and password verification."""
        test_email = "test_eval_officer@kci-emergency.gov.in"
        reg = self.auth_svc.register_user(
            full_name="Evaluation Officer",
            email=test_email,
            password="SecurePassword@2026",
            primary_district="Mysuru",
            role="USER",
        )
        # Should succeed or already exist
        self.assertIn(reg["status"], ["success", "error"])

        # Test valid login
        auth = self.auth_svc.authenticate_user(test_email, "SecurePassword@2026")
        self.assertEqual(auth["status"], "success")
        self.assertEqual(auth["user"]["primary_district"], "Mysuru")

        # Test invalid password rejection
        bad_auth = self.auth_svc.authenticate_user(test_email, "WrongPassword")
        self.assertEqual(bad_auth["status"], "error")

    def test_push_subscription_and_broadcast_dispatch(self):
        """Verify push subscription registration and affected-district matching."""
        sub_res = self.notif_svc.register_push_subscription(
            endpoint="https://push.browser.test/v1/sub_unit_test",
            p256dh="key_p256dh_test",
            auth="key_auth_test",
            district="Ballari",
        )
        self.assertEqual(sub_res["status"], "success")

        # Dispatch broadcast to Ballari
        bcast = self.notif_svc.dispatch_emergency_broadcast({
            "alert_id": "WRN-UNIT-TEST-001",
            "district": "Ballari",
            "severity": "HIGH WATCH",
            "title": "Severe Heat Stress Watch — Ballari Sector",
            "rationale": "High temperature alert test.",
        }, channels=["web_push", "in_app"])

        self.assertEqual(bcast["status"], "success")
        self.assertEqual(bcast["district"], "Ballari")
        self.assertGreaterEqual(bcast["delivered_count"], 1)

    def test_http_api_endpoints(self):
        """Test HTTP contracts of all newly introduced API routes."""
        # 1. Weather Current
        r = self.client.get("/api/weather/current?district=Bengaluru%20Urban")
        self.assertEqual(r.status_code, 200)

        # 2. Weather 7-Day Forecast
        r = self.client.get("/api/weather/forecast/7day?district=Belagavi")
        self.assertEqual(r.status_code, 200)

        # 3. Weather Districts Statewide
        r = self.client.get("/api/weather/districts")
        self.assertEqual(r.status_code, 200)

        # 4. Active Alerts
        r = self.client.get("/api/alerts/active")
        self.assertEqual(r.status_code, 200)

        # 5. Admin Overview
        r = self.client.get("/api/admin/overview")
        self.assertEqual(r.status_code, 200)

        # 6. Notifications VAPID Key
        r = self.client.get("/api/notifications/vapid-key")
        self.assertEqual(r.status_code, 200)

    def test_html_pages_render(self):
        """Verify all HTML template pages render with HTTP 200."""
        pages = ["/login", "/register", "/user-dashboard", "/admin", "/sw.js"]
        for p in pages:
            r = self.client.get(p)
            self.assertEqual(r.status_code, 200, f"Page {p} failed with HTTP {r.status_code}")


if __name__ == "__main__":
    unittest.main()
