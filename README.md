# RoomFlow

RoomFlow is a field estimating workspace for drawing rooms, calculating project scope, and producing customer proposals, invoices, and crew work orders from one job record.

## Run locally

The web application has no package-install step. Serve the repository over HTTP so browser storage, canvas exports, and camera permissions use a normal web origin:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Main workflow

1. Create or open a job.
2. Add measured rooms and place blueprint equipment.
3. Select room-by-room work, including exact drywall-cut walls.
4. Review materials and internal pricing.
5. Open **Documents** and confirm the shared scope.
6. Generate the proposal, invoice, or work-order packet.

Changes made to the shared document scope are saved with the job. Custom estimate items and rentals flow into the proposal, invoice, and work order by default.

## Validation

Run JavaScript syntax checks with Node:

```powershell
node --check app.js
node --check cost-engine.js
node --check cost-ui.js
node --check work-order.js
node --check document-workflow.js
```

For an end-to-end browser smoke test, serve the repository and open `tests/browser-smoke.html`. The page reports checks for per-wall quantities, document item synchronization, work-order dimensions, angled-room placement, and the mobile form layout.

## Native wrappers

- Android packages the web files from `app/src/main/assets`.
- iOS loads bundled web assets when present and otherwise uses the deployed GitHub Pages site.

Keep the Android asset copy synchronized with the root web files before producing an APK.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-android-assets.ps1
```
