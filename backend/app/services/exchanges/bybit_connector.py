"""
Bybit v5 REST API connector.

Supports spot, linear (USDT perpetual) and inverse contracts via the
"category" parameter.  Market-data endpoints are public (no auth required).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.models.market import OHLCVData, MarketTicker, TradingPair
from app.services.exchanges.base import BaseExchange

logger = logging.getLogger(__name__)

# Map generic timeframe strings → Bybit interval values
TIMEFRAME_MAP: dict[str, str] = {
    "1m": "1",
    "3m": "3",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "2h": "120",
    "4h": "240",
    "6h": "360",
    "12h": "720",
    "1d": "D",
    "1w": "W",
    "1M": "M",
}


class BybitConnector(BaseExchange):
    """Async Bybit v5 REST API connector."""

    name = "bybit"

    def __init__(self, category: str = "spot") -> None:
        """
        Args:
            category: "spot", "linear", or "inverse".
        """
        self._base_url = settings.bybit_base_url
        self._api_key = settings.BYBIT_API_KEY
        self._secret = settings.BYBIT_SECRET
        self._category = category
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers: dict[str, str] = {"Content-Type": "application/json"}
            if self._api_key:
                headers["X-BAPI-API-KEY"] = self._api_key
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
    # Auth helpers (for future authenticated endpoints)
    # ------------------------------------------------------------------ #

    def _build_signature(self, timestamp: str, recv_window: str, params_str: str) -> str:
        if not self._secret:
            return ""
        sign_payload = f"{timestamp}{self._api_key}{recv_window}{params_str}"
        return hmac.new(
            self._secret.encode("utf-8"),
            sign_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    # ------------------------------------------------------------------ #
    # HTTP helpers
    # ------------------------------------------------------------------ #

    async def _get(self, path: str, params: Optional[dict] = None) -> Any:
        client = self._get_client()
        try:
            response = await client.get(path, params=params or {})
            response.raise_for_status()
            data = response.json()
            if data.get("retCode", 0) != 0:
                logger.warning(
                    "Bybit API error %s: %s", data.get("retCode"), data.get("retMsg")
                )
                return None
            return data.get("result")
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Bybit HTTP error %s for %s: %s",
                exc.response.status_code,
                path,
                exc.response.text[:200],
            )
        except Exception as exc:
            logger.warning("Bybit request failed for %s: %s", path, exc)
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
        interval = TIMEFRAME_MAP.get(timeframe, "60")
        params = {
            "category": self._category,
            "symbol": symbol.upper(),
            "interval": interval,
            "limit": min(limit, 1000),
        }
        result_data = await self._get("/v5/market/kline", params)
        if not result_data:
            return []

        candles = result_data.get("list", [])
        ohlcv_list: list[OHLCVData] = []

        # Bybit returns candles newest-first; reverse for chronological order
        for candle in reversed(candles):
            try:
                # [startTime, open, high, low, close, volume, turnover]
                ohlcv_list.append(
                    OHLCVData(
                        symbol=symbol.upper(),
                        exchange=self.name,
                        timeframe=timeframe,
                        timestamp=datetime.fromtimestamp(int(candle[0]) / 1000, tz=timezone.utc),
                        open=float(candle[1]),
                        high=float(candle[2]),
                        low=float(candle[3]),
                        close=float(candle[4]),
                        volume=float(candle[5]),
                    )
                )
            except (IndexError, ValueError) as exc:
                logger.debug("Skipping malformed Bybit candle: %s", exc)

        return ohlcv_list

    async def get_ticker(self, symbol: str) -> Optional[MarketTicker]:
        params = {"category": self._category, "symbol": symbol.upper()}
        result_data = await self._get("/v5/market/tickers", params)
        if not result_data:
            return None

        items = result_data.get("list", [])
        if not items:
            return None
        raw = items[0]

        try:
            last_price = float(raw.get("lastPrice", 0))
            prev_price = float(raw.get("prevPrice24h", last_price) or last_price)
            change24h = last_price - prev_price
            change24h_pct = ((change24h / prev_price) * 100.0) if prev_price else 0.0

            return MarketTicker(
                symbol=raw["symbol"],
                exchange=self.name,
                price=last_price,
                change24h=change24h,
                change24h_pct=float(raw.get("price24hPcnt", change24h_pct)) * 100
                if "price24hPcnt" in raw and raw["price24hPcnt"]
                else change24h_pct,
                volume24h=float(raw.get("volume24h", 0) or 0),
                high24h=float(raw.get("highPrice24h", 0) or 0),
                low24h=float(raw.get("lowPrice24h", 0) or 0),
            )
        except (KeyError, ValueError) as exc:
            logger.warning("Failed to parse Bybit ticker: %s", exc)
            return None

    async def get_symbols(self) -> list[TradingPair]:
        params = {"category": self._category}
        result_data = await self._get("/v5/market/instruments-info", params)
        if not result_data:
            return []

        pairs: list[TradingPair] = []
        for item in result_data.get("list", []):
            status = item.get("status", "").lower()
            if status not in ("trading", ""):
                continue
            try:
                # For spot: baseCoin / quoteCoin; for linear: baseCoin / quoteCoin too
                pairs.append(
                    TradingPair(
                        symbol=item["symbol"],
                        base=item.get("baseCoin", ""),
                        quote=item.get("quoteCoin", ""),
                        exchange=self.name,
                        active=True,
                    )
                )
            except (KeyError, ValueError):
                continue
        return pairs

    async def get_orderbook(self, symbol: str, depth: int = 20) -> dict:
        params = {
            "category": self._category,
            "symbol": symbol.upper(),
            "limit": min(depth, 200),
        }
        result_data = await self._get("/v5/market/orderbook", params)
        if not result_data:
            return {"bids": [], "asks": []}
        return {
            "bids": [[float(p), float(q)] for p, q in result_data.get("b", [])],
            "asks": [[float(p), float(q)] for p, q in result_data.get("a", [])],
        }
