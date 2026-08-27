SELECT
    e.id AS event_id,
    e.game_id,
    g.game_date,
    e.period,
    e.time_in_period,
    CASE WHEN e.event_type = 'goal' THEN 'goal-against' ELSE 'save' END AS result,
    e.strength,
    e.x_coord,
    e.y_coord,
    sh.shot_type,
    shooting_team.abbrev AS shooting_team_abbrev
FROM games AS g
JOIN events AS e ON e.game_id = g.game_id
JOIN shots AS sh ON sh.event_id = e.id
LEFT JOIN teams AS shooting_team ON shooting_team.team_id = e.event_owner_team_id
WHERE g.season = %(season)s
  AND g.game_type = %(game_type)s
  AND sh.goalie_in_net_id = %(player_id)s
ORDER BY g.game_date, e.game_id, e.period, e.time_in_period, e.id;
