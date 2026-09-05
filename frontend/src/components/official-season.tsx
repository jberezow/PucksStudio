import type { PlayerDetailResponse } from "@/components/player-types";

type ComparisonRow = [string, number | null | undefined, number | null | undefined];

export function OfficialSeasonComparison({ data }: { data: PlayerDetailResponse }) {
  const official = data.official;
  const skater = data.skater_summary;
  const goalie = data.goalie_summary;
  const rows: ComparisonRow[] = data.role === "skater"
    ? [
        ["Goals", official?.goals, skater?.goals],
        ["Assists", official?.assists, skater?.assists],
        ["Points", official?.points, skater?.points],
        ["Shots", official?.shots, skater?.shots],
      ]
    : [
        ["Saves", official?.saves, goalie?.saves],
        ["Goals against", official?.goals_against, goalie?.goals_against],
        ["Shots against", official?.shots_against, goalie?.shots_against],
      ];
  const officialRate = data.role === "goalie"
    ? official?.save_pct?.toFixed(3) ?? "—"
    : official?.shooting_pct != null
      ? `${(official.shooting_pct * 100).toFixed(1)}%`
      : "—";

  return (
    <section className="panel official-season" aria-label="Official season comparison">
      <div className="player-section-heading">
        <div>
          <p className="eyebrow">NHL season totals</p>
          <h2>Compare with tracked events</h2>
        </div>
      </div>
      {!official ? (
        <p>
          No official totals are loaded for this player, season, and competition.
          Event-derived totals remain available below.
        </p>
      ) : (
        <>
          <p>
            Official games played: <strong>{official.games_played ?? "—"}</strong>
            {data.role === "goalie" ? (
              <>
                {" · "}Wins: {official.wins ?? "—"}
                {" · "}Losses: {official.losses ?? "—"}
                {" · "}OT losses: {official.ot_losses ?? "—"}
                {" · "}Ties: {official.ties ?? "—"}
                {" · "}Shutouts: {official.shutouts ?? "—"}
              </>
            ) : (
              <>
                {" · "}PP goals: {official.pp_goals ?? "—"}
                {" · "}SH goals: {official.sh_goals ?? "—"}
              </>
            )}
          </p>
          <table>
            <caption>
              Difference = tracked events minus official total.
              A difference is a signal to inspect the source games.
            </caption>
            <thead>
              <tr>
                <th scope="col">Statistic</th>
                <th scope="col">Official NHL</th>
                <th scope="col">Tracked events</th>
                <th scope="col">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, published, tracked]) => {
                const delta = published != null && tracked != null ? tracked - published : null;
                return (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{published ?? "—"}</td>
                    <td>{tracked ?? "—"}</td>
                    <td className={delta ? "coverage-warning" : ""}>
                      {delta === null ? "—" : delta > 0 ? `+${delta}` : delta}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p>
            Official {data.role === "goalie" ? "save percentage" : "shooting percentage"}: {officialRate}.
          </p>
        </>
      )}
      <p>
        Official season totals and event counts are separate sources.
        Missing values mean unavailable, not zero.
      </p>
    </section>
  );
}
