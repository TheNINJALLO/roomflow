# RoomFlow

RoomFlow is a field estimating workspace for drawing rooms, calculating project scope, and producing customer proposals, invoices, and crew work orders from one job record.

Open the [complete RoomFlow user guide](user-guide.html) for the step-by-step estimator, CAD, document, Tracker, mobile, and Zapier workflows. The guide is searchable, responsive, and printable as a PDF from the browser.

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

## Shared jobs and estimates

When users sign in to the same RoomFlow company, the main **Jobs** dashboard downloads the company's cloud jobs instead of relying only on that browser's local storage. **Refresh Shared** uploads pending offline edits first, then downloads project layouts, permitted costing data, and the latest saved estimate lines. Local unsynced work is retained when it is newer than the cloud copy.

Apply `supabase/migrations/20260803020000_shared_job_snapshots.sql` before relying on complete cross-device restoration. The migration stores project geometry separately from protected costing JSON and enforces the existing job and financial capabilities with row-level security. Existing `job_layouts` data remains a backwards-compatible fallback.

## Validation

Run JavaScript syntax checks with Node:

```powershell
node --check app.js
node --check cost-engine.js
node --check cost-ui.js
node --check work-order.js
node --check document-workflow.js
node --check supabase-service.js
node --check roomflow-integrations.js
```

For an end-to-end browser smoke test, serve the repository and open `tests/browser-smoke.html`. The page reports checks for per-wall quantities, document item synchronization, work-order dimensions, angled-room placement, and the mobile form layout. Open `tests/shared-jobs-smoke.html` and `tests/shared-jobs-upload-smoke.html` to verify protected upload, cross-device restoration, estimate-line download, and conflict-safe merging. Open `tests/header-responsive-smoke.html` and `tests/more-responsive-smoke.html` to verify header actions and complete Settings/More cards at representative desktop, tablet, and phone widths down to 320px.

## Native wrappers

- Android packages the web files from `app/src/main/assets`.
- iOS loads bundled web assets when present and otherwise uses the deployed GitHub Pages site.

Keep the Android asset copy synchronized with the root web files before producing an APK.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-android-assets.ps1
```

## Tracker and Zapier intake

Tracker job cards include a **Delete** action. Deletion requires the user's `delete_jobs` capability, requires typing `DELETE`, and is blocked while equipment is actively deployed to the job.

Create the Zapier webhook in RoomFlow under **Settings → Email Intake / Zapier**. Send the generated secret in the `x-roomflow-webhook-secret` header. The most reliable Zap payload is:

```json
{
  "source_message_id": "{{Gmail Message ID}}",
  "source_sender": "{{From Email}}",
  "source_subject": "{{Subject}}",
  "body_plain": "{{Body Plain}}",
  "body_html": "{{Body HTML}}"
}
```

RoomFlow accepts JSON, form data, URL-encoded fields, raw email text, and nested Zapier payloads. It extracts labeled caller fields such as name, phone, email, service address, issue, appointment, and estimator. Map Gmail's stable Message ID whenever possible so a Zap retry updates the same job instead of creating another one.

Use **Refresh Activity** in RoomFlow Settings or the **Zapier intake** health strip in Tracker to confirm that a delivery arrived and see which caller fields were parsed. A successful webhook test returns `ok: true`, a `job_id`, normalized fields, and warnings.

See [ZAPIER_SETUP.md](ZAPIER_SETUP.md) for the complete deployment, Zap configuration, verification, and error-response guide.

## Townsquare draft integration

RoomFlow includes a secure, draft-only Townsquare Interactive integration with a Supabase Edge Function and a Manifest V3 desktop Chrome/Edge bridge. Authorized estimators can save a RoomFlow estimate and choose **Create Townsquare Draft** or **Update Townsquare Draft**. Customer delivery always remains a manual Townsquare action.

Read [TOWNSQUARE_INTEGRATION.md](TOWNSQUARE_INTEGRATION.md) for architecture, security, database/function deployment, extension installation, guided selector mapping, Android limitations, testing, and troubleshooting.

For a single always-on browser worker that accepts queued drafts from desktop and mobile devices, see [sync-station/README.md](sync-station/README.md). It includes a secure Windows Task Scheduler installer as well as the Pterodactyl egg and Chromium/noVNC image, with one-time device pairing, health monitoring, and recovery safeguards.

Additional validation:

```powershell
node --test tests/townsquare-core.test.mjs tests/townsquare-security.test.mjs tests/townsquare-station.test.mjs
```

Serve the repository and open `tests/townsquare-extension-smoke.html` and `tests/townsquare-roomflow-smoke.html` for browser-level fixture checks.
