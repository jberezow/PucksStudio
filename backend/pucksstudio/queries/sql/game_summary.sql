SELECT
    g.game_id,
    g.season,
    g.game_date,
    g.start_time_utc,
    g.game_type,
    g.game_state,
    g.venue,
    g.venue_location,
    home.team_id AS home_team_id,
    home.abbrev AS home_abbrev,
    home.full_name AS home_name,
    g.home_score,
    away.team_id AS away_team_id,
    away.abbrev AS away_abbrev,
    away.full_name AS away_name,
    g.away_score
FROM games AS g
JOIN teams AS home ON home.team_id = g.home_team_id
JOIN teams AS away ON away.team_id = g.away_team_id
WHERE g.game_id = %(game_id)s;
