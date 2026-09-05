# PucksStudio

PucksStudio is a read-only NHL analytics explorer built on the normalized PostgreSQL
data produced by [PucksData](https://github.com/jberezow/pucksdata). It combines
an analytical Python backend with a responsive web interface for inspecting
games, players, goalies, and their underlying play-by-play events.

## Features

- Browse a monthly game calendar and filter the schedule by team.
- Move directly between game days without stepping through empty dates.
- Compare scores, period scoring, shots on goal, hits, penalty minutes, and
  faceoff wins.
- Filter the event timeline by goals, penalties, shots, hits, or faceoffs.
- Explore shots and goals on an interactive full-rink view, filtered by team,
  period, shot type, and strength.
- Expand events to inspect coordinates, player identifiers, strength state,
  and source event identifiers.
- Distinguish completed games from unplayed playoff schedule placeholders.
- Share a selected date, team, and game through URL parameters.
- Search the player archive by name and role.
- Compare season and postseason scoring or goaltending totals derived from
  traceable events.
- Explore normalized skater shot maps and goalie shots-faced maps by outcome,
  shot type, and strength.
- Switch season maps between normalized and raw NHL coordinates.
- Follow map markers, game-log entries, scorers, shooters, and assists between
  player profiles and source games.
- Preserve player searches and profile season selections in shareable URLs.
- Limit player season selectors to seasons with attributable events or official totals.
- Use PucksData's coverage contract to distinguish untracked statistics from zero.
- Compare official NHL season totals with event-derived counts, showing differences.
- Include seasons with official totals even when the player has no tracked events.
- Inspect strength provenance and shooting-team strength, including unknown values.
- Display known source caveats such as incomplete 2009–10 play-by-play.
- Inspect query latency and source row counts in the interface.
- Check dataset health: event coverage per season, goal-to-shot consistency,
  sync freshness, and the games still missing play-by-play.

## Architecture

```text
PucksData PostgreSQL
        |
        v
Canonical SQL queries
        |
        v
Polars DataFrames
        |
        v
FastAPI
        |
        v
Next.js
```

PostgreSQL handles filtering, joins, and ordered event retrieval. Polars derives
game summaries from the resulting event frames. FastAPI exposes typed,
read-only endpoints consumed by the Next.js frontend.

PucksStudio does not call NHL APIs or modify the source database. See
[ARCHITECTURE.md](ARCHITECTURE.md) for implementation details.

## Requirements

- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/)
- Node.js 22 or newer
- A PostgreSQL database populated by PucksData
- A PostgreSQL role with read-only access

## Setup

Clone the repository and configure the backend:

```bash
git clone https://github.com/jberezow/PucksStudio.git
cd PucksStudio
cp .env.example .env
```

Set `DATABASE_URL` in `.env`, then install the Python dependencies:

```bash
uv sync --project backend --dev
```

Configure and install the frontend:

```bash
cd frontend
cp .env.example .env.local
npm ci
cd ..
```

## Run locally

Start the API from the repository root:

```bash
uv run --project backend uvicorn pucksstudio.api.main:app \
  --reload \
  --env-file .env
```

The API is available at `http://localhost:8000`. OpenAPI documentation is
available at `http://localhost:8000/docs`.

In another terminal, start the frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

## Configuration

Backend configuration is read from environment variables:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string for a read-only role |
| `PUCKSSTUDIO_DB_MIN_SIZE` | No | `1` | Minimum database pool size |
| `PUCKSSTUDIO_DB_MAX_SIZE` | No | `5` | Maximum database pool size |
| `PUCKSSTUDIO_DB_POOL_TIMEOUT_SECONDS` | No | `10` | Maximum wait for a pooled connection |
| `PUCKSSTUDIO_DB_STATEMENT_TIMEOUT_MS` | No | `15000` | PostgreSQL query timeout in milliseconds |
| `PUCKSSTUDIO_CORS_ORIGINS` | No | `["http://localhost:3000"]` | Allowed frontend origins |
| `PUCKSSTUDIO_SYNC_OVERDUE_HOURS` | No | `36` | Hours since the last successful PucksData sync before the health page reports it overdue |
| `PUCKSSTUDIO_OBSERVABILITY_CACHE_SECONDS` | No | `60` | How long the dataset health snapshot is reused between requests |

The frontend uses `NEXT_PUBLIC_API_URL`, which defaults to
`http://localhost:8000` in its example environment file.

For production, use the direct HTTPS origins of the deployed services. Pass
`NEXT_PUBLIC_API_URL` while building the frontend because public Next.js
variables are embedded in the browser bundle. Keep `DATABASE_URL` exclusively
in the backend runtime environment and use a PostgreSQL role restricted to
read-only access.

## Containers

The repository includes separate production images for the API and web
interface. Build them from the repository root:

```bash
docker build -f backend/Dockerfile -t pucksstudio-api .
docker build \
  -f frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  -t pucksstudio-web \
  .
```

The API listens on port `8000` by default and the web interface on port `3000`.
Both respect a runtime `PORT` variable. The API container expects its database
and CORS settings at runtime; credentials are never built into either image.

## API

The frontend uses these endpoints:

| Endpoint | Description |
| --- | --- |
| `GET /api/v1/health` | Process health |
| `GET /api/v1/ready` | Database schema and reader-permission readiness |
| `GET /api/v1/games` | Games and adjacent game dates, optionally filtered by date and team |
| `GET /api/v1/games/calendar` | Monthly game-day counts, optionally filtered by team |
| `GET /api/v1/games/teams` | Teams represented in the game archive |
| `GET /api/v1/games/{game_id}` | Game summary and event sequence |
| `GET /api/v1/players` | Player search, optionally filtered by skater or goalie |
| `GET /api/v1/players/{player_id}` | Season-aware player profile, event totals, game log, and shot locations |
| `GET /api/v1/observability/dataset` | Dataset health verdict, sync freshness, and per-season coverage from PucksData's observability views |
| `GET /api/v1/observability/seasons/{season}/missing-games` | Completed games in a season without events, with their backfill checkpoint state |

## PucksData compatibility

This version requires **PucksData 1.7.0 with migrations through 0018**. In particular,
strength is nullable and relative to the event owner, and `strength_source`,
`analytics.coverage`, and the official season tables must exist. Run migrations
with the PucksData ingestion/admin role before upgrading Studio.

Grant the Studio reader access after applying migrations:

```sql
GRANT USAGE ON SCHEMA public, analytics, observability TO reader_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public, analytics, observability TO reader_role;
```

Replace `reader_role` with your existing read-only role. Studio does not apply
migrations, change grants, or ingest official statistics. Load official totals
from PucksData with `pucksdata fetch official-stats --season 20252026` (or omit
`--season` for all seasons). An empty official table is supported and shown as
unavailable; official-only seasons are included for players in the player archive.

`/api/v1/ready` checks the required query columns and reader permissions without
scanning event data. Missing schema or grants return HTTP 503 with an upgrade hint.
The health page retains its separate dataset-unavailable state.

Official totals and tracked events are displayed separately. Differences mean
"inspect the source", not necessarily an ingestion failure. Coverage describes
when tracking began, not a guarantee of complete data in every game. Game logs
and maps always remain event-derived; unknown counts are shown as a dash.
Strength on shot maps describes the shooting team, including on goalie profiles.
Official shooting percentages are stored as fractions and displayed as percentages.

The CI contract test pins PucksData commit
`1866b3e71f1e1091af9ca52fba1470c12a7d46e7`. Update this pin deliberately alongside
future schema changes, and run the suite against the proposed PucksData checkout.

## Quality checks

Run the backend checks:

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

Run the frontend checks:

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

Run all backend tests against the sibling PucksData repository's actual migrations
in disposable PostgreSQL (requires Docker):

```bash
./scripts/test-database.sh
```

Set `PUCKSDATA_MIGRATIONS=/absolute/path/to/migrations` for another checkout.
The script uses a random local port and removes the container and its data on exit.
The integration test only uses `TEST_DATABASE_URL`, never `DATABASE_URL`, and
refuses a database whose name lacks `test` or already contains PucksData tables.
Without `TEST_DATABASE_URL`, only the database integration test is skipped.

The same checks run in GitHub Actions for pushes and pull requests targeting
`prime`, including the migration contract test with a restricted reader role.

## Project structure

```text
backend/
  pucksstudio/
    api/          FastAPI application and routes
    db/           Read-only PostgreSQL connection pool
    hockey/       Polars-based game transformations
    queries/      Query execution and canonical SQL
  tests/
frontend/
  src/
    app/          Next.js application shell and styles
    components/   Game, player, navigation, and rink components
```

## License

PucksStudio is available under the [MIT License](LICENSE).
