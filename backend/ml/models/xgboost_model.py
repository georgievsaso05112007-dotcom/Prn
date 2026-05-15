"""
XGBoost-based trading model for 3-class directional prediction.

Uses multi:softprob objective so that predict_proba() returns calibrated
class probabilities for DOWN / NEUTRAL / UP.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, Optional

import joblib
import numpy as np
from xgboost import XGBClassifier

logger = logging.getLogger(__name__)


class XGBoostTradingModel:
    """
    XGBoost classifier wrapper with save/load and feature-importance support.

    Parameters
    ----------
    n_estimators:
        Number of boosting rounds (trees).  With early stopping active the
        actual number may be lower.
    max_depth:
        Maximum depth of each tree.
    learning_rate:
        Step-size shrinkage (eta).
    subsample:
        Row-sampling ratio per tree.
    colsample_bytree:
        Column-sampling ratio per tree.
    early_stopping_rounds:
        Stop training if validation metric does not improve for this many
        consecutive rounds.  Requires a validation set to be supplied to
        :meth:`fit`.
    """

    def __init__(
        self,
        n_estimators: int = 200,
        max_depth: int = 6,
        learning_rate: float = 0.05,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        early_stopping_rounds: int = 20,
        random_state: int = 42,
    ) -> None:
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.subsample = subsample
        self.colsample_bytree = colsample_bytree
        self.early_stopping_rounds = early_stopping_rounds
        self.random_state = random_state

        self.feature_names_: Optional[list[str]] = None
        self.model: XGBClassifier = self._build_model()

    # ------------------------------------------------------------------ #

    def _build_model(self) -> XGBClassifier:
        return XGBClassifier(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            learning_rate=self.learning_rate,
            subsample=self.subsample,
            colsample_bytree=self.colsample_bytree,
            objective="multi:softprob",
            num_class=3,
            eval_metric="mlogloss",
            use_label_encoder=False,
            random_state=self.random_state,
            n_jobs=-1,
            tree_method="hist",          # fast CPU / GPU compatible
        )

    # ------------------------------------------------------------------ #

    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None,
        feature_names: Optional[list[str]] = None,
    ) -> "XGBoostTradingModel":
        """
        Train the XGBoost classifier.

        Parameters
        ----------
        X_train:
            2-D feature array of shape (n_train, n_features).
        y_train:
            Integer labels 0/1/2 of shape (n_train,).
        X_val, y_val:
            Optional validation split for early stopping.
        feature_names:
            Column names, stored for :meth:`get_feature_importance`.

        Returns
        -------
        self
        """
        if feature_names is not None:
            self.feature_names_ = feature_names

        fit_params: dict = {}
        if X_val is not None and y_val is not None:
            fit_params["eval_set"] = [(X_val, y_val)]
            fit_params["verbose"] = False
            # Rebuild model with early_stopping_rounds
            self.model = self._build_model()
            self.model.set_params(early_stopping_rounds=self.early_stopping_rounds)
        else:
            self.model = self._build_model()

        self.model.fit(X_train, y_train, **fit_params)

        best = getattr(self.model, "best_iteration", None)
        n_trees = self.model.best_ntree_limit if hasattr(self.model, "best_ntree_limit") else self.n_estimators
        logger.info(
            "XGBoost training complete. best_iteration=%s, n_estimators=%s",
            best,
            n_trees,
        )
        return self

    # ------------------------------------------------------------------ #

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Predict class probabilities.

        Parameters
        ----------
        X:
            2-D array of shape (n_samples, n_features).

        Returns
        -------
        np.ndarray of shape (n_samples, 3)
            Columns: [P(DOWN), P(NEUTRAL), P(UP)].
        """
        probs = self.model.predict_proba(X)
        if probs.shape[1] != 3:
            # Pad missing classes with zeros (edge case with homogeneous data)
            padded = np.zeros((probs.shape[0], 3), dtype=np.float32)
            for i, cls in enumerate(self.model.classes_):
                padded[:, int(cls)] = probs[:, i]
            return padded
        return probs.astype(np.float32)

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Return predicted class indices (argmax of predict_proba)."""
        return self.predict_proba(X).argmax(axis=1)

    # ------------------------------------------------------------------ #

    def get_feature_importance(self) -> Dict[str, float]:
        """
        Return a dict mapping feature name → importance score (gain).

        If no feature names are stored, keys are "f0", "f1", … etc.
        """
        importance = self.model.feature_importances_

        if self.feature_names_ is not None and len(self.feature_names_) == len(importance):
            names = self.feature_names_
        else:
            names = [f"f{i}" for i in range(len(importance))]

        result = dict(zip(names, importance.tolist()))
        return dict(sorted(result.items(), key=lambda kv: kv[1], reverse=True))

    # ------------------------------------------------------------------ #

    def save(self, path: str) -> None:
        """
        Persist the trained model (and metadata) to *path* via joblib.

        Parameters
        ----------
        path:
            File path, e.g. ``./models/checkpoints/btcusdt_xgb.pkl``.
        """
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "model": self.model,
            "feature_names": self.feature_names_,
            "config": {
                "n_estimators": self.n_estimators,
                "max_depth": self.max_depth,
                "learning_rate": self.learning_rate,
                "subsample": self.subsample,
                "colsample_bytree": self.colsample_bytree,
            },
        }
        joblib.dump(payload, path, compress=3)
        logger.info("XGBoost model saved → %s", path)

    def load(self, path: str) -> "XGBoostTradingModel":
        """
        Load a previously saved model from *path*.

        Returns
        -------
        self  (for chaining)
        """
        payload = joblib.load(path)
        self.model = payload["model"]
        self.feature_names_ = payload.get("feature_names")
        cfg = payload.get("config", {})
        self.n_estimators = cfg.get("n_estimators", self.n_estimators)
        self.max_depth = cfg.get("max_depth", self.max_depth)
        self.learning_rate = cfg.get("learning_rate", self.learning_rate)
        logger.info("XGBoost model loaded ← %s", path)
        return self
