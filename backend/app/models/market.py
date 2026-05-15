"""
Market data Pydantic models shared across the application.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ------------------------------------------------------------------ #
# Enumerations
# ------------------------------------------------------------------ #


class SignalType(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    NEUTRAL = "NEUTRAL"


# ------------------------------------------------------------------ #
# Raw / OHLCV market data
# ------------------------------------------------------------------ #


class OHLCVData(BaseModel):
    """Single OHLCV candle."""

    symbol: str = Field(..., description="Trading pair symbol, e.g. BTCUSDT")
    exchange: str = Field(..., description="Exchange identifier, e.g. binance")
    timeframe: str = Field(..., description="Candle timeframe, e.g. 1h")
    open: float
    high: float
    low: float
    close: float
    volume: float
    timestamp: datetime


class MarketTicker(BaseModel):
    """24-hour rolling ticker snapshot."""

    symbol: str
    exchange: str
    price: float
    change24h: float = Field(0.0, description="Absolute price change in last 24h")
    change24h_pct: float = Field(0.0, description="Percentage price change in last 24h")
    volume24h: float = Field(0.0)
    high24h: float = Field(0.0)
    low24h: float = Field(0.0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class TradingPair(BaseModel):
    """Instrument / trading pair descriptor."""

    symbol: str
    base: str = Field(..., description="Base asset, e.g. BTC")
    quote: str = Field(..., description="Quote asset, e.g. USDT")
    exchange: str
    active: bool = True


# ------------------------------------------------------------------ #
# Technical-indicator sub-models
# ------------------------------------------------------------------ #


class MACDData(BaseModel):
    line: Optional[float] = None
    signal: Optional[float] = None
    histogram: Optional[float] = None


class BollingerBands(BaseModel):
    upper: Optional[float] = None
    middle: Optional[float] = None
    lower: Optional[float] = None


class StochasticData(BaseModel):
    k: Optional[float] = None
    d: Optional[float] = None


class TechnicalIndicators(BaseModel):
    """Computed indicator snapshot for a single bar (latest values)."""

    symbol: str
    exchange: str
    timeframe: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # Momentum
    rsi: Optional[float] = Field(None, description="RSI-14")

    # Trend-following
    macd: Optional[MACDData] = None
    ema20: Optional[float] = None
    ema50: Optional[float] = None
    ema200: Optional[float] = None

    # Volatility
    bollinger_bands: Optional[BollingerBands] = None
    atr: Optional[float] = Field(None, description="ATR-14")

    # Oscillator
    stochastic: Optional[StochasticData] = None


# ------------------------------------------------------------------ #
# Analysis result
# ------------------------------------------------------------------ #


class AnalysisResult(BaseModel):
    """Full technical-analysis result for a symbol."""

    symbol: str
    exchange: str
    timeframe: str
    indicators: TechnicalIndicators
    signal: SignalType = SignalType.NEUTRAL
    confidence: float = Field(
        0.0, ge=0.0, le=1.0, description="Signal confidence [0-1]"
    )
    explanation: str = ""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
