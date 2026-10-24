#!/usr/bin/env bash
# Nano Foundry — one-command bring-up.
#
#   ./deploy/bring-up.sh              # everything locally: app, API, filter service, sweep
#   ./deploy/bring-up.sh --vultr      # provision a Vultr instance and deploy onto it
#
# Local mode uses Timescale in Docker when Docker is available and falls back to
# the JSONL event buffer when it is not, so this works on a judge's laptop with
# nothing installed but Node and Python.

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="local"
[[ "${1:-}" == "--vultr" ]] && MODE="vultr"

log() { printf '\033[1;33m==\033[0m %s\n' "$*"; }

if [[ "$MODE" == "vultr" ]]; then
  : "${VULTR_API_KEY:?set VULTR_API_KEY (https://my.vultr.com/settings/#settingsapi)}"
  REGION="${VULTR_REGION:-dfw}"          # Dallas: closest to Austin for HackTX
  PLAN="${VULTR_PLAN:-vc2-1c-2gb}"
  OS_ID="${VULTR_OS_ID:-1743}"           # Ubuntu 22.04 LTS x64
  LABEL="${VULTR_LABEL:-nano-foundry}"

  log "Creating $PLAN in $REGION…"
  USER_DATA=$(base64 -w0 < deploy/cloud-init.yaml 2>/dev/null || base64 < deploy/cloud-init.yaml | tr -d '\n')

  RESPONSE=$(curl -sS -X POST "https://api.vultr.com/v2/instances" \
    -H "Authorization: Bearer $VULTR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"region\":\"$REGION\",\"plan\":\"$PLAN\",\"os_id\":$OS_ID,\"label\":\"$LABEL\",\"hostname\":\"$LABEL\",\"tags\":[\"hacktx\",\"nano-foundry\"],\"user_data\":\"$USER_DATA\",\"backups\":\"disabled\"}")

  ID=$(printf '%s' "$RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["instance"]["id"])')
  log "Instance $ID created. Waiting for an address…"

  for _ in $(seq 1 60); do
    IP=$(curl -sS "https://api.vultr.com/v2/instances/$ID" -H "Authorization: Bearer $VULTR_API_KEY" |
      python3 -c 'import json,sys; print(json.load(sys.stdin)["instance"]["main_ip"])')
    [[ "$IP" != "0.0.0.0" && -n "$IP" ]] && break
    sleep 5
  done

  log "Instance is at $IP"
  log "cloud-init installs Node, Python and TimescaleDB, clones this repo and starts both services."
  log "Point the .tech domain's A record at $IP, then: http://$IP/"
  exit 0
fi

# ---------- local ----------

log "Nano Foundry, local bring-up"

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  log "Docker found — starting TimescaleDB"
  docker compose -f deploy/docker-compose.yml up -d timescale
  export DATABASE_URL="${DATABASE_URL:-postgres://foundry:foundry@localhost:5432/foundry}"
  for _ in $(seq 1 30); do
    docker compose -f deploy/docker-compose.yml exec -T timescale pg_isready -U foundry >/dev/null 2>&1 && break
    sleep 2
  done
  log "Applying the hypertable schema"
  docker compose -f deploy/docker-compose.yml exec -T timescale \
    psql -U foundry -d foundry < tools/api/schema.sql >/dev/null
else
  log "No Docker — events will buffer to data/events.jsonl instead of Timescale"
fi

mkdir -p data
log "Starting the Node API and static server on :5173"
node tools/api/server.mjs & API_PID=$!

log "Starting the Python filter service on :8000"
python3 py/service.py & PY_PID=$!

sleep 2

log "Seeding the funnel history (60 pairs)"
node tools/sweep.mjs --pairs 60 >/dev/null || log "sweep skipped"

cat <<'BANNER'

  Nano Foundry is up.

    app + events      http://localhost:5173
    filter service    http://localhost:8000/health
    platform screen   http://localhost:5173/#platform  (Platform tab)

  Ctrl-C stops both services.

BANNER

trap 'kill $API_PID $PY_PID 2>/dev/null || true' INT TERM
wait $API_PID $PY_PID
