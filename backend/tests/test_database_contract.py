"""Run Studio against the real PucksData migrations in an empty test database."""

import os
from datetime import date
from pathlib import Path

import psycopg
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from pucksstudio.api.errors import register_schema_errors
from pucksstudio.api.routes import games, health, players
from pucksstudio.config import Settings
from pucksstudio.db.pool import database
from pucksstudio.queries import load_query


@pytest.fixture(scope="module")
def migrated_database():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is unset; use scripts/test-database.sh")
    connection_info = conninfo_to_dict(url)
    if "test" not in connection_info.get("dbname", "").lower():
        pytest.fail("TEST_DATABASE_URL must name a disposable test database")
    migrations = Path(
        os.environ.get(
            "PUCKSDATA_MIGRATIONS", Path(__file__).resolve().parents[3] / "PucksData/migrations"
        )
    )
    if not (migrations / "0018_coverage_observed_single_scan.sql").is_file():
        pytest.fail("Set PUCKSDATA_MIGRATIONS to PucksData's current migrations directory")
    with psycopg.connect(url, autocommit=True) as connection:
        if connection.execute("SELECT to_regclass('public.games')").fetchone()[0]:
            pytest.fail("Refusing to initialize a database that already contains PucksData tables")
        for migration in sorted(migrations.glob("*.sql")):
            connection.execute(migration.read_text())
        connection.execute("""
            INSERT INTO teams VALUES
                (1, 'Test Home', 'Home', 'Test', 'HOM'),
                (2, 'Test Away', 'Away', 'Test', 'AWY');
            INSERT INTO players (player_id, first_name, last_name, position) VALUES
                (1, 'Test', 'Skater', 'C'), (2, 'Test', 'Goalie', 'G');
            INSERT INTO games (game_id, season, game_date, home_team_id, away_team_id,
                               game_type, game_state, home_score, away_score) VALUES
                (1989020001, 19891990, '1989-10-01', 1, 2, 2, 'OFF', 1, 0),
                (2009020001, 20092010, '2009-10-01', 1, 2, 2, 'OFF', 1, 0),
                (2025020001, 20252026, '2025-10-01', 1, 2, 2, 'OFF', 1, 0),
                (2025020002, 20252026, '2025-10-02', 1, 2, 2, 'OFF', 2, 0);
            INSERT INTO events (game_id, event_id_in_game, period, period_type,
                                time_in_period, event_type, event_owner_team_id,
                                strength, strength_source, x_coord, y_coord) VALUES
                (1989020001, 1, 1, 'REG', '01:00', 'goal', 1, NULL, 'unavailable', 70, 5),
                (2009020001, 1, 1, 'REG', '01:00', 'goal', 1, 'pp', 'situation_code', 70, 5),
                (2025020001, 1, 1, 'REG', '01:00', 'goal', 1, 'pp', 'situation_code', 70, 5);
            INSERT INTO goals (event_id, scorer_player_id, goalie_id)
                SELECT id, 1, 2 FROM events;
            INSERT INTO shots (event_id, shooting_player_id, goalie_in_net_id)
                SELECT id, 1, 2 FROM events;
            INSERT INTO analytics.official_skater_seasons
                (player_id, season, game_type, full_name, games_played, goals, shots,
                 shooting_pct) VALUES
                (1, 20252026, 2, 'Test Skater', 2, 3, 10, 0.3),
                (1, 19891990, 2, 'Test Skater', 1, 1, 4, 0.25),
                (1, 19881989, 2, 'Test Skater', 1, 2, 4, 0.5);
            INSERT INTO analytics.official_goalie_seasons
                (player_id, season, game_type, full_name, games_played, wins, shutouts,
                 saves, goals_against, shots_against, save_pct) VALUES
                (2, 20252026, 2, 'Test Goalie', 2, 0, 0, 7, 3, 10, 0.7);
            CREATE ROLE studio_contract_reader LOGIN PASSWORD 'fixture_only';
            GRANT USAGE ON SCHEMA public, analytics, observability TO studio_contract_reader;
            GRANT SELECT ON ALL TABLES IN SCHEMA public, analytics, observability
                TO studio_contract_reader;
        """)
    return make_conninfo(url, user="studio_contract_reader", password="fixture_only")


@pytest.mark.asyncio
async def test_queries_and_api_against_current_migrations(migrated_database):
    await database.open(Settings(DATABASE_URL=migrated_database))
    app = FastAPI()
    register_schema_errors(app)
    app.include_router(health.router, prefix="/api/v1")
    app.include_router(games.router, prefix="/api/v1")
    app.include_router(players.router, prefix="/api/v1")
    try:
        # Execute every canonical query, including views, as the actual reader role.
        parameters = dict(
            player_id=1,
            game_id=2025020001,
            season=20252026,
            game_type=2,
            game_date=date(2025, 10, 1),
            month_start=date(2025, 10, 1),
            team=None,
            query="Test",
            role="all",
            limit=10,
        )
        query_directory = Path(__file__).parents[1] / "pucksstudio/queries/sql"
        async with database.connection() as connection:
            for path in query_directory.glob("*.sql"):
                cursor = await connection.execute(load_query(path.stem), parameters)
                await cursor.fetchall()
            with pytest.raises(psycopg.errors.ReadOnlySqlTransaction):
                await connection.execute("DELETE FROM players")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/v1/ready")).status_code == 200
            modern = await client.get("/api/v1/players/1?season=20252026")
            assert modern.status_code == 200, modern.text
            body = modern.json()
            assert body["skater_summary"]["shooting_percentage"] == 100
            assert body["official"]["shooting_pct"] == 0.3
            assert body["official"]["goals"] == 3
            assert body["skater_summary"]["goals"] == 1
            assert body["attempts"][0]["strength_source"] == "situation_code"
            historical = (await client.get("/api/v1/players/1?season=19891990")).json()
            assert historical["skater_summary"]["shots"] is None
            assert historical["games"][0]["shots"] is None
            assert historical["official"]["shots"] == 4
            assert historical["attempts"][0]["strength"] is None
            official_only = (await client.get("/api/v1/players/1?season=19881989")).json()
            assert official_only["official"]["goals"] == 2
            assert official_only["games"] == []
            preseason = (await client.get("/api/v1/players/1?season=20252026&game_type=1")).json()
            assert preseason["official"] is None
            goalie = (await client.get("/api/v1/players/2?season=20252026")).json()
            assert goalie["goalie_summary"]["save_percentage"] == 0
            assert goalie["official"]["save_pct"] == 0.7
            assert goalie["attempts"][0]["strength"] == "pp"  # Shooting team's perspective.
            old_game = (await client.get("/api/v1/games/1989020001")).json()
            assert old_game["summary"]["home"]["goals"] == 1
            assert old_game["summary"]["home"]["hits"] is None
            assert old_game["summary"]["home"]["shots_on_goal"] is None
            incomplete = (await client.get("/api/v1/games/2009020001")).json()
            assert incomplete["caveats"] and "2009-10" in incomplete["caveats"][0]
            missing = (await client.get("/api/v1/games/2025020002")).json()
            assert missing["summary"]["home"]["goals"] is None
            # Revoking a required grant must surface as an actionable 503.
            with psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as admin:
                admin.execute("REVOKE SELECT ON analytics.coverage FROM studio_contract_reader")
                try:
                    unavailable = await client.get("/api/v1/ready")
                    assert unavailable.status_code == 503
                    assert "0018" in unavailable.json()["detail"]
                    assert (await client.get("/api/v1/players/1")).status_code == 503
                finally:
                    admin.execute("GRANT SELECT ON analytics.coverage TO studio_contract_reader")
    finally:
        await database.close()
