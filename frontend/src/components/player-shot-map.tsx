"use client";

import { useMemo, useState } from "react";

import { FilterSelect } from "@/components/filter-select";
import type { PlayerAttempt } from "@/components/player-types";
import { rinkPoint, RinkSurface } from "@/components/rink-surface";
import { strengthLabel, strengthSourceLabel, titleCase } from "@/lib/format";

export function PlayerShotMap({
  attempts,
  role,
}: {
  attempts: PlayerAttempt[];
  role: "skater" | "goalie";
}) {
  const [result, setResult] = useState("all");
  const [shotType, setShotType] = useState("all");
  const [strength, setStrength] = useState("all");
  const [coordinates, setCoordinates] = useState<"normalized" | "raw">("normalized");

  const shotTypes = useMemo(
    () =>
      [...new Set(attempts.map((attempt) => attempt.shot_type).filter((value): value is string => Boolean(value)))].sort(),
    [attempts],
  );
  const strengths = useMemo(
    () =>
      [...new Set(attempts.map((attempt) => attempt.strength?.toUpperCase()).filter((value): value is string => Boolean(value)))].sort(),
    [attempts],
  );
  const visible = useMemo(
    () =>
      attempts.filter(
        (attempt) =>
          attempt.x_coord !== null &&
          attempt.y_coord !== null &&
          (result === "all" || attempt.result === result) &&
          (shotType === "all" || attempt.shot_type === shotType) &&
          (strength === "all" || (strength === "unknown" ? !attempt.strength : attempt.strength?.toUpperCase() === strength)),
      ),
    [attempts, result, shotType, strength],
  );
  const outcomes = useMemo<Array<[PlayerAttempt["result"], string]>>(
    () =>
      role === "goalie"
        ? [["save", "Saves"], ["goal-against", "Goals against"]]
        : [["shot", "Shots"], ["goal", "Goals"]],
    [role],
  );
  const outcomeCounts = useMemo(
    () =>
      new Map(
        outcomes.map(([value]) => [
          value,
          attempts.filter((attempt) => attempt.result === value).length,
        ]),
      ),
    [attempts, outcomes],
  );
  const shotTypeCounts = useMemo(
    () =>
      new Map(
        shotTypes.map((value) => [
          value,
          attempts.filter((attempt) => attempt.shot_type === value).length,
        ]),
      ),
    [attempts, shotTypes],
  );
  const orderedVisible = [...visible].sort((left, right) => {
    const leftScored = left.result === "goal" || left.result === "goal-against";
    const rightScored = right.result === "goal" || right.result === "goal-against";
    return Number(leftScored) - Number(rightScored);
  });
  const missingCoordinates = attempts.filter(
    (attempt) => attempt.x_coord === null || attempt.y_coord === null,
  ).length;

  return (
    <section className="panel player-map-panel">
      <div className="player-section-heading">
        <div>
          <p className="eyebrow">Spatial profile</p>
          <h2>{role === "goalie" ? "Shots faced" : "Shot map"}</h2>
        </div>
        <div className="rink-filters">
          <FilterSelect
            label="Outcome"
            onChange={(event) => setResult(event.target.value)}
            value={result}
          >
              <option value="all">All outcomes</option>
              {outcomes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label} ({outcomeCounts.get(value)})
                </option>
              ))}
          </FilterSelect>
          <FilterSelect
            label="Shot type"
            onChange={(event) => setShotType(event.target.value)}
            value={shotType}
          >
              <option value="all">All shot types</option>
              {shotTypes.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)} ({shotTypeCounts.get(value)})
                </option>
              ))}
          </FilterSelect>
          <FilterSelect
            label="Shooting team strength"
            onChange={(event) => setStrength(event.target.value)}
            value={strength}
          >
              <option value="all">All strengths</option>
              {attempts.some((attempt) => !attempt.strength) && <option value="unknown">Unknown</option>}
              {strengths.map((value) => (
                <option key={value} value={value}>{strengthLabel(value)}</option>
              ))}
          </FilterSelect>
          <FilterSelect
            label="Coordinates"
            onChange={(event) => setCoordinates(event.target.value as "normalized" | "raw")}
            value={coordinates}
          >
            <option value="normalized">Normalized</option>
            <option value="raw">Raw NHL</option>
          </FilterSelect>
        </div>
      </div>

      <div className="rink-frame">
        <RinkSurface ariaLabel={`${titleCase(coordinates)} rink showing ${visible.length} attempts`}>
          {orderedVisible.map((attempt) => {
            const xCoord =
              coordinates === "normalized"
                ? Math.abs(attempt.x_coord as number)
                : (attempt.x_coord as number);
            const point = rinkPoint(xCoord, attempt.y_coord as number);
            const scored = attempt.result === "goal" || attempt.result === "goal-against";
            const label = `${titleCase(attempt.result)}, ${attempt.shot_type ?? "unknown shot type"}, ${attempt.game_date}, shooting team ${attempt.shooting_team_abbrev ?? "unknown"}, strength ${attempt.strength?.toUpperCase() ?? "unknown"}, source ${strengthSourceLabel(attempt.strength_source)}`;
            return (
              <a
                aria-label={`${label}; open source game`}
                className="player-attempt-link"
                href={`/?date=${attempt.game_date}&game=${attempt.game_id}`}
                key={attempt.event_id}
              >
                <g
                  className={`rink-marker player-attempt-marker ${scored ? "player-attempt-scored" : "player-attempt-stopped"}`}
                  transform={`translate(${point.x} ${point.y})`}
                >
                  <title>{label}</title>
                  {scored ? <path d="M 0 -9 L 9 0 L 0 9 L -9 0 Z" /> : <circle r="6" />}
                </g>
              </a>
            );
          })}
        </RinkSurface>
      </div>
      <p className="map-scope">Strength describes the shooting team. On a goalie map, PP means the opponent was on the power play.</p>
      <div className="rink-footer">
        <div className="rink-legend">
          <span><i className="player-legend-stopped" /> {role === "goalie" ? "Save" : "Shot"}</span>
          <span><i className="player-legend-scored" /> {role === "goalie" ? "Goal against" : "Goal"}</span>
        </div>
        <p>
          {visible.length} plotted
          {missingCoordinates ? ` · ${missingCoordinates} without coordinates` : ""}
          {coordinates === "normalized" ? " · attacking direction normalized" : " · raw coordinates"}
        </p>
      </div>
    </section>
  );
}
