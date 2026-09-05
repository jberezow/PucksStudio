from fastapi import APIRouter

from pucksstudio.db.pool import database
from pucksstudio.queries import load_query

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready() -> dict[str, str]:
    parameters = {"game_id": 0, "player_id": 0, "season": 0, "game_type": 2}
    async with database.connection() as connection:
        for name in (
            "dataset_coverage",
            "game_event_sequence",
            "player_skater_official",
            "player_goalie_official",
            "dataset_health",
            "season_health",
        ):
            query = load_query(name).strip().rstrip(";")
            await connection.execute(f"SELECT * FROM ({query}) AS contract LIMIT 0", parameters)
    return {"status": "ready"}
