import sys
import json
sys.path.insert(0, 'backend')
from services.forecast_service import get_forecast_service, DISTRICT_REGISTRY

svc = get_forecast_service()
records = []
print("=== AUDIT 1: REAL OPEN-METEO 31-DISTRICT FETCH ===")

for name, meta in sorted(DISTRICT_REGISTRY.items()):
    res = svc.get_district_forecast(name)
    st = res.get('status')
    curr = res.get('current', {})
    daily = res.get('daily', [])
    hourly = res.get('hourly', [])
    records.append({
        'district': name,
        'lat': meta['lat'],
        'lon': meta['lon'],
        'status': st,
        'current_temp_c': curr.get('temperature_c'),
        'current_rain_mm': curr.get('rainfall_mm'),
        'humidity_pct': curr.get('relative_humidity_pct'),
        'wind_speed_kmh': curr.get('wind_speed_kmh'),
        'condition': curr.get('weather_description'),
        'daily_days': len(daily),
        'hourly_steps': len(hourly),
        'provider': res.get('provenance', {}).get('provider'),
        'is_cached': res.get('is_cached')
    })

print(f"Total Districts Checked: {len(records)}")
all_ok = all(r['status'] == 'success' and r['daily_days'] == 7 and r['current_temp_c'] is not None for r in records)
print(f"All 31 Districts Operational: {all_ok}")
print("Detailed District Telemetry:")
for r in records:
    print(f"  {r['district']:<20} ({r['lat']:>5.2f}, {r['lon']:>5.2f}) -> Status: {r['status']} | Temp: {r['current_temp_c']:>4.1f} C | Rain: {r['current_rain_mm']:>4.1f} mm | Wind: {r['wind_speed_kmh']:>4.1f} km/h | 7D: {r['daily_days']} days | 24H: {r['hourly_steps']} hrs | Prov: {r['provider']}")

with open('audit_31_districts_weather.json', 'w') as f:
    json.dump(records, f, indent=2)
print("Saved audit_31_districts_weather.json successfully.")
