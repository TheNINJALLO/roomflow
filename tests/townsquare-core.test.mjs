import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizeAction,
  buildBridgePayload,
  buildOfficialEstimateRequest,
  calculateTotals,
  chooseAdapter,
  customerMatchCandidates,
  normalizeAddress,
  normalizeEmail,
  normalizePhone,
  resolveSyncStrategy,
  toMinor,
  validateActionRequest,
  validateBridgeEnvelope,
  validateEstimateBundle
} from '../supabase/functions/townsquare-sync/shared/townsquare-core.mjs';
import { OfficialTownsquareProvider } from '../supabase/functions/townsquare-sync/shared/townsquare-provider.mjs';

const ids = {
  org: '11111111-1111-4111-8111-111111111111',
  customer: '22222222-2222-4222-8222-222222222222',
  job: '33333333-3333-4333-8333-333333333333',
  estimate: '44444444-4444-4444-8444-444444444444'
};

function bundle(overrides = {}) {
  return {
    estimate: {
      id: ids.estimate,
      job_id: ids.job,
      estimate_number: 'RF-2026-1001',
      subtotal: '250.00',
      taxable_subtotal: '200.00',
      discount_total: '0.00',
      tax_rate: '6.00',
      tax_total: '12.00',
      total: '262.00',
      customer_message: 'Waterproof the north wall.',
      terms: 'Final delivery remains manual.',
      updated_at: '2026-08-02T20:00:00Z'
    },
    job: {
      id: ids.job,
      name: 'Taylor Basement',
      property_address: '25 Service Road',
      city: 'Grand Rapids',
      state: 'MI',
      postal_code: '49503',
      issue_description: 'Water entering along the north wall.',
      external_key: 'JOB-1001'
    },
    customer: {
      id: ids.customer,
      name: 'Taylor Lead',
      first_name: 'Taylor',
      last_name: 'Lead',
      email: 'Taylor@Example.com',
      phone: '(616) 555-0199',
      address: '25 Service Road'
    },
    lines: [
      { id: 'line-a', name: 'Wall system', description: 'North wall', quantity: 2, unit: 'each', unit_price: '100.00', taxable: true, selected: true },
      { id: 'line-b', name: 'Inspection', quantity: 1, unit: 'visit', unit_price: '50.00', taxable: false, selected: true }
    ],
    attachments: [],
    revision: '2026-08-02T20:00:00Z',
    ...overrides
  };
}

test('currency calculations use integer minor units and validate stored totals', () => {
  assert.equal(toMinor('1,234.56'), 123456);
  const totals = calculateTotals(bundle().lines, 6, 0);
  assert.deepEqual({
    subtotal: totals.subtotalMinor,
    taxable: totals.taxableSubtotalMinor,
    tax: totals.taxTotalMinor,
    grand: totals.grandTotalMinor
  }, { subtotal: 25000, taxable: 20000, tax: 1200, grand: 26200 });
  const validation = validateEstimateBundle(bundle());
  assert.equal(validation.valid, true, validation.errors.join(' '));
});

test('validation rejects incomplete service addresses and mismatched totals', () => {
  const invalid = bundle({
    job: { ...bundle().job, city: '', postal_code: '' },
    estimate: { ...bundle().estimate, total: '999.00' }
  });
  const result = validateEstimateBundle(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /city/i);
  assert.match(result.errors.join(' '), /postal/i);
  assert.match(result.errors.join(' '), /total does not match/i);
});

test('RoomFlow payload maps customer, property, estimate, lines, and totals', () => {
  const payload = buildBridgePayload(bundle(), { currency: 'USD', estimate_expiration_days: 45 });
  assert.equal(payload.customer.firstName, 'Taylor');
  assert.equal(payload.customer.email, 'taylor@example.com');
  assert.equal(payload.property.fullAddress, '25 Service Road, Grand Rapids, MI 49503');
  assert.equal(payload.estimate.estimateNumber, 'RF-2026-1001');
  assert.equal(payload.estimate.lines[0].unitPriceMinor, 10000);
  assert.equal(payload.estimate.grandTotalMinor, 26200);
  assert.equal(payload.estimate.status, 'DRAFT');
});

test('official estimate mapping uses documented fields and cannot send', () => {
  const payload = buildBridgePayload(bundle(), { currency: 'USD' });
  const request = buildOfficialEstimateRequest(payload, 'client-uid', { provider_tax_uid: 'tax-uid' });
  assert.equal(request.estimate.matter_uid, 'client-uid');
  assert.equal(request.estimate.status, 'DRAFT');
  assert.equal(request.estimate.notify_recipient, false);
  assert.deepEqual(request.estimate.items[0].tax_uids, ['tax-uid']);
  assert.equal('send' in request.estimate, false);
  assert.equal('approve' in request.estimate, false);
  assert.equal('issue' in request.estimate, false);
});

test('taxable API estimates require an official Townsquare tax UID', () => {
  const payload = buildBridgePayload(bundle(), { currency: 'USD' });
  assert.throws(() => buildOfficialEstimateRequest(payload, 'client-uid', {}), error => error.code === 'TAX_UID_REQUIRED');
});

test('customer matching is normalized and preserves ambiguity', () => {
  assert.equal(normalizeEmail(' A@Example.COM '), 'a@example.com');
  assert.equal(normalizePhone('+1 (616) 555-0199'), '6165550199');
  assert.equal(normalizeAddress('25 Service Street.'), '25 service st');
  const candidates = [
    { id: 'a', email: 'taylor@example.com', mobile_phone: '6165550000', address: '1 Other Rd' },
    { id: 'b', email: 'taylor@example.com', mobile_phone: '6165550199', address: '25 Service Rd' }
  ];
  const result = customerMatchCandidates(candidates, bundle().customer);
  assert.equal(result.method, 'email');
  assert.equal(result.ambiguous, true);
  assert.equal(result.matches.length, 2);
});

test('idempotency updates only mapped drafts and blocks finalized estimates', () => {
  assert.equal(resolveSyncStrategy(null, '', 'rev-1').action, 'create');
  assert.equal(resolveSyncStrategy({ provider_entity_id: 'e1', last_roomflow_revision: 'rev-0' }, 'DRAFT', 'rev-1').action, 'update');
  assert.equal(resolveSyncStrategy({ provider_entity_id: 'e1', last_roomflow_revision: 'rev-1' }, 'DRAFT', 'rev-1').action, 'noop');
  assert.equal(resolveSyncStrategy({ provider_entity_id: 'e1' }, 'ISSUED', 'rev-1').action, 'blocked');
  assert.equal(resolveSyncStrategy({ provider_entity_id: 'e1' }, 'PAID', 'rev-1').action, 'blocked');
});

test('organization and capability checks enforce management and estimate boundaries', () => {
  assert.deepEqual(authorizeAction({ isMember: false, capabilities: ['manage_integrations'] }, 'save_configuration'), { allowed: false, code: 'ORGANIZATION_ACCESS_DENIED' });
  assert.equal(authorizeAction({ isMember: true, capabilities: ['manage_integrations'] }, 'save_configuration').allowed, true);
  assert.equal(authorizeAction({ isMember: true, capabilities: ['generate_proposals'] }, 'sync_estimate').allowed, true);
  assert.equal(authorizeAction({ isMember: true, capabilities: [] }, 'sync_estimate').allowed, false);
});

test('Edge Function request validation rejects arbitrary organizations and actions', () => {
  assert.equal(validateActionRequest({ action: 'sync_estimate', organization_id: ids.org, estimate_id: ids.estimate }).valid, true);
  assert.equal(validateActionRequest({ action: 'delete_everything', organization_id: ids.org }).valid, false);
  assert.equal(validateActionRequest({ action: 'sync_estimate', organization_id: 'wrong', estimate_id: ids.estimate }).valid, false);
});

test('bridge messages validate origin, protocol, run, and line items', () => {
  const origin = 'https://theninjallo.github.io';
  const payload = buildBridgePayload(bundle(), { currency: 'USD' });
  const message = { type: 'ROOMFLOW_TOWNSQUARE_SYNC_REQUEST', protocolVersion: 1, runId: ids.estimate, payload };
  assert.equal(validateBridgeEnvelope(message, origin, origin).valid, true);
  assert.equal(validateBridgeEnvelope(message, origin, 'https://evil.example').error, 'ORIGIN_MISMATCH');
  assert.equal(validateBridgeEnvelope({ ...message, protocolVersion: 2 }, origin, origin).error, 'PROTOCOL_MISMATCH');
});

test('adapter selection prefers only a complete API and otherwise requires the bridge', () => {
  assert.equal(chooseAdapter('auto', { apiConfigured: true, propertyApiSupported: true }).adapter, 'api');
  assert.equal(chooseAdapter('auto', { apiConfigured: true, propertyApiSupported: false, bridgeAvailable: true }).adapter, 'browser_bridge');
  assert.equal(chooseAdapter('api', { apiConfigured: true, propertyApiSupported: false }).error, 'PROPERTY_API_UNAVAILABLE');
});

test('official provider creates a confirmed DRAFT without retrying POST', async () => {
  const calls = [];
  const provider = new OfficialTownsquareProvider({
    token: 'server-only-token',
    taxUid: 'tax-uid',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ data: { estimate: { uid: 'estimate-1', status: 'DRAFT', total: '262.00' } }, success: true }), { status: 201 });
    }
  });
  const result = await provider.createDraftEstimate(buildBridgePayload(bundle(), { currency: 'USD' }), 'client-1');
  assert.equal(result.status, 'DRAFT');
  assert.equal(calls.length, 1);
  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.estimate.notify_recipient, false);
  assert.equal(sent.estimate.status, 'DRAFT');
  assert.match(calls[0].options.headers.Authorization, /^Bearer /);
});

test('official provider blocks finalized estimate updates before PUT', async () => {
  const methods = [];
  const provider = new OfficialTownsquareProvider({
    token: 'server-only-token',
    taxUid: 'tax-uid',
    fetchImpl: async (_url, options) => {
      methods.push(options.method);
      return new Response(JSON.stringify({ data: { estimate: { uid: 'estimate-1', status: 'ISSUED', matter_uid: 'client-1' } } }), { status: 200 });
    }
  });
  await assert.rejects(
    provider.updateDraftEstimate('estimate-1', buildBridgePayload(bundle(), { currency: 'USD' })),
    error => error.code === 'FINALIZED_ESTIMATE_BLOCKED'
  );
  assert.deepEqual(methods, ['GET']);
});

test('official provider update body follows the documented schema and remains DRAFT', async () => {
  const calls = [];
  const provider = new OfficialTownsquareProvider({
    token: 'server-only-token',
    taxUid: 'tax-uid',
    fetchImpl: async (_url, options) => {
      calls.push(options);
      if (options.method === 'GET') {
        return new Response(JSON.stringify({ data: { estimate: { uid: 'estimate-1', status: 'DRAFT', matter_uid: 'client-1' } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { estimate: { uid: 'estimate-1', status: 'DRAFT' } } }), { status: 200 });
    }
  });
  await provider.updateDraftEstimate('estimate-1', buildBridgePayload(bundle(), { currency: 'USD' }));
  const sent = JSON.parse(calls[1].body);
  assert.equal(calls[1].method, 'PUT');
  assert.equal('matter_uid' in sent.estimate, false);
  assert.equal(sent.estimate.status, 'DRAFT');
  assert.equal(sent.estimate.notify_recipient, false);
});

test('official provider exposes the verified service-property limitation', async () => {
  const provider = new OfficialTownsquareProvider({ token: 'server-only-token', fetchImpl: async () => new Response('{}') });
  assert.equal((await provider.findProperty()).supported, false);
  await assert.rejects(provider.createProperty({}), error => error.code === 'PROPERTY_API_UNAVAILABLE');
});
