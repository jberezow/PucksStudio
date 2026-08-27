from collections.abc import Mapping
from typing import Any

import polars as pl


def _name(event: Mapping[str, Any], key: str, fallback: str = "Unknown player") -> str:
    value = event.get(key)
    return str(value) if value else fallback


def describe_event(event: Mapping[str, Any]) -> str:
    """Create a concise hockey description while retaining the source fields."""

    event_type = str(event.get("event_type") or "event").lower().replace("_", "-")
    team = f" ({event['owner_abbrev']})" if event.get("owner_abbrev") else ""

    if event_type == "goal":
        scorer = _name(event, "scorer_name")
        assists = [event.get("assist1_name"), event.get("assist2_name")]
        assisted_by = ", ".join(str(name) for name in assists if name)
        suffix = f" — assists: {assisted_by}" if assisted_by else " — unassisted"
        return f"Goal: {scorer}{team}{suffix}"
    if event_type in {"shot", "shot-on-goal"}:
        return f"Shot on goal: {_name(event, 'shooter_name')}{team}"
    if event_type == "hit":
        return f"Hit: {_name(event, 'hitter_name')} on {_name(event, 'hittee_name')}{team}"
    if event_type == "blocked-shot":
        return (
            f"Blocked shot: {_name(event, 'blocker_name')} blocked "
            f"{_name(event, 'blocked_shooter_name')}{team}"
        )
    if event_type == "penalty":
        infraction = event.get("infraction_type") or "Penalty"
        minutes = event.get("duration_minutes")
        duration = f", {minutes} min" if minutes is not None else ""
        return f"{infraction}: {_name(event, 'penalized_name')}{team}{duration}"
    if event_type == "faceoff":
        return (
            f"Faceoff: {_name(event, 'faceoff_winner_name')} won against "
            f"{_name(event, 'faceoff_loser_name')}{team}"
        )

    return f"{event_type.replace('-', ' ').title()}{team}"


def present_events(events: pl.DataFrame) -> pl.DataFrame:
    """Add display descriptions without discarding event-level provenance."""

    if events.is_empty():
        return pl.DataFrame(schema={**events.schema, "description": pl.String})

    descriptions = [describe_event(event) for event in events.to_dicts()]
    return events.with_columns(pl.Series("description", descriptions, dtype=pl.String))
