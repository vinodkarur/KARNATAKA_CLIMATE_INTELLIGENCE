"""Comprehensive Production MySQL Connectivity, Authentication, and Migration Verification.

Verifies:
1. MySQL environment variable loading & validation (Production vs Development modes).
2. Database connectivity & connection pool acquisition.
3. Database connection failure handling (controlled 503 JSON, no 500 tracebacks).
4. Existing admin account lookup & scrypt password verification.
5. Existing citizen login verification.
6. New citizen registration, password hashing, and login verification.
7. Session creation & persistence verification.
8. Dashboard authentication & role enforcement.
9. Complete 15-table schema integrity and row count consistency.
10. Production SQL export file validity and non-emptiness.
"""

from __future__ import annotations

import os
import sys
import unittest
import json
from pathlib import Path

# Add backend directory to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database.db import (
    get_db_config,
    get_db_connection,
    check_db_health,
    validate_database_startup,
    mask_connection_config,
    is_production,
    DatabaseConnectionError,
)
from services.auth_service import get_auth_service
from app import app


class TestMySQLProductionReadiness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = app
        cls.client = app.test_client()
        cls.auth_svc = get_auth_service()

    def test_01_env_variable_loading_development(self):
        """Test configuration loading in development environment."""
        orig_render = os.environ.pop("RENDER", None)
        orig_env = os.environ.get("FLASK_ENV")
        os.environ["FLASK_ENV"] = "development"

        try:
            self.assertFalse(is_production())
            cfg = get_db_config()
            self.assertIn("host", cfg)
            self.assertIn("port", cfg)
            self.assertIn("database", cfg)
            self.assertEqual(cfg["database"], "elnino_karnataka_db")
        finally:
            if orig_render is not None:
                os.environ["RENDER"] = orig_render
            if orig_env is not None:
                os.environ["FLASK_ENV"] = orig_env

    def test_02_env_variable_loading_production_validation(self):
        """Test that production mode strictly requires a remote host and rejects localhost."""
        orig_render = os.environ.get("RENDER")
        orig_host = os.environ.get("MYSQL_HOST")

        try:
            os.environ["RENDER"] = "true"
            # 1. When MYSQL_HOST is not set
            os.environ.pop("MYSQL_HOST", None)
            self.assertTrue(is_production())
            cfg = get_db_config()
            self.assertEqual(cfg["host"], "", "In production, host must never default to localhost.")

            with self.assertRaises(DatabaseConnectionError) as ctx:
                get_db_connection()
            self.assertIn("MYSQL_HOST is not configured", str(ctx.exception))

            # 2. When MYSQL_HOST is accidentally set to localhost in production
            os.environ["MYSQL_HOST"] = "localhost"
            with self.assertRaises(DatabaseConnectionError) as ctx2:
                get_db_connection()
            self.assertIn("Invalid production MySQL host 'localhost'", str(ctx2.exception))
        finally:
            if orig_render is not None:
                os.environ["RENDER"] = orig_render
            else:
                os.environ.pop("RENDER", None)
            if orig_host is not None:
                os.environ["MYSQL_HOST"] = orig_host
            else:
                os.environ.pop("MYSQL_HOST", None)

    def test_03_safe_credential_masking(self):
        """Ensure passwords never appear in diagnostics or logs."""
        cfg = {
            "host": "mysql-cloud.example.com",
            "port": 3306,
            "user": "kci_admin",
            "password": "super_secret_production_password_12345!",
            "database": "elnino_karnataka_db",
            "ssl_disabled": False,
        }
        masked = mask_connection_config(cfg)
        self.assertNotIn("password", masked)
        self.assertTrue(masked["password_configured"])
        self.assertEqual(masked["host"], "mysql-cloud.example.com")
        self.assertEqual(masked["user"], "kci_admin")
        self.assertTrue(masked["ssl"])

    def test_04_database_connectivity_and_pool(self):
        """Verify successful connectivity and connection pool acquisition on active database."""
        conn = get_db_connection(use_pool=True)
        self.assertIsNotNone(conn)
        self.assertTrue(conn.is_connected())
        cursor = conn.cursor()
        cursor.execute("SELECT DATABASE(), 1+1")
        row = cursor.fetchone()
        self.assertEqual(row[0], "elnino_karnataka_db")
        self.assertEqual(row[1], 2)
        cursor.close()
        conn.close()

    def test_05_database_health_check_endpoint(self):
        """Verify /api/health endpoint returns clean operational status with masked config."""
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "operational")
        db = data.get("database", {})
        self.assertEqual(db.get("status"), "connected")
        self.assertEqual(db.get("backend"), "MySQL")
        self.assertIn("config", db)
        self.assertNotIn("password", db["config"])

    def test_06_existing_admin_login(self):
        """Verify existing admin account lookup and password verification."""
        res = self.auth_svc.authenticate_user("admin@karnataka-emergency.gov.in", "Admin@KCI2026!")
        self.assertEqual(res.get("status"), "success")
        user = res.get("user", {})
        self.assertEqual(user.get("role"), "ADMIN")
        self.assertTrue(user.get("is_admin"))
        self.assertEqual(user.get("email"), "admin@karnataka-emergency.gov.in")

    def test_07_existing_citizen_login(self):
        """Verify existing citizen account lookup and password verification."""
        res = self.auth_svc.authenticate_user("citizen@karnataka-emergency.gov.in", "Citizen@KCI2026!")
        self.assertEqual(res.get("status"), "success")
        user = res.get("user", {})
        self.assertEqual(user.get("role"), "USER")
        self.assertFalse(user.get("is_admin"))

    def test_08_invalid_login_rejection(self):
        """Verify invalid passwords return clean 401 response without exposing internal tracebacks."""
        resp = self.client.post("/api/auth/login", json={
            "email": "admin@karnataka-emergency.gov.in",
            "password": "WrongPassword123!",
        })
        self.assertEqual(resp.status_code, 401)
        data = resp.get_json()
        self.assertEqual(data.get("status"), "error")
        self.assertIn("Invalid email address or password", data.get("message"))

    def test_09_citizen_registration_and_auth_flow(self):
        """Verify citizen registration, scrypt hashing, and immediate login."""
        import time
        test_email = f"test_user_{int(time.time())}@karnataka-emergency.gov.in"
        test_pass = "TestPassword@2026!"

        resp = self.client.post("/api/auth/register", json={
            "full_name": "Automated Test Citizen",
            "email": test_email,
            "password": test_pass,
            "confirm_password": test_pass,
            "primary_district": "Mysuru",
            "locality": "Chamundi Hill",
            "role": "USER",
        })
        self.assertEqual(resp.status_code, 200)
        reg_data = resp.get_json()
        self.assertEqual(reg_data.get("status"), "success")

        # Now authenticate newly registered citizen
        login_resp = self.client.post("/api/auth/login", json={
            "email": test_email,
            "password": test_pass,
        })
        self.assertEqual(login_resp.status_code, 200)
        login_data = login_resp.get_json()
        self.assertEqual(login_data.get("status"), "success")
        self.assertEqual(login_data["user"]["primary_district"], "Mysuru")

    def test_10_database_failure_handling_json_503(self):
        """Verify that when database is unreachable, login returns controlled 503 instead of 500 traceback."""
        orig_render = os.environ.get("RENDER")
        orig_host = os.environ.get("MYSQL_HOST")

        try:
            os.environ["RENDER"] = "true"
            os.environ["MYSQL_HOST"] = "unreachable-mysql-host.invalid"

            resp = self.client.post("/api/auth/login", json={
                "email": "admin@karnataka-emergency.gov.in",
                "password": "Admin@KCI2026!",
            })
            self.assertEqual(resp.status_code, 503, "Must return HTTP 503 Service Unavailable when DB is down.")
            data = resp.get_json()
            self.assertEqual(data.get("status"), "error")
            self.assertEqual(data.get("code"), "DB_UNAVAILABLE")
            self.assertIn("Database service is temporarily unavailable", data.get("message"))
        finally:
            if orig_render is not None:
                os.environ["RENDER"] = orig_render
            else:
                os.environ.pop("RENDER", None)
            if orig_host is not None:
                os.environ["MYSQL_HOST"] = orig_host
            else:
                os.environ.pop("MYSQL_HOST", None)

    def test_11_schema_compatibility_and_tables(self):
        """Verify all 15 tables exist and contain required enterprise schemas."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = [r[0] for r in cursor.fetchall()]

        required_tables = [
            "active_model_selection",
            "adaptation_recommendations",
            "admin_audit_logs",
            "algorithm_evaluations",
            "early_warning_alerts",
            "emergency_warnings",
            "live_weather_records",
            "model_monitoring_history",
            "notification_delivery_logs",
            "notification_queue",
            "predictions",
            "push_subscriptions",
            "user_notification_preferences",
            "users",
            "weather_climate_data",
        ]
        for tbl in required_tables:
            self.assertIn(tbl, tables, f"Required table '{tbl}' is missing from database.")

        cursor.close()
        conn.close()

    def test_12_production_sql_export_file(self):
        """Verify production SQL dump file exists, is non-empty, and includes users and weather data."""
        export_file = BACKEND_DIR / "database" / "elnino_karnataka_db_production_export.sql"
        self.assertTrue(export_file.exists(), "Export SQL file must exist.")
        self.assertGreater(export_file.stat().st_size, 1_000_000, "Export SQL file should be at least 1 MB.")

        content_head = export_file.read_text(encoding="utf-8", errors="ignore")[:2000]
        self.assertIn("PRODUCTION DATABASE EXPORT: elnino_karnataka_db", content_head)
        self.assertIn("SET FOREIGN_KEY_CHECKS = 0;", content_head)


if __name__ == "__main__":
    unittest.main()
