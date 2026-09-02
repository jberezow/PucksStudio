-- Dataset-wide completeness and freshness from PucksData's observability contract.
SELECT
    last_sync_at,
    last_sync_games,
    latest_completed_game_date,
    latest_event_game_date,
    completed_games,
    games_with_events,
    missing_event_games,
    goals_missing_shots,
    backfill_failed,
    backfill_pending,
    backfill_skipped,
    healthy
FROM observability.dataset_health
