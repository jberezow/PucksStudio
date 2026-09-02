"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import type {
  DatasetHealthResponse,
  MissingGamesResponse,
  SeasonHealth,
  Severity,
  Verdict,
} from "@/components/health-types";
import type { SiteStatus, StatusTone } from "@/components/site-header";
import { apiError, apiUrl } from "@/lib/api";
import { durationLabel, readableDate, readableDateTime, seasonLabel } from "@/lib/format";

type LoadState = "loading" | "ready" | "unavailable" | "error";

const verdictPresentation: Record<Verdict, { label: string; tone: StatusTone; summary: string }> = {
  healthy: {
    label: "Healthy",
    tone: "ok",
    summary: "Every completed game has events and the last sync ran on time.",
  },
  known_gaps: {
    label: "Healthy with known gaps",
    tone: "info",
    summary: "The only missing games are ones the ingestion pipeline has already acknowledged.",
  },
  sync_overdue: {
    label: "Sync overdue",
    tone: "warn",
    summary: "The data is consistent, but the pipeline has not reported a successful run in time.",
  },
  attention: {
    label: "Attention required",
    tone: "warn",
    summary: "Some completed games or ingestion checkpoints need an operator.",
  },
};

const severityTone: Record<Severity, StatusTone> = {
  info: "info",
  warning: "warn",
  critical: "bad",
};

const numberFormat = new Intl.NumberFormat("en-US");

function count(value: number | null | undefined) {
  return value == null ? "—" : numberFormat.format(value);
}

function coverage(withEvents: number, completed: number) {
  if (completed === 0) return 100;
  return (withEvents / completed) * 100;
}

function coverageLabel(value: number) {
  return value >= 100 ? "100%" : `${value.toFixed(value >= 99.95 ? 3 : 2)}%`;
}

function gameTypeLabel(gameType: number) {
  const labels: Record<number, string> = {
    1: "Preseason",
    2: "Regular",
    3: "Playoff",
    4: "All-Star",
  };
  return labels[gameType] ?? `Type ${gameType}`;
}

type SeasonStanding = "attention" | "known" | "healthy";

function seasonStanding(season: SeasonHealth): SeasonStanding {
  if (
    season.actionable_gaps > 0 ||
    season.backfill_failed > 0 ||
    season.backfill_pending > 0 ||
    season.goals_missing_shots > 0
  ) {
    return "attention";
  }
  if (!season.healthy || season.acknowledged_gaps > 0) return "known";
  return "healthy";
}

const standingRank: Record<SeasonStanding, number> = { attention: 0, known: 1, healthy: 2 };

function orderSeasons(seasons: SeasonHealth[]) {
  return [...seasons].sort((a, b) => {
    const difference = standingRank[seasonStanding(a)] - standingRank[seasonStanding(b)];
    return difference !== 0 ? difference : b.season - a.season;
  });
}

function defaultSeason(seasons: SeasonHealth[]) {
  return orderSeasons(seasons).find((season) => seasonStanding(season) !== "healthy")?.season ?? null;
}

function seasonTag(season: SeasonHealth): { label: string; tone: StatusTone } {
  if (season.goals_missing_shots > 0) return { label: "Inconsistent", tone: "bad" };
  if (season.backfill_failed > 0) return { label: "Failed", tone: "bad" };
  if (season.actionable_gaps > 0) return { label: "Gaps", tone: "warn" };
  if (season.backfill_pending > 0) return { label: "Pending", tone: "warn" };
  if (seasonStanding(season) === "known") return { label: "Known gaps", tone: "info" };
  return { label: "Healthy", tone: "ok" };
}

function backfillTag(status: string | null): { label: string; tone: StatusTone } {
  switch (status) {
    case "failed":
      return { label: "Failed", tone: "bad" };
    case "pending":
      return { label: "Pending", tone: "warn" };
    case "done":
      return { label: "Done", tone: "info" };
    case "skipped":
      return { label: "Skipped", tone: "info" };
    default:
      return { label: "No checkpoint", tone: "warn" };
  }
}

export function DatasetHealth({ initialSeason }: { initialSeason: number | null }) {
  const [data, setData] = useState<DatasetHealthResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(initialSeason);
  const [showHealthy, setShowHealthy] = useState(false);
  const [missing, setMissing] = useState<MissingGamesResponse | null>(null);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingError, setMissingError] = useState<string | null>(null);
  const datasetRequest = useRef<AbortController | null>(null);
  const missingRequest = useRef<AbortController | null>(null);

  const loadDataset = useCallback(async () => {
    datasetRequest.current?.abort();
    const controller = new AbortController();
    datasetRequest.current = controller;
    setState("loading");
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/observability/dataset`, {
        signal: controller.signal,
      });
      if (response.status === 503) {
        setError(await apiError(response, "Observability views are unavailable"));
        if (!controller.signal.aborted) setState("unavailable");
        return;
      }
      if (!response.ok) {
        throw new Error(await apiError(response, "Dataset health could not be loaded"));
      }
      const result: DatasetHealthResponse = await response.json();
      if (!controller.signal.aborted) {
        setData(result);
        setState("ready");
        setSelectedSeason((current) =>
          current !== null && result.seasons.some((season) => season.season === current)
            ? current
            : defaultSeason(result.seasons),
        );
      }
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name !== "AbortError") {
        setError(requestError.message);
        setState("error");
      }
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadDataset(), 0);
    return () => {
      window.clearTimeout(timeout);
      datasetRequest.current?.abort();
    };
  }, [loadDataset]);

  const orderedSeasons = useMemo(() => (data ? orderSeasons(data.seasons) : []), [data]);
  const flaggedSeasons = orderedSeasons.filter((season) => seasonStanding(season) !== "healthy");
  const healthySeasons = orderedSeasons.filter((season) => seasonStanding(season) === "healthy");
  // The selected row stays visible even when healthy seasons are collapsed.
  const visibleSeasons = showHealthy
    ? orderedSeasons
    : orderedSeasons.filter(
        (season) => seasonStanding(season) !== "healthy" || season.season === selectedSeason,
      );

  const loadMissing = useCallback(async (season: number | null) => {
    missingRequest.current?.abort();
    if (season === null) {
      setMissing(null);
      return;
    }
    const controller = new AbortController();
    missingRequest.current = controller;
    setMissingLoading(true);
    setMissingError(null);
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/observability/seasons/${season}/missing-games`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(await apiError(response, "Missing games could not be loaded"));
      }
      const result: MissingGamesResponse = await response.json();
      if (!controller.signal.aborted) setMissing(result);
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name !== "AbortError") {
        setMissingError(requestError.message);
      }
    } finally {
      if (!controller.signal.aborted) setMissingLoading(false);
    }
  }, []);

  useEffect(() => {
    const pageUrl = new URL(window.location.href);
    if (selectedSeason !== null) pageUrl.searchParams.set("season", String(selectedSeason));
    else pageUrl.searchParams.delete("season");
    window.history.replaceState({}, "", pageUrl);

    const timeout = window.setTimeout(() => void loadMissing(selectedSeason), 0);
    return () => {
      window.clearTimeout(timeout);
      missingRequest.current?.abort();
    };
  }, [selectedSeason, loadMissing]);

  const verdict = data ? verdictPresentation[data.verdict] : null;
  const headerStatus: SiteStatus | undefined =
    state === "unavailable"
      ? { label: "Health unavailable", tone: "bad" }
      : verdict
        ? { label: verdict.label, tone: verdict.tone }
        : undefined;

  const summary = data?.summary;
  const overdueSeconds = data ? data.sync_overdue_hours * 3600 : 0;
  const syncOverdue = data?.sync_age_seconds == null || data.sync_age_seconds >= overdueSeconds;
  const eventsTrail =
    summary?.latest_completed_game_date != null &&
    summary.latest_event_game_date !== summary.latest_completed_game_date;
  const datasetCoverage = summary ? coverage(summary.games_with_events, summary.completed_games) : 0;
  const selected = data?.seasons.find((season) => season.season === selectedSeason) ?? null;

  return (
    <AppShell current="health" status={headerStatus}>
      <section className="health-hero">
        <div>
          <p className="eyebrow">Dataset health</p>
          <h1>Coverage and freshness</h1>
          <p>
            Read straight from PucksData&apos;s observability views: whether every completed game
            has play-by-play, whether goals reconcile with shots, and when the pipeline last
            reported in.
          </p>
        </div>
        <div className="health-hero-actions">
          <button
            className="health-refresh"
            disabled={state === "loading"}
            onClick={() => void loadDataset()}
            type="button"
          >
            {state === "loading" ? "Refreshing…" : "Refresh"}
          </button>
          {data && <span className="metric">as of {readableDateTime(data.fetched_at)}</span>}
        </div>
      </section>

      {state === "unavailable" && (
        <section className="panel health-unavailable" role="alert">
          <p className="eyebrow">Unavailable</p>
          <h2>PucksStudio cannot read the observability views</h2>
          <p>{error}</p>
          <button className="retry-button" onClick={() => void loadDataset()} type="button">
            Try again
          </button>
        </section>
      )}

      {state === "error" && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => void loadDataset()} type="button">
            Retry
          </button>
        </div>
      )}

      {state === "loading" && !data && (
        <div className="health-layout" aria-busy="true">
          <span className="skeleton health-skeleton-verdict" />
          <span className="skeleton health-skeleton-kpis" />
          <div className="health-columns">
            <span className="skeleton health-skeleton-table" />
            <span className="skeleton health-skeleton-table" />
          </div>
        </div>
      )}

      {data && summary && verdict && (
        <div className="health-layout" aria-busy={state === "loading"}>
          <section className="panel health-verdict">
            <div className="health-verdict-lead">
              <span className={`health-pill health-tone-${verdict.tone}`}>
                <i aria-hidden="true" />
                {verdict.label}
              </span>
              <p>{verdict.summary}</p>
            </div>
            <dl className="health-facts">
              <div>
                <dt>Last successful sync</dt>
                <dd>{summary.last_sync_at ? readableDateTime(summary.last_sync_at) : "Never"}</dd>
                <small className={syncOverdue ? "health-warn" : undefined}>
                  {data.sync_age_seconds == null
                    ? "No sync recorded"
                    : `${durationLabel(data.sync_age_seconds)} ago · expected within ${data.sync_overdue_hours} h`}
                </small>
              </div>
              <div>
                <dt>Latest completed game</dt>
                <dd>
                  {summary.latest_completed_game_date
                    ? readableDate(summary.latest_completed_game_date)
                    : "—"}
                </dd>
                <small>Regular season and playoffs</small>
              </div>
              <div>
                <dt>Latest game with events</dt>
                <dd>
                  {summary.latest_event_game_date
                    ? readableDate(summary.latest_event_game_date)
                    : "—"}
                </dd>
                <small className={eventsTrail ? "health-warn" : undefined}>
                  {eventsTrail ? "Trails the schedule" : "Matches the schedule"}
                </small>
              </div>
              <div>
                <dt>Games in last sync</dt>
                <dd>{count(summary.last_sync_games)}</dd>
                <small>
                  {summary.last_sync_games === 0 ? "Nothing new to ingest" : "Ingested by the run"}
                </small>
              </div>
            </dl>
            {data.reasons.length > 0 && (
              <ul className="health-reasons">
                {data.reasons.map((reason) => (
                  <li
                    className={`health-reason health-tone-${severityTone[reason.severity]}`}
                    key={reason.code}
                  >
                    <i aria-hidden="true" />
                    {reason.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel health-kpis">
            <div className="health-kpi">
              <p>Completed games</p>
              <strong>{count(summary.completed_games)}</strong>
              <small>{count(data.row_count)} seasons</small>
            </div>
            <div className="health-kpi">
              <p>Event coverage</p>
              <strong className={datasetCoverage >= 100 ? "health-good" : "health-warn"}>
                {coverageLabel(datasetCoverage)}
              </strong>
              <small>{count(summary.games_with_events)} games with events</small>
            </div>
            <div className="health-kpi">
              <p>Missing events</p>
              <strong
                className={
                  summary.actionable_gaps > 0
                    ? "health-warn"
                    : summary.missing_event_games > 0
                      ? "health-info"
                      : "health-good"
                }
              >
                {count(summary.missing_event_games)}
              </strong>
              <small>
                {count(summary.actionable_gaps)} actionable · {count(summary.acknowledged_gaps)}{" "}
                acknowledged
              </small>
            </div>
            <div className="health-kpi">
              <p>Goals without shots</p>
              <strong className={summary.goals_missing_shots > 0 ? "health-bad" : "health-good"}>
                {count(summary.goals_missing_shots)}
              </strong>
              <small>{summary.goals_missing_shots > 0 ? "Needs repair" : "Consistent"}</small>
            </div>
            <div className="health-kpi">
              <p>Backfill failed</p>
              <strong className={summary.backfill_failed > 0 ? "health-bad" : "health-good"}>
                {count(summary.backfill_failed)}
              </strong>
              <small>
                {count(summary.backfill_pending)} pending · {count(summary.backfill_skipped)}{" "}
                skipped
              </small>
            </div>
          </section>

          <div className="health-columns">
            <section className="panel health-seasons">
              <div className="panel-heading health-panel-heading">
                <div>
                  <span>Seasons</span>
                  <small>
                    {flaggedSeasons.length === 0
                      ? "Every season is fully covered"
                      : `${flaggedSeasons.length} of ${data.seasons.length} need a look`}
                  </small>
                </div>
                {healthySeasons.length > 0 && (
                  <button
                    className={`filter-button${showHealthy ? " filter-button-active" : ""}`}
                    onClick={() => setShowHealthy((value) => !value)}
                    type="button"
                  >
                    {showHealthy ? "Hide" : "Show"} healthy
                    <span>{healthySeasons.length}</span>
                  </button>
                )}
              </div>
              <div className="health-table-wrap">
                <table className="health-table">
                  <thead>
                    <tr>
                      <th scope="col">Season</th>
                      <th scope="col">Completed</th>
                      <th scope="col">With events</th>
                      <th scope="col">Coverage</th>
                      <th scope="col">Goals w/o shots</th>
                      <th scope="col">Failed</th>
                      <th scope="col">Pending</th>
                      <th scope="col">Skipped</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSeasons.map((season) => {
                      const tag = seasonTag(season);
                      const pct = coverage(season.games_with_events, season.completed_games);
                      const active = season.season === selectedSeason;
                      return (
                        <tr
                          aria-selected={active}
                          className={active ? "health-row-active" : undefined}
                          key={season.season}
                          onClick={() => setSelectedSeason(season.season)}
                        >
                          <td>
                            <button
                              className="health-season-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedSeason(season.season);
                              }}
                              type="button"
                            >
                              {seasonLabel(season.season)}
                            </button>
                          </td>
                          <td>{count(season.completed_games)}</td>
                          <td>{count(season.games_with_events)}</td>
                          <td>
                            <span className="health-coverage">
                              <span className="health-coverage-track">
                                <span
                                  className={`health-coverage-fill${pct < 100 ? " health-coverage-short" : ""}`}
                                  style={{ width: `${Math.max(pct, 2)}%` }}
                                />
                              </span>
                              {coverageLabel(pct)}
                            </span>
                          </td>
                          <td className={season.goals_missing_shots > 0 ? "health-bad" : undefined}>
                            {count(season.goals_missing_shots)}
                          </td>
                          <td className={season.backfill_failed > 0 ? "health-bad" : undefined}>
                            {count(season.backfill_failed)}
                          </td>
                          <td className={season.backfill_pending > 0 ? "health-warn" : undefined}>
                            {count(season.backfill_pending)}
                          </td>
                          <td>{count(season.backfill_skipped)}</td>
                          <td>
                            <span className={`health-tag health-tone-${tag.tone}`}>{tag.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleSeasons.length === 0 && (
                      <tr>
                        <td className="health-table-empty" colSpan={9}>
                          Every season is fully covered. Show healthy seasons to browse them.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel health-missing" aria-busy={missingLoading}>
              <div className="panel-heading health-panel-heading">
                <div>
                  <span>
                    {selected ? `${seasonLabel(selected.season)} · missing events` : "Missing events"}
                  </span>
                  <small>
                    {missing && selected
                      ? missing.games.length === 0
                        ? "Every completed game has events"
                        : `${count(missing.actionable_gaps)} actionable · ${count(missing.acknowledged_gaps)} acknowledged`
                      : "Select a season to list its games without play-by-play"}
                  </small>
                </div>
                {missing && (
                  <span className="metric">
                    {missing.row_count} rows · {missing.query_ms.toFixed(1)} ms
                  </span>
                )}
              </div>

              {missingError ? (
                <p className="health-message" role="alert">
                  {missingError}
                </p>
              ) : missingLoading && !missing ? (
                <div className="health-missing-skeleton">
                  {Array.from({ length: 4 }, (_, index) => (
                    <span className="skeleton" key={index} />
                  ))}
                </div>
              ) : !selected ? (
                <p className="health-message">Select a season to inspect its gaps.</p>
              ) : missing && missing.games.length === 0 ? (
                <p className="health-message">
                  Every completed game in {seasonLabel(selected.season)} has play-by-play events.
                </p>
              ) : missing ? (
                <div className="health-table-wrap">
                  <table className="health-table health-missing-table">
                    <thead>
                      <tr>
                        <th scope="col">Game</th>
                        <th scope="col">Date</th>
                        <th scope="col">Type</th>
                        <th scope="col">Backfill</th>
                        <th scope="col">Last error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missing.games.map((game) => {
                        const tag = backfillTag(game.backfill_status);
                        return (
                          <tr key={game.game_id}>
                            <td>
                              <Link
                                className="health-game-link"
                                href={`/?date=${game.game_date}&game=${game.game_id}`}
                              >
                                {game.away_abbrev} @ {game.home_abbrev}
                              </Link>
                              <small>{game.game_id}</small>
                            </td>
                            <td>{readableDate(game.game_date)}</td>
                            <td>{gameTypeLabel(game.game_type)}</td>
                            <td>
                              <span className={`health-tag health-tone-${tag.tone}`}>
                                {tag.label}
                              </span>
                            </td>
                            <td className="health-error-cell">
                              {game.backfill_error ?? (
                                <span className="health-dim">
                                  {game.gap_kind === "acknowledged"
                                    ? "Acknowledged, will not retry"
                                    : "—"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </div>

          <footer className="health-footer">
            <span>
              Views: <b>dataset_health</b> · <b>season_health</b>
            </span>
            <span>
              <b>{data.row_count} seasons</b> · <b>{data.query_ms.toFixed(1)} ms</b> query time ·
              cached up to 60 s
            </span>
          </footer>
        </div>
      )}
    </AppShell>
  );
}
