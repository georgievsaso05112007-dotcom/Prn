"""
Portfolio management routes (in-memory store).

GET    /api/portfolio                    – return full portfolio snapshot
POST   /api/portfolio/position           – add / update a position
DELETE /api/portfolio/position/{symbol}  – remove a position
GET    /api/portfolio/summary            – return aggregated P&L summary
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_data_manager
from app.models.portfolio import Portfolio, Position, PositionCreate, PositionUpdate
from app.services.data_manager import DataManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolio", tags=["Portfolio"])

# ------------------------------------------------------------------ #
# In-memory portfolio store (replace with DB in production)
# ------------------------------------------------------------------ #

# Keyed by "{exchange}:{symbol}"
_positions: dict[str, Position] = {}
_cash: float = 10_000.0  # default starting cash


def _position_key(exchange: str, symbol: str) -> str:
    return f"{exchange.lower()}:{symbol.upper()}"


# ------------------------------------------------------------------ #
# Routes
# ------------------------------------------------------------------ #


@router.get("", response_model=Portfolio)
async def get_portfolio(
    dm: DataManager = Depends(get_data_manager),
) -> Portfolio:
    """
    Return the full portfolio with live prices refreshed from the exchange.
    """
    updated_positions: list[Position] = []
    for key, pos in _positions.items():
        # Refresh current price
        ticker = await dm.get_ticker(symbol=pos.symbol, exchange=pos.exchange)
        current_price = ticker.price if ticker else pos.current_price
        updated_positions.append(
            pos.model_copy(update={"current_price": current_price})
        )

    return Portfolio(positions=updated_positions, cash=_cash)


@router.post("/position", response_model=Position, status_code=201)
async def add_position(
    payload: PositionCreate,
    dm: DataManager = Depends(get_data_manager),
) -> Position:
    """
    Add a new position or overwrite an existing one with the same symbol+exchange.

    If current_price is not supplied, the latest ticker price is used.
    """
    current_price = payload.current_price
    if current_price is None:
        ticker = await dm.get_ticker(symbol=payload.symbol, exchange=payload.exchange)
        current_price = ticker.price if ticker else payload.entry_price

    position = Position(
        symbol=payload.symbol.upper(),
        exchange=payload.exchange.lower(),
        size=payload.size,
        entry_price=payload.entry_price,
        current_price=current_price,
        notes=payload.notes,
    )

    key = _position_key(payload.exchange, payload.symbol)
    _positions[key] = position
    logger.info("Position added: %s @ %s", position.symbol, position.entry_price)
    return position


@router.patch("/position/{exchange}/{symbol}", response_model=Position)
async def update_position(
    exchange: str,
    symbol: str,
    payload: PositionUpdate,
    dm: DataManager = Depends(get_data_manager),
) -> Position:
    """
    Partially update an existing position (e.g. adjust size or notes).
    """
    key = _position_key(exchange, symbol)
    pos = _positions.get(key)
    if pos is None:
        raise HTTPException(
            status_code=404,
            detail=f"Position {symbol} on {exchange} not found",
        )

    update_data = payload.model_dump(exclude_unset=True)

    # If current_price not provided, refresh from exchange
    if "current_price" not in update_data:
        ticker = await dm.get_ticker(symbol=pos.symbol, exchange=pos.exchange)
        if ticker:
            update_data["current_price"] = ticker.price

    updated = pos.model_copy(update=update_data)
    _positions[key] = updated
    return updated


@router.delete("/position/{exchange}/{symbol}", status_code=204)
async def remove_position(exchange: str, symbol: str) -> None:
    """Remove a position from the portfolio."""
    key = _position_key(exchange, symbol)
    if key not in _positions:
        raise HTTPException(
            status_code=404,
            detail=f"Position {symbol} on {exchange} not found",
        )
    del _positions[key]
    logger.info("Position removed: %s/%s", exchange, symbol)


@router.get("/summary")
async def portfolio_summary(
    dm: DataManager = Depends(get_data_manager),
) -> dict:
    """Return a compact P&L summary without the full position list."""
    portfolio = await get_portfolio(dm)
    return {
        "total_value": portfolio.total_value,
        "cash": portfolio.cash,
        "invested": portfolio.total_value - portfolio.cash,
        "total_pnl": portfolio.total_pnl,
        "total_pnl_pct": portfolio.total_pnl_pct,
        "position_count": len(portfolio.positions),
    }
