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
from pucksstudio.api.routes import games, health, lines, players
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
    if not (migrations / "0034_ingestion_history.sql").is_file():
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
                                strength, strength_source, x_coord, y_coord,
                                season, game_type, game_date) VALUES
                (1989020001, 1, 1, 'REG', '01:00', 'goal', 1, NULL, 'unavailable',
                 70, 5, 19891990, 2, '1989-10-01'),
                (2009020001, 1, 1, 'REG', '01:00', 'goal', 1, 'pp', 'situation_code',
                 70, 5, 20092010, 2, '2009-10-01'),
                (2025020001, 1, 1, 'REG', '01:00', 'goal', 1, 'pp', 'situation_code',
                 70, 5, 20252026, 2, '2025-10-01');
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
    app.include_router(lines.router, prefix="/api/v1")
    try:
        # Execute every canonical query, including views, as the actual reader role.
        parameters = dict(
            player_id=1,
            game_id=2025020001,
            season=20252026,
            game_type=2,
            game_date=date(2025, 10, 1),
            team_id=1,
            date_from=None,
            date_to=None,
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
                    assert "0034" in unavailable.json()["detail"]
                    assert (await client.get("/api/v1/players/1")).status_code == 503
                finally:
                    admin.execute("GRANT SELECT ON analytics.coverage TO studio_contract_reader")
    finally:
        await database.close()


@pytest.mark.asyncio
async def test_line_contract_resolves_nhl_ids_and_preserves_snapshot_status(migrated_database):
    with psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as admin:
        admin.execute("""
            INSERT INTO teams VALUES
                (38, 'Vegas Golden Knights', 'Golden Knights', 'Vegas', 'VGK'),
                (39, 'Seattle Kraken', 'Kraken', 'Seattle', 'SEA');
            INSERT INTO games (game_id, season, game_date, home_team_id, away_team_id,
                               game_type, game_state)
                VALUES (2024020001, 20242025, '2024-10-01', 38, 39, 2, 'OFF');
            INSERT INTO shift_fetch_status (game_id, status) VALUES (2024020001, 'unavailable');
        """)
        for index in range(12):
            player_id = 1000 + index
            position = "C" if index % 6 < 3 else "D" if index % 6 < 5 else "G"
            admin.execute(
                "INSERT INTO players (player_id, first_name, last_name, position, headshot_url) "
                "VALUES (%s, 'Line', %s, %s, 'https://assets.nhle.com/test.png')",
                (player_id, str(index), position),
            )
            for period in (1, 2, 3):
                admin.execute(
                    "INSERT INTO shifts (game_id, source_shift_id, type_code, player_id, "
                    "team_id, period, start_time_seconds, end_time_seconds) "
                    "VALUES (2024020001, %s, 517, %s, %s, %s, 0, 1200)",
                    (period * 100 + index, player_id, 54 if index < 6 else 55, period),
                )
        # Per-game position must take precedence over present-day metadata.
        admin.execute("UPDATE players SET position = 'G' WHERE player_id = 1000")
        admin.execute("""
            INSERT INTO analytics.official_skater_games
                (game_id, player_id, season, game_type, full_name, position_code)
            VALUES (2024020001, 1000, 20242025, 2, 'Line 0', 'C');
        """)
    await database.open(Settings(DATABASE_URL=migrated_database))
    app = FastAPI()
    register_schema_errors(app)
    app.include_router(lines.router, prefix="/api/v1")
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/lines?game_id=2024020001&team_id=38")
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["status"] == "available"
            assert body["five_on_five_seconds"] == 3600
            assert body["games"][0]["fetch_status"] == "unavailable"
            assert body["forward_trios"][0]["players"][0]["player_id"] == 1000
            assert body["forward_trios"][0]["players"][0]["headshot_url"]
            assert body["forward_trios"][0]["deployments"] == 3
            seasonal = await client.get(
                "/api/v1/lines?season=20242025&team_id=38&date_from=2024-10-01&date_to=2024-10-01"
            )
            assert seasonal.status_code == 200, seasonal.text
            assert seasonal.json()["forward_trios"] == body["forward_trios"]
            old = await client.get("/api/v1/lines?season=19891990&team_id=1")
            assert old.json()["status"] == "unsupported"
            with psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as admin:
                admin.execute(
                    "DELETE FROM shifts WHERE game_id = 2024020001 AND player_id = 1011 "
                    "AND period = 1"
                )
            partial = (await client.get("/api/v1/lines?game_id=2024020001")).json()
            assert partial["status"] == "partial"
            assert partial["five_on_five_seconds"] == 2400
    finally:
        await database.close()


@pytest.mark.asyncio
async def test_health_reads_latest_ingestion_outcomes_with_view_only_grants(migrated_database):
    with psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as admin:
        admin.execute("""
            INSERT INTO ingestion.attempts (dataset, entity_key, outcome, started_at, finished_at)
            VALUES
                ('events', 'recovered', 'failed', NOW() - INTERVAL '3 hours', NOW()),
                ('events', 'recovered', 'complete', NOW(), NOW()),
                ('official_games', 'failed', 'failed', NOW(), NOW()),
                ('sync', 'partial', 'partial', NOW(), NOW()),
                ('derived', 'stalled', 'running', NOW() - INTERVAL '3 hours', NULL),
                ('events', 'active', 'running', NOW(), NULL),
                ('shifts', 'missing', 'unavailable', NOW(), NOW());
        """)
    await database.open(Settings(DATABASE_URL=migrated_database))
    try:
        async with database.connection() as connection:
            cursor = await connection.execute(load_query("dataset_health"))
            row = await cursor.fetchone()
            assert row["ingestion_failed"] == 1
            assert row["ingestion_partial"] == 1
            assert row["ingestion_stalled"] == 1
            assert row["healthy"] is False
        with psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as admin:
            admin.execute("""
                INSERT INTO ingestion.attempts (dataset, entity_key, outcome, finished_at)
                VALUES ('official_games', 'failed', 'complete', NOW()),
                       ('sync', 'partial', 'complete', NOW()),
                       ('derived', 'stalled', 'complete', NOW());
            """)
        async with database.connection() as connection:
            row = await (await connection.execute(load_query("dataset_health"))).fetchone()
            assert (
                row["ingestion_failed"] == row["ingestion_partial"] == row["ingestion_stalled"] == 0
            )
        app = FastAPI()
        register_schema_errors(app)
        app.include_router(health.router, prefix="/api/v1")
        with psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as admin:
            admin.execute(
                "REVOKE SELECT ON observability.ingestion_freshness FROM studio_contract_reader"
            )
            try:
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as client:
                    response = await client.get("/api/v1/ready")
                    assert response.status_code == 503
                    assert "0034" in response.json()["detail"]
            finally:
                admin.execute(
                    "GRANT SELECT ON observability.ingestion_freshness TO studio_contract_reader"
                )
    finally:
        await database.close()
