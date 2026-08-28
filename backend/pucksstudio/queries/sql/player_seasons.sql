SELECT g.season
FROM goals AS d
JOIN events AS e ON e.id = d.event_id
JOIN games AS g ON g.game_id = e.game_id
WHERE d.scorer_player_id = %(player_id)s
   OR d.assist1_player_id = %(player_id)s
   OR d.assist2_player_id = %(player_id)s
   OR d.goalie_id = %(player_id)s

UNION

SELECT g.season
FROM shots AS d
JOIN events AS e ON e.id = d.event_id
JOIN games AS g ON g.game_id = e.game_id
WHERE d.shooting_player_id = %(player_id)s
   OR d.goalie_in_net_id = %(player_id)s

UNION

SELECT g.season
FROM hits AS d
JOIN events AS e ON e.id = d.event_id
JOIN games AS g ON g.game_id = e.game_id
WHERE d.hitting_player_id = %(player_id)s
   OR d.hittee_player_id = %(player_id)s

UNION

SELECT g.season
FROM blocks AS d
JOIN events AS e ON e.id = d.event_id
JOIN games AS g ON g.game_id = e.game_id
WHERE d.blocking_player_id = %(player_id)s
   OR d.shooting_player_id = %(player_id)s

UNION

SELECT g.season
FROM penalties AS d
JOIN events AS e ON e.id = d.event_id
JOIN games AS g ON g.game_id = e.game_id
WHERE d.committed_by_player_id = %(player_id)s
   OR d.drawn_by_player_id = %(player_id)s

UNION

SELECT g.season
FROM faceoffs AS d
JOIN events AS e ON e.id = d.event_id
JOIN games AS g ON g.game_id = e.game_id
WHERE d.winning_player_id = %(player_id)s
   OR d.losing_player_id = %(player_id)s

ORDER BY season DESC;
