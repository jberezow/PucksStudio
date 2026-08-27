from dataclasses import dataclass


@dataclass(frozen=True)
class PlayoffContext:
    round: int
    series: int
    game: int


def parse_playoff_context(game_id: int, game_type: int) -> PlayoffContext | None:
    """Decode NHL postseason round, series, and game from a canonical game ID."""

    if game_type != 3:
        return None

    suffix = game_id % 1_000
    round_number = suffix // 100
    series_number = (suffix // 10) % 10
    game_number = suffix % 10
    if not (1 <= round_number <= 4 and 1 <= series_number <= 8 and 1 <= game_number <= 7):
        return None

    return PlayoffContext(round=round_number, series=series_number, game=game_number)
