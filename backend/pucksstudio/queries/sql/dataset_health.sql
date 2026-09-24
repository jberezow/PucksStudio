-- Dataset-wide completeness and freshness from PucksData's observability contract.
SELECT
    last_sync_at,
    last_sync_games,
    latest_completed_game_date,
    latest_event_game_date,
    completed_games,
    games_with_events,
    missing_event_games,
    acknowledged_gap_games AS acknowledged_gaps,
    actionable_gap_games AS actionable_gaps,
    goals_missing_shots,
    backfill_failed,
    backfill_pending,
    backfill_skipped,
    healthy AND ingestion_failed = 0 AND ingestion_partial = 0
        AND ingestion_stalled = 0 AS healthy,
    ingestion_failed,
    ingestion_partial,
    ingestion_stalled
FROM observability.dataset_health
CROSS JOIN (
    SELECT
        COUNT(*) FILTER (WHERE outcome = 'failed') AS ingestion_failed,
        COUNT(*) FILTER (WHERE outcome = 'partial') AS ingestion_partial,
        COUNT(*) FILTER (
            WHERE outcome = 'running' AND last_attempt_at < NOW() - INTERVAL '2 hours'
        ) AS ingestion_stalled
    FROM observability.ingestion_freshness
) attempts
