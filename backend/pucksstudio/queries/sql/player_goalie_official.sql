SELECT games_played, wins, losses, ties, ot_losses, shutouts, saves, goals_against, shots_against, save_pct
FROM analytics.official_goalie_seasons
WHERE player_id = %(player_id)s AND season = %(season)s AND game_type = %(game_type)s;
