"use client";

import { useMemo, useState } from "react";

import type { GameEvent } from "@/components/game-types";

type RinkViewProps = {
  events: GameEvent[];
  awayAbbrev: string;
  homeAbbrev: string;
  selectedEventId: number | null;
  onSelectEvent: (eventId: number) => void;
};

const WIDTH = 1_000;
const HEIGHT = 425;
const X_SCALE = WIDTH / 200;
const Y_SCALE = HEIGHT / 85;

function rinkPoint(x: number, y: number) {
  return {
    x: (x + 100) * X_SCALE,
    y: (42.5 - y) * Y_SCALE,
  };
}

function markerLabel(event: GameEvent) {
  const player = event.scorer_name || event.shooter_name || "Unknown player";
  const result = event.event_type === "goal" ? "Goal" : "Shot on goal";
  const shotType = event.goal_shot_type || event.shot_type;
  const strength = event.strength?.toUpperCase();
  return `${result} by ${player}${shotType ? `, ${shotType} shot` : ""}${strength ? `, ${strength}` : ""}, period ${event.period} at ${event.time_in_period}`;
}

function readableShotType(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function readableStrength(value: string) {
  const labels: Record<string, string> = {
    EV: "EV · Even strength",
    PP: "PP · Power play",
    SH: "SH · Shorthanded",
  };
  return labels[value] ?? value;
}

export function RinkView({
  events,
  awayAbbrev,
  homeAbbrev,
  selectedEventId,
  onSelectEvent,
}: RinkViewProps) {
  const [team, setTeam] = useState("all");
  const [period, setPeriod] = useState("all");
  const [shotType, setShotType] = useState("all");
  const [strength, setStrength] = useState("all");

  const periods = useMemo(
    () => [...new Set(events.map((event) => event.period))].sort((a, b) => a - b),
    [events],
  );
  const shotTypes = useMemo(
    () =>
      [
        ...new Set(
          events
            .map((event) => event.goal_shot_type || event.shot_type)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [events],
  );
  const strengths = useMemo(() => {
    const attemptEvents = events.filter(
      (event) => event.event_type === "goal" || event.event_type === "shot-on-goal",
    );
    const values = [
      ...new Set(
        attemptEvents
          .map((event) => event.strength?.toUpperCase())
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort();
    return {
      values,
      hasUnspecified: attemptEvents.some((event) => !event.strength),
    };
  }, [events]);
  const attempts = useMemo(
    () =>
      events.filter(
        (event) =>
          (event.event_type === "goal" || event.event_type === "shot-on-goal") &&
          event.x_coord !== null &&
          event.y_coord !== null &&
          (team === "all" || event.owner_abbrev === team) &&
          (period === "all" || event.period === Number(period)) &&
          (shotType === "all" || (event.goal_shot_type || event.shot_type) === shotType) &&
          (strength === "all" ||
            (strength === "unspecified"
              ? !event.strength
              : event.strength?.toUpperCase() === strength)),
      ),
    [events, period, shotType, strength, team],
  );
  const missingCoordinates = events.filter(
    (event) =>
      (event.event_type === "goal" || event.event_type === "shot-on-goal") &&
      (event.x_coord === null || event.y_coord === null),
  ).length;

  return (
    <section className="rink-panel" aria-labelledby="rink-title">
      <div className="rink-heading">
        <div>
          <p className="eyebrow">Spatial view</p>
          <h3 id="rink-title">Shots and goals</h3>
        </div>
        <div className="rink-filters">
          <label>
            <span>Team</span>
            <select onChange={(event) => setTeam(event.target.value)} value={team}>
              <option value="all">Both teams</option>
              <option value={awayAbbrev}>{awayAbbrev}</option>
              <option value={homeAbbrev}>{homeAbbrev}</option>
            </select>
          </label>
          <label>
            <span>Period</span>
            <select onChange={(event) => setPeriod(event.target.value)} value={period}>
              <option value="all">All periods</option>
              {periods.map((periodNumber) => (
                <option key={periodNumber} value={periodNumber}>
                  Period {periodNumber}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Shot type</span>
            <select onChange={(event) => setShotType(event.target.value)} value={shotType}>
              <option value="all">All shot types</option>
              {shotTypes.map((type) => (
                <option key={type} value={type}>
                  {readableShotType(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Strength</span>
            <select onChange={(event) => setStrength(event.target.value)} value={strength}>
              <option value="all">All strengths</option>
              {strengths.values.map((value) => (
                <option key={value} value={value}>
                  {readableStrength(value)}
                </option>
              ))}
              {strengths.hasUnspecified && <option value="unspecified">Unspecified</option>}
            </select>
          </label>
        </div>
      </div>

      <div className="rink-frame">
        <svg
          aria-label={`Full rink showing ${attempts.length} shots and goals`}
          className="rink-svg"
          role="img"
          viewBox={`-20 -20 ${WIDTH + 40} ${HEIGHT + 40}`}
        >
          <defs>
            <clipPath id="rink-clip">
              <rect height={HEIGHT} rx="75" width={WIDTH} />
            </clipPath>
            <pattern height="20" id="ice-grid" patternUnits="userSpaceOnUse" width="20">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0f2940" strokeWidth="0.7" />
            </pattern>
          </defs>

          <g clipPath="url(#rink-clip)">
            <rect className="rink-ice" height={HEIGHT} rx="75" width={WIDTH} />
            <rect fill="url(#ice-grid)" height={HEIGHT} opacity="0.35" width={WIDTH} />
            <line className="rink-line rink-red" x1="500" x2="500" y1="0" y2={HEIGHT} />
            <line className="rink-line rink-blue" x1="375" x2="375" y1="0" y2={HEIGHT} />
            <line className="rink-line rink-blue" x1="625" x2="625" y1="0" y2={HEIGHT} />
            <line className="rink-line rink-goal-line" x1="55" x2="55" y1="0" y2={HEIGHT} />
            <line className="rink-line rink-goal-line" x1="945" x2="945" y1="0" y2={HEIGHT} />
            <circle className="rink-faceoff-circle" cx="500" cy={HEIGHT / 2} r="75" />
            {[155, 845].flatMap((x) =>
              [102.5, 322.5].map((y) => (
                <g key={`${x}-${y}`}>
                  <circle className="rink-faceoff-circle" cx={x} cy={y} r="75" />
                  <circle className="rink-faceoff-dot" cx={x} cy={y} r="6" />
                </g>
              )),
            )}
            {[400, 600].flatMap((x) =>
              [102.5, 322.5].map((y) => (
                <circle className="rink-neutral-dot" cx={x} cy={y} key={`${x}-${y}`} r="5" />
              )),
            )}
            <path className="rink-crease" d="M55 177.5 A35 35 0 0 1 55 247.5 Z" />
            <path className="rink-crease" d="M945 177.5 A35 35 0 0 0 945 247.5 Z" />
          </g>
          <rect className="rink-outline" height={HEIGHT} rx="75" width={WIDTH} />
          <path className="rink-net" d="M55 190 H35 V235 H55" />
          <path className="rink-net" d="M945 190 H965 V235 H945" />

          {attempts.map((event) => {
            const point = rinkPoint(event.x_coord as number, event.y_coord as number);
            const goal = event.event_type === "goal";
            const home = event.owner_abbrev === homeAbbrev;
            const selected = event.event_id === selectedEventId;
            return (
              <g
                aria-label={markerLabel(event)}
                className={`rink-marker ${home ? "rink-marker-home" : "rink-marker-away"} ${
                  goal ? "rink-marker-goal" : "rink-marker-shot"
                } ${selected ? "rink-marker-selected" : ""}`}
                key={event.event_id}
                onClick={() => onSelectEvent(event.event_id)}
                onKeyDown={(keyboardEvent) => {
                  if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                    keyboardEvent.preventDefault();
                    onSelectEvent(event.event_id);
                  }
                }}
                role="button"
                tabIndex={0}
                transform={`translate(${point.x} ${point.y})`}
              >
                <title>{markerLabel(event)}</title>
                {goal ? <path d="M 0 -10 L 10 0 L 0 10 L -10 0 Z" /> : <circle r="7" />}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="rink-footer">
        <div className="rink-legend">
          <span><i className="rink-legend-away" /> {awayAbbrev}</span>
          <span><i className="rink-legend-home" /> {homeAbbrev}</span>
          <span><i className="rink-legend-shot" /> Shot</span>
          <span><i className="rink-legend-goal" /> Goal</span>
        </div>
        <p>
          {attempts.length} plotted
          {missingCoordinates > 0 ? ` · ${missingCoordinates} without coordinates` : ""}
        </p>
      </div>
    </section>
  );
}
