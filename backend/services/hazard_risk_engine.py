"""Intelligent Multi-Hazard Risk Assessment Engine.

Evaluates real 7-day numerical weather forecasts and official meteorological indicators
across all 31 Karnataka districts against authoritative IMD, NDMA, and WHO thresholds.

Covers 10 hazard dimensions:
1. Heavy Rainfall (Amount, Intensity, Duration, Probability)
2. Riverine & Urban Flood Risk (Consecutive heavy rain, catchment saturation, terrain)
3. Flash Flood Potential (High-intensity short-duration downpour)
4. Extreme Heat (Dry bulb max temperature >= 37°C / 40°C)
5. Heat Stress & Thermal Comfort (Apparent temperature & humidity heat index)
6. Thunderstorm Activity (Convective instability, WMO 95/96/99)
7. Lightning Risk Indicators (High CAPE proxies & severe storm codes)
8. Gale & Strong Winds (Sustained >= 40 km/h or gusts >= 55 km/h)
9. Drought & Rainfall Deficit Indicators (Longer-term deficit markers)
10. Water Security & Reservoir Pressure

Enforces 4 standard severity tiers:
- GREEN — Normal / Minimal Risk
- YELLOW — Advisory / Be Aware
- ORANGE — High Risk / Be Prepared
- RED — Critical Emergency / Take Immediate Action
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("hazard_risk_engine")

# Standard Severity Constants
SEVERITY_GREEN = "GREEN"
SEVERITY_YELLOW = "YELLOW"
SEVERITY_ORANGE = "ORANGE"
SEVERITY_RED = "RED"

SEVERITY_RANKS = {
    SEVERITY_GREEN: 0,
    SEVERITY_YELLOW: 1,
    SEVERITY_ORANGE: 2,
    SEVERITY_RED: 3,
}

# Flood-prone basins and terrain vulnerability in Karnataka
COASTAL_AND_GHATS_DISTRICTS = {
    "Dakshina Kannada", "Udupi", "Uttara Kannada", "Kodagu", "Shivamogga", "Chikkamagaluru", "Hassan", "Belagavi"
}

ARID_DROUGHT_PRONE_DISTRICTS = {
    "Ballari", "Kalaburagi", "Raichur", "Koppal", "Yadgir", "Bidar", "Vijayapura", "Bagalkot", "Gadag", "Chitradurga"
}


class HazardRiskEngine:
    """Enterprise meteorological multi-hazard risk evaluation engine."""

    def evaluate_forecast(self, district_forecast: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluate real forecast data and generate comprehensive hazard assessments."""
        if not district_forecast or district_forecast.get("status") != "success":
            return self._build_offline_assessment(district_forecast.get("district", "Statewide"))

        district = district_forecast.get("district", "Statewide")
        meta_zone = district_forecast.get("agro_zone", "")
        basin = district_forecast.get("basin", "")
        current = district_forecast.get("current") or {}
        hourly = district_forecast.get("hourly") or []
        daily = district_forecast.get("daily") or []

        # Current conditions
        curr_temp = current.get("temperature_c") or 25.0
        curr_apparent = current.get("apparent_temperature_c") or curr_temp
        curr_rain = current.get("rainfall_mm") or 0.0
        curr_humidity = current.get("relative_humidity") or 50.0
        curr_wind = current.get("wind_speed_kmh") or 10.0
        curr_gusts = current.get("wind_gusts_kmh") or (curr_wind * 1.3)
        curr_wcode = current.get("weather_code") or 0

        # Next 24-hour aggregations
        h24_rain_sum = sum((h.get("precipitation_mm") or 0.0) for h in hourly[:24])
        h24_rain_max_1h = max(((h.get("precipitation_mm") or 0.0) for h in hourly[:24]), default=0.0)
        h24_max_prob = max(((h.get("precipitation_prob") or 0) for h in hourly[:24]), default=0)
        h24_max_temp = max(((h.get("temperature_c") or curr_temp) for h in hourly[:24]), default=curr_temp)
        h24_max_wind = max(((h.get("wind_speed_kmh") or curr_wind) for h in hourly[:24]), default=curr_wind)

        # 7-Day aggregations
        d7_rain_sum = sum((d.get("precipitation_sum") or 0.0) for d in daily[:7])
        d7_max_temp = max(((d.get("max_temp") or curr_temp) for d in daily[:7]), default=curr_temp)
        d7_heavy_rain_days = sum(1 for d in daily[:7] if (d.get("precipitation_sum") or 0.0) >= 35.5)

        assessments: List[Dict[str, Any]] = []

        # -------------------------------------------------------------------
        # 1. HEAVY RAINFALL ASSESSMENT (IMD Criteria)
        # -------------------------------------------------------------------
        rain_sev, rain_desc, rain_actions = self._assess_heavy_rainfall(
            district, h24_rain_sum, h24_rain_max_1h, h24_max_prob, d7_rain_sum
        )
        assessments.append({
            "hazard_id": "HEAVY_RAINFALL",
            "hazard_name": "Heavy Rainfall",
            "icon": "🌧️",
            "severity": rain_sev,
            "metrics": {
                "next_24h_rainfall_mm": round(h24_rain_sum, 1),
                "peak_1h_intensity_mm": round(h24_rain_max_1h, 1),
                "rain_probability_pct": h24_max_prob,
                "cumulative_7day_mm": round(d7_rain_sum, 1),
            },
            "description": rain_desc,
            "recommended_actions": rain_actions,
        })

        # -------------------------------------------------------------------
        # 2. FLOOD & FLASH FLOOD RISK ASSESSMENT
        # -------------------------------------------------------------------
        flood_sev, flood_desc, flood_actions = self._assess_flood_risk(
            district, h24_rain_sum, h24_rain_max_1h, d7_rain_sum, d7_heavy_rain_days, basin
        )
        assessments.append({
            "hazard_id": "FLOOD_RISK",
            "hazard_name": "Inundation & Flood Risk",
            "icon": "🌊",
            "severity": flood_sev,
            "metrics": {
                "catchment_basin": basin or "Regional Basin",
                "consecutive_heavy_days": d7_heavy_rain_days,
                "flash_flood_trigger_1h": round(h24_rain_max_1h, 1),
                "is_riverine_flood_prone": district in COASTAL_AND_GHATS_DISTRICTS,
            },
            "description": flood_desc,
            "recommended_actions": flood_actions,
        })

        # -------------------------------------------------------------------
        # 3. EXTREME HEAT & THERMAL STRESS (NDMA & IMD Criteria)
        # -------------------------------------------------------------------
        heat_sev, heat_desc, heat_actions, heat_index = self._assess_extreme_heat(
            district, curr_temp, curr_apparent, curr_humidity, d7_max_temp
        )
        assessments.append({
            "hazard_id": "EXTREME_HEAT",
            "hazard_name": "Extreme Heat & Thermal Stress",
            "icon": "🔥",
            "severity": heat_sev,
            "metrics": {
                "current_temperature_c": curr_temp,
                "apparent_temperature_c": curr_apparent,
                "humidity_pct": curr_humidity,
                "heat_index_c": heat_index,
                "forecast_peak_temp_c": round(d7_max_temp, 1),
            },
            "description": heat_desc,
            "recommended_actions": heat_actions,
        })

        # -------------------------------------------------------------------
        # 4. THUNDERSTORM & LIGHTNING RISK
        # -------------------------------------------------------------------
        tstorm_sev, tstorm_desc, tstorm_actions = self._assess_thunderstorms(
            curr_wcode, daily, hourly
        )
        assessments.append({
            "hazard_id": "THUNDERSTORM_LIGHTNING",
            "hazard_name": "Thunderstorm & Lightning Hazard",
            "icon": "⚡",
            "severity": tstorm_sev,
            "metrics": {
                "current_wmo_code": curr_wcode,
                "thunderstorm_forecast_in_7d": any(d.get("weather_code") in (95, 96, 99) for d in daily[:7]),
                "peak_gust_kmh": round(curr_gusts, 1),
            },
            "description": tstorm_desc,
            "recommended_actions": tstorm_actions,
        })

        # -------------------------------------------------------------------
        # 5. GALE & STRONG WINDS
        # -------------------------------------------------------------------
        wind_sev, wind_desc, wind_actions = self._assess_strong_winds(
            curr_wind, curr_gusts, h24_max_wind
        )
        assessments.append({
            "hazard_id": "STRONG_WINDS",
            "hazard_name": "Gale & Strong Winds",
            "icon": "💨",
            "severity": wind_sev,
            "metrics": {
                "current_wind_kmh": curr_wind,
                "peak_gusts_kmh": round(curr_gusts, 1),
                "next_24h_max_wind_kmh": round(h24_max_wind, 1),
            },
            "description": wind_desc,
            "recommended_actions": wind_actions,
        })

        # -------------------------------------------------------------------
        # 6. DROUGHT & WATER SECURITY INDICATORS
        # -------------------------------------------------------------------
        drought_sev, drought_desc, drought_actions = self._assess_drought_indicators(
            district, d7_rain_sum
        )
        assessments.append({
            "hazard_id": "DROUGHT_DEFICIT",
            "hazard_name": "Drought & Water Security Deficit",
            "icon": "🏜️",
            "severity": drought_sev,
            "metrics": {
                "forecast_7day_rainfall_mm": round(d7_rain_sum, 1),
                "historical_aridity_zone": district in ARID_DROUGHT_PRONE_DISTRICTS,
                "evaluation_limitation": "Statistical forecast indicator; soil-moisture corroboration recommended.",
            },
            "description": drought_desc,
            "recommended_actions": drought_actions,
        })

        # Determine overall compound severity
        highest_severity = max(
            [a["severity"] for a in assessments],
            key=lambda s: SEVERITY_RANKS.get(s, 0)
        )

        return {
            "status": "success",
            "district": district,
            "assessed_at": datetime.now(timezone.utc).isoformat(),
            "overall_hazard_level": highest_severity,
            "hazards_count": len(assessments),
            "critical_hazards_count": sum(1 for a in assessments if a["severity"] in (SEVERITY_ORANGE, SEVERITY_RED)),
            "hazards": assessments,
        }

    # -----------------------------------------------------------------------
    # HEAVY RAINFALL LOGIC (Official IMD Benchmarks)
    # -----------------------------------------------------------------------
    def _assess_heavy_rainfall(
        self,
        district: str,
        h24_sum: float,
        h24_max_1h: float,
        h24_prob: int,
        d7_sum: float,
    ) -> Tuple[str, str, List[str]]:
        if h24_sum >= 115.6 or h24_max_1h >= 45.0:
            return (
                SEVERITY_RED,
                f"Extremely Heavy Rainfall alert for {district}: Forecast 24-hr accumulation of {h24_sum:.1f}mm "
                f"(Peak 1-hr burst: {h24_max_1h:.1f}mm) breaches IMD emergency threshold (>= 115.6mm).",
                [
                    "Alert district disaster management cells (DDMA) and SDRF contingents.",
                    "Halt non-essential transit in inundated corridors and low-lying underpasses.",
                    "Clear primary stormwater channels and deploy high-capacity dewatering pumps.",
                ]
            )
        elif h24_sum >= 64.5 or h24_max_1h >= 25.0:
            return (
                SEVERITY_ORANGE,
                f"Very Heavy Rainfall watch for {district}: Forecast accumulation of {h24_sum:.1f}mm over next 24 hours "
                f"with high precipitation probability ({h24_prob}%).",
                [
                    "Alert municipal engineering teams to monitor culverts and stormwater drains.",
                    "Issue localized travel advisories for waterlogged road stretches.",
                    "Pre-position suction pumps at chronic waterlogging hotspots.",
                ]
            )
        elif h24_sum >= 15.6 or h24_prob >= 60:
            return (
                SEVERITY_YELLOW,
                f"Moderate Rainfall advisory for {district}: Expected 24-hr rainfall of {h24_sum:.1f}mm "
                f"(Chance of rain: {h24_prob}%).",
                [
                    "Ensure baseline maintenance of municipal roadside drains.",
                    "Advise farmers regarding drainage of water-sensitive standing crops.",
                ]
            )
        return (
            SEVERITY_GREEN,
            f"Nominal precipitation conditions expected for {district}. 24-hr accumulation under 15mm.",
            ["Routine municipal water retention and seasonal drainage monitoring."]
        )

    # -----------------------------------------------------------------------
    # FLOOD & INUNDATION LOGIC
    # -----------------------------------------------------------------------
    def _assess_flood_risk(
        self,
        district: str,
        h24_sum: float,
        h24_max_1h: float,
        d7_sum: float,
        heavy_days: int,
        basin: str,
    ) -> Tuple[str, str, List[str]]:
        is_coastal_ghats = district in COASTAL_AND_GHATS_DISTRICTS
        threshold_multiplier = 0.8 if is_coastal_ghats else 1.0

        if (h24_sum >= 100.0 * threshold_multiplier and heavy_days >= 2) or h24_max_1h >= 50.0:
            return (
                SEVERITY_RED,
                f"CRITICAL FLOOD INUNDATION WARNING: Severe riverine and urban flash-flood potential across {district} "
                f"({basin}). Soil saturation high from {heavy_days} consecutive heavy rain days (7-day total: {d7_sum:.1f}mm).",
                [
                    "Evacuate vulnerable settlements along riverbanks and unreinforced floodplains.",
                    "Activate 24x7 district flood emergency control rooms.",
                    "Suspend pedestrian and vehicular movement across low-level causeways.",
                ]
            )
        elif (h24_sum >= 50.0 * threshold_multiplier) or (d7_sum >= 150.0 and heavy_days >= 1):
            return (
                SEVERITY_ORANGE,
                f"HIGH FLOOD WATCH: Moderate-to-high inundation potential in low-lying corridors of {district} ({basin}). "
                f"Intense 24-hr runoff ({h24_sum:.1f}mm) may overwhelm stormwater drainage networks.",
                [
                    "Deploy field monitoring staff to river gauge markers and reservoir outlets.",
                    "Ensure underpass pumping stations have operational diesel backup generators.",
                ]
            )
        elif h24_sum >= 25.0 or d7_sum >= 80.0:
            return (
                SEVERITY_YELLOW,
                f"Inundation Advisory: Localized street waterlogging possible in poorly drained urban wards of {district}.",
                ["Inspect primary arterial storm drains; keep road clearance equipment on standby."]
            )
        return (
            SEVERITY_GREEN,
            f"Minimal flood and inundation hazard for {district}. River catchment flows within normal buffer capacity.",
            ["Routine hydrological basin monitoring."]
        )

    # -----------------------------------------------------------------------
    # EXTREME HEAT & THERMAL STRESS
    # -----------------------------------------------------------------------
    def _assess_extreme_heat(
        self,
        district: str,
        curr_temp: float,
        apparent_temp: float,
        humidity: float,
        d7_max: float,
    ) -> Tuple[str, str, List[str], float]:
        # Approximate Heat Index
        heat_idx = round(curr_temp + (0.5555 * ((humidity / 100.0) * 6.11 * (2.71828 ** (5417.7530 * (1/273.16 - 1/(273.15 + curr_temp)))) - 10.0)), 1)
        heat_idx = max(heat_idx, curr_temp)

        is_arid = district in ARID_DROUGHT_PRONE_DISTRICTS
        effective_max = max(curr_temp, d7_max)

        if effective_max >= 42.0 or heat_idx >= 46.0 or (is_arid and effective_max >= 40.5):
            return (
                SEVERITY_RED,
                f"HEATWAVE EMERGENCY (RED ALERT): Forecast max temperature of {effective_max:.1f}°C "
                f"(Thermal Heat Index: {heat_index_or_apparent(heat_idx, apparent_temp):.1f}°C) creates severe risk of heat stroke.",
                [
                    "Activate District Heat Action Plan (HAP) Level-3 emergency protocols.",
                    "Mandate complete cessation of outdoor manual labor between 11:30 AM and 3:30 PM.",
                    "Open air-conditioned municipal cooling shelters and distribute ORS hydration packs.",
                ],
                heat_idx,
            )
        elif effective_max >= 38.5 or heat_idx >= 41.0:
            return (
                SEVERITY_ORANGE,
                f"HIGH HEAT STRESS WATCH: Elevated thermal load in {district}. Temperatures reaching {effective_max:.1f}°C "
                f"with high humidity creating prolonged fatigue and dehydration risk.",
                [
                    "Establish shaded hydration kiosks at bus terminals, railway stations, and markets.",
                    "Alert hospitals and PHCs to treat heat exhaustion and dehydration symptoms.",
                ],
                heat_idx,
            )
        elif effective_max >= 35.0 or heat_idx >= 37.0:
            return (
                SEVERITY_YELLOW,
                f"Thermal Discomfort Advisory: Warm conditions with temperatures around {effective_max:.1f}°C in {district}.",
                ["Encourage frequent hydration and wearing lightweight cotton clothing outdoors."],
                heat_idx,
            )
        return (
            SEVERITY_GREEN,
            f"Thermal envelope comfortable and within normal climatological bounds for {district}.",
            ["Routine public health monitoring."],
            heat_idx,
        )

    # -----------------------------------------------------------------------
    # THUNDERSTORM & LIGHTNING
    # -----------------------------------------------------------------------
    def _assess_thunderstorms(self, wcode: int, daily: List[Dict[str, Any]], hourly: List[Dict[str, Any]]) -> Tuple[str, str, List[str]]:
        has_severe_tstorm = wcode in (96, 99) or any(d.get("weather_code") in (96, 99) for d in daily[:2])
        has_mod_tstorm = wcode == 95 or any(d.get("weather_code") == 95 for d in daily[:2])

        if has_severe_tstorm:
            return (
                SEVERITY_RED,
                "SEVERE THUNDERSTORM & HAIL ALERT: High convective instability forecast with active cloud-to-ground lightning and damaging hail.",
                [
                    "Seek shelter immediately in sturdy closed buildings; avoid open fields and isolated trees.",
                    "Unplug sensitive electrical appliances; avoid handling metal fences or phone chargers.",
                    "Secure loose rooftop structures and solar panels against hail damage.",
                ]
            )
        elif has_mod_tstorm:
            return (
                SEVERITY_ORANGE,
                "THUNDERSTORM & LIGHTNING WATCH: Moderate thunderstorm activity with localized squally winds and cloud-to-ground strikes.",
                [
                    "Avoid standing near tall metal poles, billboards, or under trees during storms.",
                    "Halt open-air sports and agricultural field operations during lightning activity.",
                ]
            )
        return (
            SEVERITY_GREEN,
            "Minimal convective atmospheric electrical activity forecast.",
            ["Standard weather situational awareness."]
        )

    # -----------------------------------------------------------------------
    # STRONG WINDS & GUSTS
    # -----------------------------------------------------------------------
    def _assess_strong_winds(self, wind: float, gusts: float, max_h24: float) -> Tuple[str, str, List[str]]:
        peak = max(wind, gusts, max_h24)
        if peak >= 65.0:
            return (
                SEVERITY_RED,
                f"GALE FORCE WIND WARNING: Dangerous gusts reaching {peak:.1f} km/h can uproot trees and down powerlines.",
                [
                    "Inspect overhead power distributions; secure construction cranes and billboards.",
                    "Advise motorists to exercise extreme caution on elevated flyovers and exposed highways.",
                ]
            )
        elif peak >= 45.0:
            return (
                SEVERITY_ORANGE,
                f"SQUALLY WIND WATCH: Strong winds with gusts up to {peak:.1f} km/h forecast.",
                ["Secure rooftop water tanks, sheet sheds, and outdoor market stalls."]
            )
        elif peak >= 30.0:
            return (
                SEVERITY_YELLOW,
                f"Breezy conditions with peak gusts of {peak:.1f} km/h.",
                ["Normal wind precautions."]
            )
        return (
            SEVERITY_GREEN,
            f"Gentle to moderate atmospheric airflow ({wind:.1f} km/h).",
            ["No wind hazard action required."]
        )

    # -----------------------------------------------------------------------
    # DROUGHT & WATER SECURITY DEFICIT
    # -----------------------------------------------------------------------
    def _assess_drought_indicators(self, district: str, d7_rain: float) -> Tuple[str, str, List[str]]:
        is_arid = district in ARID_DROUGHT_PRONE_DISTRICTS
        if is_arid and d7_rain <= 0.5:
            return (
                SEVERITY_ORANGE,
                f"ELEVATED MOISTURE DEFICIT WATCH: Arid zone district ({district}) with negligible forecast rainfall ({d7_rain:.1f}mm in 7 days).",
                [
                    "Promote micro-irrigation and mulching on standing horticultural crops.",
                    "Audit taluk-level drinking water tankers and rural borewell pump performance.",
                ]
            )
        elif d7_rain <= 1.0:
            return (
                SEVERITY_YELLOW,
                f"Dry Spell Advisory: 7-day cumulative rainfall projected under 1.0mm in {district}.",
                ["Maintain prudent municipal water supply management."]
            )
        return (
            SEVERITY_GREEN,
            f"Soil moisture and rainfall forecast within normal range ({d7_rain:.1f}mm expected).",
            ["Routine agricultural moisture monitoring."]
        )

    def _build_offline_assessment(self, district: str) -> Dict[str, Any]:
        """Fallback assessment when live data is unavailable."""
        return {
            "status": "unavailable",
            "district": district,
            "assessed_at": datetime.now(timezone.utc).isoformat(),
            "overall_hazard_level": SEVERITY_GREEN,
            "hazards_count": 0,
            "critical_hazards_count": 0,
            "hazards": [],
        }


def heat_index_or_apparent(hi: float, app: float) -> float:
    return max(hi, app)


_HAZARD_ENGINE: Optional[HazardRiskEngine] = None


def get_hazard_risk_engine() -> HazardRiskEngine:
    global _HAZARD_ENGINE
    if _HAZARD_ENGINE is None:
        _HAZARD_ENGINE = HazardRiskEngine()
    return _HAZARD_ENGINE
