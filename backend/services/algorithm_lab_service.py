"""ML Algorithm Comparison Lab Service.

Provides training, fair evaluation, cross-validation, and benchmarking
across regression and classification algorithms using historical Karnataka climate datasets.
Uses strict chronological splitting to prevent future data leakage.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    roc_curve,
    precision_recall_curve,
)
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# Regression Models
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import (
    RandomForestRegressor,
    GradientBoostingRegressor,
    ExtraTreesRegressor,
)
from sklearn.svm import SVR

# Classification Models
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import (
    RandomForestClassifier,
    GradientBoostingClassifier,
)
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier

from database.db import save_algorithm_evaluation, fetch_algorithm_evaluations


REGRESSION_ALGORITHMS = {
    "Linear Regression": lambda: Pipeline([("scaler", StandardScaler()), ("model", LinearRegression())]),
    "Decision Tree": lambda: DecisionTreeRegressor(max_depth=8, random_state=42),
    "Random Forest": lambda: RandomForestRegressor(n_estimators=60, max_depth=12, random_state=42, n_jobs=-1),
    "Gradient Boosting": lambda: GradientBoostingRegressor(n_estimators=60, max_depth=5, random_state=42),
    "Extra Trees": lambda: ExtraTreesRegressor(n_estimators=60, max_depth=12, random_state=42, n_jobs=-1),
    "Support Vector Regression": lambda: Pipeline([("scaler", StandardScaler()), ("model", SVR(C=1.5, epsilon=0.1))]),
}

CANONICAL_ALGO_NAMES = {
    "linear regression": "Linear Regression",
    "support vector regression (svr)": "Support Vector Regression",
    "support vector regression": "Support Vector Regression",
    "svr": "Support Vector Regression",
    "gradient boosting regressor": "Gradient Boosting",
    "gradient boosting": "Gradient Boosting",
    "random forest regressor": "Random Forest",
    "random forest": "Random Forest",
    "extra trees regressor": "Extra Trees",
    "extra trees": "Extra Trees",
    "decision tree regressor": "Decision Tree",
    "decision tree": "Decision Tree",
}

DISPLAY_NAMES = {
    "Linear Regression": "Linear Regression",
    "Support Vector Regression": "Support Vector Regression (SVR)",
    "Gradient Boosting": "Gradient Boosting Regressor",
    "Random Forest": "Random Forest Regressor",
    "Extra Trees": "Extra Trees Regressor",
    "Decision Tree": "Decision Tree Regressor",
}

CLASSIFICATION_ALGORITHMS = {
    "Logistic Regression": lambda: Pipeline([("scaler", StandardScaler()), ("model", LogisticRegression(max_iter=500, random_state=42))]),
    "Decision Tree": lambda: DecisionTreeClassifier(max_depth=6, random_state=42),
    "Random Forest": lambda: RandomForestClassifier(n_estimators=60, max_depth=10, random_state=42, n_jobs=-1),
    "Gradient Boosting": lambda: GradientBoostingClassifier(n_estimators=60, max_depth=4, random_state=42),
    "K-Nearest Neighbors": lambda: Pipeline([("scaler", StandardScaler()), ("model", KNeighborsClassifier(n_neighbors=5, n_jobs=-1))]),
    "Support Vector Machine": lambda: Pipeline([("scaler", StandardScaler()), ("model", SVC(probability=True, kernel="rbf", C=1.5, random_state=42))]),
}


class AlgorithmLabService:
    def __init__(self, project_root: Path):
        self.project_root = Path(project_root)
        self.dataset_path = (
            self.project_root / "datasets" / "processed" / "Karnataka_Feature_Engineered_Dataset.csv"
        )
        self._df: Optional[pd.DataFrame] = None
        self._feature_cols: List[str] = []
        self._cache: Dict[str, Any] = {}
        self._load_dataset()

    def _load_dataset(self) -> None:
        """Load and cache feature-engineered dataset."""
        if not self.dataset_path.exists():
            return
        df = pd.read_csv(self.dataset_path, parse_dates=["Date"])
        df = df.sort_values("Date").reset_index(drop=True)

        # Exclude dates, targets and identifier columns from predictors
        exclude = {
            "Date", "Season_Name", "Year", "Month", "Day", "Day_of_Year", "Day_of_Week",
            "Target_Next_Day_Temperature", "Target_Next_Day_Rainfall"
        }
        self._feature_cols = [c for c in df.columns if c not in exclude and pd.api.types.is_numeric_dtype(df[c])]
        
        # Add classification target columns derived from historical domain thresholds
        # 1. Extreme Heat Hazard (Multiclass: 0=Normal <24°C, 1=High Watch 24-26°C, 2=Critical Alert >=26°C)
        df["Target_Heat_Hazard"] = np.where(
            df["Target_Next_Day_Temperature"] >= 26.0, 2,
            np.where(df["Target_Next_Day_Temperature"] >= 24.0, 1, 0)
        )
        # 2. Heavy Rainfall Hazard (Binary: 0=Normal <=20mm, 1=Heavy Rainfall >20mm)
        df["Target_Heavy_Rainfall"] = (df["Target_Next_Day_Rainfall"] >= 20.0).astype(int)

        self._df = df

    def get_metadata(self) -> Dict[str, Any]:
        """Return available targets, algorithms, dataset statistics, and features."""
        total_rows = len(self._df) if self._df is not None else 0
        train_rows = int(total_rows * 0.8)
        test_rows = total_rows - train_rows

        return {
            "targets": [
                {
                    "id": "Target_Next_Day_Temperature",
                    "name": "Next-Day Mean Temperature (°C)",
                    "type": "regression",
                    "unit": "°C",
                    "description": "Continuous daily state-averaged temperature prediction",
                },
                {
                    "id": "Target_Next_Day_Rainfall",
                    "name": "Next-Day Daily Rainfall (mm)",
                    "type": "regression",
                    "unit": "mm",
                    "description": "Continuous daily state-averaged precipitation prediction",
                },
                {
                    "id": "Target_Heat_Hazard",
                    "name": "Urban Heat Risk Tier (Multi-Hazard)",
                    "type": "classification",
                    "classes": ["Normal Baseline", "High Watch", "Critical Alert"],
                    "description": "Multiclass hazard classification based on 44-year climatological thresholds",
                },
                {
                    "id": "Target_Heavy_Rainfall",
                    "name": "Excess Precipitation Alert (>20mm)",
                    "type": "classification",
                    "classes": ["Normal / Moderate", "Heavy Rainfall Alert"],
                    "description": "Binary classification of acute urban stormwater stress",
                },
            ],
            "regression_algorithms": list(REGRESSION_ALGORITHMS.keys()),
            "classification_algorithms": list(CLASSIFICATION_ALGORITHMS.keys()),
            "total_samples": total_rows,
            "train_samples": train_rows,
            "test_samples": test_rows,
            "feature_count": len(self._feature_cols),
            "features": self._feature_cols,
            "date_range": {
                "start": str(self._df["Date"].min().date()) if self._df is not None else "",
                "end": str(self._df["Date"].max().date()) if self._df is not None else "",
            },
            "split_method": "Chronological (80% Train, 20% Unseen Forward Test Set)",
        }

    def _prepare_data(self, target: str, sample_limit: Optional[int] = None) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, List[str]]:
        """Split data chronologically to guarantee zero data leakage."""
        if self._df is None:
            raise ValueError("Dataset not available.")

        df = self._df.dropna(subset=[target] + self._feature_cols)
        if sample_limit and sample_limit < len(df):
            # Take latest N samples chronologically
            df = df.iloc[-sample_limit:].reset_index(drop=True)

        X = df[self._feature_cols].values
        y = df[target].values
        dates = df["Date"].astype(str).tolist()

        n_samples = len(X)
        split_idx = int(n_samples * 0.8)

        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]
        test_dates = dates[split_idx:]

        return X_train, X_test, y_train, y_test, test_dates

    def evaluate_regression(
        self,
        target: str = "Target_Next_Day_Temperature",
        selected_algos: Optional[List[str]] = None,
        sample_limit: Optional[int] = 8000,
        force_retrain: bool = False,
    ) -> Dict[str, Any]:
        """Train and evaluate selected regression models with identical chronological test splits."""
        cache_key = f"reg_{target}_{sample_limit}"
        if not force_retrain and cache_key in self._cache:
            return dict(self._cache[cache_key])

        if selected_algos is None:
            selected_algos = list(REGRESSION_ALGORITHMS.keys())

        X_train, X_test, y_train, y_test, test_dates = self._prepare_data(target, sample_limit=sample_limit)
        results = []
        best_r2_algo = None
        best_r2 = -float("inf")

        for algo_name in selected_algos:
            if algo_name not in REGRESSION_ALGORITHMS:
                continue

            model_factory = REGRESSION_ALGORITHMS[algo_name]
            model = model_factory()

            # Measure training time
            t0 = time.perf_counter()
            model.fit(X_train, y_train)
            train_time = round(time.perf_counter() - t0, 3)

            # Measure inference time
            t1 = time.perf_counter()
            y_pred = model.predict(X_test)
            inf_time_ms = round(((time.perf_counter() - t1) / len(X_test)) * 1000, 4)

            # Calculate actual metrics
            mae = round(float(mean_absolute_error(y_test, y_pred)), 4)
            mse = round(float(mean_squared_error(y_test, y_pred)), 4)
            rmse = round(float(np.sqrt(mse)), 4)
            r2 = round(float(r2_score(y_test, y_pred)), 4)

            if r2 > best_r2:
                best_r2 = r2
                best_r2_algo = algo_name

            # Subsample 80 points for charting actual vs predicted
            step = max(1, len(y_test) // 80)
            chart_actual = [round(float(v), 2) for v in y_test[::step]]
            chart_pred = [round(float(v), 2) for v in y_pred[::step]]
            chart_dates = test_dates[::step]

            # Residual statistics
            residuals = y_test - y_pred
            res_mean = round(float(np.mean(residuals)), 4)
            res_std = round(float(np.std(residuals)), 4)

            # Feature importance if available
            feature_imp = []
            core_model = model.named_steps["model"] if isinstance(model, Pipeline) else model
            if hasattr(core_model, "feature_importances_"):
                imp = core_model.feature_importances_
                top_idx = np.argsort(imp)[::-1][:6]
                feature_imp = [{"feature": self._feature_cols[i], "importance": round(float(imp[i]), 4)} for i in top_idx]
            elif hasattr(core_model, "coef_"):
                imp = np.abs(core_model.coef_)
                top_idx = np.argsort(imp)[::-1][:6]
                feature_imp = [{"feature": self._feature_cols[i], "importance": round(float(imp[i]), 4)} for i in top_idx]

            metrics_record = {
                "mae": mae,
                "mse": mse,
                "rmse": rmse,
                "r2": r2,
            }

            # Save evaluation record to DB
            try:
                save_algorithm_evaluation(target, "regression", algo_name, metrics_record, train_time, inf_time_ms)
            except Exception:
                pass

            results.append({
                "algorithm": algo_name,
                "mae": mae,
                "mse": mse,
                "rmse": rmse,
                "r2": r2,
                "mean_residual": res_mean,
                "residual_std": res_std,
                "training_time_sec": train_time,
                "inference_time_ms": inf_time_ms,
                "chart_dates": chart_dates,
                "chart_actual": chart_actual,
                "chart_predicted": chart_pred,
                "feature_importances": feature_imp,
            })

        # Rank results by R2 score descending
        results.sort(key=lambda x: x["r2"], reverse=True)

        models_dict = {r["algorithm"]: r for r in results}
        payload = {
            "status": "success",
            "task_type": "regression",
            "target": target,
            "test_sample_count": len(y_test),
            "best_algorithm": best_r2_algo,
            "models_evaluated": len(results),
            "results": results,
            "models": models_dict,
        }
        self._cache[cache_key] = payload
        return payload

    def compare_algorithms(
        self,
        target: str = "temperature",
        algorithms: Optional[List[str]] = None,
        sample_limit: Optional[int] = 8000,
    ) -> Dict[str, Any]:
        """Train, evaluate, and benchmark user-selected regression algorithms."""
        target_col = (
            "Target_Next_Day_Rainfall"
            if "rain" in str(target).lower()
            else "Target_Next_Day_Temperature"
        )
        target_name = (
            "Next-Day Daily Rainfall (mm)"
            if "rain" in str(target).lower()
            else "Next-Day Mean Temperature (°C)"
        )
        unit = "mm" if "rain" in str(target).lower() else "°C"

        if not algorithms:
            selected_keys = list(REGRESSION_ALGORITHMS.keys())
        else:
            selected_keys = []
            for name in algorithms:
                cleaned = str(name).strip().lower()
                canonical = CANONICAL_ALGO_NAMES.get(cleaned, name)
                if canonical in REGRESSION_ALGORITHMS and canonical not in selected_keys:
                    selected_keys.append(canonical)

        if len(selected_keys) < 2:
            raise ValueError("At least 2 valid algorithms must be selected for comparison.")

        X_train, X_test, y_train, y_test, test_dates = self._prepare_data(target_col, sample_limit=sample_limit)
        results = []
        best_r2 = -float("inf")
        best_algo_name = None

        for key in selected_keys:
            display_name = DISPLAY_NAMES.get(key, key)
            factory = REGRESSION_ALGORITHMS[key]
            model = factory()

            t0 = time.perf_counter()
            model.fit(X_train, y_train)
            train_time = round(time.perf_counter() - t0, 3)

            t1 = time.perf_counter()
            y_pred = model.predict(X_test)
            inf_time_ms = round(((time.perf_counter() - t1) / len(X_test)) * 1000, 4)

            mae = round(float(mean_absolute_error(y_test, y_pred)), 4)
            mse = round(float(mean_squared_error(y_test, y_pred)), 4)
            rmse = round(float(np.sqrt(mse)), 4)
            r2 = round(float(r2_score(y_test, y_pred)), 4)

            if r2 > best_r2:
                best_r2 = r2
                best_algo_name = display_name

            step = max(1, len(y_test) // 80)
            chart_actual = [round(float(v), 2) for v in y_test[::step]]
            chart_pred = [round(float(v), 2) for v in y_pred[::step]]
            chart_dates = test_dates[::step]

            metrics_record = {"mae": mae, "mse": mse, "rmse": rmse, "r2": r2}
            try:
                save_algorithm_evaluation(target_col, "regression", display_name, metrics_record, train_time, inf_time_ms)
            except Exception:
                pass

            results.append({
                "algorithm": display_name,
                "canonical_name": key,
                "mae": mae,
                "mse": mse,
                "rmse": rmse,
                "r2": r2,
                "training_time_sec": train_time,
                "prediction_time_ms": inf_time_ms,
                "chart_dates": chart_dates,
                "chart_actual": chart_actual,
                "chart_predicted": chart_pred,
            })

        # Rank by R2 descending
        results.sort(key=lambda x: x["r2"], reverse=True)

        # Prepare aggregated data for comparison charts
        labels = [r["algorithm"] for r in results]
        mae_values = [r["mae"] for r in results]
        rmse_values = [r["rmse"] for r in results]
        r2_values = [r["r2"] for r in results]
        train_times = [r["training_time_sec"] for r in results]
        pred_times = [r["prediction_time_ms"] for r in results]

        return {
            "status": "success",
            "target": "rainfall" if "rain" in str(target).lower() else "temperature",
            "target_col": target_col,
            "target_name": target_name,
            "unit": unit,
            "algorithms_evaluated": len(results),
            "best_algorithm": best_algo_name,
            "best_r2": best_r2,
            "results": results,
            "models": {r["algorithm"]: r for r in results},
            "comparison_charts": {
                "labels": labels,
                "mae": mae_values,
                "rmse": rmse_values,
                "r2": r2_values,
                "training_time_sec": train_times,
                "prediction_time_ms": pred_times,
            },
        }

    def evaluate_classification(
        self,
        target: str = "Target_Heat_Hazard",
        selected_algos: Optional[List[str]] = None,
        sample_limit: Optional[int] = 6000,
    ) -> Dict[str, Any]:
        """Train and evaluate selected classification models with identical chronological test splits."""
        if selected_algos is None:
            selected_algos = list(CLASSIFICATION_ALGORITHMS.keys())

        X_train, X_test, y_train, y_test, test_dates = self._prepare_data(target, sample_limit=sample_limit)
        results = []
        best_f1_algo = None
        best_f1 = -float("inf")
        classes = sorted(list(np.unique(y_train)))

        for algo_name in selected_algos:
            if algo_name not in CLASSIFICATION_ALGORITHMS:
                continue

            model_factory = CLASSIFICATION_ALGORITHMS[algo_name]
            model = model_factory()

            # Measure training time
            t0 = time.perf_counter()
            model.fit(X_train, y_train)
            train_time = round(time.perf_counter() - t0, 3)

            # Measure inference time
            t1 = time.perf_counter()
            y_pred = model.predict(X_test)
            inf_time_ms = round(((time.perf_counter() - t1) / len(X_test)) * 1000, 4)

            # Probabilities for ROC-AUC
            y_prob = None
            if hasattr(model, "predict_proba"):
                try:
                    y_prob = model.predict_proba(X_test)
                except Exception:
                    y_prob = None

            # Calculate actual metrics
            acc = round(float(accuracy_score(y_test, y_pred)), 4)
            is_multiclass = len(classes) > 2
            avg_mode = "weighted" if is_multiclass else "binary"

            prec = round(float(precision_score(y_test, y_pred, average=avg_mode, zero_division=0)), 4)
            rec = round(float(recall_score(y_test, y_pred, average=avg_mode, zero_division=0)), 4)
            f1 = round(float(f1_score(y_test, y_pred, average=avg_mode, zero_division=0)), 4)

            # Specificity & Confusion Matrix
            cm = confusion_matrix(y_test, y_pred, labels=classes)
            cm_list = cm.tolist()

            # ROC-AUC calculation
            roc_auc_val = None
            if y_prob is not None:
                try:
                    if is_multiclass:
                        roc_auc_val = round(float(roc_auc_score(y_test, y_prob, multi_class="ovr", average="weighted")), 4)
                    else:
                        roc_auc_val = round(float(roc_auc_score(y_test, y_prob[:, 1])), 4)
                except Exception:
                    roc_auc_val = None

            # Specificity (True Negative Rate)
            if not is_multiclass and len(cm_list) == 2 and len(cm_list[0]) == 2:
                tn, fp, fn, tp = cm.ravel()
                specificity = round(float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0, 4)
            else:
                specificity = round(float(acc), 4)

            if f1 > best_f1:
                best_f1 = f1
                best_f1_algo = algo_name

            metrics_record = {
                "accuracy": acc,
                "precision": prec,
                "recall": rec,
                "f1": f1,
                "roc_auc": roc_auc_val,
            }

            try:
                save_algorithm_evaluation(target, "classification", algo_name, metrics_record, train_time, inf_time_ms)
            except Exception:
                pass

            results.append({
                "algorithm": algo_name,
                "accuracy": acc,
                "precision": prec,
                "recall": rec,
                "f1": f1,
                "specificity": specificity,
                "roc_auc": roc_auc_val,
                "confusion_matrix": cm_list,
                "classes": [str(c) for c in classes],
                "training_time_sec": train_time,
                "inference_time_ms": inf_time_ms,
            })

        results.sort(key=lambda x: x["f1"], reverse=True)

        return {
            "status": "success",
            "task_type": "classification",
            "target": target,
            "test_sample_count": len(y_test),
            "best_algorithm": best_f1_algo,
            "models_evaluated": len(results),
            "results": results,
        }

    def run_cross_validation(self, target: str, algorithm: str, n_splits: int = 5) -> Dict[str, Any]:
        """Perform robust Time-Series Cross Validation avoiding lookahead bias."""
        if target.startswith("Target_Next_Day"):
            task_type = "regression"
            if algorithm not in REGRESSION_ALGORITHMS:
                return {"status": "error", "message": f"Algorithm '{algorithm}' not found for regression."}
            model_factory = REGRESSION_ALGORITHMS[algorithm]
        else:
            task_type = "classification"
            if algorithm not in CLASSIFICATION_ALGORITHMS:
                return {"status": "error", "message": f"Algorithm '{algorithm}' not found for classification."}
            model_factory = CLASSIFICATION_ALGORITHMS[algorithm]

        df = self._df.dropna(subset=[target] + self._feature_cols).iloc[-5000:]
        X = df[self._feature_cols].values
        y = df[target].values

        tscv = TimeSeriesSplit(n_splits=n_splits)
        fold_scores = []

        for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
            X_tr, X_val = X[train_idx], X[val_idx]
            y_tr, y_val = y[train_idx], y[val_idx]

            m = model_factory()
            m.fit(X_tr, y_tr)
            preds = m.predict(X_val)

            if task_type == "regression":
                score = round(float(r2_score(y_val, preds)), 4)
                mae = round(float(mean_absolute_error(y_val, preds)), 4)
                rmse = round(float(np.sqrt(mean_squared_error(y_val, preds))), 4)
                fold_scores.append({"fold": fold + 1, "r2": score, "mae": mae, "rmse": rmse, "samples": len(val_idx)})
            else:
                score = round(float(f1_score(y_val, preds, average="weighted", zero_division=0)), 4)
                acc = round(float(accuracy_score(y_val, preds)), 4)
                fold_scores.append({"fold": fold + 1, "f1": score, "accuracy": acc, "samples": len(val_idx)})

        main_metric = "r2" if task_type == "regression" else "f1"
        mean_score = round(float(np.mean([f[main_metric] for f in fold_scores])), 4)
        std_score = round(float(np.std([f[main_metric] for f in fold_scores])), 4)

        return {
            "status": "success",
            "target": target,
            "algorithm": algorithm,
            "task_type": task_type,
            "n_splits": n_splits,
            "mean_score": mean_score,
            "std_score": std_score,
            "main_metric": main_metric,
            "folds": fold_scores,
        }


_ALGORITHM_LAB_SERVICE: Optional[AlgorithmLabService] = None


def get_algorithm_lab_service(project_root: Optional[Path] = None) -> AlgorithmLabService:
    global _ALGORITHM_LAB_SERVICE
    if _ALGORITHM_LAB_SERVICE is None:
        if project_root is None:
            project_root = Path(__file__).resolve().parent.parent.parent
        _ALGORITHM_LAB_SERVICE = AlgorithmLabService(project_root)
    return _ALGORITHM_LAB_SERVICE
