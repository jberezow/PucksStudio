SELECT s.game_id, s.source_shift_id, s.player_id, s.team_id AS nhl_team_id,
       identity.franchise_id AS team_id, identity.abbrev AS source_team_abbrev,
       s.period, s.start_time_seconds, s.end_time_seconds, s.duration_seconds,
       s.ingested_at,
       COALESCE(NULLIF(CONCAT_WS(' ', p.first_name, p.last_name), ''),
                sk.full_name, go.full_name) AS player_name,
       COALESCE(sk.position_code, CASE WHEN go.player_id IS NOT NULL THEN 'G' END,
                p.position) AS position,
       CASE WHEN sk.position_code IS NOT NULL OR go.player_id IS NOT NULL
            THEN 'game' ELSE 'player' END AS position_source,
       p.headshot_url
FROM shifts s
JOIN games g ON g.game_id = s.game_id
LEFT JOIN nhl_team_identities identity ON identity.nhl_team_id = s.team_id
LEFT JOIN players p ON p.player_id = s.player_id
LEFT JOIN analytics.official_skater_games sk
       ON sk.game_id = s.game_id AND sk.player_id = s.player_id
LEFT JOIN analytics.official_goalie_games go
       ON go.game_id = s.game_id AND go.player_id = s.player_id
WHERE s.type_code = 517 AND (
    (%(game_id)s::bigint IS NOT NULL AND g.game_id = %(game_id)s)
    OR (%(game_id)s::bigint IS NULL AND g.season = %(season)s
        AND g.game_type = %(game_type)s
        AND %(team_id)s IN (g.home_team_id, g.away_team_id)
        AND g.game_state IN ('OFF', 'OVER', 'FINAL')
        AND (%(date_from)s::date IS NULL OR g.game_date >= %(date_from)s)
        AND (%(date_to)s::date IS NULL OR g.game_date <= %(date_to)s)))
ORDER BY s.game_id, s.period, s.start_time_seconds, s.source_shift_id;
