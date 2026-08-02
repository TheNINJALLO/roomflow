# RoomFlow OutreachGenius Zap — Copilot build specification

Build a Zap that forwards completed inbound OutreachGenius voice-call emails from Gmail to the RoomFlow intake webhook. Do not use AI to interpret or summarize each email. RoomFlow performs deterministic parsing of the raw email body.

## Step 1 — Gmail trigger

App: Gmail

Event: New Email Matching Search

Search string:

```text
from:(david@outreachgenius.ai) subject:"A new voice call completed"
```

Connect the Gmail account that receives the OutreachGenius notifications. Test the trigger and select a completed voice-call email. The sample should expose the Gmail message ID, sender, subject, plain body, and HTML body.

## Step 2 — Webhooks by Zapier

App: Webhooks by Zapier

Event: POST

URL: Paste the newly generated RoomFlow POST URL. Do not use a revoked endpoint.

Payload Type: JSON

Map these Data fields from the Gmail trigger:

| JSON field | Gmail value |
| --- | --- |
| `source_message_id` | Message ID |
| `source_sender` | From Email or From |
| `source_subject` | Subject |
| `body_plain` | Body Plain or plain-text body |
| `body_html` | Body HTML or HTML body |
| `lead_source` | Enter the fixed text `OutreachGenius` |

If Gmail exposes only one body variant, send the available body as `body_plain` or `body_html`; RoomFlow accepts either one.

Add this request header manually after Copilot builds the steps:

| Header | Value |
| --- | --- |
| `x-roomflow-webhook-secret` | Paste the newly generated RoomFlow webhook secret |

Never place the webhook secret in the Data fields, this file, a Gmail message, or Copilot chat. JSON payload type supplies the `Content-Type: application/json` header.

Leave Basic Auth empty. Do not wrap the request in an array.

## Expected behavior

RoomFlow reads the OutreachGenius cards as follows:

- Lead → Name becomes the customer name.
- Lead → Phone becomes the customer phone.
- The freeform paragraph following Conversation → Outcome becomes the issue/job description.
- Gmail Message ID prevents Zapier retries from creating duplicate jobs.
- Source is stored as OutreachGenius.

The email format does not include a service address, customer email, or appointment time, so those fields remain empty until a RoomFlow user adds them.

## Test and publish

Test the webhook action. This creates a real test job in RoomFlow. A successful response returns `ok: true`, a `job_id`, normalized caller fields, and warnings. Verify the result in RoomFlow Settings → Email Intake / Zapier → Refresh Activity and in the Tracker Zapier-intake status strip. Confirm that the customer name, phone, and call summary landed in the correct fields, then publish the Zap. Delete the test job from Tracker if it should not remain active.

Response troubleshooting:

- `200` or `201`: accepted. `duplicate` means the Gmail Message ID was already processed.
- `401`: the endpoint URL or webhook secret is wrong, revoked, or disabled.
- `422`: Gmail did not send a usable body, name, or phone; recheck the body mappings.
- `500`: confirm the latest `intake-lead` Edge Function is deployed and the RoomFlow Supabase schema is current.
