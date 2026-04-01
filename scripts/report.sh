#!/usr/bin/env bash
# report.sh — one-liner hook for any Claude Code / OpenClaw agent
#
# POST an activity event to erpofone from any agent session.
# Drop this in an agent's workspace or call it from a Claude Code hook.
#
# Usage:
#   ./report.sh "BiotechRoles — CEO" "completed competitor analysis"
#   PAPERCLIP_HQ_URL=http://myserver:3000 ./report.sh "Hermes" "sent 12 outreach emails"
#
# Or wire it as a Claude Code Stop hook in ~/.claude/settings.json:
#   "hooks": { "Stop": [{ "matcher": "", "hooks": [{ "type": "command",
#     "command": "/path/to/report.sh \"$AGENT_NAME\" \"Session ended\"" }] }] }

AGENT_NAME="${1:-Unknown Agent}"
ACTION="${2:-Session completed}"
TOKENS="${3:-0}"
COST="${4:-0}"

HQ_URL="${PAPERCLIP_HQ_URL:-http://localhost:3000}"
TOKEN="${PAPERCLIP_HQ_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "[report.sh] No PAPERCLIP_HQ_TOKEN set — skipping" >&2
  exit 0
fi

curl -s -X POST "${HQ_URL}/api/ingest/activity" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"agentName\":\"${AGENT_NAME}\",\"action\":\"${ACTION}\",\"tokens\":${TOKENS},\"cost\":${COST}}" \
  > /dev/null

echo "[report.sh] reported: ${AGENT_NAME} → ${ACTION}"
