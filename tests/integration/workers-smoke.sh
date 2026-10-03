#!/usr/bin/env bash
# Smoke test against the real Workers build (opennextjs-cloudflare build) running in
# `wrangler dev --local` (workerd + local D1 migrated with migrations/). No keys are
# set, so model runs fail by design: that exercises "failed runs don't use quota".
# Usage: BASE=http://127.0.0.1:8797 PERSIST=/tmp/d1 bash tests/integration/workers-smoke.sh
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:8797}"
PERSIST="${PERSIST:?local D1 persist dir used by wrangler dev}"
R=$RANDOM
d1() { CI=1 npx wrangler d1 execute ariadne --local --persist-to "$PERSIST" --json --command "$1" 2>/dev/null; }
post() { curl -s -o /tmp/ws-body -w "%{http_code}" -H "content-type: application/json" -H "cf-connecting-ip: $1" ${3:+-H "cookie: $3"} -X "${4:-POST}" "$BASE$2" -d "${5:-{\}}"; }

echo "-- 6 signups from 192.0.2.$((R%200)) (CF-Connecting-IP)"
IP="192.0.2.$((R%200))"
for i in 1 2 3 4 5 6; do echo "signup $i: $(post "$IP" /api/auth/sign-up "" POST "{\"email\":\"w$i-$R@test.dev\",\"password\":\"password123\"}") $(cat /tmp/ws-body)"; done
echo "-- legit signup from another IP"
curl -s -D /tmp/ws-h -o /tmp/ws-body -w "%{http_code}\n" -H "content-type: application/json" -H "cf-connecting-ip: 192.0.2.250" -X POST "$BASE/api/auth/sign-up" -d "{\"email\":\"wlegit-$R@test.dev\",\"password\":\"password123\"}"
COOKIE="ariadne_session=$(grep -i set-cookie /tmp/ws-h | sed -E 's/.*ariadne_session=([^;]+).*/\1/' | tr -d '\r')"
echo "-- RateLimit rows in D1:"; d1 'SELECT key, count FROM "RateLimit" ORDER BY count DESC LIMIT 3' | grep -E '"(key|count)"'
echo "-- onboarding: $(post 192.0.2.250 /api/onboarding "$COOKIE" POST '{"name":"Workers smoke","brief":"Test brief."}') $(cat /tmp/ws-body)"
PID=$(sed -E 's/.*"id":"([^"]+)".*/\1/' /tmp/ws-body)
echo "-- board page: $(curl -s -o /dev/null -w '%{http_code}' -H "cookie: $COOKIE" "$BASE/?project=$PID")  tree page: $(curl -s -o /dev/null -w '%{http_code}' -H "cookie: $COOKIE" "$BASE/tree?project=$PID")"
echo "-- brief 5001 chars: $(post 192.0.2.250 /api/projects/$PID "$COOKIE" PATCH "{\"brief\":\"$(printf 'b%.0s' $(seq 1 5001))\"}") $(cat /tmp/ws-body | cut -c1-120)"
TASK=$(curl -s -H "cookie: $COOKIE" "$BASE/api/projects/$PID" | sed -E 's/.*"tasks":\[\{"id":"([^"]+)".*/\1/')
echo "-- run task 1 without API keys (must fail, no quota used): $(post 192.0.2.250 /api/tasks/$TASK/run "$COOKIE") $(cat /tmp/ws-body)"
echo "-- UsageDay runs:"; d1 'SELECT runs FROM "UsageDay"' | grep '"runs"' || echo "   (no UsageDay row with runs>0)"
echo "-- runs history: $(curl -s -H "cookie: $COOKIE" "$BASE/api/tasks/$TASK/runs" | sed -E 's/"(systemPrompt|prompt)":"[^"]*"/"\1":"…"/g' | cut -c1-400)"
echo "-- simulate stuck run (running, startedAt 10 min ago) then poll events:"
d1 "UPDATE \"Task\" SET status='running', startedAt='$(date -u -d '-10 min' +%Y-%m-%dT%H:%M:%S.000+00:00)' WHERE id='$TASK'" > /dev/null
curl -s -H "cookie: $COOKIE" "$BASE/api/projects/$PID/events" | grep -o '"message":"Recovered[^"]*"' | head -1
echo "   task status now: $(d1 "SELECT status FROM \"Task\" WHERE id='$TASK'" | grep -o '"status": "[a-z_]*"')"
echo "   TaskRun outcomes: $(d1 "SELECT outcome FROM \"TaskRun\" WHERE taskId='$TASK' ORDER BY attempt" | grep -o '"outcome": "[a-z]*"' | tr '\n' ' ')"
