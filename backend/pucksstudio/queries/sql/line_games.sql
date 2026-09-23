SELECT g.game_id, g.season, g.game_type, g.game_date, g.game_state,
       g.home_team_id, g.away_team_id,
       h.abbrev AS home_abbrev, a.abbrev AS away_abbrev,
       h.full_name AS home_name, a.full_name AS away_name,
       f.status AS fetch_status, f.attempted_at
FROM games g
JOIN teams h ON h.team_id = g.home_team_id
JOIN teams a ON a.team_id = g.away_team_id
LEFT JOIN shift_fetch_status f ON f.game_id = g.game_id
WHERE (%(game_id)s::bigint IS NOT NULL AND g.game_id = %(game_id)s)
   OR (%(game_id)s::bigint IS NULL AND g.season = %(season)s
       AND g.game_type = %(game_type)s
       AND %(team_id)s IN (g.home_team_id, g.away_team_id)
       AND g.game_state IN ('OFF', 'OVER', 'FINAL')
       AND (%(date_from)s::date IS NULL OR g.game_date >= %(date_from)s)
       AND (%(date_to)s::date IS NULL OR g.game_date <= %(date_to)s))
ORDER BY g.game_date, g.game_id;
