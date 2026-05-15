"""
Portfolio and position Pydantic models.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, computed_field


class Position(BaseModel):
    """A single open position in the portfolio."""

    symbol: str
    exchange: str
    size: float = Field(..., description="Quantity held (positive = long, negative = short)")
    entry_price: float = Field(..., gt=0)
    current_price: float = Field(..., gt=0)
    opened_at: datetime = Field(default_factory=datetime.utcnow)
    notes: str = ""

    @computed_field  # type: ignore[misc]
    @property
    def pnl(self) -> float:
        """Unrealised profit/loss in quote currency."""
        return (self.current_price - self.entry_price) * self.size

    @computed_field  # type: ignore[misc]
    @property
    def pnl_pct(self) -> float:
        """Unrealised P&L as a percentage of entry value."""
        if self.entry_price == 0:
            return 0.0
        return ((self.current_price - self.entry_price) / self.entry_price) * 100.0

    @computed_field  # type: ignore[misc]
    @property
    def market_value(self) -> float:
        """Current market value of the position."""
        return self.current_price * abs(self.size)


class PositionCreate(BaseModel):
    symbol: str
    exchange: str
    size: float
    entry_price: float = Field(..., gt=0)
    current_price: Optional[float] = None
    notes: str = ""


class PositionUpdate(BaseModel):
    current_price: Optional[float] = None
    size: Optional[float] = None
    notes: Optional[str] = None


class Portfolio(BaseModel):
    """Aggregate view of all positions."""

    positions: list[Position] = Field(default_factory=list)
    cash: float = Field(0.0, description="Uninvested cash balance")
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @computed_field  # type: ignore[misc]
    @property
    def total_value(self) -> float:
        """Total portfolio value including cash."""
        return self.cash + sum(p.market_value for p in self.positions)

    @computed_field  # type: ignore[misc]
    @property
    def total_pnl(self) -> float:
        """Sum of unrealised P&L across all positions."""
        return sum(p.pnl for p in self.positions)

    @computed_field  # type: ignore[misc]
    @property
    def total_pnl_pct(self) -> float:
        """Portfolio-level P&L percentage vs total cost basis."""
        cost_basis = sum(p.entry_price * abs(p.size) for p in self.positions)
        if cost_basis == 0:
            return 0.0
        return (self.total_pnl / cost_basis) * 100.0
