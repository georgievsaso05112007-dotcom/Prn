"""
Inference engine for the AI trading ML pipeline.

Loads trained models from the registry and produces trading signals.
Falls back to a rule-based engine when no trained model exists for a
given symbol, ensuring the application is always operational.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import torch

from ..features.feature_engineering import FeatureEngineer
from ..models.ensemble import EnsembleModel, ModelRegistry
from ..models.lstm_model import LSTMTradingModel, LSTMTrainer
from ..models.xgboost_model import XGBoostTradingModel

logger = logging.getLogger(__name__)

_DEFAULT_SEQ_LEN = 60
_SIGNAL_MAP = {0: "SELL", 1: "NEUTRAL", 2: "BUY"}
_CLASS_MAP = {0: "DOWN", 1: "NEUTRAL", 2: "UP"}


class TradingPredictor:
    """
    Prediction engine that serves trading signals for any symbol.

    If a trained model exists for a symbol it is used; otherwise the
    predictor falls back to a deterministic rule-based signal derived
    from RSI and EMA crossover, ensuring the app is always functional.

    Parameters
    ----------
    model_dir:
        Directory where model checkpoints and the registry JSON live.
    seq_len:
        Sequence length expected by the LSTM model.
    """

    def __init__(
        self,
        model_dir: str = "./models/checkpoints",
        seq_len: int = _DEFAULT_SEQ_LEN,
    ) -> None:
        self.model_dir = Path(model_dir)
        self.seq_len = seq_len
        self.model_registry = ModelRegistry(str(model_dir))
        self.models: Dict[str, EnsembleModel] = {}            # symbol → ensemble
        self.feature_engineers: Dict[str, FeatureEngineer] = {}  # symbol → FE

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    async def predict(
        self,
        symbol: str,
        ohlcv_data: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Produce a trading signal for *symbol*.

        Attempts to load a trained model on first call for the symbol.
        Falls back to rule-based signals when no model is available.

        Parameters
        ----------
        symbol:
            Trading symbol (e.g. ``"BTCUSDT"``).
        ohlcv_data:
            List of OHLCV dicts (recent bars, newest last).

        Returns
        -------
        dict with keys:
            signal       : "BUY" | "SELL" | "NEUTRAL"
            confidence   : float ∈ [0, 1]
            probabilities: {"DOWN": float, "NEUTRAL": float, "UP": float}
            lstm_signal  : str  (or "N/A" for rule-based)
            xgb_signal   : str  (or "N/A" for rule-based)
            source       : "model" | "rule_based"
            reasoning    : str  (human-readable explanation)
        """
        sym_upper = symbol.upper()

        # Lazy-load model if not yet in memory
        if sym_upper not in self.models:
            await self.load_model(sym_upper)

        # Feature engineer (shared across predict calls)
        if sym_upper not in self.feature_engineers:
            self.feature_engineers[sym_upper] = FeatureEngineer()

        fe = self.feature_engineers[sym_upper]

        # Prepare features (CPU-bound → executor)
        loop = asyncio.get_event_loop()
        df = await loop.run_in_executor(None, self._prepare_df, ohlcv_data)
        df_feat = await loop.run_in_executor(None, fe.create_features, df)

        if sym_upper not in self.models:
            # No trained model — use rule-based fallback
            result = self._rule_based_signal(df_feat)
            result["source"] = "rule_based"
            result["symbol"] = sym_upper
            return result

        # --- Trained model path ---
        ensemble = self.models[sym_upper]
        result = await loop.run_in_executor(
            None, self._run_ensemble, ensemble, fe, df_feat
        )
        result["source"] = "model"
        result["symbol"] = sym_upper
        return result

    # ------------------------------------------------------------------ #

    async def load_model(self, symbol: str) -> bool:
        """
        Load the best saved model for *symbol* into memory.

        Returns
        -------
        bool
            ``True`` if a model was successfully loaded, ``False`` if none
            exists in the registry.
        """
        sym_upper = symbol.upper()

        lstm_entry = self.model_registry.get_best_model_for_symbol(sym_upper, "lstm")
        xgb_entry = self.model_registry.get_best_model_for_symbol(sym_upper, "xgboost")

        if lstm_entry is None or xgb_entry is None:
            logger.info("No trained model found for %s — will use rule-based fallback.", sym_upper)
            return False

        try:
            loop = asyncio.get_event_loop()
            ensemble = await loop.run_in_executor(
                None, self._load_ensemble, lstm_entry, xgb_entry
            )
            self.models[sym_upper] = ensemble
            logger.info("Model loaded for symbol=%s", sym_upper)
            return True
        except Exception as exc:
            logger.error("Failed to load model for %s: %s", sym_upper, exc, exc_info=True)
            return False

    # ------------------------------------------------------------------ #

    def get_loaded_models(self) -> List[str]:
        """Return the list of symbols that have a model loaded in memory."""
        return list(self.models.keys())

    # ------------------------------------------------------------------ #
    #  Rule-based fallback                                                 #
    # ------------------------------------------------------------------ #

    def _rule_based_signal(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Deterministic signal from RSI and EMA crossover.

        Logic
        -----
        BUY  : RSI(14) < 30  AND  close > EMA(20)
        SELL : RSI(14) > 70  AND  close < EMA(20)
        NEUTRAL : everything else

        Returns the same dict shape as :meth:`EnsembleModel.predict`.
        """
        if len(df) < 20:
            return self._neutral_result("Insufficient data for rule-based signal.")

        close = df["close"]
        rsi_col = "rsi_14" if "rsi_14" in df.columns else None

        # Compute RSI if not already in df
        if rsi_col:
            rsi = float(df["rsi_14"].iloc[-1])
        else:
            rsi = self._compute_rsi(close, 14)

        # EMA-20
        ema20 = float(close.ewm(span=20, adjust=False).mean().iloc[-1])
        current_close = float(close.iloc[-1])
        price_vs_ema = "above" if current_close > ema20 else "below"

        if rsi < 30 and current_close > ema20:
            signal = "BUY"
            confidence = min(0.85, 0.5 + (30 - rsi) / 60)
            probs = {"DOWN": 0.10, "NEUTRAL": 0.20, "UP": round(1 - 0.30, 2)}
            reasoning = (
                f"RSI(14)={rsi:.1f} is oversold (<30) and price is {price_vs_ema} EMA20 "
                f"({current_close:.4f} vs {ema20:.4f}). Rule-based BUY signal."
            )
        elif rsi > 70 and current_close < ema20:
            signal = "SELL"
            confidence = min(0.85, 0.5 + (rsi - 70) / 60)
            probs = {"DOWN": round(1 - 0.30, 2), "NEUTRAL": 0.20, "UP": 0.10}
            reasoning = (
                f"RSI(14)={rsi:.1f} is overbought (>70) and price is {price_vs_ema} EMA20 "
                f"({current_close:.4f} vs {ema20:.4f}). Rule-based SELL signal."
            )
        else:
            signal = "NEUTRAL"
            confidence = 0.45
            probs = {"DOWN": 0.25, "NEUTRAL": 0.50, "UP": 0.25}
            reasoning = (
                f"RSI(14)={rsi:.1f}, price {price_vs_ema} EMA20 "
                f"({current_close:.4f} vs {ema20:.4f}). No strong signal — NEUTRAL."
            )

        return {
            "signal": signal,
            "confidence": round(confidence, 4),
            "probabilities": probs,
            "lstm_signal": "N/A",
            "xgb_signal": "N/A",
            "reasoning": reasoning,
        }

    # ------------------------------------------------------------------ #
    #  Private helpers                                                     #
    # ------------------------------------------------------------------ #

    def _prepare_df(self, ohlcv_data: List[Dict[str, Any]]) -> pd.DataFrame:
        """Convert raw OHLCV list to a normalised DataFrame."""
        rows = []
        timestamps = []
        for bar in ohlcv_data:
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
                pass
        return df

    def _run_ensemble(
        self,
        ensemble: EnsembleModel,
        fe: FeatureEngineer,
        df_feat: pd.DataFrame,
    ) -> Dict[str, Any]:
        """Prepare sequences and call ensemble.predict()."""
        if len(df_feat) < self.seq_len + 1:
            return self._neutral_result(
                f"Need at least {self.seq_len + 1} bars after feature engineering; "
                f"got {len(df_feat)}."
            )

        feature_cols = fe._feature_columns(df_feat)
        data = df_feat[feature_cols].values.astype(np.float32)

        # Take the most recent window
        lstm_input = data[-self.seq_len:][np.newaxis, ...]  # (1, seq_len, feat)
        xgb_input = data[-1][np.newaxis, ...]               # (1, feat)

        result = ensemble.predict(lstm_input, xgb_input)
        result["reasoning"] = (
            f"Ensemble (LSTM weight={ensemble.lstm_weight:.2f}, "
            f"XGB weight={ensemble.xgb_weight:.2f}). "
            f"LSTM→{result['lstm_signal']}, XGB→{result['xgb_signal']}."
        )
        return result

    def _load_ensemble(
        self,
        lstm_entry: Dict,
        xgb_entry: Dict,
    ) -> EnsembleModel:
        """Deserialise LSTM + XGBoost models and return an EnsembleModel."""
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # --- Load LSTM ---
        checkpoint = torch.load(lstm_entry["path"], map_location=device, weights_only=False)
        cfg = checkpoint["model_config"]
        lstm_model = LSTMTradingModel(
            input_size=cfg["input_size"],
            hidden_size=cfg["hidden_size"],
            num_layers=cfg["num_layers"],
            output_size=cfg["output_size"],
        )
        lstm_model.load_state_dict(checkpoint["model_state_dict"])
        lstm_model.to(device)
        lstm_model.eval()

        # --- Load XGBoost ---
        xgb_model = XGBoostTradingModel()
        xgb_model.load(xgb_entry["path"])

        # Derive weights from stored accuracy metrics
        lstm_acc = lstm_entry.get("metrics", {}).get("accuracy", 0.5)
        xgb_acc = xgb_entry.get("metrics", {}).get("accuracy", 0.5)

        ensemble = EnsembleModel(lstm_model, xgb_model)
        ensemble.update_weights(lstm_acc, xgb_acc)
        return ensemble

    @staticmethod
    def _compute_rsi(series: pd.Series, period: int) -> float:
        """Compute RSI for the last row of *series*."""
        delta = series.diff()
        gain = delta.clip(lower=0)
        loss = (-delta).clip(lower=0)
        avg_gain = gain.ewm(com=period - 1, min_periods=period, adjust=False).mean()
        avg_loss = loss.ewm(com=period - 1, min_periods=period, adjust=False).mean()
        last_loss = avg_loss.iloc[-1]
        if last_loss == 0:
            return 100.0
        rs = avg_gain.iloc[-1] / last_loss
        return float(100 - 100 / (1 + rs))

    @staticmethod
    def _neutral_result(reasoning: str) -> Dict[str, Any]:
        return {
            "signal": "NEUTRAL",
            "confidence": 0.33,
            "probabilities": {"DOWN": 0.33, "NEUTRAL": 0.34, "UP": 0.33},
            "lstm_signal": "N/A",
            "xgb_signal": "N/A",
            "reasoning": reasoning,
        }
