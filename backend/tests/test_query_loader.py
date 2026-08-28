import pytest

from pucksstudio.queries import load_query


def test_loads_canonical_query() -> None:
    query = load_query("game_event_sequence")
    assert "FROM events AS e" in query
    assert "%(game_id)s" in query


def test_player_seasons_includes_every_attributed_event_role() -> None:
    query = load_query("player_seasons")

    expected_roles = {
        "scorer_player_id",
        "assist1_player_id",
        "assist2_player_id",
        "goalie_id",
        "shooting_player_id",
        "goalie_in_net_id",
        "hitting_player_id",
        "hittee_player_id",
        "blocking_player_id",
        "committed_by_player_id",
        "drawn_by_player_id",
        "winning_player_id",
        "losing_player_id",
    }

    assert all(f"d.{role}" in query for role in expected_roles)
    assert "%(player_id)s" in query


def test_rejects_unknown_query() -> None:
    with pytest.raises(KeyError):
        load_query("not_a_query")


def test_rejects_path_traversal() -> None:
    with pytest.raises(ValueError):
        load_query("../secrets")
