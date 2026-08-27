WITH filter_team AS (
    SELECT team_id
    FROM teams
    WHERE abbrev = %(team)s
)
SELECT
    (
        SELECT g.game_date
        FROM games AS g
        WHERE g.game_date < %(game_date)s::DATE
          AND g.game_date <= CURRENT_DATE
          AND EXISTS (
              SELECT 1
              FROM events AS e
              WHERE e.game_id = g.game_id
          )
          AND (
              %(team)s::TEXT IS NULL
              OR g.home_team_id = (SELECT team_id FROM filter_team)
              OR g.away_team_id = (SELECT team_id FROM filter_team)
          )
        ORDER BY g.game_date DESC
        LIMIT 1
    ) AS previous_date,
    (
        SELECT g.game_date
        FROM games AS g
        WHERE g.game_date > %(game_date)s::DATE
          AND g.game_date <= CURRENT_DATE
          AND EXISTS (
              SELECT 1
              FROM events AS e
              WHERE e.game_id = g.game_id
          )
          AND (
              %(team)s::TEXT IS NULL
              OR g.home_team_id = (SELECT team_id FROM filter_team)
              OR g.away_team_id = (SELECT team_id FROM filter_team)
          )
        ORDER BY g.game_date
        LIMIT 1
    ) AS next_date;
