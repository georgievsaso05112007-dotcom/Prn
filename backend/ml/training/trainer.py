"""
Training orchestrator for the AI trading ML pipeline.

Coordinates feature engineering → train/val split → LSTM training →
XGBoost training → ensemble evaluation → model registration.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from ..features.feature_engineering import FeatureEngineer
from ..models.ensemble import EnsembleModel, ModelRegistry
from ..models.lstm_model import LSTMTradingModel, LSTMTrainer
from ..models.xgboost_model import XGBoostTradingModel

logger = logging.getLogger(__name__)

# Default hyper-parameters (can be overridden via constructor kwargs)
_DEFAULT_LSTM_EPOCHS = 30
_DEFAULT_SEQ_LEN = 60
_DEFAULT_BATCH_SIZE = 32
_DEFAULT_LEARNING_RATE = 0.001
_DEFAULT_HIDDEN_SIZE = 128
_DEFAULT_NUM_LAYERS = 2
_DEFAULT_DROPOUT = 0.2


class TrainingPipeline:
    """
    End-to-end training pipeline for a single trading symbol.

    Parameters
    ----------
    feature_engineer:
        :class:`FeatureEngineer` instance used to create features.
    model_registry:
        :class:`ModelRegistry` for persisting model metadata.
    checkpoint_dir:
        Directory where model checkpoints are written.
    lstm_epochs:
        Number of LSTM training epochs.
    seq_len:
        Sequence length (look-back window) for LSTM.
    val_split:
        Fraction of data reserved for validation (chronological).
    """

    def __init__(
        self,
        feature_engineer: FeatureEngineer,
        model_registry: ModelRegistry,
        checkpoint_dir: str = "./models/checkpoints",
        lstm_epochs: int = _DEFAULT_LSTM_EPOCHS,
        seq_len: int = _DEFAULT_SEQ_LEN,
        val_split: float = 0.2,
    ) -> None:
        self.feature_engineer = feature_engineer
        self.model_registry = model_registry
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.lstm_epochs = lstm_epochs
        self.seq_len = seq_len
        self.val_split = val_split

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    async def train_on_symbol(
        self,
        symbol: str,
        ohlcv_data: List[Dict[str, Any]],
        model_type: str = "ensemble",
    ) -> Dict[str, Any]:
        """
        Run the complete training pipeline for *symbol*.

        Steps
        -----
        1. Convert raw OHLCV list to a DataFrame.
        2. Engineer features.
        3. Chronological 80/20 train/val split (no shuffle).
        4. Train LSTM (sequence model) and XGBoost (flat features).
        5. Evaluate ensemble on the validation set.
        6. Save checkpoints and register them.
        7. Return a structured training report.

        Parameters
        ----------
        symbol:
            Trading symbol string (e.g. ``"BTCUSDT"``).
        ohlcv_data:
            List of dicts with keys: open, high, low, close, volume
            (and optionally timestamp).
        model_type:
            One of ``"lstm"``, ``"xgboost"``, or ``"ensemble"``.

        Returns
        -------
        dict
            Training report with keys: symbol, model_type, lstm_metrics,
            xgb_metrics, ensemble_metrics, n_train, n_val, feature_count.
        """
        logger.info("Training started for symbol=%s  model_type=%s", symbol, model_type)

        # Run CPU-bound work in a thread pool to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        report = await loop.run_in_executor(
            None, self._train_sync, symbol, ohlcv_data, model_type
        )
        return report

    # ------------------------------------------------------------------ #
    #  Data preparation                                                    #
    # ------------------------------------------------------------------ #

    def prepare_data(self, ohlcv_list: List[Dict[str, Any]]) -> pd.DataFrame:
        """
        Convert a list of OHLCV dicts into a pandas DataFrame.

        Accepts both camelCase (``openPrice``) and snake_case (``open``)
        key conventions.  A DatetimeIndex is constructed when a
        ``timestamp`` key is present.

        Parameters
        ----------
        ohlcv_list:
            List of dicts.  Required keys (case-insensitive):
            open, high, low, close, volume.

        Returns
        -------
        pd.DataFrame with columns: open, high, low, close, volume.
        """
        rows = []
        timestamps = []
        for bar in ohlcv_list:
            # Normalise key names
            b = {k.lower(): v for k, v in bar.items()}
            rows.append(
                {
                    "open": float(b.get("open", b.get("openprice", 0))),
                    "high": float(b.get("high", b.get("highprice", 0))),
                    "low": float(b.get("low", b.get("lowprice", 0))),
                    "close": float(b.get("close", b.get("closeprice", 0))),
                    "volume": float(b.get("volume", 0)),
                }
            )
            ts = b.get("timestamp") or b.get("time") or b.get("date")
            timestamps.append(ts)

        df = pd.DataFrame(rows)
        if all(t is not None for t in timestamps):
            try:
                df.index = pd.to_datetime(timestamps, unit="ms", errors="coerce")
                if df.index.isna().any():
                    df.index = pd.to_datetime(timestamps, errors="coerce")
            except Exception:
                pass  # fall back to integer index

        return df

    # ------------------------------------------------------------------ #
    #  LSTM training                                                       #
    # ------------------------------------------------------------------ #

    def train_lstm(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        input_size: int,
    ) -> Tuple[LSTMTradingModel, LSTMTrainer, Dict[str, float]]:
        """
        Instantiate and train the LSTM model.

        Parameters
        ----------
        X_train, X_val:
            Shape (n, seq_len, input_size).
        y_train, y_val:
            Shape (n,) integer labels 0/1/2.
        input_size:
            Number of features per time step.

        Returns
        -------
        (model, trainer, val_metrics_dict)
        """
        model = LSTMTradingModel(
            input_size=input_size,
            hidden_size=_DEFAULT_HIDDEN_SIZE,
            num_layers=_DEFAULT_NUM_LAYERS,
            output_size=3,
            dropout=_DEFAULT_DROPOUT,
        )
        trainer = LSTMTrainer(model, learning_rate=_DEFAULT_LEARNING_RATE)

        best_f1 = -1.0
        best_metrics: Dict[str, float] = {}

        for epoch in range(1, self.lstm_epochs + 1):
            train_loss = trainer.train_epoch(X_train, y_train, batch_size=_DEFAULT_BATCH_SIZE)
            val_metrics = trainer.evaluate(X_val, y_val)

            if val_metrics["f1_macro"] > best_f1:
                best_f1 = val_metrics["f1_macro"]
                best_metrics = val_metrics

            if epoch % 5 == 0 or epoch == self.lstm_epochs:
                logger.info(
                    "LSTM epoch %d/%d  loss=%.4f  val_acc=%.4f  val_f1=%.4f",
                    epoch,
                    self.lstm_epochs,
                    train_loss,
                    val_metrics["accuracy"],
                    val_metrics["f1_macro"],
                )

        return model, trainer, best_metrics

    # ------------------------------------------------------------------ #
    #  XGBoost training                                                   #
    # ------------------------------------------------------------------ #

    def train_xgboost(
        self,
        X_flat_train: np.ndarray,
        y_train: np.ndarray,
        X_flat_val: np.ndarray,
        y_val: np.ndarray,
        feature_names: Optional[List[str]] = None,
    ) -> Tuple[XGBoostTradingModel, Dict[str, float]]:
        """
        Instantiate and train the XGBoost model.

        Parameters
        ----------
        X_flat_train, X_flat_val:
            2-D arrays of shape (n, n_features).  For sequences the
            temporal dimension is flattened into the feature dimension
            before calling this method.
        y_train, y_val:
            Shape (n,) integer labels 0/1/2.
        feature_names:
            Optional list of feature name strings.

        Returns
        -------
        (model, val_metrics_dict)
        """
        from sklearn.metrics import accuracy_score, f1_score

        xgb = XGBoostTradingModel(n_estimators=200, max_depth=6, learning_rate=0.05)
        xgb.fit(X_flat_train, y_train, X_flat_val, y_val, feature_names=feature_names)

        y_pred = xgb.predict(X_flat_val)
        val_metrics = {
            "accuracy": float(accuracy_score(y_val, y_pred)),
            "f1_macro": float(f1_score(y_val, y_pred, average="macro", zero_division=0)),
        }
        logger.info(
            "XGBoost training complete  val_acc=%.4f  val_f1=%.4f",
            val_metrics["accuracy"],
            val_metrics["f1_macro"],
        )
        return xgb, val_metrics

    # ------------------------------------------------------------------ #
    #  Synchronous training logic (runs in executor)                      #
    # ------------------------------------------------------------------ #

    def _train_sync(
        self,
        symbol: str,
        ohlcv_data: List[Dict[str, Any]],
        model_type: str,
    ) -> Dict[str, Any]:
        # 1. Prepare raw DataFrame
        df_raw = self.prepare_data(ohlcv_data)
        if len(df_raw) < 200:
            raise ValueError(
                f"Insufficient data for {symbol}: got {len(df_raw)} bars, need ≥200."
            )

        # 2. Engineer features
        df = self.feature_engineer.create_features(df_raw)
        feature_cols = self.feature_engineer._feature_columns(df)

        # 3. Build target (3-class)
        targets = self.feature_engineer.create_targets(df, horizon=1, threshold=0.001)
        df["_target"] = targets
        df.dropna(subset=["_target"], inplace=True)
        df.reset_index(drop=True, inplace=True)

        # 4. Chronological train / val split (no shuffle)
        split_idx = int(len(df) * (1 - self.val_split))

        df_train = df.iloc[:split_idx]
        df_val = df.iloc[split_idx:]

        y_train_full = df_train["_target"].values.astype(np.int64)
        y_val_full = df_val["_target"].values.astype(np.int64)

        n_train = len(df_train)
        n_val = len(df_val)
        n_features = len(feature_cols)

        logger.info(
            "Data split → train=%d  val=%d  features=%d",
            n_train, n_val, n_features,
        )

        # --- LSTM sequences ---
        X_seq, y_seq = self.feature_engineer.create_sequences(df, seq_len=self.seq_len)
        seq_split = int(len(X_seq) * (1 - self.val_split))
        X_seq_train, X_seq_val = X_seq[:seq_split], X_seq[seq_split:]
        y_seq_train, y_seq_val = y_seq[:seq_split], y_seq[seq_split:]

        # --- XGBoost flat features (use last time step of each sequence) ---
        X_flat_train = X_seq_train[:, -1, :]    # (n, n_features)
        X_flat_val = X_seq_val[:, -1, :]

        report: Dict[str, Any] = {
            "symbol": symbol,
            "model_type": model_type,
            "n_train": n_train,
            "n_val": n_val,
            "feature_count": n_features,
            "lstm_metrics": {},
            "xgb_metrics": {},
            "ensemble_metrics": {},
        }

        lstm_model: Optional[LSTMTradingModel] = None
        xgb_model: Optional[XGBoostTradingModel] = None
        lstm_metrics: Dict[str, float] = {}
        xgb_metrics: Dict[str, float] = {}

        sym_upper = symbol.upper()

        # 5. Train models
        if model_type in ("lstm", "ensemble"):
            lstm_model, lstm_trainer, lstm_metrics = self.train_lstm(
                X_seq_train, y_seq_train,
                X_seq_val, y_seq_val,
                input_size=n_features,
            )
            report["lstm_metrics"] = lstm_metrics

            # Save LSTM checkpoint
            lstm_path = str(self.checkpoint_dir / f"{sym_upper}_lstm_best.pt")
            lstm_trainer.save_checkpoint(lstm_path, self.lstm_epochs, lstm_metrics)
            self.model_registry.register_model(
                name=f"{sym_upper}_lstm",
                model_type="lstm",
                metrics=lstm_metrics,
                path=lstm_path,
            )

        if model_type in ("xgboost", "ensemble"):
            xgb_model, xgb_metrics = self.train_xgboost(
                X_flat_train, y_seq_train,
                X_flat_val, y_seq_val,
                feature_names=feature_cols,
            )
            report["xgb_metrics"] = xgb_metrics

            # Save XGBoost checkpoint
            xgb_path = str(self.checkpoint_dir / f"{sym_upper}_xgb_best.pkl")
            xgb_model.save(xgb_path)
            self.model_registry.register_model(
                name=f"{sym_upper}_xgboost",
                model_type="xgboost",
                metrics=xgb_metrics,
                path=xgb_path,
            )

        # 6. Evaluate ensemble
        if model_type == "ensemble" and lstm_model is not None and xgb_model is not None:
            ensemble = EnsembleModel(lstm_model, xgb_model)
            ensemble.update_weights(
                lstm_acc=lstm_metrics.get("accuracy", 0.5),
                xgb_acc=xgb_metrics.get("accuracy", 0.5),
            )
            ensemble_metrics = self._evaluate_ensemble(
                ensemble, X_seq_val, X_flat_val, y_seq_val
            )
            report["ensemble_metrics"] = ensemble_metrics
            logger.info(
                "Ensemble  val_acc=%.4f  val_f1=%.4f",
                ensemble_metrics.get("accuracy", 0),
                ensemble_metrics.get("f1_macro", 0),
            )

        logger.info("Training complete for symbol=%s", symbol)
        return report

    # ------------------------------------------------------------------ #
    #  Ensemble evaluation helper                                          #
    # ------------------------------------------------------------------ #

    def _evaluate_ensemble(
        self,
        ensemble: EnsembleModel,
        X_seq: np.ndarray,
        X_flat: np.ndarray,
        y_true: np.ndarray,
    ) -> Dict[str, float]:
        from sklearn.metrics import accuracy_score, f1_score

        preds = []
        for i in range(len(X_seq)):
            result = ensemble.predict(X_seq[i : i + 1], X_flat[i : i + 1])
            # Convert signal string back to class index
            signal_to_class = {"SELL": 0, "NEUTRAL": 1, "BUY": 2}
            preds.append(signal_to_class[result["signal"]])

        preds_arr = np.array(preds)
        return {
            "accuracy": float(accuracy_score(y_true, preds_arr)),
            "f1_macro": float(
                f1_score(y_true, preds_arr, average="macro", zero_division=0)
            ),
        }
