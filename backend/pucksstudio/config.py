from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_prefix="PUCKSSTUDIO_", extra="ignore")

    database_url: str = Field(validation_alias="DATABASE_URL")
    db_min_size: int = 1
    db_max_size: int = 5
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
