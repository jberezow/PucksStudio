-- Per-season completeness from PucksData's observability contract.
SELECT
    season,
    completed_games,
    games_with_events,
    missing_event_games,
    acknowledged_gap_games AS acknowledged_gaps,
    actionable_gap_games AS actionable_gaps,
    event_coverage_pct,
    goals_missing_shots,
    backfill_done,
    backfill_failed,
    backfill_skipped,
    backfill_pending,
    healthy
FROM observability.season_health
ORDER BY season DESC
