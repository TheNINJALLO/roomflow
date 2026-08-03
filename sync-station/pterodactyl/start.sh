#!/usr/bin/env bash
set -Eeuo pipefail

cd /home/container

: "${ROOMFLOW_FUNCTION_URL:?ROOMFLOW_FUNCTION_URL is required}"
: "${ROOMFLOW_STATION_ID:?ROOMFLOW_STATION_ID is required}"
: "${ROOMFLOW_STATION_TOKEN:?ROOMFLOW_STATION_TOKEN is required}"
: "${VNC_PASSWORD:?VNC_PASSWORD is required}"
: "${SERVER_PORT:?SERVER_PORT is required}"

if [[ ! "$SERVER_PORT" =~ ^[0-9]{2,5}$ ]]; then
  echo 'SERVER_PORT must be numeric.' >&2
  exit 64
fi
if (( ${#VNC_PASSWORD} < 16 || ${#VNC_PASSWORD} > 64 )); then
  echo 'VNC_PASSWORD must contain 16 to 64 characters.' >&2
  exit 64
fi
if [[ ! -f sync-station/server.mjs || ! -f townsquare-bridge-extension/manifest.json ]]; then
  echo 'Sync Station files are missing. Reinstall the Pterodactyl server.' >&2
  exit 66
fi

export DISPLAY=:99
export STATION_PORT=8787
export ROOMFLOW_STATION_VERSION="${ROOMFLOW_STATION_VERSION:-1.0.0}"
export STATION_POLL_INTERVAL_MS="${STATION_POLL_INTERVAL_MS:-5000}"
export XDG_RUNTIME_DIR=/home/container/data/runtime

mkdir -p data/chromium data/logs data/nginx/client_body data/nginx/proxy "$XDG_RUNTIME_DIR"
chmod 0700 data/chromium "$XDG_RUNTIME_DIR"

sed "s/{{SERVER_PORT}}/${SERVER_PORT}/g" sync-station/pterodactyl/nginx.conf.template > data/nginx.conf
x11vnc -storepasswd "$VNC_PASSWORD" data/vnc.pass >/dev/null
chmod 0600 data/vnc.pass
printf '%s\n' "$VNC_PASSWORD" | htpasswd -i -c -B data/novnc.htpasswd roomflow >/dev/null
chmod 0600 data/novnc.htpasswd

ROOMFLOW_CHILD_PIDS=()
cleanup() {
  trap - SIGINT SIGTERM EXIT
  for ROOMFLOW_CHILD_PID in "${ROOMFLOW_CHILD_PIDS[@]:-}"; do
    kill "$ROOMFLOW_CHILD_PID" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

Xvfb "$DISPLAY" -screen 0 "${DISPLAY_WIDTH:-1440}x${DISPLAY_HEIGHT:-900}x24" -nolisten tcp >data/logs/xvfb.log 2>&1 &
ROOMFLOW_CHILD_PIDS+=("$!")

for ROOMFLOW_X_ATTEMPT in $(seq 1 20); do
  [[ -S /tmp/.X11-unix/X99 ]] && break
  sleep 0.25
done
if [[ ! -S /tmp/.X11-unix/X99 ]]; then
  echo 'The virtual X display did not start.' >&2
  exit 70
fi

x11vnc -display "$DISPLAY" -rfbport 5900 -localhost -forever -shared -noxdamage -rfbauth data/vnc.pass >data/logs/x11vnc.log 2>&1 &
ROOMFLOW_CHILD_PIDS+=("$!")

websockify --web /usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900 >data/logs/websockify.log 2>&1 &
ROOMFLOW_CHILD_PIDS+=("$!")

node sync-station/server.mjs &
ROOMFLOW_CHILD_PIDS+=("$!")

chromium \
  --display="$DISPLAY" \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --disable-default-apps \
  --disable-features=TranslateUI \
  --no-first-run \
  --password-store=basic \
  --user-data-dir=/home/container/data/chromium \
  --disable-extensions-except=/home/container/townsquare-bridge-extension \
  --load-extension=/home/container/townsquare-bridge-extension \
  --window-size="${DISPLAY_WIDTH:-1440},${DISPLAY_HEIGHT:-900}" \
  http://127.0.0.1:8787/station >data/logs/chromium.log 2>&1 &
ROOMFLOW_CHILD_PIDS+=("$!")

nginx -c /home/container/data/nginx.conf -p /home/container &
ROOMFLOW_CHILD_PIDS+=("$!")

ROOMFLOW_READY=false
for ROOMFLOW_READY_ATTEMPT in $(seq 1 40); do
  if curl --fail --silent http://127.0.0.1:8787/health >/dev/null; then
    ROOMFLOW_READY=true
    break
  fi
  sleep 0.5
done
if [[ "$ROOMFLOW_READY" != true ]]; then
  echo 'Sync Station health endpoint did not start.' >&2
  exit 70
fi

echo "ROOMFLOW_SYNC_STATION_READY port=${SERVER_PORT} vnc=/vnc.html?autoconnect=true&resize=scale&path=websockify health=/health"

set +e
wait -n "${ROOMFLOW_CHILD_PIDS[@]}"
ROOMFLOW_EXIT_CODE=$?
set -e
echo "A required Sync Station process exited with code ${ROOMFLOW_EXIT_CODE}." >&2
exit "$ROOMFLOW_EXIT_CODE"
