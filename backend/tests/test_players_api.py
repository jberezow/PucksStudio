from datetime import date

import polars as pl
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from pucksstudio.api.routes import players as players_module
from pucksstudio.queries.execution import QueryResult


def result(name: str, rows: list[dict], elapsed_ms: float = 1.25) -> QueryResult:
    return QueryResult(
        name=name, frame=pl.DataFrame(rows, infer_schema_length=None), elapsed_ms=elapsed_ms
    )


def player_row(position: str = "C") -> dict:
    return {
        "player_id": 8471675,
        "first_name": "Sidney",
        "last_name": "Crosby",
        "position": position,
        "shoots_catches": "L",
        "current_team_abbrev": "PIT",
        "birth_date": date(1987, 8, 7),
        "height_cm": 180,
        "weight_kg": 91,
        "draft_year": 2005,
        "draft_round": 1,
        "draft_pick": 1,
        "draft_team_abbrev": "PIT",
        "draft_overall_pick": 1,
    }


def test_incomplete_attempt_types_suppress_shooting_percentage() -> None:
    game = players_module.PlayerGame(
        game_id=1,
        game_date=date(1989, 1, 1),
        game_type=2,
        team_abbrev="LAK",
        opponent_abbrev="EDM",
        team_score=5,
        opponent_score=3,
        goals=2,
        assists=1,
        points=3,
        shots=2,
    )

    assert players_module._skater_summary([game], shots_available=False).shooting_percentage is None


@pytest.mark.asyncio
async def test_player_search_normalizes_parameters(monkeypatch) -> None:
    captured = {}

    async def fetch_dataframe(_database, query_name, parameters):
        captured.update(parameters)
        row = player_row()
        return result(
            query_name,
            [
                {
                    key: row[key]
                    for key in (
                        "player_id",
                        "first_name",
                        "last_name",
                        "position",
                        "shoots_catches",
                        "current_team_abbrev",
                    )
                }
            ],
        )

    monkeypatch.setattr(players_module, "fetch_dataframe", fetch_dataframe)
    app = FastAPI()
    app.include_router(players_module.router, prefix="/api/v1")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/players?q=%20Crosby%20&role=skater&limit=10")

    assert response.status_code == 200
    assert captured == {"query": "Crosby", "role": "skater", "limit": 10}
    assert response.json()["players"][0]["player_id"] == 8471675


@pytest.mark.asyncio
async def test_skater_profile_derives_totals_and_preserves_attempts(monkeypatch) -> None:
    season_parameters = None

    async def fetch_dataframe(_database, query_name, parameters):
        nonlocal season_parameters
        if query_name == "dataset_coverage":
            return result(query_name, coverage_rows())
        if query_name.endswith("_official"):
            return result(query_name, [])
        if query_name == "player_profile":
            return result(query_name, [player_row()])
        if query_name == "player_seasons":
            season_parameters = parameters
            return result(query_name, [{"season": 20252026}, {"season": 20242025}])
        if query_name == "player_skater_games":
            return result(
                query_name,
                [
                    {
                        "game_id": 2025020001,
                        "game_date": date(2026, 1, 10),
                        "game_type": 2,
                        "team_abbrev": "PIT",
                        "opponent_abbrev": "BOS",
                        "team_score": 3,
                        "opponent_score": 2,
                        "goals": 1,
                        "assists": 2,
                        "points": 3,
                        "shots": 5,
                    }
                ],
            )
        return result(
            query_name,
            [
                {
                    "event_id": 99,
                    "game_id": 2025020001,
                    "game_date": date(2026, 1, 10),
                    "period": 1,
                    "time_in_period": "04:12",
                    "result": "goal",
                    "strength": "ev",
                    "strength_source": "situation_code",
                    "x_coord": 78,
                    "y_coord": 4,
                    "shot_type": "wrist",
                    "shooting_team_abbrev": "PIT",
                }
            ],
        )

    monkeypatch.setattr(players_module, "fetch_dataframe", fetch_dataframe)
    app = FastAPI()
    app.include_router(players_module.router, prefix="/api/v1")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/players/8471675?season=20252026")

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "skater"
    assert body["skater_summary"] == {
        "games_with_events": 1,
        "goals": 1,
        "assists": 2,
        "points": 3,
        "shots": 5,
        "shooting_percentage": 20.0,
    }
    assert body["attempts"][0]["x_coord"] == 78
    assert season_parameters == {"player_id": 8471675}


@pytest.mark.asyncio
async def test_goalie_profile_derives_save_percentage(monkeypatch) -> None:
    async def fetch_dataframe(_database, query_name, _parameters):
        if query_name == "dataset_coverage":
            return result(query_name, coverage_rows())
        if query_name.endswith("_official"):
            return result(query_name, [])
        if query_name == "player_profile":
            return result(query_name, [player_row(position="G")])
        if query_name == "player_seasons":
            return result(query_name, [{"season": 20252026}])
        if query_name == "player_goalie_games":
            return result(
                query_name,
                [
                    {
                        "game_id": 2025020001,
                        "game_date": date(2026, 1, 10),
                        "game_type": 2,
                        "team_abbrev": "PIT",
                        "opponent_abbrev": "BOS",
                        "team_score": 3,
                        "opponent_score": 2,
                        "saves": 18,
                        "goals_against": 2,
                        "shots_against": 20,
                    }
                ],
            )
        return result(query_name, [])

    monkeypatch.setattr(players_module, "fetch_dataframe", fetch_dataframe)
    app = FastAPI()
    app.include_router(players_module.router, prefix="/api/v1")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/players/8471675?season=20252026")

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "goalie"
    assert body["goalie_summary"] == {
        "games_with_events": 1,
        "saves": 18,
        "goals_against": 2,
        "shots_against": 20,
        "save_percentage": 0.9,
    }
    assert body["skater_summary"] is None


def coverage_rows():
    return [
        {"subject": subject, "kind": "measure", "first_season": first, "note": "Coverage"}
        for subject, first in [
            ("goal", 19171918),
            ("shots", 19971998),
            ("hit", 20092010),
            ("penalty", 19171918),
            ("faceoff", 20092010),
        ]
    ]
