from pucksstudio.hockey.games import parse_playoff_context


def test_parse_playoff_context_from_game_id() -> None:
    context = parse_playoff_context(2025030227, game_type=3)

    assert context is not None
    assert context.round == 2
    assert context.series == 2
    assert context.game == 7


def test_regular_season_game_has_no_playoff_context() -> None:
    assert parse_playoff_context(2025020858, game_type=2) is None
