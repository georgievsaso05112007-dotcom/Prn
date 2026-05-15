"""
Feature engineering for OHLCV market data.

Produces a rich set of technical, statistical, and time-based features
suitable for both LSTM (sequential) and XGBoost (tabular) models.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Tuple


class FeatureEngineer:
    """Transforms raw OHLCV data into ML-ready features."""

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    def create_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Add all feature columns to *df* and return a cleaned copy.

        Expected input columns (case-insensitive): open, high, low, close, volume.
        NaN rows produced by rolling / lag calculations are dropped before returning.

        Parameters
        ----------
        df:
            Raw OHLCV DataFrame with a DatetimeIndex (or integer index).

        Returns
        -------
        pd.DataFrame
            Original columns + all engineered features, with NaN rows removed.
        """
        df = df.copy()
        df.columns = [c.lower() for c in df.columns]

        df = self._add_price_features(df)
        df = self._add_volume_features(df)
        df = self._add_technical_features(df)
        df = self._add_pattern_features(df)
        df = self._add_time_features(df)
        df = self._add_lag_features(df)
        df = self._add_rolling_stats(df)

        df.replace([np.inf, -np.inf], np.nan, inplace=True)
        df.dropna(inplace=True)
        df.reset_index(drop=True, inplace=True)
        return df

    def create_sequences(
        self, df: pd.DataFrame, seq_len: int = 60
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Convert a feature-rich DataFrame into overlapping fixed-length sequences.

        The target *y* is the next-bar direction:
            y[i] = 1  if close[i + seq_len] > close[i + seq_len - 1]
            y[i] = 0  otherwise

        Parameters
        ----------
        df:
            Output of :meth:`create_features`.
        seq_len:
            Number of time-steps per sequence (look-back window).

        Returns
        -------
        X : np.ndarray, shape (n_samples, seq_len, n_features)
        y : np.ndarray, shape (n_samples,)  — binary 0/1
        """
        feature_cols = self._feature_columns(df)
        data = df[feature_cols].values.astype(np.float32)
        close = df["close"].values

        n = len(data)
        if n <= seq_len:
            raise ValueError(
                f"Not enough rows ({n}) to create sequences of length {seq_len}."
            )

        n_samples = n - seq_len
        X = np.stack([data[i : i + seq_len] for i in range(n_samples)])
        y = np.array(
            [
                1 if close[i + seq_len] > close[i + seq_len - 1] else 0
                for i in range(n_samples)
            ],
            dtype=np.int64,
        )
        return X, y

    def create_targets(
        self,
        df: pd.DataFrame,
        horizon: int = 1,
        threshold: float = 0.001,
    ) -> pd.Series:
        """
        Create three-class directional targets.

        Classes:
            0 = DOWN   (future_return < -threshold)
            1 = NEUTRAL (-threshold <= future_return <= threshold)
            2 = UP     (future_return >  threshold)

        Parameters
        ----------
        df:
            DataFrame with at least a *close* column.
        horizon:
            Number of bars ahead to measure the return.
        threshold:
            Minimum absolute return to be classified as UP or DOWN.

        Returns
        -------
        pd.Series of int (0, 1, 2), aligned to *df*'s index.
        """
        close = df["close"]
        future_return = (close.shift(-horizon) - close) / close

        conditions = [
            future_return < -threshold,
            future_return > threshold,
        ]
        choices = [0, 2]
        targets = pd.Series(
            np.select(conditions, choices, default=1),
            index=df.index,
            name="target",
            dtype=np.int64,
        )
        return targets

    # ------------------------------------------------------------------ #
    #  Helper – feature column list                                       #
    # ------------------------------------------------------------------ #

    def _feature_columns(self, df: pd.DataFrame) -> list[str]:
        """Return all columns that are not raw OHLCV."""
        raw = {"open", "high", "low", "close", "volume"}
        return [c for c in df.columns if c not in raw]

    # ------------------------------------------------------------------ #
    #  Price features                                                      #
    # ------------------------------------------------------------------ #

    def _add_price_features(self, df: pd.DataFrame) -> pd.DataFrame:
        close = df["close"]
        open_ = df["open"]
        high = df["high"]
        low = df["low"]

        # Simple return and log return
        df["return"] = close.pct_change()
        df["log_return"] = np.log(close / close.shift(1))

        # Short-term and medium-term price momentum
        df["price_momentum_5"] = close / close.shift(5) - 1
        df["price_momentum_10"] = close / close.shift(10) - 1
        df["price_momentum_20"] = close / close.shift(20) - 1

        # Body / wick ratios (candle features)
        candle_range = (high - low).replace(0, np.nan)
        df["body_ratio"] = (close - open_).abs() / candle_range
        df["upper_wick"] = (high - close.combine(open_, max)) / candle_range
        df["lower_wick"] = (close.combine(open_, min) - low) / candle_range

        return df

    # ------------------------------------------------------------------ #
    #  Volume features                                                     #
    # ------------------------------------------------------------------ #

    def _add_volume_features(self, df: pd.DataFrame) -> pd.DataFrame:
        volume = df["volume"]
        close = df["close"]

        # Moving average of volume and ratio
        df["volume_ma_10"] = volume.rolling(10).mean()
        df["volume_ma_20"] = volume.rolling(20).mean()
        df["volume_ratio"] = volume / df["volume_ma_20"]

        # On-balance volume (cumulative)
        direction = np.sign(close.diff())
        df["obv"] = (volume * direction).fillna(0).cumsum()
        # Normalise OBV to avoid unbounded growth
        obv_std = df["obv"].rolling(50, min_periods=10).std().replace(0, np.nan)
        df["obv_norm"] = df["obv"] / obv_std

        return df

    # ------------------------------------------------------------------ #
    #  Technical indicator features                                        #
    # ------------------------------------------------------------------ #

    def _add_technical_features(self, df: pd.DataFrame) -> pd.DataFrame:
        close = df["close"]
        high = df["high"]
        low = df["low"]

        # --- RSI (14 and 21) ---
        df["rsi_14"] = self._rsi(close, 14)
        df["rsi_21"] = self._rsi(close, 21)

        # --- MACD ---
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        macd_line = ema12 - ema26
        signal_line = macd_line.ewm(span=9, adjust=False).mean()
        df["macd"] = macd_line
        df["macd_signal"] = signal_line
        df["macd_hist"] = macd_line - signal_line

        # --- Bollinger Bands % B ---
        bb_mid = close.rolling(20).mean()
        bb_std = close.rolling(20).std()
        bb_upper = bb_mid + 2 * bb_std
        bb_lower = bb_mid - 2 * bb_std
        bb_range = (bb_upper - bb_lower).replace(0, np.nan)
        df["bb_pct_b"] = (close - bb_lower) / bb_range

        # --- ATR % ---
        prev_close = close.shift(1)
        tr = pd.concat(
            [
                high - low,
                (high - prev_close).abs(),
                (low - prev_close).abs(),
            ],
            axis=1,
        ).max(axis=1)
        atr = tr.rolling(14).mean()
        df["atr_pct"] = atr / close

        # --- Stochastic %K and %D ---
        lowest_low = low.rolling(14).min()
        highest_high = high.rolling(14).max()
        stoch_range = (highest_high - lowest_low).replace(0, np.nan)
        df["stoch_k"] = (close - lowest_low) / stoch_range * 100
        df["stoch_d"] = df["stoch_k"].rolling(3).mean()

        # --- EMA crossover ---
        ema9 = close.ewm(span=9, adjust=False).mean()
        ema21 = close.ewm(span=21, adjust=False).mean()
        df["ema9"] = ema9
        df["ema21"] = ema21
        df["ema_cross"] = (ema9 - ema21) / close  # normalised spread

        # --- Price vs EMA ---
        df["price_vs_ema20"] = (close - close.ewm(span=20, adjust=False).mean()) / close
        df["price_vs_ema50"] = (close - close.ewm(span=50, adjust=False).mean()) / close

        return df

    # ------------------------------------------------------------------ #
    #  Pattern features                                                    #
    # ------------------------------------------------------------------ #

    def _add_pattern_features(self, df: pd.DataFrame) -> pd.DataFrame:
        high = df["high"]
        low = df["low"]
        close = df["close"]
        open_ = df["open"]

        # Higher high (current high exceeds previous high)
        df["higher_high"] = (high > high.shift(1)).astype(np.float32)
        # Lower low (current low is below previous low)
        df["lower_low"] = (low < low.shift(1)).astype(np.float32)
        # Inside bar (current bar is fully within previous bar)
        df["inside_bar"] = (
            (high < high.shift(1)) & (low > low.shift(1))
        ).astype(np.float32)
        # Bullish / bearish candle
        df["is_bullish"] = (close > open_).astype(np.float32)

        return df

    # ------------------------------------------------------------------ #
    #  Time features                                                       #
    # ------------------------------------------------------------------ #

    def _add_time_features(self, df: pd.DataFrame) -> pd.DataFrame:
        idx = df.index

        if isinstance(idx, pd.DatetimeIndex):
            # Cyclical encoding for hour and day-of-week
            hour = idx.hour
            dow = idx.dayofweek  # 0=Monday … 6=Sunday
            df["hour_sin"] = np.sin(2 * np.pi * hour / 24)
            df["hour_cos"] = np.cos(2 * np.pi * hour / 24)
            df["dow_sin"] = np.sin(2 * np.pi * dow / 7)
            df["dow_cos"] = np.cos(2 * np.pi * dow / 7)
            df["hour_of_day"] = hour
            df["day_of_week"] = dow
        else:
            # Fallback: fill with zeros so downstream code is unaffected
            for col in ["hour_sin", "hour_cos", "dow_sin", "dow_cos", "hour_of_day", "day_of_week"]:
                df[col] = 0.0

        return df

    # ------------------------------------------------------------------ #
    #  Lag features                                                        #
    # ------------------------------------------------------------------ #

    def _add_lag_features(self, df: pd.DataFrame) -> pd.DataFrame:
        close = df["close"]

        for lag in range(1, 6):
            df[f"price_lag_{lag}"] = close.shift(lag) / close - 1  # relative
            df[f"return_lag_{lag}"] = df["log_return"].shift(lag)

        return df

    # ------------------------------------------------------------------ #
    #  Rolling statistics                                                  #
    # ------------------------------------------------------------------ #

    def _add_rolling_stats(self, df: pd.DataFrame) -> pd.DataFrame:
        log_ret = df["log_return"]

        df["rolling_std_10"] = log_ret.rolling(10).std()
        df["rolling_std_20"] = log_ret.rolling(20).std()
        df["rolling_skew_20"] = log_ret.rolling(20).skew()

        return df

    # ------------------------------------------------------------------ #
    #  RSI helper                                                          #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _rsi(series: pd.Series, period: int) -> pd.Series:
        delta = series.diff()
        gain = delta.clip(lower=0)
        loss = (-delta).clip(lower=0)
        avg_gain = gain.ewm(com=period - 1, min_periods=period, adjust=False).mean()
        avg_loss = loss.ewm(com=period - 1, min_periods=period, adjust=False).mean()
        rs = avg_gain / avg_loss.replace(0, np.nan)
        return 100 - 100 / (1 + rs)
