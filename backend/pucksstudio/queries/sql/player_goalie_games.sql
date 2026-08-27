WITH contributions AS (
    SELECT
        e.game_id,
        e.event_owner_team_id AS opponent_team_id,
        COUNT(*) FILTER (WHERE e.event_type = 'shot-on-goal') AS saves,
        0 AS goals_against
    FROM games AS season_game
    JOIN events AS e ON e.game_id = season_game.game_id
    JOIN shots AS sh ON sh.event_id = e.id
    WHERE season_game.season = %(season)s
      AND season_game.game_type = %(game_type)s
      AND sh.goalie_in_net_id = %(player_id)s
    GROUP BY e.game_id, e.event_owner_team_id

    UNION ALL

    SELECT
        e.game_id,
        e.event_owner_team_id AS opponent_team_id,
        0 AS saves,
        COUNT(*) AS goals_against
    FROM games AS season_game
    JOIN events AS e ON e.game_id = season_game.game_id
    JOIN goals AS gl ON gl.event_id = e.id
    WHERE season_game.season = %(season)s
      AND season_game.game_type = %(game_type)s
      AND gl.goalie_id = %(player_id)s
    GROUP BY e.game_id, e.event_owner_team_id
),
game_totals AS (
    SELECT
        game_id,
        opponent_team_id,
        SUM(saves)::BIGINT AS saves,
        SUM(goals_against)::BIGINT AS goals_against
    FROM contributions
    GROUP BY game_id, opponent_team_id
)
SELECT
    g.game_id,
    g.game_date,
    g.game_type,
    CASE
        WHEN gt.opponent_team_id = g.home_team_id THEN away.abbrev
        ELSE home.abbrev
    END AS team_abbrev,
    opponent.abbrev AS opponent_abbrev,
    CASE
        WHEN gt.opponent_team_id = g.home_team_id THEN g.away_score
        ELSE g.home_score
    END AS team_score,
    CASE
        WHEN gt.opponent_team_id = g.home_team_id THEN g.home_score
        ELSE g.away_score
    END AS opponent_score,
    gt.saves,
    gt.goals_against,
    gt.saves + gt.goals_against AS shots_against
FROM game_totals AS gt
JOIN games AS g ON g.game_id = gt.game_id
LEFT JOIN teams AS opponent ON opponent.team_id = gt.opponent_team_id
JOIN teams AS home ON home.team_id = g.home_team_id
JOIN teams AS away ON away.team_id = g.away_team_id
ORDER BY g.game_date DESC, g.game_id DESC;
