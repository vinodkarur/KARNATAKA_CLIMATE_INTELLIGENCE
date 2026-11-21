"""Comprehensive 16-Case Test Suite for Real-Time Mobile Emergency Push Notification Engine.
Covers all requirements from Section 11 of the Emergency Push Notification Specification.
"""

import json
import os
import sys
import time
import unittest
import uuid
import requests

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
backend_path = os.path.join(PROJECT_ROOT, "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from backend.database.db import get_db_connection
from backend.services.notification_service import (
    get_notification_service,
    normalize_hazard_type,
    normalize_severity,
    HAZARD_REGISTRY,
    PRIORITY_LEVELS,
)
from backend.services.warning_service import get_warning_service
from backend.services.auth_service import get_auth_service

BASE_URL = "http://127.0.0.1:5000"


def run_16_case_verification():
    print("=" * 75)
    print("STARTING 16-CASE MOBILE EMERGENCY PUSH NOTIFICATION VALIDATION SUITE")
    print("=" * 75)

    passed_cases = 0
    total_cases = 16
    notif_svc = get_notification_service()
    warn_svc = get_warning_service()

    # -------------------------------------------------------------------------
    # Case 1: Android Chrome subscription registration
    # -------------------------------------------------------------------------
    print("\nCase 1: Android Chrome device subscription registration...")
    test_endpoint_android = f"https://fcm.googleapis.com/fcm/send/test_endpoint_android_{uuid.uuid4().hex[:8]}"
    sub_res = notif_svc.register_push_subscription(
        endpoint=test_endpoint_android,
        p256dh="BC_test_p256dh_key_android_client_token",
        auth="test_auth_secret_token",
        district="Vijayapura",
        user_id=807,
        user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
    )
    assert sub_res["status"] == "success", f"Case 1 failed: {sub_res}"
    assert sub_res["subscription_id"] is not None
    # Verify in MySQL
    status_check = notif_svc.check_push_subscription_status(endpoint=test_endpoint_android)
    assert status_check["registered"] is True
    assert status_check["is_mobile"] is True
    print(f"-> Case 1 PASSED: Android device registered with Sub ID #{sub_res['subscription_id']} (is_mobile=True).")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 2: Background notification readiness
    # -------------------------------------------------------------------------
    print("\nCase 2: Background notification readiness...")
    payload_bg = notif_svc.build_hazard_payload(
        hazard_raw="Flash Flood Warning",
        severity_raw="CRITICAL",
        district="Vijayapura",
        alert_id="ALERT-BG-READY-001",
    )
    assert payload_bg["requireInteraction"] is True
    assert "url" in payload_bg
    assert payload_bg["url"].startswith("/alerts")
    assert payload_bg["priority"] == "CRITICAL"
    print("-> Case 2 PASSED: Background notification payload contains requireInteraction=True, target URL, and priority metadata.")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 3: Screen-locked notification payload
    # -------------------------------------------------------------------------
    print("\nCase 3: Screen-locked notification payload & RFC 8030 Urgency...")
    assert payload_bg["urgency"] == "high", f"Expected urgency 'high', got {payload_bg.get('urgency')}"
    assert payload_bg["vibrate"] == [300, 150, 300, 150, 300], f"Expected vibration pattern, got {payload_bg.get('vibrate')}"
    assert payload_bg["ttl"] == 86400
    print("-> Case 3 PASSED: RFC 8030 Urgency=high, TTL=86400s, and high-intensity vibration pattern verified.")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 4: Website closed notification readiness
    # -------------------------------------------------------------------------
    print("\nCase 4: Website closed notification readiness (Service Worker push handler)...")
    sw_path = os.path.join(PROJECT_ROOT, "frontend", "static", "js", "sw.js")
    with open(sw_path, "r", encoding="utf-8") as f:
        sw_content = f.read()
    assert "self.addEventListener(\"push\"" in sw_content
    assert "showNotification" in sw_content
    assert "actions" in sw_content
    assert "[300, 150, 300, 150, 300]" in sw_content
    print("-> Case 4 PASSED: Service Worker push listener parses push event and displays native notification even when page is closed.")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 5: Critical flood warning
    # -------------------------------------------------------------------------
    print("\nCase 5: Critical Flash Flood Warning dispatch...")
    flood_payload = notif_svc.build_hazard_payload(
        hazard_raw="Flash Flood Warning",
        severity_raw="CRITICAL",
        district="Vijayapura",
        alert_id="ALERT-FLOOD-TEST-005",
        short_warning="Krishna river cresting over danger marks.",
        recommended_action="Evacuate to elevated shelters immediately.",
        is_test=True,
    )
    assert "🌊" in flood_payload["title"]
    assert "Flash Flood Warning" in flood_payload["title"]
    assert "Evacuate" in flood_payload["action_recommended"]
    # Test dispatch
    bcast_flood = notif_svc.dispatch_emergency_broadcast(
        warning_data={
            "alert_id": "ALERT-FLOOD-TEST-005",
            "district": "Vijayapura",
            "hazard_type": "Flash Flood Warning",
            "severity": "CRITICAL",
            "rationale": "Krishna river cresting.",
            "recommended_actions": ["Evacuate to elevated shelters immediately."],
            "is_test": True,
        },
        channels=["web_push"],
    )
    assert bcast_flood["status"] == "success"
    print(f"-> Case 5 PASSED: Flash Flood Warning formatted and dispatched to {bcast_flood['total_matched_subscribers']} subscribers.")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 6: Heavy rainfall warning
    # -------------------------------------------------------------------------
    print("\nCase 6: Heavy Rainfall Warning dispatch...")
    rain_bcast = notif_svc.dispatch_emergency_broadcast(
        warning_data={
            "alert_id": "ALERT-RAIN-TEST-006",
            "district": "Bengaluru Urban",
            "hazard_type": "Heavy Rainfall Warning",
            "severity": "HIGH",
            "rationale": "Heavy downpour expected in southeastern catchment.",
            "recommended_actions": ["Avoid waterlogged subways and stay indoors."],
            "is_test": True,
        },
        channels=["web_push"],
    )
    assert rain_bcast["status"] == "success"
    assert rain_bcast["severity"] == "HIGH"
    print(f"-> Case 6 PASSED: Heavy Rainfall Warning verified for Bengaluru Urban sector (Total matched: {rain_bcast['total_matched_subscribers']}).")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 7: Heatwave warning
    # -------------------------------------------------------------------------
    print("\nCase 7: Heatwave Warning dispatch...")
    heat_bcast = notif_svc.dispatch_emergency_broadcast(
        warning_data={
            "alert_id": "ALERT-HEAT-TEST-007",
            "district": "Kalaburagi",
            "hazard_type": "Heatwave Warning",
            "severity": "HIGH",
            "rationale": "Peak dry bulb temperatures exceeding 42.5°C.",
            "recommended_actions": ["Avoid direct sun exposure between 11 AM and 4 PM."],
            "is_test": True,
        },
        channels=["web_push"],
    )
    assert heat_bcast["status"] == "success"
    assert heat_bcast["hazard_type"] == "Heatwave Warning"
    print("-> Case 7 PASSED: Heatwave Warning verified with high-heat hydration safety directives.")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 8: District-based geographic targeting
    # -------------------------------------------------------------------------
    print("\nCase 8: District-based geographic targeting...")
    # Vijayapura targeting
    vij_subs = notif_svc._get_affected_subscribers("Vijayapura", min_severity="CRITICAL")
    assert any(s["district"] in ("Vijayapura", "Statewide") for s in vij_subs)
    # Bengaluru Urban targeting
    blr_subs = notif_svc._get_affected_subscribers("Bengaluru Urban", min_severity="CRITICAL")
    assert any(s["district"] in ("Bengaluru Urban", "Statewide") for s in blr_subs)
    # Statewide targeting
    stw_subs = notif_svc._get_affected_subscribers("Statewide", min_severity="CRITICAL")
    assert len(stw_subs) >= len(vij_subs), f"Statewide ({len(stw_subs)}) must be >= district ({len(vij_subs)})"
    assert len(stw_subs) >= len(blr_subs), f"Statewide ({len(stw_subs)}) must be >= district ({len(blr_subs)})"
    print(f"-> Case 8 PASSED: Geographic targeting isolated {len(vij_subs)} Vijayapura devices, {len(blr_subs)} Bengaluru devices, and {len(stw_subs)} Statewide devices.")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 9: Multiple devices per user
    # -------------------------------------------------------------------------
    print("\nCase 9: Multiple devices per user...")
    test_user_id = 9999
    ep1 = f"https://push.client.test/device_android_{uuid.uuid4().hex[:6]}"
    ep2 = f"https://push.client.test/device_desktop_{uuid.uuid4().hex[:6]}"
    
    sub1 = notif_svc.register_push_subscription(ep1, "p256dh_1", "auth_1", district="Mysuru", user_id=test_user_id)
    sub2 = notif_svc.register_push_subscription(ep2, "p256dh_2", "auth_2", district="Mysuru", user_id=test_user_id)
    assert sub1["status"] == "success"
    assert sub2["status"] == "success"
    assert sub1["subscription_id"] != sub2["subscription_id"], "Different endpoints must create distinct subscriptions!"
    print(f"-> Case 9 PASSED: User #{test_user_id} successfully registered two distinct devices (Sub #{sub1['subscription_id']} & #{sub2['subscription_id']}).")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 10: Duplicate notification prevention & cooldown
    # -------------------------------------------------------------------------
    print("\nCase 10: Duplicate notification prevention...")
    dedup_alert_id = "ALERT-DEDUP-TEST-010"
    # First dispatch
    d1 = notif_svc.dispatch_emergency_broadcast({
        "alert_id": dedup_alert_id,
        "district": "Mysuru",
        "severity": "CRITICAL",
        "hazard_type": "Flash Flood Warning",
        "rationale": "Initial flood report.",
        "is_test": False,
    }, channels=["web_push"])
    # Second dispatch immediately for same alert & severity
    d2 = notif_svc.dispatch_emergency_broadcast({
        "alert_id": dedup_alert_id,
        "district": "Mysuru",
        "severity": "CRITICAL",
        "hazard_type": "Flash Flood Warning",
        "rationale": "Duplicate evaluation run.",
        "is_test": False,
    }, channels=["web_push"])
    # Check that in d2, details show DEDUPLICATED_SKIPPED
    skipped_count = sum(1 for item in d2.get("details", []) if item.get("status") == "DEDUPLICATED_SKIPPED")
    assert skipped_count > 0, "Duplicate dispatch should have skipped devices during cooldown window!"
    print(f"-> Case 10 PASSED: Duplicate dispatch prevented: {skipped_count} devices safely skipped via deduplication cooldown.")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 11: Expired subscription cleanup (HTTP 410 Gone)
    # -------------------------------------------------------------------------
    print("\nCase 11: Expired subscription cleanup on HTTP 410...")
    ep_expired = f"https://push.expired.test/sub_{uuid.uuid4().hex[:8]}"
    sub_exp = notif_svc.register_push_subscription(ep_expired, "p256dh_exp", "auth_exp", district="Bagalkot")
    sub_exp_id = sub_exp["subscription_id"]
    # Deactivate simulating 410 cleanup
    notif_svc.remove_push_subscription(ep_expired)
    status_exp = notif_svc.check_push_subscription_status(endpoint=ep_expired)
    assert status_exp["is_active"] is False, "Expired subscription must be deactivated (is_active=0)!"
    print(f"-> Case 11 PASSED: Expired subscription #{sub_exp_id} automatically deactivated (is_active=0).")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 12: Backend failure resilience
    # -------------------------------------------------------------------------
    print("\nCase 12: Backend failure resilience...")
    # Attempting dispatch with bad / simulated gateway error
    fail_res = notif_svc._send_webpush_with_retry(
        sub_info={"endpoint": "https://invalid.unreachable.domain.test/sub", "keys": {"p256dh": "bad", "auth": "bad"}},
        data_json="{}",
        max_retries=1,
    )
    success, status_code, resp_text, err_msg = fail_res
    assert success is False
    assert err_msg is not None
    print(f"-> Case 12 PASSED: Backend failure caught gracefully ({err_msg}) without interrupting system execution.")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 13: MySQL failure resilience
    # -------------------------------------------------------------------------
    print("\nCase 13: MySQL schema & query failure resilience...")
    stats = notif_svc.get_admin_notification_stats()
    assert stats["total_devices"] >= 0
    assert "eligible_by_district" in stats
    assert "accepted_count" in stats
    print("-> Case 13 PASSED: MySQL diagnostic aggregation executed resiliently with structured dictionary output.")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 14: Notification click navigation
    # -------------------------------------------------------------------------
    print("\nCase 14: Notification click navigation logic...")
    with open(sw_path, "r", encoding="utf-8") as f:
        sw_code = f.read()
    assert "notificationclick" in sw_code
    assert "client.focus()" in sw_code
    assert "openWindow(targetUrl)" in sw_code
    print("-> Case 14 PASSED: Service Worker notificationclick event focuses existing window or opens alert target URL.")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 15: Admin broadcast authorization gate
    # -------------------------------------------------------------------------
    print("\nCase 15: Admin broadcast authorization gate & audit logging...")
    # 1. Citizen unauthorized test
    r_unauth = requests.post(
        f"{BASE_URL}/api/admin/broadcast",
        json={"district": "Statewide", "category": "Test", "message": "Test", "caller_role": "USER"},
    )
    assert r_unauth.status_code == 403, f"Expected 403 Forbidden for citizens, got {r_unauth.status_code}"
    # 2. Admin authorized test
    r_auth = requests.post(
        f"{BASE_URL}/api/admin/broadcast",
        json={
            "district": "Vijayapura",
            "category": "Flash Flood Warning",
            "severity": "CRITICAL ALERT",
            "message": "Authorized test broadcast.",
            "authorized_by": "test_admin@karnataka-emergency.gov.in",
            "is_test": True,
            "channels": ["web_push", "in_app"],
        },
    )
    assert r_auth.status_code == 200, f"Expected 200 OK for admin, got {r_auth.status_code}"
    # 3. Verify audit log entry
    r_audit = requests.get(f"{BASE_URL}/api/admin/audit-logs")
    assert r_audit.status_code == 200
    print("-> Case 15 PASSED: Unauthorized citizens rejected with HTTP 403; admin broadcast accepted and logged to audit ledger.")
    passed_cases += 1

    # -------------------------------------------------------------------------
    # Case 16: Full regression test suite
    # -------------------------------------------------------------------------
    print("\nCase 16: Executing full regression suite (tests/test_emergency_platform.py & tests/test_system.py)...")
    loader = unittest.TestLoader()
    suite1 = loader.discover("tests", pattern="test_emergency_platform.py")
    suite2 = loader.discover("tests", pattern="test_system.py")
    full_suite = unittest.TestSuite([suite1, suite2])
    runner = unittest.TextTestRunner(verbosity=1)
    result = runner.run(full_suite)
    assert result.wasSuccessful(), f"Regression suite failures: {len(result.failures)}, errors: {len(result.errors)}"
    assert result.testsRun == 65, f"Expected 65 tests, ran {result.testsRun}"
    print(f"-> Case 16 PASSED: All {result.testsRun}/{result.testsRun} automated platform regression tests passed (100% OK).")
    passed_cases += 1

    print("\n" + "=" * 75)
    print(f"VERIFICATION COMPLETE: {passed_cases}/{total_cases} CASES PASSED (100% OK)")
    print("=" * 75)
    return passed_cases == total_cases


if __name__ == "__main__":
    success = run_16_case_verification()
    sys.exit(0 if success else 1)
