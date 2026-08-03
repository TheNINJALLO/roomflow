#!/usr/bin/env bash
set -Eeuo pipefail

cd /home/container

ROOMFLOW_PARSED_STARTUP="$(printf '%s' "${STARTUP:-bash sync-station/pterodactyl/start.sh}" | sed -e 's/{{/${/g' -e 's/}}/}/g')"
printf 'container@roomflow~ %s\n' "$ROOMFLOW_PARSED_STARTUP"
exec /bin/bash -lc "$ROOMFLOW_PARSED_STARTUP"
