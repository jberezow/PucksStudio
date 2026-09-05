-- Seasons in which a player appears, from tracked events and from official
-- season totals.
--
-- The event side reads analytics.player_event_seasons, a rollup PucksData
-- maintains and refreshes after every backfill and sync. Deriving the same
-- list here meant searching six typed event tables for fourteen player roles
-- and joining every match through events to games to recover the season: about
-- 20,000 rows and 102,000 buffer pages read to return 21, and six sequential
-- scans of the games table. The cost was in the scans rather than the player,
-- so even a 1920s skater with almost no events took three seconds, and because
-- this query runs alongside the profile lookup it set the floor for the whole
-- response.
--
-- Event-derived and official seasons remain separate sources. They are unioned
-- here only to build the selector list, never to combine their figures.
SELECT season FROM analytics.player_event_seasons  WHERE player_id = %(player_id)s
UNION
SELECT season FROM analytics.official_skater_seasons WHERE player_id = %(player_id)s
UNION
SELECT season FROM analytics.official_goalie_seasons WHERE player_id = %(player_id)s
ORDER BY season DESC;
