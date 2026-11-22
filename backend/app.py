"""Flask application — Karnataka El Niño-Aware Heat & Weather Risk Prediction Platform."""

import io
import os
import json
import math
from pathlib import Path
import csv
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, render_template, request, Response, session, redirect, url_for
from flask.json.provider import DefaultJSONProvider

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

from database.db import (
    check_db_health,
    validate_database_startup,
    export_alerts_csv,
    fetch_alert_history,
    fetch_prediction_history,
    save_alert_records,
    save_prediction_record,
    fetch_active_model_selection,
    save_active_model_selection,
)
from services.chatbot import chat_reply
from services.climate_data import ClimateStore
try:
    from services.explain import ShapExplainers, SHAP_AVAILABLE, SHAP_ERROR, SHAP_BLOCKED_BY_POLICY
except Exception as _shap_imp_err:
    ShapExplainers = None
    SHAP_AVAILABLE = False
    SHAP_ERROR = str(_shap_imp_err)
    SHAP_BLOCKED_BY_POLICY = "Application Control" in SHAP_ERROR or "4551" in SHAP_ERROR
from services.district_service import DistrictIntelligenceService, DISTRICT_REGISTRY, CANONICAL_TO_RAW_DISTRICTS
from database.db import fetch_algorithm_evaluations
from services.algorithm_lab_service import get_algorithm_lab_service
from services.live_climate_service import get_live_climate_service
from services.xai_service import get_xai_service
from services.scenario_simulator_service import get_scenario_simulator_service
from services.ensemble_service import get_ensemble_service
from services.monitoring_service import get_monitoring_service

# Enterprise Live Weather, Risk Engine, Emergency Warning & Auth Services
from services.weather_api_client import WeatherAPIClient
from services.forecast_service import get_forecast_service, normalize_district_name
from services.hazard_risk_engine import get_hazard_risk_engine
from services.warning_service import get_warning_service
from services.auth_service import get_auth_service
from services.notification_service import get_notification_service, VAPID_PUBLIC_KEY
from database.migrations import run_database_migrations

from services.risk import (
    classify_drought,
    classify_rainfall,
    classify_temperature,
    drought_recommendations,
    generate_all_districts_early_warnings,
    generate_early_warnings,
    rainfall_recommendations,
    sector_adaptation_matrix,
    temperature_recommendations,
)

PROJECT = Path(__file__).resolve().parent.parent
MODEL_FOLDER = PROJECT / "models"
REPORT_FOLDER = PROJECT / "reports"
POWERBI_FOLDER = PROJECT / "powerbi"

# Load environment variables from .env files if present
if load_dotenv is not None:
    load_dotenv(PROJECT / ".env")
    load_dotenv(Path(__file__).resolve().parent / ".env")

app = Flask(
    __name__,
    template_folder=str(PROJECT / "frontend" / "templates"),
    static_folder=str(PROJECT / "frontend" / "static"),
    static_url_path="/static",
)
app.secret_key = os.environ.get("SECRET_KEY", "kci-enterprise-secret-key-2026")

# Database configuration pre-flight validation
db_startup = validate_database_startup()
if db_startup.get("issues"):
    for issue in db_startup["issues"]:
        app.logger.warning(f"[DB CONFIG WARNING] {issue}")
else:
    app.logger.info(f"[DB CONFIG OK] MySQL connectivity established in {'production' if db_startup.get('is_production') else 'development'} mode.")


class StrictJSONProvider(DefaultJSONProvider):
    """Serialize NaN/Infinity as ``null`` so browsers can always parse the API.

    Pandas produces ``NaN`` for genuinely unavailable aggregates (for example a
    district with only one observed year has no coefficient of variation).
    Python's json module emits the non-standard tokens ``NaN``/``Infinity``,
    which ``JSON.parse`` rejects in the browser.
    """

    @classmethod
    def _clean(cls, value):
        if isinstance(value, (int, np.integer)):
            return int(value)
        if isinstance(value, (float, np.floating)):
            return float(value) if math.isfinite(float(value)) else None
        if isinstance(value, dict):
            return {key: cls._clean(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [cls._clean(item) for item in value]
        return value

    def dumps(self, obj, **kwargs):
        return super().dumps(self._clean(obj), **kwargs)


app.json = StrictJSONProvider(app)
# Emit real UTF-8 (e.g. "El Niño") instead of \uXXXX escapes in API responses.
app.json.ensure_ascii = False
app.json.sort_keys = False

# ---------------------------------------------------------------------------
# Load trained models & feature definitions
# ---------------------------------------------------------------------------
temperature_model = joblib.load(MODEL_FOLDER / "Temperature_Prediction_Model.pkl")
rainfall_model = joblib.load(MODEL_FOLDER / "Rainfall_Prediction_Model.pkl")
feature_columns = joblib.load(MODEL_FOLDER / "Model_Feature_Columns.pkl")

# Load historical risk percentiles
threshold_df = pd.read_csv(REPORT_FOLDER / "Step13_Historical_Thresholds.csv")
thresholds = dict(zip(threshold_df["Metric"], threshold_df["Threshold"]))

# Initialize climate data store & SHAP explainers safely
store = ClimateStore(PROJECT)
background = store.features[feature_columns].sample(
    n=min(80, len(store.features)), random_state=42
)
explainers = None
if ShapExplainers is not None:
    try:
        explainers = ShapExplainers(temperature_model, rainfall_model, background)
    except Exception as _exp_init_err:
        explainers = None
district_service = DistrictIntelligenceService(PROJECT, store)

# ---------------------------------------------------------------------------
# Load district rainfall data (1991–2020) for District Explorer
# ---------------------------------------------------------------------------
_district_stats_cache = None
_district_annual_cache = None


def _flood_risk_from_max(max_daily: float) -> str:
    """Simple relative flood indicator based on the largest gauge event."""
    if max_daily > 100:
        return "Very High"
    if max_daily > 50:
        return "High"
    return "Moderate"


def _district_data_quality(total_obs, years_observed) -> dict:
    """Flag districts whose gauge sample is too thin for a stable annual mean."""
    try:
        observations = int(total_obs or 0)
    except (TypeError, ValueError):
        observations = 0
    try:
        years = int(years_observed or 0)
    except (TypeError, ValueError):
        years = 0

    if observations < 365 or years < 5:
        return {
            "level": "sparse",
            "label": "Sparse sample",
            "message": (
                f"Only {observations:,} gauge observation(s) across {years} year(s). "
                "Annual totals and risk labels are indicative only and may not "
                "represent the district's long-term climate."
            ),
        }
    if years < 10:
        return {
            "level": "limited",
            "label": "Limited sample",
            "message": (
                f"{observations:,} gauge observations across {years} year(s). "
                "Treat annual totals as indicative of the sampled period only."
            ),
        }
    return {
        "level": "good",
        "label": "Adequate sample",
        "message": (
            f"{observations:,} gauge observations across {years} year(s) of "
            "the 1991–2020 IMD record."
        ),
    }


def _load_district_data():
    """Load and enrich the 25-district IMD raingauge summary once at startup."""
    global _district_stats_cache, _district_annual_cache
    if _district_stats_cache is not None:
        return

    stats_csv = POWERBI_FOLDER / "Karnataka_District_Rainfall_Stats.csv"
    annual_csv = POWERBI_FOLDER / "Karnataka_District_Annual_Rainfall.csv"

    if stats_csv.exists() and annual_csv.exists():
        stats = pd.read_csv(stats_csv)
        annual = pd.read_csv(annual_csv)

        # The legacy summary CSV omitted flood_risk; derive it rather than
        # leaving blank badges in the District Explorer.
        derived_flood = stats["max_daily"].apply(_flood_risk_from_max)
        if "flood_risk" in stats.columns:
            stats["flood_risk"] = stats["flood_risk"].fillna(derived_flood)
        else:
            stats["flood_risk"] = derived_flood

        # District-level annual aggregates / trend (descriptive only).
        aggregates = []
        if not annual.empty and "total_mm" in annual.columns:
            for district, group in annual.groupby("district"):
                group = group.sort_values("year")
                totals = pd.to_numeric(group["total_mm"], errors="coerce").dropna()
                avg_total = float(totals.mean()) if len(totals) else None
                cv_pct = (
                    float(totals.std(ddof=0) / avg_total * 100)
                    if avg_total and len(totals) > 1
                    else None
                )
                slope = None
                if len(totals) >= 2:
                    years = group.loc[totals.index, "year"].astype(float).to_numpy()
                    slope = float(np.polyfit(years, totals.to_numpy(dtype=float), 1)[0])
                rainy_days = None
                if "rainy_days" in group.columns:
                    rainy_days = float(
                        pd.to_numeric(group["rainy_days"], errors="coerce").mean()
                    )
                aggregates.append({
                    "district_key": str(district).strip().lower(),
                    "avg_annual_mm": round(avg_total, 1) if avg_total is not None else None,
                    "annual_cv_pct": round(cv_pct, 1) if cv_pct is not None else None,
                    "rainfall_trend_mm_per_year": round(slope, 2) if slope is not None else None,
                    "avg_rainy_days": round(rainy_days, 0) if rainy_days is not None else None,
                    "years_observed": int(group["year"].nunique()),
                })

        if aggregates:
            stats["district_key"] = stats["District"].astype(str).str.strip().str.lower()
            aggregate_frame = pd.DataFrame(aggregates)
            # The generator can pre-populate the same aggregate columns; drop
            # them first so pandas does not create _x/_y duplicates.
            overlapping = [
                column for column in aggregate_frame.columns
                if column in stats.columns and column != "district_key"
            ]
            if overlapping:
                stats = stats.drop(columns=overlapping)
            stats = stats.merge(
                aggregate_frame, on="district_key", how="left"
            ).drop(columns=["district_key"])

        stats = stats.sort_values("District").reset_index(drop=True)
        stats_records = stats.round(2).to_dict(orient="records")
        for record in stats_records:
            record["total_obs"] = int(record.get("total_obs", 0))
            record["data_quality"] = _district_data_quality(
                record.get("total_obs"), record.get("years_observed")
            )
        _district_stats_cache = stats_records
        _district_annual_cache = annual.round(2).to_dict(orient="records")
        return

    # Fallback: derive directly from the raw IMD gauge file.
    raw = PROJECT / "datasets" / "raw" / "rainfall_manual_daily_karnataka_ka_1991_2020.csv"
    if not raw.exists():
        _district_stats_cache = []
        _district_annual_cache = []
        return

    df = pd.read_csv(raw)
    df["date"] = pd.to_datetime(df["Data Acquisition Time"], dayfirst=True, errors="coerce")
    df["Year"] = df["date"].dt.year
    coords = {
        "Bagalkot": (16.18, 75.70), "Belgaum": (15.85, 74.50), "Bellary": (15.14, 76.93),
        "Bidar": (17.91, 77.52), "Bijapur": (16.83, 75.72), "Chamarajanagar": (11.92, 76.94),
        "Chickballapur": (13.43, 77.73), "Chikmagalur": (13.32, 75.78),
        "Chitradurga": (14.23, 76.40), "Dakshin Kannada": (12.87, 75.00),
        "Davanagere": (14.46, 75.92), "Hassan": (13.00, 76.10), "Haveri": (14.80, 75.40),
        "Kalaburagi": (17.33, 76.82), "Kodagu": (12.33, 75.75), "Kolar": (13.13, 78.13),
        "Koppal": (15.35, 76.15), "Mysore": (12.30, 76.65), "Raichur": (16.21, 77.36),
        "Ramanagar": (12.72, 77.28), "Shimoga": (13.93, 75.57), "Tumkur": (13.34, 77.10),
        "Udupi": (13.33, 74.75), "Uttara Kannada": (14.80, 74.70), "Yadgir": (16.77, 77.13),
    }
    stats = df.groupby("District")["Manual Daily Rainfall (mm)"].agg(
        mean_daily="mean", max_daily="max", total_obs="count"
    ).reset_index()
    stats["lat"] = stats["District"].map(lambda d: coords.get(d, (15, 76))[0])
    stats["lon"] = stats["District"].map(lambda d: coords.get(d, (15, 76))[1])
    stats["years_observed"] = stats["District"].map(df.groupby("District")["Year"].nunique())
    stats["drought_risk"] = stats["mean_daily"].apply(
        lambda x: "High" if x < 5 else ("Moderate" if x < 8 else "Low")
    )
    stats["flood_risk"] = stats["max_daily"].apply(_flood_risk_from_max)
    fallback_records = stats.round(2).to_dict(orient="records")
    for record in fallback_records:
        record["data_quality"] = _district_data_quality(
            record.get("total_obs"), record.get("years_observed")
        )
    _district_stats_cache = fallback_records

    annual = df.groupby(["District", "Year"])["Manual Daily Rainfall (mm)"].agg(
        total_mm="sum", mean_mm="mean", max_mm="max"
    ).reset_index()
    annual.columns = ["district", "year", "total_mm", "mean_mm", "max_mm"]
    _district_annual_cache = annual.round(2).to_dict(orient="records")


_load_district_data()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def determine_oni_phase(oni_value: float) -> str:
    """Classify ONI index value into NOAA standard phases."""
    if oni_value >= 0.5:
        return "El Niño"
    elif oni_value <= -0.5:
        return "La Niña"
    return "Neutral"


def build_prediction(input_data: dict, include_shap: bool = False) -> dict:
    prediction_date = pd.to_datetime(input_data.get("date"), errors="coerce")
    if pd.isna(prediction_date):
        raise ValueError("Invalid prediction date format. Please supply YYYY-MM-DD.")

    missing_features = [f for f in feature_columns if f not in input_data]
    if missing_features:
        error = ValueError("Some model features are missing from input payload.")
        error.missing_features = missing_features
        raise error

    input_df = pd.DataFrame(
        [[input_data[col] for col in feature_columns]], columns=feature_columns
    )
    input_df = input_df.apply(pd.to_numeric, errors="coerce")

    if input_df.isnull().any().any():
        raise ValueError("All 32 technical features must have valid numeric values.")
    if not np.isfinite(input_df.to_numpy()).all():
        raise ValueError("Input values must be finite numerical values.")

    # Model inference
    temperature = float(temperature_model.predict(input_df)[0])
    rainfall = max(float(rainfall_model.predict(input_df)[0]), 0.0)

    # Risk classification
    temperature_level = classify_temperature(temperature, thresholds)
    rainfall_level = classify_rainfall(rainfall, thresholds)
    temp_advice = temperature_recommendations(temperature_level)
    rain_advice = rainfall_recommendations(rainfall_level)
    sector_actions = sector_adaptation_matrix(temperature_level, rainfall_level)

    oni_value = float(input_df["ONI"].iloc[0]) if "ONI" in input_df else 0.0
    oni_phase = determine_oni_phase(oni_value)

    # Heat stress index: temperature-only proxy because validated daily humidity
    # is not present in the dataset. It is deliberately labelled as a proxy.
    heat_stress_score = round(min(100, max(0, (temperature - 15) / 25 * 100)), 1)

    # Relative drought risk from the trailing 30-day rainfall percentile.
    if "Rainfall_Rolling_30" in input_df.columns:
        rain_30d = float(input_df["Rainfall_Rolling_30"].iloc[0])
    else:
        rain_30d = 0.0
    drought_risk = classify_drought(rain_30d, store.drought_thresholds_cache["rolling_30d_rainfall_percentiles"])
    drought_advice = drought_recommendations(drought_risk)

    # Automated early warning generation
    early_warnings = generate_early_warnings(
        temperature=temperature,
        rainfall=rainfall,
        temp_level=temperature_level,
        rain_level=rainfall_level,
        oni_value=oni_value,
        oni_phase=oni_phase,
        heat_stress_score=heat_stress_score,
        drought_risk=drought_risk,
        rain_30d=rain_30d,
        district="Statewide",
        date_str=str(prediction_date.date()),
    )

    # Database storage
    db_status = save_prediction_record(
        prediction_date, temperature, rainfall,
        temperature_level, rainfall_level, oni_value, temp_advice, rain_advice,
    )
    try:
        if early_warnings and early_warnings.get("alerts"):
            save_alert_records(
                prediction_date,
                early_warnings["alerts"],
                district="Statewide",
                overall_status=early_warnings.get("status", "NORMAL"),
            )
    except Exception:
        pass

    payload = {
        "status": "success",
        "date": str(prediction_date.date()),
        "predicted_temperature_C": round(temperature, 2),
        "predicted_rainfall_mm": round(rainfall, 2),
        "temperature_level": temperature_level,
        "rainfall_level": rainfall_level,
        "temperature_recommendation": temp_advice,
        "rainfall_recommendation": rain_advice,
        "sector_adaptation": sector_actions,
        "early_warnings": early_warnings,
        "oni": round(oni_value, 3),
        "oni_phase": oni_phase,
        "enso_phase": oni_phase,
        "heat_stress_score": heat_stress_score,
        "heat_stress_method": (
            "Temperature-only proxy: (T - 15) / 25 * 100 clipped to 0-100. "
            "Humidity is not available in the validated daily dataset, so this is "
            "not a clinical heat-index calculation."
        ),
        "drought_risk": drought_risk,
        "drought_recommendation": drought_advice,
        "rainfall_rolling_30d_mm": round(rain_30d, 2),
        "thresholds": thresholds,
        "database": db_status,
        "note": (
            "Risk categories are relative percentile tiers derived from 44 years of Karnataka "
            "historical observations (1981–2024). They are statistical indicators, not official "
            "government warnings or verified forecasts. ONI is a macro-scale ENSO background signal; "
            "it is not the sole cause of local weather events. Rainfall model R² is modest "
            "(≈0.23), so rainfall should be read as a directional/relative indicator."
        ),
    }

    shap_available = False
    shap_status = "SHAP EXPLAINABILITY TEMPORARILY UNAVAILABLE"
    shap_error_detail = None

    if explainers is not None and getattr(explainers, "is_available", False):
        shap_available = True
        shap_status = "OPERATIONAL"
    elif explainers is not None and getattr(explainers, "error_reason", None):
        shap_error_detail = explainers.error_reason
        if getattr(explainers, "is_policy_blocked", False):
            shap_status = "SHAP EXPLAINABILITY TEMPORARILY UNAVAILABLE (BLOCKED BY WINDOWS POLICY)"
    else:
        shap_error_detail = "SHAP explainability engine could not be initialized."

    payload["shap_available"] = shap_available
    payload["shap_status"] = shap_status
    if not shap_available:
        payload["shap_message"] = (
            "Windows Smart App Control or an Application Control policy has blocked a compiled dependency. "
            "Model predictions, multi-hazard tiers, and early warnings remain fully operational."
        )
        if shap_error_detail:
            payload["shap_error_detail"] = shap_error_detail

    if include_shap:
        if shap_available and explainers is not None:
            try:
                temp_shap = explainers.temperature_shap(input_df)
                rain_shap = explainers.rainfall_shap(input_df)
                payload["shap"] = {"temperature": temp_shap, "rainfall": rain_shap}
            except Exception as exc:
                payload["shap"] = {"temperature": [], "rainfall": []}
                payload["shap_available"] = False
                payload["shap_status"] = "SHAP EXPLAINABILITY TEMPORARILY UNAVAILABLE"
                payload["shap_error_detail"] = str(exc)
        else:
            payload["shap"] = {"temperature": [], "rainfall": []}

    return payload


# ===========================================================================
# VIEW ROUTES (HTML pages)
# ===========================================================================

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/climate")
def climate():
    return render_template("climate.html")

@app.route("/predict")
def predict_page():
    return render_template("predict.html")

@app.route("/explain")
def explain():
    return render_template("explain.html")

@app.route("/adaptation")
def adaptation():
    return render_template("adaptation.html")

@app.route("/history")
def history_page():
    return render_template("history.html")

@app.route("/chat")
def chat_page():
    return render_template("chat.html")

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/district")
def district_page():
    return render_template("district.html")

@app.route("/risk")
def risk_page():
    return render_template("risk.html")

@app.route("/drought")
def drought_page():
    return render_template("drought.html")

@app.route("/methodology")
def methodology_page():
    return render_template("methodology.html")

@app.route("/alerts")
@app.route("/early-warning")
def alerts_page():
    return render_template("alerts.html")

@app.route("/district-intelligence")
def district_intelligence_page():
    return render_template("district_intelligence.html")

@app.route("/flood")
def flood_page():
    return render_template("flood.html")

@app.route("/enso")
def enso_page():
    return render_template("enso.html")

@app.route("/gis")
def gis_page():
    return render_template("district.html")

@app.route("/analytics")
def analytics_page():
    return render_template("explain.html")


# ---------------------------------------------------------------------------
# Advanced Modules (Six New Centers)
# ---------------------------------------------------------------------------
@app.route("/algorithm-lab")
def algorithm_lab_page():
    return render_template("algorithm_lab.html")

@app.route("/live-climate")
def live_climate_page():
    return render_template("live_climate.html")

@app.route("/explainable-ai")
def explainable_ai_page():
    return render_template("explainable_ai.html")

@app.route("/scenario-simulator")
def scenario_simulator_page():
    return render_template("scenario_simulator.html")

@app.route("/ensemble-prediction")
def ensemble_prediction_page():
    return render_template("ensemble_prediction.html")

@app.route("/model-monitoring")
def model_monitoring_page():
    return render_template("model_monitoring.html")

@app.route("/settings")
def settings_page():
    return render_template("settings.html")

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/register")
def register_page():
    return render_template("register.html")

@app.route("/user-dashboard")
def user_dashboard_page():
    return render_template("user_dashboard.html")

@app.route("/admin")
def admin_page():
    user_role = session.get("role")
    if user_role == "USER":
        return redirect("/user-dashboard?msg=unauthorized_admin_access")
    return render_template("admin.html")

@app.route("/sw.js")
def service_worker():
    sw_file = PROJECT / "frontend" / "static" / "js" / "sw.js"
    res = Response(sw_file.read_text(encoding="utf-8"), mimetype="application/javascript")
    res.headers["Service-Worker-Allowed"] = "/"
    res.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return res


# ===========================================================================
# REST API ENDPOINTS
# ===========================================================================

@app.route("/api", methods=["GET"])
def api_info():
    return jsonify({
        "project": "AI-Driven El Niño-Aware Urban Heat Risk Prediction and Adaptation Planning System for Karnataka",
        "version": "2.5",
        "endpoints": [
            "GET  /api/health", "GET  /api/features", "GET  /api/dashboard", "GET  /api/enso",
            "GET  /api/shap", "GET  /api/history", "GET  /api/export-history-csv",
            "GET  /api/district", "GET  /api/district/<name>",
            "GET  /api/risk-thresholds", "GET  /api/drought-thresholds",
            "GET  /api/recommendations", "GET  /api/methodology",
            "GET  /api/alerts", "GET  /api/early-warnings",
            "POST /api/predict", "POST /api/predict-from-date", "POST /api/chat",
        ],
        "data_range": {"min": store.date_min, "max": store.date_max},
        "feature_count": len(feature_columns),
        "prediction_horizon": "next day (features from day D target day D+1)",
        "disclaimer": "Statistical risk indicators, not official warnings.",
    })


@app.route("/api/health", methods=["GET"])
def health():
    db_health = check_db_health()
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    db_connected = db_health.get("status") == "connected"
    persistence_mode = (
        "mysql"
        if db_connected
        else ("sqlite_local" if db_health.get("status") == "sqlite_local" else "csv_report_fallback")
    )
    is_shap_avail = explainers.is_available if explainers else False
    shap_status_str = "operational" if is_shap_avail else "SHAP EXPLAINABILITY TEMPORARILY UNAVAILABLE"
    shap_reason = None
    if not is_shap_avail:
        if explainers and getattr(explainers, "error_reason", None):
            shap_reason = explainers.error_reason
        elif SHAP_ERROR:
            shap_reason = SHAP_ERROR
        else:
            shap_reason = "SHAP library could not be loaded."

    return jsonify({
        "status": "operational",
        "persistence": persistence_mode,
        "database": db_health,
        "gemini": "configured (live)" if gemini_key else "offline domain engine",
        "shap": {
            "available": is_shap_avail,
            "status": shap_status_str,
            "policy_blocked": getattr(explainers, "is_policy_blocked", False) if explainers else SHAP_BLOCKED_BY_POLICY,
            "reason": shap_reason,
        },
        "models": {
            "temperature": "Temperature_Prediction_Model.pkl (Linear Regression, R²=0.94)",
            "rainfall": "Rainfall_Prediction_Model.pkl (Gradient Boosting, R²=0.23)",
            "loaded": True,
            "feature_count": len(feature_columns),
            "base_feature_count": len(feature_columns),
        },
        "records": {
            "min": store.date_min,
            "max": store.date_max,
            "total": len(store.features),
            "weather_rows": len(store.weather),
        },
        "disclaimer": "Risk tiers are relative historical percentiles, not official warnings.",
    })


@app.route("/api/alerts", methods=["GET"])
@app.route("/api/early-warnings", methods=["GET"])
def get_early_warnings():
    """Return automated early warning bulletins across all 31 districts or for a specific district."""
    date_param = request.args.get("date")
    if not date_param:
        date_param = store.date_max
    district_param = request.args.get("district")

    feature_row = store.feature_row(date_param)
    if feature_row is None:
        return jsonify({
            "status": "error",
            "message": f"Date {date_param} not found in historical records. Choose between {store.date_min} and {store.date_max}."
        }), 404

    # If a specific district is requested
    if district_param and district_param.strip().lower() not in ["statewide", "all"]:
        canonical = district_service.get_canonical_name(district_param.strip())
        if not canonical:
            return jsonify({
                "status": "error",
                "message": f"District '{district_param}' is unrecognized. Must be one of 31 Karnataka districts.",
            }), 404

        detail = district_service.get_district_detail(canonical, simulated_date=date_param)
        meta = district_service.registry.get(canonical, {})
        prof = detail.get("profile", {})
        ai = detail.get("ai_predictions", {})
        risk_mon = detail.get("risk_monitoring", {})
        clima = meta.get("climatology", {})
        has_gauge = canonical in CANONICAL_TO_RAW_DISTRICTS

        pred_temp = float(ai.get("predicted_temperature_c", 25.0))
        pred_rain = float(ai.get("predicted_rainfall_mm", 5.0))
        heat_risk = str(ai.get("heat_risk_level", "Moderate"))
        rain_risk = str(ai.get("rainfall_risk_level", "Normal"))
        drought_risk = str(risk_mon.get("drought_risk_level", "Low"))
        oni_val = float(risk_mon.get("oni_background_index", 0.43))
        oni_phase = str(risk_mon.get("enso_background_phase", "Neutral"))
        heat_score = float(risk_mon.get("extreme_heat_index", 30.0))

        dist_warnings = generate_early_warnings(
            temperature=pred_temp,
            rainfall=pred_rain,
            temp_level=heat_risk,
            rain_level=rain_risk,
            oni_value=oni_val,
            oni_phase=oni_phase,
            heat_stress_score=heat_score,
            drought_risk=drought_risk,
            rain_30d=5.0 if drought_risk == "High" else 25.0,
            district=canonical,
            climatology=clima,
            has_gauge_data=has_gauge,
            elevation_m=meta.get("elevation_m"),
            date_str=date_param,
        )

        try:
            save_alert_records(
                date_param,
                dist_warnings.get("alerts", []),
                district=canonical,
                overall_status=dist_warnings.get("status", "NORMAL"),
            )
        except Exception:
            pass

        return jsonify({
            "status": "success",
            "date": date_param,
            "district": canonical,
            "profile": prof,
            "early_warnings": dist_warnings,
            "summary": {
                "predicted_temperature_C": pred_temp,
                "predicted_rainfall_mm": pred_rain if has_gauge else None,
                "has_gauge_data": has_gauge,
                "temperature_level": heat_risk,
                "rainfall_level": rain_risk,
                "oni": oni_val,
                "oni_phase": oni_phase,
                "drought_risk": drought_risk,
            },
        })

    # Default / Statewide mode: synthesize statewide prediction AND evaluate all 31 districts
    payload = build_prediction({"date": date_param, **feature_row.to_dict()}, include_shap=False)
    statewide_ew = payload.get("early_warnings", {})

    all_dist_data = generate_all_districts_early_warnings(district_service, date_param)

    # Persist statewide alerts
    try:
        save_alert_records(
            date_param,
            statewide_ew.get("alerts", []),
            district="Statewide",
            overall_status=statewide_ew.get("status", "NORMAL"),
        )
    except Exception:
        pass

    # Also persist active district alerts to database audit log
    try:
        dist_status_map = {d["district"]: d["status"] for d in all_dist_data.get("district_summaries", [])}
        for a in all_dist_data.get("active_alerts", []):
            save_alert_records(
                date_param,
                [a],
                district=a.get("district", "Statewide"),
                overall_status=a.get("overall_status") or dist_status_map.get(a.get("district", "Statewide"), "ADVISORY"),
            )
    except Exception:
        pass

    return jsonify({
        "status": "success",
        "date": date_param,
        "district": "Statewide",
        "early_warnings": statewide_ew,
        "summary": {
            "predicted_temperature_C": payload.get("predicted_temperature_C"),
            "predicted_rainfall_mm": payload.get("predicted_rainfall_mm"),
            "temperature_level": payload.get("temperature_level"),
            "rainfall_level": payload.get("rainfall_level"),
            "oni": payload.get("oni"),
            "oni_phase": payload.get("oni_phase"),
            "drought_risk": payload.get("drought_risk"),
        },
        "risk_matrix": all_dist_data.get("matrix_distribution"),
        "status_counts": all_dist_data.get("status_counts"),
        "district_summaries": all_dist_data.get("district_summaries"),
    })


@app.route("/api/alerts/history", methods=["GET"])
def get_alerts_history():
    """Retrieve persistent alert audit records with filtering across date, district, and severity."""
    limit = int(request.args.get("limit", 100))
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    district = request.args.get("district")
    severity = request.args.get("severity")
    category = request.args.get("category")
    status = request.args.get("status")

    records = fetch_alert_history(
        limit=limit,
        start_date=start_date,
        end_date=end_date,
        district=district,
        severity=severity,
        category=category,
        status=status,
    )
    return jsonify({
        "status": "success",
        "count": len(records),
        "records": records,
    })


@app.route("/api/alerts/export", methods=["GET"])
def export_alerts():
    """Export filtered historical early warnings in standardized CSV format."""
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    district = request.args.get("district")
    severity = request.args.get("severity")

    csv_data = export_alerts_csv(
        start_date=start_date,
        end_date=end_date,
        district=district,
        severity=severity,
    )
    filename = f"Karnataka_Early_Warnings_{district or 'Statewide'}.csv".replace(" ", "_")
    return Response(
        csv_data,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.route("/api/alerts/matrix", methods=["GET"])
def get_risk_matrix():
    """Return dynamic 4x4 risk matrix distributions across all 31 districts for a given date."""
    date_param = request.args.get("date") or store.date_max
    all_dist = generate_all_districts_early_warnings(district_service, date_param)
    return jsonify({
        "status": "success",
        "date": date_param,
        "matrix_distribution": all_dist.get("matrix_distribution"),
        "status_counts": all_dist.get("status_counts"),
    })


@app.route("/api/features", methods=["GET"])
def features():
    return jsonify({
        "feature_columns": list(feature_columns),
        "feature_count": len(feature_columns),
        "total_features": len(feature_columns),
        "date_range": {"min": store.date_min, "max": store.date_max},
        "thresholds": thresholds,
        "feature_groups": {
            "calendar": [
                "Year", "Month", "Day", "Day_of_Year", "Day_of_Week",
                "Month_Sin", "Month_Cos", "DayOfYear_Sin", "DayOfYear_Cos",
            ],
            "enso": ["ONI", "ONI_Lag_30", "El_Nino", "La_Nina", "Neutral"],
            "temperature_lags": [f"Temperature_Lag_{n}" for n in (1, 2, 3, 7, 14, 30)],
            "rainfall_lags": [f"Rainfall_Lag_{n}" for n in (1, 2, 3, 7, 14, 30)],
            "rolling": [
                "Temperature_Rolling_7", "Temperature_Rolling_14", "Temperature_Rolling_30",
                "Rainfall_Rolling_7", "Rainfall_Rolling_14", "Rainfall_Rolling_30",
            ],
        },
        "note": "Features are automatically extracted. Users do not need to supply them manually.",
    })


@app.route("/api/enso", methods=["GET"])
def enso_api():
    """Return comprehensive NOAA ONI teleconnection intelligence (1950–2026)."""
    year_param = request.args.get("year")
    phase_param = request.args.get("phase")
    return jsonify(store.get_enso_data(year=year_param, phase=phase_param))


@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    return jsonify(store.dashboard_cache)


@app.route("/api/shap", methods=["GET"])
def shap_global():
    data = store.shap_data()
    is_avail = explainers.is_available if explainers else False
    data["shap_available"] = is_avail
    data["shap_status"] = "OPERATIONAL" if is_avail else "SHAP EXPLAINABILITY TEMPORARILY UNAVAILABLE"
    if not is_avail:
        data["shap_note"] = (
            "Windows Smart App Control or an Application Control policy has blocked dynamic SHAP compiled binaries. "
            "Verified global feature importance rankings are served directly from certified training benchmark evaluation records."
        )
    return jsonify(data)


@app.route("/api/history", methods=["GET"])
def history():
    limit_arg = request.args.get("limit", 50)
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    try:
        limit = max(1, min(int(limit_arg), 1000))
    except ValueError:
        limit = 50

    db_rows = fetch_prediction_history(limit=limit, start_date=start_date, end_date=end_date)
    if db_rows is not None and len(db_rows) > 0:
        db_source = db_rows[0].get("source", "database")
        return jsonify({"source": db_source, "count": len(db_rows), "rows": db_rows})
    fallback_rows = store.history_rows(limit=limit, start_date=start_date, end_date=end_date)
    return jsonify({"source": "csv_report_fallback", "count": len(fallback_rows), "rows": fallback_rows})


@app.route("/api/export-history-csv", methods=["GET"])
def export_history_csv():
    limit_arg = request.args.get("limit", 1000)
    try:
        limit = max(1, min(int(limit_arg), 5000))
    except ValueError:
        limit = 1000
    db_rows = fetch_prediction_history(limit=limit)
    rows = db_rows if (db_rows is not None and len(db_rows) > 0) else store.history_rows(limit=limit)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Predicted_Temperature_C", "Predicted_Rainfall_mm",
                     "Relative_Temperature_Level", "Relative_Rainfall_Level", "ONI",
                     "Temperature_Recommendation", "Rainfall_Recommendation"])
    for r in rows:
        writer.writerow([r.get("date"), r.get("predicted_temperature_C"),
                         r.get("predicted_rainfall_mm"), r.get("temperature_level"),
                         r.get("rainfall_level"), r.get("oni"),
                         r.get("temperature_recommendation", ""),
                         r.get("rainfall_recommendation", "")])
    return Response(output.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment;filename=Karnataka_Climate_Predictions.csv"})


@app.route("/api/district", methods=["GET"])
def district_list():
    """Return all 25 Karnataka district rainfall statistics."""
    return jsonify({
        "districts": _district_stats_cache,
        "count": len(_district_stats_cache),
        "source": "IMD Manual Raingauge Network 1991–2020",
        "note": (
            "District rainfall data is from IMD manual daily raingauge stations (1991–2020). "
            "It represents measured rainfall observations at specific gauge locations, "
            "not statewide AI model predictions. Districts flagged 'Sparse sample' have "
            "too few gauge observations for a stable annual climatology."
        ),
    })


@app.route("/api/districts-full", methods=["GET"])
def api_districts_full():
    """Return all 31 Karnataka districts with complete geographical and risk attributes."""
    districts = district_service.get_all_districts()
    return jsonify({
        "status": "success",
        "count": len(districts),
        "districts": districts,
        "source": "IMD Raingauge Network & Climatological Surface Model (31 Districts)",
    })


@app.route("/api/district/compare", methods=["POST"])
def api_district_compare():
    """Compare two or more districts across meteorological parameters."""
    data = request.get_json(silent=True) or {}
    names = data.get("districts")
    if not names:
        candidates = []
        for k in ["district_a", "district_b", "district1", "district2"]:
            if k in data and data[k]:
                candidates.append(data[k])
        if candidates:
            names = candidates
    if not isinstance(names, list) or len(names) < 1:
        return jsonify({"error": "Please provide a list of at least one district to compare."}), 400
    res = district_service.compare_districts(names)
    return jsonify(res)


@app.route("/api/district/<district_name>", methods=["GET"])
def district_detail(district_name):
    """Return comprehensive climate intelligence report for a specific district."""
    detail = district_service.get_district_detail(district_name)
    if not detail:
        return jsonify({"error": f"District '{district_name}' not found in registry."}), 404

    canonical = detail["district"]
    raw_name = detail["profile"].get("provenance", "")
    
    # Locate stats entry if available
    stats = next((r for r in _district_stats_cache
                  if r.get("District", "").lower() in [district_name.strip().lower(), canonical.lower()]), None)

    quality = (stats or {}).get("data_quality") or {}
    note = f"IMD raingauge data (1991–2020) & Downscaled Climatology: {detail['profile']['data_status']}."
    if quality.get("message"):
        note = f"{note} Data quality: {quality['message']}"

    annual_series = detail["historical_analytics"]["annual_series"]

    response_payload = {
        "status": "success",
        "district": canonical,
        "stats": stats or detail["profile"],
        "annual_series": annual_series,
        "note": note,
        "profile": detail["profile"],
        "weather": detail["weather"],
        "ai_predictions": detail["ai_predictions"],
        "risk_monitoring": detail["risk_monitoring"],
        "early_warnings": detail["early_warnings"],
        "historical_analytics": detail["historical_analytics"],
        "adaptation_recommendations": detail["adaptation_recommendations"],
    }
    return jsonify(response_payload)


@app.route("/api/risk-thresholds", methods=["GET"])
def risk_thresholds():
    """Return pre-computed historical percentile thresholds and tier shares.

    The aggregates are calculated once in ``ClimateStore.__init__`` with
    vectorised NumPy masks, so this endpoint no longer walks the full weather
    table on every request.
    """
    return jsonify(store.risk_thresholds_data())


@app.route("/api/drought-thresholds", methods=["GET"])
def drought_thresholds():
    """Return historical 30-day rainfall percentiles and district drought context."""
    payload = dict(store.drought_data())
    counts = {"High": 0, "Moderate": 0, "Low": 0}
    for district in _district_stats_cache:
        level = district.get("drought_risk")
        if level in counts:
            counts[level] += 1
    payload["district_drought_counts"] = counts
    payload["driest_districts"] = sorted(
        (
            {
                "district": d.get("District"),
                "mean_daily_mm": d.get("mean_daily"),
                "drought_risk": d.get("drought_risk"),
            }
            for d in _district_stats_cache
        ),
        key=lambda item: item["mean_daily_mm"] if item["mean_daily_mm"] is not None else 0,
    )[:5]
    payload["source"] = "Statewide 1981–2024 daily record; IMD raingauge 1991–2020 for districts"
    return jsonify(payload)


@app.route("/api/recommendations", methods=["GET"])
def recommendations():
    """Return adaptation guidance for a selected scenario or the full matrix."""
    temperature_level = request.args.get("temperature_level")
    rainfall_level = request.args.get("rainfall_level")
    valid_temp = {"Low", "Moderate", "High", "Very High"}
    valid_rain = {"Low", "Normal", "High", "Very High"}

    if temperature_level and temperature_level not in valid_temp:
        return jsonify({"error": f"Invalid temperature_level. Choose from {sorted(valid_temp)}"}), 400
    if rainfall_level and rainfall_level not in valid_rain:
        return jsonify({"error": f"Invalid rainfall_level. Choose from {sorted(valid_rain)}"}), 400

    if temperature_level or rainfall_level:
        temp_level = temperature_level or "Moderate"
        rain_level = rainfall_level or "Normal"
        return jsonify({
            "scenario": {
                "temperature_level": temp_level,
                "rainfall_level": rain_level,
                "temperature_advice": temperature_recommendations(temp_level),
                "rainfall_advice": rainfall_recommendations(rain_level),
                "sector_matrix": sector_adaptation_matrix(temp_level, rain_level),
            },
            "thresholds": thresholds,
            "disclaimer": "Planning guidance only; follow official IMD/KSNDMC advisories.",
        })

    return jsonify({
        "temperature_levels": {
            level: temperature_recommendations(level) for level in valid_temp
        },
        "rainfall_levels": {
            level: rainfall_recommendations(level) for level in valid_rain
        },
        "sector_examples": {
            f"{temp}/{rain}": sector_adaptation_matrix(temp, rain)
            for temp in sorted(valid_temp)
            for rain in sorted(valid_rain)
        },
        "thresholds": thresholds,
        "disclaimer": "Planning guidance only; follow official IMD/KSNDMC advisories.",
    })


@app.route("/api/methodology", methods=["GET"])
def methodology():
    """Return machine-readable methodology and dataset provenance metadata."""
    top_temp = sorted(
        store.shap_data().get("temperature_ranked", []),
        key=lambda item: item["importance"],
        reverse=True,
    )[:5]
    top_rain = sorted(
        store.shap_data().get("rainfall_ranked", []),
        key=lambda item: item["importance"],
        reverse=True,
    )[:5]
    return jsonify({
        "project": "AI-Driven El Niño-Aware Urban Heat Risk Prediction and Adaptation Planning System for Karnataka",
        "prediction_horizon": "Next-day mean temperature (°C) and rainfall (mm)",
        "datasets": [
            {
                "name": "Karnataka statewide daily weather",
                "file": "datasets/processed/Karnataka_Final_Cleaned_Dataset.csv",
                "rows": int(len(store.weather)),
                "date_range": {
                    "min": str(store.weather["Date"].min().date()),
                    "max": str(store.weather["Date"].max().date()),
                },
                "source": "IMD/ERA5-derived state series used in the project notebook",
            },
            {
                "name": "NOAA Oceanic Niño Index",
                "file": "datasets/processed/NOAA_ONI_Cleaned.csv",
                "rows": int(len(store.oni)),
                "date_range": {
                    "min": str(store.oni["Date"].min().date()),
                    "max": str(store.oni["Date"].max().date()),
                },
                "source": "NOAA CPC ONI (ERSST.v5 Niño 3.4, 3-month running mean)",
            },
            {
                "name": "Engineered modelling table",
                "file": "datasets/processed/Karnataka_Feature_Engineered_Dataset.csv",
                "rows": int(len(store.features)),
                "date_range": {"min": store.date_min, "max": store.date_max},
                "features": len(feature_columns),
            },
            {
                "name": "IMD district raingauge summary",
                "file": "powerbi/Karnataka_District_Rainfall_Stats.csv",
                "districts": len(_district_stats_cache),
                "date_range": {"min": "1991", "max": "2020"},
                "note": "Descriptive district rainfall only; not used as model training input.",
            },
        ],
        "feature_count": len(feature_columns),
        "feature_columns": list(feature_columns),
        "models": store.dashboard_cache.get("evaluation", []),
        "risk_thresholds": thresholds,
        "shap": {
            "temperature_method": "LinearExplainer on StandardScaler + LinearRegression",
            "rainfall_method": "TreeExplainer on GradientBoostingRegressor",
            "top_temperature_features": top_temp,
            "top_rainfall_features": top_rain,
        },
        "preprocessing": [
            "Date parsing and duplicate removal",
            "ONI joined on Year + Month and forward-filled within month",
            "Lag features use past-only shift(n); targets use next-day shift(-1)",
            "Chronological 80/20 train-test split (no random shuffling)",
            "31 leading rows dropped because 30-day lags are unavailable",
        ],
        "limitations": [
            "Rainfall R² is ≈0.23; rainfall output is a relative indicator, not an exact forecast.",
            "The ML models use statewide daily aggregates, not gridded or per-ward observations.",
            "Humidity is absent, so heat stress is a temperature-only proxy, not a clinical heat index.",
            "District raingauge data spans 1991–2020 and is not a district-level ML prediction.",
            "Risk tiers are historical percentiles, not official IMD/KSNDMC warnings.",
            "ENSO/ONI is a macro-scale teleconnection, not the sole cause of local weather.",
        ],
        "references": [
            "NOAA Climate Prediction Center — Oceanic Niño Index (ONI)",
            "India Meteorological Department — rainfall and temperature records",
            "Karnataka State Natural Disaster Monitoring Centre (KSNDMC) — drought context",
            "Lundberg & Lee (2017) — A Unified Approach to Interpreting Model Predictions (SHAP)",
        ],
    })


@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        input_data = request.get_json(silent=True)
        if not isinstance(input_data, dict):
            return jsonify({"error": "Please provide valid JSON input."}), 400
        if "date" not in input_data:
            return jsonify({"error": "A prediction date ('date': 'YYYY-MM-DD') is required."}), 400
        return jsonify(build_prediction(input_data, include_shap=False))
    except ValueError as error:
        payload = {"error": str(error)}
        if hasattr(error, "missing_features"):
            payload["missing_features"] = error.missing_features
        return jsonify(payload), 400
    except Exception as error:
        return jsonify({"status": "error", "message": str(error)}), 500


@app.route("/api/predict-from-date", methods=["POST"])
def predict_from_date():
    try:
        body = request.get_json(silent=True) or {}
        date_value = body.get("date")
        if not date_value:
            return jsonify({"error": "A valid prediction date is required."}), 400

        feature_stamp = pd.to_datetime(date_value, errors="coerce")
        if pd.isna(feature_stamp):
            return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

        row = store.feature_row(feature_stamp)
        if row is None:
            return jsonify({
                "error": f"Date '{date_value}' is outside the engineered dataset range.",
                "date_range": {"min": store.date_min, "max": store.date_max},
                "hint": (
                    "Please select an observation date between "
                    f"{store.date_min} and {store.date_max}; the model then predicts "
                    "the following day."
                ),
            }), 404

        # The engineered table stores features on day D and targets for day D+1.
        # Therefore the payload's `date` is the forecast target date, while
        # `observation_date` records the feature/source date.
        target_stamp = feature_stamp + pd.Timedelta(days=1)
        input_data = {"date": str(target_stamp.date())}
        for column in feature_columns:
            input_data[column] = float(row[column])

        payload = build_prediction(input_data, include_shap=True)
        payload["observation_date"] = str(feature_stamp.date())
        payload["target_date"] = str(target_stamp.date())
        payload["prediction_horizon_days"] = 1
        payload["features_source"] = "Karnataka_Feature_Engineered_Dataset.csv"
        payload["features_used"] = {
            column: round(float(input_data[column]), 4) for column in feature_columns
        }
        return jsonify(payload)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        return jsonify({"status": "error", "message": str(error)}), 500


@app.route("/api/chat", methods=["POST"])
def chat():
    body = request.get_json(silent=True) or {}
    message = str(body.get("message", "")).strip()
    if not message:
        return jsonify({"error": "Please provide a non-empty question."}), 400
    extra = (
        f"Karnataka record: {store.date_min} to {store.date_max}. "
        f"Mean daily temp: {store.dashboard_cache['summary']['mean_temperature']} C, "
        f"Mean daily rain: {store.dashboard_cache['summary']['mean_rainfall']} mm. "
        "Temperature model R2=0.94, Rainfall model R2=0.23. Risk categories based on P50, P75, P90."
    )
    result = chat_reply(message, extra_context=extra, project_root=PROJECT)
    return jsonify(result)



# ---------------------------------------------------------------------------
# MODULE 1: ML ALGORITHM COMPARISON LAB
# ---------------------------------------------------------------------------
@app.route("/api/algorithm-lab/evaluate", methods=["GET", "POST"])
def api_algorithm_lab_evaluate():
    target = request.args.get("target") or (request.get_json(silent=True) or {}).get("target", "temperature")
    task_type = request.args.get("task_type") or (request.get_json(silent=True) or {}).get("task_type", "regression")
    force_retrain = request.args.get("force_retrain", "false").lower() in ("true", "1", "yes")
    svc = get_algorithm_lab_service(PROJECT)
    if task_type == "classification":
        target_col = "Target_Heat_Hazard"
        res = svc.evaluate_classification(target=target_col)
    else:
        target_col = "Target_Next_Day_Rainfall" if "rain" in str(target).lower() else "Target_Next_Day_Temperature"
        res = svc.evaluate_regression(target=target_col, force_retrain=force_retrain)
    models_dict = {}
    for item in res.get("results", []):
        if isinstance(item, dict) and "algorithm" in item:
            models_dict[item["algorithm"]] = item
    res["models"] = models_dict
    return jsonify(res)


@app.route("/api/algorithm-lab/history", methods=["GET"])
def api_algorithm_lab_history():
    target = request.args.get("target")
    records = fetch_algorithm_evaluations(target=target, limit=30)
    return jsonify({"status": "success", "target": target, "count": len(records), "records": records})


@app.route("/api/algorithm-lab/cross-validate", methods=["POST"])
def api_algorithm_lab_cross_validate():
    body = request.get_json(silent=True) or {}
    target = body.get("target", "temperature")
    algorithm = body.get("algorithm", "Linear Regression")
    task_type = body.get("task_type", "regression")
    n_splits = int(body.get("n_splits", 5))
    svc = get_algorithm_lab_service(PROJECT)
    target_col = "Target_Next_Day_Rainfall" if "rain" in str(target).lower() else ("Target_Heat_Hazard" if task_type == "classification" else "Target_Next_Day_Temperature")
    res = svc.run_cross_validation(target=target_col, algorithm=algorithm, task_type=task_type, n_splits=n_splits)
    return jsonify(res)


@app.route("/api/algorithm-lab/compare", methods=["POST"])
def api_algorithm_lab_compare():
    body = request.get_json(silent=True) or {}
    target = body.get("target", "temperature")
    algorithms = body.get("algorithms")
    if not algorithms or not isinstance(algorithms, list) or len(algorithms) < 2:
        return jsonify({
            "status": "error",
            "message": "Please select at least 2 algorithms to compare."
        }), 400

    svc = get_algorithm_lab_service(PROJECT)
    try:
        res = svc.compare_algorithms(target=target, algorithms=algorithms)
        return jsonify(res)
    except ValueError as val_err:
        return jsonify({"status": "error", "message": str(val_err)}), 400
    except Exception as err:
        return jsonify({"status": "error", "message": str(err)}), 500


@app.route("/api/algorithm-lab/active-model", methods=["GET", "POST"])
def api_algorithm_lab_active_model():
    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        target = body.get("target", "temperature")
        algorithm_name = body.get("algorithm_name") or body.get("algorithm")
        metrics = body.get("metrics") or {}
        if not algorithm_name:
            return jsonify({"status": "error", "message": "Algorithm name is required."}), 400

        success = save_active_model_selection(target=target, algorithm_name=algorithm_name, metrics=metrics)
        active = fetch_active_model_selection(target=target)
        if "selection_timestamp" in active and hasattr(active["selection_timestamp"], "isoformat"):
            active["selection_timestamp"] = active["selection_timestamp"].isoformat()
        return jsonify({
            "status": "success",
            "message": f"Successfully activated {algorithm_name} as the production model for {target}.",
            "active_model": active,
            "persisted": success,
        })
    else:
        target = request.args.get("target", "temperature")
        active = fetch_active_model_selection(target=target)
        if "selection_timestamp" in active and hasattr(active["selection_timestamp"], "isoformat"):
            active["selection_timestamp"] = active["selection_timestamp"].isoformat()
        return jsonify({
            "status": "success",
            "target": target,
            "active_model": active,
        })


# ---------------------------------------------------------------------------
# MODULE 2: LIVE CLIMATE DATA CENTRE
# ---------------------------------------------------------------------------
@app.route("/api/live-climate/current", methods=["GET"])
def api_live_climate_current():
    district = request.args.get("district", "Bengaluru Urban")
    fc_svc = get_forecast_service()
    res = fc_svc.get_district_forecast(district)
    return jsonify(res)


@app.route("/api/live-climate/statewide", methods=["GET"])
def api_live_climate_statewide():
    fc_svc = get_forecast_service()
    res = fc_svc.get_all_districts_overview()
    return jsonify(res)


# ---------------------------------------------------------------------------
# MODULE 3: EXPLAINABLE AI CENTRE
# ---------------------------------------------------------------------------
@app.route("/api/explainable-ai/summary", methods=["GET"])
def api_explainable_ai_summary():
    district = request.args.get("district", "Bengaluru Urban")
    date = request.args.get("date", None)
    target = request.args.get("target", "temperature")
    svc = get_xai_service(PROJECT)
    res = svc.explain_prediction(date_str=date, district=district, target=target)
    return jsonify(res)


@app.route("/api/explainable-ai/global", methods=["GET"])
def api_explainable_ai_global():
    target = request.args.get("target", "temperature")
    svc = get_xai_service(PROJECT)
    res = svc.get_global_importance(target=target)
    return jsonify(res)


@app.route("/api/explainable-ai/explain", methods=["GET", "POST"])
def api_explainable_ai_explain():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        district = data.get("district", "Bengaluru Urban")
        date = data.get("date", None)
        target = data.get("target", "temperature")
    else:
        district = request.args.get("district", "Bengaluru Urban")
        date = request.args.get("date", None)
        target = request.args.get("target", "temperature")
    svc = get_xai_service(PROJECT)
    res = svc.explain_prediction(date_str=date, district=district, target=target)
    return jsonify(res)


# ---------------------------------------------------------------------------
# MODULE 4: CLIMATE SCENARIO SIMULATOR
# ---------------------------------------------------------------------------
@app.route("/api/scenario-simulator/run", methods=["POST"])
def api_scenario_simulator_run():
    body = request.get_json(silent=True) or {}
    district = body.get("district", "Bengaluru Urban")
    temp_delta = float(body.get("temp_delta", 0.0))
    rain_percent_delta = float(body.get("rain_percent_delta", 0.0))
    rain_30d_delta = float(body.get("rain_30d_delta", 0.0))
    enso_phase_override = body.get("enso_phase_override", "Current")
    svc = get_scenario_simulator_service(PROJECT)
    res = svc.run_simulation(
        district=district,
        temp_delta=temp_delta,
        rain_percent_delta=rain_percent_delta,
        rain_30d_delta=rain_30d_delta,
        enso_phase_override=enso_phase_override,
    )
    return jsonify(res)


# ---------------------------------------------------------------------------
# MODULE 5: ENSEMBLE PREDICTION CENTRE
# ---------------------------------------------------------------------------
@app.route("/api/ensemble-prediction/evaluation", methods=["GET"])
def api_ensemble_evaluation():
    target = request.args.get("target", "temperature")
    svc = get_ensemble_service(PROJECT)
    res = svc.get_evaluation(target)
    return jsonify(res)


@app.route("/api/ensemble-prediction/predict", methods=["GET", "POST"])
def api_ensemble_predict():
    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        district = body.get("district", "Bengaluru Urban")
        target = body.get("target", "temperature")
        weights = body.get("weights")
    else:
        district = request.args.get("district", "Bengaluru Urban")
        target = request.args.get("target", "temperature")
        weights = None
    svc = get_ensemble_service(PROJECT)
    res = svc.predict_ensemble(district=district, target=target, custom_weights=weights)
    return jsonify(res)


# ---------------------------------------------------------------------------
# MODULE 6: MODEL AND DATA MONITORING
# ---------------------------------------------------------------------------
@app.route("/api/model-monitoring/drift", methods=["GET"])
def api_monitoring_drift():
    svc = get_monitoring_service(PROJECT)
    res = svc.get_drift_analysis()
    return jsonify(res)


@app.route("/api/model-monitoring/quality", methods=["GET"])
def api_monitoring_quality():
    svc = get_monitoring_service(PROJECT)
    res = svc.get_data_quality()
    return jsonify(res)


@app.route("/api/model-monitoring/telemetry", methods=["GET"])
def api_monitoring_telemetry():
    svc = get_monitoring_service(PROJECT)
    res = svc.get_operational_telemetry()
    return jsonify(res)


# ===========================================================================
# ENTERPRISE WEATHER FORECASTING & REAL LIVE METEOROLOGY (OPEN-METEO)
# ===========================================================================
@app.route("/api/weather/current", methods=["GET"])
def api_weather_current():
    district = request.args.get("district", "Bengaluru Urban")
    fc_svc = get_forecast_service()
    data = fc_svc.get_district_forecast(district)
    return jsonify({
        "status": data.get("status", "success"),
        "district": data.get("district"),
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "current": data.get("current"),
        "provenance": data.get("provenance"),
    })


@app.route("/api/weather/forecast/7day", methods=["GET"])
def api_weather_forecast_7day():
    district = request.args.get("district", "Bengaluru Urban")
    fc_svc = get_forecast_service()
    data = fc_svc.get_district_forecast(district)
    warn_svc = get_warning_service()
    warn_svc.evaluate_and_generate_warnings(data)
    return jsonify(data)


@app.route("/api/weather/hourly", methods=["GET"])
def api_weather_hourly():
    district = request.args.get("district", "Bengaluru Urban")
    fc_svc = get_forecast_service()
    data = fc_svc.get_district_forecast(district)
    return jsonify({
        "status": data.get("status", "success"),
        "district": data.get("district"),
        "hourly": data.get("hourly", []),
        "provenance": data.get("provenance"),
    })


@app.route("/api/weather/districts", methods=["GET"])
def api_weather_districts():
    fc_svc = get_forecast_service()
    data = fc_svc.get_all_districts_overview()
    return jsonify(data)


# ===========================================================================
# MULTI-HAZARD RISK EVALUATION & WARNING MANAGEMENT
# ===========================================================================
@app.route("/api/hazards/evaluate", methods=["GET"])
def api_hazards_evaluate():
    district = request.args.get("district", "Bengaluru Urban")
    fc_svc = get_forecast_service()
    fc_data = fc_svc.get_district_forecast(district)
    engine = get_hazard_risk_engine()
    res = engine.evaluate_forecast(fc_data)
    return jsonify(res)


@app.route("/api/alerts/active", methods=["GET"])
def api_alerts_active():
    district = request.args.get("district", None)
    severity = request.args.get("severity", None)
    warn_svc = get_warning_service()
    fc_svc = get_forecast_service()
    if district and district != "Statewide":
        fc_data = fc_svc.get_district_forecast(district)
        warn_svc.evaluate_and_generate_warnings(fc_data)
    else:
        for d in ["Bengaluru Urban", "Ballari", "Dakshina Kannada", "Belagavi", "Mysuru"]:
            warn_svc.evaluate_and_generate_warnings(fc_svc.get_district_forecast(d))

    alerts = warn_svc.get_all_active_warnings(district=district, severity_filter=severity)
    return jsonify({
        "status": "success",
        "district": district or "Statewide",
        "active_count": len(alerts),
        "alerts": alerts,
    })


@app.route("/api/alerts/details", methods=["GET"])
def api_alerts_details():
    alert_id = request.args.get("alert_id")
    warn_svc = get_warning_service()
    alert = warn_svc.get_warning_by_id(alert_id)
    if not alert:
        return jsonify({"status": "error", "message": f"Alert {alert_id} not found."}), 404
    return jsonify({"status": "success", "alert": alert})


# ===========================================================================
# USER AUTHENTICATION & ACCESS CONTROL
# ===========================================================================
@app.route("/api/auth/register", methods=["POST"])
def api_auth_register():
    try:
        data = request.get_json(silent=True) or {}
        auth_svc = get_auth_service()
        res = auth_svc.register_user(
            full_name=data.get("full_name"),
            email=data.get("email"),
            password=data.get("password"),
            confirm_password=data.get("confirm_password"),
            mobile_number=data.get("mobile_number"),
            primary_district=data.get("primary_district", "Bengaluru Urban"),
            locality=data.get("locality"),
            role=data.get("role", "USER"),
            consent_given=data.get("consent_given", True),
        )
        if res.get("code") == "DB_UNAVAILABLE":
            return jsonify(res), 503
        code = 200 if res.get("status") == "success" else 400
        return jsonify(res), code
    except Exception as exc:
        app.logger.error(f"Registration route error: {exc}")
        return jsonify({
            "status": "error",
            "code": "REGISTRATION_ERROR",
            "message": "An unexpected error occurred during registration. Please try again."
        }), 500


@app.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    try:
        data = request.get_json(silent=True) or {}
        email = data.get("email")
        password = data.get("password")
        ip_addr = request.remote_addr
        auth_svc = get_auth_service()
        res = auth_svc.authenticate_user(email=email, password=password, ip_address=ip_addr)
        if res.get("status") == "success":
            user_info = res.get("user", {})
            session["user_id"] = user_info.get("id")
            session["role"] = user_info.get("role")
            session["email"] = user_info.get("email")
        if res.get("code") == "DB_UNAVAILABLE":
            return jsonify(res), 503
        code = 200 if res.get("status") == "success" else (429 if res.get("is_locked") else 401)
        return jsonify(res), code
    except Exception as exc:
        app.logger.error(f"Login route error: {exc}")
        return jsonify({
            "status": "error",
            "code": "LOGIN_ERROR",
            "message": "An unexpected error occurred during login. Please try again."
        }), 500


@app.route("/api/auth/logout", methods=["POST", "GET"])
def api_auth_logout():
    session.clear()
    return jsonify({"status": "success", "message": "Logged out successfully."})


@app.route("/api/auth/me", methods=["GET"])
def api_auth_me():
    try:
        user_id = request.args.get("user_id", type=int) or session.get("user_id")
        if not user_id:
            return jsonify({"status": "error", "message": "User ID or active session required."}), 400
        auth_svc = get_auth_service()
        profile = auth_svc.get_user_profile(user_id)
        if not profile:
            return jsonify({"status": "error", "message": "User not found or database unavailable."}), 404
        return jsonify({"status": "success", "user": profile})
    except Exception as exc:
        app.logger.error(f"Auth profile route error: {exc}")
        return jsonify({
            "status": "error",
            "code": "PROFILE_ERROR",
            "message": "Unable to retrieve user profile."
        }), 500


@app.route("/api/auth/profile", methods=["PUT"])
def api_auth_profile():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"status": "error", "message": "User ID required."}), 400
    auth_svc = get_auth_service()
    res = auth_svc.update_user_profile(
        user_id=user_id,
        full_name=data.get("full_name"),
        mobile_number=data.get("mobile_number"),
        primary_district=data.get("primary_district", "Bengaluru Urban"),
        locality=data.get("locality"),
    )
    return jsonify(res)


@app.route("/api/auth/preferences", methods=["PUT"])
def api_auth_preferences():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"status": "error", "message": "User ID required."}), 400
    auth_svc = get_auth_service()
    res = auth_svc.update_notification_preferences(
        user_id=user_id,
        push_enabled=data.get("push_enabled", True),
        email_enabled=data.get("email_enabled", True),
        sms_enabled=data.get("sms_enabled", False),
        min_severity=data.get("min_severity", "ORANGE"),
        hazard_types=data.get("hazard_types"),
    )
    return jsonify(res)


# ===========================================================================
# EMERGENCY NOTIFICATION & WEB PUSH INFRASTRUCTURE
# ===========================================================================
@app.route("/api/notifications/vapid-key", methods=["GET"])
def api_notifications_vapid_key():
    return jsonify({
        "status": "success",
        "public_key": VAPID_PUBLIC_KEY,
    })


@app.route("/api/notifications/subscribe", methods=["POST"])
def api_notifications_subscribe():
    data = request.get_json(silent=True) or {}
    endpoint = (data.get("endpoint") or "").strip()
    p256dh = (data.get("p256dh") or (data.get("keys") or {}).get("p256dh") or "").strip()
    auth = (data.get("auth") or (data.get("keys") or {}).get("auth") or "").strip()

    if not endpoint or not p256dh or not auth:
        return jsonify({
            "status": "error",
            "message": "Invalid push subscription payload: 'endpoint', 'p256dh', and 'auth' keys are required."
        }), 400

    notif_svc = get_notification_service()
    res = notif_svc.register_push_subscription(
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        district=data.get("district", "Bengaluru Urban"),
        user_id=data.get("user_id"),
        user_agent=request.headers.get("User-Agent"),
    )
    code = 200 if res.get("status") == "success" else 400
    return jsonify(res), code


@app.route("/api/notifications/status", methods=["GET"])
def api_notifications_status():
    endpoint = request.args.get("endpoint")
    user_id = request.args.get("user_id", type=int) or session.get("user_id")
    notif_svc = get_notification_service()
    res = notif_svc.check_push_subscription_status(endpoint=endpoint, user_id=user_id)
    return jsonify(res)


@app.route("/api/notifications/history", methods=["GET"])
def api_notifications_history():
    notif_svc = get_notification_service()
    limit = int(request.args.get("limit", 50))
    logs = notif_svc.get_delivery_history(limit=limit)
    return jsonify({"status": "success", "history": logs})


@app.route("/api/notifications/active-broadcasts", methods=["GET"])
def api_notifications_active_broadcasts():
    district = request.args.get("district")
    notif_svc = get_notification_service()
    items = notif_svc.get_recent_broadcasts(district=district)
    return jsonify({"status": "success", "broadcasts": items})


# ===========================================================================
# ADMINISTRATOR EMERGENCY OPERATIONS & AUDIT LEDGER
# ===========================================================================
@app.route("/api/admin/overview", methods=["GET"])
def api_admin_overview():
    auth_svc = get_auth_service()
    user_stats = auth_svc.get_registered_users_stats()
    api_client = WeatherAPIClient()
    api_health = api_client.check_health()
    warn_svc = get_warning_service()
    active_warnings = warn_svc.get_all_active_warnings()

    return jsonify({
        "status": "success",
        "users_stats": user_stats,
        "api_health": api_health,
        "active_warnings_count": len(active_warnings),
        "audit_logs_count": len(warn_svc.get_audit_logs()),
    })


@app.route("/api/admin/warnings", methods=["GET"])
def api_admin_warnings():
    district = request.args.get("district")
    warn_svc = get_warning_service()
    alerts = warn_svc.get_all_active_warnings(district=district)
    return jsonify({"status": "success", "warnings": alerts})


@app.route("/api/admin/warnings/cancel", methods=["POST"])
def api_admin_warnings_cancel():
    data = request.get_json(silent=True) or {}
    alert_id = data.get("alert_id")
    admin_user = data.get("admin_user", "ADMIN")
    notes = data.get("notes", "Cancelled by emergency administrator")
    warn_svc = get_warning_service()
    res = warn_svc.update_warning_status(alert_id, "CANCELLED", admin_user=admin_user, notes=notes)
    return jsonify(res)


@app.route("/api/admin/broadcast", methods=["POST"])
def api_admin_broadcast():
    data = request.get_json(silent=True) or {}

    # Role enforcement: standard citizens are rejected
    user_role = session.get("role") or data.get("caller_role")
    if user_role and user_role == "USER":
        return jsonify({"status": "error", "message": "Unauthorized. Emergency broadcast requires administrative clearance."}), 403

    district = data.get("district", "Statewide")
    category = data.get("category", "Emergency Warning")
    message = data.get("message", "Official emergency weather directive.")
    channels = data.get("channels", ["web_push", "in_app", "sms", "email"])
    authorized_by = data.get("authorized_by", "State Emergency Administrator")
    is_test = bool(data.get("is_test", False))
    alert_id = data.get("alert_id", f"WRN-{datetime.now().strftime('%Y%m%d')}-{district[:3].upper()}-MANUAL")

    title = f"OFFICIAL EMERGENCY DIRECTIVE: {category} ({district})"
    if is_test:
        title = f"[TEST SIMULATION] {title}"
        message = f"[EXERCISE ONLY - DO NOT PANIC] {message}"

    warning_payload = {
        "alert_id": alert_id,
        "district": district,
        "severity": data.get("severity", "CRITICAL ALERT"),
        "hazard_category": category,
        "title": title,
        "rationale": message,
        "is_test": is_test,
    }

    warn_svc = get_warning_service()
    warn_svc.broadcast_emergency_warning(alert_id, authorized_by, channels, reason=message)

    # Record to persistent admin audit log table in MySQL
    try:
        conn = get_db_connection()
        is_mysql = not hasattr(conn, "total_changes")
        cursor = conn.cursor()
        sql_audit = (
            "INSERT INTO admin_audit_logs (admin_user, action, resource_type, resource_id, details, ip_address) VALUES (%s, %s, %s, %s, %s, %s)"
            if is_mysql else
            "INSERT INTO admin_audit_logs (admin_user, action, resource_type, resource_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)"
        )
        cursor.execute(sql_audit, (
            authorized_by,
            "EMERGENCY_BROADCAST_AUTHORIZED",
            "WARNING_ALERT",
            alert_id,
            f"Hazard: {category} | District: {district} | Channels: {','.join(channels)} | Test: {is_test}",
            request.remote_addr or "127.0.0.1",
        ))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as audit_ex:
        pass

    notif_svc = get_notification_service()
    res = notif_svc.dispatch_emergency_broadcast(warning_payload, channels=channels, operator=authorized_by, is_test=is_test)
    return jsonify(res)


@app.route("/api/admin/notification-stats", methods=["GET"])
def api_admin_notification_stats():
    notif_svc = get_notification_service()
    stats = notif_svc.get_admin_notification_stats()
    return jsonify({"status": "success", "stats": stats})


@app.route("/api/admin/audit-logs", methods=["GET"])
def api_admin_audit_logs():
    warn_svc = get_warning_service()
    logs = warn_svc.get_audit_logs()
    return jsonify({"status": "success", "logs": logs})


@app.after_request
def add_security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response


@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "API endpoint not found.", "path": request.path}), 404
    return (
        "<h1>404 — Page not found</h1>"
        "<p><a href='/'>Return to the Karnataka Climate Risk dashboard</a></p>",
        404,
    )


@app.errorhandler(500)
def server_error(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Internal server error. Check the Flask log for details."}), 500
    return "<h1>500 — Internal server error</h1><p><a href='/'>Return to dashboard</a></p>", 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)
