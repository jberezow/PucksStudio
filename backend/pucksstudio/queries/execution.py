from dataclasses import dataclass
from time import perf_counter
from typing import Any

import polars as pl

from pucksstudio.db.pool import Database
from pucksstudio.queries.loader import load_query


@dataclass(frozen=True)
class QueryResult:
    name: str
    frame: pl.DataFrame
    elapsed_ms: float

    @property
    def row_count(self) -> int:
        return self.frame.height


def rows_to_dataframe(rows: list[dict[str, Any]]) -> pl.DataFrame:
    """Build a frame without guessing nullable column types from an early sample."""

    return pl.DataFrame(rows, infer_schema_length=None)


async def fetch_dataframe(
    db: Database,
    query_name: str,
    parameters: dict[str, Any],
) -> QueryResult:
    """Execute a canonical query and return its rows with basic timing metadata."""

    started = perf_counter()
    async with db.connection() as connection:
        cursor = await connection.execute(load_query(query_name), parameters)
        rows = await cursor.fetchall()

    return QueryResult(
        name=query_name,
        frame=rows_to_dataframe(rows),
        elapsed_ms=(perf_counter() - started) * 1_000,
    )
