"use client";

import { useMemo, useState } from "react";

import { FilterSelect } from "@/components/filter-select";
import type { GameEvent } from "@/components/game-types";
import { rinkPoint, RinkSurface } from "@/components/rink-surface";
import { strengthLabel, titleCase } from "@/lib/format";

type RinkViewProps = {
  events: GameEvent[];
  awayAbbrev: string;
  homeAbbrev: string;
  selectedEventId: number | null;
  onSelectEvent: (eventId: number) => void;
};

function markerLabel(event: GameEvent) {
  const player = event.scorer_name || event.shooter_name || "Unknown player";
  const result = event.event_type === "goal" ? "Goal" : "Shot on goal";
  const shotType = event.goal_shot_type || event.shot_type;
  const strength = event.strength?.toUpperCase();
  return `${result} by ${player}${shotType ? `, ${shotType} shot` : ""}${strength ? `, ${strength}` : ""}, period ${event.period} at ${event.time_in_period}`;
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
          <FilterSelect
            label="Team"
            onChange={(event) => setTeam(event.target.value)}
            value={team}
          >
              <option value="all">Both teams</option>
              <option value={awayAbbrev}>{awayAbbrev}</option>
              <option value={homeAbbrev}>{homeAbbrev}</option>
          </FilterSelect>
          <FilterSelect
            label="Period"
            onChange={(event) => setPeriod(event.target.value)}
            value={period}
          >
              <option value="all">All periods</option>
              {periods.map((periodNumber) => (
                <option key={periodNumber} value={periodNumber}>
                  Period {periodNumber}
                </option>
              ))}
          </FilterSelect>
          <FilterSelect
            label="Shot type"
            onChange={(event) => setShotType(event.target.value)}
            value={shotType}
          >
              <option value="all">All shot types</option>
              {shotTypes.map((type) => (
                <option key={type} value={type}>
                  {titleCase(type)}
                </option>
              ))}
          </FilterSelect>
          <FilterSelect
            label="Strength"
            onChange={(event) => setStrength(event.target.value)}
            value={strength}
          >
              <option value="all">All strengths</option>
              {strengths.values.map((value) => (
                <option key={value} value={value}>
                  {strengthLabel(value)}
                </option>
              ))}
              {strengths.hasUnspecified && <option value="unspecified">Unspecified</option>}
          </FilterSelect>
        </div>
      </div>

      <div className="rink-frame">
        <RinkSurface ariaLabel={`Full rink showing ${attempts.length} shots and goals`}>
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
        </RinkSurface>
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
