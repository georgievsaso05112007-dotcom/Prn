"""
Central data manager.

Responsibilities:
  - Route requests to the correct exchange connector.
  - Cache responses in memory with a configurable TTL.
  - Normalise data formats across exchanges.
  - Build and cache pandas DataFrames from OHLCV data.

The data manager is instantiated once at application startup and injected
via FastAPI's dependency-injection system.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

import pandas as pd

from app.models.market import OHLCVData, MarketTicker, TradingPair
from app.services.exchanges.base import BaseExchange
from app.services.exchanges.binance_connector import BinanceConnector
from app.services.exchanges.bybit_connector import BybitConnector
from app.services.exchanges.oanda_connector import OandaConnector
from app.services.exchanges.yahoo_connector import YahooConnector

logger = logging.getLogger(__name__)


class _CacheEntry:
    __slots__ = ("value", "expires_at")

    def __init__(self, value: Any, ttl: float) -> None:
        self.value = value
        self.expires_at = time.monotonic() + ttl


class DataManager:
    """
    Central hub that routes market-data requests to exchange connectors
    and caches results.
    """

    # Default TTL per endpoint type (seconds)
    TTL_OHLCV: float = 30.0     # candle data – slightly stale is fine
    TTL_TICKER: float = 5.0      # ticker – refresh more aggressively
    TTL_SYMBOLS: float = 3600.0  # instrument lists rarely change
    TTL_ORDERBOOK: float = 2.0   # order book – very short TTL

    def __init__(self) -> None:
        self._connectors: dict[str, BaseExchange] = {}
        self._cache: dict[str, _CacheEntry] = {}
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #

    async def initialise(self) -> None:
        """Create and register all exchange connectors."""
        self._connectors = {
            "binance": BinanceConnector(),
            "bybit": BybitConnector(category="spot"),
            "bybit_linear": BybitConnector(category="linear"),
            "yahoo": YahooConnector(),
            "oanda": OandaConnector(),
        }
        logger.info("DataManager initialised with connectors: %s", list(self._connectors.keys()))

    async def shutdown(self) -> None:
        """Release resources held by all connectors."""
        for name, connector in self._connectors.items():
            try:
                await connector.close()
                logger.debug("Connector '%s' closed", name)
            except Exception as exc:
                logger.warning("Error closing connector '%s': %s", name, exc)

    # ------------------------------------------------------------------ #
    # Internal cache helpers
    # ------------------------------------------------------------------ #

    def _cache_get(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry is None:
            return None
        if time.monotonic() > entry.expires_at:
            del self._cache[key]
            return None
        return entry.value

    def _cache_set(self, key: str, value: Any, ttl: float) -> None:
        self._cache[key] = _CacheEntry(value, ttl)

    def _connector(self, exchange: str) -> Optional[BaseExchange]:
        connector = self._connectors.get(exchange.lower())
        if connector is None:
            logger.warning("Unknown exchange: '%s'", exchange)
        return connector

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    async def get_ohlcv(
        self,
        symbol: str,
        exchange: str = "binance",
        timeframe: str = "1h",
        limit: int = 200,
    ) -> list[OHLCVData]:
        key = f"ohlcv:{exchange}:{symbol}:{timeframe}:{limit}"
        cached = self._cache_get(key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        connector = self._connector(exchange)
        if connector is None:
            return []

        try:
            data = await connector.get_ohlcv(symbol, timeframe, limit)
        except Exception as exc:
            logger.error("get_ohlcv error [%s/%s]: %s", exchange, symbol, exc)
            data = []

        self._cache_set(key, data, self.TTL_OHLCV)
        return data

    async def get_ticker(
        self,
        symbol: str,
        exchange: str = "binance",
    ) -> Optional[MarketTicker]:
        key = f"ticker:{exchange}:{symbol}"
        cached = self._cache_get(key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        connector = self._connector(exchange)
        if connector is None:
            return None

        try:
            ticker = await connector.get_ticker(symbol)
        except Exception as exc:
            logger.error("get_ticker error [%s/%s]: %s", exchange, symbol, exc)
            ticker = None

        if ticker is not None:
            self._cache_set(key, ticker, self.TTL_TICKER)
        return ticker

    async def get_symbols(self, exchange: str = "binance") -> list[TradingPair]:
        key = f"symbols:{exchange}"
        cached = self._cache_get(key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        connector = self._connector(exchange)
        if connector is None:
            return []

        try:
            symbols = await connector.get_symbols()
        except Exception as exc:
            logger.error("get_symbols error [%s]: %s", exchange, exc)
            symbols = []

        self._cache_set(key, symbols, self.TTL_SYMBOLS)
        return symbols

    async def get_orderbook(
        self,
        symbol: str,
        exchange: str = "binance",
        depth: int = 20,
    ) -> dict:
        key = f"orderbook:{exchange}:{symbol}:{depth}"
        cached = self._cache_get(key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        connector = self._connector(exchange)
        if connector is None:
            return {"bids": [], "asks": []}

        try:
            ob = await connector.get_orderbook(symbol, depth)
        except Exception as exc:
            logger.error("get_orderbook error [%s/%s]: %s", exchange, symbol, exc)
            ob = {"bids": [], "asks": []}

        self._cache_set(key, ob, self.TTL_ORDERBOOK)
        return ob

    # ------------------------------------------------------------------ #
    # DataFrame conversion (used by analysis service)
    # ------------------------------------------------------------------ #

    async def get_ohlcv_df(
        self,
        symbol: str,
        exchange: str = "binance",
        timeframe: str = "1h",
        limit: int = 200,
    ) -> pd.DataFrame:
        """
        Fetch OHLCV data and return it as a pandas DataFrame.

        Columns: timestamp, open, high, low, close, volume
        Index: integer range index (not timestamp)
        """
        candles = await self.get_ohlcv(symbol, exchange, timeframe, limit)
        if not candles:
            return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

        return pd.DataFrame(
            [
                {
                    "timestamp": c.timestamp,
                    "open": c.open,
                    "high": c.high,
                    "low": c.low,
                    "close": c.close,
                    "volume": c.volume,
                }
                for c in candles
            ]
        )

    # ------------------------------------------------------------------ #
    # Convenience: list available exchanges
    # ------------------------------------------------------------------ #

    def available_exchanges(self) -> list[str]:
        return list(self._connectors.keys())


# Module-level singleton – initialised during app startup
data_manager = DataManager()
