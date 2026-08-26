# PucksStudio Architecture

This document records the durable architectural decisions for PucksStudio. It exists both for human contributors and for coding agents working in the repository.

## 1. System boundary

PucksStudio is a downstream consumer of PucksData.

```text
Unofficial NHL sources
        |
        v
    PucksData
        |
        v
Neon PostgreSQL
        |
        | read-only
        v
   PucksStudio
```

PucksStudio must not call NHL APIs. If required information is absent from the database, that is a PucksData concern and should be addressed in the ingestion engine rather than bypassed from Studio.

External validation may be added later from clearly separate sources such as scraped public reference pages, but it must never become a hidden alternate data path for normal application queries.

## 2. Database ownership

PucksData owns:

- schema and migrations;
- ingestion and synchronization;
- normalization;
- data repair;
- production writes.

PucksStudio owns:

- read-only analytical queries;
- derived statistics;
- validation and reconciliation logic;
- query benchmarks and observability;
- API presentation;
- frontend visualization.

PucksStudio should use a read-only database role in deployed environments.

## 3. SQL philosophy

Important SQL is source code and should remain visible.

PucksStudio intentionally does not use an ORM. Psycopg 3 provides connection management, pooling, parameter binding, and execution while preserving direct PostgreSQL expressivity.

Canonical analytical queries should live in version-controlled `.sql` files when doing so improves readability, inspectability, reuse, or benchmarking.

Examples:

```text
backend/pucksstudio/queries/sql/player_scoring_events.sql
backend/pucksstudio/queries/sql/game_event_sequence.sql
backend/pucksstudio/queries/sql/season_scoring_leaders.sql
```

Small or highly dynamic queries may be constructed in Python when that is clearly simpler, but abstractions should not obscure SQL for its own sake.

### Division of responsibility

Use PostgreSQL for work naturally expressed relationally:

- joins;
- filtering;
- predicates;
- ordering;
- selecting required columns;
- reasonable aggregation or reduction when it substantially limits transferred data.

Use Polars when the analytical representation is clearer:

- DataFrame transformations;
- derived statistics;
- cumulative calculations;
- reshaping;
- complex group operations;
- validation comparisons;
- visualization preparation.

Do not pull an entire league-scale table into Python merely to apply filters that PostgreSQL can perform efficiently. Conversely, do not force every analytical transformation into SQL when Polars produces clearer, more maintainable logic.

## 4. DataFrame boundary

Polars is the primary analytical data structure in the backend.

A typical operation should look conceptually like:

```text
canonical SQL
    |
    v
raw Polars DataFrame
    |
    v
transform / derive / validate
    |
    v
domain/API result
```

Database details should not leak unnecessarily into analytical callers. Over time, useful interfaces may look like:

```python
get_player_scoring_events(...)
get_game_events(...)
get_season_events(...)
```

with Polars DataFrames or well-defined domain results at their boundaries.

These interfaces should be designed cleanly because some may eventually become reusable by PucksPredict and PucksQuery. Do not extract a shared package prematurely; wait until at least one real downstream consumer demonstrates concrete reuse.

## 5. Backend architecture

Initial backend stack:

- Python 3.12+
- uv
- FastAPI
- Psycopg 3
- Psycopg connection pooling
- Polars
- Pydantic where useful
- pytest
- Ruff

A reasonable initial package shape is:

```text
backend/
  pucksstudio/
    api/
    db/
    queries/
      sql/
    hockey/
      players/
      games/
      teams/
      seasons/
      events/
    validation/
    benchmarks/
```

Exact folders may evolve. Preserve the separation of concerns:

- API routes should not contain substantial SQL;
- SQL execution code should not contain frontend/API serialization logic;
- hockey transformations should not depend on FastAPI;
- benchmark code should reuse production queries rather than duplicate them.

## 6. Frontend architecture

Initial frontend stack:

- TypeScript
- React
- Next.js
- Tailwind CSS
- shadcn/ui

Favor mainstream, maintainable tools over unusual frameworks or clever abstractions.

Use ordinary chart libraries for ordinary charts. Introduce D3 or lower-level visualization tooling only when a hockey-specific visualization requires it, such as custom rink geometry or bespoke event interactions.

The frontend should consume typed API responses and should not contain knowledge of database schema or SQL.

## 7. Validation philosophy

PucksStudio focuses on semantic and internal consistency rather than ingestion mechanics.

PucksData already answers questions such as:

- was a completed game loaded?;
- is a typed child row structurally present?;
- did the backfill complete?

PucksStudio should answer questions such as:

- do atomic goal events reconstruct the recorded game score?;
- do player scoring events produce coherent season totals?;
- can every aggregate be traced back to contributing events?;
- do related representations of the same hockey fact agree?;
- are chronological event sequences internally valid?;

A failure should be inspectable rather than merely reported as a number.

### Example: player scoring provenance

For a player's derived season total, PucksStudio should make it possible to drill from:

```text
36 goals
```

to the 36 contributing event records, including game, time, scorer, assists, shot type, strength state, and any other relevant stored metadata.

This provenance-first design is useful both for data validation and for future feature engineering.

## 8. Benchmarking philosophy

Benchmarking is a first-class application capability.

The key rule is:

> Benchmark the queries the application actually uses.

Do not maintain a disconnected suite of synthetic SQL whose performance has no bearing on Studio workloads.

The query execution layer should make it practical to capture at least:

- elapsed database/query time;
- row count;
- query identity;
- relevant parameters or parameter shape where safe.

The design should leave room for later support for:

- repeated runs;
- cold/warm comparisons;
- p50/p95 latency;
- performance regressions;
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`;
- index and query-plan inspection;
- large-extract throughput measurements.

Do not prematurely turn CI into a brittle latency gate against a remote database. Performance regression checks should only be introduced when there is a stable execution environment and a clear baseline.

## 9. Large analytical extracts

The default database path is Psycopg.

For large result sets, an Arrow-oriented path into Polars (for example via ADBC or another supported connector) may be introduced if benchmarks show a material benefit.

Such a path must remain an optimization behind a stable analytical interface. Callers should not need to know whether a DataFrame arrived through Psycopg or a bulk Arrow-oriented reader.

## 10. First vertical slice

The first substantive feature should be generic player scoring exploration, with Sidney Crosby as a useful acceptance case.

Required capabilities:

1. search/select a player;
2. select a season or career range;
3. query scoring events from PucksData;
4. represent the raw result in Polars;
5. derive goal/assist totals and useful splits;
6. expose results through FastAPI;
7. visualize results in the frontend;
8. drill aggregates down to contributing event records;
9. capture query latency and row count;
10. test both SQL-facing behavior and Polars transformations.

The feature should not hard-code Crosby-specific assumptions.

## 11. Future suite integration

PucksStudio is intentionally the first Python downstream application in the Pucks suite.

```text
PucksData
   |
   v
PucksStudio
   |
   | reusable analytical abstractions may emerge here
   |
   +------> PucksPredict
   |
   +------> PucksQuery
```

Likely future reusable territory includes:

- canonical event DataFrame schemas;
- player/game/season query interfaces;
- event-sequence assembly;
- common hockey-domain transformations.

FastAPI routes, Studio-specific serialization, frontend code, and UI-specific benchmark presentation should remain application-specific.

## 12. Non-goals for the initial project

PucksStudio is not initially responsible for:

- NHL API ingestion;
- database migrations;
- repairing PucksData;
- user authentication;
- fantasy scoring;
- expected-goals or WAR modeling;
- natural-language querying;
- predictive ML;
- extracting a shared Python package before concrete reuse exists.

Those boundaries can change deliberately later, but they should not drift accidentally during implementation.
