from unittest.mock import AsyncMock

import pytest

from pucksstudio.db.pool import _configure_connection


@pytest.mark.asyncio
async def test_configures_read_only_queries_with_timeout() -> None:
    connection = AsyncMock()

    await _configure_connection(connection, 15_000)

    assert connection.execute.await_args_list[0].args == ("SET default_transaction_read_only = on",)
    assert connection.execute.await_args_list[1].args == (
        "SELECT set_config('statement_timeout', %s, false)",
        ("15000ms",),
    )
