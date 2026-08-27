import pytest

from pucksstudio.queries import load_query


def test_loads_canonical_query() -> None:
    query = load_query("game_event_sequence")
    assert "FROM events AS e" in query
    assert "%(game_id)s" in query


def test_rejects_unknown_query() -> None:
    with pytest.raises(KeyError):
        load_query("not_a_query")


def test_rejects_path_traversal() -> None:
    with pytest.raises(ValueError):
        load_query("../secrets")
