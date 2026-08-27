WITH selected_date AS (
    SELECT COALESCE(
        %(game_date)s::DATE,
        MAX(g.game_date) FILTER (
            WHERE g.game_date <= CURRENT_DATE
            AND EXISTS (
                SELECT 1
                FROM events AS e
                WHERE e.game_id = g.game_id
            )
            AND (
                %(team)s::TEXT IS NULL
                OR EXISTS (
                    SELECT 1
                    FROM teams AS filter_team
                    WHERE filter_team.abbrev = %(team)s
                      AND filter_team.team_id IN (g.home_team_id, g.away_team_id)
                )
            )
        )
    ) AS game_date
    FROM games AS g
)
SELECT
    g.game_id,
    g.game_date,
    g.start_time_utc,
    g.game_type,
    g.game_state,
    g.venue,
    home.abbrev AS home_abbrev,
    home.full_name AS home_name,
    g.home_score,
    away.abbrev AS away_abbrev,
    away.full_name AS away_name,
    g.away_score,
    COUNT(e.id) AS event_count
FROM games AS g
JOIN teams AS home ON home.team_id = g.home_team_id
JOIN teams AS away ON away.team_id = g.away_team_id
LEFT JOIN events AS e ON e.game_id = g.game_id
CROSS JOIN selected_date
WHERE g.game_date = selected_date.game_date
  AND (
      %(team)s::TEXT IS NULL
      OR home.abbrev = %(team)s
      OR away.abbrev = %(team)s
  )
GROUP BY g.game_id, home.abbrev, home.full_name, away.abbrev, away.full_name
ORDER BY g.start_time_utc, g.game_id;
