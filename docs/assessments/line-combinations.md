# Line combinations: feasibility and PucksData–PucksStudio coherence

Pre-implementation assessment: 2026-09-23. This document records the findings before implementation; see the repository README for the implemented feature and migration requirements. The linked concept remains a design artifact.

**Recommendation:** build an observed-combinations explorer, starting with forward trios and defense pairs ranked by shared five-on-five ice time. Add season aggregation and player partner views next. Probabilistic grouping is a useful later layer for describing rotations; it is not necessary to discover the most-used combinations.

Open [the interactive concept](line-combinations-concept.html) to compare three presentation options. Its game cards use the public-source probe below; its other views are explicitly design sketches.

## Evidence and limits

- Ran `./scripts/test-database.sh` in PucksStudio against the sibling PucksData checkout, applying migrations 0001–0031 in disposable PostgreSQL. **45 tests passed**, including all canonical SQL queries and API contract assertions under a restricted reader role.
- This establishes compatibility of the current queries with the current schema. It does not verify production deployment versions, reader grants, ingestion completeness, or season-scale latency.
- Probed NHL game **2024021200**, PIT at STL on April 3, 2025. The response contained 815 records: 806 shifts and nine goal annotations. Used boxscore player groups to distinguish forwards, defense and goalies.
- Split each period into half-open intervals at shift start/end boundaries; counted each player once even if raw intervals overlapped. Included regular-season overtime when reconciling total ice time. All 40 listed players matched official boxscore time on ice exactly, including the zero-time backup goalies.
- Found **3,021 seconds (50:21)** with five skaters and one goalie on each side. Other states accounted for 711 seconds, including overtime. Fifty-two team-seconds within five-on-five had a composition other than three forwards and two defensemen; these should remain visible as unclassified composition rather than be forced into a trio.
- Pittsburgh's top trios: Crosby–Rust–McGroarty **11:55**, Rakell–Dewar–Koivunen **11:10**, Heinen–Koppanen–Lizotte **7:41**, Hayes–Acciari–Tomasino **6:03**.
- There were 51 distinct Pittsburgh trios and 76 St. Louis trios. Brief line-change overlaps make a long tail. These counts demonstrate why a fixed four-line assignment loses information.
- This is a feasibility probe of one coherent game, not validation of all seasons. Source gaps, duplicate intervals, inconsistent clocks and missing metadata still require explicit handling.

Primary data: [NHL shift response](https://api.nhle.com/stats/rest/en/shiftcharts?limit=-1&cayenneExp=gameId=2024021200), [NHL boxscore](https://api-web.nhle.com/v1/gamecenter/2024021200/boxscore). The concept's six available portraits come from NHL player landing responses; the application should instead consume the URLs already ingested by PucksData.

## Coherence assessment

| Area | Current state | Consequence / proposed change |
| --- | --- | --- |
| Existing Studio queries | Compatible with migrations through 0031 in the test database | Existing game/player experience remains coherent. |
| CI contract pin | Studio pins `615350d`, whose migration set ends at 0026; documented minimum is 0019 | Advance the pin deliberately when adopting headshots (0027) and typed shifts (0031). Current CI does not exercise the new feature's contract. |
| Team identity | `games.home_team_id`, `games.away_team_id` and `teams.team_id` use franchise IDs. `shifts.team_id` preserves raw NHL team IDs. Example: Vegas 54 versus franchise 38 | **Blocking for trustworthy team filtering.** Persist an NHL-team-to-franchise mapping in PucksData, ideally with historical identity/era metadata. Resolve shift team IDs before comparing them with game team IDs. Never join these columns directly or infer team membership from a player's current club. |
| Raw shifts | Typed source IDs, periods and interval clocks exist; nullable/incoherent fields and distinct duplicate source rows are intentionally preserved | Add a separate analytical validation/reconstruction layer. Preserve raw ingestion semantics and source-row provenance. |
| Player identity and position | `players.position` exists; official player/game records have game-specific position codes; raw shifts have no player foreign key | Prefer game-specific role when available, use documented metadata fallback, retain unresolved players. Current rosters are observations, not a historical lineup table. C/L/R do not prove the player's slot in a particular trio. |
| Images | PucksData stores nullable `players.headshot_url`; Studio SQL, response models and frontend player types omit it | Expose the field, use a shared portrait component with fallback, and check existing metadata has actually been refreshed. Existing PucksPool headshot handling is a useful local pattern. Current portraits may show a different jersey from the selected historical team. |
| Coverage contract | Migration 0016 marks `shifts` absent; migrations 0030/0031 do not revise it | Publish shift capability from 2010–11 separately from observed game coverage and usable interval coverage. Update the time-on-ice wording to distinguish official totals, raw shifts and validated reconstruction. |
| Dataset health | Studio's health views describe events and sync, not shifts. Shift loading is a separate manual backfill | A healthy event dataset does not imply lines are available. Add shift-specific ingestion/quality status and reader grants. |
| Missing-source state | Unavailable shifts are reported by the backfill but no persistent per-game attempt/status record is stored | Without additional metadata Studio can only say “no shifts stored,” not distinguish not fetched, upstream unavailable, or failed. Persist ingestion status/last attempt if the UI needs that distinction; keep unavailable games retryable. |
| Readiness and ownership | Studio is read-only; readiness probes existing queries only | Extend readiness/contract tests for feature dependencies. PucksData owns mapping, schema and durable source status; Studio owns reconstruction, aggregation, API and visualization. Any durable aggregate schema should be managed by PucksData. |

Code anchors: [team ID translation](../../../PucksData/src/fetchers/games.rs), [raw shifts](../../../PucksData/migrations/0030_shift_tracking.sql), [coverage](../../../PucksData/migrations/0016_analytics_coverage.sql), [headshots](../../../PucksData/migrations/0027_player_headshots.sql), [Studio player SQL](../../backend/pucksstudio/queries/sql/player_profile.sql), [contract test](../../backend/tests/test_database_contract.py), [CI](../../.github/workflows/ci.yml).

## Calculation options

| Approach | What it answers | Tradeoffs | Recommendation |
| --- | --- | --- | --- |
| Exact overlap, duration-weighted counts | Which trios/pairs actually shared the ice most? | Transparent, auditable and no model training. Must handle boundary noise and data quality. | MVP and permanent baseline. |
| Pairwise affinity / graph grouping | Who tends to play with whom, including substitutions? | Normalize shared time by player ice time; otherwise high-usage players dominate. Pairwise relationships can suggest a trio that never played together. Hard partitions also hide double-shifting. | Player partner explorer; validate every displayed trio against observed triple overlap. |
| Soft latent groups / mixture model | Is there a stable core with interchangeable third players? | Allow multiple memberships, separate F/D roles, weight by duration, separate game states and time windows. Model probabilities describe fitted membership, not confidence in source completeness. Requires tuning and stability evaluation. | Later experiment if rotations are a real user need. |
| Temporal state model / change-point analysis | When did deployment materially change? | Better suited to season evolution than one global cluster. More implementation and validation work; smoothness assumptions can hide actual changes. | Later season feature. |

A Gaussian mixture or k-means over raw shift rows is a poor starting point: the observations are intervals and player sets, not naturally continuous feature vectors, and raw shift counts do not measure shared minutes. A structured model over duration-weighted co-occurrence could be evaluated after the baseline exists.

Suggested analytical contract:

1. Resolve the request to game + selected side, or season + team + competition + optional date range. A season ID alone is not enough to select a team. Use the game's historical membership, not current rosters.
2. Read **both teams'** shifts. Resolve raw team IDs, player identity, role, period type and period duration. Treat shootouts separately; regular-season and playoff overtime have different rules.
3. Validate clocks, bounds, missing fields and duration agreement. Union duplicate/overlapping intervals per player in the analytical layer to avoid counting a player twice. Record any repair/exclusion, retain source IDs, and do not alter raw rows.
4. Sweep start/end boundaries with `[start, end)` intervals. Confirm five non-goalies **and a goalie** on each side for the default five-on-five mode. Count-only tests can confuse some empty-net situations with five-on-five. Event `ev` strength is not equivalent to five-on-five; events are point observations, not a complete manpower timeline.
5. Accumulate exact forward trios, defense pairs and optional five-player units. Require resolved composition; show ambiguous intervals separately. Keep power-play units, penalty kill, four-on-four, overtime and empty-net play separate.
6. Rank by shared seconds, not row count. Merge adjacent intervals with the same unit before reporting deployments: a defense change must not become another forward deployment. Any minimum deployment duration should be configurable/tested, with excluded time disclosed; do not silently erase short intervals from time totals.
7. Return total shared time, appearances, time per appearance, share of qualifying team time, dates and supporting intervals. Define denominators in the response. For player affinity use shared time / that player's qualifying time; these directional percentages can differ for the two players.
8. Return expected/loaded/usable game counts, rejected interval counts or seconds, unknown-role coverage, source freshness and method version alongside results. Missing games must not enter averages as zero-minute games. “Frequent” is not “effective,” and observed combinations are not tonight's projected lineup.

For season views, aggregate per-game sufficient statistics; never pairwise-join an entire season of raw shifts. Boundary sorting is approximately O(S log S) per game, with small active player sets. Prototype in Studio's existing Polars/domain layer and benchmark an 82-game team season before introducing durable materialization. Cache by scope, source revisions/fingerprint and method version; account for later backfills and refreshes. The existing 15-second query timeout is a guard, not evidence the new query will meet interactive latency.

## User experience options

**A — Observed line cards (recommended first).** Add a Lines tab to a game, with a home/away switch. Show forward trios and defense pairs as portrait cards ranked by shared time. Each card has minutes, a clearly defined share, deployment count and an evidence drawer linking to periods/intervals. Names remain visible if pictures fail. Label rankings “most used,” not coach-designated Line 1/2/3/4. Players may appear on multiple cards. Do not imply left/center/right assignments from listed position alone.

**B — Team season explorer.** A team and season picker, regular-season/playoff selector and date window lead to the same cards, plus a trend strip or game-by-game heatmap. Offer full season and recent-game windows as separate questions. Show game coverage prominently; mark games with no data as gaps, not zero usage. Clicking a period of time opens the contributing games. This reveals trades, injuries and rotation changes without pretending their causes are known.

**C — Player partner explorer.** Open from a card or player profile. Show frequent linemates with portraits, shared minutes and the share of that player's qualifying ice time. A matrix or network is an optional analyst view; default to readable partner rows and actual observed trios. This is the natural home for a later soft-clustering “stable core / rotating partner” explanation.

Use skeleton/loading, unavailable, partial-coverage and retry states consistent with Studio. Keep filters in the URL. A game selection can offer both teams; a season request should prompt for a team or use the currently selected team. Player portrait loading is independent of analytical-data loading.

## Suggested delivery sequence

1. **Data contract:** persist team mapping, correct shift coverage metadata, establish per-game shift state, expose headshots, update grants/readiness and CI pin. Test mismatched NHL/franchise IDs and historical teams explicitly.
2. **Game MVP:** interval engine, five-on-five cards, portrait fallback, coverage and interval evidence. Test duplicates, invalid intervals, simultaneous changes, missing goalies, missing players and absent games. Compare reconstructed total TOI with official player/game totals on multiple eras and anomaly cases.
3. **Season experience:** merge per-game results, game coverage, date windows, trends, cache invalidation and latency benchmarks. Keep regular season and playoffs separate.
4. **Optional modeling:** evaluate soft grouping or change points against the exact-overlap baseline. Bootstrap by game rather than treating adjacent seconds as independent samples; report stability separately from source coverage. Do not publish an uncalibrated “confidence percentage.”

The game MVP is a moderate, well-supported addition to the current stack. The main engineering work is identity and interval correctness. Portrait cards are straightforward once the backend contract exists. Season-scale performance and probabilistic grouping need separate validation.

External precedent: [NHL Fantasy Hub's first-party methodology](https://nhlfantasyhub.com/tools/lines) also describes deriving observed units from shift overlap and presenting their supporting usage. This is supporting precedent, not validation of this implementation or permission to copy its output.
