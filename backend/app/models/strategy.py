"""
Strategy and signal Pydantic models.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from app.models.market import SignalType


class StrategyType(str, Enum):
    TREND = "TREND"
    MOMENTUM = "MOMENTUM"
    MEAN_REVERSION = "MEAN_REVERSION"
    AI = "AI"


class Strategy(BaseModel):
    """A trading strategy definition."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    description: str = ""
    type: StrategyType = StrategyType.TREND
    parameters: dict[str, Any] = Field(
        default_factory=dict,
        description="Flexible key-value parameters for the strategy",
    )
    enabled: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class StrategyCreate(BaseModel):
    name: str
    description: str = ""
    type: StrategyType = StrategyType.TREND
    parameters: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class StrategyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[StrategyType] = None
    parameters: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None


class StrategySignal(BaseModel):
    """A signal produced by a strategy for a specific symbol."""

    strategy_id: str
    strategy_name: str = ""
    symbol: str
    exchange: str = ""
    timeframe: str = "1h"
    signal: SignalType = SignalType.NEUTRAL
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    reasoning: str = ""
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class BacktestRequest(BaseModel):
    symbol: str
    exchange: str = "binance"
    timeframe: str = "1h"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    initial_capital: float = 10_000.0


class BacktestResult(BaseModel):
    strategy_id: str
    symbol: str
    timeframe: str
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    total_return_pct: float = 0.0
    max_drawdown_pct: float = 0.0
    sharpe_ratio: float = 0.0
    initial_capital: float = 10_000.0
    final_capital: float = 10_000.0
    note: str = "Backtesting is not yet fully implemented."
