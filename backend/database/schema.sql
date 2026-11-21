-- ==============================================================
-- DATABASE SCHEMA: elnino_karnataka_db
-- AI-Driven El Niño-Aware Urban Heat Risk Prediction and Adaptation Planning System for Karnataka
-- ==============================================================

CREATE DATABASE IF NOT EXISTS `elnino_karnataka_db` 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `elnino_karnataka_db`;

-- 1. Historical Weather and Climate Dataset
CREATE TABLE IF NOT EXISTS `weather_climate_data` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `Date` DATE NOT NULL,
    `Year` INT NOT NULL,
    `Month` INT NOT NULL,
    `Day` INT NOT NULL,
    `Min_Temperature` DOUBLE NULL,
    `Max_Temperature` DOUBLE NULL,
    `Mean_Temperature` DOUBLE NOT NULL,
    `Rainfall` DOUBLE NOT NULL,
    `ONI` DOUBLE NOT NULL,
    `Season` VARCHAR(10) NULL,
    `Condition` VARCHAR(50) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `idx_weather_date` (`Date`),
    KEY `idx_weather_year_month` (`Year`, `Month`),
    KEY `idx_weather_condition` (`Condition`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Model Predictions and Risk Classifications
CREATE TABLE IF NOT EXISTS `predictions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `Date` DATE NOT NULL,
    `Predicted_Temperature_C` DOUBLE NOT NULL,
    `Predicted_Rainfall_mm` DOUBLE NOT NULL,
    `Relative_Temperature_Level` VARCHAR(50) NOT NULL,
    `Relative_Rainfall_Level` VARCHAR(50) NOT NULL,
    `ONI` DOUBLE NULL,
    `Created_At` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_predictions_date` (`Date`),
    KEY `idx_predictions_temp_level` (`Relative_Temperature_Level`),
    KEY `idx_predictions_rain_level` (`Relative_Rainfall_Level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Sector-Specific Adaptation Recommendations
CREATE TABLE IF NOT EXISTS `adaptation_recommendations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `Date` DATE NOT NULL,
    `Recommendation_Type` VARCHAR(50) NOT NULL,
    `Risk_Level` VARCHAR(50) NOT NULL,
    `Recommendation` TEXT NOT NULL,
    `Created_At` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_rec_date` (`Date`),
    KEY `idx_rec_type` (`Recommendation_Type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- 4. Multi-Hazard Early Warning Alerts & District Bulletins
CREATE TABLE IF NOT EXISTS early_warning_alerts (
    id BIGINT NOT NULL AUTO_INCREMENT,
    Alert_ID VARCHAR(64) NOT NULL,
    Date DATE NOT NULL,
    District VARCHAR(100) NOT NULL DEFAULT 'Statewide',
    Hazard_Category VARCHAR(100) NOT NULL,
    Severity VARCHAR(50) NOT NULL,
    Overall_Status VARCHAR(50) NOT NULL,
    Title VARCHAR(255) NOT NULL,
    Observed_Or_Predicted_Value VARCHAR(100) NULL,
    Threshold_Value VARCHAR(255) NULL,
    Threshold_Source VARCHAR(255) NULL,
    Rationale TEXT NOT NULL,
    Recommended_Actions TEXT NOT NULL,
    Stakeholders VARCHAR(255) NULL,
    Likelihood VARCHAR(10) NULL,
    Impact VARCHAR(10) NULL,
    Matrix_Cell VARCHAR(20) NULL,
    Data_Source VARCHAR(255) NULL,
    Reliability_Info TEXT NULL,
    Resolution_Status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY idx_alert_uniq (Date, District, Hazard_Category, Severity),
    KEY idx_alert_date (Date),
    KEY idx_alert_district (District),
    KEY idx_alert_severity (Severity),
    KEY idx_alert_status (Resolution_Status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Machine Learning Algorithm Evaluations
CREATE TABLE IF NOT EXISTS `algorithm_evaluations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `target` VARCHAR(50) NOT NULL,
    `task_type` VARCHAR(30) NOT NULL,
    `algorithm_name` VARCHAR(100) NOT NULL,
    `mae` DOUBLE NULL,
    `mse` DOUBLE NULL,
    `rmse` DOUBLE NULL,
    `r2` DOUBLE NULL,
    `accuracy` DOUBLE NULL,
    `precision_score` DOUBLE NULL,
    `recall_score` DOUBLE NULL,
    `f1_score` DOUBLE NULL,
    `roc_auc` DOUBLE NULL,
    `training_time_sec` DOUBLE NOT NULL,
    `inference_time_ms` DOUBLE NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_eval_target` (`target`),
    KEY `idx_eval_algo` (`algorithm_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Live Climate & Weather Observations
CREATE TABLE IF NOT EXISTS `live_weather_records` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `district` VARCHAR(100) NOT NULL,
    `temperature_c` DOUBLE NULL,
    `rainfall_mm` DOUBLE NULL,
    `relative_humidity` DOUBLE NULL,
    `wind_speed_kmh` DOUBLE NULL,
    `weather_condition` VARCHAR(100) NULL,
    `source_name` VARCHAR(50) NOT NULL,
    `data_type` VARCHAR(50) NOT NULL DEFAULT 'model_estimate',
    `is_stale` TINYINT(1) NOT NULL DEFAULT 0,
    `retrieved_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_live_district` (`district`),
    KEY `idx_live_retrieved` (`retrieved_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Model Monitoring, Drift & Telemetry Audit
CREATE TABLE IF NOT EXISTS `model_monitoring_history` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `check_date` DATE NOT NULL,
    `metric_name` VARCHAR(100) NOT NULL,
    `metric_value` DOUBLE NULL,
    `status` VARCHAR(50) NOT NULL,
    `details` TEXT NULL,
    `recorded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_mon_date` (`check_date`),
    KEY `idx_mon_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Active Production Model Selection
CREATE TABLE IF NOT EXISTS `active_model_selection` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `target` VARCHAR(64) NOT NULL,
    `algorithm_name` VARCHAR(128) NOT NULL,
    `r2` DOUBLE NULL,
    `mae` DOUBLE NULL,
    `rmse` DOUBLE NULL,
    `mse` DOUBLE NULL,
    `training_time_sec` DOUBLE NULL,
    `prediction_time_ms` DOUBLE NULL,
    `selection_timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `is_active` TINYINT(1) DEFAULT 1,
    PRIMARY KEY (`id`),
    KEY `idx_target_active` (`target`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

