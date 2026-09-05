SELECT games_played, goals, assists, points, shots, shooting_pct, pp_goals, sh_goals
FROM analytics.official_skater_seasons
WHERE player_id = %(player_id)s AND season = %(season)s AND game_type = %(game_type)s;
