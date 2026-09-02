-- Split each season's eventless completed games by whether the ingestion
-- pipeline has already acknowledged them. PucksData's sync treats backfill rows
-- marked done or skipped as known gaps and will not retry them; anything else
-- is still actionable. Completeness rules match observability.season_health.
SELECT
    g.season,
    COUNT(*) FILTER (WHERE bp.status IN ('done', 'skipped')) AS acknowledged_gaps,
    COUNT(*) FILTER (
        WHERE bp.status IS NULL OR bp.status NOT IN ('done', 'skipped')
    ) AS actionable_gaps
FROM games AS g
LEFT JOIN backfill_progress AS bp ON bp.game_id = g.game_id
WHERE g.game_state IN ('OFF', 'OVER', 'FINAL')
  AND g.game_type <> 1
  AND NOT EXISTS (SELECT 1 FROM events AS e WHERE e.game_id = g.game_id)
GROUP BY g.season
