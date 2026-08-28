from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from pucksstudio.config import Settings


async def _configure_connection(
    connection: AsyncConnection,
    statement_timeout_ms: int,
) -> None:
    await connection.execute("SET default_transaction_read_only = on")
    await connection.execute(
        "SELECT set_config('statement_timeout', %s, false)",
        (f"{statement_timeout_ms}ms",),
    )


class Database:
    """Lifecycle and access wrapper for the application connection pool."""

    def __init__(self) -> None:
        self._pool: AsyncConnectionPool | None = None

    async def open(self, settings: Settings) -> None:
        if self._pool is not None:
            return

        async def configure(connection: AsyncConnection) -> None:
            await _configure_connection(connection, settings.db_statement_timeout_ms)

        pool = AsyncConnectionPool(
            conninfo=settings.database_url,
            min_size=settings.db_min_size,
            max_size=settings.db_max_size,
            timeout=settings.db_pool_timeout_seconds,
            kwargs={"autocommit": True, "row_factory": dict_row},
            configure=configure,
            open=False,
        )
        await pool.open(wait=True)
        self._pool = pool

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[AsyncConnection]:
        if self._pool is None:
            raise RuntimeError("database pool is not open")
        async with self._pool.connection() as connection:
            yield connection

    async def ping(self) -> None:
        async with self.connection() as connection:
            await connection.execute("SELECT 1")


database = Database()
