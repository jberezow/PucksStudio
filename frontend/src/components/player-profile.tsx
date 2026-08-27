"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { PlayerGameLog } from "@/components/player-game-log";
import { PlayerShotMap } from "@/components/player-shot-map";
import type { PlayerDetailResponse } from "@/components/player-types";
import { apiError, apiUrl } from "@/lib/api";
import { readableDate, seasonLabel } from "@/lib/format";

export function PlayerProfile({
  fromQuery,
  fromRole,
  playerId,
}: {
  fromQuery: string;
  fromRole: string;
  playerId: string;
}) {
  const [data, setData] = useState<PlayerDetailResponse | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [gameType, setGameType] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async (requestedSeason: number | null, requestedGameType: number) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const parameters = new URLSearchParams({ game_type: String(requestedGameType) });
      if (requestedSeason !== null) parameters.set("season", String(requestedSeason));
      const response = await fetch(`${apiUrl}/api/v1/players/${playerId}?${parameters}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(await apiError(response, "Player could not be loaded"));
      }
      const result: PlayerDetailResponse = await response.json();
      if (controller.signal.aborted) return;
      setData(result);
      setSeason(result.season);
      setGameType(result.game_type);
      const url = new URL(window.location.href);
      url.searchParams.set("season", String(result.season));
      url.searchParams.set("game_type", String(result.game_type));
      window.history.replaceState({}, "", url);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.name !== "AbortError") {
        setError(loadError.message);
      }
    } finally {
      if (request.current === controller) setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const requestedSeason = Number(parameters.get("season")) || null;
    const requestedGameType = Number(parameters.get("game_type")) || 2;
    const timeout = window.setTimeout(
      () => void load(requestedSeason, requestedGameType),
      0,
    );
    return () => {
      window.clearTimeout(timeout);
      request.current?.abort();
    };
  }, [load]);

  const player = data?.player;
  const summary = data?.role === "goalie" ? data.goalie_summary : data?.skater_summary;
  const directoryParameters = new URLSearchParams();
  if (fromQuery) directoryParameters.set("q", fromQuery);
  if (fromRole !== "all") directoryParameters.set("role", fromRole);
  const directoryHref = `/players${directoryParameters.size ? `?${directoryParameters}` : ""}`;
  const seasonIndex = data && season !== null ? data.seasons.indexOf(season) : -1;
  const newerSeason = seasonIndex > 0 ? data?.seasons[seasonIndex - 1] : undefined;
  const olderSeason =
    data && seasonIndex >= 0 && seasonIndex < data.seasons.length - 1
      ? data.seasons[seasonIndex + 1]
      : undefined;
  const percentageAvailable = data?.role === "goalie"
    ? data.goalie_summary?.save_percentage !== null
    : data?.skater_summary?.shooting_percentage !== null;
  const stats = data?.role === "goalie" && data.goalie_summary
    ? [
        ["Tracked games", data.goalie_summary.games_with_events],
        ["Saves", data.goalie_summary.saves],
        ["Goals against", data.goalie_summary.goals_against],
        ["Shots against", data.goalie_summary.shots_against],
        ["Save %", data.goalie_summary.save_percentage?.toFixed(3) ?? "–"],
      ]
    : data?.skater_summary
      ? [
          ["Tracked games", data.skater_summary.games_with_events],
          ["Goals", data.skater_summary.goals],
          ["Assists", data.skater_summary.assists],
          ["Points", data.skater_summary.points],
          [percentageAvailable ? "Shots" : "Tracked shots", data.skater_summary.shots],
          ["Shooting %", data.skater_summary.shooting_percentage?.toFixed(1) ?? "–"],
        ]
      : [];

  return (
    <AppShell current="players">
      {error && !data ? (
        <section className="panel player-message profile-error" role="alert">
          <p>{error}</p>
          <Link href={directoryHref}>Return to player search</Link>
        </section>
      ) : loading && !data ? (
        <section className="profile-loading">
          <span className="skeleton block h-36" />
          <span className="skeleton block h-72" />
        </section>
      ) : player && data && summary ? (
        <>
          <section className="player-profile-header">
            <div>
              <Link className="profile-back" href={directoryHref}>← Player directory</Link>
              <p className="eyebrow">{data.role === "goalie" ? "Goalie profile" : "Skater profile"}</p>
              <h1>{player.first_name} {player.last_name}</h1>
              <p>
                {[player.current_team_abbrev, player.position, player.shoots_catches ? `${player.shoots_catches} handed` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="profile-selectors">
              <form action="/players" className="profile-player-search">
                <label>
                  <span>Find another player</span>
                  <input aria-label="Find another player" name="q" placeholder="Player name" />
                </label>
              </form>
              <label>
                <span>Season</span>
                <span className="season-stepper">
                  <button
                    aria-label="Previous season"
                    disabled={loading || olderSeason === undefined}
                    onClick={() => olderSeason && void load(olderSeason, gameType)}
                    type="button"
                  >
                    ←
                  </button>
                  <select
                    disabled={loading}
                    onChange={(event) => void load(Number(event.target.value), gameType)}
                    value={season ?? data.season}
                  >
                    {data.seasons.map((value) => <option key={value} value={value}>{seasonLabel(value)}</option>)}
                  </select>
                  <button
                    aria-label="Next season"
                    disabled={loading || newerSeason === undefined}
                    onClick={() => newerSeason && void load(newerSeason, gameType)}
                    type="button"
                  >
                    →
                  </button>
                </span>
              </label>
              <label>
                <span>Competition</span>
                <select
                  disabled={loading}
                  onChange={(event) => void load(season, Number(event.target.value))}
                  value={gameType}
                >
                  <option value={1}>Preseason</option>
                  <option value={2}>Regular season</option>
                  <option value={3}>Postseason</option>
                </select>
              </label>
            </div>
          </section>

          {error && <div className="error-banner profile-refresh-error" role="alert">{error}</div>}

          <section className="profile-stat-grid" aria-busy={loading}>
            {stats.map(([label, value]) => (
              <div className="profile-stat panel" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>

          <section className="profile-grid">
            <div className="panel profile-bio">
              <div className="player-section-heading">
                <div><p className="eyebrow">Record</p><h2>Player details</h2></div>
              </div>
              <dl>
                <div><dt>Born</dt><dd>{player.birth_date ? readableDate(player.birth_date) : "—"}</dd></div>
                <div><dt>Height</dt><dd>{player.height_cm ? `${player.height_cm} cm` : "—"}</dd></div>
                <div><dt>Weight</dt><dd>{player.weight_kg ? `${player.weight_kg} kg` : "—"}</dd></div>
                <div><dt>Player ID</dt><dd>{player.player_id}</dd></div>
                <div>
                  <dt>Draft</dt>
                  <dd>
                    {player.draft_year
                      ? `${player.draft_year} · Round ${player.draft_round ?? "—"} · #${player.draft_overall_pick ?? player.draft_pick ?? "—"}`
                      : "Undrafted / unavailable"}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="panel profile-note">
              <p className="eyebrow">Data scope</p>
              <h2>Event-derived statistics</h2>
              <p>
                Totals reflect games where this player appears in PucksData&apos;s typed scoring,
                shooting, or goaltending events. They are traceable to source events, but are not
                a substitute for lineup, shift, or time-on-ice records.
              </p>
              {!percentageAvailable && (
                <p className="coverage-warning">
                  No tracked non-scoring outcomes are available for this profile. Attempt totals
                  are shown as tracked records and the derived percentage is suppressed.
                </p>
              )}
              <small>{data.row_count} mapped events · {data.query_ms.toFixed(1)} ms aggregate query time</small>
            </div>
          </section>

          <PlayerShotMap attempts={data.attempts} role={data.role} />

          <PlayerGameLog games={data.games} role={data.role} />
        </>
      ) : null}
    </AppShell>
  );
}
