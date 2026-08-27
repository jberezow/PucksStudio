SELECT
    player_id,
    first_name,
    last_name,
    position,
    shoots_catches,
    current_team_abbrev,
    birth_date,
    height_cm,
    weight_kg,
    draft_year,
    draft_round,
    draft_pick,
    draft_team_abbrev,
    draft_overall_pick
FROM players
WHERE player_id = %(player_id)s;
