"""
Market data routes.

GET  /api/market/symbols    – list tradeable instruments on an exchange
GET  /api/market/ohlcv      – fetch OHLCV candles
GET  /api/market/ticker     – fetch 24h ticker
GET  /api/market/orderbook  – fetch order book
WS   /ws/market/{symbol}    – real-time ticker stream (polling-based)
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.api.deps import get_data_manager
from app.models.market import MarketTicker, OHLCVData, TradingPair
from app.services.data_manager import DataManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["Market Data"])


# ------------------------------------------------------------------ #
# REST endpoints
# ------------------------------------------------------------------ #


@router.get("/symbols", response_model=list[TradingPair])
async def list_symbols(
    exchange: str = Query("binance", description="Exchange identifier"),
    dm: DataManager = Depends(get_data_manager),
) -> list[TradingPair]:
    """
    List all tradeable instruments available on the specified exchange.
    Returns an empty list if the exchange is unknown or the request fails.
    """
    return await dm.get_symbols(exchange=exchange)


@router.get("/ohlcv", response_model=list[OHLCVData])
async def get_ohlcv(
    symbol: str = Query(..., description="Trading pair, e.g. BTCUSDT"),
    exchange: str = Query("binance", description="Exchange identifier"),
    timeframe: str = Query("1h", description="Candle interval, e.g. 1m 5m 15m 1h 4h 1d"),
    limit: int = Query(200, ge=1, le=1000, description="Number of candles to return"),
    dm: DataManager = Depends(get_data_manager),
) -> list[OHLCVData]:
    """
    Fetch OHLCV candlestick data for a symbol.
    Returns candles sorted ascending by timestamp.
    """
    return await dm.get_ohlcv(symbol=symbol, exchange=exchange, timeframe=timeframe, limit=limit)


@router.get("/ticker", response_model=Optional[MarketTicker])
async def get_ticker(
    symbol: str = Query(..., description="Trading pair, e.g. BTCUSDT"),
    exchange: str = Query("binance", description="Exchange identifier"),
    dm: DataManager = Depends(get_data_manager),
) -> Optional[MarketTicker]:
    """
    Fetch the latest 24-hour rolling ticker for a symbol.
    Returns null if the symbol is not found or the exchange is unavailable.
    """
    ticker = await dm.get_ticker(symbol=symbol, exchange=exchange)
    if ticker is None:
        raise HTTPException(
            status_code=404,
            detail=f"Ticker not found for {symbol} on {exchange}",
        )
    return ticker


@router.get("/orderbook")
async def get_orderbook(
    symbol: str = Query(..., description="Trading pair, e.g. BTCUSDT"),
    exchange: str = Query("binance", description="Exchange identifier"),
    depth: int = Query(20, ge=1, le=500, description="Number of bid/ask levels"),
    dm: DataManager = Depends(get_data_manager),
) -> dict:
    """
    Fetch the current order book for a symbol.

    Returns:
        { "bids": [[price, qty], ...], "asks": [[price, qty], ...] }
    """
    return await dm.get_orderbook(symbol=symbol, exchange=exchange, depth=depth)


# ------------------------------------------------------------------ #
# WebSocket – real-time ticker stream
# ------------------------------------------------------------------ #


@router.websocket("/ws/{exchange}/{symbol}")
async def websocket_ticker(
    websocket: WebSocket,
    symbol: str,
    exchange: str = "binance",
    interval: float = 2.0,
) -> None:
    """
    WebSocket endpoint that streams real-time ticker updates.

    The server polls the exchange at `interval` seconds and pushes
    the latest MarketTicker as JSON to all connected clients.

    Path: /ws/market/{exchange}/{symbol}
    Query params:
        interval – polling interval in seconds (default 2.0)
    """
    dm: DataManager = get_data_manager()
    await websocket.accept()
    logger.info("WS connected: %s/%s", exchange, symbol)

    try:
        while True:
            try:
                ticker = await dm.get_ticker(symbol=symbol, exchange=exchange)
                if ticker is not None:
                    await websocket.send_text(
                        ticker.model_dump_json()
                    )
                else:
                    await websocket.send_text(
                        json.dumps({"error": "Ticker unavailable", "symbol": symbol})
                    )
            except WebSocketDisconnect:
                break
            except Exception as exc:
                logger.warning("WS tick error [%s/%s]: %s", exchange, symbol, exc)
                try:
                    await websocket.send_text(json.dumps({"error": str(exc)}))
                except Exception:
                    break

            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        pass
    finally:
        logger.info("WS disconnected: %s/%s", exchange, symbol)
        try:
            await websocket.close()
        except Exception:
            pass
