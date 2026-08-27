export type PlayerSearchItem = {
  player_id: number;
  first_name: string;
  last_name: string;
  position: string | null;
  shoots_catches: string | null;
  current_team_abbrev: string | null;
};

export type PlayerSearchResponse = {
  players: PlayerSearchItem[];
  query_ms: number;
  row_count: number;
};

export type PlayerProfileData = PlayerSearchItem & {
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  draft_year: number | null;
  draft_round: number | null;
  draft_pick: number | null;
  draft_team_abbrev: string | null;
  draft_overall_pick: number | null;
};

export type PlayerGame = {
  game_id: number;
  game_date: string;
  game_type: number;
  team_abbrev: string | null;
  opponent_abbrev: string | null;
  team_score: number | null;
  opponent_score: number | null;
  goals: number | null;
  assists: number | null;
  points: number | null;
  shots: number | null;
  saves: number | null;
  goals_against: number | null;
  shots_against: number | null;
};

export type PlayerAttempt = {
  event_id: number;
  game_id: number;
  game_date: string;
  period: number;
  time_in_period: string;
  result: "goal" | "shot" | "goal-against" | "save";
  strength: string | null;
  x_coord: number | null;
  y_coord: number | null;
  shot_type: string | null;
  shooting_team_abbrev: string | null;
};

export type SkaterSummary = {
  games_with_events: number;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shooting_percentage: number | null;
};

export type GoalieSummary = {
  games_with_events: number;
  saves: number;
  goals_against: number;
  shots_against: number;
  save_percentage: number | null;
};

export type PlayerDetailResponse = {
  player: PlayerProfileData;
  role: "skater" | "goalie";
  season: number;
  game_type: number;
  seasons: number[];
  skater_summary: SkaterSummary | null;
  goalie_summary: GoalieSummary | null;
  games: PlayerGame[];
  attempts: PlayerAttempt[];
  query_ms: number;
  row_count: number;
};
