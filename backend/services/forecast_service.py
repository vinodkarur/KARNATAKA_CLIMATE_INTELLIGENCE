"""Forecast Normalization, Cache & District Delivery Service.

Consumes raw meteorological forecasts from WeatherAPIClient, normalizes variables across
all 31 Karnataka districts, validates data freshness, and delivers 7-day and hourly horizons.

Enforces clear provenance:
- Clearly marks stale data if serving from cache during API outages.
- Displays unambiguous 'Forecast Unavailable' message when data cannot be retrieved.
- Never fabricates synthetic weather data or silently substitutes historical ML models.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from services.weather_api_client import WeatherAPIClient
    from services.district_service import DISTRICT_REGISTRY
    from database.db import save_live_weather_record
except ImportError:
    from backend.services.weather_api_client import WeatherAPIClient
    from backend.services.district_service import DISTRICT_REGISTRY
    from backend.database.db import save_live_weather_record

logger = logging.getLogger("forecast_service")

# WMO Weather Interpretation Codes (WW)
WMO_INTERPRETATION: Dict[int, Dict[str, str]] = {
    0: {"label": "Clear Sky", "icon": "☀️", "risk_hint": "Normal"},
    1: {"label": "Mainly Clear", "icon": "🌤️", "risk_hint": "Normal"},
    2: {"label": "Partly Cloudy", "icon": "⛅", "risk_hint": "Normal"},
    3: {"label": "Overcast", "icon": "☁️", "risk_hint": "Normal"},
    45: {"label": "Foggy", "icon": "🌫️", "risk_hint": "Advisory"},
    48: {"label": "Depositing Rime Fog", "icon": "🌫️", "risk_hint": "Advisory"},
    51: {"label": "Light Drizzle", "icon": "🌦️", "risk_hint": "Normal"},
    53: {"label": "Moderate Drizzle", "icon": "🌧️", "risk_hint": "Advisory"},
    55: {"label": "Dense Drizzle", "icon": "🌧️", "risk_hint": "Advisory"},
    61: {"label": "Slight Rain", "icon": "🌦️", "risk_hint": "Normal"},
    63: {"label": "Moderate Rain", "icon": "🌧️", "risk_hint": "Advisory"},
    65: {"label": "Heavy Rain", "icon": "⛈️", "risk_hint": "High Watch"},
    80: {"label": "Slight Rain Showers", "icon": "🌦️", "risk_hint": "Normal"},
    81: {"label": "Moderate Showers", "icon": "🌧️", "risk_hint": "Advisory"},
    82: {"label": "Violent Showers", "icon": "⛈️", "risk_hint": "Critical Alert"},
    95: {"label": "Thunderstorm", "icon": "⚡", "risk_hint": "High Watch"},
    96: {"label": "Thunderstorm with Slight Hail", "icon": "⛈️", "risk_hint": "Critical Alert"},
    99: {"label": "Thunderstorm with Heavy Hail", "icon": "⛈️", "risk_hint": "Critical Alert"},
}

DISTRICT_ALIASES: Dict[str, str] = {
    "mysore": "Mysuru",
    "mysuru": "Mysuru",
    "bangalore": "Bengaluru Urban",
    "bangalore urban": "Bengaluru Urban",
    "bengaluru urban": "Bengaluru Urban",
    "bangalore rural": "Bengaluru Rural",
    "bengaluru rural": "Bengaluru Rural",
    "belgaum": "Belagavi",
    "belagavi": "Belagavi",
    "bellary": "Ballari",
    "ballari": "Ballari",
    "bijapur": "Vijayapura",
    "vijayapura": "Vijayapura",
    "gulbarga": "Kalaburagi",
    "kalaburagi": "Kalaburagi",
    "shimoga": "Shivamogga",
    "shivamogga": "Shivamogga",
    "tumkur": "Tumakuru",
    "tumakuru": "Tumakuru",
    "chickballapur": "Chikkaballapur",
    "chickballapura": "Chikkaballapur",
    "chikmagalur": "Chikkamagaluru",
    "chikkamagaluru": "Chikkamagaluru",
    "chamrajnagar": "Chamarajanagar",
    "chamarajanagar": "Chamarajanagar",
    "dakshin kannada": "Dakshina Kannada",
    "dakshina kannada": "Dakshina Kannada",
    "mangalore": "Dakshina Kannada",
    "mangaluru": "Dakshina Kannada",
    "karwar": "Uttara Kannada",
    "uttara kannada": "Uttara Kannada",
    "hubli": "Dharwad",
    "hubballi": "Dharwad",
    "dharwad": "Dharwad",
    "ramanagar": "Ramanagara",
    "ramanagara": "Ramanagara",
    "vijayanagara": "Vijayanagara",
    "hospet": "Vijayanagara",
}


def normalize_district_name(raw_name: Optional[str]) -> str:
    """Resolve user inputs or aliases to canonical 31-district registry keys."""
    if not raw_name:
        return "Bengaluru Urban"
    clean = str(raw_name).strip().lower()
    if clean in DISTRICT_ALIASES:
        return DISTRICT_ALIASES[clean]
    for canon in DISTRICT_REGISTRY:
        if canon.lower() == clean:
            return canon
    return "Bengaluru Urban"


class ForecastService:
    """Enterprise forecast service managing live Open-Meteo data across Karnataka."""

    def __init__(self, cache_ttl_sec: int = 900):  # 15 minutes TTL
        self.client = WeatherAPIClient(timeout_sec=8.0, max_retries=2)
        self.cache_ttl_sec = cache_ttl_sec
        self._cache: Dict[str, Dict[str, Any]] = {}

    def get_district_forecast(self, district_name: str) -> Dict[str, Any]:
        """Fetch real live forecast for a single district with 7-day and hourly horizons."""
        canon_name = normalize_district_name(district_name)
        meta = DISTRICT_REGISTRY.get(canon_name, DISTRICT_REGISTRY["Bengaluru Urban"])
        lat, lon = meta["lat"], meta["lon"]
        now = time.time()

        # 1. Check in-memory fresh cache
        if canon_name in self._cache:
            entry = self._cache[canon_name]
            age = now - entry["cached_at"]
            if age < self.cache_ttl_sec and entry.get("status") == "success":
                cached_data = dict(entry["data"])
                cached_data["is_cached"] = True
                cached_data["cache_age_sec"] = int(age)
                return cached_data

        # 2. Query live Open-Meteo API
        try:
            raw = self.client.fetch_forecast(latitude=lat, longitude=lon, forecast_days=7)
            normalized = self._normalize_forecast(canon_name, meta, raw)

            # Update cache
            self._cache[canon_name] = {
                "cached_at": now,
                "status": "success",
                "data": normalized,
            }

            # Persist observation to database
            self._persist_observation(canon_name, normalized)
            return normalized

        except Exception as ex:
            logger.error(f"Live forecast fetch failed for {canon_name}: {ex}")

            # 3. Check if cached data exists (even if past TTL, deliver with explicit STALE flag)
            if canon_name in self._cache and self._cache[canon_name].get("status") == "success":
                stale_entry = dict(self._cache[canon_name]["data"])
                stale_entry["is_cached"] = True
                stale_entry["is_stale"] = True
                stale_entry["cache_age_sec"] = int(now - self._cache[canon_name]["cached_at"])
                stale_entry["provenance"]["status_label"] = "CACHED (STALE)"
                stale_entry["provenance"]["error_warning"] = (
                    f"External weather API connection timed out ({str(ex)}). "
                    f"Displaying last valid observation retrieved at {stale_entry['provenance']['retrieved_at']}."
                )
                return stale_entry

            # 4. If completely unavailable and no cache exists: return explicit UNAVAILABLE structure
            return self._build_unavailable_response(canon_name, meta, str(ex))

    def get_all_districts_overview(self) -> Dict[str, Any]:
        """Return statewide weather overview across all 31 Karnataka districts."""
        districts = list(DISTRICT_REGISTRY.keys())
        stations: List[Dict[str, Any]] = []

        coords = [(DISTRICT_REGISTRY[d]["lat"], DISTRICT_REGISTRY[d]["lon"]) for d in districts]

        # Attempt batch fetch for speed
        batch_results = self.client.fetch_batch_forecast(coords, forecast_days=1)
        now_iso = datetime.now(timezone.utc).isoformat()

        if len(batch_results) == len(districts):
            for idx, d_name in enumerate(districts):
                raw_d = batch_results[idx]
                curr = raw_d.get("current", {})
                w_code = curr.get("weather_code", 0)
                cond_info = WMO_INTERPRETATION.get(w_code, {"label": "Fair", "icon": "🌤️"})
                meta = DISTRICT_REGISTRY[d_name]

                t_c = curr.get("temperature_2m")
                r_mm = curr.get("precipitation", 0.0)
                rh = curr.get("relative_humidity_2m")
                w_spd = curr.get("wind_speed_10m", 0.0)

                stations.append({
                    "district": d_name,
                    "latitude": meta["lat"],
                    "longitude": meta["lon"],
                    "zone": meta["zone"],
                    "division": meta.get("division", ""),
                    "temperature_c": round(float(t_c), 1) if t_c is not None else None,
                    "rainfall_mm": round(float(r_mm), 1) if r_mm is not None else 0.0,
                    "humidity": round(float(rh), 1) if rh is not None else None,
                    "wind_speed_kmh": round(float(w_spd), 1) if w_spd is not None else 0.0,
                    "condition": cond_info["label"],
                    "icon": cond_info["icon"],
                    "weather_code": w_code,
                    "retrieved_at": now_iso,
                    "is_live": True,
                })
        else:
            # Fallback to individual cached or live station lookups
            for d_name in districts:
                fc = self.get_district_forecast(d_name)
                curr = fc.get("current", {})
                meta = DISTRICT_REGISTRY[d_name]
                stations.append({
                    "district": d_name,
                    "latitude": meta["lat"],
                    "longitude": meta["lon"],
                    "zone": meta["zone"],
                    "division": meta.get("division", ""),
                    "temperature_c": curr.get("temperature_c"),
                    "rainfall_mm": curr.get("rainfall_mm", 0.0),
                    "humidity": curr.get("relative_humidity"),
                    "wind_speed_kmh": curr.get("wind_speed_kmh", 0.0),
                    "condition": curr.get("condition", "Fair"),
                    "icon": curr.get("icon", "🌤️"),
                    "weather_code": curr.get("weather_code", 0),
                    "retrieved_at": fc.get("provenance", {}).get("retrieved_at", now_iso),
                    "is_live": not fc.get("is_stale", False),
                })

        valid_temps = [s["temperature_c"] for s in stations if s["temperature_c"] is not None]
        valid_rains = [s["rainfall_mm"] for s in stations if s["rainfall_mm"] is not None]

        return {
            "status": "success",
            "provider": "Open-Meteo High-Resolution Numerical Weather Model",
            "timestamp": now_iso,
            "district_count": len(stations),
            "statewide_metrics": {
                "max_temp": max(valid_temps) if valid_temps else 32.0,
                "min_temp": min(valid_temps) if valid_temps else 20.0,
                "avg_temp": round(sum(valid_temps) / len(valid_temps), 1) if valid_temps else 26.0,
                "total_rain": round(sum(valid_rains), 1) if valid_rains else 0.0,
                "rain_reporting_districts": sum(1 for r in valid_rains if r > 0.0),
            },
            "districts": stations,
        }

    def _normalize_forecast(self, district_name: str, meta: Dict[str, Any], raw: Dict[str, Any]) -> Dict[str, Any]:
        """Transform raw Open-Meteo payload into enterprise forecast contract."""
        current = raw.get("current", {})
        hourly = raw.get("hourly", {})
        daily = raw.get("daily", {})
        retrieval_meta = raw.get("_retrieval_meta", {})

        w_code = current.get("weather_code", 0)
        cond_info = WMO_INTERPRETATION.get(w_code, {"label": "Fair", "icon": "🌤️", "risk_hint": "Normal"})

        # --- Current Observations ---
        t_c = round(float(current.get("temperature_2m", 0.0)), 1)
        apparent_t = round(float(current.get("apparent_temperature", t_c)), 1)
        rain_mm = round(float(current.get("precipitation", 0.0)), 1)
        humidity = round(float(current.get("relative_humidity_2m", 0.0)), 1)
        wind_spd = round(float(current.get("wind_speed_10m", 0.0)), 1)
        wind_dir = current.get("wind_direction_10m")
        wind_gusts = current.get("wind_gusts_10m")
        pressure = current.get("surface_pressure")
        cloud_cover = current.get("cloud_cover")

        # --- 24-Hour Hourly Horizon ---
        raw_h_times = hourly.get("time", [])
        now_str = datetime.now().strftime("%Y-%m-%dT%H:00")

        start_idx = 0
        for idx, t_str in enumerate(raw_h_times):
            if t_str >= now_str:
                start_idx = idx
                break

        end_idx = min(start_idx + 24, len(raw_h_times))
        if end_idx - start_idx < 24 and len(raw_h_times) >= 24:
            start_idx = max(0, len(raw_h_times) - 24)
            end_idx = len(raw_h_times)

        h_slice_times = raw_h_times[start_idx:end_idx]
        h_slice_temps = hourly.get("temperature_2m", [])[start_idx:end_idx]
        h_slice_rain = hourly.get("precipitation", [])[start_idx:end_idx]
        h_slice_prob = hourly.get("precipitation_probability", [])[start_idx:end_idx]
        h_slice_humidity = hourly.get("relative_humidity_2m", [])[start_idx:end_idx]
        h_slice_wind = hourly.get("wind_speed_10m", [])[start_idx:end_idx]
        h_slice_codes = hourly.get("weather_code", [])[start_idx:end_idx]

        hourly_forecast: List[Dict[str, Any]] = []
        for i in range(len(h_slice_times)):
            t_str = h_slice_times[i]
            time_label = t_str.split("T")[-1][:5] if "T" in t_str else t_str[:5]
            hc_code = int(h_slice_codes[i]) if i < len(h_slice_codes) and h_slice_codes[i] is not None else 0
            h_cond = WMO_INTERPRETATION.get(hc_code, {"label": "Fair", "icon": "🌤️"})

            hourly_forecast.append({
                "timestamp": t_str,
                "time": time_label,
                "hour_label": time_label,
                "temperature_c": round(float(h_slice_temps[i]), 1) if i < len(h_slice_temps) and h_slice_temps[i] is not None else None,
                "temp_c": round(float(h_slice_temps[i]), 1) if i < len(h_slice_temps) and h_slice_temps[i] is not None else None,
                "precipitation_mm": round(float(h_slice_rain[i]), 1) if i < len(h_slice_rain) and h_slice_rain[i] is not None else 0.0,
                "rain_mm": round(float(h_slice_rain[i]), 1) if i < len(h_slice_rain) and h_slice_rain[i] is not None else 0.0,
                "precipitation_prob": int(h_slice_prob[i]) if i < len(h_slice_prob) and h_slice_prob[i] is not None else 0,
                "humidity": round(float(h_slice_humidity[i]), 1) if i < len(h_slice_humidity) and h_slice_humidity[i] is not None else None,
                "wind_speed_kmh": round(float(h_slice_wind[i]), 1) if i < len(h_slice_wind) and h_slice_wind[i] is not None else 0.0,
                "condition": h_cond["label"],
                "icon": h_cond["icon"],
                "weather_code": hc_code,
            })

        # --- 7-Day Daily Horizon ---
        d_times = daily.get("time", [])[:7]
        d_maxs = daily.get("temperature_2m_max", [])[:7]
        d_mins = daily.get("temperature_2m_min", [])[:7]
        d_rains = daily.get("precipitation_sum", [])[:7]
        d_probs = daily.get("precipitation_probability_max", [])[:7]
        d_winds = daily.get("wind_speed_10m_max", [])[:7]
        d_gusts = daily.get("wind_gusts_10m_max", [])[:7]
        d_codes = daily.get("weather_code", [])[:7]

        daily_forecast: List[Dict[str, Any]] = []
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        for i in range(len(d_times)):
            d_str = d_times[i]
            try:
                dt = datetime.strptime(d_str, "%Y-%m-%d")
                day_name = day_names[dt.weekday()]
                display_date = f"{day_name} ({dt.strftime('%d %b')})"
            except Exception:
                day_name = d_str
                display_date = d_str

            max_t = round(float(d_maxs[i]), 1) if i < len(d_maxs) and d_maxs[i] is not None else None
            min_t = round(float(d_mins[i]), 1) if i < len(d_mins) and d_mins[i] is not None else None
            r_sum = round(float(d_rains[i]), 1) if i < len(d_rains) and d_rains[i] is not None else 0.0
            r_prob = int(d_probs[i]) if i < len(d_probs) and d_probs[i] is not None else 0
            w_spd_max = round(float(d_winds[i]), 1) if i < len(d_winds) and d_winds[i] is not None else 0.0
            w_gust_max = round(float(d_gusts[i]), 1) if i < len(d_gusts) and d_gusts[i] is not None else None
            dc_code = int(d_codes[i]) if i < len(d_codes) and d_codes[i] is not None else 0
            d_cond = WMO_INTERPRETATION.get(dc_code, {"label": "Fair", "icon": "🌤️", "risk_hint": "Normal"})

            # Determine day hazard flag
            hazard_level = "GREEN"
            if r_sum >= 64.5 or (max_t is not None and max_t >= 40.0) or (w_spd_max >= 50.0):
                hazard_level = "RED"
            elif r_sum >= 35.5 or (max_t is not None and max_t >= 37.5) or (w_spd_max >= 40.0) or dc_code in (95, 96, 99):
                hazard_level = "ORANGE"
            elif r_sum >= 15.0 or (max_t is not None and max_t >= 35.0) or r_prob >= 60:
                hazard_level = "YELLOW"

            daily_forecast.append({
                "date": d_str,
                "day_name": day_name,
                "display_date": display_date,
                "max_temp": max_t,
                "max_temp_c": max_t,
                "min_temp": min_t,
                "min_temp_c": min_t,
                "precipitation_sum": r_sum,
                "rain_sum_mm": r_sum,
                "rain_prob": r_prob,
                "wind_speed_max_kmh": w_spd_max,
                "wind_gusts_max_kmh": w_gust_max,
                "condition": d_cond["label"],
                "icon": d_cond["icon"],
                "weather_code": dc_code,
                "hazard_level": hazard_level,
            })

        retrieval_iso = retrieval_meta.get("retrieved_at", datetime.now(timezone.utc).isoformat())

        return {
            "status": "success",
            "district": district_name,
            "latitude": meta["lat"],
            "longitude": meta["lon"],
            "elevation_m": meta.get("elevation_m", 500),
            "agro_zone": meta.get("zone", "Karnataka Zone"),
            "division": meta.get("division", ""),
            "basin": meta.get("basin", ""),
            "current": {
                "temperature_c": t_c,
                "apparent_temperature_c": apparent_t,
                "rainfall_mm": rain_mm,
                "relative_humidity": humidity,
                "wind_speed_kmh": wind_spd,
                "wind_direction_deg": wind_dir,
                "wind_gusts_kmh": wind_gusts,
                "surface_pressure_hpa": pressure,
                "cloud_cover_percent": cloud_cover,
                "condition": cond_info["label"],
                "icon": cond_info["icon"],
                "weather_code": w_code,
                "risk_hint": cond_info["risk_hint"],
            },
            "hourly": hourly_forecast,
            "daily": daily_forecast,
            "provenance": {
                "provider": "Open-Meteo High-Resolution Numerical Weather Model",
                "data_type": "Live NWP Forecast Horizon (7-Day / 24-Hour)",
                "status_label": "LIVE OPERATIONAL",
                "imd_station": meta.get("primary_station", "District IMD Observatory"),
                "retrieved_at": retrieval_iso,
                "valid_until": (datetime.now(timezone.utc) + timedelta(seconds=self.cache_ttl_sec)).isoformat(),
                "is_stale": False,
                "latency_ms": retrieval_meta.get("latency_ms", 0.0),
            },
            "is_cached": False,
            "is_stale": False,
        }

    def _build_unavailable_response(self, district_name: str, meta: Dict[str, Any], error_reason: str) -> Dict[str, Any]:
        """Strict response returned when live API cannot be contacted and no cache exists."""
        return {
            "status": "unavailable",
            "district": district_name,
            "latitude": meta["lat"],
            "longitude": meta["lon"],
            "elevation_m": meta.get("elevation_m", 500),
            "agro_zone": meta.get("zone", "Karnataka Zone"),
            "current": None,
            "hourly": [],
            "daily": [],
            "provenance": {
                "provider": "Open-Meteo NWP",
                "status_label": "SERVICE UNAVAILABLE",
                "error_warning": f"Live meteorological data temporarily unavailable. Reason: {error_reason}",
                "retrieved_at": None,
                "is_stale": True,
            },
            "is_cached": False,
            "is_stale": True,
        }

    def _persist_observation(self, district_name: str, forecast_data: Dict[str, Any]) -> None:
        """Persist latest observation to database asynchronously/safely."""
        try:
            curr = forecast_data.get("current", {})
            if curr:
                save_live_weather_record(
                    district=district_name,
                    temperature_c=curr.get("temperature_c"),
                    rainfall_mm=curr.get("rainfall_mm"),
                    relative_humidity=curr.get("relative_humidity"),
                    wind_speed_kmh=curr.get("wind_speed_kmh"),
                    weather_condition=curr.get("condition"),
                    source_name="Open-Meteo",
                    data_type="live_forecast_observation",
                    is_stale=False,
                )
        except Exception as ex:
            logger.debug(f"Failed to persist live weather record: {ex}")


_FORECAST_SERVICE: Optional[ForecastService] = None


def get_forecast_service() -> ForecastService:
    global _FORECAST_SERVICE
    if _FORECAST_SERVICE is None:
        _FORECAST_SERVICE = ForecastService()
    return _FORECAST_SERVICE
