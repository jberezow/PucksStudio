WITH loaded_dates AS (
    SELECT DISTINCT g.game_date
    FROM games AS g
    JOIN teams AS home ON home.team_id = g.home_team_id
    JOIN teams AS away ON away.team_id = g.away_team_id
    WHERE g.game_date <= CURRENT_DATE
      AND EXISTS (
          SELECT 1
          FROM events AS e
          WHERE e.game_id = g.game_id
      )
      AND (
          %(team)s::TEXT IS NULL
          OR home.abbrev = %(team)s
          OR away.abbrev = %(team)s
      )
)
SELECT
    MAX(game_date) FILTER (WHERE game_date < %(game_date)s::DATE) AS previous_date,
    MIN(game_date) FILTER (WHERE game_date > %(game_date)s::DATE) AS next_date
FROM loaded_dates;
