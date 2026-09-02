from datetime import UTC, date, datetime, timedelta

import polars as pl
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from psycopg import errors as pg_errors

from pucksstudio.api.routes import observability as observability_module
from pucksstudio.config import Settings
from pucksstudio.queries.execution import QueryResult

NOW = datetime.now(UTC)


def result(name: str, rows: list[dict], elapsed_ms: float = 400.0) -> QueryResult:
    return QueryResult(
        name=name, frame=pl.DataFrame(rows, infer_schema_length=None), elapsed_ms=elapsed_ms
    )


def dataset_row(**overrides):
    base = {
        "last_sync_at": NOW - timedelta(hours=1),
        "last_sync_games": 0,
        "latest_completed_game_date": date(2026, 6, 14),
        "latest_event_game_date": date(2026, 6, 14),
        "completed_games": 70339,
        "games_with_events": 70300,
        "missing_event_games": 39,
        "goals_missing_shots": 0,
        "backfill_failed": 0,
        "backfill_pending": 0,
        "backfill_skipped": 95,
        "healthy": False,
    }
    return {**base, **overrides}


def season_row(season: int, completed: int, with_events: int, **overrides):
    base = {
        "season": season,
        "completed_games": completed,
        "games_with_events": with_events,
        "missing_event_games": completed - with_events,
        "event_coverage_pct": with_events / completed * 100,
        "goals_missing_shots": 0,
        "backfill_done": completed,
        "backfill_failed": 0,
        "backfill_skipped": 0,
        "backfill_pending": 0,
        "healthy": completed == with_events,
    }
    return {**base, **overrides}


SEASONS = [
    season_row(20252026, 1417, 1417, backfill_skipped=19),
    season_row(19581959, 251, 228),
]
GAPS = [{"season": 19581959, "acknowledged_gaps": 23, "actionable_gaps": 0}]


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch):
    monkeypatch.setattr(
        observability_module, "get_settings", lambda: Settings(DATABASE_URL="postgresql://test")
    )
    observability_module.reset_cache()
    yield
    observability_module.reset_cache()


def make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(observability_module.router, prefix="/api/v1")
    return app


def install_fetch(monkeypatch, *, dataset=None, seasons=None, gaps=None, missing=None):
    calls: list[str] = []

    async def fetch_dataframe(_database, query_name, parameters):
        calls.append(query_name)
        if query_name == "dataset_health":
            return result(query_name, [dataset or dataset_row()], elapsed_ms=1500)
        if query_name == "season_health":
            return result(query_name, seasons if seasons is not None else SEASONS, 1300)
        if query_name == "season_gap_kinds":
            return result(query_name, gaps if gaps is not None else GAPS, 400)
        if query_name == "season_missing_games":
            assert parameters == {"season": 19581959}
            return result(query_name, missing or [], 350)
        raise AssertionError(f"unexpected query {query_name}")

    monkeypatch.setattr(observability_module, "fetch_dataframe", fetch_dataframe)
    return calls


@pytest.mark.asyncio
async def test_dataset_health_merges_views_with_assessment(monkeypatch) -> None:
    calls = install_fetch(monkeypatch)

    async with AsyncClient(transport=ASGITransport(app=make_app()), base_url="http://t") as client:
        response = await client.get("/api/v1/observability/dataset")

    assert response.status_code == 200
    payload = response.json()
    assert sorted(calls) == ["dataset_health", "season_gap_kinds", "season_health"]
    assert payload["verdict"] == "known_gaps"
    assert payload["summary"]["healthy"] is False
    assert payload["summary"]["acknowledged_gaps"] == 23
    assert payload["summary"]["actionable_gaps"] == 0
    assert payload["sync_overdue_hours"] == 36
    assert 3500 <= payload["sync_age_seconds"] <= 3700
    assert payload["query_ms"] == 3200
    assert payload["row_count"] == 2
    assert [reason["code"] for reason in payload["reasons"]] == ["acknowledged_gaps"]

    by_season = {season["season"]: season for season in payload["seasons"]}
    assert by_season[19581959]["acknowledged_gaps"] == 23
    assert by_season[19581959]["healthy"] is False
    assert by_season[20252026]["acknowledged_gaps"] == 0
    assert by_season[20252026]["backfill_skipped"] == 19


@pytest.mark.asyncio
async def test_dataset_health_reuses_cached_snapshot(monkeypatch) -> None:
    calls = install_fetch(monkeypatch)

    async with AsyncClient(transport=ASGITransport(app=make_app()), base_url="http://t") as client:
        first = await client.get("/api/v1/observability/dataset")
        second = await client.get("/api/v1/observability/dataset")

    assert first.status_code == second.status_code == 200
    assert len(calls) == 3
    assert first.json()["fetched_at"] == second.json()["fetched_at"]


@pytest.mark.asyncio
async def test_missing_views_or_grants_report_unavailable(monkeypatch) -> None:
    async def fetch_dataframe(_database, query_name, _parameters):
        raise pg_errors.InsufficientPrivilege("permission denied for schema observability")

    monkeypatch.setattr(observability_module, "fetch_dataframe", fetch_dataframe)

    async with AsyncClient(transport=ASGITransport(app=make_app()), base_url="http://t") as client:
        response = await client.get("/api/v1/observability/dataset")

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert "permission denied for schema observability" in detail
    assert "migration 0010" in detail


@pytest.mark.asyncio
async def test_missing_games_are_classified(monkeypatch) -> None:
    install_fetch(
        monkeypatch,
        missing=[
            {
                "game_id": 1959010201,
                "game_date": date(1959, 4, 29),
                "game_type": 18,
                "game_state": "FINAL",
                "home_abbrev": "MTL",
                "away_abbrev": "TOR",
                "backfill_status": "done",
                "backfill_error": None,
                "backfill_updated_at": NOW,
            },
            {
                "game_id": 1959020001,
                "game_date": date(1958, 10, 8),
                "game_type": 2,
                "game_state": "OFF",
                "home_abbrev": "BOS",
                "away_abbrev": "NYR",
                "backfill_status": "failed",
                "backfill_error": "play-by-play 404",
                "backfill_updated_at": NOW,
            },
            {
                "game_id": 1959020002,
                "game_date": date(1958, 10, 9),
                "game_type": 2,
                "game_state": "OFF",
                "home_abbrev": "DET",
                "away_abbrev": "CHI",
                "backfill_status": None,
                "backfill_error": None,
                "backfill_updated_at": None,
            },
        ],
    )

    async with AsyncClient(transport=ASGITransport(app=make_app()), base_url="http://t") as client:
        response = await client.get("/api/v1/observability/seasons/19581959/missing-games")

    assert response.status_code == 200
    payload = response.json()
    assert payload["season"] == 19581959
    assert payload["acknowledged_gaps"] == 1
    assert payload["actionable_gaps"] == 2
    assert [game["gap_kind"] for game in payload["games"]] == [
        "acknowledged",
        "actionable",
        "actionable",
    ]
    assert payload["games"][1]["backfill_error"] == "play-by-play 404"
    assert payload["row_count"] == 3


@pytest.mark.asyncio
async def test_missing_games_rejects_malformed_season(monkeypatch) -> None:
    install_fetch(monkeypatch)

    async with AsyncClient(transport=ASGITransport(app=make_app()), base_url="http://t") as client:
        not_consecutive = await client.get("/api/v1/observability/seasons/20252027/missing-games")
        too_short = await client.get("/api/v1/observability/seasons/2025/missing-games")

    assert not_consecutive.status_code == 422
    assert too_short.status_code == 422
