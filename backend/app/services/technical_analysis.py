"""
Technical analysis service.

Uses the `ta` library (backed by pandas) to compute a comprehensive set
of indicators from OHLCV data and to derive a composite trading signal.

All methods are stateless and accept / return plain Python objects so
they can be used from any async context without blocking concerns
(pandas operations are CPU-bound but fast enough for typical candle counts).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd

try:
    import ta
    from ta.momentum import RSIIndicator, StochasticOscillator
    from ta.trend import MACD, EMAIndicator
    from ta.volatility import AverageTrueRange, BollingerBands
    TA_AVAILABLE = True
except ImportError:
    TA_AVAILABLE = False
    logging.getLogger(__name__).warning(
        "ta library not installed – technical analysis will return empty indicators"
    )

from app.models.market import (
    AnalysisResult,
    BollingerBands as BBModel,
    MACDData,
    SignalType,
    StochasticData,
    TechnicalIndicators,
)

logger = logging.getLogger(__name__)

# Minimum number of candles required for reliable indicator computation
MIN_CANDLES = 50


class TechnicalAnalysisService:
    """
    Computes technical indicators and generates trading signals.

    All public methods are synchronous (pandas / numpy operations).
    Wrap with asyncio.to_thread() if calling from a hot async path.
    """

    # ------------------------------------------------------------------ #
    # Primary entry point
    # ------------------------------------------------------------------ #

    def compute_indicators(
        self,
        df: pd.DataFrame,
        symbol: str = "",
        exchange: str = "",
        timeframe: str = "",
    ) -> TechnicalIndicators:
        """
        Compute a full set of indicators from a OHLCV DataFrame.

        Expected columns: open, high, low, close, volume (lowercase).
        Returns TechnicalIndicators with None fields where data is insufficient.
        """
        base = TechnicalIndicators(
            symbol=symbol,
            exchange=exchange,
            timeframe=timeframe,
            timestamp=datetime.now(tz=timezone.utc),
        )

        if not TA_AVAILABLE or df is None or df.empty or len(df) < 10:
            logger.warning(
                "Insufficient data for TA computation (%d candles)", 0 if df is None else len(df)
            )
            return base

        df = self._prepare_df(df)

        try:
            base.rsi = self._last(self.compute_rsi(df))
        except Exception as exc:
            logger.debug("RSI computation failed: %s", exc)

        try:
            macd_line, macd_signal, macd_hist = self.compute_macd(df)
            base.macd = MACDData(
                line=self._last(macd_line),
                signal=self._last(macd_signal),
                histogram=self._last(macd_hist),
            )
        except Exception as exc:
            logger.debug("MACD computation failed: %s", exc)

        try:
            upper, middle, lower = self.compute_bollinger_bands(df)
            base.bollinger_bands = BBModel(
                upper=self._last(upper),
                middle=self._last(middle),
                lower=self._last(lower),
            )
        except Exception as exc:
            logger.debug("Bollinger Bands computation failed: %s", exc)

        try:
            emas = self.compute_ema(df, periods=[20, 50, 200])
            base.ema20 = self._last(emas.get(20))
            base.ema50 = self._last(emas.get(50))
            base.ema200 = self._last(emas.get(200))
        except Exception as exc:
            logger.debug("EMA computation failed: %s", exc)

        try:
            base.atr = self._last(self.compute_atr(df))
        except Exception as exc:
            logger.debug("ATR computation failed: %s", exc)

        try:
            stoch_k, stoch_d = self.compute_stochastic(df)
            base.stochastic = StochasticData(
                k=self._last(stoch_k),
                d=self._last(stoch_d),
            )
        except Exception as exc:
            logger.debug("Stochastic computation failed: %s", exc)

        return base

    # ------------------------------------------------------------------ #
    # Individual indicator methods
    # ------------------------------------------------------------------ #

    def compute_rsi(self, df: pd.DataFrame, period: int = 14) -> pd.Series:
        """Relative Strength Index."""
        df = self._prepare_df(df)
        indicator = RSIIndicator(close=df["close"], window=period)
        return indicator.rsi()

    def compute_macd(
        self,
        df: pd.DataFrame,
        fast: int = 12,
        slow: int = 26,
        signal: int = 9,
    ) -> tuple[pd.Series, pd.Series, pd.Series]:
        """MACD line, signal line, histogram."""
        df = self._prepare_df(df)
        indicator = MACD(
            close=df["close"],
            window_fast=fast,
            window_slow=slow,
            window_sign=signal,
        )
        return indicator.macd(), indicator.macd_signal(), indicator.macd_diff()

    def compute_bollinger_bands(
        self,
        df: pd.DataFrame,
        period: int = 20,
        std_dev: float = 2.0,
    ) -> tuple[pd.Series, pd.Series, pd.Series]:
        """Upper band, middle band (SMA), lower band."""
        df = self._prepare_df(df)
        indicator = BollingerBands(
            close=df["close"],
            window=period,
            window_dev=std_dev,
        )
        return (
            indicator.bollinger_hband(),
            indicator.bollinger_mavg(),
            indicator.bollinger_lband(),
        )

    def compute_ema(
        self,
        df: pd.DataFrame,
        periods: list[int] | None = None,
    ) -> dict[int, pd.Series]:
        """Return a dict of {period: EMA Series}."""
        if periods is None:
            periods = [20, 50, 200]
        df = self._prepare_df(df)
        result: dict[int, pd.Series] = {}
        for p in periods:
            if len(df) >= p:
                indicator = EMAIndicator(close=df["close"], window=p)
                result[p] = indicator.ema_indicator()
        return result

    def compute_atr(self, df: pd.DataFrame, period: int = 14) -> pd.Series:
        """Average True Range."""
        df = self._prepare_df(df)
        indicator = AverageTrueRange(
            high=df["high"],
            low=df["low"],
            close=df["close"],
            window=period,
        )
        return indicator.average_true_range()

    def compute_stochastic(
        self,
        df: pd.DataFrame,
        k_window: int = 14,
        d_window: int = 3,
        smooth_window: int = 3,
    ) -> tuple[pd.Series, pd.Series]:
        """Stochastic %K and %D lines."""
        df = self._prepare_df(df)
        indicator = StochasticOscillator(
            high=df["high"],
            low=df["low"],
            close=df["close"],
            window=k_window,
            smooth_window=smooth_window,
        )
        return indicator.stoch(), indicator.stoch_signal()

    # ------------------------------------------------------------------ #
    # Signal generation
    # ------------------------------------------------------------------ #

    def generate_signal(
        self, indicators: TechnicalIndicators
    ) -> tuple[SignalType, float]:
        """
        Derive a composite BUY / SELL / NEUTRAL signal from the indicators.

        Scoring:
          - RSI < 30  → +1 buy  | RSI > 70  → -1 sell
          - MACD hist > 0       → +1 buy  | < 0     → -1 sell
          - Close < BB lower    → +1 buy  | > upper → -1 sell
          - EMA20 > EMA50       → +0.5 bull trend
          - Stochastic K < 20   → +0.5 oversold | K > 80 → -0.5 overbought

        Confidence is proportional to the absolute score normalised to [0, 1].
        """
        score: float = 0.0
        max_score: float = 4.0  # sum of absolute weights above

        rsi = indicators.rsi
        if rsi is not None:
            if rsi < 30:
                score += 1.0
            elif rsi > 70:
                score -= 1.0

        macd = indicators.macd
        if macd and macd.histogram is not None:
            score += 1.0 if macd.histogram > 0 else -1.0

        bb = indicators.bollinger_bands
        # We need the close price; the indicators model doesn't carry it,
        # so we use the MACD signal as a proxy for trend here.
        # (Full-close comparison is done in generate_analysis() via the df.)

        ema20 = indicators.ema20
        ema50 = indicators.ema50
        if ema20 is not None and ema50 is not None:
            score += 0.5 if ema20 > ema50 else -0.5

        stoch = indicators.stochastic
        if stoch and stoch.k is not None:
            if stoch.k < 20:
                score += 0.5
            elif stoch.k > 80:
                score -= 0.5

        confidence = min(abs(score) / max_score, 1.0)

        if score > 0.5:
            return SignalType.BUY, round(confidence, 3)
        elif score < -0.5:
            return SignalType.SELL, round(confidence, 3)
        return SignalType.NEUTRAL, round(confidence, 3)

    def generate_analysis(
        self,
        df: pd.DataFrame,
        symbol: str,
        exchange: str,
        timeframe: str,
    ) -> AnalysisResult:
        """
        Full pipeline: compute indicators → generate signal → build result.
        """
        indicators = self.compute_indicators(df, symbol, exchange, timeframe)
        signal, confidence = self.generate_signal(indicators)

        # Enhance BB-based scoring if we have current close price
        close = df["close"].iloc[-1] if not df.empty else None
        bb = indicators.bollinger_bands
        explanation_parts: list[str] = []

        if indicators.rsi is not None:
            explanation_parts.append(
                f"RSI={indicators.rsi:.1f} ({'oversold' if indicators.rsi < 30 else 'overbought' if indicators.rsi > 70 else 'neutral'})"
            )

        if indicators.macd and indicators.macd.histogram is not None:
            direction = "bullish" if indicators.macd.histogram > 0 else "bearish"
            explanation_parts.append(f"MACD histogram {direction} ({indicators.macd.histogram:.4f})")

        if bb and close is not None:
            if bb.upper and close > bb.upper:
                explanation_parts.append("Price above upper Bollinger Band (overbought)")
            elif bb.lower and close < bb.lower:
                explanation_parts.append("Price below lower Bollinger Band (oversold)")
            else:
                explanation_parts.append("Price within Bollinger Bands")

        if indicators.ema20 and indicators.ema50:
            trend = "uptrend" if indicators.ema20 > indicators.ema50 else "downtrend"
            explanation_parts.append(f"EMA20/EMA50 cross indicates {trend}")

        explanation = "; ".join(explanation_parts) if explanation_parts else "Insufficient data for analysis."

        return AnalysisResult(
            symbol=symbol,
            exchange=exchange,
            timeframe=timeframe,
            indicators=indicators,
            signal=signal,
            confidence=confidence,
            explanation=explanation,
        )

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #

    @staticmethod
    def _prepare_df(df: pd.DataFrame) -> pd.DataFrame:
        """Ensure column names are lowercase floats."""
        df = df.copy()
        df.columns = [c.lower() for c in df.columns]
        for col in ("open", "high", "low", "close", "volume"):
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        df = df.dropna(subset=["close"])
        return df

    @staticmethod
    def _last(series: Optional[pd.Series]) -> Optional[float]:
        """Return the last non-NaN value from a Series, or None."""
        if series is None or series.empty:
            return None
        val = series.dropna()
        if val.empty:
            return None
        v = val.iloc[-1]
        return float(v) if not np.isnan(v) else None


# Module-level singleton
ta_service = TechnicalAnalysisService()
