SELECT
    e.id AS event_id,
    e.event_id_in_game,
    e.period,
    e.period_type,
    e.time_in_period,
    e.event_type,
    e.strength,
    e.zone_code,
    e.x_coord,
    e.y_coord,
    owner.abbrev AS owner_abbrev,
    g.shot_type AS goal_shot_type,
    scorer.player_id AS scorer_id,
    CONCAT_WS(' ', scorer.first_name, scorer.last_name) AS scorer_name,
    assist1.player_id AS assist1_id,
    CONCAT_WS(' ', assist1.first_name, assist1.last_name) AS assist1_name,
    assist2.player_id AS assist2_id,
    CONCAT_WS(' ', assist2.first_name, assist2.last_name) AS assist2_name,
    shooter.player_id AS shooter_id,
    CONCAT_WS(' ', shooter.first_name, shooter.last_name) AS shooter_name,
    s.shot_type,
    CONCAT_WS(' ', hitter.first_name, hitter.last_name) AS hitter_name,
    CONCAT_WS(' ', hittee.first_name, hittee.last_name) AS hittee_name,
    CONCAT_WS(' ', blocker.first_name, blocker.last_name) AS blocker_name,
    CONCAT_WS(' ', blocked_shooter.first_name, blocked_shooter.last_name) AS blocked_shooter_name,
    CONCAT_WS(' ', penalized.first_name, penalized.last_name) AS penalized_name,
    p.infraction_type,
    p.duration_minutes,
    CONCAT_WS(' ', winner.first_name, winner.last_name) AS faceoff_winner_name,
    CONCAT_WS(' ', loser.first_name, loser.last_name) AS faceoff_loser_name
FROM events AS e
LEFT JOIN teams AS owner ON owner.team_id = e.event_owner_team_id
LEFT JOIN goals AS g ON g.event_id = e.id
LEFT JOIN players AS scorer ON scorer.player_id = g.scorer_player_id
LEFT JOIN players AS assist1 ON assist1.player_id = g.assist1_player_id
LEFT JOIN players AS assist2 ON assist2.player_id = g.assist2_player_id
LEFT JOIN shots AS s ON s.event_id = e.id
LEFT JOIN players AS shooter ON shooter.player_id = s.shooting_player_id
LEFT JOIN hits AS h ON h.event_id = e.id
LEFT JOIN players AS hitter ON hitter.player_id = h.hitting_player_id
LEFT JOIN players AS hittee ON hittee.player_id = h.hittee_player_id
LEFT JOIN blocks AS b ON b.event_id = e.id
LEFT JOIN players AS blocker ON blocker.player_id = b.blocking_player_id
LEFT JOIN players AS blocked_shooter ON blocked_shooter.player_id = b.shooting_player_id
LEFT JOIN penalties AS p ON p.event_id = e.id
LEFT JOIN players AS penalized ON penalized.player_id = p.committed_by_player_id
LEFT JOIN faceoffs AS f ON f.event_id = e.id
LEFT JOIN players AS winner ON winner.player_id = f.winning_player_id
LEFT JOIN players AS loser ON loser.player_id = f.losing_player_id
WHERE e.game_id = %(game_id)s
ORDER BY e.period, e.time_in_period, e.event_id_in_game;
