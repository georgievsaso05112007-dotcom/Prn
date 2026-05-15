"""
AI Trading App – FastAPI application entry point.

Startup sequence:
  1. Load settings from environment / .env
  2. Initialise the DataManager (creates exchange connectors)
  3. Mount all API routers
  4. Configure CORS, error handlers, and the WebSocket endpoint

The app starts correctly even when no API keys are configured:
exchange connectors gracefully return empty data in that case.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.services.data_manager import data_manager

# Route modules
from app.api.routes.market import router as market_router
from app.api.routes.analysis import router as analysis_router
from app.api.routes.strategies import router as strategies_router
from app.api.routes.portfolio import router as portfolio_router
from app.api.routes.alerts import router as alerts_router

# ------------------------------------------------------------------ #
# Logging
# ------------------------------------------------------------------ #

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------ #
# Lifespan (startup / shutdown)
# ------------------------------------------------------------------ #


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application-level resources."""
    logger.info("Starting AI Trading Backend …")
    await data_manager.initialise()
    logger.info(
        "Exchange connectors ready: %s",
        data_manager.available_exchanges(),
    )
    yield
    logger.info("Shutting down AI Trading Backend …")
    await data_manager.shutdown()
    logger.info("Shutdown complete.")


# ------------------------------------------------------------------ #
# Application instance
# ------------------------------------------------------------------ #

app = FastAPI(
    title="AI Trading App API",
    description=(
        "REST and WebSocket API for the AI Trading mobile app. "
        "Provides real-time market data, technical analysis, "
        "strategy management, portfolio tracking, and alerts."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ------------------------------------------------------------------ #
# Middleware
# ------------------------------------------------------------------ #

# CORS – allow all origins in development; restrict in production via
# the CORS_ORIGINS env variable.
_origins = settings.cors_origins_list

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------ #
# Global exception handlers
# ------------------------------------------------------------------ #


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception on %s: %s", request.url, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc),
            "path": str(request.url),
        },
    )


# ------------------------------------------------------------------ #
# Routers
# ------------------------------------------------------------------ #

API_PREFIX = "/api"

app.include_router(market_router, prefix=API_PREFIX)
app.include_router(analysis_router, prefix=API_PREFIX)
app.include_router(strategies_router, prefix=API_PREFIX)
app.include_router(portfolio_router, prefix=API_PREFIX)
app.include_router(alerts_router, prefix=API_PREFIX)

# ------------------------------------------------------------------ #
# Health / meta endpoints
# ------------------------------------------------------------------ #


@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, Any]:
    """
    Liveness probe.

    Returns basic app metadata and which exchange connectors are
    registered (regardless of whether they have valid API keys).
    """
    return {
        "status": "ok",
        "version": "1.0.0",
        "exchanges": data_manager.available_exchanges(),
        "timestamp": time.time(),
    }


@app.get("/", tags=["Health"])
async def root() -> dict[str, str]:
    """Redirect hint for the API root."""
    return {
        "message": "AI Trading App API",
        "docs": "/docs",
        "health": "/health",
    }


# ------------------------------------------------------------------ #
# Top-level WebSocket endpoint (symbol stream)
# ------------------------------------------------------------------ #


@app.websocket("/ws/market/{symbol}")
async def ws_market_symbol(
    websocket: WebSocket,
    symbol: str,
    exchange: str = "binance",
) -> None:
    """
    Convenience WebSocket endpoint at the root level.

    Path:  /ws/market/{symbol}?exchange=binance
    Pushes a MarketTicker JSON object every 2 seconds.
    """
    await websocket.accept()
    logger.info("Root WS connected: %s/%s", exchange, symbol)

    try:
        while True:
            ticker = await data_manager.get_ticker(symbol=symbol, exchange=exchange)
            if ticker is not None:
                await websocket.send_text(ticker.model_dump_json())
            else:
                await websocket.send_text(
                    json.dumps({"error": "Ticker unavailable", "symbol": symbol, "exchange": exchange})
                )
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        logger.info("Root WS disconnected: %s/%s", exchange, symbol)
    except Exception as exc:
        logger.warning("Root WS error [%s/%s]: %s", exchange, symbol, exc)
        try:
            await websocket.close()
        except Exception:
            pass


# ------------------------------------------------------------------ #
# Dev entry point
# ------------------------------------------------------------------ #

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=True,
        log_level=settings.LOG_LEVEL.lower(),
    )
