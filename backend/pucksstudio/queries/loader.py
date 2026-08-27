from functools import lru_cache
from importlib.resources import files


@lru_cache
def load_query(name: str) -> str:
    """Load a canonical SQL query by its stable file name."""

    if not name.isidentifier():
        raise ValueError(f"invalid query name: {name!r}")

    query = files("pucksstudio.queries.sql").joinpath(f"{name}.sql")
    if not query.is_file():
        raise KeyError(f"unknown query: {name}")
    return query.read_text(encoding="utf-8")
