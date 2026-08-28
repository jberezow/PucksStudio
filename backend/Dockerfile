FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy
WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY backend/pucksstudio ./pucksstudio
RUN uv sync --locked --no-dev --no-editable

FROM python:3.12-slim AS runtime

ENV PATH="/app/.venv/bin:$PATH" \
    PORT=8000 \
    PYTHONUNBUFFERED=1
WORKDIR /app

COPY --from=builder /app/.venv ./.venv

EXPOSE 8000
CMD ["sh", "-c", "uvicorn pucksstudio.api.main:app --host 0.0.0.0 --port ${PORT}"]
