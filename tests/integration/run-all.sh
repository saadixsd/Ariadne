#!/usr/bin/env bash
# Runs every integration check locally. Never touches a remote database or a
# real LLM provider (a mock server stands in for Anthropic/OpenAI).
# Needs Node 22 (node:sqlite). Uses ports $DEV_PORT (default 3197, next dev) and $MOCK_PORT (default 4197, mock LLM).
# NOTE: recreates prisma/dev.db (the previous one is moved to prisma/dev.db.bak).
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:-/tmp/ariadne-integration-evidence}"
mkdir -p "$OUT"
DEV_PORT="${DEV_PORT:-3197}"
MOCK_PORT="${MOCK_PORT:-4197}"
# The box is shared with other workers: refuse to run against a port someone else owns.
for port in "$DEV_PORT" "$MOCK_PORT"; do
  if ss -ltn | grep -qE "[:.]$port\b"; then echo "port $port is busy; set DEV_PORT/MOCK_PORT" >&2; exit 1; fi
done

echo "== lib tests (temp DB built from migrations/, mock LLM)"
npx tsx --conditions=react-server --test tests/integration/pipeline.test.ts 2>&1 | tee "$OUT/pipeline.test.txt" | grep -E "^# (tests|pass|fail)"

echo "== migration tests"
node --test tests/integration/migrations.test.mjs 2>&1 | tee "$OUT/migrations.test.txt" | grep -E "^# (tests|pass|fail)"

echo "== wrangler d1 migrations apply --local (miniflare D1, prod-like start state)"
STATE="$(mktemp -d)"
export CI=1 WRANGLER_SEND_METRICS=false
{
  npx wrangler d1 execute ariadne --local --persist-to "$STATE" --file tests/integration/fixtures/prod-d1-as-built.sql
  npx wrangler d1 execute ariadne --local --persist-to "$STATE" --command 'ALTER TABLE "User" ADD COLUMN "firstName" TEXT; ALTER TABLE "User" ADD COLUMN "lastName" TEXT;'
  npx wrangler d1 migrations list ariadne --local --persist-to "$STATE"
  npx wrangler d1 migrations apply ariadne --local --persist-to "$STATE"
  npx wrangler d1 execute ariadne --local --persist-to "$STATE" --command "SELECT name FROM d1_migrations ORDER BY id"
} > "$OUT/wrangler-local-migrations.txt" 2>&1
grep -E "000[0-9]_" "$OUT/wrangler-local-migrations.txt" | tail -6
rm -rf "$STATE"

echo "== dev server HTTP tests"
[ -f prisma/dev.db ] && mv prisma/dev.db prisma/dev.db.bak
npx prisma db push --skip-generate > /dev/null 2>&1
node tests/integration/mock-llm.mjs "$MOCK_PORT" > "$OUT/mock.log" 2>&1 &
MOCK_PID=$!
ANTHROPIC_API_KEY=test-not-real OPENAI_API_KEY=test-not-real \
ANTHROPIC_BASE_URL="http://127.0.0.1:$MOCK_PORT" OPENAI_BASE_URL="http://127.0.0.1:$MOCK_PORT/v1" \
ANTHROPIC_MODEL=mock-claude OPENAI_MODEL=mock-gpt \
  npx next dev -p "$DEV_PORT" > "$OUT/dev-server.log" 2>&1 &
DEV_PID=$!
cleanup() {
  kill $DEV_PID $MOCK_PID 2>/dev/null || true
  # npx does not forward the signal to next-server; stop whatever still listens on our ports.
  for pid in $(ss -ltnp 2>/dev/null | grep -E "[:.]($DEV_PORT|$MOCK_PORT) " | grep -oP 'pid=\K[0-9]+' | sort -u); do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$DEV_PORT/sign-in" && break; sleep 1; done

echo "-- curl: 6 rapid signups from one IP (cf-connecting-ip: 203.0.113.50)" | tee "$OUT/curl-rate-limit.txt"
for i in 1 2 3 4 5 6; do
  curl -s -o /tmp/sb-curl-body -w "signup $i -> HTTP %{http_code}" -H "content-type: application/json" \
    -H "cf-connecting-ip: 203.0.113.50" -X POST "http://127.0.0.1:$DEV_PORT/api/auth/sign-up" \
    -d "{\"email\":\"curl$i-$RANDOM@test.dev\",\"password\":\"password123\"}" | tee -a "$OUT/curl-rate-limit.txt"
  echo "  $(cat /tmp/sb-curl-body)" | tee -a "$OUT/curl-rate-limit.txt"
done
echo "-- curl: legitimate signup from another IP (203.0.113.51)" | tee -a "$OUT/curl-rate-limit.txt"
curl -s -D - -o /tmp/sb-curl-body -w "HTTP %{http_code}\n" -H "content-type: application/json" -H "cf-connecting-ip: 203.0.113.51" \
  -X POST "http://127.0.0.1:$DEV_PORT/api/auth/sign-up" -d "{\"email\":\"curl-legit-$RANDOM@test.dev\",\"password\":\"password123\"}" \
  | grep -iE "^HTTP|set-cookie" | sed -E 's/(ariadne_session=)[^;]+/\1<redacted>/' | tee -a "$OUT/curl-rate-limit.txt"

BASE_URL="http://127.0.0.1:$DEV_PORT" node --test tests/integration/http.test.mjs 2>&1 | tee "$OUT/http.test.txt" | grep -E "^(not )?ok|^# (tests|pass|fail)"
echo "evidence in $OUT"
