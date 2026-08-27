import asyncio
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from pucksstudio.db.pool import database
from pucksstudio.queries.execution import fetch_dataframe

router = APIRouter(prefix="/players", tags=["players"])


class PlayerSearchItem(BaseModel):
    player_id: int
    first_name: str
    last_name: str
    position: str | None
    shoots_catches: str | None
    current_team_abbrev: str | None


class PlayerSearchResponse(BaseModel):
    players: list[PlayerSearchItem]
    query_ms: float
    row_count: int


class PlayerProfile(BaseModel):
    player_id: int
    first_name: str
    last_name: str
    position: str | None
    shoots_catches: str | None
    current_team_abbrev: str | None
    birth_date: date | None
    height_cm: int | None
    weight_kg: int | None
    draft_year: int | None
    draft_round: int | None
    draft_pick: int | None
    draft_team_abbrev: str | None
    draft_overall_pick: int | None


class PlayerGame(BaseModel):
    game_id: int
    game_date: date
    game_type: int
    team_abbrev: str | None
    opponent_abbrev: str | None
    team_score: int | None
    opponent_score: int | None
    goals: int | None = None
    assists: int | None = None
    points: int | None = None
    shots: int | None = None
    saves: int | None = None
    goals_against: int | None = None
    shots_against: int | None = None


class PlayerAttempt(BaseModel):
    event_id: int
    game_id: int
    game_date: date
    period: int
    time_in_period: str
    result: Literal["goal", "shot", "goal-against", "save"]
    strength: str | None
    x_coord: int | None
    y_coord: int | None
    shot_type: str | None
    shooting_team_abbrev: str | None


class SkaterSummary(BaseModel):
    games_with_events: int
    goals: int
    assists: int
    points: int
    shots: int
    shooting_percentage: float | None


class GoalieSummary(BaseModel):
    games_with_events: int
    saves: int
    goals_against: int
    shots_against: int
    save_percentage: float | None


class PlayerDetailResponse(BaseModel):
    player: PlayerProfile
    role: Literal["skater", "goalie"]
    season: int
    game_type: int
    seasons: list[int]
    skater_summary: SkaterSummary | None
    goalie_summary: GoalieSummary | None
    games: list[PlayerGame]
    attempts: list[PlayerAttempt]
    query_ms: float
    row_count: int


def _skater_summary(games: list[PlayerGame]) -> SkaterSummary:
    goals = sum(game.goals or 0 for game in games)
    assists = sum(game.assists or 0 for game in games)
    shots = sum(game.shots or 0 for game in games)
    return SkaterSummary(
        games_with_events=len(games),
        goals=goals,
        assists=assists,
        points=goals + assists,
        shots=shots,
        shooting_percentage=round(goals / shots * 100, 1) if shots else None,
    )


def _goalie_summary(games: list[PlayerGame]) -> GoalieSummary:
    saves = sum(game.saves or 0 for game in games)
    goals_against = sum(game.goals_against or 0 for game in games)
    shots_against = saves + goals_against
    return GoalieSummary(
        games_with_events=len(games),
        saves=saves,
        goals_against=goals_against,
        shots_against=shots_against,
        save_percentage=round(saves / shots_against, 3) if shots_against else None,
    )


@router.get("", response_model=PlayerSearchResponse)
async def search_players(
    query: Annotated[str, Query(alias="q", max_length=80)] = "",
    role: Literal["all", "skater", "goalie"] = "all",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> PlayerSearchResponse:
    result = await fetch_dataframe(
        database,
        "player_search",
        {"query": query.strip(), "role": role, "limit": limit},
    )
    return PlayerSearchResponse(
        players=[PlayerSearchItem.model_validate(row) for row in result.frame.to_dicts()],
        query_ms=round(result.elapsed_ms, 2),
        row_count=result.row_count,
    )


@router.get("/{player_id}", response_model=PlayerDetailResponse)
async def player_detail(
    player_id: int,
    season: int | None = None,
    game_type: Annotated[int, Query(ge=1, le=3)] = 2,
) -> PlayerDetailResponse:
    profile_result, seasons_result = await asyncio.gather(
        fetch_dataframe(database, "player_profile", {"player_id": player_id}),
        fetch_dataframe(database, "player_seasons", {}),
    )
    if profile_result.frame.is_empty():
        raise HTTPException(status_code=404, detail="Player not found")

    seasons = [int(value) for value in seasons_result.frame.get_column("season").to_list()]
    if not seasons:
        raise HTTPException(status_code=404, detail="No loaded seasons found")
    selected_season = season if season is not None else seasons[0]
    if selected_season not in seasons:
        raise HTTPException(status_code=404, detail="Season not found")

    player = PlayerProfile.model_validate(profile_result.frame.to_dicts()[0])
    role: Literal["skater", "goalie"] = "goalie" if player.position == "G" else "skater"
    parameters = {
        "player_id": player_id,
        "season": selected_season,
        "game_type": game_type,
    }
    games_result, attempts_result = await asyncio.gather(
        fetch_dataframe(database, f"player_{role}_games", parameters),
        fetch_dataframe(database, f"player_{role}_attempts", parameters),
    )
    games = [PlayerGame.model_validate(row) for row in games_result.frame.to_dicts()]
    attempts = [PlayerAttempt.model_validate(row) for row in attempts_result.frame.to_dicts()]

    return PlayerDetailResponse(
        player=player,
        role=role,
        season=selected_season,
        game_type=game_type,
        seasons=seasons,
        skater_summary=_skater_summary(games) if role == "skater" else None,
        goalie_summary=_goalie_summary(games) if role == "goalie" else None,
        games=games,
        attempts=attempts,
        query_ms=round(
            profile_result.elapsed_ms
            + seasons_result.elapsed_ms
            + games_result.elapsed_ms
            + attempts_result.elapsed_ms,
            2,
        ),
        row_count=len(attempts),
    )
