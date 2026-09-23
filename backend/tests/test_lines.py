from copy import deepcopy
from datetime import date

import pytest

from pucksstudio.hockey.lines import analyze_game, headshot_url, summarize_lines


def game(**changes):
    return dict(
        game_id=2024020001,
        season=20242025,
        game_type=2,
        game_date=date(2024, 10, 1),
        game_state="OFF",
        home_team_id=38,
        away_team_id=39,
        home_abbrev="VGK",
        away_abbrev="SEA",
        **changes,
    )


def shifts(periods=(1, 2, 3)):
    return [
        dict(
            game_id=2024020001,
            source_shift_id=period * 100 + player,
            player_id=player,
            team_id=38 if player < 10 else 39,
            period=period,
            start_time_seconds=0,
            end_time_seconds=1200,
            duration_seconds=None,
            position="C" if player % 10 < 4 else ("D" if player % 10 < 6 else "G"),
            player_name=f"Player {player}",
            position_source="game",
        )
        for period in periods
        for player in [1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16]
    ]


def test_full_game_units_and_shares():
    result = summarize_lines([game()], shifts(), 38)
    assert result["status"] == "available"
    assert result["five_on_five_seconds"] == 3600
    assert result["unclassified_seconds"] == 0
    assert len(result["forward_trios"]) == len(result["defense_pairs"]) == 1
    unit = result["forward_trios"][0]
    assert unit["seconds"] == 3600 and unit["share"] == 1
    assert unit["deployments"] == 3
    assert [p["player_id"] for p in unit["players"]] == [1, 2, 3]


def test_duplicates_and_defense_changes_do_not_split_forward_deployments():
    rows = shifts()
    changed = next(row for row in rows if row["player_id"] == 4 and row["period"] == 1)
    changed["end_time_seconds"] = 600
    replacement = dict(changed, player_id=7, start_time_seconds=600, end_time_seconds=1200)
    rows += [
        replacement,
        deepcopy(rows[0]),
        dict(rows[0], start_time_seconds=10, end_time_seconds=20),
    ]
    result = summarize_lines([game()], rows, 38)
    assert result["forward_trios"][0]["seconds"] == 3600
    assert result["forward_trios"][0]["deployments"] == 3
    assert result["total_defense_pairs"] == 2
    assert result["games"][0]["issues"]["overlapping_rows"] == 2


def test_opponent_manpower_controls_five_on_five():
    rows = [r for r in shifts() if not (r["player_id"] == 11 and r["period"] == 1)]
    result, _ = analyze_game(game(), rows, 38)
    assert result["five_on_five_seconds"] == 2400
    assert result["other_strength_seconds"] == 1200


@pytest.mark.parametrize(
    "field,value",
    [
        ("team_id", None),
        ("team_id", 54),
        ("player_id", None),
        ("start_time_seconds", None),
        ("end_time_seconds", 1300),
    ],
)
def test_bad_identity_or_clock_excludes_the_period(field, value):
    rows = shifts()
    rows[0][field] = value
    result = summarize_lines([game()], rows, 38)
    assert result["five_on_five_seconds"] == 2400
    assert result["unclassified_seconds"] == 1200
    assert result["status"] == "partial"


def test_missing_goalie_and_unknown_role_do_not_fabricate_five_on_five():
    for rows in ([r for r in shifts() if not (r["player_id"] == 6 and r["period"] == 1)], shifts()):
        if len(rows) == 36:
            rows[0]["position"] = None
            rows[0]["player_id"] = 99
        result = summarize_lines([game()], rows, 38)
        assert result["five_on_five_seconds"] == 2400
        assert result["unclassified_seconds"] == 1200


def test_zero_duration_and_source_duration_disagreement():
    rows = shifts()
    rows += [dict(rows[0], player_id=99, start_time_seconds=30, end_time_seconds=30)]
    rows[0]["duration_seconds"] = 1199
    result = summarize_lines([game()], rows, 38)
    assert result["five_on_five_seconds"] == 3600
    assert result["status"] == "partial"
    assert result["games"][0]["issues"]["zero_duration_rows"] == 1
    assert result["games"][0]["issues"]["duration_disagreement_rows"] == 1


def test_regular_season_and_playoff_overtime_bounds():
    rows = shifts((1, 2, 3, 4))
    for row in rows:
        if row["period"] == 4:
            row["end_time_seconds"] = 400
    regular = summarize_lines([game()], rows, 38)
    playoff_game = game()
    playoff_game["game_type"] = 3
    playoff = summarize_lines([playoff_game], rows, 38)
    assert regular["five_on_five_seconds"] == 3600
    assert playoff["five_on_five_seconds"] == 4000


def test_unsupported_missing_failed_and_preserved_snapshots():
    old = game()
    old["season"] = 20092010
    assert summarize_lines([old], [], 38)["status"] == "unsupported"
    for status in (None, "unavailable", "failed"):
        scope = game(fetch_status=status)
        result = summarize_lines([scope], [], 38)
        assert result["games"][0]["status"] == (status or "not_loaded")
        assert result["usable_games"] == 0
        assert summarize_lines([scope], shifts(), 38)["status"] == "available"


def test_missing_game_does_not_dilute_time_per_appearance_or_shares():
    missing = game()
    missing["game_id"] += 1
    result = summarize_lines([game(), missing], shifts(), 38)
    assert result["expected_games"] == 2 and result["usable_games"] == 1
    assert result["status"] == "partial"
    assert result["forward_trios"][0]["seconds_per_appearance"] == 3600
    assert result["forward_trios"][0]["share"] == 1


def test_game_evidence_is_bounded_without_truncating_totals():
    games, rows = [], []
    for offset in range(20):
        g = game()
        g["game_id"] += offset
        games.append(g)
        rows.extend(dict(row, game_id=g["game_id"]) for row in shifts())
    unit = summarize_lines(games, rows, 38)["forward_trios"][0]
    assert unit["seconds"] == 72000
    assert unit["appearances"] == 20
    assert unit["deployments"] == 60
    assert len(unit["evidence"]) == 12 and unit["evidence_truncated"]


def test_safe_portrait_host():
    assert headshot_url("https://assets.nhle.com/a.png")
    for url in (
        None,
        "javascript:alert(1)",
        "https://evil.test/a",
        "https://assets.nhle.com@evil.test/a",
    ):
        assert headshot_url(url) is None


def test_single_game_evidence_includes_more_than_season_preview():
    rows = shifts()
    original = rows.pop(0)
    for start in range(0, 1200, 40):
        rows.append(dict(original, start_time_seconds=start, end_time_seconds=start + 20))
        rows.append(
            dict(original, player_id=7, start_time_seconds=start + 20, end_time_seconds=start + 40)
        )
    unit = summarize_lines([game()], rows, 38)["forward_trios"][0]
    assert unit["deployments"] == 32
    assert len(unit["evidence"]) == 32
    assert not unit["evidence_truncated"]
