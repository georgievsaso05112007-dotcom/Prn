"""
Analysis routes.

POST /api/analysis/technical – compute technical indicators for a symbol
POST /api/analysis/ai        – AI/ML analysis (LLM-enhanced)
GET  /api/analysis/signals   – latest signals across multiple symbols
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import get_data_manager, get_ta_service
from app.models.market import AnalysisResult, SignalType, TechnicalIndicators
from app.services.data_manager import DataManager
from app.services.technical_analysis import TechnicalAnalysisService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analysis", tags=["Analysis"])


# ------------------------------------------------------------------ #
# Request / response schemas
# ------------------------------------------------------------------ #


class TechnicalAnalysisRequest(BaseModel):
    symbol: str = Field(..., description="Trading pair, e.g. BTCUSDT")
    exchange: str = Field("binance", description="Exchange identifier")
    timeframe: str = Field("1h", description="Candle interval")
    limit: int = Field(200, ge=50, le=1000, description="Number of candles to analyse")


class AIAnalysisRequest(BaseModel):
    symbol: str = Field(..., description="Trading pair, e.g. BTCUSDT")
    exchange: str = Field("binance")
    timeframe: str = Field("1h")
    limit: int = Field(200, ge=50, le=1000)
    use_llm: bool = Field(
        False,
        description="Whether to call the LLM for a narrative explanation (requires ANTHROPIC_API_KEY)",
    )


class SignalsRequest(BaseModel):
    symbols: list[str] = Field(
        default=["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"],
        description="List of symbols to compute signals for",
    )
    exchange: str = Field("binance")
    timeframe: str = Field("1h")
    limit: int = Field(100, ge=50, le=500)


# ------------------------------------------------------------------ #
# Routes
# ------------------------------------------------------------------ #


@router.post("/technical", response_model=AnalysisResult)
async def technical_analysis(
    request: TechnicalAnalysisRequest,
    dm: DataManager = Depends(get_data_manager),
    ta: TechnicalAnalysisService = Depends(get_ta_service),
) -> AnalysisResult:
    """
    Compute a full set of technical indicators for the given symbol and
    return a BUY / SELL / NEUTRAL signal with confidence score.
    """
    df = await dm.get_ohlcv_df(
        symbol=request.symbol,
        exchange=request.exchange,
        timeframe=request.timeframe,
        limit=request.limit,
    )

    if df.empty:
        raise HTTPException(
            status_code=503,
            detail=f"No OHLCV data available for {request.symbol} on {request.exchange}. "
                   "The exchange may be unreachable or the symbol may be invalid.",
        )

    # Run pandas/TA computation in thread pool to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        ta.generate_analysis,
        df,
        request.symbol,
        request.exchange,
        request.timeframe,
    )
    return result


@router.post("/ai", response_model=AnalysisResult)
async def ai_analysis(
    request: AIAnalysisRequest,
    dm: DataManager = Depends(get_data_manager),
    ta: TechnicalAnalysisService = Depends(get_ta_service),
) -> AnalysisResult:
    """
    Technical analysis optionally enhanced with an LLM narrative.

    When `use_llm=true` and ANTHROPIC_API_KEY is configured, Claude is
    asked to interpret the computed indicators and provide an explanation.
    Otherwise the endpoint falls back to the rule-based explanation from
    the technical analysis service.
    """
    df = await dm.get_ohlcv_df(
        symbol=request.symbol,
        exchange=request.exchange,
        timeframe=request.timeframe,
        limit=request.limit,
    )

    if df.empty:
        raise HTTPException(
            status_code=503,
            detail=f"No OHLCV data available for {request.symbol} on {request.exchange}.",
        )

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        ta.generate_analysis,
        df,
        request.symbol,
        request.exchange,
        request.timeframe,
    )

    if request.use_llm:
        result = await _enhance_with_llm(result)

    return result


async def _enhance_with_llm(result: AnalysisResult) -> AnalysisResult:
    """
    Call Claude via the Anthropic SDK to generate a natural-language
    interpretation of the technical indicators.

    Gracefully falls back to the rule-based explanation on failure.
    """
    from app.core.config import settings

    if not settings.ANTHROPIC_API_KEY:
        logger.debug("ANTHROPIC_API_KEY not set; skipping LLM enhancement")
        return result

    try:
        import anthropic  # type: ignore[import]

        ind = result.indicators
        prompt = (
            f"You are an expert technical analyst. Analyse these indicators for "
            f"{result.symbol} on the {result.timeframe} timeframe and provide a "
            f"concise 2-3 sentence trading insight:\n\n"
            f"- RSI: {ind.rsi}\n"
            f"- MACD line: {ind.macd.line if ind.macd else 'N/A'}, "
            f"histogram: {ind.macd.histogram if ind.macd else 'N/A'}\n"
            f"- EMA20: {ind.ema20}, EMA50: {ind.ema50}, EMA200: {ind.ema200}\n"
            f"- Bollinger Bands upper: {ind.bollinger_bands.upper if ind.bollinger_bands else 'N/A'}, "
            f"lower: {ind.bollinger_bands.lower if ind.bollinger_bands else 'N/A'}\n"
            f"- ATR: {ind.atr}\n"
            f"- Stochastic K: {ind.stochastic.k if ind.stochastic else 'N/A'}\n"
            f"- Rule-based signal: {result.signal} (confidence: {result.confidence:.0%})\n\n"
            "Focus on actionable insights. Be concise."
        )

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = await client.messages.create(
            model="claude-opus-4-5",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        llm_explanation = message.content[0].text if message.content else ""
        if llm_explanation:
            result.explanation = llm_explanation

    except Exception as exc:
        logger.warning("LLM enhancement failed: %s", exc)

    return result


@router.get("/signals", response_model=list[AnalysisResult])
async def get_signals(
    exchange: str = "binance",
    timeframe: str = "1h",
    limit: int = 20,
    dm: DataManager = Depends(get_data_manager),
    ta: TechnicalAnalysisService = Depends(get_ta_service),
) -> list[AnalysisResult]:
    """
    Compute and return the latest trading signals for the top symbols on
    the specified exchange.

    Signals are computed concurrently for performance.
    """
    # Use a hardcoded list for popular symbols; a future version could
    # pull the top N by volume from the exchange.
    symbol_map: dict[str, list[str]] = {
        "binance":      ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
                         "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT"],
        "bybit":        ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"],
        "bybit_linear": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
        "yahoo":        ["AAPL", "MSFT", "NVDA", "GOOGL", "TSLA"],
        "oanda":        ["EUR_USD", "GBP_USD", "USD_JPY"],
    }
    symbols = symbol_map.get(exchange.lower(), symbol_map["binance"])
    symbols = symbols[: min(limit, len(symbols))]

    loop = asyncio.get_event_loop()

    async def _analyse_one(sym: str) -> Optional[AnalysisResult]:
        try:
            df = await dm.get_ohlcv_df(sym, exchange, timeframe, 100)
            if df.empty:
                return None
            return await loop.run_in_executor(
                None, ta.generate_analysis, df, sym, exchange, timeframe
            )
        except Exception as exc:
            logger.warning("Signal computation failed for %s: %s", sym, exc)
            return None

    tasks = [_analyse_one(sym) for sym in symbols]
    results = await asyncio.gather(*tasks)
    return [r for r in results if r is not None]
