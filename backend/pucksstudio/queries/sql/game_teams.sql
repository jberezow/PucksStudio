SELECT
    t.team_id,
    t.abbrev,
    t.full_name
FROM teams AS t
WHERE EXISTS (
    SELECT 1
    FROM games AS g
    WHERE g.home_team_id = t.team_id OR g.away_team_id = t.team_id
)
ORDER BY t.full_name, t.abbrev;
