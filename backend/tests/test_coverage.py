from datetime import date

from pucksstudio.api.routes.players import PlayerGame, _goalie_summary, _skater_summary
from pucksstudio.hockey.coverage import CoverageEntry, is_available, season_caveats


def game(**counts):
    return PlayerGame(
        game_id=1,
        game_date=date(2026, 1, 1),
        game_type=2,
        team_abbrev="PIT",
        opponent_abbrev="BOS",
        team_score=1,
        opponent_score=0,
        **counts,
    )


def test_real_extreme_percentages_are_not_mistaken_for_missing_coverage():
    assert _skater_summary([game(goals=2, shots=2)], True).shooting_percentage == 100
    assert _goalie_summary([game(saves=0, goals_against=2)], True).save_percentage == 0
    assert _skater_summary([], True).shooting_percentage is None
    assert _goalie_summary([], True).save_percentage is None


def test_historical_counts_and_rates_are_unknown():
    skater = _skater_summary([game(goals=2, shots=2)], False)
    goalie = _goalie_summary([game(saves=0, goals_against=2)], False)
    assert skater.goals == 2
    assert skater.shots is None and skater.shooting_percentage is None
    assert goalie.goals_against == 2
    assert goalie.saves is None and goalie.shots_against is None
    assert goalie.save_percentage is None


def test_coverage_is_explicit_and_caveats_apply_only_to_the_named_season():
    entries = [
        CoverageEntry(subject="shots", kind="measure", first_season=19971998, note="Shots"),
        CoverageEntry(subject="gap", kind="caveat", first_season=20092010, note="Incomplete"),
    ]
    assert not is_available(entries, "shots", 19961997)
    assert is_available(entries, "shots", 19971998)
    assert not is_available(entries, "missing", 20252026)
    assert season_caveats(entries, 20092010) == ["Incomplete"]
    assert season_caveats(entries, 20102011) == []
