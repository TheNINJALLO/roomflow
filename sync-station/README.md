# RoomFlow Townsquare Sync Station

The Sync Station is a dedicated Chromium session that claims explicitly queued RoomFlow estimates and runs the existing draft-only Townsquare bridge extension. Run it on either an always-on Windows PC or a Pterodactyl server. Phones and ordinary PCs then queue work to the station and do not need the extension.

The station can create or update a **DRAFT**. The extension still blocks Send, Issue, Email, Approve, Accept, Charge, Pay, Collect, Publish, Finalize, and destructive draft actions. Final delivery remains manual in Townsquare.

## Architecture

1. An authorized RoomFlow user presses **Create via Sync Station** or **Update via Sync Station**.
2. The Edge Function validates the live estimate and stores an idempotent queued run. No customer payload is persisted on the station.
3. The station authenticates with a random device token. The database stores only its SHA-256 hash.
4. A PostgreSQL `FOR UPDATE SKIP LOCKED` claim gives exactly one station a ten-minute lease.
5. The station builds the payload from the current server-side estimate, keeps it in process memory, and passes it to the extension through a loopback-only page.
6. The extension keeps its pending operation in `chrome.storage.session`, confirms a Townsquare draft and total, and returns the result to the Edge Function.

If a claimed lease expires, RoomFlow marks the run failed and requires Townsquare review before a retry. It does not automatically replay an uncertain browser operation because that could create a duplicate.

## Backend deployment

Apply the migrations in order, including:

```text
supabase/migrations/20260802210000_townsquare_bridge.sql
supabase/migrations/20260803010000_townsquare_sync_station.sql
```

Deploy the updated function:

```text
supabase functions deploy townsquare-sync --no-verify-jwt
```

`verify_jwt` is intentionally disabled at the Supabase gateway for this one function. User actions still call `auth.getUser()` and enforce organization capabilities inside the function. Worker actions require the separate station ID and one-time random token.

## Choose where it runs

- **Always-on Windows PC:** simplest when you already have a trusted Windows 10/11 machine. The installer uses a dedicated Chrome/Edge profile, encrypts the station token for the current Windows user, and registers an interactive logon task with restart-on-failure. The user must stay signed in and the PC must not sleep. Follow [windows/README.md](windows/README.md).
- **Pterodactyl:** best when you already operate a Linux server and panel. The image supplies Chromium, a virtual display, protected noVNC access, health routing, and persistent browser storage. Continue below.

Both methods use the same pairing variables and station controller. Pair a separate station for each Townsquare account/profile, and do not run the Windows and Pterodactyl methods simultaneously with the same pairing token.

## Ship station updates

- **Windows:** replace or pull the repository files in place, then restart `RoomFlow-Townsquare-Sync-Station`. The DPAPI token and dedicated browser profile remain outside the repository. Full commands are in [windows/README.md](windows/README.md).
- **Pterodactyl:** pushing a station or extension change to `main` publishes both `latest` and commit-SHA image tags through the included GitHub workflow. Use the panel's normal image refresh/reinstall workflow to pull the chosen image and refresh the egg-installed repository files. Back up the credential-bearing browser profile before any panel operation that may replace server data.

## Pterodactyl: build the image

The GitHub workflow `.github/workflows/sync-station-image.yml` publishes:

```text
ghcr.io/theninjallo/roomflow-sync-station:latest
```

Run the workflow once and make the GHCR package public so Wings can pull it. The image follows Pterodactyl's required `container` user and `/home/container` work-directory layout. It includes Chromium, Xvfb, x11vnc, noVNC, nginx, and Node.js.

## Pterodactyl: pair and install

1. In RoomFlow **Settings → Townsquare Interactive**, save the Townsquare destination URL and enable the integration.
2. Under **Always-on Sync Station**, choose a name and press **Create Pairing Key**.
3. Copy all three one-time pairing variables. The plaintext station token is not stored by RoomFlow and cannot be shown again.
4. In Pterodactyl Admin, create or select an application nest and import `sync-station/pterodactyl/egg-roomflow-sync-station.json`.
5. Create a server with at least 1.5 GB RAM, 2 GB disk, and one TCP allocation. Enter the three pairing variables and a random noVNC password of at least 16 characters.
6. Install and start the server. The process is ready when the console prints `ROOMFLOW_SYNC_STATION_READY`.
7. Open the allocated URL at `/vnc.html?autoconnect=true&resize=scale&path=websockify`. Sign into the HTTP prompt with username `roomflow` and the configured noVNC password, then use that password for the VNC prompt as well.
8. In Chromium, open the extension popup, save the exact Townsquare destination, and grant access. This is a one-time permission stored in the persistent browser profile.
9. Sign in to Townsquare normally and complete guided mapping if the account needs it.
10. Return to the station tab. RoomFlow Settings should show the station **Online** within about 30 seconds.

The allocation's `/health` route returns only sanitized process health. Use it with an uptime monitor in addition to Pterodactyl's process state. A healthy process cannot guarantee that Townsquare has not expired its login; check the virtual browser after authentication errors.

## Pterodactyl security and operations

- Put the noVNC allocation behind HTTPS and preferably an additional identity-aware proxy. The included nginx layer uses the full password with bcrypt before the legacy VNC challenge. Do not expose unencrypted noVNC directly to the public internet.
- Treat `/home/container/data/chromium` as a credential-bearing browser profile. Back it up only to encrypted, access-controlled storage.
- Pterodactyl variable visibility is not a security boundary against panel administrators or server owners. Only trusted administrators should control this server.
- The station token cannot access other organizations. Revoke it immediately from RoomFlow Settings if the container or panel account may be compromised.
- Do not run multiple stations against different Townsquare accounts under the same browser profile. Pair a separate station/profile for each account.
- Keep Pterodactyl crash detection enabled. The startup script exits if Chromium, noVNC, the controller, or nginx dies so Wings can show the failure and restart the server.
- The extension is Manifest V3 and event-driven; the loopback station tab performs polling and wakes it only when queued work exists.

## Local runtime check

The controller can be exercised without Chromium by setting the three pairing variables and running:

```text
node sync-station/server.mjs
```

It binds only to `127.0.0.1:8787`. In production, nginx exposes `/health` while the station control page remains loopback-only.
