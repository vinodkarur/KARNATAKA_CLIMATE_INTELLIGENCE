# Microsoft Power BI Dashboard Creation & Implementation Guide

**Project:** AI-Driven El Niño-Aware Urban Heat Risk Prediction and Adaptation Planning System for Karnataka  
**Directory:** `C:\Users\vinod\Documents\ELNINO_KARNATAKA_PROJECT\powerbi`  

---

## 1. Quick Start Guide: Loading Datasets into Power BI

1. Open **Microsoft Power BI Desktop**.
2. Click **Get Data** → **Text/CSV**.
3. Navigate to `C:\Users\vinod\Documents\ELNINO_KARNATAKA_PROJECT\powerbi\` and load the following 6 CSV files:
   - `Karnataka_Daily_Weather_Climate_PowerBI.csv` (Fact Table)
   - `ML_Predictions_and_Risk_PowerBI.csv` (Predictions Fact Table)
   - `Karnataka_Yearly_Trends_PowerBI.csv` (Yearly Dimension)
   - `Karnataka_Monthly_Seasonal_PowerBI.csv` (Monthly Dimension)
   - `ENSO_Condition_Comparison_PowerBI.csv` (ENSO Dimension)
   - `SHAP_Feature_Importance_PowerBI.csv` (SHAP Reference Table)
4. In the **Model View**, verify the relationships as detailed in `DAX_Measures_and_Data_Model.md`.
5. Create a new Table named `_KeyMeasures` and copy-paste the DAX formulas.

---

## 2. Multi-Page Dashboard Architecture

### Page 1: Karnataka Climate Risk & Historical Trends (1981–2024)

- **Header / Title:** AI-Driven Climate Risk Intelligence – Karnataka State Meteorological Overview
- **Top KPI Cards (Row 1):**
  - Card 1: `Total Observation Days` (16,071 Days)
  - Card 2: `Avg_Mean_Temperature` (21.32 °C)
  - Card 3: `Max_Temperature_Record` (Hottest Day: 33.19 °C)
  - Card 4: `Total_Rainfall_mm` (Cumulative Precipitation)
- **Visual 1 (Area / Line Chart):** Yearly Mean Temperature Trajectory (1981–2024).
  - *X-Axis:* `Dim_YearlyTrends[Year]`
  - *Y-Axis:* `Dim_YearlyTrends[Mean_Temperature]`
  - *Trend Line:* Add 5-year moving average.
- **Visual 2 (Column Chart):** Annual Rainfall Volume (mm).
  - *X-Axis:* `Dim_YearlyTrends[Year]`
  - *Y-Axis:* `Dim_YearlyTrends[Total_Rainfall]`
- **Visual 3 (Line Chart):** Monthly Seasonal Cycle (Jan to Dec).
  - *X-Axis:* `Dim_MonthlySeason[Month_Name]`
  - *Y-Axis:* `Dim_MonthlySeason[Mean_Temperature]` and `Dim_MonthlySeason[Mean_Rainfall]` (Dual Y-Axis).
- **Slicers:** Year range slider (1981 to 2024), Season dropdown (`Summer`, `Monsoon`, `Post-Monsoon`, `Winter`).

---

### Page 2: ENSO Teleconnections & Climate Anomaly Analysis

- **Header:** Equatorial Pacific ENSO Teleconnections & Karnataka Weather Disparities
- **Top KPI Cards:**
  - Card 1: `El_Nino_Days` (Count and Percentage)
  - Card 2: `La_Nina_Days` (Count and Percentage)
  - Card 3: `Neutral_Days` (Count and Percentage)
  - Card 4: `Avg_ONI` (Mean Anomaly Index)
- **Visual 1 (Clustered Column Chart):** Mean Temperature by ENSO Condition.
  - *X-Axis:* `Dim_ENSOPhases[Condition]`
  - *Y-Axis:* `Dim_ENSOPhases[Mean_Temperature]`
- **Visual 2 (Clustered Column Chart):** Daily Mean Rainfall by ENSO Condition.
  - *X-Axis:* `Dim_ENSOPhases[Condition]`
  - *Y-Axis:* `Dim_ENSOPhases[Mean_Rainfall]`
- **Visual 3 (Line Chart with Reference Bands):** NOAA ONI Timeline.
  - *X-Axis:* `Fact_DailyWeather[Date]`
  - *Y-Axis:* `Fact_DailyWeather[ONI]`
  - *Reference Lines:* `+0.5` (El Niño Threshold), `-0.5` (La Niña Threshold).
- **Visual 4 (Donut Chart):** Distribution of Days across Climate Phases.
  - *Legend:* `Dim_ENSOPhases[Condition]`
  - *Values:* `Dim_ENSOPhases[Total_Days]`

---

### Page 3: AI Next-Day Predictions & Heat Risk Adaptation

- **Header:** Machine Learning Predictive Risk & Municipal Adaptation Matrix
- **Top KPI Cards:**
  - Card 1: `Avg_Predicted_Temperature` (°C)
  - Card 2: `Avg_Predicted_Rainfall` (mm)
  - Card 3: `High_Heat_Risk_Days` (P75–P90 Count)
  - Card 4: `Very_High_Heat_Risk_Days` (P90+ Count)
- **Visual 1 (Scatter / Bubble Plot):** Predicted Temperature vs Predicted Rainfall.
  - *X-Axis:* `Fact_Predictions[Predicted_Temperature_C]`
  - *Y-Axis:* `Fact_Predictions[Predicted_Rainfall_mm]`
  - *Legend:* `Fact_Predictions[Relative_Temperature_Level]`
- **Visual 2 (Stacked Bar Chart):** Risk Tier Distribution.
  - *X-Axis:* Count of Predictions
  - *Y-Axis:* `Relative_Temperature_Level` and `Relative_Rainfall_Level`
- **Visual 3 (Interactive Table):** Prediction Records with Adaptation Actions.
  - *Columns:* `Date`, `Predicted_Temperature_C`, `Relative_Temperature_Level`, `Temperature_Recommendations`, `Predicted_Rainfall_mm`, `Relative_Rainfall_Level`, `Rainfall_Recommendations`.
- **Slicers:** Date Picker, Risk Level Filter (`Low`, `Moderate`, `High`, `Very High`).

---

### Page 4: Explainable AI (SHAP) & Model Evaluation

- **Header:** Model Governance, Feature Importance & Residual Metrics
- **Visual 1 (Horizontal Bar Chart):** Global SHAP Feature Importance – Temperature Model.
  - *Y-Axis:* `Feature` (Sorted descending)
  - *X-Axis:* `Temperature_SHAP_Importance`
- **Visual 2 (Horizontal Bar Chart):** Global SHAP Feature Importance – Rainfall Model.
  - *Y-Axis:* `Feature` (Sorted descending)
  - *X-Axis:* `Rainfall_SHAP_Importance`
- **Visual 3 (Card / Table Visual):** Algorithm Performance Summary.
  - Temperature Model: Linear Regression, R² = 0.94, MAE = 0.725 °C, RMSE = 0.926 °C
  - Rainfall Model: Gradient Boosting, R² = 0.23, MAE = 4.54 mm, RMSE = 7.34 mm
- **Scientific Commentary Box:** Callout explaining that cyclical solar encodings and autoregressive lags dominate predictive power, while ENSO provides macro atmospheric boundary modulation.

---

## 3. Power BI Report Validation Checklist

- [x] All 6 CSV data sources cleanly formatted without nulls in key analytical fields.
- [x] Dates properly cast as `Date` format in Power Query.
- [x] Numerical metrics (`Mean_Temperature`, `Rainfall`, `ONI`) formatted as decimal numbers.
- [x] DAX measures tested for division-by-zero safety using `DIVIDE(..., 0)`.
- [x] Responsive layout configured for 16:9 widescreen presentation display.
