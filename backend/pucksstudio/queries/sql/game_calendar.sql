SELECT
    g.game_date,
    COUNT(*) AS game_count,
    COUNT(*) FILTER (
        WHERE EXISTS (
            SELECT 1
            FROM events AS e
            WHERE e.game_id = g.game_id
        )
    ) AS played_count
FROM games AS g
JOIN teams AS home ON home.team_id = g.home_team_id
JOIN teams AS away ON away.team_id = g.away_team_id
WHERE g.game_date >= %(month_start)s::DATE
  AND g.game_date < (%(month_start)s::DATE + INTERVAL '1 month')
  AND (
      %(team)s::TEXT IS NULL
      OR home.abbrev = %(team)s
      OR away.abbrev = %(team)s
  )
GROUP BY g.game_date
ORDER BY g.game_date;
