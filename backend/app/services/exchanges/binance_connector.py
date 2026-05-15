"""
Binance REST API connector (v3 Spot).

Uses direct httpx calls rather than the python-binance library so we
have full async control and no hidden blocking calls.

Public endpoints (market data) require no authentication.
Authenticated endpoints sign requests with HMAC-SHA256.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.models.market import OHLCVData, MarketTicker, TradingPair
from app.services.exchanges.base import BaseExchange

logger = logging.getLogger(__name__)

# Binance timeframe aliases (Binance uses the same notation we use)
TIMEFRAME_MAP: dict[str, str] = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "2h": "2h",
    "4h": "4h",
    "6h": "6h",
    "8h": "8h",
    "12h": "12h",
    "1d": "1d",
    "3d": "3d",
    "1w": "1w",
    "1M": "1M",
}


class BinanceConnector(BaseExchange):
    """Async Binance Spot REST API connector."""

    name = "binance"

    def __init__(self) -> None:
        self._base_url = settings.binance_base_url
        self._api_key = settings.BINANCE_API_KEY
        self._secret = settings.BINANCE_SECRET
        self._client: Optional[httpx.AsyncClient] = None

    # ------------------------------------------------------------------ #
    # HTTP session management
    # ------------------------------------------------------------------ #

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers: dict[str, str] = {"Content-Type": "application/json"}
            if self._api_key:
                headers["X-MBX-APIKEY"] = self._api_key
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
    # Authentication helpers
    # ------------------------------------------------------------------ #

    def _sign(self, params: dict[str, Any]) -> dict[str, Any]:
        """Add HMAC-SHA256 signature required for authenticated endpoints."""
        if not self._secret:
            return params
        params["timestamp"] = int(time.time() * 1000)
        query_string = urlencode(params)
        signature = hmac.new(
            self._secret.encode("utf-8"),
            query_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        params["signature"] = signature
        return params

    # ------------------------------------------------------------------ #
    # Internal request helper
    # ------------------------------------------------------------------ #

    async def _get(self, path: str, params: Optional[dict] = None) -> Any:
        """Send a GET request. Returns parsed JSON or None on failure."""
        client = self._get_client()
        try:
            response = await client.get(path, params=params or {})
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Binance HTTP error %s for %s: %s",
                exc.response.status_code,
                path,
                exc.response.text[:200],
            )
        except Exception as exc:
            logger.warning("Binance request failed for %s: %s", path, exc)
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
        interval = TIMEFRAME_MAP.get(timeframe, "1h")
        params = {"symbol": symbol.upper(), "interval": interval, "limit": min(limit, 1000)}
        raw = await self._get("/api/v3/klines", params)
        if not raw:
            return []

        result: list[OHLCVData] = []
        for candle in raw:
            try:
                result.append(
                    OHLCVData(
                        symbol=symbol.upper(),
                        exchange=self.name,
                        timeframe=timeframe,
                        timestamp=datetime.fromtimestamp(candle[0] / 1000, tz=timezone.utc),
                        open=float(candle[1]),
                        high=float(candle[2]),
                        low=float(candle[3]),
                        close=float(candle[4]),
                        volume=float(candle[5]),
                    )
                )
            except (IndexError, ValueError) as exc:
                logger.debug("Skipping malformed candle: %s", exc)
        return result

    async def get_ticker(self, symbol: str) -> Optional[MarketTicker]:
        params = {"symbol": symbol.upper()}
        raw = await self._get("/api/v3/ticker/24hr", params)
        if not raw:
            return None
        try:
            return MarketTicker(
                symbol=raw["symbol"],
                exchange=self.name,
                price=float(raw["lastPrice"]),
                change24h=float(raw["priceChange"]),
                change24h_pct=float(raw["priceChangePercent"]),
                volume24h=float(raw["volume"]),
                high24h=float(raw["highPrice"]),
                low24h=float(raw["lowPrice"]),
            )
        except (KeyError, ValueError) as exc:
            logger.warning("Failed to parse Binance ticker: %s", exc)
            return None

    async def get_symbols(self) -> list[TradingPair]:
        raw = await self._get("/api/v3/exchangeInfo")
        if not raw:
            return []
        pairs: list[TradingPair] = []
        for sym in raw.get("symbols", []):
            if sym.get("status") != "TRADING":
                continue
            try:
                pairs.append(
                    TradingPair(
                        symbol=sym["symbol"],
                        base=sym["baseAsset"],
                        quote=sym["quoteAsset"],
                        exchange=self.name,
                        active=True,
                    )
                )
            except (KeyError, ValueError):
                continue
        return pairs

    async def get_orderbook(self, symbol: str, depth: int = 20) -> dict:
        params = {"symbol": symbol.upper(), "limit": min(depth, 5000)}
        raw = await self._get("/api/v3/depth", params)
        if not raw:
            return {"bids": [], "asks": []}
        return {
            "bids": [[float(p), float(q)] for p, q in raw.get("bids", [])],
            "asks": [[float(p), float(q)] for p, q in raw.get("asks", [])],
        }
