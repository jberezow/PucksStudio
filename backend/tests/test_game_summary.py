import polars as pl

from pucksstudio.hockey.games import summarize_game


def test_summarize_game_derives_team_and_period_totals() -> None:
    events = pl.DataFrame(
        {
            "period": [1, 1, 1, 2, 2, 2, 2],
            "period_type": ["REG"] * 7,
            "event_type": [
                "goal",
                "shot-on-goal",
                "faceoff",
                "goal",
                "hit",
                "penalty",
                "faceoff",
            ],
            "owner_abbrev": ["PIT", "PIT", "PIT", "BOS", "BOS", "PIT", "BOS"],
            "duration_minutes": [None, None, None, None, None, 2, None],
        }
    )

    summary = summarize_game(events, away_abbrev="PIT", home_abbrev="BOS")

    assert summary.away.goals == 1
    assert summary.away.shots_on_goal == 2
    assert summary.away.penalty_minutes == 2
    assert summary.home.goals == 1
    assert summary.home.hits == 1
    assert summary.periods[0].away_goals == 1
    assert summary.periods[1].home_goals == 1


def test_summarize_empty_game() -> None:
    summary = summarize_game(pl.DataFrame(), away_abbrev="PIT", home_abbrev="BOS")

    assert summary.away.shots_on_goal == 0
    assert summary.home.faceoff_wins == 0
    assert summary.periods == []
