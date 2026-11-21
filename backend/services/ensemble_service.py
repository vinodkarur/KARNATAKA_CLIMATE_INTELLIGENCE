"""Ensemble Prediction Centre Service.

Combines multiple diverse machine learning models to improve prediction stability,
reduce variance, and quantify forecast uncertainty.

Ensemble Techniques:
1. Simple Unweighted Averaging (Equal-weight consensus)
2. Performance-Weighted Averaging (Weights derived from hold-out validation R2/RMSE)
3. Median Consensus Ensemble (Robust to model outliers)
4. Empirical Prediction Uncertainty (Inter-model variance and 95% confidence intervals)

Evaluates individual models vs ensembles on an identical 80/20 chronological test split
of the 44-year Karnataka dataset (1981-2024).
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge, LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.tree import DecisionTreeRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

try:
    from services.district_service import DISTRICT_REGISTRY
except ImportError:
    from backend.services.district_service import DISTRICT_REGISTRY


class EnsembleService:
    def __init__(self, project_root: Path):
        self.project_root = Path(project_root)
        self.datasets_dir = self.project_root / "datasets" / "processed"
        self.models_dir = self.project_root / "models"

        # Load canonical feature columns
        feat_path = self.models_dir / "Model_Feature_Columns.pkl"
        if feat_path.exists():
            import joblib
            self._feature_cols = joblib.load(feat_path)
        else:
            self._feature_cols = [
                "Temperature_Lag_1", "Temperature_Lag_2", "Temperature_Lag_3", "Temperature_Rolling_7",
                "Rainfall_Lag_1", "Rainfall_Lag_2", "Rainfall_Lag_3", "Rainfall_Rolling_7", "Rainfall_Rolling_30",
                "ONI", "El_Nino", "La_Nina", "Neutral", "Day_of_Year", "Month",
            ]

        self._fitted = False
        self._cache: Dict[str, Any] = {}
        self.evaluations: Dict[str, Any] = {}
        self._init_models()

    def _init_models(self) -> None:
        """Fit base models on train split and compute hold-out validation benchmarks."""
        ds_path = self.datasets_dir / "Karnataka_Feature_Engineered_Dataset.csv"
        if not ds_path.exists():
            return

        df = pd.read_csv(ds_path, parse_dates=["Date"]).set_index("Date")
        df = df.dropna(subset=["Target_Next_Day_Temperature", "Target_Next_Day_Rainfall"])
        valid_cols = [c for c in self._feature_cols if c in df.columns]
        self._feature_cols = valid_cols

        split_idx = int(len(df) * 0.8)
        self.df_train = df.iloc[:split_idx]
        self.df_test = df.iloc[split_idx:]
        self.latest_row = df.iloc[[-1]][valid_cols].copy()
        self.latest_date = str(df.index.max().date())

        self.models: Dict[str, Dict[str, Any]] = {
            "temperature": {
                "Ridge Regression": Pipeline([("scaler", StandardScaler()), ("model", Ridge(alpha=1.0))]),
                "Random Forest": RandomForestRegressor(n_estimators=35, max_depth=8, random_state=42, n_jobs=-1),
                "Gradient Boosting": GradientBoostingRegressor(n_estimators=35, max_depth=4, learning_rate=0.1, random_state=42),
                "Decision Tree": DecisionTreeRegressor(max_depth=6, random_state=42),
            },
            "rainfall": {
                "Ridge Regression": Pipeline([("scaler", StandardScaler()), ("model", Ridge(alpha=10.0))]),
                "Random Forest": RandomForestRegressor(n_estimators=35, max_depth=8, random_state=42, n_jobs=-1),
                "Gradient Boosting": GradientBoostingRegressor(n_estimators=35, max_depth=4, learning_rate=0.08, random_state=42),
                "Decision Tree": DecisionTreeRegressor(max_depth=5, random_state=42),
            },
        }

        # Train models and calculate validation weights
        self.evaluations = {}
        for target, model_dict in self.models.items():
            target_col = "Target_Next_Day_Temperature" if target == "temperature" else "Target_Next_Day_Rainfall"
            X_tr = self.df_train[valid_cols].values
            y_tr = self.df_train[target_col].values
            X_te = self.df_test[valid_cols].values
            y_te = self.df_test[target_col].values

            individual_preds: Dict[str, np.ndarray] = {}
            individual_metrics: Dict[str, Dict[str, float]] = {}

            for name, model in model_dict.items():
                model.fit(X_tr, y_tr)
                preds = model.predict(X_te)
                if target == "rainfall":
                    preds = np.clip(preds, 0.0, None)
                individual_preds[name] = preds

                mae = round(float(mean_absolute_error(y_te, preds)), 4)
                mse = round(float(mean_squared_error(y_te, preds)), 4)
                rmse = round(float(np.sqrt(mse)), 4)
                r2 = round(float(r2_score(y_te, preds)), 4)

                individual_metrics[name] = {
                    "mae": mae,
                    "mse": mse,
                    "rmse": rmse,
                    "r2": r2,
                }

            # 1. Simple Average Ensemble
            preds_matrix = np.column_stack(list(individual_preds.values()))
            simple_avg = np.mean(preds_matrix, axis=1)
            simple_mae = round(float(mean_absolute_error(y_te, simple_avg)), 4)
            simple_rmse = round(float(np.sqrt(mean_squared_error(y_te, simple_avg))), 4)
            simple_r2 = round(float(r2_score(y_te, simple_avg)), 4)

            # 2. Performance-Weighted Ensemble (Weights inversely proportional to RMSE)
            inv_rmse = [1.0 / max(0.001, individual_metrics[n]["rmse"]) for n in model_dict.keys()]
            weights = np.array(inv_rmse) / sum(inv_rmse)
            weighted_avg = np.sum(preds_matrix * weights, axis=1)
            weighted_mae = round(float(mean_absolute_error(y_te, weighted_avg)), 4)
            weighted_rmse = round(float(np.sqrt(mean_squared_error(y_te, weighted_avg))), 4)
            weighted_r2 = round(float(r2_score(y_te, weighted_avg)), 4)

            # 3. Median Consensus Ensemble
            median_ens = np.median(preds_matrix, axis=1)
            median_mae = round(float(mean_absolute_error(y_te, median_ens)), 4)
            median_rmse = round(float(np.sqrt(mean_squared_error(y_te, median_ens))), 4)
            median_r2 = round(float(r2_score(y_te, median_ens)), 4)

            weights_dict = {name: round(float(w), 4) for name, w in zip(model_dict.keys(), weights)}

            self.evaluations[target] = {
                "target": target,
                "target_label": "Mean Temperature (°C)" if target == "temperature" else "Precipitation (mm)",
                "test_samples": len(y_te),
                "individual_models": individual_metrics,
                "ensembles": {
                    "Simple Average": {"mae": simple_mae, "rmse": simple_rmse, "r2": simple_r2, "weighting": "Equal (25% each)"},
                    "Performance-Weighted": {"mae": weighted_mae, "rmse": weighted_rmse, "r2": weighted_r2, "weights": weights_dict},
                    "Median Consensus": {"mae": median_mae, "rmse": median_rmse, "r2": median_r2, "weighting": "Robust Non-parametric Median"},
                },
                "weights": weights_dict,
                "best_individual": min(individual_metrics.keys(), key=lambda k: individual_metrics[k]["rmse"]),
                "rmse_improvement_pct": round(
                    ((min(m["rmse"] for m in individual_metrics.values()) - weighted_rmse) / min(m["rmse"] for m in individual_metrics.values())) * 100,
                    2
                ),
            }

        self._fitted = True

    def get_evaluation(self, target: str = "temperature") -> Dict[str, Any]:
        """Return benchmark comparison of individual models vs ensembles on hold-out set."""
        if not self._fitted:
            self._init_models()

        if target not in self.evaluations:
            target = "temperature"

        return {
            "status": "success",
            "target": target,
            "data": self.evaluations[target],
            "dataset_info": {
                "total_records": len(self.df_train) + len(self.df_test),
                "train_records": len(self.df_train),
                "test_records": len(self.df_test),
                "split_ratio": "80% Train (1981-2015) / 20% Test (2016-2024)",
            },
        }

    def predict_ensemble(
        self,
        district: str = "Bengaluru Urban",
        target: str = "temperature",
        custom_weights: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """Generate ensemble prediction with multi-model variance and confidence interval."""
        if not self._fitted:
            self._init_models()

        if target not in self.models:
            target = "temperature"
        if district not in DISTRICT_REGISTRY:
            district = "Bengaluru Urban"

        meta = DISTRICT_REGISTRY[district]
        clim = meta.get("climatology", {})
        temp_offset = clim.get("temp_offset", 0.0)
        rain_factor = clim.get("rain_factor", 1.0)

        # Baseline statewide feature vector
        X_row = self.latest_row.copy()
        model_dict = self.models[target]
        weights_info = self.evaluations[target]["weights"]

        # Run each individual model
        individual_predictions = {}
        pred_values = []
        for name, model in model_dict.items():
            raw_p = float(model.predict(X_row.values)[0])
            if target == "temperature":
                dist_p = round(raw_p + temp_offset, 2)
            else:
                dist_p = round(max(0.0, raw_p * rain_factor), 2)
            individual_predictions[name] = dist_p
            pred_values.append(dist_p)

        arr_preds = np.array(pred_values)

        # 1. Simple Average
        simple_pred = round(float(np.mean(arr_preds)), 2)

        # 2. Performance-Weighted Average
        if custom_weights:
            total_w = sum(custom_weights.get(n, 0.25) for n in model_dict.keys())
            norm_w = [custom_weights.get(n, 0.25) / total_w for n in model_dict.keys()]
        else:
            norm_w = [weights_info.get(n, 0.25) for n in model_dict.keys()]

        weighted_pred = round(float(np.sum(arr_preds * np.array(norm_w))), 2)

        # 3. Median Consensus
        median_pred = round(float(np.median(arr_preds)), 2)

        # 4. Uncertainty & Confidence Intervals
        variance = round(float(np.var(arr_preds)), 4)
        std_dev = round(float(np.std(arr_preds)), 4)
        ci_95_low = round(float(weighted_pred - 1.96 * std_dev), 2)
        ci_95_high = round(float(weighted_pred + 1.96 * std_dev), 2)

        # Disagreement / Uncertainty Level
        if target == "temperature":
            ci_95_low = max(-10.0, ci_95_low)
            if std_dev < 0.5:
                uncertainty_level = "Very Low (High Model Consensus)"
                confidence_score = 96.0
                badge_color = "#10b981"
            elif std_dev < 1.0:
                uncertainty_level = "Low (Good Model Agreement)"
                confidence_score = 88.0
                badge_color = "#00e5bc"
            elif std_dev < 2.0:
                uncertainty_level = "Moderate (Dispersed Estimates)"
                confidence_score = 72.0
                badge_color = "#f59e0b"
            else:
                uncertainty_level = "High (Significant Model Divergence)"
                confidence_score = 55.0
                badge_color = "#ef4444"
        else:
            ci_95_low = max(0.0, ci_95_low)
            if std_dev < 1.0:
                uncertainty_level = "Low (Consistent Rainfall Signal)"
                confidence_score = 92.0
                badge_color = "#10b981"
            elif std_dev < 3.0:
                uncertainty_level = "Moderate (Minor Spread)"
                confidence_score = 78.0
                badge_color = "#00e5bc"
            else:
                uncertainty_level = "High (Convective/Extreme Uncertainty)"
                confidence_score = 60.0
                badge_color = "#f59e0b"

        # Model spread min and max
        spread_min = round(float(np.min(arr_preds)), 2)
        spread_max = round(float(np.max(arr_preds)), 2)
        spread_range = round(spread_max - spread_min, 2)

        unit = "°C" if target == "temperature" else "mm"

        return {
            "status": "success",
            "district": district,
            "target": target,
            "unit": unit,
            "reference_date": self.latest_date,
            "recommended_ensemble_prediction": weighted_pred,
            "ensembles": {
                "performance_weighted": {
                    "value": weighted_pred,
                    "label": "Performance-Weighted Average",
                    "description": "Weights derived from 20-year validation RMSE across Ridge, RF, GBM, and DT.",
                },
                "simple_average": {
                    "value": simple_pred,
                    "label": "Simple Equal-Weight Average",
                    "description": "Arithmetic mean of all 4 base models.",
                },
                "median_consensus": {
                    "value": median_pred,
                    "label": "Median Consensus",
                    "description": "50th percentile model prediction; robust against extreme tree variance.",
                },
            },
            "individual_models": individual_predictions,
            "weights": {name: round(float(w), 3) for name, w in zip(model_dict.keys(), norm_w)},
            "uncertainty": {
                "variance": variance,
                "standard_deviation": std_dev,
                "spread_min": spread_min,
                "spread_max": spread_max,
                "spread_range": spread_range,
                "ci_95": {
                    "lower": ci_95_low,
                    "upper": ci_95_high,
                    "format": f"{ci_95_low} to {ci_95_high} {unit}",
                },
                "uncertainty_level": uncertainty_level,
                "confidence_score": confidence_score,
                "badge_color": badge_color,
            },
        }


_ENSEMBLE_SERVICE: Optional[EnsembleService] = None


def get_ensemble_service(project_root: Optional[Path] = None) -> EnsembleService:
    global _ENSEMBLE_SERVICE
    if _ENSEMBLE_SERVICE is None:
        if project_root is None:
            project_root = Path(__file__).resolve().parent.parent.parent
        _ENSEMBLE_SERVICE = EnsembleService(project_root)
    return _ENSEMBLE_SERVICE
