import polars as pl

from pucksstudio.hockey.games import describe_event, present_events


def test_describe_goal_with_assists() -> None:
    event = {
        "event_type": "goal",
        "owner_abbrev": "PIT",
        "scorer_name": "Sidney Crosby",
        "assist1_name": "Kris Letang",
        "assist2_name": "Evgeni Malkin",
    }

    assert describe_event(event) == (
        "Goal: Sidney Crosby (PIT) — assists: Kris Letang, Evgeni Malkin"
    )


def test_describe_penalty() -> None:
    event = {
        "event_type": "penalty",
        "owner_abbrev": "PIT",
        "penalized_name": "Sidney Crosby",
        "infraction_type": "tripping",
        "duration_minutes": 2,
    }

    assert describe_event(event) == "tripping: Sidney Crosby (PIT), 2 min"


def test_present_events_preserves_provenance() -> None:
    events = pl.DataFrame(
        {
            "event_id": [42],
            "event_type": ["shot-on-goal"],
            "owner_abbrev": ["PIT"],
            "shooter_name": ["Sidney Crosby"],
        }
    )

    presented = present_events(events)

    assert presented["event_id"].to_list() == [42]
    assert presented["description"].to_list() == ["Shot on goal: Sidney Crosby (PIT)"]


def test_present_empty_events_does_not_create_a_phantom_row() -> None:
    presented = present_events(pl.DataFrame())

    assert presented.is_empty()
    assert presented.to_dicts() == []
