"""
Strategy management routes (in-memory store).

GET    /api/strategies              – list all strategies
POST   /api/strategies              – create a strategy
PUT    /api/strategies/{id}         – update a strategy
DELETE /api/strategies/{id}         – delete a strategy
POST   /api/strategies/{id}/backtest – stub backtest endpoint
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_data_manager
from app.models.strategy import (
    BacktestRequest,
    BacktestResult,
    Strategy,
    StrategyCreate,
    StrategyType,
    StrategyUpdate,
)
from app.services.data_manager import DataManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/strategies", tags=["Strategies"])

# ------------------------------------------------------------------ #
# In-memory store (replace with DB-backed repo in production)
# ------------------------------------------------------------------ #

_store: dict[str, Strategy] = {}


def _seed_default_strategies() -> None:
    """Add a handful of example strategies on first import."""
    defaults = [
        Strategy(
            name="RSI Reversal",
            description="Buy when RSI < 30, sell when RSI > 70",
            type=StrategyType.MOMENTUM,
            parameters={"rsi_period": 14, "oversold": 30, "overbought": 70},
            enabled=True,
        ),
        Strategy(
            name="EMA Crossover",
            description="Golden cross (EMA20 > EMA50) = buy, death cross = sell",
            type=StrategyType.TREND,
            parameters={"fast_ema": 20, "slow_ema": 50},
            enabled=True,
        ),
        Strategy(
            name="Bollinger Band Mean Reversion",
            description="Buy at lower band, sell at upper band",
            type=StrategyType.MEAN_REVERSION,
            parameters={"period": 20, "std_dev": 2.0},
            enabled=True,
        ),
        Strategy(
            name="AI Momentum",
            description="Uses Claude LLM to interpret indicator context",
            type=StrategyType.AI,
            parameters={"model": "claude-opus-4-5", "confidence_threshold": 0.65},
            enabled=False,
        ),
    ]
    for s in defaults:
        _store[s.id] = s


_seed_default_strategies()


# ------------------------------------------------------------------ #
# Routes
# ------------------------------------------------------------------ #


@router.get("", response_model=list[Strategy])
async def list_strategies() -> list[Strategy]:
    """Return all stored strategies sorted by creation date."""
    return sorted(_store.values(), key=lambda s: s.created_at)


@router.post("", response_model=Strategy, status_code=201)
async def create_strategy(payload: StrategyCreate) -> Strategy:
    """Create and store a new strategy."""
    strategy = Strategy(
        name=payload.name,
        description=payload.description,
        type=payload.type,
        parameters=payload.parameters,
        enabled=payload.enabled,
    )
    _store[strategy.id] = strategy
    logger.info("Strategy created: %s (%s)", strategy.name, strategy.id)
    return strategy


@router.put("/{strategy_id}", response_model=Strategy)
async def update_strategy(
    strategy_id: str,
    payload: StrategyUpdate,
) -> Strategy:
    """Partially update an existing strategy."""
    strategy = _store.get(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_id}' not found")

    update_data = payload.model_dump(exclude_unset=True)
    updated = strategy.model_copy(
        update={**update_data, "updated_at": datetime.now(tz=timezone.utc)}
    )
    _store[strategy_id] = updated
    logger.info("Strategy updated: %s", strategy_id)
    return updated


@router.delete("/{strategy_id}", status_code=204)
async def delete_strategy(strategy_id: str) -> None:
    """Delete a strategy by ID."""
    if strategy_id not in _store:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_id}' not found")
    del _store[strategy_id]
    logger.info("Strategy deleted: %s", strategy_id)


@router.post("/{strategy_id}/backtest", response_model=BacktestResult)
async def backtest_strategy(
    strategy_id: str,
    request: BacktestRequest,
    dm: DataManager = Depends(get_data_manager),
) -> BacktestResult:
    """
    Run a backtest for the specified strategy.

    Currently returns a stub result. A full vectorised backtest engine
    would fetch historical candles, simulate entries/exits according to
    the strategy parameters and the TA service, and compute metrics.
    """
    strategy = _store.get(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_id}' not found")

    # Verify that we can at least fetch data for the requested symbol
    df = await dm.get_ohlcv_df(
        symbol=request.symbol,
        exchange=request.exchange,
        timeframe=request.timeframe,
        limit=500,
    )

    return BacktestResult(
        strategy_id=strategy_id,
        symbol=request.symbol,
        timeframe=request.timeframe,
        total_trades=0,
        winning_trades=0,
        losing_trades=0,
        win_rate=0.0,
        total_return_pct=0.0,
        max_drawdown_pct=0.0,
        sharpe_ratio=0.0,
        initial_capital=request.initial_capital,
        final_capital=request.initial_capital,
        note=(
            f"Backtest for strategy '{strategy.name}' on {request.symbol} "
            f"({request.timeframe}). "
            f"Data fetched: {len(df)} candles. "
            "Full backtesting engine not yet implemented."
        ),
    )
