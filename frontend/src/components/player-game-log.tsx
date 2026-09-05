import Link from "next/link";

import type { PlayerGame } from "@/components/player-types";
import { readableDate } from "@/lib/format";

function scoreLine(game: PlayerGame) {
  if (game.team_score === null || game.opponent_score === null) return "Score unavailable";
  const result =
    game.team_score > game.opponent_score
      ? "W"
      : game.team_score < game.opponent_score
        ? "L"
        : "T";
  return `${result} ${game.team_score}–${game.opponent_score}`;
}

export function PlayerGameLog({
  games,
  role,
}: {
  games: PlayerGame[];
  role: "skater" | "goalie";
}) {
  const goalie = role === "goalie";

  return (
    <section className="panel player-game-log">
      <div className="player-section-heading">
        <div><p className="eyebrow">Event appearances</p><h2>Game log</h2></div>
        <span>{games.length} games</span>
      </div>
      <div className="game-log-table" role="table" aria-label="Player game log">
        <div className={`game-log-row game-log-head ${goalie ? "game-log-goalie" : ""}`} role="row">
          <span>Date</span><span>Matchup</span><span>Result</span>
          {goalie
            ? <><span>SV</span><span>GA</span><span>SA</span></>
            : <><span>G</span><span>A</span><span>PTS</span><span>S</span></>}
        </div>
        {games.map((game) => (
          <Link
            className={`game-log-row ${goalie ? "game-log-goalie" : ""}`}
            href={`/?date=${game.game_date}&game=${game.game_id}`}
            key={game.game_id}
            role="row"
          >
            <span>{readableDate(game.game_date)}</span>
            <strong>{game.team_abbrev ?? "—"} vs {game.opponent_abbrev ?? "—"}</strong>
            <span>{scoreLine(game)}</span>
            {goalie
              ? <><span>{game.saves ?? "—"}</span><span>{game.goals_against}</span><span>{game.shots_against ?? "—"}</span></>
              : <><span>{game.goals}</span><span>{game.assists}</span><span>{game.points}</span><span>{game.shots ?? "—"}</span></>}
          </Link>
        ))}
        {games.length === 0 && (
          <p className="player-message">No tracked events for this season and competition.</p>
        )}
      </div>
    </section>
  );
}
