"""Observed five-on-five units from PucksData's raw shift contract."""

from datetime import date, datetime
from time import perf_counter
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from pucksstudio.api.routes.games import TeamOption
from pucksstudio.db.pool import database
from pucksstudio.hockey.lines import FIRST_SHIFT_SEASON, summarize_lines
from pucksstudio.queries.execution import fetch_dataframe

router = APIRouter(prefix="/lines", tags=["lines"])


class LinePlayer(BaseModel):
    player_id: int
    name: str
    role: Literal["forward", "defense", "goalie", "unknown"]
    headshot_url: str | None


class LineAppearance(BaseModel):
    game_id: int
    game_date: date
    seconds: int


class LineInterval(BaseModel):
    game_id: int
    game_date: date
    period: int
    start: int
    end: int


class LineUnit(BaseModel):
    kind: Literal["forward", "defense"]
    players: list[LinePlayer]
    seconds: int
    share: float | None
    appearances: int
    seconds_per_appearance: float
    deployments: int
    games: list[LineAppearance]
    evidence: list[LineInterval]
    evidence_truncated: bool


class LineGameCoverage(BaseModel):
    game_id: int
    game_date: date
    home_abbrev: str
    away_abbrev: str
    status: str
    fetch_status: str | None
    attempted_at: datetime | None
    snapshot_at: datetime | None
    raw_rows: int
    five_on_five_seconds: int
    classified_seconds: int
    unclassified_seconds: int
    other_strength_seconds: int
    issues: dict[str, int]


class LineResponse(BaseModel):
    method: str
    status: str
    team_id: int
    teams: list[TeamOption]
    season: int
    game_id: int | None
    game_type: int
    expected_games: int
    loaded_games: int
    usable_games: int
    five_on_five_seconds: int
    classified_seconds: int
    unclassified_seconds: int
    forward_trios: list[LineUnit]
    defense_pairs: list[LineUnit]
    total_forward_trios: int
    total_defense_pairs: int
    games: list[LineGameCoverage]
    query_ms: float
    analysis_ms: float
    row_count: int


class LineOptions(BaseModel):
    teams: list[TeamOption]
    seasons: list[int]
    first_supported_season: int = FIRST_SHIFT_SEASON


@router.get("/options", response_model=LineOptions)
async def line_options() -> LineOptions:
    teams = await fetch_dataframe(database, "game_teams", {})
    seasons = await fetch_dataframe(database, "line_seasons", {})
    return LineOptions(
        teams=[
            TeamOption(team_id=t["team_id"], abbreviation=t["abbrev"], name=t["full_name"])
            for t in teams.frame.to_dicts()
        ],
        seasons=[s["season"] for s in seasons.frame.to_dicts()],
    )


@router.get("", response_model=LineResponse)
async def line_combinations(
    game_id: Annotated[int | None, Query(gt=0)] = None,
    season: Annotated[int | None, Query(ge=19001901, le=99989999)] = None,
    team_id: Annotated[int | None, Query(gt=0)] = None,
    game_type: Literal[2, 3] = 2,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
) -> LineResponse:
    if (game_id is None) == (season is None):
        raise HTTPException(422, "Provide exactly one of game_id or season")
    if season is not None and (season % 10000 != season // 10000 + 1):
        raise HTTPException(422, "Season must contain consecutive years, for example 20242025")
    if season is not None and team_id is None:
        raise HTTPException(422, "Select a team for a season")
    if game_id is not None and (date_from is not None or date_to is not None):
        raise HTTPException(422, "Date windows apply to season requests only")
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "date_from must not be later than date_to")
    params = dict(
        game_id=game_id,
        season=season,
        team_id=team_id,
        game_type=game_type,
        date_from=date_from,
        date_to=date_to,
    )
    scope = await fetch_dataframe(database, "line_games", params)
    games = scope.frame.to_dicts()
    if game_id and not games:
        raise HTTPException(404, "Game not found")
    teams = {}
    for game in games:
        for side in ("home", "away"):
            tid = game[f"{side}_team_id"]
            teams[tid] = TeamOption(
                team_id=tid, abbreviation=game[f"{side}_abbrev"], name=game[f"{side}_name"]
            )
    if game_id:
        team_id = team_id or games[0]["home_team_id"]
        if team_id not in teams:
            raise HTTPException(422, "Selected team did not play in this game")
        season = games[0]["season"]
        game_type = games[0]["game_type"]
    assert team_id is not None and season is not None
    # Unsupported eras need no raw-shift scan, but still return scope/coverage.
    rows = []
    query_ms = scope.elapsed_ms
    if season >= FIRST_SHIFT_SEASON and game_type in (2, 3):
        shifts = await fetch_dataframe(database, "line_shifts", params)
        rows = shifts.frame.to_dicts()
        query_ms += shifts.elapsed_ms
    started = perf_counter()
    summary = await run_in_threadpool(summarize_lines, games, rows, team_id, limit)
    if season < FIRST_SHIFT_SEASON:
        summary["status"] = "unsupported"
    return LineResponse(
        **summary,
        teams=list(teams.values()),
        season=season,
        game_id=game_id,
        game_type=game_type,
        query_ms=round(query_ms, 2),
        row_count=len(rows),
        analysis_ms=round((perf_counter() - started) * 1000, 2),
    )
