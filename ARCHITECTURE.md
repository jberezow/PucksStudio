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
PucksStudio owns analytical queries, derived game summaries, API
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

Every derived result retains the contributing event records and their source
identifiers.

Postseason round, series, and game numbers are decoded from canonical NHL game
IDs. Eventless postseason records are treated as unplayed schedule
placeholders, while missing state on other records remains visible as
unavailable source data.

## Frontend

The frontend uses TypeScript, React, Next.js, and Tailwind CSS. It consumes
typed JSON responses and contains no database or SQL knowledge.

The game viewer maintains date, team, and game selection in URL parameters.
Schedule requests and game-detail requests are independently cancellable so
rapid navigation cannot display stale responses. Calendar dates distinguish
played games from schedule-only records, and expandable timeline rows expose
event provenance without crowding the default view.

The interface supports keyboard focus, reduced-motion preferences, responsive
schedule navigation, and explicit loading and retry states.

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

Frontend CI runs ESLint, TypeScript checking, and a production Next.js build.
