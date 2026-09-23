SELECT DISTINCT season FROM games
WHERE game_type IN (2, 3) AND game_state IN ('OFF', 'OVER', 'FINAL')
ORDER BY season DESC;
