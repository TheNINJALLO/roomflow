import assert from 'node:assert/strict';
import {
  fingerprintInput,
  normalizeLead,
  parseEmailBody,
  parseRequestPayload,
  payloadField,
  publicLead,
} from '../supabase/functions/intake-lead/lead-normalizer.mjs';

function test(name, callback) {
  try {
    callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('normalizes ordinary mapped Zapier fields', () => {
  const lead = normalizeLead({
    customer_name: 'Alex Rivera',
    customer_email: 'ALEX@EXAMPLE.COM',
    caller_phone: '(313) 555-0199',
    service_address: '18 Oak Street',
    source_message_id: 'gmail-123',
  });
  assert.equal(lead.fullName, 'Alex Rivera');
  assert.equal(lead.email, 'alex@example.com');
  assert.equal(lead.phone, '3135550199');
  assert.equal(lead.address, '18 Oak Street');
  assert.equal(lead.sourceMessageId, 'gmail-123');
});

test('extracts labeled caller details from a plain-text email', () => {
  const lead = normalizeLead({
    subject: 'New caller from answering service',
    body_plain: `Caller Name: Morgan Lee
Caller Phone: 734-555-0188
Caller Email: morgan@example.com
Service Address: 44 Pine Avenue
City: Ann Arbor
State: MI
ZIP: 48104
Reason for Call: Water damage in the upstairs bedroom.
The baseboard and carpet are wet.`,
  });
  assert.equal(lead.fullName, 'Morgan Lee');
  assert.equal(lead.phone, '7345550188');
  assert.equal(lead.email, 'morgan@example.com');
  assert.equal(lead.address, '44 Pine Avenue');
  assert.match(lead.issueDescription, /baseboard and carpet/i);
  assert.match(lead.warnings[0], /source message ID/i);
});

test('extracts nested HTML payloads and separate appointment fields', () => {
  const lead = normalizeLead({
    data: {
      email: {
        id: 'ignored-provider-id',
        body_html: '<p>Customer Name: Taylor Green</p><p>Phone: (248) 555-0101</p><p>Address: 8 Main Rd</p>',
      },
      appointment_date: '2030-05-10',
      appointment_time: '2:30 PM',
      gmail_message_id: 'nested-message-1',
    },
  });
  assert.equal(lead.fullName, 'Taylor Green');
  assert.equal(lead.phone, '2485550101');
  assert.equal(lead.address, '8 Main Rd');
  assert.equal(lead.sourceMessageId, 'nested-message-1');
  assert.ok(lead.appointmentStart?.startsWith('2030-05-10'));
});

test('parses email label aliases', () => {
  const body = parseEmailBody('Callback Number = 313.555.0123\nProblem Reported: Ceiling leak');
  assert.equal(body.phone, '313.555.0123');
  assert.equal(body.issueDescription, 'Ceiling leak');
});

test('creates stable fingerprints and removes raw payloads from public output', () => {
  const first = normalizeLead({ phone: '313-555-0100', name: 'Sam Jones', notes: 'Inspection' });
  const second = normalizeLead({ notes: 'Inspection', name: 'Sam Jones', phone: '313-555-0100' });
  assert.equal(fingerprintInput(first), fingerprintInput(second));
  assert.equal('raw' in publicLead(first), false);
});

const formRequest = new Request('https://roomflow.test/intake', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    endpoint_key: 'endpoint-1',
    webhook_secret: 'secret-1',
    'Caller Name': 'Jamie Stone',
    'Caller Phone': '586-555-0190',
  }),
});
const formPayload = await parseRequestPayload(formRequest);
test('accepts Zapier form-encoded webhook requests', () => {
  assert.equal(payloadField(formPayload, ['endpoint_key']), 'endpoint-1');
  const lead = normalizeLead(formPayload);
  assert.equal(lead.fullName, 'Jamie Stone');
  assert.equal(lead.phone, '5865550190');
});

const textRequest = new Request('https://roomflow.test/intake', {
  method: 'POST',
  headers: { 'content-type': 'text/plain' },
  body: 'Caller Name: Casey North\nPhone: 313-555-0134\nReason for Call: Mold inspection',
});
const textPayload = await parseRequestPayload(textRequest);
test('accepts raw email text', () => {
  const lead = normalizeLead(textPayload);
  assert.equal(lead.fullName, 'Casey North');
  assert.equal(lead.phone, '3135550134');
  assert.equal(lead.issueDescription, 'Mold inspection');
});

console.log('All lead normalizer tests passed.');
