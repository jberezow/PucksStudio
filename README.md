# PucksStudio

PucksStudio is a read-only analytics and visualization application built on top of [PucksData](https://github.com/jberezow/PucksData).

It provides a way to explore NHL players, games, teams, seasons, and event data while also validating that the normalized PucksData database produces coherent hockey statistics.

## Features

Planned functionality includes:

- player, game, team, and season exploration;
- scoring and event-level drill-down;
- shot and goal visualizations;
- game event timelines;
- derived statistics built from atomic play-by-play records;
- consistency checks across related data;
- representative query performance measurements;
- tabular export for further analysis.

PucksStudio does not call NHL APIs directly. It uses the PostgreSQL database produced by PucksData as its sole application data source.

## Stack

### Backend

- Python
- FastAPI
- Psycopg 3
- PostgreSQL / Neon
- Polars
- Pydantic
- pytest
- Ruff

### Frontend

- TypeScript
- React
- Next.js
- Tailwind CSS
- shadcn/ui

Important analytical queries are kept as explicit PostgreSQL SQL, with Polars used for DataFrame transformations and derived analysis.

## Architecture

```text
PucksData / Neon PostgreSQL
          |
          v
      PostgreSQL
          |
          v
   Polars DataFrames
          |
          v
       FastAPI
          |
          v
 Next.js / TypeScript
```

PucksStudio has read-only access to the PucksData database. Database ingestion, schema ownership, migrations, and repairs remain the responsibility of PucksData.

More detail is available in [ARCHITECTURE.md](ARCHITECTURE.md).

## Status

Initial development.

## License

MIT
