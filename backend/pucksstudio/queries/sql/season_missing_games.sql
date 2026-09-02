-- Completed games in one season that have no play-by-play events, with the
-- ingestion pipeline's checkpoint state so an operator can tell a retryable
-- failure from a gap the pipeline has already acknowledged.
SELECT
    g.game_id,
    g.game_date,
    g.game_type,
    g.game_state,
    home.abbrev AS home_abbrev,
    away.abbrev AS away_abbrev,
    bp.status AS backfill_status,
    bp.error_message AS backfill_error,
    bp.updated_at AS backfill_updated_at
FROM games AS g
JOIN teams AS home ON home.team_id = g.home_team_id
JOIN teams AS away ON away.team_id = g.away_team_id
LEFT JOIN backfill_progress AS bp ON bp.game_id = g.game_id
WHERE g.season = %(season)s
  AND g.game_state IN ('OFF', 'OVER', 'FINAL')
  AND g.game_type <> 1
  AND NOT EXISTS (SELECT 1 FROM events AS e WHERE e.game_id = g.game_id)
ORDER BY g.game_date, g.game_id
