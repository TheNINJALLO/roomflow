# Always-on Windows PC

This option runs the same draft-only RoomFlow extension in a dedicated Chrome or Edge profile on a Windows 10/11 PC. RoomFlow on other PCs and phones queues work to this station, so those devices do not need the extension.

The Windows account must remain signed in because Chromium extensions require an interactive desktop session. Task Scheduler starts the station at logon and restarts it if either the local controller or the dedicated browser exits. The computer can be locked, but it must not sleep.

## Requirements

- A dedicated or trusted Windows 10/11 PC that stays powered on and online
- Node.js 18 or newer
- Microsoft Edge (recommended), Google Chrome, Chromium, or Chrome for Testing
- A Windows user account that can remain signed in
- The RoomFlow repository kept at a stable path

Using a dedicated Windows account and browser profile keeps the Townsquare session separate from normal browsing. Do not configure unattended Windows automatic sign-in unless you accept the local physical-access risk.

## Install

1. In RoomFlow, open **Settings > Townsquare Interactive** and configure the exact Townsquare destination URL.
2. Under **Always-on Sync Station**, create a pairing key and keep the dialog open. The token is shown only once.
3. Sign into the always-on PC as the Windows user that will run the station.
4. Open PowerShell as that same user in the RoomFlow repository and run the command below. Start with a normal window; if local policy blocks Task Scheduler registration, reopen PowerShell as administrator under the same account and rerun it.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\sync-station\windows\install-sync-station.ps1 `
  -FunctionUrl "https://YOUR_PROJECT.supabase.co/functions/v1/townsquare-sync" `
  -StationId "YOUR-STATION-UUID"
```

The installer asks for `ROOMFLOW_STATION_TOKEN` with hidden input. It does not put the token in PowerShell history or the scheduled-task command. If Edge and Chrome are both installed, Edge is selected first; pass `-BrowserPath "C:\full\path\to\browser.exe"` to choose another Chromium browser.

5. When the dedicated browser opens, confirm **RoomFlow Townsquare Draft Bridge** is present. If it is not, open `edge://extensions` or `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository's `townsquare-bridge-extension` directory. This is a one-time action for the dedicated profile.
6. Open the extension popup, save the exact Townsquare destination, and grant access.
7. Sign into Townsquare normally in this dedicated profile and complete guided mapping if RoomFlow requests it.
8. Set Windows power settings so the PC never sleeps while plugged in. You may lock the screen after setup, but keep this user signed in.

The launcher passes `--load-extension` as a convenience for browsers that support it. Official Google Chrome builds version 137 and newer ignore that flag, so use the one-time **Load unpacked** step above when running Chrome. Chromium and Chrome for Testing continue to support the flag. The setup never modifies browser preferences or extension policy behind the user's back.

The installer stores non-secret configuration and a Windows Data Protection API (DPAPI) encrypted token under `%LOCALAPPDATA%\RoomFlow\SyncStation`. That ciphertext can be decrypted only in the same Windows user context. The persistent `browser-profile` directory contains the Townsquare login session and must be treated as credential-bearing data.

## Check and operate

Run the sanitized loopback health check:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\sync-station\windows\check-sync-station.ps1
```

Inspect or restart the scheduled task:

```powershell
Get-ScheduledTask -TaskName RoomFlow-Townsquare-Sync-Station
Stop-ScheduledTask -TaskName RoomFlow-Townsquare-Sync-Station
Start-ScheduledTask -TaskName RoomFlow-Townsquare-Sync-Station
```

Controller and browser logs are in `%LOCALAPPDATA%\RoomFlow\SyncStation\logs`. They must not contain the station token or estimate payload. A healthy controller cannot guarantee that Townsquare has not expired its login; inspect the dedicated browser after authentication errors.

## Ship an extension or runner update

Update the RoomFlow repository in place, then restart the task:

```powershell
Stop-ScheduledTask -TaskName RoomFlow-Townsquare-Sync-Station
Start-ScheduledTask -TaskName RoomFlow-Townsquare-Sync-Station
```

The dedicated profile and DPAPI token stay under `%LOCALAPPDATA%`, outside the repository. Because this is an unpacked extension, the browser reloads its files from `townsquare-bridge-extension` when the dedicated session starts. If the repository path changes, rerun the installer so both the task and extension path are updated.

## Move, rotate, or remove

Stop the task before moving the repository. Run the installer again from the new location to update the scheduled action. To rotate credentials, revoke the old station in RoomFlow, stop the task, create a new pairing key, and run the installer again.

To remove the runner:

```powershell
Stop-ScheduledTask -TaskName RoomFlow-Townsquare-Sync-Station
Unregister-ScheduledTask -TaskName RoomFlow-Townsquare-Sync-Station -Confirm
```

Then revoke the station in RoomFlow. After confirming no browser session is needed, manually remove `%LOCALAPPDATA%\RoomFlow\SyncStation`; this permanently removes the dedicated browser profile and its saved Townsquare session.
