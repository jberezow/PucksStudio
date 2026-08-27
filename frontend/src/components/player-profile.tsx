"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { PlayerShotMap } from "@/components/player-shot-map";
import type { PlayerDetailResponse, PlayerGame } from "@/components/player-types";
import { SiteHeader } from "@/components/site-header";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function seasonLabel(season: number) {
  const value = String(season);
  return `${value.slice(0, 4)}–${value.slice(6)}`;
}

function readableDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function scoreLine(game: PlayerGame) {
  if (game.team_score === null || game.opponent_score === null) return "Score unavailable";
  const result = game.team_score > game.opponent_score ? "W" : game.team_score < game.opponent_score ? "L" : "T";
  return `${result} ${game.team_score}–${game.opponent_score}`;
}

export function PlayerProfile({ playerId }: { playerId: string }) {
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
        const body = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(body.detail ?? "Player could not be loaded");
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
          ["Shots", data.skater_summary.shots],
          ["Shooting %", data.skater_summary.shooting_percentage?.toFixed(1) ?? "–"],
        ]
      : [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 py-5 sm:px-8 sm:py-6">
      <SiteHeader current="players" />

      {error && !data ? (
        <section className="panel player-message profile-error" role="alert">
          <p>{error}</p>
          <Link href="/players">Return to player search</Link>
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
              <Link className="profile-back" href="/players">← Player directory</Link>
              <p className="eyebrow">{data.role === "goalie" ? "Goalie profile" : "Skater profile"}</p>
              <h1>{player.first_name} {player.last_name}</h1>
              <p>
                {[player.current_team_abbrev, player.position, player.shoots_catches ? `${player.shoots_catches} handed` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="profile-selectors">
              <label>
                <span>Season</span>
                <select
                  disabled={loading}
                  onChange={(event) => void load(Number(event.target.value), gameType)}
                  value={season ?? data.season}
                >
                  {data.seasons.map((value) => <option key={value} value={value}>{seasonLabel(value)}</option>)}
                </select>
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
              <small>{data.row_count} mapped events · {data.query_ms.toFixed(1)} ms aggregate query time</small>
            </div>
          </section>

          <PlayerShotMap attempts={data.attempts} role={data.role} />

          <section className="panel player-game-log">
            <div className="player-section-heading">
              <div><p className="eyebrow">Event appearances</p><h2>Game log</h2></div>
              <span>{data.games.length} games</span>
            </div>
            <div className="game-log-table" role="table" aria-label="Player game log">
              <div className={`game-log-row game-log-head ${data.role === "goalie" ? "game-log-goalie" : ""}`} role="row">
                <span>Date</span><span>Matchup</span><span>Result</span>
                {data.role === "goalie"
                  ? <><span>SV</span><span>GA</span><span>SA</span></>
                  : <><span>G</span><span>A</span><span>PTS</span><span>S</span></>}
              </div>
              {data.games.map((game) => (
                <Link
                  className={`game-log-row ${data.role === "goalie" ? "game-log-goalie" : ""}`}
                  href={`/?date=${game.game_date}&game=${game.game_id}`}
                  key={game.game_id}
                  role="row"
                >
                  <span>{readableDate(game.game_date)}</span>
                  <strong>{game.team_abbrev ?? "—"} vs {game.opponent_abbrev ?? "—"}</strong>
                  <span>{scoreLine(game)}</span>
                  {data.role === "goalie"
                    ? <><span>{game.saves}</span><span>{game.goals_against}</span><span>{game.shots_against}</span></>
                    : <><span>{game.goals}</span><span>{game.assists}</span><span>{game.points}</span><span>{game.shots}</span></>}
                </Link>
              ))}
              {data.games.length === 0 && <p className="player-message">No tracked events for this season and competition.</p>}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
