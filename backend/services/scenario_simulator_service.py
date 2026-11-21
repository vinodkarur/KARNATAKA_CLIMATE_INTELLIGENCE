"""Climate Scenario Simulator Service.

Enables policy makers and disaster management teams to run hypothetical
climatic stress tests and 'what-if' multi-hazard scenarios.
Reuses existing trained ML pipelines and calibrated 44-year risk matrices.
Outputs are explicitly labeled as hypothetical simulations, not forecasts.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
import joblib

try:
    from services.district_service import DISTRICT_REGISTRY
    from services.risk import (
        generate_early_warnings,
        classify_temperature,
        classify_rainfall,
        classify_drought,
    )
except ImportError:
    from backend.services.district_service import DISTRICT_REGISTRY
    from backend.services.risk import (
        generate_early_warnings,
        classify_temperature,
        classify_rainfall,
        classify_drought,
    )

def _calc_heat_score(temp: float) -> float:
    return round(float(np.clip((temp - 15.0) / 25.0 * 100.0, 0.0, 100.0)), 1)


class ScenarioSimulatorService:
    def __init__(self, project_root: Path):
        self.project_root = Path(project_root)
        self.models_dir = self.project_root / "models"
        self.datasets_dir = self.project_root / "datasets" / "processed"
        self.reports_dir = self.project_root / "reports"

        self.temp_model = joblib.load(self.models_dir / "Temperature_Prediction_Model.pkl")
        self.rain_model = joblib.load(self.models_dir / "Rainfall_Prediction_Model.pkl")
        self.feature_cols: List[str] = joblib.load(self.models_dir / "Model_Feature_Columns.pkl")

        # Load latest baseline features row
        ds_path = self.datasets_dir / "Karnataka_Feature_Engineered_Dataset.csv"
        df = pd.read_csv(ds_path, parse_dates=["Date"]).set_index("Date")
        self.baseline_row = df.iloc[[-1]][self.feature_cols].copy()
        self.baseline_date = str(df.index.max().date())

        # Load historical thresholds
        th_path = self.reports_dir / "Step13_Historical_Thresholds.csv"
        self.thresholds_df = pd.read_csv(th_path) if th_path.exists() else None

    def run_simulation(
        self,
        district: str = "Bengaluru Urban",
        temp_delta: float = 0.0,       # -5.0 to +5.0 °C
        rain_percent_delta: float = 0.0, # -50% to +100%
        rain_30d_delta: float = 0.0,   # -30mm to +50mm
        enso_phase_override: str = "Current", # "Current", "Neutral", "El Niño", "La Niña"
    ) -> Dict[str, Any]:
        """Execute a comparative baseline vs simulated scenario analysis."""
        if district not in DISTRICT_REGISTRY:
            district = "Bengaluru Urban"

        meta = DISTRICT_REGISTRY[district]
        clim = meta.get("climatology", {})
        temp_offset = clim.get("temp_offset", 0.0)
        rain_factor = clim.get("rain_factor", 1.0)
        elevation = meta.get("elevation_m", 500)

        # 1. BASELINE RUN
        base_features = self.baseline_row.copy()
        raw_base_temp = float(self.temp_model.predict(base_features)[0])
        raw_base_rain = max(0.0, float(self.rain_model.predict(base_features)[0]))

        dist_base_temp = round(raw_base_temp + temp_offset, 2)
        dist_base_rain = round(raw_base_rain * rain_factor, 2)
        base_30d = float(base_features["Rainfall_Rolling_30"].iloc[0])
        base_oni = float(base_features["ONI"].iloc[0])
        base_phase = "El Niño" if base_oni >= 0.5 else ("La Niña" if base_oni <= -0.5 else "Neutral")

        TEMP_THRESHOLDS = {
            "Temperature_50th_Percentile": 23.50,
            "Temperature_75th_Percentile": 24.62,
            "Temperature_90th_Percentile": 25.88,
            "Temperature_95th_Percentile": 26.50,
        }
        RAIN_THRESHOLDS = {
            "Rainfall_25th_Percentile": 0.0,
            "Rainfall_75th_Percentile": 3.63,
            "Rainfall_90th_Percentile": 9.87,
            "Rainfall_95th_Percentile": 16.42,
        }
        DROUGHT_THRESHOLDS = {"P10": 0.82, "P25": 4.15, "P50": 18.2}

        base_heat_score = _calc_heat_score(dist_base_temp)
        base_temp_level = classify_temperature(dist_base_temp, TEMP_THRESHOLDS)
        base_rain_level = classify_rainfall(dist_base_rain, RAIN_THRESHOLDS)
        base_drought_level = classify_drought(base_30d, DROUGHT_THRESHOLDS)

        base_ew = generate_early_warnings(
            temperature=dist_base_temp,
            rainfall=dist_base_rain,
            temp_level=base_temp_level,
            rain_level=base_rain_level,
            oni_value=base_oni,
            oni_phase=base_phase,
            heat_stress_score=base_heat_score,
            drought_risk=base_drought_level,
            rain_30d=base_30d,
            district=district,
            climatology=clim,
            has_gauge_data=meta.get("is_gauge_primary", True),
            elevation_m=elevation,
            date_str=self.baseline_date,
        )

        # 2. SCENARIO PERTURBED RUN
        scen_features = self.baseline_row.copy()

        # Apply temperature anomaly to lag features
        for c in ["Temperature_Lag_1", "Temperature_Lag_2", "Temperature_Lag_3", "Temperature_Rolling_7"]:
            if c in scen_features.columns:
                scen_features[c] += temp_delta

        # Apply rainfall percentage shift to lag features
        rain_mult = 1.0 + (rain_percent_delta / 100.0)
        for c in ["Rainfall_Lag_1", "Rainfall_Lag_2", "Rainfall_Lag_3", "Rainfall_Rolling_7"]:
            if c in scen_features.columns:
                scen_features[c] = (scen_features[c] * rain_mult).clip(lower=0.0)

        # Apply 30-day cumulative drought perturbation
        scen_30d = max(0.0, base_30d + rain_30d_delta)
        if "Rainfall_Rolling_30" in scen_features.columns:
            scen_features["Rainfall_Rolling_30"] = scen_30d

        # Apply ENSO override
        if enso_phase_override == "El Niño":
            scen_oni = 1.8
            scen_phase = "El Niño"
        elif enso_phase_override == "La Niña":
            scen_oni = -1.5
            scen_phase = "La Niña"
        elif enso_phase_override == "Neutral":
            scen_oni = 0.0
            scen_phase = "Neutral"
        else:
            scen_oni = base_oni
            scen_phase = base_phase

        if "ONI" in scen_features.columns:
            scen_features["ONI"] = scen_oni
        if "El_Nino" in scen_features.columns:
            scen_features["El_Nino"] = 1 if scen_phase == "El Niño" else 0
        if "La_Nina" in scen_features.columns:
            scen_features["La_Nina"] = 1 if scen_phase == "La Niña" else 0
        if "Neutral" in scen_features.columns:
            scen_features["Neutral"] = 1 if scen_phase == "Neutral" else 0

        # Predict with perturbed features
        raw_scen_temp = float(self.temp_model.predict(scen_features)[0])
        raw_scen_rain = max(0.0, float(self.rain_model.predict(scen_features)[0]))

        dist_scen_temp = round(raw_scen_temp + temp_offset + (temp_delta * 0.4), 2)
        dist_scen_rain = round(raw_scen_rain * rain_factor * (1.0 + (rain_percent_delta / 200.0)), 2)

        scen_heat_score = _calc_heat_score(dist_scen_temp)
        scen_temp_level = classify_temperature(dist_scen_temp, TEMP_THRESHOLDS)
        scen_rain_level = classify_rainfall(dist_scen_rain, RAIN_THRESHOLDS)
        scen_drought_level = classify_drought(scen_30d, DROUGHT_THRESHOLDS)

        scen_ew = generate_early_warnings(
            temperature=dist_scen_temp,
            rainfall=dist_scen_rain,
            temp_level=scen_temp_level,
            rain_level=scen_rain_level,
            oni_value=scen_oni,
            oni_phase=scen_phase,
            heat_stress_score=scen_heat_score,
            drought_risk=scen_drought_level,
            rain_30d=scen_30d,
            district=district,
            climatology=clim,
            has_gauge_data=meta.get("is_gauge_primary", True),
            elevation_m=elevation,
            date_str="2025-SIMULATION",
        )

        return {
            "status": "success",
            "disclaimer": "HYPOTHETICAL SIMULATION • STRESS TEST (Not an official meteorological forecast)",
            "district": district,
            "agro_zone": meta.get("zone", "Karnataka Zone"),
            "baseline_date": self.baseline_date,
            "inputs": {
                "temp_delta": temp_delta,
                "rain_percent_delta": rain_percent_delta,
                "rain_30d_delta": rain_30d_delta,
                "enso_phase": scen_phase,
                "oni_value": scen_oni,
            },
            "comparison": {
                "temperature": {
                    "baseline_c": dist_base_temp,
                    "scenario_c": dist_scen_temp,
                    "delta_c": round(dist_scen_temp - dist_base_temp, 2),
                    "baseline_tier": base_temp_level,
                    "scenario_tier": scen_temp_level,
                },
                "rainfall": {
                    "baseline_mm": dist_base_rain,
                    "scenario_mm": dist_scen_rain,
                    "delta_mm": round(dist_scen_rain - dist_base_rain, 2),
                    "baseline_tier": base_rain_level,
                    "scenario_tier": scen_rain_level,
                },
                "drought_deficit": {
                    "baseline_30d_mm": round(base_30d, 1),
                    "scenario_30d_mm": round(scen_30d, 1),
                    "baseline_risk": base_drought_level,
                    "scenario_risk": scen_drought_level,
                },
                "heat_stress": {
                    "baseline_index": base_heat_score,
                    "scenario_index": scen_heat_score,
                    "delta_index": round(scen_heat_score - base_heat_score, 1),
                },
                "overall_status": {
                    "baseline": base_ew["status"],
                    "scenario": scen_ew["status"],
                    "color_baseline": base_ew.get("color", "#16a34a"),
                    "color_scenario": scen_ew.get("color", "#16a34a"),
                },
            },
            "scenario_alerts": scen_ew.get("alerts", []),
        }


_SIMULATOR_SERVICE: Optional[ScenarioSimulatorService] = None


def get_scenario_simulator_service(project_root: Optional[Path] = None) -> ScenarioSimulatorService:
    global _SIMULATOR_SERVICE
    if _SIMULATOR_SERVICE is None:
        if project_root is None:
            project_root = Path(__file__).resolve().parent.parent.parent
        _SIMULATOR_SERVICE = ScenarioSimulatorService(project_root)
    return _SIMULATOR_SERVICE
