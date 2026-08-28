from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_prefix="PUCKSSTUDIO_", extra="ignore")

    database_url: str = Field(validation_alias="DATABASE_URL")
    db_min_size: int = Field(default=1, ge=0)
    db_max_size: int = Field(default=5, ge=1)
    db_pool_timeout_seconds: float = Field(default=10, gt=0)
    db_statement_timeout_ms: int = Field(default=15_000, ge=1_000)
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
