SELECT
    p.player_id,
    p.first_name,
    p.last_name,
    p.position,
    p.shoots_catches,
    p.current_team_abbrev
FROM players AS p
WHERE (
    %(query)s::TEXT = ''
    OR CONCAT_WS(' ', p.first_name, p.last_name) ILIKE '%%' || %(query)s || '%%'
)
  AND (
      %(role)s::TEXT = 'all'
      OR (%(role)s = 'goalie' AND p.position = 'G')
      OR (%(role)s = 'skater' AND p.position <> 'G')
  )
ORDER BY
    CASE
        WHEN %(query)s::TEXT = '' AND p.current_team_abbrev IS NOT NULL THEN 0
        WHEN %(query)s::TEXT = '' THEN 1
        WHEN LOWER(CONCAT_WS(' ', p.first_name, p.last_name)) = LOWER(%(query)s) THEN 0
        WHEN CONCAT_WS(' ', p.first_name, p.last_name) ILIKE %(query)s || '%%' THEN 1
        ELSE 2
    END,
    p.last_name,
    p.first_name,
    p.player_id
LIMIT %(limit)s;
