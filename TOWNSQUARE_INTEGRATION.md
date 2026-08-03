# RoomFlow → Townsquare Interactive Draft Integration

This integration creates or updates a **draft** estimate in Townsquare Interactive Business Management from an authenticated RoomFlow estimate. It never sends, issues, approves, emails, accepts, charges, or otherwise delivers an estimate to a customer. A user must review and send the draft manually in Townsquare.

## Architecture

RoomFlow uses one synchronization contract with two adapters:

1. **Official API adapter** — runs only in the `townsquare-sync` Supabase Edge Function. The API credential never enters frontend JavaScript, Android assets, extension storage, or logs.
2. **Desktop Browser Bridge adapter** — a Manifest V3 Chrome/Edge extension uses the user's existing authenticated Townsquare tab. It does not read passwords, export cookies, or automate login.

Connection modes:

- **Auto:** use the official API only when all required workflow capabilities are documented and available; otherwise use Browser Bridge.
- **API:** require a configured official API credential and every required API capability.
- **Browser Bridge:** require the desktop extension and a normal authenticated Townsquare session.

The current official inTandem OpenAPI specifications document clients and draft estimates, including `POST /platform/v1/clients`, `PUT /platform/v1/clients/{client_id}`, `POST /business/payments/v1/estimates`, `PUT /business/payments/v1/estimates/{estimate_uid}`, and draft status `DRAFT`. They do not publish a separate service-property or estimate-attachment path. Because RoomFlow must not invent endpoints or claim a property was created when it was not, Auto mode currently selects Browser Bridge for the complete customer/property/estimate workflow. API mode reports `PROPERTY_API_UNAVAILABLE` before creating records. This boundary is isolated in the provider adapter so it can be changed when Townsquare/inTandem officially publishes the missing capability.

Official sources verified on August 2, 2026:

- [inTandem Developer Hub](https://developers.intandem.tech/docs/welcome-to-the-intandem-developer-hub)
- [Create a Client](https://developers.intandem.tech/reference/post_platform-v1-clients)
- [Create Estimate](https://developers.intandem.tech/reference/post_business-payments-v1-estimates)
- [Update Estimate](https://developers.intandem.tech/reference/put_business-payments-v1-estimates-estimate-uid)
- [Get Estimate](https://developers.intandem.tech/reference/get_business-payments-v1-estimates-estimate-uid)
- Published OpenAPI specifications: [clients.json](https://vcita.github.io/developers-hub/mcp_swagger/clients.json) and [sales.json](https://vcita.github.io/developers-hub/mcp_swagger/sales.json)

## Security model

- The Edge Function validates the Supabase bearer JWT even though the gateway also verifies it.
- The server independently checks organization membership and existing RoomFlow capabilities.
- `manage_integrations` is required to view/change configuration, replace/clear the API credential, test the API, or view detailed diagnostics.
- `generate_proposals` or `approve_proposals` is required to start or complete estimate synchronization.
- The server loads the estimate, lines, job, customer, and attachments by IDs already tied to the requested organization. Browser-supplied estimate contents are ignored.
- Totals are recalculated in integer cents. A mismatch stops synchronization.
- API credentials are encrypted with AES-256-GCM using `TOWNSQUARE_ENCRYPTION_KEY`. Only ciphertext and the IV are stored.
- The credential is never returned after save. Do not put it in `config.js`, local/session storage, Android assets, migrations, GitHub, or logs.
- API GET requests may retry once. Customer/estimate create requests never retry because the official specification does not document an idempotency header.
- External IDs and RoomFlow revisions are stored under unique constraints. Repeated synchronization updates a mapped draft instead of creating another estimate.
- Issued, accepted, rejected, paid, cancelled, void, expired, or otherwise non-draft estimates are never overwritten.
- Browser operations expire after 10 minutes and live only in `chrome.storage.session`. The payload is deleted after success, cancellation, expiration, or failure.
- Selector mappings contain selectors only and live in `chrome.storage.local`. Full customer/estimate payloads are never stored there.
- The extension blocks controls whose accessible text indicates Send, Issue, Email, Approve, Accept, Charge, Pay, or Collect.

## Database migration

Migration: `supabase/migrations/20260802210000_townsquare_bridge.sql`

It creates:

- `external_integrations` — organization configuration and encrypted credential material.
- `external_entity_mappings` — unique RoomFlow-to-Townsquare customer, property, job, and estimate IDs.
- `external_sync_runs` — idempotent run state, revisions, cents-based totals, result summaries, and short-lived bridge verification hashes.
- `external_sync_events` — sanitized stage-by-stage audit history.

All tables have organization ownership, indexes, uniqueness constraints, timestamps, and RLS. Configuration is mutated only by the service-role Edge Function after authorization checks. Authenticated RoomFlow members may read mappings/history through their organization RLS policies but cannot write them directly.

Deploy from a terminal authenticated to the correct Supabase project:

```powershell
supabase link --project-ref bjqvowghqajwudgyqnau
supabase db push
```

Review the migration in the Supabase SQL editor before applying it to another environment.

## Edge Function deployment

Function: `supabase/functions/townsquare-sync/index.ts`

Generate a unique 32-byte encryption key and store only the base64 value in Supabase secrets:

```powershell
$keyBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($keyBytes)
$townsquareEncryptionKey = [Convert]::ToBase64String($keyBytes)
supabase secrets set "TOWNSQUARE_ENCRYPTION_KEY=$townsquareEncryptionKey"
supabase secrets set "ROOMFLOW_ALLOWED_ORIGINS=https://theninjallo.github.io,http://localhost:8080,http://127.0.0.1:8080"
supabase secrets set "TOWNSQUARE_ALLOWED_API_HOSTS=api.vcita.biz"
supabase functions deploy townsquare-sync
```

Do not reuse the webhook secret or an API token as the encryption key. Back up the encryption key in the company password manager; losing it makes the saved API token undecryptable. To rotate it, first replace/clear credentials through RoomFlow, rotate the secret, deploy, and save each credential again.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions. Do not add the service role key to the repository.

## Official API mode

1. Obtain an authorized staff/app credential through Townsquare/inTandem for the correct business account.
2. In RoomFlow, open **More → Townsquare Interactive**.
3. Paste the token into **Replace official API token**, configure the optional business UID and Townsquare tax UID, and save.
4. The field clears immediately. RoomFlow shows only that a credential exists and when it was replaced.
5. Choose **Test API**. The server calls the documented client list endpoint with a short timeout.

Taxable estimate lines require the provider's official tax UID because the estimate API accepts `tax_uids`, not an arbitrary percentage. RoomFlow will not silently drop tax.

Until the official API publishes a separate service-property resource, use Auto or Browser Bridge for the complete workflow. API mode intentionally stops with a clear limitation instead of creating a partial or misleading result.

## Chrome installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the repository folder `townsquare-bridge-extension`.
5. Pin **RoomFlow Townsquare Draft Bridge**.
6. Open the extension popup, enter the authenticated Townsquare destination URL, and choose **Save URL & grant access**.

## Microsoft Edge installation

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `townsquare-bridge-extension`.
5. Pin the extension, save the Townsquare URL, and grant the requested site access.

The manifest requests only RoomFlow content-script origins and optional Townsquare/vcita/inTandem host access. If the business uses another branded host, add that exact HTTPS host pattern to `optional_host_permissions`, reload the extension, and grant it in the popup. Do not replace the list with broad all-site access.

## Guided Townsquare page mapping

Codex cannot see a private authenticated Townsquare account, so the bridge first attempts accessible-label detection and supports guided mapping.

1. Sign in to Townsquare normally.
2. In RoomFlow Settings, choose **Start Guided Mapping**, or use the extension popup.
3. For controls that open the next panel or activate a search box, choose **Map + use next control**, then click the matching Townsquare control. RoomFlow records it and replays one clean click after removing the mapper interception.
4. Skip controls that do not exist in the account. Required skipped controls will stop synchronization later with their exact mapping key.
5. Finish the list. Only selectors are saved.
6. Use **Test / Reset Mapping** after Townsquare changes its interface.

Mappings follow the Townsquare screen order: Quick Actions, New estimate, name-based property search, the New Property name/address/email/phone form, the Add Header dialog, the searchable item dropdown (including its Add/Create choice), repeated line items, totals, status, Save Draft, and estimate detail/review confirmation.

Automatic control discovery prefers labels, `aria-label`, roles, `name`, placeholder, stable `data-*` attributes, and visible headings. It does not rely only on generated class names.

## Create or update a draft

1. Complete the RoomFlow customer, service address, and estimate.
2. Add at least one selected line item and verify quantity, price, discount, and tax.
3. Save the RoomFlow draft.
4. Press **Create Townsquare Draft** in the inline estimate builder.
5. Follow the progress dialog. If several customers/properties match, choose the correct record; RoomFlow never merges records.
6. The desktop extension opens or focuses Townsquare, matches/creates the customer, matches/creates the service property, creates the estimate, compares totals, and presses only **Save Draft**.
7. RoomFlow displays **Draft Created** only after Townsquare exposes a draft status, identifier, detail/review control, and matching total.
8. Press **Review in Townsquare** and manually send when ready.

After the first success, the button becomes **Update Townsquare Draft**. The saved external estimate ID is searched first. If it is missing or no longer a draft, synchronization stops to prevent a duplicate or overwrite.

Matching order is:

1. Saved Townsquare external ID.
2. Saved RoomFlow external mapping.
3. Exact normalized email.
4. Exact normalized phone.
5. Exact service address.
6. Customer name plus service address.

Multiple matches always require a user choice.

## Field mapping

| RoomFlow | Official API / Browser Bridge |
|---|---|
| Customer first/last name | `first_name`, `last_name` / mapped name controls |
| Email, phone, billing address | `email`, `phone`, `address` / mapped controls |
| Service property | Browser Bridge property controls; no documented API resource |
| Estimate customer | Official `matter_uid` / selected customer |
| Estimate issue/expiration | `issue_date`, `due_date` |
| Currency | `currency` |
| RoomFlow estimate/job reference | `purchase_order` / mapped reference controls |
| Scope and notes | `note`, mapped scope/customer/internal note controls |
| Line name, description, quantity, price | `name`, `description`, `quantity`, `unit_amount` |
| Tax | Official `tax_uids`; mapped tax control in Browser Bridge |
| Discount | Official item `discount.amount`; mapped discount control |
| Terms | `terms_and_conditions` |
| Status and notification | Always `status: DRAFT`, `notify_recipient: false` |

## Attachments

RoomFlow creates short-lived signed URLs only after the authorized user presses the sync button. Browser Bridge attempts mapped file upload for selected estimate attachments. Each attachment is reported separately as completed, skipped, or failed. An unavailable upload control does not fail the customer/property/draft synchronization.

The official API adapter reports attachments as skipped because the verified OpenAPI specifications do not publish an estimate-attachment endpoint.

## Android behavior

Chrome/Edge desktop extensions cannot run inside Android apps or normal Android WebViews. RoomFlow detects Android and shows **Queue Townsquare Sync for Desktop**. Finish the estimate on Android, queue it, then open the same estimate in desktop RoomFlow and run the draft action there.

When an always-on Sync Station is paired, Android and desktop users instead queue the draft directly to that station. No extension is required on their device. The station claims the job automatically and still saves only a Townsquare draft.

An officially supported complete API workflow would remain server-side and Android-compatible. The current API lacks the documented service-property capability, so RoomFlow does not claim that partial API synchronization is complete.

## Always-on Sync Station: Windows PC or Pterodactyl

The dedicated Sync Station runs Chromium and this extension in either a persistent Windows browser profile or a Pterodactyl container. Pairing uses a one-time random device token; RoomFlow stores only its SHA-256 hash. Atomic database claims prevent two stations from processing the same queued run, and claimed payloads remain only in process memory and `chrome.storage.session`.

Apply `supabase/migrations/20260803010000_townsquare_sync_station.sql`, deploy the updated function with `--no-verify-jwt`, and follow [sync-station/README.md](sync-station/README.md). For Windows, use the DPAPI-backed Task Scheduler installer in [sync-station/windows/README.md](sync-station/windows/README.md). For Pterodactyl, import `sync-station/pterodactyl/egg-roomflow-sync-station.json`.

The Windows method requires an interactive Windows user to remain signed in, though the screen may be locked. The Pterodactyl allocation provides a password-protected noVNC console. Both methods expose sanitized health locally; keep any remote console behind HTTPS and access control because the persistent browser profile contains the authenticated Townsquare session. An expired claim is not replayed automatically; RoomFlow requires a Townsquare review before retrying to avoid duplicates.

The root web files and `app/src/main/assets` copies must remain synchronized:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-android-assets.ps1
```

## Troubleshooting

- **Extension not detected:** install/load it, refresh RoomFlow, and confirm the RoomFlow URL matches the manifest content-script origin.
- **Host permission required:** open the extension popup, save the exact Townsquare destination URL, and grant access.
- **Townsquare logged out:** sign in normally in the opened tab, return to RoomFlow, and retry.
- **Required control not found:** run guided mapping and select the named key.
- **Multiple matches:** select the correct customer/property; do not merge automatically.
- **Mapped record not found:** confirm it still exists. Do not remove the mapping until an integration manager verifies the record.
- **Total mismatch:** compare RoomFlow and Townsquare tax, discount, quantity, and rounding. Nothing is saved as successful until totals match.
- **Validation error:** correct the field identified by Townsquare and retry.
- **Finalized estimate blocked:** review the existing estimate. Create an explicit revision according to Townsquare's supported process; RoomFlow will not overwrite it.
- **Credential decryption failed:** restore the correct encryption secret or clear and replace the API token.
- **Selectors changed:** use Test / Reset Mapping, then reload the extension.
- **Diagnostics:** RoomFlow Settings shows server-side sanitized runs/events. The extension popup shows redacted browser diagnostics. Neither contains credentials, cookies, or full customer payloads.

## Safe removal

1. Disable the integration in RoomFlow.
2. Clear the encrypted API credential.
3. Allow pending bridge operations to expire or cancel them.
4. Export any audit history required by company policy.
5. Remove the extension from Chrome/Edge.
6. Keep mapping and audit tables for traceability unless the company has approved their deletion. Database table removal is a separate destructive migration and should not be bundled with disabling the feature.

## Validation

```powershell
node --test tests/townsquare-core.test.mjs tests/townsquare-security.test.mjs
npx --yes deno check supabase/functions/townsquare-sync/index.ts
node --check townsquare-integration.js
node --check townsquare-bridge-extension/service-worker.js
node --check townsquare-bridge-extension/townsquare-adapter.js
```

Serve the repository and open:

- `tests/townsquare-extension-smoke.html`
- `tests/townsquare-roomflow-smoke.html`
- `tests/header-responsive-smoke.html`
- `tests/browser-smoke.html`

The fixture suite does not require a live Townsquare account. Final selector mapping and one real draft-only acceptance run require the user's authenticated Townsquare account.
