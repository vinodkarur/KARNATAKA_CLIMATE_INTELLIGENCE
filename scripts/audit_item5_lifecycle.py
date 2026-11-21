import sys
sys.path.insert(0, 'backend')
from services.warning_service import get_warning_service
from services.hazard_risk_engine import SEVERITY_ORANGE, SEVERITY_RED

print("=== AUDIT 5: WARNING LIFECYCLE & DUPLICATE SUPPRESSION ===")

svc = get_warning_service()

# 1. Test Warning Generation on simulated high-risk forecast
mock_fc = {
    "status": "success",
    "district": "AuditDistrict",
    "agro_zone": "Coastal Zone",
    "basin": "West Flowing",
    "current": {
        "temperature_c": 34.0,
        "apparent_temperature_c": 38.0,
        "relative_humidity": 85,
        "rainfall_mm": 15.0,
        "wind_speed_kmh": 40.0,
        "wind_gusts_kmh": 62.0,
        "weather_code": 65
    },
    "daily": [{
        "date": "2026-11-20",
        "temp_max_c": 36.0,
        "temp_min_c": 26.0,
        "precipitation_sum_mm": 85.0,
        "precipitation_probability_pct": 95,
        "wind_speed_max_kmh": 35.0,
        "wind_gusts_max_kmh": 58.0,
        "weather_code": 65
    }],
    "hourly": [{
        "time": f"2026-11-20T{h:02d}:00",
        "temperature_c": 32.0,
        "apparent_temperature_c": 36.0,
        "relative_humidity": 90,
        "precipitation_mm": 4.0,
        "wind_speed_kmh": 30.0,
        "wind_gusts_kmh": 50.0,
        "weather_code": 65
    } for h in range(24)]
}

# Run 1: Generation
alerts_run1 = svc.evaluate_and_generate_warnings(mock_fc)
active_count1 = len([a for a in svc.get_all_active_warnings() if a["district"] == "AuditDistrict"])
print(f"Run 1 generated: {len(alerts_run1)} warnings. Active in AuditDistrict: {active_count1}")

# Run 2: Duplicate Suppression (Identical input immediately re-evaluated)
alerts_run2 = svc.evaluate_and_generate_warnings(mock_fc)
active_count2 = len([a for a in svc.get_all_active_warnings() if a["district"] == "AuditDistrict"])
print(f"Run 2 generated/updated: {len(alerts_run2)} warnings. Active in AuditDistrict: {active_count2}")
assert active_count1 == active_count2, f"Duplicate alert created! count1={active_count1}, count2={active_count2}"
print("-> Duplicate Suppression Verified: Alert count remained identical.")

# Pick one alert to test lifecycle transitions
sample_alert = alerts_run1[0]
alert_id = sample_alert["alert_id"]
print(f"\nTesting Lifecycle for Alert: {alert_id}")

# Update Status to UPDATED
res_upd = svc.update_warning_status(alert_id, "UPDATED", admin_user="AuditOfficer", notes="Escalation review in progress")
print(f"Status after UPDATE: {res_upd['new_status']} (Expected: UPDATED)")

# Update Status to CANCELLED
res_can = svc.update_warning_status(alert_id, "CANCELLED", admin_user="AuditOfficer", notes="Hazard threat dissipated")
print(f"Status after CANCEL: {res_can['new_status']} (Expected: CANCELLED)")

# Verify cancelled alert is no longer active
active_now = [a["alert_id"] for a in svc.get_all_active_warnings()]
assert alert_id not in active_now, "Cancelled alert still present in active queue!"
print(f"-> Verification Successful: {alert_id} excluded from active warnings queue.")

# Test Invalid Status Rejection
res_inv = svc.update_warning_status(alert_id, "INVALID_STATE", admin_user="AuditOfficer")
print(f"Status update with invalid state: {res_inv.get('status')} | Message: {res_inv.get('message')}")
assert res_inv.get("status") == "error", "Invalid status was not rejected!"

print("\nAudit 5 Completed Successfully.")
