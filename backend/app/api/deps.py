"""
FastAPI dependency providers.

Use these in route functions via `Depends(get_data_manager)` etc.
"""

from __future__ import annotations

from app.services.data_manager import data_manager, DataManager
from app.services.technical_analysis import ta_service, TechnicalAnalysisService


def get_data_manager() -> DataManager:
    """Return the application-wide DataManager singleton."""
    return data_manager


def get_ta_service() -> TechnicalAnalysisService:
    """Return the application-wide TechnicalAnalysisService singleton."""
    return ta_service
