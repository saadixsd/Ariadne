#!/usr/bin/env bash
# Export early-access requests to a CSV you can open in Sheets/Excel.
#   scripts/export.sh                 -> early-access-YYYY-MM-DD.csv from the live D1
#   scripts/export.sh --local         -> same, from the local wrangler dev database
#   STATUS=new scripts/export.sh      -> only people not yet invited
set -euo pipefail
cd "$(dirname "$0")/.."
WHERE=""
if [[ -n "${STATUS:-}" ]]; then
  [[ "$STATUS" =~ ^(new|invited)$ ]] || { echo "STATUS must be new or invited" >&2; exit 1; }
  WHERE="WHERE status = '$STATUS'"
fi
TARGET="${1:---remote}"
OUT="early-access-$(date +%F).csv"
SQL="SELECT id, email, created_at, completed_at, status, invited_at, uses_ai_for, tools, tools_other, switching, referrer, utm_source, utm_medium, utm_campaign FROM requests $WHERE ORDER BY created_at"
npx wrangler d1 execute ariadne-early-access "$TARGET" --json --command "$SQL" \
  | node -e '
    let raw = ""; process.stdin.on("data", (c) => (raw += c)).on("end", () => {
      const rows = JSON.parse(raw)[0].results;
      const cols = ["id","email","created_at","completed_at","status","invited_at","uses_ai_for","tools","tools_other","switching","referrer","utm_source","utm_medium","utm_campaign"];
      // quote every field; neutralise leading = + - @ so a spreadsheet never runs a formula
      const cell = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "\x27" + s; return "\"" + s.replace(/"/g, "\"\"") + "\""; };
      process.stdout.write(cols.join(",") + "\n" + rows.map((r) => cols.map((c) => cell(r[c])).join(",")).join("\n") + "\n");
      console.error(rows.length + " rows");
    });' > "$OUT"
echo "wrote $OUT"
