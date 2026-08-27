from dataclasses import dataclass

import polars as pl


@dataclass(frozen=True)
class TeamGameStats:
    abbreviation: str
    goals: int
    shots_on_goal: int
    hits: int
    penalty_minutes: int
    faceoff_wins: int


@dataclass(frozen=True)
class PeriodScore:
    period: int
    period_type: str
    away_goals: int
    home_goals: int


@dataclass(frozen=True)
class GameAnalytics:
    away: TeamGameStats
    home: TeamGameStats
    periods: list[PeriodScore]


def _count(frame: pl.DataFrame, expression: pl.Expr) -> int:
    return int(frame.select(expression.sum()).item() or 0)


def _team_stats(events: pl.DataFrame, abbreviation: str) -> TeamGameStats:
    owned = pl.col("owner_abbrev") == abbreviation
    event_type = pl.col("event_type")
    return TeamGameStats(
        abbreviation=abbreviation,
        goals=_count(events, owned & (event_type == "goal")),
        shots_on_goal=_count(events, owned & event_type.is_in(["goal", "shot-on-goal"])),
        hits=_count(events, owned & (event_type == "hit")),
        penalty_minutes=int(
            events.select(
                pl.when(owned & (event_type == "penalty"))
                .then(pl.col("duration_minutes").fill_null(0))
                .otherwise(0)
                .sum()
            ).item()
            or 0
        ),
        faceoff_wins=_count(events, owned & (event_type == "faceoff")),
    )


def summarize_game(events: pl.DataFrame, away_abbrev: str, home_abbrev: str) -> GameAnalytics:
    """Derive compact game totals while preserving the event frame for drill-down."""

    if events.is_empty():
        return GameAnalytics(
            away=TeamGameStats(away_abbrev, 0, 0, 0, 0, 0),
            home=TeamGameStats(home_abbrev, 0, 0, 0, 0, 0),
            periods=[],
        )

    period_rows = (
        events.select("period", "period_type").unique().sort("period").iter_rows(named=True)
    )
    periods = []
    for row in period_rows:
        in_period = pl.col("period") == row["period"]
        is_goal = pl.col("event_type") == "goal"
        periods.append(
            PeriodScore(
                period=row["period"],
                period_type=row["period_type"],
                away_goals=_count(
                    events, in_period & is_goal & (pl.col("owner_abbrev") == away_abbrev)
                ),
                home_goals=_count(
                    events, in_period & is_goal & (pl.col("owner_abbrev") == home_abbrev)
                ),
            )
        )

    return GameAnalytics(
        away=_team_stats(events, away_abbrev),
        home=_team_stats(events, home_abbrev),
        periods=periods,
    )
