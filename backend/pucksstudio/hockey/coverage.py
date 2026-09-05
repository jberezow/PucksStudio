"""Interpret PucksData's coverage contract without inferring coverage from scores."""

from pydantic import BaseModel


class CoverageEntry(BaseModel):
    subject: str
    kind: str
    first_season: int | None
    note: str


def is_available(coverage: list[CoverageEntry], subject: str, season: int) -> bool:
    return any(
        item.subject == subject
        and item.kind in {"event_type", "measure"}
        and item.first_season is not None
        and season >= item.first_season
        for item in coverage
    )


def season_caveats(coverage: list[CoverageEntry], season: int) -> list[str]:
    # PucksData currently identifies each caveat by its affected season.
    return [item.note for item in coverage if item.kind == "caveat" and item.first_season == season]
