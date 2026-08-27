WITH contributions AS (
    SELECT
        e.game_id,
        e.event_owner_team_id AS team_id,
        COUNT(*) FILTER (WHERE gl.scorer_player_id = %(player_id)s) AS goals,
        COUNT(*) FILTER (
            WHERE gl.assist1_player_id = %(player_id)s
               OR gl.assist2_player_id = %(player_id)s
        ) AS assists,
        0 AS shots
    FROM games AS season_game
    JOIN events AS e ON e.game_id = season_game.game_id
    JOIN goals AS gl ON gl.event_id = e.id
    WHERE season_game.season = %(season)s
      AND season_game.game_type = %(game_type)s
      AND (
          gl.scorer_player_id = %(player_id)s
          OR gl.assist1_player_id = %(player_id)s
          OR gl.assist2_player_id = %(player_id)s
      )
    GROUP BY e.game_id, e.event_owner_team_id

    UNION ALL

    SELECT
        e.game_id,
        e.event_owner_team_id AS team_id,
        0 AS goals,
        0 AS assists,
        COUNT(*) AS shots
    FROM games AS season_game
    JOIN events AS e ON e.game_id = season_game.game_id
    JOIN shots AS sh ON sh.event_id = e.id
    WHERE season_game.season = %(season)s
      AND season_game.game_type = %(game_type)s
      AND sh.shooting_player_id = %(player_id)s
    GROUP BY e.game_id, e.event_owner_team_id
),
game_totals AS (
    SELECT
        game_id,
        team_id,
        SUM(goals)::BIGINT AS goals,
        SUM(assists)::BIGINT AS assists,
        SUM(shots)::BIGINT AS shots
    FROM contributions
    GROUP BY game_id, team_id
)
SELECT
    g.game_id,
    g.game_date,
    g.game_type,
    team.abbrev AS team_abbrev,
    CASE WHEN gt.team_id = g.home_team_id THEN away.abbrev ELSE home.abbrev END AS opponent_abbrev,
    CASE WHEN gt.team_id = g.home_team_id THEN g.home_score ELSE g.away_score END AS team_score,
    CASE WHEN gt.team_id = g.home_team_id THEN g.away_score ELSE g.home_score END AS opponent_score,
    gt.goals,
    gt.assists,
    gt.goals + gt.assists AS points,
    gt.shots
FROM game_totals AS gt
JOIN games AS g ON g.game_id = gt.game_id
LEFT JOIN teams AS team ON team.team_id = gt.team_id
JOIN teams AS home ON home.team_id = g.home_team_id
JOIN teams AS away ON away.team_id = g.away_team_id
ORDER BY g.game_date DESC, g.game_id DESC;
