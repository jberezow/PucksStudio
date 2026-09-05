from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from psycopg.errors import InsufficientPrivilege, InvalidSchemaName, UndefinedColumn, UndefinedTable


def register_schema_errors(app: FastAPI) -> None:
    async def schema_unavailable(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Dataset schema unavailable. PucksStudio requires PucksData migrations "
                    "through 0018 and reader access to public, analytics, and observability."
                )
            },
        )

    for error_type in (InsufficientPrivilege, UndefinedColumn, UndefinedTable, InvalidSchemaName):
        app.add_exception_handler(error_type, schema_unavailable)
