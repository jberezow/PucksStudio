from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from pucksstudio.db.pool import database
from pucksstudio.hockey.coverage import CoverageEntry, is_available, season_caveats
from pucksstudio.hockey.games import parse_playoff_context, present_events, summarize_game
from pucksstudio.queries.execution import fetch_dataframe

router = APIRouter(prefix="/games", tags=["games"])


class PlayoffContext(BaseModel):
    round: int
    series: int
    game: int


class GameListItem(BaseModel):
    game_id: int
    game_date: date
    start_time_utc: datetime | None
    game_type: int
    game_state: str | None
    venue: str | None
    home_abbrev: str
    home_name: str
    home_score: int | None
    away_abbrev: str
    away_name: str
    away_score: int | None
    event_count: int
    playoff: PlayoffContext | None = None


class GameListResponse(BaseModel):
    date: date | None
    previous_date: date | None
    next_date: date | None
    games: list[GameListItem]
    query_ms: float
    row_count: int


class CalendarDay(BaseModel):
    game_date: date
    game_count: int
    played_count: int


class CalendarResponse(BaseModel):
    month: date
    team: str | None
    days: list[CalendarDay]
    query_ms: float


class TeamOption(BaseModel):
    team_id: int
    abbreviation: str
    name: str


class GameSummary(BaseModel):
    game_id: int
    season: int
    game_date: date
    start_time_utc: datetime | None
    game_type: int
    game_state: str | None
    venue: str | None
    venue_location: str | None
    home_team_id: int
    home_abbrev: str
    home_name: str
    home_score: int | None
    away_team_id: int
    away_abbrev: str
    away_name: str
    away_score: int | None
    playoff: PlayoffContext | None = None


class GameEvent(BaseModel):
    event_id: int
    event_id_in_game: int
    period: int
    period_type: str
    time_in_period: str
    event_type: str
    strength: str | None
    strength_source: str
    zone_code: str | None
    x_coord: int | None
    y_coord: int | None
    owner_abbrev: str | None
    description: str
    goal_shot_type: str | None
    scorer_id: int | None
    scorer_name: str | None
    assist1_id: int | None
    assist1_name: str | None
    assist2_id: int | None
    assist2_name: str | None
    shooter_id: int | None
    shooter_name: str | None
    shot_type: str | None
    hitter_name: str | None
    hittee_name: str | None
    blocker_name: str | None
    blocked_shooter_name: str | None
    penalized_name: str | None
    infraction_type: str | None
    duration_minutes: int | None
    faceoff_winner_name: str | None
    faceoff_loser_name: str | None


class TeamGameStats(BaseModel):
    abbreviation: str
    goals: int | None
    shots_on_goal: int | None
    hits: int | None
    penalty_minutes: int | None
    faceoff_wins: int | None


class PeriodScore(BaseModel):
    period: int
    period_type: str
    away_goals: int
    home_goals: int


class GameAnalytics(BaseModel):
    away: TeamGameStats
    home: TeamGameStats
    periods: list[PeriodScore]


class GameDetailResponse(BaseModel):
    game: GameSummary
    coverage: list[CoverageEntry]
    caveats: list[str]
    summary: GameAnalytics
    events: list[GameEvent]
    query_ms: float
    row_count: int


@router.get("", response_model=GameListResponse)
async def games_by_date(
    game_date: Annotated[date | None, Query(alias="date")] = None,
    team: Annotated[str | None, Query(min_length=2, max_length=3, pattern=r"^[A-Za-z]+$")] = None,
) -> GameListResponse:
    team = team.upper() if team else None
    parameters = {"game_date": game_date, "team": team}
    result = await fetch_dataframe(database, "games_by_date", parameters)
    games = []
    for row in result.frame.to_dicts():
        game = GameListItem.model_validate(row)
        context = parse_playoff_context(game.game_id, game.game_type)
        games.append(
            game.model_copy(
                update={
                    "playoff": (
                        PlayoffContext.model_validate(context, from_attributes=True)
                        if context
                        else None
                    )
                }
            )
        )
    selected_date = games[0].game_date if games else game_date
    previous_date = None
    next_date = None
    navigation_ms = 0.0
    if selected_date is not None:
        navigation = await fetch_dataframe(
            database, "game_dates_around", {"game_date": selected_date, "team": team}
        )
        navigation_ms = navigation.elapsed_ms
        if not navigation.frame.is_empty():
            date_row = navigation.frame.to_dicts()[0]
            previous_date = date_row["previous_date"]
            next_date = date_row["next_date"]
    return GameListResponse(
        date=selected_date,
        previous_date=previous_date,
        next_date=next_date,
        games=games,
        query_ms=round(result.elapsed_ms + navigation_ms, 2),
        row_count=result.row_count,
    )


@router.get("/calendar", response_model=CalendarResponse)
async def game_calendar(
    month: date,
    team: Annotated[str | None, Query(min_length=2, max_length=3, pattern=r"^[A-Za-z]+$")] = None,
) -> CalendarResponse:
    month_start = month.replace(day=1)
    team = team.upper() if team else None
    result = await fetch_dataframe(
        database,
        "game_calendar",
        {"month_start": month_start, "team": team},
    )
    return CalendarResponse(
        month=month_start,
        team=team,
        days=[CalendarDay.model_validate(row) for row in result.frame.to_dicts()],
        query_ms=round(result.elapsed_ms, 2),
    )


@router.get("/teams", response_model=list[TeamOption])
async def game_teams() -> list[TeamOption]:
    result = await fetch_dataframe(database, "game_teams", {})
    return [
        TeamOption(team_id=row["team_id"], abbreviation=row["abbrev"], name=row["full_name"])
        for row in result.frame.to_dicts()
    ]


@router.get("/{game_id}", response_model=GameDetailResponse)
async def game_detail(game_id: int) -> GameDetailResponse:
    summary = await fetch_dataframe(database, "game_summary", {"game_id": game_id})
    if summary.frame.is_empty():
        raise HTTPException(status_code=404, detail="Game not found")

    game = GameSummary.model_validate(summary.frame.to_dicts()[0])
    context = parse_playoff_context(game.game_id, game.game_type)
    if context:
        game = game.model_copy(
            update={"playoff": PlayoffContext.model_validate(context, from_attributes=True)}
        )
    events = await fetch_dataframe(database, "game_event_sequence", {"game_id": game_id})
    presented = present_events(events.frame)
    analytics = summarize_game(events.frame, game.away_abbrev, game.home_abbrev)
    coverage_result = await fetch_dataframe(database, "dataset_coverage", {})
    coverage = [CoverageEntry.model_validate(row) for row in coverage_result.frame.to_dicts()]
    summary_model = GameAnalytics.model_validate(analytics, from_attributes=True)
    for team in (summary_model.away, summary_model.home):
        for field, subject in {
            "goals": "goal",
            "shots_on_goal": "shots",
            "hits": "hit",
            "penalty_minutes": "penalty",
            "faceoff_wins": "faceoff",
        }.items():
            if events.frame.is_empty() or not is_available(coverage, subject, game.season):
                setattr(team, field, None)
    return GameDetailResponse(
        game=game,
        summary=summary_model,
        coverage=coverage,
        caveats=season_caveats(coverage, game.season),
        events=[GameEvent.model_validate(row) for row in presented.to_dicts()],
        query_ms=round(summary.elapsed_ms + events.elapsed_ms + coverage_result.elapsed_ms, 2),
        row_count=events.row_count,
    )
