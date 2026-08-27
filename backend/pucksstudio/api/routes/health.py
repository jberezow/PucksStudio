from fastapi import APIRouter

from pucksstudio.db.pool import database

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready() -> dict[str, str]:
    await database.ping()
    return {"status": "ready"}
