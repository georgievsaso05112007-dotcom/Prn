"""
ML module for AI trading system.

Provides feature engineering, model training (LSTM + XGBoost ensemble),
and inference with rule-based fallback.
"""

from .features.feature_engineering import FeatureEngineer
from .models.lstm_model import LSTMTradingModel, LSTMTrainer
from .models.xgboost_model import XGBoostTradingModel
from .models.ensemble import EnsembleModel, ModelRegistry
from .training.trainer import TrainingPipeline
from .inference.predictor import TradingPredictor

__all__ = [
    "FeatureEngineer",
    "LSTMTradingModel",
    "LSTMTrainer",
    "XGBoostTradingModel",
    "EnsembleModel",
    "ModelRegistry",
    "TrainingPipeline",
    "TradingPredictor",
]
