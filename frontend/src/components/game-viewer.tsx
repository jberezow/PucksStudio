"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import type {
  Game,
  GameDetailResponse,
  GameEvent,
  GamesResponse,
  PeriodScore,
  PlayoffContext,
} from "@/components/game-types";
import { RinkView } from "@/components/rink-view";
import { SchedulePicker } from "@/components/schedule-picker";
import { apiError, apiUrl } from "@/lib/api";
import { readableDate } from "@/lib/format";

type HistoryMode = "none" | "push" | "replace";

const eventFilters = ["all", "goal", "penalty", "shot-on-goal", "hit", "faceoff"];

function score(value: number | null, hasEvents = true) {
  return hasEvents ? (value ?? "–") : "–";
}

function gameStatus(gameState: string | null, gameType: number, eventCount: number) {
  if (gameType === 3 && eventCount === 0) return "Not played";
  return gameState ?? "State unavailable";
}

function playoffLabel(playoff: PlayoffContext | null) {
  return playoff ? `Game ${playoff.game} of 7` : null;
}

function periodLabel(period: PeriodScore | GameEvent) {
  if (period.period_type === "REG") return `P${period.period}`;
  if (period.period_type === "OT") return period.period > 4 ? `OT${period.period - 3}` : "OT";
  return period.period_type;
}

function updateUrl(date: string, gameId: number | null, team: string, mode: HistoryMode) {
  if (mode === "none") return;
  const url = new URL(window.location.href);
  if (date) url.searchParams.set("date", date);
  else url.searchParams.delete("date");
  if (gameId !== null) url.searchParams.set("game", String(gameId));
  else url.searchParams.delete("game");
  if (team) url.searchParams.set("team", team);
  else url.searchParams.delete("team");
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
}

function EventDetails({ event }: { event: GameEvent }) {
  const playerId = event.scorer_id ?? event.shooter_id;
  const playerName = event.scorer_name ?? event.shooter_name;
  const participants = [
    {
      id: playerId,
      label: event.scorer_id ? "Scorer" : "Shooter",
      name: playerName,
    },
    { id: event.assist1_id, label: "Primary assist", name: event.assist1_name },
    { id: event.assist2_id, label: "Secondary assist", name: event.assist2_name },
  ].filter(
    (participant): participant is { id: number; label: string; name: string } =>
      participant.id !== null && Boolean(participant.name),
  );
  const details = [
    ["Source event", String(event.event_id)],
    ["In-game ID", String(event.event_id_in_game)],
    ["Team", event.owner_abbrev],
    ["Strength", event.strength?.toUpperCase()],
    ["Zone", event.zone_code],
    [
      "Coordinates",
      event.x_coord !== null && event.y_coord !== null ? `${event.x_coord}, ${event.y_coord}` : null,
    ],
    ["Shot type", event.goal_shot_type ?? event.shot_type],
    ["Penalty", event.duration_minutes !== null ? `${event.duration_minutes} minutes` : null],
  ].filter((detail): detail is [string, string] => Boolean(detail[1]));

  return (
    <div className="event-details">
      {details.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {participants.map((participant) => (
        <div key={participant.label}>
          <dt>{participant.label}</dt>
          <dd>
            <Link className="event-player-link" href={`/players/${participant.id}`}>
              {participant.name}
            </Link>
          </dd>
        </div>
      ))}
    </div>
  );
}

export function GameViewer() {
  const [date, setDate] = useState("");
  const [previousDate, setPreviousDate] = useState<string | null>(null);
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [team, setTeam] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const [detail, setDetail] = useState<GameDetailResponse | null>(null);
  const [filter, setFilter] = useState("all");
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);
  const [listMeta, setListMeta] = useState({ query_ms: 0, row_count: 0 });
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const gamesRequest = useRef<AbortController | null>(null);

  const loadGames = useCallback(
    async (
      requestedDate?: string,
      requestedGame?: number | null,
      historyMode: HistoryMode = "push",
      requestedTeam = "",
    ) => {
      gamesRequest.current?.abort();
      const controller = new AbortController();
      gamesRequest.current = controller;
      setLoadingGames(true);
      setListError(null);

      try {
        const parameters = new URLSearchParams();
        if (requestedDate) parameters.set("date", requestedDate);
        if (requestedTeam) parameters.set("team", requestedTeam);
        const suffix = parameters.size ? `?${parameters}` : "";
        const response = await fetch(`${apiUrl}/api/v1/games${suffix}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(await apiError(response, "Games could not be loaded"));
        }

        const data: GamesResponse = await response.json();
        if (controller.signal.aborted) return;

        const selectedDate = data.date ?? requestedDate ?? "";
        const chosen =
          data.games.find((game) => game.game_id === requestedGame) ?? data.games[0] ?? null;

        setDate(selectedDate);
        setPreviousDate(data.previous_date);
        setNextDate(data.next_date);
        setTeam(requestedTeam);
        setGames(data.games);
        setListMeta({ query_ms: data.query_ms, row_count: data.row_count });
        setFilter("all");
        setExpandedEvent(null);
        setDetail(null);
        setDetailError(null);
        setLoadingDetail(chosen !== null);
        setSelectedGame(chosen?.game_id ?? null);
        updateUrl(selectedDate, chosen?.game_id ?? null, requestedTeam, historyMode);
      } catch (caught) {
        if (caught instanceof Error && caught.name !== "AbortError") {
          setListError(caught.message);
        }
      } finally {
        if (gamesRequest.current === controller) setLoadingGames(false);
      }
    },
    [],
  );

  useEffect(() => {
    const initial = () => {
      const parameters = new URLSearchParams(window.location.search);
      const requestedDate = parameters.get("date") ?? undefined;
      const gameValue = Number(parameters.get("game"));
      const requestedGame = Number.isSafeInteger(gameValue) && gameValue > 0 ? gameValue : null;
      const requestedTeam = parameters.get("team")?.toUpperCase() ?? "";
      void loadGames(requestedDate, requestedGame, "replace", requestedTeam);
    };
    const timeout = window.setTimeout(initial, 0);
    const handleHistory = () => initial();
    window.addEventListener("popstate", handleHistory);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("popstate", handleHistory);
      gamesRequest.current?.abort();
    };
  }, [loadGames]);

  useEffect(() => {
    if (selectedGame === null) return;
    const controller = new AbortController();
    fetch(`${apiUrl}/api/v1/games/${selectedGame}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await apiError(response, "Game details could not be loaded"));
        }
        return response.json() as Promise<GameDetailResponse>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch((caught) => {
        if (caught instanceof Error && caught.name !== "AbortError") {
          setDetailError(caught.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDetail(false);
      });
    return () => controller.abort();
  }, [selectedGame]);

  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of detail?.events ?? []) {
      const key = event.event_type.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [detail]);

  const visibleEvents = useMemo(() => {
    if (!detail || filter === "all") return detail?.events ?? [];
    return detail.events.filter((event) => event.event_type.toLowerCase() === filter);
  }, [detail, filter]);

  const selected = detail?.game;

  function chooseGame(gameId: number, historyMode: HistoryMode = "push") {
    setLoadingDetail(true);
    setDetailError(null);
    setFilter("all");
    setExpandedEvent(null);
    setDetail(null);
    setSelectedGame(gameId);
    updateUrl(date, gameId, team, historyMode);
  }

  function retryDetail() {
    if (selectedGame === null) return;
    const gameId = selectedGame;
    setSelectedGame(null);
    window.setTimeout(() => chooseGame(gameId, "replace"), 0);
  }

  function selectRinkEvent(eventId: number) {
    setFilter("all");
    setExpandedEvent(eventId);
    window.setTimeout(() => {
      document.getElementById(`event-${eventId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  }

  return (
    <AppShell current="games">

      <section className="py-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-5 sm:mb-7">
          <div>
            <p className="eyebrow">Game viewer</p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight text-white sm:text-4xl">
              Sequential play-by-play events
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Inspect game totals and trace them back through the normalized event sequence.
            </p>
          </div>

          <SchedulePicker
            date={date}
            loading={loadingGames}
            nextDate={nextDate}
            onDateChange={(selectedDate) =>
              void loadGames(selectedDate, null, "push", team)
            }
            onTeamChange={(selectedTeam) =>
              void loadGames(undefined, null, "push", selectedTeam)
            }
            previousDate={previousDate}
            team={team}
          />
        </div>

        {listError && (
          <div className="error-banner" role="alert">
            <span>{listError}</span>
            <button onClick={() => void loadGames(date, selectedGame, "replace", team)}>
              Retry
            </button>
          </div>
        )}

        <div className="game-layout">
          <aside className="panel schedule-panel overflow-hidden" aria-label="Games on selected date">
            <div className="panel-heading">
              <span>{date ? readableDate(date, true) : "Schedule"}</span>
              <span className="metric">{loadingGames ? "Loading" : `${games.length} games`}</span>
            </div>
            <div className="schedule-list divide-y divide-white/5" aria-busy={loadingGames}>
              {loadingGames &&
                Array.from({ length: 3 }, (_, index) => (
                  <div className="game-card" key={index}>
                    <span className="skeleton block h-4 w-3/4" />
                    <span className="skeleton mt-3 block h-4 w-2/3" />
                    <span className="skeleton mt-4 block h-2.5 w-1/3" />
                  </div>
                ))}
              {!loadingGames && !listError && games.length === 0 && (
                <div className="px-5 py-9 text-center">
                  <p className="text-sm text-slate-400">No loaded games on this date.</p>
                  <div className="mt-4 flex justify-center gap-3 text-xs">
                    {previousDate && (
                      <button
                        className="text-cyan-300 hover:text-cyan-200"
                        onClick={() => void loadGames(previousDate, null, "push", team)}
                      >
                        Previous game day
                      </button>
                    )}
                    {nextDate && (
                      <button
                        className="text-cyan-300 hover:text-cyan-200"
                        onClick={() => void loadGames(nextDate, null, "push", team)}
                      >
                        Next game day
                      </button>
                    )}
                  </div>
                </div>
              )}
              {!loadingGames &&
                games.map((game) => (
                  <button
                    aria-pressed={selectedGame === game.game_id}
                    className={`game-card ${
                      selectedGame === game.game_id ? "game-card-active" : ""
                    }`}
                    key={game.game_id}
                    onClick={() => chooseGame(game.game_id)}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="team-name">{game.away_name}</span>
                      <strong className="score">
                        {score(game.away_score, game.event_count > 0)}
                      </strong>
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-3">
                      <span className="team-name">{game.home_name}</span>
                      <strong className="score">
                        {score(game.home_score, game.event_count > 0)}
                      </strong>
                    </span>
                    <span className="mt-4 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-500">
                      <span>
                        {gameStatus(game.game_state, game.game_type, game.event_count)}
                        {playoffLabel(game.playoff) ? ` · ${playoffLabel(game.playoff)}` : ""}
                      </span>
                      <span>{game.event_count} events</span>
                    </span>
                  </button>
                ))}
            </div>
            <div className="border-t border-white/5 px-5 py-3 text-[11px] text-slate-600">
              {listMeta.row_count} rows · {listMeta.query_ms.toFixed(1)} ms
            </div>
          </aside>

          <section className="panel min-w-0 overflow-hidden" aria-live="polite">
            {!selectedGame && !loadingGames ? (
              <div className="empty-state">Choose a date with loaded games to begin.</div>
            ) : detailError && !loadingDetail ? (
              <div className="empty-state" role="alert">
                <div>
                  <p className="text-rose-200">{detailError}</p>
                  <button className="retry-button mt-4" onClick={retryDetail}>
                    Retry game
                  </button>
                </div>
              </div>
            ) : loadingDetail && !detail ? (
              <div className="min-h-[560px] p-5 sm:p-7">
                <span className="skeleton block h-3 w-48" />
                <span className="skeleton mt-6 block h-12 w-72 max-w-full" />
                <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {Array.from({ length: 5 }, (_, index) => (
                    <span className="skeleton block h-16" key={index} />
                  ))}
                </div>
                <div className="mt-10 space-y-4">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span className="skeleton block h-10" key={index} />
                  ))}
                </div>
              </div>
            ) : selected && detail ? (
              <>
                <div className="border-b border-white/10 p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-5">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        {gameStatus(selected.game_state, selected.game_type, detail.row_count)}
                        {playoffLabel(selected.playoff)
                          ? ` · ${playoffLabel(selected.playoff)}`
                          : ""}
                        {" · "}
                        {selected.venue ?? "Venue unavailable"}
                        {selected.venue_location ? `, ${selected.venue_location}` : ""}
                      </p>
                      <div className="mt-5 flex items-center gap-4 sm:gap-9">
                        <div>
                          <p className="text-lg font-semibold text-white">{selected.away_abbrev}</p>
                          <p className="mt-1 text-xs text-slate-500">Away</p>
                        </div>
                        <p className="text-3xl font-semibold tabular-nums text-white sm:text-4xl">
                          {score(selected.away_score, detail.row_count > 0)}{" "}
                          <span className="text-slate-600">–</span>{" "}
                          {score(selected.home_score, detail.row_count > 0)}
                        </p>
                        <div>
                          <p className="text-lg font-semibold text-white">{selected.home_abbrev}</p>
                          <p className="mt-1 text-xs text-slate-500">Home</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-left text-xs leading-6 text-slate-500 sm:text-right">
                      <p>Game {selected.game_id}</p>
                      <p>{detail.row_count} recorded events</p>
                      <p>{detail.query_ms.toFixed(1)} ms query time</p>
                    </div>
                  </div>

                  <div className="summary-grid mt-7">
                    {[
                      ["Goals", detail.summary.away.goals, detail.summary.home.goals],
                      [
                        "Shots on goal",
                        detail.summary.away.shots_on_goal,
                        detail.summary.home.shots_on_goal,
                      ],
                      ["Hits", detail.summary.away.hits, detail.summary.home.hits],
                      [
                        "Penalty min",
                        detail.summary.away.penalty_minutes,
                        detail.summary.home.penalty_minutes,
                      ],
                      [
                        "Faceoff wins",
                        detail.summary.away.faceoff_wins,
                        detail.summary.home.faceoff_wins,
                      ],
                    ].map(([label, away, home]) => (
                      <div className="summary-stat" key={label}>
                        <p>{label}</p>
                        <div>
                          <strong>{away}</strong>
                          <span>–</span>
                          <strong>{home}</strong>
                        </div>
                      </div>
                    ))}
                  </div>

                  {detail.summary.periods.length > 0 && (
                    <div
                      className="period-score mt-4"
                      style={
                        {
                          "--period-count": detail.summary.periods.length,
                        } as CSSProperties
                      }
                    >
                      <span className="period-team">{selected.away_abbrev}</span>
                      {detail.summary.periods.map((period) => (
                        <span key={`away-${period.period}`}>
                          <small>{periodLabel(period)}</small>
                          <strong>{period.away_goals}</strong>
                        </span>
                      ))}
                      <span className="period-team">{selected.home_abbrev}</span>
                      {detail.summary.periods.map((period) => (
                        <span key={`home-${period.period}`}>
                          <small>{periodLabel(period)}</small>
                          <strong>{period.home_goals}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {detail.row_count > 0 && (
                  <RinkView
                    awayAbbrev={selected.away_abbrev}
                    events={detail.events}
                    homeAbbrev={selected.home_abbrev}
                    onSelectEvent={selectRinkEvent}
                    selectedEventId={expandedEvent}
                  />
                )}

                <div className="border-b border-white/5 px-4 py-3 sm:px-7">
                  <div className="flex gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="Event filters">
                    {eventFilters.map((option) => {
                      const count =
                        option === "all" ? detail.events.length : (eventCounts.get(option) ?? 0);
                      return (
                        <button
                          aria-pressed={filter === option}
                          className={`filter-button ${filter === option ? "filter-button-active" : ""}`}
                          key={option}
                          onClick={() => {
                            setFilter(option);
                            setExpandedEvent(null);
                          }}
                        >
                          {option.replaceAll("-", " ")} <span>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="event-list max-h-[700px] overflow-y-auto">
                  {visibleEvents.map((event, index) => {
                    const newPeriod = index === 0 || visibleEvents[index - 1].period !== event.period;
                    const expanded = expandedEvent === event.event_id;
                    return (
                      <div key={event.event_id}>
                        {newPeriod && (
                          <div className="period-heading">
                            {periodLabel(event)}
                            <span>{event.period_type === "REG" ? "Regulation" : event.period_type}</span>
                          </div>
                        )}
                        <article
                          className={`event-row ${expanded ? "event-row-expanded" : ""}`}
                          id={`event-${event.event_id}`}
                        >
                          <button
                            aria-expanded={expanded}
                            className="event-toggle"
                            onClick={() => setExpandedEvent(expanded ? null : event.event_id)}
                          >
                            <time className="font-mono text-xs text-slate-500">
                              {event.time_in_period}
                            </time>
                            <span className={`event-mark event-${event.event_type.toLowerCase()}`} />
                            <span className="min-w-0 text-left">
                              <span className="block text-sm leading-5 text-slate-200">
                                {event.description}
                              </span>
                              <span className="mt-1 block text-[11px] uppercase tracking-wider text-slate-600">
                                {event.event_type.replaceAll("-", " ")}
                                {event.strength ? ` · ${event.strength}` : ""}
                                {event.zone_code ? ` · ${event.zone_code} zone` : ""}
                              </span>
                            </span>
                            <span aria-hidden="true" className="event-chevron">
                              {expanded ? "−" : "+"}
                            </span>
                          </button>
                          {expanded && <EventDetails event={event} />}
                        </article>
                      </div>
                    );
                  })}
                  {visibleEvents.length === 0 && (
                    <p className="px-6 py-14 text-center text-sm text-slate-500">
                      No events match this filter.
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </section>
        </div>
      </section>
    </AppShell>
  );
}
