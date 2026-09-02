from datetime import UTC, date, datetime, timedelta

from pucksstudio.hockey.observability import (
    GapCounts,
    assess,
    classify_gap,
    gap_counts_by_season,
)

NOW = datetime(2026, 9, 2, 12, 0, tzinfo=UTC)


def summary(**overrides):
    base = {
        "last_sync_at": NOW - timedelta(hours=2),
        "last_sync_games": 0,
        "latest_completed_game_date": date(2026, 6, 14),
        "latest_event_game_date": date(2026, 6, 14),
        "completed_games": 70339,
        "games_with_events": 70339,
        "missing_event_games": 0,
        "goals_missing_shots": 0,
        "backfill_failed": 0,
        "backfill_pending": 0,
        "backfill_skipped": 95,
        "healthy": True,
    }
    return {**base, **overrides}


def codes(assessment):
    return [reason.code for reason in assessment.reasons]


def test_classify_gap_mirrors_sync_acknowledgement_rule() -> None:
    assert classify_gap("done") == "acknowledged"
    assert classify_gap("skipped") == "acknowledged"
    assert classify_gap("pending") == "actionable"
    assert classify_gap("failed") == "actionable"
    assert classify_gap(None) == "actionable"


def test_gap_counts_by_season_reads_view_rows() -> None:
    counts = gap_counts_by_season(
        [
            {"season": 19581959, "acknowledged_gaps": 23, "actionable_gaps": 0},
            {"season": 20252026, "acknowledged_gaps": None, "actionable_gaps": 2},
        ]
    )
    assert counts == {
        19581959: GapCounts(acknowledged=23, actionable=0),
        20252026: GapCounts(acknowledged=0, actionable=2),
    }


def test_fully_covered_recent_sync_is_healthy() -> None:
    assessment = assess(summary(), {}, now=NOW, sync_overdue_hours=36)
    assert assessment.verdict == "healthy"
    assert assessment.reasons == []
    assert assessment.sync_age_seconds == 2 * 3600


def test_skipped_backfills_alone_do_not_raise_a_reason() -> None:
    assessment = assess(summary(backfill_skipped=500), {}, now=NOW, sync_overdue_hours=36)
    assert assessment.verdict == "healthy"


def test_acknowledged_gaps_only_are_known_gaps() -> None:
    gaps = {19581959: GapCounts(acknowledged=23), 19171918: GapCounts(acknowledged=2)}
    assessment = assess(
        summary(missing_event_games=25, games_with_events=70314, healthy=False),
        gaps,
        now=NOW,
        sync_overdue_hours=36,
    )
    assert assessment.verdict == "known_gaps"
    assert codes(assessment) == ["acknowledged_gaps"]
    reason = assessment.reasons[0]
    assert reason.severity == "info"
    assert reason.count == 25
    assert "2 seasons" in reason.message


def test_actionable_gaps_require_attention() -> None:
    gaps = {20252026: GapCounts(actionable=1), 19581959: GapCounts(acknowledged=23)}
    assessment = assess(
        summary(missing_event_games=24, healthy=False),
        gaps,
        now=NOW,
        sync_overdue_hours=36,
    )
    assert assessment.verdict == "attention"
    assert codes(assessment) == ["actionable_gaps", "acknowledged_gaps"]
    assert assessment.reasons[0].message == "1 completed game without events across 1 season"


def test_stale_sync_is_overdue_even_when_covered() -> None:
    assessment = assess(
        summary(last_sync_at=NOW - timedelta(hours=40)),
        {},
        now=NOW,
        sync_overdue_hours=36,
    )
    assert assessment.verdict == "sync_overdue"
    assert codes(assessment) == ["sync_overdue"]
    assert assessment.reasons[0].message == "Sync overdue by 4 h"
    assert assessment.reasons[0].count == 40


def test_missing_sync_record_is_overdue() -> None:
    assessment = assess(summary(last_sync_at=None), {}, now=NOW, sync_overdue_hours=36)
    assert assessment.verdict == "sync_overdue"
    assert codes(assessment) == ["sync_never"]
    assert assessment.sync_age_seconds is None


def test_naive_sync_timestamp_is_treated_as_utc() -> None:
    naive = (NOW - timedelta(hours=1)).replace(tzinfo=None)
    assessment = assess(summary(last_sync_at=naive), {}, now=NOW, sync_overdue_hours=36)
    assert assessment.sync_age_seconds == 3600


def test_attention_outranks_overdue_and_lists_both() -> None:
    assessment = assess(
        summary(last_sync_at=NOW - timedelta(days=3), backfill_failed=4, goals_missing_shots=1),
        {},
        now=NOW,
        sync_overdue_hours=36,
    )
    assert assessment.verdict == "attention"
    assert codes(assessment) == ["sync_overdue", "goals_missing_shots", "backfill_failed"]
    assert {reason.severity for reason in assessment.reasons[1:]} == {"critical"}


def test_pending_backfills_require_attention() -> None:
    assessment = assess(summary(backfill_pending=9), {}, now=NOW, sync_overdue_hours=36)
    assert assessment.verdict == "attention"
    assert assessment.reasons[0].message == "9 backfills still pending"


def test_events_trailing_schedule_is_reported() -> None:
    assessment = assess(
        summary(latest_event_game_date=date(2026, 6, 10)),
        {},
        now=NOW,
        sync_overdue_hours=36,
    )
    assert assessment.verdict == "attention"
    assert assessment.reasons[0].code == "events_behind_schedule"
    assert assessment.reasons[0].message == "Events trail the schedule by 4 days"


def test_offseason_dates_are_not_stale() -> None:
    """Freshness keys off the sync timestamp, never off how old the last game is."""

    assessment = assess(
        summary(
            latest_completed_game_date=date(2026, 6, 14),
            latest_event_game_date=date(2026, 6, 14),
        ),
        {},
        now=datetime(2026, 9, 30, tzinfo=UTC).replace(hour=12),
        sync_overdue_hours=36,
    )
    # Sync is 28 days old, so only the sync reason appears, not a game-date one.
    assert codes(assessment) == ["sync_overdue"]
