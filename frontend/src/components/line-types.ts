export type LineTeam = { team_id: number; abbreviation: string; name: string };
export type LineOptions = {
  teams: LineTeam[];
  seasons: number[];
  first_supported_season: number;
};
export type LineUnit = {
  kind: "forward" | "defense";
  players: {
    player_id: number;
    name: string;
    role: string;
    headshot_url: string | null;
  }[];
  seconds: number;
  share: number | null;
  appearances: number;
  seconds_per_appearance: number;
  deployments: number;
  games: { game_id: number; game_date: string; seconds: number }[];
  evidence: {
    game_id: number;
    game_date: string;
    period: number;
    start: number;
    end: number;
  }[];
  evidence_truncated: boolean;
};
export type LineGame = {
  game_id: number;
  game_date: string;
  home_abbrev: string;
  away_abbrev: string;
  status: string;
  fetch_status: string | null;
  attempted_at: string | null;
  snapshot_at: string | null;
  raw_rows: number;
  five_on_five_seconds: number;
  classified_seconds: number;
  unclassified_seconds: number;
  other_strength_seconds: number;
  issues: Record<string, number>;
};
export type LineResponse = {
  method: string;
  status: string;
  team_id: number;
  teams: LineTeam[];
  season: number;
  game_id: number | null;
  game_type: number;
  expected_games: number;
  loaded_games: number;
  usable_games: number;
  five_on_five_seconds: number;
  classified_seconds: number;
  unclassified_seconds: number;
  forward_trios: LineUnit[];
  defense_pairs: LineUnit[];
  total_forward_trios: number;
  total_defense_pairs: number;
  games: LineGame[];
  query_ms: number;
  analysis_ms: number;
  row_count: number;
};
