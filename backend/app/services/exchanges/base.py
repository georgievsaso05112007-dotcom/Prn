"""
Abstract base class that every exchange connector must implement.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from app.models.market import OHLCVData, MarketTicker, TradingPair


class BaseExchange(ABC):
    """
    Common interface for all exchange / data-source connectors.

    Every method must:
    - be async
    - return an empty collection / None rather than raising on failure
      so callers never need to guard against connector errors individually
    """

    name: str = "base"

    # ------------------------------------------------------------------ #
    # Public interface
    # ------------------------------------------------------------------ #

    @abstractmethod
    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 200,
    ) -> list[OHLCVData]:
        """
        Fetch OHLCV candlestick data.

        Args:
            symbol:    Trading pair string as used by this exchange (e.g. "BTCUSDT").
            timeframe: Candle interval string (e.g. "1m", "5m", "15m", "1h", "4h", "1d").
            limit:     Maximum number of candles to return (most-recent first).

        Returns:
            List of OHLCVData sorted ascending by timestamp, or [] on error.
        """

    @abstractmethod
    async def get_ticker(self, symbol: str) -> Optional[MarketTicker]:
        """
        Fetch the latest 24-hour ticker snapshot for a symbol.

        Returns:
            MarketTicker or None on error / unavailable.
        """

    @abstractmethod
    async def get_symbols(self) -> list[TradingPair]:
        """
        List all tradeable instruments on this exchange.

        Returns:
            List of TradingPair, or [] on error.
        """

    @abstractmethod
    async def get_orderbook(self, symbol: str, depth: int = 20) -> dict:
        """
        Fetch the current order book.

        Returns:
            Dict with keys "bids" and "asks", each a list of [price, qty] pairs.
            Returns {"bids": [], "asks": []} on error.
        """

    # ------------------------------------------------------------------ #
    # Optional lifecycle hooks
    # ------------------------------------------------------------------ #

    async def close(self) -> None:
        """Release any persistent resources (e.g. HTTP sessions)."""
