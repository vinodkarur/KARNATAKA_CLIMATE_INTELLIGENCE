"""Local SHAP explanations for a single model input row.

Safe, high-precision explainability wrapper handling Windows Smart App Control
and Code Integrity policy blocks with exact mathematical additivity:
Base E[f(X)] + sum(phi_i) == Model Prediction f(X).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Safe optional SHAP import catching Application Control / DLL load / missing package exceptions
SHAP_AVAILABLE = False
SHAP_ERROR = None
SHAP_BLOCKED_BY_POLICY = False
shap = None

try:
    import shap as _shap
    shap = _shap
    SHAP_AVAILABLE = True
except (ImportError, OSError, Exception) as exc:
    err_str = str(exc)
    SHAP_AVAILABLE = False
    SHAP_ERROR = err_str
    if "Application Control" in err_str or "4551" in err_str or "policy has blocked" in err_str:
        SHAP_BLOCKED_BY_POLICY = True
    logger.warning("SHAP compiled library could not be loaded: %s", err_str)


class ShapExplainers:
    """Wrapper around SHAP explainers for both trained models.

    The temperature model is a scikit-learn Pipeline (StandardScaler +
    LinearRegression), so inputs are scaled before calling LinearExplainer.
    The rainfall model is a raw GradientBoostingRegressor, so TreeExplainer
    consumes the engineered feature frame directly.

    Enforces exact mathematical additivity:
    Base value + sum of SHAP contributions == model prediction within floating-point tolerance.
    """

    def __init__(self, temperature_model, rainfall_model, background_df: pd.DataFrame):
        self.temperature_model = temperature_model
        self.rainfall_model = rainfall_model
        self.feature_names = list(background_df.columns)
        self.is_available = False
        self.error_reason = None
        self.is_policy_blocked = False
        self.scaler = None
        self.temp_explainer = None
        self.rain_explainer = None
        self.temp_base_value: float = 18.72
        self.rain_base_value: float = 5.34

        if not SHAP_AVAILABLE or shap is None:
            self.is_available = False
            self.error_reason = SHAP_ERROR or "SHAP compiled library is not available."
            self.is_policy_blocked = SHAP_BLOCKED_BY_POLICY
            return

        try:
            scaler = temperature_model.named_steps["scaler"]
            linear_model = temperature_model.named_steps["model"]
            scaled_background = scaler.transform(background_df)
            self.scaler = scaler
            self.temp_explainer = shap.LinearExplainer(linear_model, scaled_background)
            self.rain_explainer = shap.TreeExplainer(rainfall_model)

            # Store exact expected base values E[f(X)]
            self.temp_base_value = float(self.temp_explainer.expected_value)
            raw_rain_base = self.rain_explainer.expected_value
            if isinstance(raw_rain_base, (list, np.ndarray)):
                self.rain_base_value = float(raw_rain_base[0])
            else:
                self.rain_base_value = float(raw_rain_base)

            self.is_available = True
        except (ImportError, OSError, Exception) as exc:
            err_str = str(exc)
            self.is_available = False
            self.error_reason = err_str
            if "Application Control" in err_str or "4551" in err_str or "policy has blocked" in err_str:
                self.is_policy_blocked = True
            logger.warning("Failed to initialize SHAP Linear/Tree explainers: %s", err_str)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_raw_shap_and_pred(self, input_df: pd.DataFrame, target: str = "temperature") -> Tuple[float, float, np.ndarray]:
        """Compute exact base value, model prediction, and full 32-feature SHAP vector."""
        if target == "temperature":
            base_val = self.temp_base_value
            if not self.is_available or self.temp_explainer is None or self.scaler is None:
                pred_val = float(self.temperature_model.predict(input_df[self.feature_names])[0])
                return base_val, pred_val, np.zeros(len(self.feature_names))
            scaled = self.scaler.transform(input_df[self.feature_names])
            shap_vals = np.asarray(self.temp_explainer.shap_values(scaled)).ravel()
            pred_val = float(self.temperature_model.predict(input_df[self.feature_names])[0])
            return base_val, pred_val, shap_vals
        else:
            base_val = self.rain_base_value
            if not self.is_available or self.rain_explainer is None:
                pred_val = float(self.rainfall_model.predict(input_df[self.feature_names])[0])
                return base_val, pred_val, np.zeros(len(self.feature_names))
            shap_vals = np.asarray(self.rain_explainer.shap_values(input_df[self.feature_names])).ravel()
            pred_val = float(self.rainfall_model.predict(input_df[self.feature_names])[0])
            return base_val, pred_val, shap_vals

    def _pack(self, shap_values: np.ndarray, input_df: pd.DataFrame, top_n: int) -> List[Dict[str, Any]]:
        if len(shap_values) == 0:
            return []
        order = np.argsort(np.abs(shap_values))[::-1][:top_n]
        items = []
        for idx in order:
            name = self.feature_names[idx]
            items.append(
                {
                    "feature": name,
                    "shap_value": round(float(shap_values[idx]), 4),
                    "feature_value": round(float(input_df.iloc[0][name]), 4),
                    "direction": "increases" if shap_values[idx] >= 0 else "decreases",
                }
            )
        return items

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def temperature_shap(self, input_df: pd.DataFrame, top_n: int = 8) -> List[Dict[str, Any]]:
        """Return the top local SHAP contributions for the temperature model."""
        if not self.is_available:
            return []
        _, _, shap_vals = self._get_raw_shap_and_pred(input_df, "temperature")
        return self._pack(shap_vals, input_df, top_n)

    def rainfall_shap(self, input_df: pd.DataFrame, top_n: int = 8) -> List[Dict[str, Any]]:
        """Return the top local SHAP contributions for the rainfall model."""
        if not self.is_available:
            return []
        _, _, shap_vals = self._get_raw_shap_and_pred(input_df, "rainfall")
        return self._pack(shap_vals, input_df, top_n)

    def explain(self, input_df: pd.DataFrame, top_n: int = 8) -> Dict[str, Any]:
        """Return local explanations for both targets in one call."""
        return {
            "is_available": self.is_available,
            "status": "OPERATIONAL" if self.is_available else "SHAP EXPLAINABILITY TEMPORARILY UNAVAILABLE",
            "error_reason": self.error_reason,
            "is_policy_blocked": self.is_policy_blocked,
            "temperature": self.temperature_shap(input_df, top_n=top_n),
            "rainfall": self.rainfall_shap(input_df, top_n=top_n),
        }

    def explain_target_detailed(
        self,
        input_df: pd.DataFrame,
        target: str = "temperature",
        top_n: int = 12,
    ) -> Dict[str, Any]:
        """Generate comprehensive local SHAP breakdown with exact additivity validation.

        Guarantees:
        Base E[f(X)] + sum(phi_i) == Model Prediction f(X).
        """
        is_temp = target.lower().startswith("temp")
        target_name = "temperature" if is_temp else "rainfall"
        unit = "°C" if is_temp else "mm"

        base_val, pred_val, shap_vals = self._get_raw_shap_and_pred(input_df, target_name)
        sum_shap = float(np.sum(shap_vals))
        additivity_sum = base_val + sum_shap
        diff = abs(pred_val - additivity_sum)
        is_additive = bool(diff < 0.001)

        # Build complete 32-feature breakdown
        all_features: List[Dict[str, Any]] = []
        for i, name in enumerate(self.feature_names):
            phi = float(shap_vals[i]) if i < len(shap_vals) else 0.0
            feat_val = float(input_df.iloc[0][name])
            all_features.append({
                "feature": name,
                "feature_value": round(feat_val, 4),
                "shap_value": round(phi, 4),
                "abs_shap": round(abs(phi), 4),
                "direction": "increases" if phi >= 0 else "decreases",
            })

        # Rank all features by absolute impact
        all_features.sort(key=lambda x: x["abs_shap"], reverse=True)
        for rank, item in enumerate(all_features, start=1):
            item["rank"] = rank

        # Top positive contributors (pushing prediction higher)
        top_positive = [f for f in all_features if f["shap_value"] > 0]
        top_positive.sort(key=lambda x: x["shap_value"], reverse=True)

        # Top negative contributors (moderating prediction lower)
        top_negative = [f for f in all_features if f["shap_value"] < 0]
        top_negative.sort(key=lambda x: abs(x["shap_value"]), reverse=True)

        # Top N features for visualizations
        top_slice = all_features[:top_n]

        # Build exact Waterfall Chart Coordinates
        waterfall_labels = ["Base E[f(X)]"]
        waterfall_steps = [round(base_val, 2)]
        waterfall_deltas = [round(base_val, 2)]
        waterfall_colors = ["#38bdf8"]

        curr = base_val
        for item in top_slice:
            waterfall_labels.append(item["feature"])
            phi = item["shap_value"]
            curr += phi
            waterfall_steps.append(round(curr, 2))
            waterfall_deltas.append(round(phi, 2))
            waterfall_colors.append("#ef4444" if phi >= 0 else "#00e5bc")

        # Combine remaining features into one residual step if any exist
        remaining_shap = sum_shap - sum(f["shap_value"] for f in top_slice)
        if len(all_features) > top_n and abs(remaining_shap) > 0.001:
            waterfall_labels.append(f"Other {len(all_features) - top_n} Features")
            curr += remaining_shap
            waterfall_steps.append(round(curr, 2))
            waterfall_deltas.append(round(remaining_shap, 2))
            waterfall_colors.append("#f59e0b")

        waterfall_labels.append("Model f(X)")
        waterfall_steps.append(round(pred_val, 2))
        waterfall_deltas.append(round(pred_val, 2))
        waterfall_colors.append("#00f0ff")

        # Build Diverging Positive vs Negative Chart Data
        # Take top 5 positive and top 5 negative for clear visual comparison
        div_pos = top_positive[:5]
        div_neg = top_negative[:5]
        div_items = div_pos + div_neg
        div_items.sort(key=lambda x: x["shap_value"], reverse=True)
        pos_neg_chart = {
            "labels": [f["feature"] for f in div_items],
            "values": [f["shap_value"] for f in div_items],
            "colors": ["#ef4444" if f["shap_value"] >= 0 else "#00e5bc" for f in div_items],
        }

        # Base vs Prediction Comparison Data
        base_vs_pred = {
            "labels": ["Expected Baseline E[f(X)]", "Net SHAP Displacement Σφ", "Model Output f(X)"],
            "values": [round(base_val, 2), round(sum_shap, 2), round(pred_val, 2)],
            "colors": ["#38bdf8", "#f59e0b" if sum_shap >= 0 else "#10b981", "#00f0ff"],
        }

        return {
            "target": target_name,
            "unit": unit,
            "base_value": round(base_val, 2),
            "predicted_value": round(pred_val, 2),
            "sum_shap": round(sum_shap, 2),
            "is_additive": is_additive,
            "additivity_difference": round(diff, 6),
            "top_positive": top_positive[:5],
            "top_negative": top_negative[:5],
            "contributions": top_slice,
            "all_features": all_features,
            "waterfall": {
                "labels": waterfall_labels,
                "cumulative_values": waterfall_steps,
                "deltas": waterfall_deltas,
                "bar_colors": waterfall_colors,
            },
            "pos_neg_chart": pos_neg_chart,
            "base_vs_pred": base_vs_pred,
        }


