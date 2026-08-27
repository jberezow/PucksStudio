"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { PlayerSearchResponse } from "@/components/player-types";
import { SiteHeader } from "@/components/site-header";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function PlayerSearch() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [data, setData] = useState<PlayerSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      setError(null);

      try {
        const parameters = new URLSearchParams({ q: query, role });
        const response = await fetch(`${apiUrl}/api/v1/players?${parameters}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Players could not be loaded");
        const result: PlayerSearchResponse = await response.json();
        if (!controller.signal.aborted) setData(result);
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name !== "AbortError") {
          setError(requestError.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 250 : 0);

    return () => {
      window.clearTimeout(timeout);
      request.current?.abort();
    };
  }, [query, role]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 py-5 sm:px-8 sm:py-6">
      <SiteHeader current="players" />

      <section className="player-search-hero">
        <div>
          <p className="eyebrow">Player archive</p>
          <h1>Skaters and goalies</h1>
          <p>Search player records, inspect event-derived season totals, and explore shot locations.</p>
        </div>
        <div className="player-search-controls">
          <label className="player-search-input">
            <span>Player name</span>
            <input
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name"
              type="search"
              value={query}
            />
          </label>
          <label className="player-role-filter">
            <span>Role</span>
            <select onChange={(event) => setRole(event.target.value)} value={role}>
              <option value="all">All players</option>
              <option value="skater">Skaters</option>
              <option value="goalie">Goalies</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel player-results" aria-busy={loading}>
        <div className="player-results-heading">
          <div>
            <p className="eyebrow">Directory</p>
            <h2>{query ? `Results for “${query}”` : "Browse players"}</h2>
          </div>
          {data && <span>{data.row_count} rows · {data.query_ms.toFixed(1)} ms</span>}
        </div>

        {error ? (
          <p className="player-message" role="alert">{error}</p>
        ) : loading && !data ? (
          <div className="player-result-grid">
            {Array.from({ length: 8 }, (_, index) => (
              <span className="skeleton player-result-skeleton" key={index} />
            ))}
          </div>
        ) : data?.players.length ? (
          <div className="player-result-grid">
            {data.players.map((player) => (
              <Link className="player-result-card" href={`/players/${player.player_id}`} key={player.player_id}>
                <span className="player-position">{player.position ?? "—"}</span>
                <span>
                  <strong>{player.first_name} {player.last_name}</strong>
                  <small>
                    {player.current_team_abbrev ?? "No current team"}
                    {player.shoots_catches ? ` · ${player.shoots_catches} handed` : ""}
                  </small>
                </span>
                <span aria-hidden="true" className="player-result-arrow">→</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="player-message">No players matched those filters.</p>
        )}
      </section>
    </main>
  );
}
