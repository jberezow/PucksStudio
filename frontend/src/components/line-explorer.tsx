"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import type {
  LineOptions,
  LineResponse,
  LineUnit,
} from "@/components/line-types";
import { PlayerPortrait } from "@/components/player-portrait";
import { apiUrl } from "@/lib/api";

const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const seasonName = (season: number) =>
  `${Math.floor(season / 10000)}–${String(season % 10000).slice(2)}`;
const statusNames: Record<string, string> = {
  available: "Available",
  partial: "Partial coverage",
  unsupported: "Unsupported era or competition",
  not_loaded: "No shifts stored",
  unavailable: "Source unavailable",
  failed: "Last fetch failed",
  loaded: "Loaded",
  not_final: "Game not final",
  insufficient_data: "Insufficient usable intervals",
  no_games: "No completed games",
};
async function failure(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.detail === "string"
    ? body.detail
    : "Line combinations could not be loaded. Check the selection and retry.";
}
function UnitCard({
  unit,
  season,
  gameType,
  rank,
  teamId,
}: {
  unit: LineUnit;
  season: number;
  gameType: number;
  rank: number;
  teamId: number;
}) {
  return (
    <article className="line-card">
      <div className="line-card-heading">
        <span>Most used · #{rank}</span>
        <strong>{time(unit.seconds)}</strong>
      </div>
      <div className="line-players">
        {unit.players.map((player) => (
          <Link
            key={player.player_id}
            href={`/players/${player.player_id}?season=${season}&game_type=${gameType}`}
          >
            <PlayerPortrait name={player.name} url={player.headshot_url} />
            <span>{player.name}</span>
          </Link>
        ))}
      </div>
      <div className="line-share">
        <span>
          {((unit.share ?? 0) * 100).toFixed(1)}% of reconstructed team 5-on-5
          time
        </span>
        <div>
          <i style={{ width: `${(unit.share ?? 0) * 100}%` }} />
        </div>
      </div>
      <p className="line-small">
        {unit.appearances} {unit.appearances === 1 ? "game" : "games"} ·{" "}
        {time(Math.round(unit.seconds_per_appearance))} per appearance ·{" "}
        {unit.deployments} deployments
      </p>
      <details>
        <summary>Usage by game &amp; interval evidence</summary>
        <p className="line-small">
          A deployment is a continuous shared interval. Brief changes count;
          player order does not assign left wing, center, or right wing.
        </p>
        <div className="line-evidence-scroll">
          <table>
            <caption>Shared five-on-five time by game</caption>
            <thead>
              <tr>
                <th>Game</th>
                <th>Time together</th>
              </tr>
            </thead>
            <tbody>
              {unit.games.map((game) => (
                <tr key={game.game_id}>
                  <td>
                    <Link
                      href={`/lines?game_id=${game.game_id}&team_id=${teamId}`}
                    >
                      {game.game_date} · {game.game_id}
                    </Link>
                  </td>
                  <td>{time(game.seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="line-small">
          {unit.evidence_truncated
            ? `First ${unit.evidence.length} contributing intervals (see game usage above):`
            : "Contributing intervals:"}
        </p>
        <ul className="line-evidence-list">
          {unit.evidence.map((interval) => (
            <li
              key={`${interval.game_id}-${interval.period}-${interval.start}`}
            >
              <Link
                href={`/?date=${interval.game_date}&game=${interval.game_id}`}
              >
                {interval.game_date}
              </Link>{" "}
              · P{interval.period} · {time(interval.start)}–{time(interval.end)}{" "}
              elapsed
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
export function LineExplorer({ query }: { query: string }) {
  const router = useRouter();
  const initial = new URLSearchParams(query);
  const [mode, setMode] = useState(initial.has("game_id") ? "game" : "season");
  const [options, setOptions] = useState<LineOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [data, setData] = useState<LineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(query));
  const [retry, setRetry] = useState(0);
  const [kind, setKind] = useState("forward");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/api/v1/lines/options`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await failure(response));
        return response.json() as Promise<LineOptions>;
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setOptions(result);
          setOptionsError(null);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setOptionsError(e.message);
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`${apiUrl}/api/v1/lines?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await failure(response));
        return response.json() as Promise<LineResponse>;
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError(null);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, retry]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of [
      "game_id",
      "season",
      "team_id",
      "game_type",
      "date_from",
      "date_to",
    ]) {
      const value = fields.get(key)?.toString();
      if (value) params.set(key, value);
    }
    if (params.toString() === query) {
      setLoading(true);
      setRetry((value) => value + 1);
    } else router.push(`/lines?${params}`);
  }
  const selectedTeam = data?.teams.find((t) => t.team_id === data.team_id);
  const units = kind === "forward" ? data?.forward_trios : data?.defense_pairs;
  const totalUnits =
    kind === "forward" ? data?.total_forward_trios : data?.total_defense_pairs;
  return (
    <AppShell current="lines">
      <section className="line-hero">
        <p className="eyebrow">Observed combinations</p>
        <h1>Who plays together?</h1>
        <p>
          Explore forward trios and defense pairs by shared five-on-five ice
          time.
        </p>
      </section>
      <form className="panel line-controls" onSubmit={submit}>
        <label>
          Explore
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="game">A game</option>
            <option value="season">A team season</option>
          </select>
        </label>
        {mode === "game" ? (
          <label>
            Game ID
            <input
              name="game_id"
              type="number"
              min="1"
              required
              defaultValue={initial.get("game_id") ?? ""}
              placeholder="2024021200"
            />
          </label>
        ) : (
          <>
            <label>
              Season
              <select
                name="season"
                required
                defaultValue={initial.get("season") ?? ""}
                key={options ? "loaded" : "loading"}
              >
                <option value="" disabled>
                  Select season
                </option>
                {options?.seasons.map((s) => (
                  <option key={s} value={s}>
                    {seasonName(s)}
                    {s < options.first_supported_season ? " · unsupported" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Competition
              <select
                name="game_type"
                defaultValue={initial.get("game_type") ?? "2"}
              >
                <option value="2">Regular season</option>
                <option value="3">Playoffs</option>
              </select>
            </label>
          </>
        )}
        <label>
          Team
          <select
            name="team_id"
            required={mode === "season"}
            defaultValue={initial.get("team_id") ?? ""}
            key={`team-${options ? "loaded" : "loading"}`}
          >
            <option value="">
              {mode === "game" ? "Home team" : "Select team"}
            </option>
            {options?.teams.map((t) => (
              <option key={t.team_id} value={t.team_id}>
                {t.name} ({t.abbreviation})
              </option>
            ))}
          </select>
        </label>
        {mode === "season" && (
          <>
            <label>
              From (optional)
              <input
                type="date"
                name="date_from"
                defaultValue={initial.get("date_from") ?? ""}
              />
            </label>
            <label>
              Through (optional)
              <input
                type="date"
                name="date_to"
                defaultValue={initial.get("date_to") ?? ""}
              />
            </label>
          </>
        )}
        <button className="line-primary" type="submit">
          Show combinations
        </button>
      </form>
      {optionsError && (
        <p className="coverage-warning" role="alert">
          {optionsError}{" "}
          <button onClick={() => setRetry((r) => r + 1)}>
            Retry team and season list
          </button>
        </p>
      )}
      {error ? (
        <div className="panel line-message" role="alert">
          <p>{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              setRetry((r) => r + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <section
          className="line-grid"
          aria-label="Loading combinations"
          aria-busy="true"
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton line-skeleton" />
          ))}
        </section>
      ) : data ? (
        <>
          <section className="panel line-overview" aria-live="polite">
            <div>
              <p className="eyebrow">
                {statusNames[data.status] ?? data.status}
              </p>
              <h2>
                {selectedTeam?.name ?? "Selected team"} ·{" "}
                {data.game_id
                  ? `Game ${data.game_id}`
                  : seasonName(data.season)}
              </h2>
            </div>
            {data.game_id && (
              <div className="line-team-switch" aria-label="Game team">
                {data.teams.map((team) => (
                  <button
                    key={team.team_id}
                    aria-pressed={team.team_id === data.team_id}
                    onClick={() =>
                      router.push(
                        `/lines?game_id=${data.game_id}&team_id=${team.team_id}`,
                      )
                    }
                  >
                    {team.abbreviation}
                  </button>
                ))}
              </div>
            )}
            <div className="line-metrics">
              <span>
                <strong>
                  {data.usable_games}/{data.expected_games}
                </strong>{" "}
                games with usable combinations
              </span>
              <span>
                <strong>{time(data.five_on_five_seconds)}</strong> reconstructed
                5-on-5
              </span>
              <span>
                <strong>{time(data.unclassified_seconds)}</strong> unclassified
                / excluded
              </span>
            </div>
            <p className="line-small">
              {data.loaded_games} games have stored shifts. Missing games are
              excluded from usage averages. Shares use reconstructed team
              five-on-five time, including nonstandard forward/defense
              compositions.
            </p>
            {data.status === "unsupported" && (
              <p className="coverage-warning">
                Shift analysis starts in 2010–11 and supports completed
                regular-season and playoff games.
              </p>
            )}
            {data.status === "partial" && (
              <p className="coverage-warning">
                These combinations describe the usable intervals only. Review
                game coverage below before comparing teams or seasons.
              </p>
            )}
            {data.status === "no_games" && (
              <p>
                No completed games match this team, season, competition, and
                date window.
              </p>
            )}
            {data.status === "unavailable" && (
              <p>
                No usable combinations are available for this selection. See
                game coverage for missing shifts, unsupported states, or
                unresolved intervals.
              </p>
            )}
          </section>
          <div className="line-tabs" aria-label="Combination type">
            <button
              aria-pressed={kind === "forward"}
              onClick={() => setKind("forward")}
            >
              Forward trios
            </button>
            <button
              aria-pressed={kind === "defense"}
              onClick={() => setKind("defense")}
            >
              Defense pairs
            </button>
            <span className="line-small">
              Showing {units?.length ?? 0} of {totalUnits ?? 0} observed
              combinations
            </span>
          </div>
          <section className="line-grid">
            {units?.map((unit, index) => (
              <UnitCard
                key={unit.players.map((p) => p.player_id).join("-")}
                unit={unit}
                season={data.season}
                gameType={data.game_type}
                teamId={data.team_id}
                rank={index + 1}
              />
            ))}
          </section>
          <details className="panel line-coverage">
            <summary>
              Game coverage and source quality ({data.expected_games} games)
            </summary>
            <p className="line-small">
              “No shifts stored” does not tell us whether an older loader
              attempted the game. Latest fetch outcomes are recorded by newer
              PucksData loaders. A failed or unavailable refresh can leave an
              older snapshot available.
            </p>
            <div className="line-evidence-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>Coverage</th>
                    <th>5-on-5</th>
                    <th>Latest attempt / snapshot</th>
                    <th>Quality notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.games.map((game) => (
                    <tr key={game.game_id}>
                      <td>
                        <Link
                          href={`/lines?game_id=${game.game_id}&team_id=${data.team_id}`}
                        >
                          {game.game_date}
                          <br />
                          {game.away_abbrev} @ {game.home_abbrev}
                        </Link>
                      </td>
                      <td>{statusNames[game.status] ?? game.status}</td>
                      <td>{time(game.five_on_five_seconds)}</td>
                      <td>
                        {game.fetch_status
                          ? `${statusNames[game.fetch_status] ?? game.fetch_status} · ${game.attempted_at?.slice(0, 10) ?? "unknown date"}`
                          : "No recorded attempt"}
                        <br />
                        Snapshot: {game.snapshot_at?.slice(0, 10) ?? "none"}
                      </td>
                      <td>
                        {Object.entries(game.issues).map(([name, count]) => (
                          <div key={name}>
                            {name.replaceAll("_", " ")}: {count}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="panel line-method">
            <summary>How to read these combinations</summary>
            <p>
              Both teams must have five identified skaters and one goalie.
              Normal units require three forwards and two defensemen. Power
              plays, penalty kills, and ambiguous states do not enter these
              cards. Overlapping rows for the same player count once; intervals
              use elapsed period time.
            </p>
            <p>
              Listed positions identify forward/defense roles, not where a
              player lined up. These are observed combinations, not tonight’s
              projected lines or a measure of effectiveness. Portraits may show
              a player’s current jersey.
            </p>
            <p className="line-small">
              Method {data.method} · {data.row_count.toLocaleString()} rows ·
              query {data.query_ms.toFixed(0)} ms · analysis{" "}
              {data.analysis_ms.toFixed(0)} ms
            </p>
          </details>
        </>
      ) : (
        <div className="panel line-message">
          <h2>Start with a game or team season</h2>
          <p>
            Choose a scope above. Shift coverage begins in 2010–11; games
            without usable source data remain visible as coverage gaps.
          </p>
        </div>
      )}
    </AppShell>
  );
}
