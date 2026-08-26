# PucksStudio

PucksStudio is the analytical and validation workbench for [PucksData](https://github.com/jberezow/PucksData).

PucksData owns ingestion and normalization of NHL data into PostgreSQL. PucksStudio is its first downstream application: a read-only Python and TypeScript application for exploring that database, deriving hockey statistics from atomic events, visualizing results, validating internal consistency, and measuring the performance of representative analytical queries.

The project is intended both as a useful hockey data application and as a portfolio project demonstrating practical data-science software development across SQL, Python, Polars, backend APIs, frontend visualization, and database performance.

## Place in the Pucks suite

| Project | Responsibility | Primary engineering focus |
| --- | --- | --- |
| **PucksData** | NHL source data -> reliable relational database | Data engineering |
| **PucksStudio** | Database -> exploration, visualization, validation, and benchmarks | Data science / full-stack analytics |
| **PucksPredict** *(planned)* | Event sequences -> predictive models | ML engineering |
| **PucksQuery** *(planned)* | Natural language -> hockey data queries | AI engineering |

PucksStudio is deliberately the first Python consumer of PucksData. Its internal analytical interfaces should be designed cleanly enough that useful abstractions can later be extracted for PucksPredict and PucksQuery, but no shared package will be created until real reuse justifies it.

## Core principles

- **PucksData is the data boundary.** PucksStudio reads the PucksData PostgreSQL database and never calls NHL APIs.
- **Read only.** PucksStudio does not own migrations, ingestion, repairs, or production writes.
- **SQL stays visible.** Important analytical queries live as explicit PostgreSQL `.sql` files rather than being hidden behind an ORM.
- **PostgreSQL does relational work.** Filtering, joins, and sensible data reduction happen close to the database.
- **Polars does analytical work.** DataFrame transformations, derived statistics, validation logic, and analysis belong in Python when that representation is clearer than SQL.
- **Benchmarks are real workloads.** The queries benchmarked by PucksStudio should be the same canonical queries used by the application.
- **Provenance matters.** Derived totals should be traceable back to the events that produced them.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the technical boundaries behind these decisions.

## Initial use cases

PucksStudio should eventually provide first-class exploration for players, games, teams, and seasons.

Early examples include:

- derive a player's goals and assists directly from normalized event records;
- inspect every event contributing to a season or career total;
- identify internally inconsistent aggregations or suspicious event attribution;
- reconstruct a game's scoring progression from its event sequence;
- visualize shots, goals, event timelines, scoring splits, and other derived results;
- run representative high-value queries against Neon and expose their latency and result size;
- inspect database query plans when performance work is needed;
- export useful analytical results as DataFrames or tabular files.

A motivating validation case is Sidney Crosby scoring. Historical goal attribution can change after a game—for example, a goal initially associated with one player may later be credited as a teammate's tip-in. PucksStudio should make it easy to derive a player's total from the stored atomic events and drill from the aggregate all the way down to the contributing records. The purpose is not to silently consult another NHL API for the answer; it is to make the contents and internal consistency of PucksData observable.

## Proposed stack

### Backend

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) for Python project and dependency management
- FastAPI
- Psycopg 3 with connection pooling
- PostgreSQL / Neon
- Polars
- Pydantic where typed API/domain models are useful
- pytest
- Ruff

No ORM is planned. Psycopg manages connection and execution mechanics while PucksStudio retains direct control over its SQL.

### Frontend

- TypeScript
- React
- Next.js
- Tailwind CSS
- shadcn/ui

Visualization libraries should be selected pragmatically. Mainstream chart components are preferred for ordinary plots; lower-level tools such as D3 should only be introduced where a hockey-specific visualization genuinely requires them.

## Intended data flow

```text
PucksData / Neon PostgreSQL
          |
          | read-only SQL
          v
   canonical queries
          |
          v
   Polars DataFrames
          |
          v
 transformations / validation
          |
          v
       FastAPI
          |
          v
 Next.js / React / TypeScript
```

For large analytical extracts, an Arrow-oriented database-to-Polars path may be introduced later if measurement demonstrates a meaningful benefit. It should be treated as an optimization, not a competing data-access architecture.

## First vertical slice

The first substantial feature should exercise the full stack with player scoring data:

1. search/select a player;
2. select a season or career range;
3. query the player's scoring events from PucksData;
4. return the raw result as a Polars DataFrame;
5. derive totals and useful splits with Polars;
6. expose the results through FastAPI;
7. visualize them in the TypeScript frontend;
8. allow aggregates to be drilled down to their contributing events;
9. report query latency and result size;
10. cover the query and transformations with tests.

The implementation should be generic even if Sidney Crosby is used as an early acceptance case.

## Status

PucksStudio is at the initial architecture/scaffolding stage.

## License

MIT
