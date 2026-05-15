"""
Application configuration using Pydantic Settings.
All values are read from environment variables or .env file.
Every field is optional so the app starts without any keys configured.
"""

from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------ #
    # Binance
    # ------------------------------------------------------------------ #
    BINANCE_API_KEY: Optional[str] = None
    BINANCE_SECRET: Optional[str] = None
    BINANCE_TESTNET: bool = False

    # ------------------------------------------------------------------ #
    # Bybit
    # ------------------------------------------------------------------ #
    BYBIT_API_KEY: Optional[str] = None
    BYBIT_SECRET: Optional[str] = None
    BYBIT_NETWORK: str = "mainnet"  # "mainnet" | "testnet"

    # ------------------------------------------------------------------ #
    # OANDA (Forex)
    # ------------------------------------------------------------------ #
    OANDA_API_KEY: Optional[str] = None
    OANDA_ACCOUNT_ID: Optional[str] = None
    OANDA_ENVIRONMENT: str = "practice"  # "live" | "practice"

    # ------------------------------------------------------------------ #
    # Alpaca (US Stocks / ETFs)
    # ------------------------------------------------------------------ #
    ALPACA_API_KEY: Optional[str] = None
    ALPACA_SECRET: Optional[str] = None
    ALPACA_PAPER: bool = True

    # ------------------------------------------------------------------ #
    # Anthropic / Claude AI
    # ------------------------------------------------------------------ #
    ANTHROPIC_API_KEY: Optional[str] = None

    # ------------------------------------------------------------------ #
    # Database
    # ------------------------------------------------------------------ #
    DATABASE_URL: str = "sqlite+aiosqlite:///./trading.db"

    # ------------------------------------------------------------------ #
    # Redis
    # ------------------------------------------------------------------ #
    REDIS_URL: Optional[str] = None

    # ------------------------------------------------------------------ #
    # Security
    # ------------------------------------------------------------------ #
    SECRET_KEY: str = "insecure-default-change-in-production"

    # ------------------------------------------------------------------ #
    # App / Server
    # ------------------------------------------------------------------ #
    CORS_ORIGINS: str = "*"
    LOG_LEVEL: str = "INFO"
    PORT: int = 8000

    # ------------------------------------------------------------------ #
    # Derived helpers
    # ------------------------------------------------------------------ #

    @property
    def cors_origins_list(self) -> list[str]:
        """Return CORS origins as a list."""
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def binance_base_url(self) -> str:
        if self.BINANCE_TESTNET:
            return "https://testnet.binance.vision"
        return "https://api.binance.com"

    @property
    def bybit_base_url(self) -> str:
        if self.BYBIT_NETWORK == "testnet":
            return "https://api-testnet.bybit.com"
        return "https://api.bybit.com"

    @property
    def oanda_base_url(self) -> str:
        if self.OANDA_ENVIRONMENT == "live":
            return "https://api-fxtrade.oanda.com/v3"
        return "https://api-fxpractice.oanda.com/v3"


# Singleton instance used across the entire application
settings = Settings()
