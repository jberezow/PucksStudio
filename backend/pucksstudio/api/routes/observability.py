import asyncio
from dataclasses import dataclass
from datetime import UTC, date, datetime
from time import monotonic
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path
from psycopg import errors as pg_errors
from pydantic import BaseModel

from pucksstudio.config import get_settings
from pucksstudio.db.pool import database
from pucksstudio.hockey.observability import (
    Assessment,
    GapCounts,
    GapKind,
    Severity,
    Verdict,
    assess,
    classify_gap,
    gap_counts_by_season,
)
from pucksstudio.queries.execution import QueryResult, fetch_dataframe

router = APIRouter(prefix="/observability", tags=["observability"])

# The observability schema is created by a PucksData migration and read through a
# separate role. Either can be missing on a given deployment; both are reported as
# an unavailable dataset rather than a server fault.
_UNAVAILABLE_ERRORS = (
    pg_errors.UndefinedTable,
    pg_errors.InvalidSchemaName,
    pg_errors.InsufficientPrivilege,
)


class HealthReasonModel(BaseModel):
    code: str
    severity: Severity
    message: str
    count: int | None = None


class DatasetSummary(BaseModel):
    last_sync_at: datetime | None
    last_sync_games: int | None
    latest_completed_game_date: date | None
    latest_event_game_date: date | None
    completed_games: int
    games_with_events: int
    missing_event_games: int
    goals_missing_shots: int
    backfill_failed: int
    backfill_pending: int
    backfill_skipped: int
    healthy: bool
    acknowledged_gaps: int = 0
    actionable_gaps: int = 0


class SeasonHealth(BaseModel):
    season: int
    completed_games: int
    games_with_events: int
    missing_event_games: int
    event_coverage_pct: float
    goals_missing_shots: int
    backfill_done: int
    backfill_failed: int
    backfill_skipped: int
    backfill_pending: int
    healthy: bool
    acknowledged_gaps: int = 0
    actionable_gaps: int = 0


class DatasetHealthResponse(BaseModel):
    generated_at: datetime
    fetched_at: datetime
    verdict: Verdict
    sync_age_seconds: float | None
    sync_overdue_hours: float
    reasons: list[HealthReasonModel]
    summary: DatasetSummary
    seasons: list[SeasonHealth]
    query_ms: float
    row_count: int


class MissingGame(BaseModel):
    game_id: int
    game_date: date
    game_type: int
    game_state: str | None
    home_abbrev: str
    away_abbrev: str
    backfill_status: str | None
    backfill_error: str | None
    backfill_updated_at: datetime | None
    gap_kind: GapKind


class MissingGamesResponse(BaseModel):
    season: int
    games: list[MissingGame]
    acknowledged_gaps: int
    actionable_gaps: int
    query_ms: float
    row_count: int


@dataclass(frozen=True)
class _HealthSnapshot:
    fetched_at: datetime
    summary: dict[str, Any]
    seasons: list[dict[str, Any]]
    gap_counts: dict[int, GapCounts]
    query_ms: float
    row_count: int


_cache: tuple[float, _HealthSnapshot] | None = None
_cache_lock = asyncio.Lock()


def reset_cache() -> None:
    global _cache
    _cache = None


async def _fetch_snapshot() -> _HealthSnapshot:
    try:
        dataset, seasons, gaps = await asyncio.gather(
            fetch_dataframe(database, "dataset_health", {}),
            fetch_dataframe(database, "season_health", {}),
            fetch_dataframe(database, "season_gap_kinds", {}),
        )
    except _UNAVAILABLE_ERRORS as error:
        raise HTTPException(
            status_code=503,
            detail=(
                "Observability views are unavailable to PucksStudio: "
                f"{error.diag.message_primary or error}. Apply PucksData migration 0010 "
                "and grant USAGE on schema observability plus SELECT on its views to "
                "the read-only role."
            ),
        ) from error

    if dataset.frame.is_empty():
        raise HTTPException(status_code=503, detail="observability.dataset_health returned no row")

    return _HealthSnapshot(
        fetched_at=datetime.now(UTC),
        summary=dataset.frame.to_dicts()[0],
        seasons=seasons.frame.to_dicts(),
        gap_counts=gap_counts_by_season(gaps.frame.to_dicts()),
        query_ms=_total_ms(dataset, seasons, gaps),
        row_count=seasons.row_count,
    )


def _total_ms(*results: QueryResult) -> float:
    return round(sum(result.elapsed_ms for result in results), 2)


async def _snapshot(cache_seconds: float) -> _HealthSnapshot:
    global _cache
    async with _cache_lock:
        if _cache is not None and monotonic() - _cache[0] < cache_seconds:
            return _cache[1]
        snapshot = await _fetch_snapshot()
        _cache = (monotonic(), snapshot)
        return snapshot


def _build_response(snapshot: _HealthSnapshot, assessment: Assessment) -> DatasetHealthResponse:
    settings = get_settings()
    seasons = []
    for row in snapshot.seasons:
        counts = snapshot.gap_counts.get(int(row["season"]), GapCounts())
        seasons.append(
            SeasonHealth.model_validate(
                {
                    **row,
                    "acknowledged_gaps": counts.acknowledged,
                    "actionable_gaps": counts.actionable,
                }
            )
        )
    summary = DatasetSummary.model_validate(
        {
            **snapshot.summary,
            "acknowledged_gaps": sum(season.acknowledged_gaps for season in seasons),
            "actionable_gaps": sum(season.actionable_gaps for season in seasons),
        }
    )
    return DatasetHealthResponse(
        generated_at=datetime.now(UTC),
        fetched_at=snapshot.fetched_at,
        verdict=assessment.verdict,
        sync_age_seconds=assessment.sync_age_seconds,
        sync_overdue_hours=settings.sync_overdue_hours,
        reasons=[
            HealthReasonModel.model_validate(reason, from_attributes=True)
            for reason in assessment.reasons
        ],
        summary=summary,
        seasons=seasons,
        query_ms=snapshot.query_ms,
        row_count=snapshot.row_count,
    )


@router.get("/dataset", response_model=DatasetHealthResponse)
async def dataset_health() -> DatasetHealthResponse:
    settings = get_settings()
    snapshot = await _snapshot(settings.observability_cache_seconds)
    assessment = assess(
        snapshot.summary,
        snapshot.gap_counts,
        now=datetime.now(UTC),
        sync_overdue_hours=settings.sync_overdue_hours,
    )
    return _build_response(snapshot, assessment)


@router.get("/seasons/{season}/missing-games", response_model=MissingGamesResponse)
async def season_missing_games(
    season: Annotated[int, Path(ge=19171918, le=21002101)],
) -> MissingGamesResponse:
    if season % 10000 != season // 10000 + 1:
        raise HTTPException(status_code=422, detail="Season must look like 20252026")

    try:
        result = await fetch_dataframe(database, "season_missing_games", {"season": season})
    except _UNAVAILABLE_ERRORS as error:
        raise HTTPException(
            status_code=503,
            detail=f"Ingestion checkpoints are unavailable to PucksStudio: {error}",
        ) from error

    games = [
        MissingGame.model_validate({**row, "gap_kind": classify_gap(row["backfill_status"])})
        for row in result.frame.to_dicts()
    ]
    return MissingGamesResponse(
        season=season,
        games=games,
        acknowledged_gaps=sum(game.gap_kind == "acknowledged" for game in games),
        actionable_gaps=sum(game.gap_kind == "actionable" for game in games),
        query_ms=round(result.elapsed_ms, 2),
        row_count=result.row_count,
    )
