"""Regenerate every Power BI CSV export from the project's source datasets.

Usage:
    python powerbi/generate_powerbi_exports.py

The script is deterministic and reads only local processed datasets/reports.
It fixes the duplicated ENSO labels ("El El Nino") and adds the exports used by
the prediction, risk, recommendation, drought and ONI dashboard pages.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT = Path(__file__).resolve().parent.parent
PROCESSED = PROJECT / "datasets" / "processed"
REPORTS = PROJECT / "reports"
POWERBI = PROJECT / "powerbi"

sys.path.insert(0, str(PROJECT / "backend"))
from services.risk import sector_adaptation_matrix  # noqa: E402


def normalize_enso(series: pd.Series) -> pd.Series:
    """Collapse raw ENSO strings to the official three labels.

    Handles valid UTF-8 ("El Niño"), ASCII variants ("El Nino") and legacy
    duplicated prefixes ("El El Niño") without corrupting correct text.
    """

    def _fix(value: object) -> str:
        text = str(value).strip()
        lowered = text.lower()
        if "el ni" in lowered or lowered.startswith("el "):
            return "El Ni\u00f1o"
        if "la ni" in lowered or lowered.startswith("la "):
            return "La Ni\u00f1a"
        return "Neutral"

    return series.apply(_fix)


def write(frame: pd.DataFrame, filename: str) -> None:
    path = POWERBI / filename
    frame.to_csv(path, index=False, encoding="utf-8")
    print(f"  wrote {filename:52s} {len(frame):>6,} rows")


def build_weather_exports() -> pd.DataFrame:
    # Use the cleaned dataset (same source as the Flask dashboard) so ENSO
    # counts in Power BI exactly match the web application.
    combined = pd.read_csv(
        PROCESSED / "Karnataka_Final_Cleaned_Dataset.csv", parse_dates=["Date"]
    )
    combined["Condition"] = normalize_enso(combined["Condition"])
    combined = combined.sort_values("Date").reset_index(drop=True)

    daily = combined[
        [
            "Date",
            "Year",
            "Month",
            "Day",
            "Season",
            "Condition",
            "ONI",
            "Rainfall",
            "Max_Temperature",
            "Min_Temperature",
            "Mean_Temperature",
        ]
    ].copy()
    daily["Date"] = daily["Date"].dt.strftime("%Y-%m-%d")
    write(daily, "Karnataka_Daily_Weather_Climate_PowerBI.csv")

    yearly = (
        combined.groupby("Year")
        .agg(
            Mean_Temperature=("Mean_Temperature", "mean"),
            Max_Temperature=("Max_Temperature", "max"),
            Min_Temperature=("Min_Temperature", "min"),
            Total_Rainfall=("Rainfall", "sum"),
            Mean_Rainfall=("Rainfall", "mean"),
            Mean_ONI=("ONI", "mean"),
        )
        .reset_index()
        .round(4)
    )
    write(yearly, "Karnataka_Yearly_Trends_PowerBI.csv")

    month_names = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    monthly = (
        combined.groupby("Month")
        .agg(
            Mean_Temperature=("Mean_Temperature", "mean"),
            Mean_Rainfall=("Rainfall", "mean"),
            Total_Rainfall=("Rainfall", "sum"),
        )
        .reset_index()
        .round(4)
    )
    monthly["Month_Name"] = monthly["Month"].apply(lambda m: month_names[int(m) - 1])
    write(monthly, "Karnataka_Monthly_Seasonal_PowerBI.csv")

    enso = (
        combined.groupby("Condition")
        .agg(
            Total_Days=("Date", "count"),
            Mean_Temperature=("Mean_Temperature", "mean"),
            Max_Temperature=("Max_Temperature", "max"),
            Mean_Rainfall=("Rainfall", "mean"),
            Total_Rainfall=("Rainfall", "sum"),
        )
        .reset_index()
        .round(4)
    )
    enso["Percentage_of_Days"] = (enso["Total_Days"] / len(combined) * 100).round(2)
    enso = enso.sort_values("Total_Days", ascending=False)
    write(enso, "ENSO_Condition_Comparison_PowerBI.csv")

    oni = pd.read_csv(PROCESSED / "NOAA_ONI_Cleaned.csv", parse_dates=["Date"])
    oni["Condition"] = normalize_enso(oni["Condition"])
    timeline = oni[["Date", "Year", "Month", "Season", "ONI", "Condition"]].copy()
    timeline["Date"] = timeline["Date"].dt.strftime("%Y-%m-%d")
    write(timeline, "ONI_Monthly_Timeline_PowerBI.csv")

    return combined


def build_prediction_exports(weather: pd.DataFrame) -> None:
    predictions = pd.read_csv(
        REPORTS / "Step13_Adaptation_Recommendations.csv", parse_dates=["Date"]
    )
    features = pd.read_csv(
        PROCESSED / "Karnataka_Feature_Engineered_Dataset.csv",
        parse_dates=["Date"],
        usecols=["Date", "Rainfall_Rolling_30"],
    )
    percentiles = features["Rainfall_Rolling_30"].quantile([0.10, 0.25]).to_dict()

    lookup = features.copy()
    lookup["Target_Date"] = lookup["Date"] + pd.Timedelta(days=1)
    lookup = lookup.rename(columns={"Rainfall_Rolling_30": "Trailing_30d_Rainfall_mm"})
    predictions = predictions.merge(
        lookup[["Target_Date", "Trailing_30d_Rainfall_mm"]],
        left_on="Date",
        right_on="Target_Date",
        how="left",
    ).drop(columns=["Target_Date"])

    def drought_tier(value: object) -> str:
        if pd.isna(value):
            return "Unknown"
        if float(value) <= percentiles[0.10]:
            return "High"
        if float(value) <= percentiles[0.25]:
            return "Moderate"
        return "Low"

    predictions["Drought_Risk"] = predictions["Trailing_30d_Rainfall_mm"].apply(drought_tier)
    predictions = predictions.sort_values("Date")
    numeric_columns = predictions.select_dtypes("number").columns
    predictions[numeric_columns] = predictions[numeric_columns].round(4)
    predictions["Date"] = predictions["Date"].dt.strftime("%Y-%m-%d")
    write(predictions, "ML_Predictions_and_Risk_PowerBI.csv")

    # Actual-vs-predicted error analysis for the Power BI residual page.
    temp = pd.read_csv(
        PROCESSED / "Step10_Temperature_Predictions.csv", parse_dates=["Date"]
    ).rename(
        columns={
            "Actual": "Actual_Temperature_C",
            "Predicted": "Predicted_Temperature_C",
            "Error": "Temperature_Error_C",
        }
    )
    rain = pd.read_csv(
        PROCESSED / "Step10_Rainfall_Predictions.csv", parse_dates=["Date"]
    ).rename(
        columns={
            "Actual": "Actual_Rainfall_mm",
            "Predicted": "Predicted_Rainfall_mm",
            "Error": "Rainfall_Error_mm",
        }
    )
    errors = temp.merge(rain, on="Date", how="inner")
    errors["Abs_Temperature_Error_C"] = errors["Temperature_Error_C"].abs()
    errors["Abs_Rainfall_Error_mm"] = errors["Rainfall_Error_mm"].abs()
    errors = errors.sort_values("Date")
    numeric_columns = errors.select_dtypes("number").columns
    errors[numeric_columns] = errors[numeric_columns].round(4)
    errors["Date"] = errors["Date"].dt.strftime("%Y-%m-%d")
    write(errors, "Prediction_Error_Analysis_PowerBI.csv")


def build_reference_exports() -> None:
    metrics = pd.read_csv(PROCESSED / "Step10_Model_Evaluation_Results.csv")
    metrics = metrics.rename(columns={"Unnamed: 0": "Target"}).round(4)
    metrics["Target"] = metrics["Target"].str.replace("Target_Next_Day_", "", regex=False)
    write(metrics, "Model_Evaluation_Metrics_PowerBI.csv")

    shap = pd.read_csv(REPORTS / "SHAP_Combined_Feature_Importance.csv")
    shap = shap.rename(columns={shap.columns[0]: "Feature"})
    shap = shap.sort_values("Temperature_SHAP_Importance", ascending=False).round(6)
    write(shap, "SHAP_Feature_Importance_PowerBI.csv")

    thresholds = pd.read_csv(REPORTS / "Step13_Historical_Thresholds.csv")
    thresholds["Tier_Use"] = thresholds["Metric"].apply(
        lambda name: (
            "Temperature tiers" if name.startswith("Temperature")
            else "Rainfall tiers"
        )
    )
    write(thresholds, "Risk_Thresholds_PowerBI.csv")

    temp_levels = ["Low", "Moderate", "High", "Very High"]
    rain_levels = ["Low", "Normal", "High", "Very High"]
    rows = []
    for temp_level in temp_levels:
        for rain_level in rain_levels:
            matrix = sector_adaptation_matrix(temp_level, rain_level)
            for sector, detail in matrix.items():
                rows.append(
                    {
                        "Temperature_Level": temp_level,
                        "Rainfall_Level": rain_level,
                        "Sector": sector,
                        "Tier": detail["tier"],
                        "Action": detail["action"],
                    }
                )
    write(pd.DataFrame(rows), "Adaptation_Recommendation_Matrix_PowerBI.csv")

    features = pd.read_csv(
        PROCESSED / "Karnataka_Feature_Engineered_Dataset.csv",
        parse_dates=["Date"],
    )
    rolling = features["Rainfall_Rolling_30"]
    percentile_rows = [
        {
            "Indicator": f"Trailing_30d_Rainfall_P{int(p)}",
            "Value": round(float(rolling.quantile(p / 100.0)), 2),
            "Unit": "mm",
            "Meaning": "30-day rainfall percentile (relative drought tiers: High <= P10, Moderate <= P25)",
        }
        for p in (5, 10, 25, 50, 75, 90, 95)
    ]
    write(pd.DataFrame(percentile_rows), "Drought_Risk_Thresholds_PowerBI.csv")

    monthly_rain_source = pd.read_csv(
        PROCESSED / "Karnataka_Final_Cleaned_Dataset.csv", parse_dates=["Date"]
    )
    monthly_rain = (
        monthly_rain_source.assign(Month=monthly_rain_source["Date"].dt.month)
        .groupby("Month")
        .agg(Mean_Daily_Rainfall_mm=("Rainfall", "mean"))
        .reset_index()
        .round(3)
    )
    month_names = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    monthly_rain["Month_Name"] = monthly_rain["Month"].apply(
        lambda m: month_names[int(m) - 1]
    )
    monthly_rain["Dry_Season_Flag"] = monthly_rain["Mean_Daily_Rainfall_mm"] < 2.0
    write(monthly_rain, "Drought_Monthly_Climatology_PowerBI.csv")


def build_district_exports() -> None:
    raw = pd.read_csv(
        PROJECT / "datasets" / "raw" / "rainfall_manual_daily_karnataka_ka_1991_2020.csv"
    )
    raw["Date"] = pd.to_datetime(
        raw["Data Acquisition Time"], dayfirst=True, errors="coerce"
    )
    raw["Year"] = raw["Date"].dt.year
    value_column = "Manual Daily Rainfall (mm)"

    stats = (
        raw.groupby("District")[value_column]
        .agg(mean_daily="mean", max_daily="max", p75=lambda s: s.quantile(0.75), total_obs="count")
        .reset_index()
    )
    coords = raw.groupby("District")[["Latitude", "Longitude"]].mean().reset_index()
    stats = stats.merge(coords, on="District", how="left").rename(
        columns={"Latitude": "lat", "Longitude": "lon"}
    )
    stats["drought_risk"] = stats["mean_daily"].apply(
        lambda value: "High" if value < 5 else ("Moderate" if value < 8 else "Low")
    )
    stats["flood_risk"] = stats["max_daily"].apply(
        lambda value: "Very High" if value > 100 else ("High" if value > 50 else "Moderate")
    )

    annual = (
        raw.groupby(["District", "Year"])[value_column]
        .agg(
            total_mm="sum",
            mean_mm="mean",
            max_mm="max",
            rainy_days=lambda s: int((s >= 2.5).sum()),
        )
        .reset_index()
        .rename(columns={"District": "district", "Year": "year"})
    )
    annual["drought_risk"] = annual["total_mm"].apply(
        lambda value: "Severe" if value < 500 else ("Moderate" if value < 900 else "Low")
    )
    annual["flood_risk"] = annual["max_mm"].apply(
        lambda value: "Very High" if value > 100 else ("High" if value > 50 else "Moderate")
    )

    aggregates = []
    for district, group in annual.groupby("district"):
        totals = group.sort_values("year")["total_mm"]
        average = float(totals.mean()) if len(totals) else None
        cv = float(totals.std(ddof=0) / average * 100) if average and len(totals) > 1 else None
        slope = None
        if len(totals) >= 2:
            slope = float(np.polyfit(group.sort_values("year")["year"], totals, 1)[0])
        aggregates.append(
            {
                "District": district,
                "avg_annual_mm": average,
                "annual_cv_pct": cv,
                "rainfall_trend_mm_per_year": slope,
                "avg_rainy_days": float(group["rainy_days"].mean()),
                "years_observed": int(group["year"].nunique()),
            }
        )

    stats = stats.merge(pd.DataFrame(aggregates), on="District", how="left")
    stats = stats.sort_values("District").round(2)
    write(stats, "Karnataka_District_Rainfall_Stats.csv")

    annual = annual.sort_values(["district", "year"]).round(2)
    write(annual, "Karnataka_District_Annual_Rainfall.csv")


def main() -> None:
    POWERBI.mkdir(parents=True, exist_ok=True)
    print("Rebuilding Power BI exports...")
    weather = build_weather_exports()
    build_prediction_exports(weather)
    build_reference_exports()
    build_district_exports()
    print("Done. All CSV files use UTF-8 and matching official ENSO labels.")


if __name__ == "__main__":
    main()
