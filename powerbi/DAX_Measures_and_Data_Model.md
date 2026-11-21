# Power BI Data Model & DAX Measures Reference

**Project:** AI-Driven El Niño-Aware Urban Heat Risk Prediction and Adaptation Planning System for Karnataka  
**Target Environment:** Microsoft Power BI Desktop / Service  
**Location:** `C:\Users\vinod\Documents\ELNINO_KARNATAKA_PROJECT\powerbi`  

---

## 1. Relational Data Model Architecture

The Power BI data model follows an analytical Star/Snowflake hybrid architecture designed for optimal querying and filtering performance across 44 years of meteorological records.

### Tables & Roles

| Table Name | Source File | Role | Primary/Join Key |
| :--- | :--- | :--- | :--- |
| **Fact_DailyWeather** | `Karnataka_Daily_Weather_Climate_PowerBI.csv` | Fact Table (16,071 daily rows) | `Date`, `Year`, `Month`, `Condition` |
| **Fact_Predictions** | `ML_Predictions_and_Risk_PowerBI.csv` | Fact Table (3,208 predictions) | `Date`, `Relative_Temperature_Level`, `Relative_Rainfall_Level` |
| **Dim_YearlyTrends** | `Karnataka_Yearly_Trends_PowerBI.csv` | Dimension / Aggregation (44 rows) | `Year` |
| **Dim_MonthlySeason** | `Karnataka_Monthly_Seasonal_PowerBI.csv` | Dimension (12 months) | `Month` |
| **Dim_ENSOPhases** | `ENSO_Condition_Comparison_PowerBI.csv` | Dimension (3 climate phases) | `Condition` |
| **Dim_ModelMetrics** | `Model_Evaluation_Metrics_PowerBI.csv` | Reference Dimension | `Target` |
| **Dim_SHAPImportance** | `SHAP_Feature_Importance_PowerBI.csv` | Reference Dimension | `Feature` |

### Relationships

1. `Fact_DailyWeather[Date]` (1) ↔ `Fact_Predictions[Date]` (1) [Single / Bi-directional, Active]
2. `Dim_YearlyTrends[Year]` (1) ↔ `Fact_DailyWeather[Year]` (*) [Single direction]
3. `Dim_MonthlySeason[Month]` (1) ↔ `Fact_DailyWeather[Month]` (*) [Single direction]
4. `Dim_ENSOPhases[Condition]` (1) ↔ `Fact_DailyWeather[Condition]` (*) [Single direction]

---

## 2. Core DAX Measures (Copy-and-Paste Ready)

Create a dedicated calculation table named **`_KeyMeasures`** in Power BI and paste the following measures:

### A. Meteorological KPIs

```dax
// 1. Average Daily Mean Temperature
Avg_Mean_Temperature = 
AVERAGE('Fact_DailyWeather'[Mean_Temperature])

// 2. Maximum Recorded Temperature
Max_Temperature_Record = 
MAX('Fact_DailyWeather'[Max_Temperature])

// 3. Minimum Recorded Temperature
Min_Temperature_Record = 
MIN('Fact_DailyWeather'[Min_Temperature])

// 4. Total Rainfall (mm)
Total_Rainfall_mm = 
SUM('Fact_DailyWeather'[Rainfall])

// 5. Average Daily Rainfall (mm)
Avg_Daily_Rainfall = 
AVERAGE('Fact_DailyWeather'[Rainfall])

// 6. Total Observation Days
Total_Observation_Days = 
COUNTROWS('Fact_DailyWeather')
```

### B. Oceanic Niño Index (ONI) & ENSO Measures

```dax
// 7. Average ONI Value
Avg_ONI = 
AVERAGE('Fact_DailyWeather'[ONI])

// 8. El Niño Days Count
El_Nino_Days = 
CALCULATE(
    COUNTROWS('Fact_DailyWeather'),
    'Fact_DailyWeather'[Condition] = "El Niño"
)

// 9. La Niña Days Count
La_Nina_Days = 
CALCULATE(
    COUNTROWS('Fact_DailyWeather'),
    'Fact_DailyWeather'[Condition] = "La Niña"
)

// 10. Neutral Phase Days Count
Neutral_Days = 
CALCULATE(
    COUNTROWS('Fact_DailyWeather'),
    'Fact_DailyWeather'[Condition] = "Neutral"
)

// 11. El Niño Days Percentage
El_Nino_Percentage = 
DIVIDE([El_Nino_Days], [Total_Observation_Days], 0) * 100

// 12. Temperature Anomaly vs Long-Term Baseline (°C)
Temperature_Anomaly = 
[Avg_Mean_Temperature] - 
CALCULATE([Avg_Mean_Temperature], ALL('Fact_DailyWeather'))
```

### C. Machine Learning Prediction & Risk Measures

```dax
// 13. Average Predicted Temperature (°C)
Avg_Predicted_Temperature = 
AVERAGE('Fact_Predictions'[Predicted_Temperature_C])

// 14. Average Predicted Rainfall (mm)
Avg_Predicted_Rainfall = 
AVERAGE('Fact_Predictions'[Predicted_Rainfall_mm])

// 15. High Heat Risk Days
High_Heat_Risk_Days = 
CALCULATE(
    COUNTROWS('Fact_Predictions'),
    'Fact_Predictions'[Relative_Temperature_Level] = "High"
)

// 16. Very High Heat Risk Days
Very_High_Heat_Risk_Days = 
CALCULATE(
    COUNTROWS('Fact_Predictions'),
    'Fact_Predictions'[Relative_Temperature_Level] = "Very High"
)

// 17. High / Very High Rainfall Risk Days
Heavy_Rain_Risk_Days = 
CALCULATE(
    COUNTROWS('Fact_Predictions'),
    'Fact_Predictions'[Relative_Rainfall_Level] IN {"High", "Very High"}
)

// 18. Heat Stress Alert Flag (Dynamic Title)
Heat_Stress_Alert_Status = 
IF(
    [Very_High_Heat_Risk_Days] > 0,
    "CRITICAL: Extreme Heat Percentile Exceeded",
    IF([High_Heat_Risk_Days] > 0, "WARNING: Elevated Heat Stress Observed", "NORMAL: Within Baseline Range")
)
```

---

## 3. Formatting & Color Theme Guide

| Level / Theme | Hex Code | Purpose |
| :--- | :--- | :--- |
| **Background Dark** | `#12221C` | Primary Canvas Dark Theme |
| **Panel Background** | `#1D3A31` | Card & Visual Container fill |
| **Laterite / Heat** | `#C46A3A` | Temperature Lines, El Niño bars, High Heat risk |
| **Monsoon / Water** | `#7EC8C1` | Rainfall bars, La Niña indicators, Normal rain |
| **Gold / ONI** | `#E2B15A` | ONI Anomaly Line, Neutral Phase, Moderate heat |
| **Alert Extreme** | `#E07A5F` | Very High Risk Tiers, Heatwave warning markers |
| **Leaf / Baseline** | `#8FBF6A` | Low Risk, R² Good status badges |
