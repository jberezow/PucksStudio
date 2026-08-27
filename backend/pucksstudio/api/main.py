from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pucksstudio.api.routes.games import router as games_router
from pucksstudio.api.routes.health import router as health_router
from pucksstudio.api.routes.players import router as players_router
from pucksstudio.config import get_settings
from pucksstudio.db.pool import database


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    await database.open(settings)
    try:
        yield
    finally:
        await database.close()


app = FastAPI(
    title="PucksStudio API",
    description="Read-only analytical access to a PucksData database.",
    version="0.1.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.include_router(health_router, prefix="/api/v1")
app.include_router(games_router, prefix="/api/v1")
app.include_router(players_router, prefix="/api/v1")
