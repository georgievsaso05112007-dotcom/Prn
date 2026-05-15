"""
Yahoo Finance connector using the yfinance library.

yfinance is synchronous; we run its blocking calls in a thread-pool
executor so we don't block the asyncio event loop.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from functools import partial
from typing import Optional

import yfinance as yf  # type: ignore[import]

from app.models.market import OHLCVData, MarketTicker, TradingPair
from app.services.exchanges.base import BaseExchange

logger = logging.getLogger(__name__)

# Map generic timeframe → (yfinance period, yfinance interval)
# period is used when fetching a default window of data.
TIMEFRAME_MAP: dict[str, tuple[str, str]] = {
    "1m":  ("7d",   "1m"),
    "5m":  ("60d",  "5m"),
    "15m": ("60d",  "15m"),
    "30m": ("60d",  "30m"),
    "1h":  ("730d", "1h"),
    "1d":  ("5y",   "1d"),
    "1wk": ("10y",  "1wk"),
    "1w":  ("10y",  "1wk"),
    "1M":  ("max",  "1mo"),
}

# A curated list of commonly traded stocks / ETFs returned by get_symbols()
COMMON_SYMBOLS: list[tuple[str, str, str]] = [
    ("AAPL", "AAPL", "USD"),
    ("MSFT", "MSFT", "USD"),
    ("GOOGL", "GOOGL", "USD"),
    ("AMZN", "AMZN", "USD"),
    ("META", "META", "USD"),
    ("NVDA", "NVDA", "USD"),
    ("TSLA", "TSLA", "USD"),
    ("BRK-B", "BRK-B", "USD"),
    ("JPM", "JPM", "USD"),
    ("V", "V", "USD"),
    ("SPY", "SPY", "USD"),
    ("QQQ", "QQQ", "USD"),
    ("IWM", "IWM", "USD"),
    ("GLD", "GLD", "USD"),
    ("TLT", "TLT", "USD"),
    ("BTC-USD", "BTC", "USD"),
    ("ETH-USD", "ETH", "USD"),
    ("EUR=X", "EUR", "USD"),
    ("GC=F", "GC", "USD"),  # Gold futures
    ("CL=F", "CL", "USD"),  # Crude Oil futures
]


def _fetch_history_sync(symbol: str, period: str, interval: str, limit: int):
    """Blocking yfinance call – runs in a thread pool."""
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, interval=interval)
    if df.empty:
        return None
    # Return only the last `limit` rows
    return df.tail(limit)


def _fetch_info_sync(symbol: str):
    """Blocking yfinance call – runs in a thread pool."""
    ticker = yf.Ticker(symbol)
    return ticker.info


class YahooConnector(BaseExchange):
    """Yahoo Finance data source connector (stocks, ETFs, forex, crypto)."""

    name = "yahoo"

    def __init__(self) -> None:
        self._loop = None  # resolved lazily

    def _get_loop(self) -> asyncio.AbstractEventLoop:
        return asyncio.get_event_loop()

    async def _run_sync(self, func, *args, **kwargs):
        """Run a synchronous function in the default thread-pool executor."""
        loop = self._get_loop()
        return await loop.run_in_executor(None, partial(func, *args, **kwargs))

    # ------------------------------------------------------------------ #
    # BaseExchange implementation
    # ------------------------------------------------------------------ #

    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1d",
        limit: int = 200,
    ) -> list[OHLCVData]:
        period, interval = TIMEFRAME_MAP.get(timeframe, ("1y", "1d"))
        try:
            df = await self._run_sync(_fetch_history_sync, symbol, period, interval, limit)
        except Exception as exc:
            logger.warning("Yahoo OHLCV fetch failed for %s: %s", symbol, exc)
            return []

        if df is None or df.empty:
            return []

        result: list[OHLCVData] = []
        for ts, row in df.iterrows():
            try:
                # yfinance timestamps may be tz-aware or tz-naive
                if hasattr(ts, "tzinfo") and ts.tzinfo is not None:
                    dt = ts.to_pydatetime().astimezone(timezone.utc)
                else:
                    dt = ts.to_pydatetime().replace(tzinfo=timezone.utc)
                result.append(
                    OHLCVData(
                        symbol=symbol,
                        exchange=self.name,
                        timeframe=timeframe,
                        timestamp=dt,
                        open=float(row["Open"]),
                        high=float(row["High"]),
                        low=float(row["Low"]),
                        close=float(row["Close"]),
                        volume=float(row.get("Volume", 0)),
                    )
                )
            except (KeyError, ValueError) as exc:
                logger.debug("Skipping malformed Yahoo row: %s", exc)

        return result

    async def get_ticker(self, symbol: str) -> Optional[MarketTicker]:
        try:
            info = await self._run_sync(_fetch_info_sync, symbol)
        except Exception as exc:
            logger.warning("Yahoo ticker fetch failed for %s: %s", symbol, exc)
            return None

        if not info:
            return None

        try:
            price = float(
                info.get("currentPrice")
                or info.get("regularMarketPrice")
                or info.get("navPrice")
                or 0
            )
            if price == 0:
                return None

            prev_close = float(info.get("previousClose") or info.get("regularMarketPreviousClose") or price)
            change24h = price - prev_close
            change24h_pct = ((change24h / prev_close) * 100.0) if prev_close else 0.0

            return MarketTicker(
                symbol=symbol,
                exchange=self.name,
                price=price,
                change24h=change24h,
                change24h_pct=change24h_pct,
                volume24h=float(info.get("volume") or info.get("regularMarketVolume") or 0),
                high24h=float(info.get("dayHigh") or info.get("regularMarketDayHigh") or 0),
                low24h=float(info.get("dayLow") or info.get("regularMarketDayLow") or 0),
            )
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("Failed to parse Yahoo ticker for %s: %s", symbol, exc)
            return None

    async def get_symbols(self) -> list[TradingPair]:
        pairs: list[TradingPair] = []
        for symbol, base, quote in COMMON_SYMBOLS:
            pairs.append(
                TradingPair(
                    symbol=symbol,
                    base=base,
                    quote=quote,
                    exchange=self.name,
                    active=True,
                )
            )
        return pairs

    async def get_orderbook(self, symbol: str, depth: int = 20) -> dict:
        # Yahoo Finance does not provide order-book data
        logger.debug("Yahoo Finance does not support order book data for %s", symbol)
        return {"bids": [], "asks": [], "note": "Order book not available via Yahoo Finance"}
