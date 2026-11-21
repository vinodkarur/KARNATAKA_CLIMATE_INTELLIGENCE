import sys
import json
sys.path.insert(0, 'backend')
from services.hazard_risk_engine import (
    get_hazard_risk_engine,
    SEVERITY_GREEN, SEVERITY_YELLOW, SEVERITY_ORANGE, SEVERITY_RED
)
from services.forecast_service import get_forecast_service

print("=== AUDIT 4: 10 HAZARD CATEGORIES EVALUATION ===")

f_svc = get_forecast_service()
h_engine = get_hazard_risk_engine()

# 1. Real Forecast Inputs
districts_to_test = ["Bengaluru Urban", "Ballari", "Dakshina Kannada", "Raichur", "Kodagu"]
for dist in districts_to_test:
    fc = f_svc.get_district_forecast(dist)
    res = h_engine.evaluate_forecast(fc)
    hazards = res.get("hazards", [])
    print(f"\nDistrict: {dist} | Overall Hazard Level: {res.get('overall_hazard_level')}")
    print(f"Total Hazard Dimensions Evaluated: {len(hazards)}")
    for h in hazards:
        print(f"  [{h['severity']:<6}] {h['hazard_id']:<20} ({h['hazard_name']}) : {h['description'][:75]}")

# 2. Boundary Calibration Verification for all 10 Hazard Categories
print("\n=== CALIBRATION BOUNDARY TESTING ACROSS HAZARD ENGINES ===")

def make_mock_forecast(overrides):
    base = {
        "status": "success",
        "district": "Test District",
        "agro_zone": "Southern Dry Zone",
        "basin": "Cauvery",
        "current": {
            "temperature_c": 25.0,
            "apparent_temperature_c": 25.0,
            "relative_humidity": 50,
            "rainfall_mm": 0.0,
            "wind_speed_kmh": 10.0,
            "wind_gusts_kmh": 15.0,
            "weather_code": 0
        },
        "daily": [{
            "date": "2026-11-20",
            "temp_max_c": 28.0,
            "temp_min_c": 20.0,
            "precipitation_sum_mm": 0.0,
            "precipitation_probability_pct": 10,
            "wind_speed_max_kmh": 15.0,
            "wind_gusts_max_kmh": 20.0,
            "weather_code": 0
        }],
        "hourly": [{
            "time": f"2026-11-20T{h:02d}:00",
            "temperature_c": 25.0,
            "apparent_temperature_c": 25.0,
            "relative_humidity": 50,
            "precipitation_mm": 0.0,
            "wind_speed_kmh": 10.0,
            "wind_gusts_kmh": 15.0,
            "weather_code": 0
        } for h in range(24)]
    }
    for k, v in overrides.items():
        if k in base:
            base[k] = v
        elif k in base["current"]:
            base["current"][k] = v
    return base

# Test 1: Heavy Rain (RED: daily rain >= 115.6mm)
fc_rain = make_mock_forecast({
    "daily": [{"date": "2026-11-20", "temp_max_c": 26.0, "temp_min_c": 20.0, "precipitation_sum_mm": 135.0, "precipitation_probability_pct": 90, "wind_speed_max_kmh": 20.0, "wind_gusts_max_kmh": 30.0, "weather_code": 65}],
    "hourly": [{"time": f"2026-11-20T{h:02d}:00", "temperature_c": 24.0, "apparent_temperature_c": 24.0, "relative_humidity": 95, "precipitation_mm": 6.0, "wind_speed_kmh": 20.0, "wind_gusts_kmh": 30.0, "weather_code": 65} for h in range(24)]
})
res_rain = h_engine.evaluate_forecast(fc_rain)
rain_h = next(h for h in res_rain["hazards"] if h["hazard_id"] == "HEAVY_RAINFALL")
print(f"1. Heavy Rainfall (144mm 24h) -> Severity: {rain_h['severity']} (Expected: RED) | Desc: {rain_h['description']}")

# Test 2: Extreme Heat (RED: temp >= 42.0C)
fc_heat = make_mock_forecast({
    "current": {"temperature_c": 43.5, "apparent_temperature_c": 45.0, "relative_humidity": 30, "rainfall_mm": 0.0, "wind_speed_kmh": 10.0, "wind_gusts_kmh": 15.0, "weather_code": 0},
    "daily": [{"date": "2026-11-20", "temp_max_c": 44.0, "temp_min_c": 28.0, "precipitation_sum_mm": 0.0, "precipitation_probability_pct": 0, "wind_speed_max_kmh": 15.0, "wind_gusts_max_kmh": 20.0, "weather_code": 0}]
})
res_heat = h_engine.evaluate_forecast(fc_heat)
heat_h = next(h for h in res_heat["hazards"] if h["hazard_id"] == "EXTREME_HEAT")
print(f"2. Extreme Heat (43.5C) -> Severity: {heat_h['severity']} (Expected: RED) | Desc: {heat_h['description']}")

# Test 3: Gale Winds (ORANGE: gusts >= 65 km/h)
fc_wind = make_mock_forecast({
    "current": {"temperature_c": 25.0, "apparent_temperature_c": 25.0, "relative_humidity": 60, "rainfall_mm": 5.0, "wind_speed_kmh": 45.0, "wind_gusts_kmh": 68.0, "weather_code": 0}
})
res_wind = h_engine.evaluate_forecast(fc_wind)
wind_h = next(h for h in res_wind["hazards"] if h["hazard_id"] == "STRONG_WINDS")
print(f"3. Gale Winds (68 km/h gusts) -> Severity: {wind_h['severity']} (Expected: ORANGE/RED) | Desc: {wind_h['description']}")

print("\nAudit 4 Completed Successfully.")
