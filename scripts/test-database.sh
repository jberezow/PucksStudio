#!/usr/bin/env bash
set -euo pipefail
studio_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
studio_container="pucksstudio-test-${RANDOM}-$$"
studio_migrations="${PUCKSDATA_MIGRATIONS:-$(dirname "$studio_root")/PucksData/migrations}"
trap 'docker rm -f "$studio_container" >/dev/null 2>&1 || true' EXIT

docker run --detach --rm --name "$studio_container" \
  -e POSTGRES_PASSWORD=studio_test -e POSTGRES_DB=pucksstudio_test \
  -p 127.0.0.1::5432 postgres:16 >/dev/null
for attempt in {1..30}; do
  if docker exec "$studio_container" pg_isready -U postgres -d pucksstudio_test >/dev/null; then
    break
  fi
  sleep 1
done
studio_port="$(docker port "$studio_container" 5432/tcp | head -1 | cut -d: -f2)"
cd "$studio_root/backend"
TEST_DATABASE_URL="postgresql://postgres:studio_test@127.0.0.1:${studio_port}/pucksstudio_test" \
PUCKSDATA_MIGRATIONS="$studio_migrations" uv run pytest
