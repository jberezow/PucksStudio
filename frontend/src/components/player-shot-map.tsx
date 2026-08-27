"use client";

import { useMemo, useState } from "react";

import type { PlayerAttempt } from "@/components/player-types";
import { rinkPoint, RinkSurface } from "@/components/rink-surface";

function titleCase(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

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
          (strength === "all" || attempt.strength?.toUpperCase() === strength),
      ),
    [attempts, result, shotType, strength],
  );
  const outcomes =
    role === "goalie"
      ? [["save", "Saves"], ["goal-against", "Goals against"]]
      : [["shot", "Shots"], ["goal", "Goals"]];

  return (
    <section className="panel player-map-panel">
      <div className="player-section-heading">
        <div>
          <p className="eyebrow">Spatial profile</p>
          <h2>{role === "goalie" ? "Shots faced" : "Shot map"}</h2>
        </div>
        <div className="rink-filters">
          <label>
            <span>Outcome</span>
            <select onChange={(event) => setResult(event.target.value)} value={result}>
              <option value="all">All outcomes</option>
              {outcomes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>Shot type</span>
            <select onChange={(event) => setShotType(event.target.value)} value={shotType}>
              <option value="all">All shot types</option>
              {shotTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
          </label>
          <label>
            <span>Strength</span>
            <select onChange={(event) => setStrength(event.target.value)} value={strength}>
              <option value="all">All strengths</option>
              {strengths.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="rink-frame">
        <RinkSurface ariaLabel={`Normalized rink showing ${visible.length} attempts`}>
          {visible.map((attempt) => {
            const point = rinkPoint(Math.abs(attempt.x_coord as number), attempt.y_coord as number);
            const scored = attempt.result === "goal" || attempt.result === "goal-against";
            const label = `${titleCase(attempt.result)}, ${attempt.shot_type ?? "unknown shot type"}, ${attempt.game_date}`;
            return (
              <g
                aria-label={label}
                className={`rink-marker player-attempt-marker ${scored ? "player-attempt-scored" : "player-attempt-stopped"}`}
                key={attempt.event_id}
                role="img"
                transform={`translate(${point.x} ${point.y})`}
              >
                <title>{label}</title>
                {scored ? <path d="M 0 -9 L 9 0 L 0 9 L -9 0 Z" /> : <circle r="6" />}
              </g>
            );
          })}
        </RinkSurface>
      </div>
      <div className="rink-footer">
        <div className="rink-legend">
          <span><i className="player-legend-stopped" /> {role === "goalie" ? "Save" : "Shot"}</span>
          <span><i className="player-legend-scored" /> {role === "goalie" ? "Goal against" : "Goal"}</span>
        </div>
        <p>{visible.length} plotted · attacking direction normalized</p>
      </div>
    </section>
  );
}
