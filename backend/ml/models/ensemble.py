"""
Ensemble model combining LSTM and XGBoost predictions.

Also contains ModelRegistry for tracking trained model versions.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch

from .lstm_model import LSTMTradingModel
from .xgboost_model import XGBoostTradingModel

logger = logging.getLogger(__name__)

_CLASSES = ["DOWN", "NEUTRAL", "UP"]
_SIGNAL_MAP = {0: "SELL", 1: "NEUTRAL", 2: "BUY"}


# --------------------------------------------------------------------------- #
#  Ensemble                                                                    #
# --------------------------------------------------------------------------- #


class EnsembleModel:
    """
    Weighted-average ensemble of an LSTM and an XGBoost model.

    Parameters
    ----------
    lstm_model:
        Trained :class:`LSTMTradingModel` instance.
    xgb_model:
        Trained :class:`XGBoostTradingModel` instance.
    weights:
        (lstm_weight, xgb_weight).  Need not sum to 1; they are
        normalised internally.  Defaults to (0.5, 0.5).
    """

    def __init__(
        self,
        lstm_model: LSTMTradingModel,
        xgb_model: XGBoostTradingModel,
        weights: Tuple[float, float] = (0.5, 0.5),
    ) -> None:
        self.lstm_model = lstm_model
        self.xgb_model = xgb_model
        self._set_weights(weights)

        # Infer device from LSTM model parameters
        try:
            self._device = next(lstm_model.parameters()).device
        except StopIteration:
            self._device = torch.device("cpu")

    # ------------------------------------------------------------------ #

    def _set_weights(self, weights: Tuple[float, float]) -> None:
        total = weights[0] + weights[1]
        if total <= 0:
            raise ValueError("Ensemble weights must be positive.")
        self.lstm_weight = weights[0] / total
        self.xgb_weight = weights[1] / total

    # ------------------------------------------------------------------ #

    def predict(
        self,
        lstm_input: np.ndarray,
        xgb_input: np.ndarray,
    ) -> Dict:
        """
        Produce a trading signal from both models.

        Parameters
        ----------
        lstm_input:
            3-D array of shape (1, seq_len, n_lstm_features) *or*
            (seq_len, n_lstm_features) — a single sample.
        xgb_input:
            2-D array of shape (1, n_xgb_features) *or*
            (n_xgb_features,) — a single sample.

        Returns
        -------
        dict with keys:
            signal       : "BUY" | "SELL" | "NEUTRAL"
            confidence   : float ∈ [0, 1]
            probabilities: {"DOWN": float, "NEUTRAL": float, "UP": float}
            lstm_signal  : str
            xgb_signal   : str
        """
        # ---- LSTM probabilities ----------------------------------------
        lstm_probs = self._lstm_proba(lstm_input)          # shape (3,)
        # ---- XGBoost probabilities -------------------------------------
        xgb_probs = self._xgb_proba(xgb_input)            # shape (3,)

        # ---- Weighted average ------------------------------------------
        ensemble_probs = (
            self.lstm_weight * lstm_probs + self.xgb_weight * xgb_probs
        )

        predicted_class = int(np.argmax(ensemble_probs))
        confidence = float(ensemble_probs[predicted_class])

        return {
            "signal": _SIGNAL_MAP[predicted_class],
            "confidence": round(confidence, 4),
            "probabilities": {
                _CLASSES[i]: round(float(ensemble_probs[i]), 4) for i in range(3)
            },
            "lstm_signal": _SIGNAL_MAP[int(np.argmax(lstm_probs))],
            "xgb_signal": _SIGNAL_MAP[int(np.argmax(xgb_probs))],
        }

    # ------------------------------------------------------------------ #

    def update_weights(self, lstm_acc: float, xgb_acc: float) -> None:
        """
        Dynamically adjust model weights via softmax of accuracies.

        Higher recent accuracy ⟹ higher weight.

        Parameters
        ----------
        lstm_acc, xgb_acc:
            Recent validation accuracy (0–1) for each sub-model.
        """
        logits = np.array([lstm_acc, xgb_acc], dtype=np.float64)
        # Numerically stable softmax
        logits -= logits.max()
        exp = np.exp(logits)
        softmax = exp / exp.sum()
        self.lstm_weight = float(softmax[0])
        self.xgb_weight = float(softmax[1])
        logger.info(
            "Ensemble weights updated → LSTM=%.3f  XGB=%.3f",
            self.lstm_weight,
            self.xgb_weight,
        )

    # ------------------------------------------------------------------ #
    #  Private helpers                                                     #
    # ------------------------------------------------------------------ #

    def _lstm_proba(self, x: np.ndarray) -> np.ndarray:
        """Run LSTM forward pass and return numpy probability vector."""
        self.lstm_model.eval()
        if x.ndim == 2:
            x = x[np.newaxis, ...]           # add batch dimension
        tensor = torch.tensor(x, dtype=torch.float32).to(self._device)
        with torch.no_grad():
            probs = self.lstm_model(tensor).cpu().numpy()
        return probs[0]                      # (3,)

    def _xgb_proba(self, x: np.ndarray) -> np.ndarray:
        """Run XGBoost prediction and return numpy probability vector."""
        if x.ndim == 1:
            x = x[np.newaxis, ...]           # add batch dimension
        return self.xgb_model.predict_proba(x)[0]   # (3,)


# --------------------------------------------------------------------------- #
#  Model Registry                                                              #
# --------------------------------------------------------------------------- #


class ModelRegistry:
    """
    File-based registry that tracks trained model versions and their metrics.

    The registry is stored as a JSON file (``registry.json``) inside
    *model_dir*.  Each entry records the model type, file path, and
    validation metrics so the best checkpoint can be retrieved quickly.

    Parameters
    ----------
    model_dir:
        Directory where model checkpoints and the registry file live.
    """

    _REGISTRY_FILENAME = "registry.json"

    def __init__(self, model_dir: str = "./models/checkpoints") -> None:
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self._registry_path = self.model_dir / self._REGISTRY_FILENAME
        self._registry: List[Dict] = self._load_registry()

    # ------------------------------------------------------------------ #

    def register_model(
        self,
        name: str,
        model_type: str,
        metrics: Dict[str, float],
        path: str,
    ) -> None:
        """
        Add a model entry to the registry.

        Parameters
        ----------
        name:
            Human-readable identifier (e.g. ``"BTCUSDT_lstm_v1"``).
        model_type:
            One of ``"lstm"``, ``"xgboost"``, ``"ensemble"``.
        metrics:
            Validation metrics dict (e.g. from :meth:`LSTMTrainer.evaluate`).
        path:
            Absolute or relative path to the saved model file.
        """
        entry = {
            "name": name,
            "model_type": model_type,
            "metrics": metrics,
            "path": str(path),
        }
        # Replace existing entry with same name
        self._registry = [e for e in self._registry if e["name"] != name]
        self._registry.append(entry)
        self._save_registry()
        logger.info("Model registered: %s (%s)  acc=%.4f", name, model_type, metrics.get("accuracy", float("nan")))

    # ------------------------------------------------------------------ #

    def get_best_model(
        self,
        model_type: str,
        metric: str = "val_accuracy",
    ) -> Optional[Dict]:
        """
        Return the registry entry with the highest *metric* value for
        the given *model_type*.

        Returns ``None`` if no matching entries exist.
        """
        candidates = [
            e for e in self._registry if e["model_type"] == model_type
        ]
        if not candidates:
            return None

        def _score(entry: Dict) -> float:
            m = entry.get("metrics", {})
            # Try the exact key first, then fall back to accuracy
            return m.get(metric, m.get("accuracy", -1.0))

        return max(candidates, key=_score)

    # ------------------------------------------------------------------ #

    def get_best_model_for_symbol(
        self,
        symbol: str,
        model_type: str,
        metric: str = "accuracy",
    ) -> Optional[Dict]:
        """
        Return the best registry entry matching *symbol* and *model_type*.
        """
        prefix = symbol.upper()
        candidates = [
            e
            for e in self._registry
            if e["model_type"] == model_type and e["name"].startswith(prefix)
        ]
        if not candidates:
            return None

        def _score(entry: Dict) -> float:
            return entry.get("metrics", {}).get(metric, -1.0)

        return max(candidates, key=_score)

    # ------------------------------------------------------------------ #

    def list_models(self) -> List[Dict]:
        """Return all registered model entries."""
        return list(self._registry)

    # ------------------------------------------------------------------ #
    #  Persistence                                                         #
    # ------------------------------------------------------------------ #

    def _load_registry(self) -> List[Dict]:
        if self._registry_path.exists():
            try:
                with open(self._registry_path, "r") as f:
                    return json.load(f)
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Failed to load registry (%s); starting fresh.", exc)
        return []

    def _save_registry(self) -> None:
        with open(self._registry_path, "w") as f:
            json.dump(self._registry, f, indent=2)
