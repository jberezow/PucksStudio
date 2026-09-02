export type Verdict = "healthy" | "known_gaps" | "sync_overdue" | "attention";
export type Severity = "info" | "warning" | "critical";
export type GapKind = "actionable" | "acknowledged";

export type HealthReason = {
  code: string;
  severity: Severity;
  message: string;
  count: number | null;
};

export type DatasetSummary = {
  last_sync_at: string | null;
  last_sync_games: number | null;
  latest_completed_game_date: string | null;
  latest_event_game_date: string | null;
  completed_games: number;
  games_with_events: number;
  missing_event_games: number;
  goals_missing_shots: number;
  backfill_failed: number;
  backfill_pending: number;
  backfill_skipped: number;
  healthy: boolean;
  acknowledged_gaps: number;
  actionable_gaps: number;
};

export type SeasonHealth = {
  season: number;
  completed_games: number;
  games_with_events: number;
  missing_event_games: number;
  event_coverage_pct: number;
  goals_missing_shots: number;
  backfill_done: number;
  backfill_failed: number;
  backfill_skipped: number;
  backfill_pending: number;
  healthy: boolean;
  acknowledged_gaps: number;
  actionable_gaps: number;
};

export type DatasetHealthResponse = {
  generated_at: string;
  fetched_at: string;
  verdict: Verdict;
  sync_age_seconds: number | null;
  sync_overdue_hours: number;
  reasons: HealthReason[];
  summary: DatasetSummary;
  seasons: SeasonHealth[];
  query_ms: number;
  row_count: number;
};

export type MissingGame = {
  game_id: number;
  game_date: string;
  game_type: number;
  game_state: string | null;
  home_abbrev: string;
  away_abbrev: string;
  backfill_status: string | null;
  backfill_error: string | null;
  backfill_updated_at: string | null;
  gap_kind: GapKind;
};

export type MissingGamesResponse = {
  season: number;
  games: MissingGame[];
  acknowledged_gaps: number;
  actionable_gaps: number;
  query_ms: number;
  row_count: number;
};
