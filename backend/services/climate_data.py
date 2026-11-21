"""Climate dataset management and caching service for Karnataka Climate Risk Platform."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd


class ClimateStore:
    def __init__(self, project_root: Path):
        self.project_root = Path(project_root)
        processed = self.project_root / "datasets" / "processed"
        reports = self.project_root / "reports"

        # Load historical processed datasets
        self.weather = pd.read_csv(
            processed / "Karnataka_Final_Cleaned_Dataset.csv",
            parse_dates=["Date"],
        )
        self.features = pd.read_csv(
            processed / "Karnataka_Feature_Engineered_Dataset.csv",
            parse_dates=["Date"],
        )
        self.oni = pd.read_csv(
            processed / "NOAA_ONI_Cleaned.csv",
            parse_dates=["Date"],
        )
        self.evaluation = pd.read_csv(
            processed / "Step10_Model_Evaluation_Results.csv"
        )
        self.shap_combined = pd.read_csv(
            reports / "SHAP_Combined_Feature_Importance.csv"
        )
        self.shap_temp = pd.read_csv(
            reports / "SHAP_Temperature_Feature_Importance.csv"
        )
        self.shap_rain = pd.read_csv(
            reports / "SHAP_Rainfall_Feature_Importance.csv"
        )
        self.history = pd.read_csv(
            reports / "Step13_Adaptation_Recommendations.csv",
            parse_dates=["Date"],
        )
        self.thresholds = pd.read_csv(
            reports / "Step13_Historical_Thresholds.csv"
        )

        # Sort chronologically (features/weather ascending, history newest first)
        self.features = self.features.sort_values("Date").reset_index(drop=True)
        self.weather = self.weather.sort_values("Date").reset_index(drop=True)
        self.oni = self.oni.sort_values("Date").reset_index(drop=True)
        self.history = self.history.sort_values("Date", ascending=False).reset_index(drop=True)
        self.feature_index = self.features.set_index("Date")

        self.date_min = str(self.features["Date"].min().date())
        self.date_max = str(self.features["Date"].max().date())

        self.dashboard_cache = self._build_dashboard()

        # Pre-compute expensive, request-invariant aggregates once at startup.
        # This keeps /api/risk-thresholds and /api/drought-thresholds O(1) per request.
        self.risk_thresholds_cache = self._build_risk_thresholds()
        self.drought_thresholds_cache = self._build_drought_thresholds()

    def _normalize_enso_label(self, series: pd.Series) -> pd.Series:
        """Map raw Condition strings to consistent Unicode ENSO labels.

        Handles valid UTF-8 labels ("El Niño"), plain-ASCII variants
        ("El Nino"), and legacy duplicated prefixes ("El El Niño") without
        re-encoding already-correct text.
        """
        def _fix(value: str) -> str:
            text = str(value).strip()
            lowered = text.lower()
            if "el ni" in lowered or lowered.startswith("el "):
                return "El Ni\u00f1o"
            if "la ni" in lowered or lowered.startswith("la "):
                return "La Ni\u00f1a"
            return "Neutral"
        return series.apply(_fix)

    def _build_dashboard(self) -> Dict[str, Any]:
        weather = self.weather.copy()
        weather["ConditionNorm"] = self._normalize_enso_label(weather["Condition"])

        # 1. Yearly aggregations
        yearly = (
            weather.groupby(weather["Date"].dt.year)
            .agg(
                mean_temperature=("Mean_Temperature", "mean"),
                max_temperature=("Max_Temperature", "max"),
                min_temperature=("Min_Temperature", "min"),
                total_rainfall=("Rainfall", "sum"),
                mean_rainfall=("Rainfall", "mean"),
                mean_oni=("ONI", "mean"),
            )
            .reset_index()
            .rename(columns={"Date": "year"})
        )

        # 2. Monthly aggregations
        monthly = (
            weather.groupby(weather["Date"].dt.month)
            .agg(
                mean_temperature=("Mean_Temperature", "mean"),
                max_temperature=("Max_Temperature", "mean"),
                min_temperature=("Min_Temperature", "mean"),
                mean_rainfall=("Rainfall", "mean"),
                total_rainfall=("Rainfall", "sum"),
            )
            .reset_index()
            .rename(columns={"Date": "month"})
        )
        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        monthly["month_name"] = monthly["month"].apply(lambda m: month_names[m - 1])

        # 3. ENSO Phase Comparisons
        enso = (
            weather.groupby("ConditionNorm")
            .agg(
                days=("Date", "count"),
                mean_temperature=("Mean_Temperature", "mean"),
                max_temperature=("Max_Temperature", "max"),
                mean_rainfall=("Rainfall", "mean"),
                total_rainfall=("Rainfall", "sum"),
            )
            .reset_index()
        )
        total_days = len(weather)
        enso["percentage"] = (enso["days"] / total_days * 100).round(1)

        # 4. Monthly Temperature & Rainfall by ENSO Condition
        monthly_enso = (
            weather.groupby([weather["Date"].dt.month, "ConditionNorm"])
            .agg(
                mean_temperature=("Mean_Temperature", "mean"),
                mean_rainfall=("Rainfall", "mean"),
            )
            .reset_index()
            .rename(columns={"Date": "month"})
        )

        # 5. Recent 365-day daily data
        recent = weather.tail(365).copy()

        # 6. Recent ONI timeline (last 60 months from ONI dataset)
        oni_df = self.oni.copy()
        if "Condition" in oni_df.columns:
            oni_df["ConditionNorm"] = self._normalize_enso_label(oni_df["Condition"])
        else:
            oni_df["ConditionNorm"] = "Neutral"
        oni_recent = oni_df.tail(60).copy()

        # 7. SHAP Feature Importance
        shap_rows = []
        try:
            shap_df = self.shap_combined.copy()
            name_col = shap_df.columns[0]
            shap_df = shap_df.rename(columns={name_col: "feature"})
            for _, row in shap_df.iterrows():
                shap_rows.append({
                    "feature": str(row["feature"]),
                    "temperature": round(float(row["Temperature_SHAP_Importance"]), 4),
                    "rainfall": round(float(row["Rainfall_SHAP_Importance"]), 4),
                })
        except Exception:
            pass

        # 8. Model Evaluation Metrics
        eval_rows = []
        eval_df = self.evaluation.copy()
        if "Unnamed: 0" in eval_df.columns:
            eval_df = eval_df.rename(columns={"Unnamed: 0": "Target"})
        for _, row in eval_df.iterrows():
            target_name = str(row.get("Target", "")).replace("Target_Next_Day_", "")
            eval_rows.append({
                "target": target_name,
                "model": str(row.get("Model", "")),
                "mae": round(float(row["MAE"]), 4),
                "rmse": round(float(row["RMSE"]), 4),
                "r2": round(float(row["R2_Score"]), 4),
                "mean_error": round(float(row.get("Mean_Error", 0)), 4),
                "error_std": round(float(row.get("Error_Std_Dev", 0)), 4),
            })

        # 9. Historical Extreme Records
        hottest_day_row = weather.loc[weather["Mean_Temperature"].idxmax()]
        wettest_day_row = weather.loc[weather["Rainfall"].idxmax()]

        threshold_dict = {
            str(row["Metric"]): float(row["Threshold"])
            for _, row in self.thresholds.iterrows()
        }

        return {
            "summary": {
                "records": int(len(weather)),
                "start_date": str(weather["Date"].min().date()),
                "end_date": str(weather["Date"].max().date()),
                "mean_temperature": round(float(weather["Mean_Temperature"].mean()), 2),
                "max_temperature": round(float(weather["Mean_Temperature"].max()), 2),
                "min_temperature": round(float(weather["Mean_Temperature"].min()), 2),
                "mean_rainfall": round(float(weather["Rainfall"].mean()), 2),
                "total_rainfall": round(float(weather["Rainfall"].sum()), 1),
                "hottest_day": {
                    "date": str(hottest_day_row["Date"].date()),
                    "temperature": round(float(hottest_day_row["Mean_Temperature"]), 2),
                    "condition": str(hottest_day_row["ConditionNorm"]),
                },
                "wettest_day": {
                    "date": str(wettest_day_row["Date"].date()),
                    "rainfall": round(float(wettest_day_row["Rainfall"]), 2),
                    "condition": str(wettest_day_row["ConditionNorm"]),
                },
                "feature_start": self.date_min,
                "feature_end": self.date_max,
            },
            "yearly": {
                "year": yearly["year"].astype(int).tolist(),
                "mean_temperature": yearly["mean_temperature"].round(2).tolist(),
                "total_rainfall": yearly["total_rainfall"].round(1).tolist(),
                "mean_oni": yearly["mean_oni"].round(3).tolist(),
            },
            "monthly": {
                "month": monthly["month"].astype(int).tolist(),
                "month_name": monthly["month_name"].tolist(),
                "mean_temperature": monthly["mean_temperature"].round(2).tolist(),
                "mean_rainfall": monthly["mean_rainfall"].round(2).tolist(),
            },
            "enso": [
                {
                    "condition": row["ConditionNorm"],
                    "days": int(row["days"]),
                    "percentage": float(row["percentage"]),
                    "mean_temperature": round(float(row["mean_temperature"]), 2),
                    "mean_rainfall": round(float(row["mean_rainfall"]), 2),
                }
                for _, row in enso.iterrows()
            ],
            "monthly_enso": [
                {
                    "month": int(row["month"]),
                    "condition": row["ConditionNorm"],
                    "mean_temperature": round(float(row["mean_temperature"]), 2),
                    "mean_rainfall": round(float(row["mean_rainfall"]), 2),
                }
                for _, row in monthly_enso.iterrows()
            ],
            "recent_daily": {
                "date": recent["Date"].dt.strftime("%Y-%m-%d").tolist(),
                "temperature": recent["Mean_Temperature"].round(2).tolist(),
                "rainfall": recent["Rainfall"].round(2).tolist(),
                "oni": recent["ONI"].round(3).tolist(),
            },
            "oni_recent": {
                "date": oni_recent["Date"].dt.strftime("%Y-%m-%d").tolist(),
                "oni": oni_recent["ONI"].round(3).tolist(),
                "condition": oni_recent["ConditionNorm"].tolist(),
            },
            "shap": shap_rows,
            "evaluation": eval_rows,
            "thresholds": threshold_dict,
            "disclaimer": (
                "The Oceanic Ni\u00f1o Index (ONI) reflects sea-surface temperature departures in the "
                "Ni\u00f1o 3.4 region (3-month running mean). ENSO modulates large-scale atmospheric "
                "circulation, yet Karnataka local weather is governed by complex interactions: the "
                "South-West and North-East monsoon troughs, Western Ghats orographic uplifting, "
                "Bay of Bengal depressions, and urban heat islands. Predictions are next-day estimates "
                "derived strictly from historical data. Relative percentile risk tiers (Low, "
                "Moderate/Normal, High, Very High) are exploratory benchmarks and not official "
                "IMD/KSNDMC warnings."
            ),
        }

    # ------------------------------------------------------------------
    # Pre-computed risk / drought threshold aggregates
    # ------------------------------------------------------------------

    def _build_risk_thresholds(self) -> Dict[str, Any]:
        """Vectorised historical risk-tier distribution.

        The original implementation iterated over all ~16k weather rows with
        ``DataFrame.iterrows()`` and re-ran the scalar classifiers on every
        request.  This version performs the same classification with NumPy
        boolean masks once at startup.
        """
        threshold_map = {
            str(row["Metric"]): float(row["Threshold"])
            for _, row in self.thresholds.iterrows()
        }

        weather = self.weather.dropna(
            subset=["Mean_Temperature", "Rainfall"]
        )
        temperature = weather["Mean_Temperature"].to_numpy(dtype=float)
        rainfall = weather["Rainfall"].to_numpy(dtype=float)

        p50 = threshold_map["Temperature_50th_Percentile"]
        p75 = threshold_map["Temperature_75th_Percentile"]
        p90 = threshold_map["Temperature_90th_Percentile"]
        r25 = threshold_map["Rainfall_25th_Percentile"]
        r75 = threshold_map["Rainfall_75th_Percentile"]
        r90 = threshold_map["Rainfall_90th_Percentile"]

        temp_levels = np.select(
            [temperature <= p50, temperature <= p75, temperature <= p90],
            ["Low", "Moderate", "High"],
            default="Very High",
        )
        rain_levels = np.select(
            [rainfall <= r25, rainfall <= r75, rainfall <= r90],
            ["Low", "Normal", "High"],
            default="Very High",
        )

        total = int(len(weather))
        temp_counts = pd.Series(temp_levels).value_counts()
        rain_counts = pd.Series(rain_levels).value_counts()

        def as_percent(counts: pd.Series, order: List[str]) -> Dict[str, float]:
            return {
                level: round(float(counts.get(level, 0)) / total * 100, 1)
                for level in order
            }

        return {
            "thresholds": threshold_map,
            "temperature_percentiles": {
                "P50": round(float(weather["Mean_Temperature"].quantile(0.50)), 2),
                "P75": round(float(weather["Mean_Temperature"].quantile(0.75)), 2),
                "P90": round(float(weather["Mean_Temperature"].quantile(0.90)), 2),
            },
            "rainfall_percentiles": {
                "P25": round(float(weather["Rainfall"].quantile(0.25)), 2),
                "P75": round(float(weather["Rainfall"].quantile(0.75)), 2),
                "P90": round(float(weather["Rainfall"].quantile(0.90)), 2),
            },
            "temperature_distribution": as_percent(
                temp_counts, ["Low", "Moderate", "High", "Very High"]
            ),
            "rainfall_distribution": as_percent(
                rain_counts, ["Low", "Normal", "High", "Very High"]
            ),
            "record_count": total,
            "methodology": (
                "Thresholds are computed from 44 years of Karnataka daily observations "
                "(1981\u20132024). Temperature: Low=below P50, Moderate=P50\u2013P75, "
                "High=P75\u2013P90, Very High=above P90. Rainfall: Low=below P25, "
                "Normal=P25\u2013P75, High=P75\u2013P90, Very High=above P90. "
                "Categories are relative statistical tiers, not official warnings."
            ),
        }

    def _build_drought_thresholds(self) -> Dict[str, Any]:
        """Pre-compute 30-day rainfall percentiles and monthly climatology."""
        rain30 = pd.to_numeric(
            self.features["Rainfall_Rolling_30"], errors="coerce"
        ).dropna()
        percentiles = {
            f"P{int(p)}": round(float(rain30.quantile(p / 100.0)), 2)
            for p in (5, 10, 25, 50, 75, 90, 95)
        }

        month_names = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ]
        monthly = (
            self.weather.groupby(self.weather["Date"].dt.month)["Rainfall"]
            .mean()
        )
        monthly_values = {
            month_names[int(month) - 1]: round(float(value), 2)
            for month, value in monthly.items()
        }
        dry_months = [
            month
            for month, value in monthly_values.items()
            if value < 2.0
        ]

        return {
            "rolling_30d_rainfall_percentiles": percentiles,
            "monthly_mean_rainfall": monthly_values,
            "dry_months": dry_months,
            "classification": (
                "Drought risk is a relative indicator: High when the trailing "
                "30-day rainfall is at or below the historical P10, Moderate at "
                "or below P25, and Low otherwise. It is not an IMD/KSNDMC "
                "drought declaration."
            ),
            "record_count": int(len(rain30)),
        }

    def risk_thresholds_data(self) -> Dict[str, Any]:
        """Return the cached risk-threshold payload for the API."""
        return self.risk_thresholds_cache

    def drought_data(self) -> Dict[str, Any]:
        """Return the cached drought-threshold payload for the API."""
        return self.drought_thresholds_cache

    def shap_data(self) -> Dict[str, Any]:
        """Return SHAP feature importance data for the /api/shap endpoint."""
        shap_rows = self.dashboard_cache.get("shap", [])

        def importance_column(frame: pd.DataFrame) -> str:
            """Pick the importance column regardless of CSV export headers.

            The exported SHAP files use either ``SHAP_Importance`` or an
            anonymous ``0`` column (a pandas to_csv index artefact).  Falling
            back silently to an empty list would make the Explainability page
            look like the model had no important features.
            """
            for candidate in ("SHAP_Importance", "0", "Importance"):
                if candidate in frame.columns:
                    return candidate
            numeric = [
                column
                for column in frame.columns
                if pd.to_numeric(frame[column], errors="coerce").notna().any()
            ]
            return numeric[-1] if numeric else frame.columns[-1]

        temp_rows = []
        rain_rows = []
        temp_column = importance_column(self.shap_temp)
        rain_column = importance_column(self.shap_rain)
        for _, row in self.shap_temp.iterrows():
            temp_rows.append({
                "feature": str(row.iloc[0]),
                "importance": round(float(row[temp_column]), 4),
            })
        for _, row in self.shap_rain.iterrows():
            rain_rows.append({
                "feature": str(row.iloc[0]),
                "importance": round(float(row[rain_column]), 4),
            })

        return {
            "features": shap_rows,
            "temperature_ranked": sorted(temp_rows, key=lambda x: x["importance"], reverse=True),
            "rainfall_ranked": sorted(rain_rows, key=lambda x: x["importance"], reverse=True),
            "evaluation": self.dashboard_cache.get("evaluation", []),
            "disclaimer": (
                "SHAP values represent additive feature contributions to each model prediction. "
                "LinearExplainer is used for the temperature model; TreeExplainer for the rainfall model. "
                "Global importance = mean absolute SHAP value across all test-set observations."
            ),
        }

    def get_enso_data(
        self, year: Optional[Any] = None, phase: Optional[str] = None
    ) -> Dict[str, Any]:
        """Return comprehensive NOAA ONI teleconnection intelligence (1950–2026)."""
        oni_df = self.oni.copy()
        if "Condition" in oni_df.columns:
            oni_df["ConditionNorm"] = self._normalize_enso_label(oni_df["Condition"])
        else:
            oni_df["ConditionNorm"] = "Neutral"

        # Calculate exact latest available observation (August 2026 in dataset)
        latest_row = oni_df.iloc[-1]
        latest_oni = float(latest_row["ONI"])
        latest_phase = str(latest_row["ConditionNorm"])
        latest_obs = {
            "year": int(latest_row["Year"]),
            "month": int(latest_row["Month"]),
            "month_name": str(latest_row["Month_Name"]),
            "season": str(latest_row.get("Season", "")),
            "oni": round(latest_oni, 2),
            "phase": latest_phase,
            "anomaly_str": f"{'+' if latest_oni > 0 else ''}{latest_oni:.2f}°C",
            "date": str(pd.to_datetime(latest_row["Date"]).date()),
            "dataset": "NOAA Climate Prediction Center (ERSST.v5 Niño 3.4 3-Month Running Mean)",
            "is_historical_reanalysis": True,
            "observation_period": f"{latest_row['Month_Name']} {int(latest_row['Year'])}",
        }

        # Multi-decadal summary statistics across all 920 months
        total_months = len(oni_df)
        el_count = int((oni_df["ONI"] >= 0.5).sum())
        la_count = int((oni_df["ONI"] <= -0.5).sum())
        neu_count = int(((oni_df["ONI"] > -0.5) & (oni_df["ONI"] < 0.5)).sum())

        max_idx = oni_df["ONI"].idxmax()
        min_idx = oni_df["ONI"].idxmin()
        max_row = oni_df.loc[max_idx]
        min_row = oni_df.loc[min_idx]

        summary = {
            "total_months": total_months,
            "start_year": int(oni_df["Year"].min()),
            "end_year": int(oni_df["Year"].max()),
            "start_date": str(pd.to_datetime(oni_df["Date"].min()).date()),
            "end_date": str(pd.to_datetime(oni_df["Date"].max()).date()),
            "el_nino_months": el_count,
            "la_nina_months": la_count,
            "neutral_months": neu_count,
            "el_nino_percentage": round(el_count / total_months * 100, 1),
            "la_nina_percentage": round(la_count / total_months * 100, 1),
            "neutral_percentage": round(neu_count / total_months * 100, 1),
            "peak_el_nino": {
                "oni": round(float(max_row["ONI"]), 2),
                "year": int(max_row["Year"]),
                "month": str(max_row["Month_Name"]),
                "season": str(max_row.get("Season", "")),
            },
            "peak_la_nina": {
                "oni": round(float(min_row["ONI"]), 2),
                "year": int(min_row["Year"]),
                "month": str(min_row["Month_Name"]),
                "season": str(min_row.get("Season", "")),
            },
            "karnataka_teleconnections": {
                "el_nino": {
                    "mean_rainfall_mm_day": 3.12,
                    "mean_temp_c": 21.6,
                    "rainfall_impact": "Precipitation suppression (~14% to 22% seasonal deficit)",
                    "thermal_impact": "Elevated mean surface temperatures (+0.4°C to +0.8°C)",
                    "risk_character": "Elevated drought, low reservoir recharge, and urban heatwave vulnerability",
                },
                "la_nina": {
                    "mean_rainfall_mm_day": 3.84,
                    "mean_temp_c": 21.2,
                    "rainfall_impact": "Enhanced precipitation (~8% to 15% seasonal surplus)",
                    "thermal_impact": "Cooler surface conditions (-0.3°C to -0.5°C)",
                    "risk_character": "Elevated catchment runoff, reservoir surplus, and localized flood risk",
                },
                "neutral": {
                    "mean_rainfall_mm_day": 3.42,
                    "mean_temp_c": 21.3,
                    "rainfall_impact": "Long-term seasonal climatological envelope (mean standard regime)",
                    "thermal_impact": "Baseline seasonal equilibrium",
                    "risk_character": "Standard regional seasonal variation governed by local monsoon dynamics",
                },
            },
        }

        # Filtered timeline or full timeline
        filtered_df = oni_df.copy()
        selected_year_months = []
        if year is not None:
            try:
                y_int = int(year)
                y_df = oni_df[oni_df["Year"] == y_int]
                for _, r in y_df.iterrows():
                    o_val = float(r["ONI"])
                    selected_year_months.append({
                        "date": str(pd.to_datetime(r["Date"]).date()),
                        "year": int(r["Year"]),
                        "month": int(r["Month"]),
                        "month_name": str(r["Month_Name"]),
                        "season": str(r.get("Season", "")),
                        "oni": round(o_val, 2),
                        "phase": str(r["ConditionNorm"]),
                    })
                filtered_df = y_df
            except (ValueError, TypeError):
                pass

        if phase:
            phase_norm = phase.strip().lower()
            if "el" in phase_norm:
                filtered_df = filtered_df[filtered_df["ONI"] >= 0.5]
            elif "la" in phase_norm:
                filtered_df = filtered_df[filtered_df["ONI"] <= -0.5]
            elif "neu" in phase_norm:
                filtered_df = filtered_df[(filtered_df["ONI"] > -0.5) & (filtered_df["ONI"] < 0.5)]

        timeline = []
        for _, r in filtered_df.iterrows():
            o_val = float(r["ONI"])
            timeline.append({
                "date": str(pd.to_datetime(r["Date"]).date()),
                "year": int(r["Year"]),
                "month": int(r["Month"]),
                "month_name": str(r["Month_Name"]),
                "season": str(r.get("Season", "")),
                "oni": round(o_val, 2),
                "phase": str(r["ConditionNorm"]),
            })

        # Complete multi-decadal monthly dataset (for full chart rendering)
        full_timeline = []
        for _, r in oni_df.iterrows():
            o_val = float(r["ONI"])
            full_timeline.append({
                "date": str(pd.to_datetime(r["Date"]).date()),
                "year": int(r["Year"]),
                "month": int(r["Month"]),
                "month_name": str(r["Month_Name"]),
                "season": str(r.get("Season", "")),
                "oni": round(o_val, 2),
                "phase": str(r["ConditionNorm"]),
            })

        # Year-by-year summary series (1950 to 2026)
        yearly_summary = []
        for y, group in oni_df.groupby("Year"):
            mean_o = float(group["ONI"].mean())
            max_o = float(group["ONI"].max())
            min_o = float(group["ONI"].min())
            dom = "Neutral"
            if mean_o >= 0.5:
                dom = "El Niño"
            elif mean_o <= -0.5:
                dom = "La Niña"
            yearly_summary.append({
                "year": int(y),
                "mean_oni": round(mean_o, 2),
                "max_oni": round(max_o, 2),
                "min_oni": round(min_o, 2),
                "months": int(len(group)),
                "dominant_phase": dom,
            })

        # Major Curated Historical Events with Karnataka Context
        historical_events = [
            {
                "period": "2023–2024",
                "phase": "El Niño",
                "peak_oni": "+2.0°C",
                "severity": "Strong",
                "monsoon_impact": "Severe August monsoon hiatus; widespread reservoir storage depletion in Cauvery & Krishna basins.",
                "thermal_impact": "Record spring 2024 urban heatwave anomalies in Bengaluru, Kalaburagi, and Raichur.",
            },
            {
                "period": "2020–2023",
                "phase": "La Niña",
                "peak_oni": "-1.3°C",
                "severity": "Protracted (Triple-Dip)",
                "monsoon_impact": "Successive high-volume monsoons with repeated urban inundation and riverine flooding.",
                "thermal_impact": "Prolonged moderate thermal regimes across south interior Karnataka.",
            },
            {
                "period": "2015–2016",
                "phase": "El Niño",
                "peak_oni": "+2.6°C",
                "severity": "Super El Niño",
                "monsoon_impact": "Severe statewide agricultural drought; critical drinking water emergency in rural and urban taluks.",
                "thermal_impact": "Extreme daytime temperatures exceeding 43°C in northern dry zone.",
            },
            {
                "period": "2010–2011",
                "phase": "La Niña",
                "peak_oni": "-1.7°C",
                "severity": "Strong",
                "monsoon_impact": "Robust southwest and northeast monsoons; full reservoir replenishment across the state.",
                "thermal_impact": "Sub-normal summer heatwave frequency across Karnataka plateau.",
            },
            {
                "period": "2009–2010",
                "phase": "El Niño",
                "peak_oni": "+1.6°C",
                "severity": "Moderate-to-Strong",
                "monsoon_impact": "Acute drought in June–July 2009 followed by catastrophic localized cloudburst floods in early October.",
                "thermal_impact": "Marked thermal stress during pre-monsoon summer.",
            },
            {
                "period": "1997–1998",
                "phase": "El Niño",
                "peak_oni": "+2.4°C",
                "severity": "Super El Niño",
                "monsoon_impact": "Subdued monsoon circulation; northern interior districts suffered ~28% rainfall deficit.",
                "thermal_impact": "Significant statewide positive temperature anomalies throughout post-monsoon.",
            },
            {
                "period": "1982–1983",
                "phase": "El Niño",
                "peak_oni": "+2.3°C",
                "severity": "Super El Niño",
                "monsoon_impact": "Severe all-India monsoon failure with catastrophic impact on rainfed agriculture in Karnataka.",
                "thermal_impact": "Extreme prolonged dry spells.",
            },
            {
                "period": "1973–1974",
                "phase": "La Niña",
                "peak_oni": "-2.0°C",
                "severity": "Very Strong",
                "monsoon_impact": "Heavy late-monsoon precipitation and extensive groundwater recharge across dry zones.",
                "thermal_impact": "Markedly cool seasonal temperatures.",
            },
        ]

        all_years = [int(y) for y in sorted(list(oni_df["Year"].unique()))]

        return {
            "status": "success",
            "latest": latest_obs,
            "summary": summary,
            "timeline": timeline,
            "full_timeline": full_timeline,
            "selected_year_months": selected_year_months,
            "timeline_count": len(timeline),
            "years_available": all_years,
            "yearly_summary": yearly_summary,
            "historical_events": historical_events,
            "disclaimer": (
                "NOAA CPC Oceanic Niño Index (ERSST.v5 Niño 3.4 SST 3-month running mean). "
                "Historical reanalysis dataset (1950–2026), not an operational real-time feed. "
                "Teleconnection physics indicate background macro-scale influence, not deterministic daily rain prediction."
            ),
        }

    def feature_row(self, date_value) -> Optional[pd.Series]:
        """Retrieve engineered 32 features for a historical date."""
        stamp = pd.to_datetime(date_value, errors="coerce")
        if pd.isna(stamp):
            return None
        if stamp not in self.feature_index.index:
            return None
        row = self.feature_index.loc[stamp]
        if isinstance(row, pd.DataFrame):
            return row.iloc[0]
        return row

    def history_rows(
        self,
        limit: int = 200,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve stored historical predictions from CSV report with optional date filtering."""
        frame = self.history.copy()
        if start_date:
            frame = frame[frame["Date"] >= pd.to_datetime(start_date)]
        if end_date:
            frame = frame[frame["Date"] <= pd.to_datetime(end_date)]

        # self.history is already sorted newest-first during __init__.
        frame = frame.head(int(limit))
        rows = []
        for _, row in frame.iterrows():
            rows.append({
                "date": str(pd.to_datetime(row["Date"]).date()),
                "predicted_temperature_C": round(float(row["Predicted_Temperature_C"]), 2),
                "predicted_rainfall_mm": round(float(row["Predicted_Rainfall_mm"]), 2),
                "temperature_level": str(row["Relative_Temperature_Level"]),
                "rainfall_level": str(row["Relative_Rainfall_Level"]),
                "oni": round(float(row["ONI"]), 3) if pd.notna(row["ONI"]) else None,
                "temperature_recommendation": str(row["Temperature_Recommendations"]),
                "rainfall_recommendation": str(row["Rainfall_Recommendations"]),
            })
        return rows
