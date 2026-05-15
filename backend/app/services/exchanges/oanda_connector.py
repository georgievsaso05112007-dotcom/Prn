"""
OANDA v3 REST API connector for Forex data.

Uses direct httpx calls against the OANDA REST API.
Supports both live (api-fxtrade.oanda.com) and practice
(api-fxpractice.oanda.com) environments.

OANDA uses instrument notation with underscores: EUR_USD, GBP_USD, etc.
We accept both formats ("EUR/USD", "EURUSD", "EUR_USD") and normalise internally.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.models.market import OHLCVData, MarketTicker, TradingPair
from app.services.exchanges.base import BaseExchange

logger = logging.getLogger(__name__)

# Map generic timeframe strings → OANDA granularity values
TIMEFRAME_MAP: dict[str, str] = {
    "1m":  "M1",
    "5m":  "M5",
    "10m": "M10",
    "15m": "M15",
    "30m": "M30",
    "1h":  "H1",
    "2h":  "H2",
    "4h":  "H4",
    "6h":  "H6",
    "12h": "H12",
    "1d":  "D",
    "1w":  "W",
    "1M":  "M",
}

# Common OANDA instruments
COMMON_INSTRUMENTS: list[tuple[str, str, str]] = [
    ("EUR_USD", "EUR", "USD"),
    ("GBP_USD", "GBP", "USD"),
    ("USD_JPY", "USD", "JPY"),
    ("USD_CHF", "USD", "CHF"),
    ("AUD_USD", "AUD", "USD"),
    ("USD_CAD", "USD", "CAD"),
    ("NZD_USD", "NZD", "USD"),
    ("EUR_GBP", "EUR", "GBP"),
    ("EUR_JPY", "EUR", "JPY"),
    ("GBP_JPY", "GBP", "JPY"),
    ("XAU_USD", "XAU", "USD"),  # Gold
    ("XAG_USD", "XAG", "USD"),  # Silver
    ("BCO_USD", "BCO", "USD"),  # Brent Crude Oil
    ("WTICO_USD", "WTICO", "USD"),  # WTI Crude Oil
]


def _normalise_instrument(symbol: str) -> str:
    """Convert various symbol formats to OANDA's underscore notation."""
    # Already in OANDA format
    if "_" in symbol:
        return symbol.upper()
    # Slash notation: EUR/USD → EUR_USD
    if "/" in symbol:
        return symbol.upper().replace("/", "_")
    # 6-char EURUSD → EUR_USD (common forex convention)
    if len(symbol) == 6 and symbol.isalpha():
        return f"{symbol[:3].upper()}_{symbol[3:].upper()}"
    return symbol.upper()


class OandaConnector(BaseExchange):
    """Async OANDA v3 REST API connector."""

    name = "oanda"

    def __init__(self) -> None:
        self._base_url = settings.oanda_base_url
        self._api_key = settings.OANDA_API_KEY
        self._account_id = settings.OANDA_ACCOUNT_ID
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers: dict[str, str] = {"Content-Type": "application/json"}
            if self._api_key:
                headers["Authorization"] = f"Bearer {self._api_key}"
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                headers=headers,
                timeout=15.0,
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ------------------------------------------------------------------ #
    # HTTP helpers
    # ------------------------------------------------------------------ #

    async def _get(self, path: str, params: Optional[dict] = None) -> Any:
        if not self._api_key:
            logger.debug("OANDA API key not configured; skipping request to %s", path)
            return None
        client = self._get_client()
        try:
            response = await client.get(path, params=params or {})
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "OANDA HTTP error %s for %s: %s",
                exc.response.status_code,
                path,
                exc.response.text[:200],
            )
        except Exception as exc:
            logger.warning("OANDA request failed for %s: %s", path, exc)
        return None

    # ------------------------------------------------------------------ #
    # BaseExchange implementation
    # ------------------------------------------------------------------ #

    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 200,
    ) -> list[OHLCVData]:
        instrument = _normalise_instrument(symbol)
        granularity = TIMEFRAME_MAP.get(timeframe, "H1")
        params = {
            "granularity": granularity,
            "count": min(limit, 5000),
            "price": "M",  # midpoint candles
        }
        path = f"/instruments/{instrument}/candles"
        raw = await self._get(path, params)
        if not raw:
            return []

        candles = raw.get("candles", [])
        result: list[OHLCVData] = []

        for candle in candles:
            if not candle.get("complete", True):
                continue  # skip the still-forming candle
            mid = candle.get("mid", {})
            try:
                result.append(
                    OHLCVData(
                        symbol=instrument,
                        exchange=self.name,
                        timeframe=timeframe,
                        timestamp=datetime.fromisoformat(
                            candle["time"].replace("Z", "+00:00")
                        ),
                        open=float(mid["o"]),
                        high=float(mid["h"]),
                        low=float(mid["l"]),
                        close=float(mid["c"]),
                        volume=float(candle.get("volume", 0)),
                    )
                )
            except (KeyError, ValueError) as exc:
                logger.debug("Skipping malformed OANDA candle: %s", exc)

        return result

    async def get_ticker(self, symbol: str) -> Optional[MarketTicker]:
        if not self._account_id:
            logger.debug("OANDA account ID not configured; cannot fetch ticker")
            return None

        instrument = _normalise_instrument(symbol)
        params = {"instruments": instrument}
        path = f"/accounts/{self._account_id}/pricing"
        raw = await self._get(path, params)
        if not raw:
            return None

        prices = raw.get("prices", [])
        if not prices:
            return None

        price_data = prices[0]
        try:
            bids = price_data.get("bids", [])
            asks = price_data.get("asks", [])
            bid = float(bids[0]["price"]) if bids else 0.0
            ask = float(asks[0]["price"]) if asks else 0.0
            mid_price = (bid + ask) / 2 if bid and ask else (bid or ask)

            return MarketTicker(
                symbol=instrument,
                exchange=self.name,
                price=mid_price,
                change24h=0.0,       # OANDA pricing doesn't return 24h change directly
                change24h_pct=0.0,
                volume24h=0.0,
                high24h=0.0,
                low24h=0.0,
            )
        except (KeyError, ValueError, IndexError, TypeError) as exc:
            logger.warning("Failed to parse OANDA ticker for %s: %s", symbol, exc)
            return None

    async def get_symbols(self) -> list[TradingPair]:
        # If we have account credentials, fetch the live instrument list
        if self._account_id and self._api_key:
            path = f"/accounts/{self._account_id}/instruments"
            raw = await self._get(path)
            if raw:
                pairs: list[TradingPair] = []
                for item in raw.get("instruments", []):
                    name = item.get("name", "")
                    parts = name.split("_")
                    base = parts[0] if parts else name
                    quote = parts[1] if len(parts) > 1 else ""
                    pairs.append(
                        TradingPair(
                            symbol=name,
                            base=base,
                            quote=quote,
                            exchange=self.name,
                            active=True,
                        )
                    )
                return pairs

        # Fallback: return the hardcoded common instrument list
        return [
            TradingPair(symbol=sym, base=base, quote=quote, exchange=self.name, active=True)
            for sym, base, quote in COMMON_INSTRUMENTS
        ]

    async def get_orderbook(self, symbol: str, depth: int = 20) -> dict:
        """
        OANDA does not expose a traditional order book for retail accounts.
        Returns empty structure for compatibility.
        """
        return {
            "bids": [],
            "asks": [],
            "note": "Order book not available via OANDA v3 REST API for retail accounts.",
        }
