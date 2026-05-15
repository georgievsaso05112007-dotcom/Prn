"""
Price and signal alert management routes (in-memory store).

GET    /api/alerts              – list all alerts
POST   /api/alerts              – create an alert
PUT    /api/alerts/{id}         – update an alert
DELETE /api/alerts/{id}         – delete an alert
POST   /api/alerts/check        – manually trigger alert evaluation
GET    /api/alerts/{id}         – get a specific alert
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import get_data_manager
from app.models.market import SignalType
from app.services.data_manager import DataManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/alerts", tags=["Alerts"])


# ------------------------------------------------------------------ #
# Alert models
# ------------------------------------------------------------------ #


class AlertType(str, Enum):
    PRICE_ABOVE = "PRICE_ABOVE"
    PRICE_BELOW = "PRICE_BELOW"
    PRICE_CHANGE_PCT = "PRICE_CHANGE_PCT"
    SIGNAL_CHANGE = "SIGNAL_CHANGE"
    RSI_ABOVE = "RSI_ABOVE"
    RSI_BELOW = "RSI_BELOW"


class AlertStatus(str, Enum):
    ACTIVE = "ACTIVE"
    TRIGGERED = "TRIGGERED"
    DISABLED = "DISABLED"


class Alert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    symbol: str
    exchange: str = "binance"
    timeframe: str = "1h"
    alert_type: AlertType
    threshold: float = Field(..., description="Trigger value (price, %, RSI level, etc.)")
    signal_target: Optional[SignalType] = Field(
        None, description="For SIGNAL_CHANGE alerts: which signal triggers"
    )
    status: AlertStatus = AlertStatus.ACTIVE
    notify_email: Optional[str] = None
    notify_webhook: Optional[str] = None
    message: str = ""
    triggered_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    last_checked_at: Optional[datetime] = None
    last_value: Optional[float] = Field(None, description="Last seen value (price / RSI)")
    metadata: dict[str, Any] = Field(default_factory=dict)


class AlertCreate(BaseModel):
    name: str
    symbol: str
    exchange: str = "binance"
    timeframe: str = "1h"
    alert_type: AlertType
    threshold: float
    signal_target: Optional[SignalType] = None
    notify_email: Optional[str] = None
    notify_webhook: Optional[str] = None
    message: str = ""


class AlertUpdate(BaseModel):
    name: Optional[str] = None
    threshold: Optional[float] = None
    signal_target: Optional[SignalType] = None
    notify_email: Optional[str] = None
    notify_webhook: Optional[str] = None
    message: Optional[str] = None
    status: Optional[AlertStatus] = None


class AlertCheckResult(BaseModel):
    alert_id: str
    symbol: str
    triggered: bool
    current_value: Optional[float]
    threshold: float
    message: str


# ------------------------------------------------------------------ #
# In-memory store
# ------------------------------------------------------------------ #

_store: dict[str, Alert] = {}


# ------------------------------------------------------------------ #
# Routes
# ------------------------------------------------------------------ #


@router.get("", response_model=list[Alert])
async def list_alerts(status: Optional[AlertStatus] = None) -> list[Alert]:
    """List all alerts, optionally filtered by status."""
    alerts = list(_store.values())
    if status is not None:
        alerts = [a for a in alerts if a.status == status]
    return sorted(alerts, key=lambda a: a.created_at, reverse=True)


@router.get("/{alert_id}", response_model=Alert)
async def get_alert(alert_id: str) -> Alert:
    """Fetch a single alert by ID."""
    alert = _store.get(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")
    return alert


@router.post("", response_model=Alert, status_code=201)
async def create_alert(payload: AlertCreate) -> Alert:
    """Create a new price or signal alert."""
    alert = Alert(
        name=payload.name,
        symbol=payload.symbol.upper(),
        exchange=payload.exchange.lower(),
        timeframe=payload.timeframe,
        alert_type=payload.alert_type,
        threshold=payload.threshold,
        signal_target=payload.signal_target,
        notify_email=payload.notify_email,
        notify_webhook=payload.notify_webhook,
        message=payload.message,
    )
    _store[alert.id] = alert
    logger.info(
        "Alert created: '%s' for %s/%s (type=%s, threshold=%s)",
        alert.name, alert.exchange, alert.symbol, alert.alert_type, alert.threshold,
    )
    return alert


@router.put("/{alert_id}", response_model=Alert)
async def update_alert(alert_id: str, payload: AlertUpdate) -> Alert:
    """Update an existing alert."""
    alert = _store.get(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")

    update_data = payload.model_dump(exclude_unset=True)
    updated = alert.model_copy(
        update={**update_data, "updated_at": datetime.now(tz=timezone.utc)}
    )
    _store[alert_id] = updated
    return updated


@router.delete("/{alert_id}", status_code=204)
async def delete_alert(alert_id: str) -> None:
    """Delete an alert."""
    if alert_id not in _store:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")
    del _store[alert_id]
    logger.info("Alert deleted: %s", alert_id)


@router.post("/check", response_model=list[AlertCheckResult])
async def check_alerts(
    dm: DataManager = Depends(get_data_manager),
) -> list[AlertCheckResult]:
    """
    Evaluate all active alerts against the latest market data.

    For each ACTIVE alert:
      - Fetch the current ticker price (or RSI value for RSI alerts)
      - Compare against threshold
      - Mark as TRIGGERED if condition met
    """
    from app.services.technical_analysis import ta_service

    results: list[AlertCheckResult] = []
    now = datetime.now(tz=timezone.utc)

    for alert in list(_store.values()):
        if alert.status != AlertStatus.ACTIVE:
            continue

        triggered = False
        current_value: Optional[float] = None
        msg = ""

        try:
            if alert.alert_type in (AlertType.PRICE_ABOVE, AlertType.PRICE_BELOW, AlertType.PRICE_CHANGE_PCT):
                ticker = await dm.get_ticker(symbol=alert.symbol, exchange=alert.exchange)
                if ticker:
                    current_value = ticker.price
                    if alert.alert_type == AlertType.PRICE_ABOVE:
                        triggered = current_value >= alert.threshold
                        msg = f"Price {current_value} >= {alert.threshold}"
                    elif alert.alert_type == AlertType.PRICE_BELOW:
                        triggered = current_value <= alert.threshold
                        msg = f"Price {current_value} <= {alert.threshold}"
                    elif alert.alert_type == AlertType.PRICE_CHANGE_PCT:
                        triggered = abs(ticker.change24h_pct) >= alert.threshold
                        current_value = ticker.change24h_pct
                        msg = f"24h change {ticker.change24h_pct:.2f}% >= ±{alert.threshold}%"

            elif alert.alert_type in (AlertType.RSI_ABOVE, AlertType.RSI_BELOW):
                df = await dm.get_ohlcv_df(
                    symbol=alert.symbol,
                    exchange=alert.exchange,
                    timeframe=alert.timeframe,
                    limit=50,
                )
                if not df.empty:
                    import asyncio
                    loop = asyncio.get_event_loop()
                    rsi_series = await loop.run_in_executor(
                        None, ta_service.compute_rsi, df
                    )
                    rsi_val = ta_service._last(rsi_series)
                    if rsi_val is not None:
                        current_value = rsi_val
                        if alert.alert_type == AlertType.RSI_ABOVE:
                            triggered = rsi_val >= alert.threshold
                            msg = f"RSI {rsi_val:.1f} >= {alert.threshold}"
                        else:
                            triggered = rsi_val <= alert.threshold
                            msg = f"RSI {rsi_val:.1f} <= {alert.threshold}"

        except Exception as exc:
            logger.warning("Alert check failed for %s: %s", alert.id, exc)
            msg = f"Check error: {exc}"

        # Update alert state
        updated = alert.model_copy(
            update={
                "last_checked_at": now,
                "last_value": current_value,
                "status": AlertStatus.TRIGGERED if triggered else alert.status,
                "triggered_at": now if triggered and not alert.triggered_at else alert.triggered_at,
            }
        )
        _store[alert.id] = updated

        results.append(
            AlertCheckResult(
                alert_id=alert.id,
                symbol=alert.symbol,
                triggered=triggered,
                current_value=current_value,
                threshold=alert.threshold,
                message=msg or alert.message,
            )
        )

    return results
