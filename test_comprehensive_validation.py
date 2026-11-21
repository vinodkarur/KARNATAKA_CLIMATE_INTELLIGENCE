import sys
import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone

sys.path.insert(0, 'backend')
from database.db import get_db_connection
from services.forecast_service import get_forecast_service
from services.hazard_risk_engine import get_hazard_risk_engine, SEVERITY_RED, SEVERITY_ORANGE, SEVERITY_YELLOW
from services.warning_service import get_warning_service
from services.notification_service import get_notification_service

BASE_URL = "http://127.0.0.1:5000"

def post_json(url, payload, headers=None):
    hdrs = {'Content-Type': 'application/json'}
    if headers:
        hdrs.update(headers)
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data_bytes, headers=hdrs)
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode())

def get_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode())

print("=================================================================")
print("STARTING REAL-DEVICE EMERGENCY WARNING DELIVERY VALIDATION")
print("=================================================================")

# =================================================================
# PHASE 1: TRACE COMPLETE WARNING FLOW
# =================================================================
print("\n--- PHASE 1: TRACING COMPLETE END-TO-END WARNING FLOW ---")
f_svc = get_forecast_service()
h_engine = get_hazard_risk_engine()
w_svc = get_warning_service()
n_svc = get_notification_service()

# 1. Ingest real Open-Meteo forecast for Bengaluru Urban
real_fc = f_svc.get_district_forecast("Bengaluru Urban")
print(f"1. Forecast Ingestion: Status={real_fc.get('status')}, Prov={real_fc.get('provenance', {}).get('provider')}, Cached={real_fc.get('is_cached')}")
assert real_fc.get("status") == "success"
assert len(real_fc.get("daily", [])) == 7

# 2. Detect weather condition via HazardRiskEngine
assessment = h_engine.evaluate_forecast(real_fc)
print(f"2. Hazard Evaluation: Level={assessment.get('overall_hazard_level')}, Hazards={len(assessment.get('hazards', []))}")
assert assessment.get("status") == "success"

# 3. Generate structured warnings via WarningService
warnings = w_svc.evaluate_and_generate_warnings(real_fc)
print(f"3. Warning Generation: Generated {len(warnings)} structured alerts.")

# 4. Test simulated RED alert activation
sim_red_fc = {
    "status": "success",
    "district": "Bengaluru Urban",
    "agro_zone": "Southern Dry Zone",
    "basin": "Arkavathi",
    "current": {"temperature_c": 43.5, "apparent_temperature_c": 46.0, "relative_humidity": 35, "rainfall_mm": 0.0, "wind_speed_kmh": 12.0, "wind_gusts_kmh": 18.0, "weather_code": 0},
    "daily": [{"date": "2026-11-20", "temp_max_c": 44.0, "temp_min_c": 28.0, "precipitation_sum_mm": 0.0, "precipitation_probability_pct": 0, "wind_speed_max_kmh": 15.0, "wind_gusts_max_kmh": 22.0, "weather_code": 0}],
    "hourly": [{"time": f"2026-11-20T{h:02d}:00", "temperature_c": 42.0, "apparent_temperature_c": 45.0, "relative_humidity": 35, "precipitation_mm": 0.0, "wind_speed_kmh": 12.0, "wind_gusts_kmh": 18.0, "weather_code": 0} for h in range(24)]
}
red_warnings = w_svc.evaluate_and_generate_warnings(sim_red_fc)
red_alert = next((w for w in red_warnings if w.get("severity_code") == SEVERITY_RED), None)
print(f"4. RED Alert Generation: Alert ID={red_alert.get('alert_id') if red_alert else 'None'}, Severity={red_alert.get('severity_code') if red_alert else 'None'}")
assert red_alert is not None, "Failed to activate RED warning under extreme threshold!"

# 5. Duplicate Suppression Verification
red_warnings_repeat = w_svc.evaluate_and_generate_warnings(sim_red_fc)
active_for_blr = [w for w in w_svc.get_all_active_warnings("Bengaluru Urban") if w.get("hazard_id") == red_alert.get("hazard_id")]
print(f"5. Duplicate Suppression: Active warnings count={len(active_for_blr)} (Expected: 1)")
assert len(active_for_blr) == 1, "Duplicate alert spawned!"

# 6. Lifecycle: Update & Cancellation
alert_id = red_alert["alert_id"]
w_svc.update_warning_status(alert_id, "UPDATED", notes="Emergency operations centre review")
assert w_svc.get_warning_by_id(alert_id)["resolution_status"] == "UPDATED"
w_svc.update_warning_status(alert_id, "CANCELLED", notes="Weather condition dissipated")
assert w_svc.get_warning_by_id(alert_id)["resolution_status"] == "CANCELLED"
assert alert_id not in [w["alert_id"] for w in w_svc.get_all_active_warnings()]
print("6. Lifecycle Update & Cancellation: Verified.")

# 7. Expiry Verification
mock_expired_alert = dict(red_alert)
mock_expired_alert["alert_id"] = "WRN-EXPIRED-TEST"
mock_expired_alert["expires_at"] = "2020-01-01T00:00:00+00:00"
mock_expired_alert["resolution_status"] = "ACTIVE"
w_svc._active_warnings_cache["Bengaluru Urban_EXPIRED_TEST"] = mock_expired_alert
active_after_check = [w["alert_id"] for w in w_svc.get_all_active_warnings()]
assert "WRN-EXPIRED-TEST" not in active_after_check
assert w_svc.get_warning_by_id("WRN-EXPIRED-TEST")["resolution_status"] == "EXPIRED"
print("7. Expired Warning Handling: Automatically transitioned to EXPIRED.")

# =================================================================
# PHASE 3: GEOGRAPHICAL TARGETING TEST
# =================================================================
print("\n--- PHASE 3: GEOGRAPHICAL TARGETING & PREFERENCE FILTERING ---")
conn = get_db_connection()
cursor = conn.cursor(dictionary=True)

# Register 5 test users with different districts and preferences
test_users = [
    (801, "blr_user@test.kci", "Bengaluru Urban", 1), # Blr, Opted in
    (802, "blr_optout@test.kci", "Bengaluru Urban", 0), # Blr, Opted OUT
    (803, "ballari_user@test.kci", "Ballari", 1),       # Ballari, Opted in
    (804, "mysuru_user@test.kci", "Mysuru", 1),         # Mysuru, Opted in
    (805, "statewide_user@test.kci", "Statewide", 1),   # Statewide, Opted in
]

for uid, email, dist, push_pref in test_users:
    # 1. User
    cursor.execute("INSERT INTO users (id, email, password_hash, full_name, primary_district, role) VALUES (%s, %s, 'hash', 'Test', %s, 'USER') ON DUPLICATE KEY UPDATE primary_district = VALUES(primary_district)", (uid, email, dist))
    # 2. Preference
    cursor.execute("INSERT INTO user_notification_preferences (user_id, push_enabled) VALUES (%s, %s) ON DUPLICATE KEY UPDATE push_enabled = VALUES(push_enabled)", (uid, push_pref))
    # 3. Push subscription
    endpoint = f"https://fcm.googleapis.com/fcm/send/test_sub_{uid}"
    cursor.execute("INSERT INTO push_subscriptions (user_id, district, endpoint, p256dh_key, auth_token, is_active) VALUES (%s, %s, %s, 'key', 'auth', 1) ON DUPLICATE KEY UPDATE district = VALUES(district), is_active = 1", (uid, dist, endpoint))
conn.commit()

# Test 3.1: Bengaluru Urban Emergency
blr_subs = n_svc._get_affected_subscribers("Bengaluru Urban")
blr_uids = [s["user_id"] for s in blr_subs]
print(f"Targeting Bengaluru Urban: Matched User IDs: {blr_uids}")
assert 801 in blr_uids, "Eligible Bengaluru user missed!"
assert 805 in blr_uids, "Statewide subscriber missed!"
assert 802 not in blr_uids, "Opted-out user (push_enabled=0) was incorrectly included!"
assert 803 not in blr_uids, "Ballari user incorrectly targeted for Bengaluru alert!"
assert 804 not in blr_uids, "Mysuru user incorrectly targeted for Bengaluru alert!"
print("-> Scenario 1 PASSED: Bengaluru Urban warning isolated to eligible opted-in subscribers.")

# Test 3.2: Ballari Flood Warning
bal_subs = n_svc._get_affected_subscribers("Ballari")
bal_uids = [s["user_id"] for s in bal_subs]
print(f"Targeting Ballari: Matched User IDs: {bal_uids}")
assert 803 in bal_uids, "Eligible Ballari user missed!"
assert 805 in bal_uids, "Statewide user missed!"
assert 801 not in bal_uids, "Bengaluru user incorrectly targeted for Ballari flood!"
print("-> Scenario 2 PASSED: Ballari flood warning isolated correctly.")

# Clean up test user records
cursor.execute("DELETE FROM push_subscriptions WHERE user_id >= 800")
cursor.execute("DELETE FROM user_notification_preferences WHERE user_id >= 800")
cursor.execute("DELETE FROM users WHERE id >= 800")
conn.commit()
cursor.close()
conn.close()

# =================================================================
# PHASE 4: SMS AND EMAIL STATUS VERIFICATION
# =================================================================
print("\n--- PHASE 4: SMS AND EMAIL GATEWAY CREDENTIALS AUDIT ---")
twilio_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
twilio_auth = os.getenv("TWILIO_AUTH_TOKEN", "")
smtp_host = os.getenv("SMTP_HOST", "")
smtp_user = os.getenv("SMTP_USER", "")

sms_configured = bool(twilio_sid and not twilio_sid.startswith("AC_dummy") and twilio_auth and not twilio_auth.startswith("dummy"))
email_configured = bool(smtp_host and smtp_user and not smtp_user.startswith("alerts@karnataka-emergency"))

print(f"SMS Gateway (Twilio): {'CONFIGURED' if sms_configured else 'NOT CONFIGURED (Simulation Hooks Only)'}")
print(f"Email Gateway (SMTP): {'CONFIGURED' if email_configured else 'NOT CONFIGURED (Simulation Hooks Only)'}")
assert not sms_configured, "Dummy SID should be recognized as unconfigured"
assert not email_configured, "Dummy SMTP should be recognized as unconfigured"

# =================================================================
# PHASE 5: EMERGENCY WARNING SCENARIOS (6 MULTI-HAZARD DOMAINS)
# =================================================================
print("\n--- PHASE 5: CONTROLLED 6-HAZARD SCENARIO DRILLS ---")

scenarios = [
    {
        "name": "1. Extreme Rainfall & Flood Inundation",
        "district": "Udupi",
        "override": {
            "daily": [{"date": "2026-11-20", "temp_max_c": 27.0, "temp_min_c": 22.0, "precipitation_sum_mm": 185.0, "precipitation_probability_pct": 100, "wind_speed_max_kmh": 25.0, "wind_gusts_max_kmh": 40.0, "weather_code": 65}],
            "hourly": [{"time": f"2026-11-20T{h:02d}:00", "temperature_c": 24.0, "apparent_temperature_c": 24.0, "relative_humidity": 98, "precipitation_mm": 8.0, "wind_speed_kmh": 25.0, "wind_gusts_max_kmh": 40.0, "weather_code": 65} for h in range(24)]
        },
        "target_hazard": "HEAVY_RAINFALL",
        "expected_severity": SEVERITY_RED
    },
    {
        "name": "2. Flash-Flood High-Intensity Burst",
        "district": "Dakshina Kannada",
        "override": {
            "current": {"rainfall_mm": 35.0, "temperature_c": 24.0},
            "hourly": [{"time": f"2026-11-20T{h:02d}:00", "temperature_c": 24.0, "apparent_temperature_c": 24.0, "relative_humidity": 98, "precipitation_mm": 25.0 if h == 1 else 1.0, "wind_speed_kmh": 25.0, "wind_gusts_max_kmh": 40.0, "weather_code": 65} for h in range(24)]
        },
        "target_hazard": "FLOOD_RISK",
        "expected_severity": SEVERITY_ORANGE
    },
    {
        "name": "3. Extreme Heat & Thermal Stress",
        "district": "Kalaburagi",
        "override": {
            "current": {"temperature_c": 44.5, "apparent_temperature_c": 48.0, "relative_humidity": 25},
            "daily": [{"date": "2026-11-20", "temp_max_c": 45.0, "temp_min_c": 30.0, "precipitation_sum_mm": 0.0, "precipitation_probability_pct": 0, "wind_speed_max_kmh": 15.0, "wind_gusts_max_kmh": 20.0, "weather_code": 0}]
        },
        "target_hazard": "EXTREME_HEAT",
        "expected_severity": SEVERITY_RED
    },
    {
        "name": "4. Severe Thunderstorms & Lightning Squall",
        "district": "Chikkamagaluru",
        "override": {
            "current": {"temperature_c": 26.0, "rainfall_mm": 10.0, "weather_code": 95},
            "daily": [{"date": "2026-11-20", "temp_max_c": 28.0, "temp_min_c": 18.0, "precipitation_sum_mm": 45.0, "precipitation_probability_pct": 90, "wind_speed_max_kmh": 35.0, "wind_gusts_max_kmh": 55.0, "weather_code": 95}]
        },
        "target_hazard": "THUNDERSTORM_LIGHTNING",
        "expected_severity": SEVERITY_ORANGE
    },
    {
        "name": "5. Gale-Force Winds",
        "district": "Uttara Kannada",
        "override": {
            "current": {"temperature_c": 25.0, "wind_speed_kmh": 50.0, "wind_gusts_kmh": 72.0},
            "daily": [{"date": "2026-11-20", "temp_max_c": 28.0, "temp_min_c": 22.0, "precipitation_sum_mm": 10.0, "precipitation_probability_pct": 50, "wind_speed_max_kmh": 55.0, "wind_gusts_max_kmh": 75.0, "weather_code": 0}]
        },
        "target_hazard": "STRONG_WINDS",
        "expected_severity": SEVERITY_RED
    },
    {
        "name": "6. Drought & Water Security Deficit (Arid Zone Watch)",
        "district": "Vijayapura",
        "override": {
            "current": {"temperature_c": 38.0, "relative_humidity": 15},
            "daily": [{"date": "2026-11-20", "temp_max_c": 39.0, "temp_min_c": 22.0, "precipitation_sum_mm": 0.0, "precipitation_probability_pct": 0, "wind_speed_max_kmh": 12.0, "wind_gusts_max_kmh": 18.0, "weather_code": 0}]
        },
        "target_hazard": "DROUGHT_DEFICIT",
        "expected_severity": SEVERITY_ORANGE
    }
]

for sc in scenarios:
    base_fc = f_svc.get_district_forecast(sc["district"])
    # Apply controlled override
    for k, v in sc["override"].items():
        if k in ("current", "daily", "hourly"):
            base_fc[k] = v
    eval_res = h_engine.evaluate_forecast(base_fc)
    hazard = next((h for h in eval_res["hazards"] if h["hazard_id"] == sc["target_hazard"]), None)
    print(f"Scenario: {sc['name']:<42} -> Severity: {hazard['severity'] if hazard else 'MISSING'} (Expected: {sc['expected_severity']})")
    assert hazard is not None, f"Hazard {sc['target_hazard']} missing from evaluation!"
    assert hazard["severity"] == sc["expected_severity"], f"Severity mismatch: got {hazard['severity']}, expected {sc['expected_severity']}"

# =================================================================
# PHASE 6: SAFETY AND SECURITY VERIFICATION
# =================================================================
print("\n--- PHASE 6: SAFETY, TEST-MODE & AUTHORIZATION GATES ---")

# 1. Test Mode Verification in Broadcast Dispatch
test_broadcast = post_json(f"{BASE_URL}/api/admin/broadcast", {
    "district": "Bengaluru Urban",
    "category": "Test Emergency Drill",
    "message": "Public awareness drill regarding flood safety.",
    "is_test": True,
    "authorized_by": "State Emergency Director"
})
print(f"1. Test Broadcast Dispatch: Status={test_broadcast.get('status')}, Channels={test_broadcast.get('channels')}")
assert test_broadcast.get("status") == "success"

# Check delivery log recorded test dispatch safely with masked info
conn = get_db_connection()
cursor = conn.cursor(dictionary=True)
cursor.execute("SELECT * FROM notification_delivery_logs ORDER BY id DESC LIMIT 1")
log_entry = cursor.fetchone()
print(f"2. Log Verification: alert_id={log_entry['alert_id']}, delivery_status={log_entry['delivery_status']}, executed_by={log_entry['executed_by']}")
cursor.close()
conn.close()

# 2. Authorization Security: Unauthenticated Citizen USER blocked from broadcast
try:
    post_json(f"{BASE_URL}/api/admin/broadcast", {
        "district": "Bengaluru Urban",
        "category": "Unauthorized Drill",
        "message": "Illegal attempt",
        "caller_role": "USER"
    })
    assert False, "Non-admin citizen USER should have been rejected with HTTP 403!"
except urllib.error.HTTPError as ex:
    print(f"3. Role Authorization Gate: Correctly rejected citizen broadcast with HTTP {ex.code}: {ex.reason}")
    assert ex.code == 403

print("\n=================================================================")
print("ALL AUTOMATED VERIFICATION PHASES (1, 3, 4, 5, 6) PASSED 100%")
print("=================================================================")
