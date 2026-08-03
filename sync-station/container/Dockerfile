FROM node:20-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/TheNINJALLO/roomflow"
LABEL org.opencontainers.image.description="Pterodactyl-compatible RoomFlow Townsquare Sync Station browser"

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    apache2-utils ca-certificates chromium curl dumb-init fonts-liberation nginx novnc procps \
    websockify x11vnc xvfb \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --home-dir /home/container --shell /bin/bash container

COPY sync-station/container/entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh

USER container
ENV USER=container HOME=/home/container
WORKDIR /home/container
CMD ["/usr/bin/dumb-init", "--", "/bin/bash", "/entrypoint.sh"]
