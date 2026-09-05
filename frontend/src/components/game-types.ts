import type { CoverageEntry } from "@/components/coverage-types";

export type PlayoffContext = {
  round: number;
  series: number;
  game: number;
};

export type Game = {
  game_id: number;
  game_date: string;
  game_type: number;
  game_state: string | null;
  venue: string | null;
  home_abbrev: string;
  home_name: string;
  home_score: number | null;
  away_abbrev: string;
  away_name: string;
  away_score: number | null;
  event_count: number;
  playoff: PlayoffContext | null;
};

export type GameEvent = {
  event_id: number;
  event_id_in_game: number;
  period: number;
  period_type: string;
  time_in_period: string;
  event_type: string;
  owner_abbrev: string | null;
  description: string;
  strength: string | null;
  strength_source: string;
  zone_code: string | null;
  x_coord: number | null;
  y_coord: number | null;
  goal_shot_type: string | null;
  scorer_id: number | null;
  scorer_name: string | null;
  assist1_id: number | null;
  assist1_name: string | null;
  assist2_id: number | null;
  assist2_name: string | null;
  shooter_id: number | null;
  shooter_name: string | null;
  shot_type: string | null;
  duration_minutes: number | null;
};

export type TeamGameStats = {
  abbreviation: string;
  goals: number | null;
  shots_on_goal: number | null;
  hits: number | null;
  penalty_minutes: number | null;
  faceoff_wins: number | null;
};

export type PeriodScore = {
  period: number;
  period_type: string;
  away_goals: number;
  home_goals: number;
};

export type GamesResponse = {
  date: string | null;
  previous_date: string | null;
  next_date: string | null;
  games: Game[];
  query_ms: number;
  row_count: number;
};

export type GameDetailResponse = {
  coverage: CoverageEntry[];
  caveats: string[];
  game: Omit<Game, "event_count"> & {
    season: number;
    venue_location: string | null;
  };
  summary: {
    away: TeamGameStats;
    home: TeamGameStats;
    periods: PeriodScore[];
  };
  events: GameEvent[];
  query_ms: number;
  row_count: number;
};
