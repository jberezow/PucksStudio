import pytest

from pucksstudio.queries import load_query


def test_loads_canonical_query() -> None:
    query = load_query("game_event_sequence")
    assert "FROM events AS e" in query
    assert "%(game_id)s" in query


def test_player_seasons_reads_the_rollup_rather_than_the_event_tables() -> None:
    """The selector must not re-derive event seasons here.

    Searching the typed event tables for every player role and joining each
    match through events to games cost about three seconds per player page,
    almost all of it sequential scans of games. PucksData maintains
    analytics.player_event_seasons for this and owns the guarantee that every
    player role is represented in it.
    """
    query = load_query("player_seasons")

    assert "analytics.player_event_seasons" in query
    assert "analytics.official_skater_seasons" in query
    assert "analytics.official_goalie_seasons" in query
    assert "%(player_id)s" in query

    for table in ("goals", "shots", "hits", "blocks", "penalties", "faceoffs"):
        assert f"FROM {table}" not in query, (
            f"{table} is scanned again; the rollup exists so that it is not"
        )


def test_rejects_unknown_query() -> None:
    with pytest.raises(KeyError):
        load_query("not_a_query")


def test_rejects_path_traversal() -> None:
    with pytest.raises(ValueError):
        load_query("../secrets")
