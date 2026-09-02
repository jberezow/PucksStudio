# Architecture

PucksStudio is a read-only analytical application over a PostgreSQL database
populated by PucksData.

## System boundary

```text
PucksData PostgreSQL
        |
        | read-only
        v
Canonical SQL
        |
        v
Polars
        |
        v
FastAPI
        |
        v
Next.js
```

PucksData owns ingestion, normalization, schema migrations, and data repair.
PucksStudio owns analytical queries, derived game and player summaries, API
serialization, and visualization. PucksStudio does not call NHL APIs and does
not contain database write paths or migrations.

The application connection pool sets
`default_transaction_read_only = on` for every connection. The configured
database role should also have read-only PostgreSQL privileges.

## Backend

The backend uses Python, FastAPI, Psycopg, and Polars.

```text
backend/pucksstudio/
  api/       HTTP routes and response models
  db/        Connection-pool lifecycle
  hockey/    Domain transformations
  queries/   SQL loading and timed execution
    sql/     Parameterized query definitions
```

Routes contain request handling and serialization but no substantial SQL.
Queries are stored as named `.sql` files and executed through the shared query
layer, which records elapsed time and row count. Database rows cross into the
analytical layer as Polars DataFrames.

PostgreSQL performs relational work:

- date and team filtering;
- joins between games, teams, events, players, and typed event tables;
- event ordering;
- result-set reduction.

Polars derives presentation-ready game data:

- team goals;
- shots on goal;
- hits;
- penalty minutes;
- faceoff wins;
- period scoring;
- readable event descriptions.

Player and goalie aggregates are calculated from typed goals and shots.
Skater profiles expose goals, assists, points, shots, and shooting percentage.
Goalie profiles expose saves, goals against, shots against, and save
percentage. Because the source schema does not contain lineups, shifts, or
time-on-ice, participation is described as games with tracked events rather
than official games played. Wins and shutouts are not inferred.
Derived percentages are suppressed when a player profile contains no tracked
non-scoring outcomes. This conservative player-level check avoids presenting
goal-only historical records as complete shot or save samples without adding an
archive-wide scan to every profile request.

Every derived result retains the contributing event records and their source
identifiers.

Postseason round, series, and game numbers are decoded from canonical NHL game
IDs. Eventless postseason records are treated as unplayed schedule
placeholders, while missing state on other records remains visible as
unavailable source data.

## Dataset health

PucksData publishes two read-only views, `observability.dataset_health` and
`observability.season_health`, which report completeness: every completed game
has events and every goal has a shots row. PucksStudio treats them as the
contract and does not recompute their figures.

PucksStudio uses the views' acknowledged and actionable gap counts when deriving
its verdict. One additional judgement is layered on top in
`hockey/observability.py`:

- Freshness. A failed pipeline run leaves `sync_state` untouched, so the age of
  the last successful sync is compared with a configurable window. Freshness
  never keys off game dates, which are legitimately months old in the
  offseason.
- Gap classification. PucksData reports games it will not retry as acknowledged
  and the remaining gaps as actionable. Only actionable gaps, failed or pending
  backfills, orphaned goals, or events trailing the schedule raise the verdict
  to "attention".

The two health queries run concurrently and the snapshot is cached briefly
in process, since each view scans every completed game. A missing schema or
grant is reported as an unavailable dataset rather than a server fault.

## Frontend

The frontend uses TypeScript, React, Next.js, and Tailwind CSS. It consumes
typed JSON responses and contains no database or SQL knowledge.

The game viewer maintains date, team, and game selection in URL parameters.
Schedule requests and game-detail requests are independently cancellable so
rapid navigation cannot display stale responses. Calendar dates distinguish
played games from schedule-only records, and expandable timeline rows expose
event provenance without crowding the default view. A responsive SVG rink maps
source coordinates directly onto a full-rink view; selecting a shot or goal
reveals its corresponding timeline record.

Game-day navigation uses indexed nearest-date lookups rather than aggregating
the full loaded-game history.

The interface supports keyboard focus, reduced-motion preferences, responsive
schedule navigation, and explicit loading and retry states.

Player profiles use stable routes with season and competition URL parameters.
Season shot maps normalize attacking direction and reuse the same SVG rink
surface as the game viewer. Game-log rows link back to the underlying game and
date. Available seasons are derived from every typed event role attributable to
the player, including scoring, goaltending, hits, blocks, penalties, and
faceoffs; they represent seasons with tracked events rather than official roster
history.

## API flow

```text
Browser selection
      |
      v
FastAPI route
      |
      v
Named parameterized query
      |
      v
Read-only PostgreSQL connection
      |
      v
Polars transformation
      |
      v
Typed JSON response
```

The primary game-detail request executes one query for game metadata and one
for the ordered event sequence. The event frame is used both for the timeline
and for derived totals, keeping displayed summaries traceable to their source
events.

## Testing

Backend tests cover:

- SQL query loading and path validation;
- DataFrame schema inference;
- event descriptions;
- game-summary calculations;
- playoff game-ID decoding;
- eventless game handling;
- API response contracts;
- calendar and team-filter parameters.
- player search parameters;
- skater scoring and shooting summaries;
- goalie save-percentage summaries;
- player attempt provenance;
- dataset health verdicts and gap classification;
- observability API contracts, caching, and the unavailable state.

Frontend CI runs ESLint, TypeScript checking, and a production Next.js build.
