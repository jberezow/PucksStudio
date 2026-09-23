from datetime import date

import polars as pl
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from pucksstudio.api.routes import lines
from pucksstudio.queries.execution import QueryResult


@pytest.mark.asyncio
async def test_invalid_requests_never_query_database(monkeypatch):
    async def unexpected(*args):
        raise AssertionError("invalid request reached database")

    monkeypatch.setattr(lines, "fetch_dataframe", unexpected)
    app = FastAPI()
    app.include_router(lines.router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for query in (
            "",
            "?season=20242025",
            "?season=20242026&team_id=38",
            "?game_id=1&season=20242025",
            "?game_id=1&date_from=2024-01-01",
            "?season=20242025&team_id=38&date_from=2025-01-01&date_to=2024-01-01",
            "?game_id=1&limit=0",
            "?game_id=1&game_type=1",
        ):
            assert (await client.get("/lines" + query)).status_code == 422


@pytest.mark.asyncio
async def test_game_defaults_to_home_and_exposes_missing_source(monkeypatch):
    async def fetch(db, name, parameters):
        rows = []
        if name == "line_games":
            rows = [
                dict(
                    game_id=2024020001,
                    season=20242025,
                    game_type=2,
                    game_date=date(2024, 10, 1),
                    game_state="OFF",
                    home_team_id=38,
                    away_team_id=39,
                    home_abbrev="VGK",
                    away_abbrev="SEA",
                    home_name="Vegas",
                    away_name="Seattle",
                    fetch_status="unavailable",
                )
            ]
        return QueryResult(name, pl.DataFrame(rows), 1)

    monkeypatch.setattr(lines, "fetch_dataframe", fetch)
    app = FastAPI()
    app.include_router(lines.router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/lines?game_id=2024020001")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["team_id"] == 38
        assert body["status"] == "unavailable"
        assert body["games"][0]["status"] == "unavailable"
        assert (await client.get("/lines?game_id=2024020001&team_id=1")).status_code == 422
