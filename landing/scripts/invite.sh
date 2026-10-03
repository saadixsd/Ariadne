#!/usr/bin/env bash
# Mark someone as invited in D1 (after adding them to the Cloudflare Access policy).
#   scripts/invite.sh person@example.com            (live D1)
#   scripts/invite.sh person@example.com --local    (local dev D1)
set -euo pipefail
cd "$(dirname "$0")/.."
EMAIL="$(printf '%s' "${1:?usage: scripts/invite.sh email [--local]}" | tr '[:upper:]' '[:lower:]')"
[[ "$EMAIL" =~ ^[^\'[:space:]]+@[^\'[:space:]]+$ ]] || { echo "that doesn't look like an email" >&2; exit 1; }
npx wrangler d1 execute ariadne-early-access "${2:---remote}" --command \
  "UPDATE requests SET status = 'invited', invited_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE email = '$EMAIL' AND status = 'new'; SELECT email, status, invited_at FROM requests WHERE email = '$EMAIL';"
