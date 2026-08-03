# RoomFlow Townsquare Draft Bridge

Manifest V3 extension for desktop Chrome and Microsoft Edge. It accepts a validated estimate only after an explicit RoomFlow button press, either from the same browser or through a paired always-on Sync Station. It keeps the operation temporarily in `chrome.storage.session`, opens the configured Townsquare page, and uses the existing authenticated session to create or update a draft.

The extension never reads passwords, exports cookies, automates login, or clicks controls indicating Send, Issue, Email, Approve, Accept, Charge, Pay, or Collect.

## Install

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked and select this folder.
4. Pin the extension.
5. In the popup, save the exact HTTPS Townsquare destination URL and grant access.
6. Sign in to Townsquare normally.
7. Start guided mapping from RoomFlow Settings or the popup.

The mapper follows Townsquare's staged estimate workflow. Use **Map + use next control** for Quick Actions, New estimate, the property search field, New Property, Save Property, Add Header, Save Header, the item dropdown/search/choice, and any Add/Save Item control. Map only **Save Draft** at the end; sending and financial actions remain blocked.

If Townsquare uses a branded host outside the optional host patterns in `manifest.json`, add that exact host pattern and reload the extension. Avoid all-site permissions.

## Files

- `service-worker.js` — transient operation state, tab focus/opening, redacted diagnostics, and result routing.
- `roomflow-content.js` — validates same-origin RoomFlow page messages.
- `townsquare-adapter.js` — centralized accessible control discovery, guided mapping, matching, totals, draft save, and safety blocks.
- `townsquare-content.js` — executes the adapter in the authenticated Townsquare page.
- `popup.*` — destination permission, mapping controls, status, and redacted diagnostics.
- `bridge-core.js` — shared protocol, payload validation, expiration, redaction, and unsafe-action guard.

Full deployment, security, mapping, and troubleshooting instructions are in `../TOWNSQUARE_INTEGRATION.md`.
