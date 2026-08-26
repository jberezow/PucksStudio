# AGENTS.md

Project instructions for coding agents working on PucksStudio.

## Read first

Before substantial changes, read:

1. `README.md`
2. `ARCHITECTURE.md`

Treat `ARCHITECTURE.md` as the durable source of truth for system boundaries.

## Hard boundaries

- PucksStudio is a **read-only downstream consumer** of the PucksData PostgreSQL database.
- **Never call NHL APIs from PucksStudio.** Missing source data belongs in PucksData.
- Do not add database migrations or production write paths.
- Do not introduce an ORM without an explicit architecture change.
- Keep important analytical SQL explicit and inspectable; prefer canonical `.sql` files for substantial queries.
- Use PostgreSQL for joins/filtering/reduction and Polars for analytical transformations when that split is clearer.
- Do not duplicate a production query just to benchmark it. Benchmark the real query.
- Preserve provenance: derived statistics should be traceable to contributing event records.
- Do not extract a shared Python package prematurely. Structure reusable code cleanly inside PucksStudio first.

## Preferred stack

Backend:

- Python 3.12+
- uv
- FastAPI
- Psycopg 3 + pooling
- Polars
- Pydantic where useful
- pytest
- Ruff

Frontend:

- TypeScript
- React
- Next.js
- Tailwind CSS
- shadcn/ui

Favor mainstream, maintainable tooling over niche frameworks.

## Separation of concerns

Keep these responsibilities distinct:

- `db/`: connections, pooling, low-level execution
- `queries/`: query definitions and SQL loading
- `queries/sql/`: canonical SQL files
- `hockey/`: domain transformations and DataFrame logic
- `validation/`: reconciliation and consistency checks
- `benchmarks/`: timing/query-plan tooling that reuses production queries
- `api/`: FastAPI routing/serialization only
- frontend: presentation only; no SQL/schema knowledge

Do not place substantial SQL in API route handlers or substantial analytical logic in frontend components.

## Query and benchmark design

When adding an important query:

1. give it a stable identity/name;
2. keep the SQL readable and parameterized;
3. return only columns needed for the analytical task;
4. preserve enough identifiers for drill-down/provenance;
5. make query timing and row count observable;
6. allow the same query definition to be used by benchmark tooling;
7. add tests around both query-facing behavior and downstream Polars transformations where practical.

Leave room for later `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` support.

## First implementation target

Build generic player scoring exploration, using Sidney Crosby only as an acceptance/example case:

- select/search player;
- select season or career range;
- query scoring events from PucksData;
- load into Polars;
- derive goals/assists and useful splits;
- expose through FastAPI;
- visualize in the frontend;
- drill totals down to contributing events;
- report query latency and row count;
- test the vertical slice.

Do not hard-code player-specific behavior.

## Working style

- Prefer small, reviewable commits and changes.
- Update docs when architecture or public behavior changes.
- Avoid speculative abstractions that have no current consumer.
- If a requested feature conflicts with `ARCHITECTURE.md`, call out the conflict before implementing it.
