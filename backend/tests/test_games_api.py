from datetime import date

import polars as pl
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from pucksstudio.api.routes import games as games_module
from pucksstudio.queries.execution import QueryResult


def result(name: str, rows: list[dict], elapsed_ms: float = 1.25) -> QueryResult:
    return QueryResult(
        name=name, frame=pl.DataFrame(rows, infer_schema_length=None), elapsed_ms=elapsed_ms
    )


@pytest.mark.asyncio
async def test_games_route_includes_loaded_date_navigation(monkeypatch) -> None:
    async def fetch_dataframe(_database, query_name, _parameters):
        if query_name == "games_by_date":
            return result(
                query_name,
                [
                    {
                        "game_id": 2025020001,
                        "game_date": date(2026, 1, 10),
                        "start_time_utc": None,
                        "game_type": 2,
                        "game_state": "OFF",
                        "venue": "Arena",
                        "home_abbrev": "BOS",
                        "home_name": "Boston Bruins",
                        "home_score": 2,
                        "away_abbrev": "PIT",
                        "away_name": "Pittsburgh Penguins",
                        "away_score": 3,
                        "event_count": 300,
                    }
                ],
            )
        return result(
            query_name,
            [{"previous_date": date(2026, 1, 8), "next_date": date(2026, 1, 12)}],
        )

    monkeypatch.setattr(games_module, "fetch_dataframe", fetch_dataframe)
    app = FastAPI()
    app.include_router(games_module.router, prefix="/api/v1")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/games?date=2026-01-10")

    assert response.status_code == 200
    assert response.json()["previous_date"] == "2026-01-08"
    assert response.json()["next_date"] == "2026-01-12"
    assert response.json()["games"][0]["game_id"] == 2025020001


@pytest.mark.asyncio
async def test_calendar_route_returns_team_filtered_game_days(monkeypatch) -> None:
    captured_parameters = {}

    async def fetch_dataframe(_database, query_name, parameters):
        captured_parameters.update(parameters)
        return result(
            query_name,
            [
                {
                    "game_date": date(2026, 5, 16),
                    "game_count": 1,
                    "played_count": 0,
                }
            ],
        )

    monkeypatch.setattr(games_module, "fetch_dataframe", fetch_dataframe)
    app = FastAPI()
    app.include_router(games_module.router, prefix="/api/v1")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/games/calendar?month=2026-05-20&team=car")

    assert response.status_code == 200
    assert captured_parameters == {"month_start": date(2026, 5, 1), "team": "CAR"}
    assert response.json()["days"] == [
        {"game_date": "2026-05-16", "game_count": 1, "played_count": 0}
    ]


@pytest.mark.asyncio
async def test_teams_route_returns_frontend_options(monkeypatch) -> None:
    async def fetch_dataframe(_database, query_name, _parameters):
        return result(
            query_name,
            [{"team_id": 12, "abbrev": "CAR", "full_name": "Carolina Hurricanes"}],
        )

    monkeypatch.setattr(games_module, "fetch_dataframe", fetch_dataframe)
    app = FastAPI()
    app.include_router(games_module.router, prefix="/api/v1")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/games/teams")

    assert response.status_code == 200
    assert response.json() == [
        {"team_id": 12, "abbreviation": "CAR", "name": "Carolina Hurricanes"}
    ]


@pytest.mark.asyncio
async def test_game_detail_route_returns_summary_and_provenance(monkeypatch) -> None:
    async def fetch_dataframe(_database, query_name, _parameters):
        if query_name == "game_summary":
            return result(
                query_name,
                [
                    {
                        "game_id": 2025020001,
                        "season": 20252026,
                        "game_date": date(2026, 1, 10),
                        "start_time_utc": None,
                        "game_type": 2,
                        "game_state": "OFF",
                        "venue": "Arena",
                        "venue_location": "Boston",
                        "home_team_id": 6,
                        "home_abbrev": "BOS",
                        "home_name": "Boston Bruins",
                        "home_score": 0,
                        "away_team_id": 5,
                        "away_abbrev": "PIT",
                        "away_name": "Pittsburgh Penguins",
                        "away_score": 1,
                    }
                ],
            )
        return result(query_name, [_goal_event()])

    monkeypatch.setattr(games_module, "fetch_dataframe", fetch_dataframe)
    app = FastAPI()
    app.include_router(games_module.router, prefix="/api/v1")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/games/2025020001")

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["away"]["goals"] == 1
    assert body["summary"]["away"]["shots_on_goal"] == 1
    assert body["events"][0]["event_id"] == 99
    assert body["events"][0]["x_coord"] == 78
    assert body["events"][0]["y_coord"] == 4
    assert body["events"][0]["description"].startswith("Goal: Sidney Crosby")


@pytest.mark.asyncio
async def test_eventless_playoff_game_returns_empty_detail(monkeypatch) -> None:
    async def fetch_dataframe(_database, query_name, _parameters):
        if query_name == "game_summary":
            return result(
                query_name,
                [
                    {
                        "game_id": 2025030227,
                        "season": 20252026,
                        "game_date": date(2026, 5, 16),
                        "start_time_utc": None,
                        "game_type": 3,
                        "game_state": None,
                        "venue": None,
                        "venue_location": None,
                        "home_team_id": 12,
                        "home_abbrev": "CAR",
                        "home_name": "Carolina Hurricanes",
                        "home_score": 0,
                        "away_team_id": 4,
                        "away_abbrev": "PHI",
                        "away_name": "Philadelphia Flyers",
                        "away_score": 0,
                    }
                ],
            )
        return result(query_name, [])

    monkeypatch.setattr(games_module, "fetch_dataframe", fetch_dataframe)
    app = FastAPI()
    app.include_router(games_module.router, prefix="/api/v1")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/games/2025030227")

    assert response.status_code == 200
    body = response.json()
    assert body["game"]["playoff"] == {"round": 2, "series": 2, "game": 7}
    assert body["events"] == []
    assert body["row_count"] == 0


def _goal_event() -> dict:
    return {
        "event_id": 99,
        "event_id_in_game": 501,
        "period": 1,
        "period_type": "REG",
        "time_in_period": "04:12",
        "event_type": "goal",
        "strength": "ev",
        "zone_code": "O",
        "x_coord": 78,
        "y_coord": 4,
        "owner_abbrev": "PIT",
        "goal_shot_type": "wrist",
        "scorer_id": 8471675,
        "scorer_name": "Sidney Crosby",
        "assist1_id": 8471724,
        "assist1_name": "Kris Letang",
        "assist2_id": None,
        "assist2_name": None,
        "shooter_id": 8471675,
        "shooter_name": "Sidney Crosby",
        "shot_type": "wrist",
        "hitter_name": None,
        "hittee_name": None,
        "blocker_name": None,
        "blocked_shooter_name": None,
        "penalized_name": None,
        "infraction_type": None,
        "duration_minutes": None,
        "faceoff_winner_name": None,
        "faceoff_loser_name": None,
    }
