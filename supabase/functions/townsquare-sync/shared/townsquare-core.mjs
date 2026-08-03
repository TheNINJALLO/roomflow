export const PROVIDER = 'townsquare';
export const PROTOCOL_VERSION = 1;
export const BRIDGE_TTL_MS = 10 * 60 * 1000;

export const SYNC_STATUSES = Object.freeze([
  'queued', 'validating', 'opening_townsquare', 'finding_customer',
  'customer_matched', 'customer_created', 'finding_property',
  'property_matched', 'property_created', 'creating_estimate',
  'updating_estimate', 'attaching_documents', 'draft_created',
  'review_required', 'completed', 'cancelled', 'failed'
]);

export const MANAGEMENT_ACTIONS = new Set([
  'get_configuration', 'save_configuration', 'clear_api_token',
  'test_connection', 'get_diagnostics'
]);

export const ESTIMATE_ACTIONS = new Set([
  'get_estimate_sync', 'sync_estimate', 'prepare_bridge_sync',
  'queue_bridge_sync', 'complete_bridge_sync', 'cancel_bridge_sync'
]);

const FINAL_PROVIDER_STATUSES = new Set([
  'ISSUED', 'SENT', 'APPROVED', 'ACCEPTED', 'REJECTED', 'DECLINED',
  'PAID', 'CANCELLED', 'CANCELED', 'VOID', 'EXPIRED'
]);

export function cleanText(value, maxLength = 4000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function normalizeEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

export function normalizePhone(value) {
  const digits = cleanText(value, 64).replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

export function normalizeAddress(value) {
  return cleanText(value, 800)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(street|st\.)\b/g, 'st')
    .replace(/\b(avenue|ave\.)\b/g, 'ave')
    .replace(/\b(road|rd\.)\b/g, 'rd')
    .replace(/\b(drive|dr\.)\b/g, 'dr')
    .replace(/\b(lane|ln\.)\b/g, 'ln')
    .replace(/\b(boulevard|blvd\.)\b/g, 'blvd')
    .replace(/[^a-z0-9#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeName(value) {
  return cleanText(value, 320)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitName(fullName, firstName = '', lastName = '') {
  const suppliedFirst = cleanText(firstName, 120);
  const suppliedLast = cleanText(lastName, 120);
  if (suppliedFirst || suppliedLast) {
    return { firstName: suppliedFirst || suppliedLast, lastName: suppliedLast };
  }
  const parts = cleanText(fullName, 240).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
}

export function toMinor(value) {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = typeof value === 'string'
    ? value.replace(/[$,\s]/g, '')
    : value;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) throw new Error('Currency value must be finite.');
  return Math.round((numeric + Math.sign(numeric) * Number.EPSILON) * 100);
}

export function fromMinor(value) {
  if (!Number.isSafeInteger(value)) throw new Error('Minor-unit value must be a safe integer.');
  return (value / 100).toFixed(2);
}

export function lineTotalMinor(quantity, unitPrice) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Line quantity must be greater than zero.');
  const unitMinor = toMinor(unitPrice);
  if (unitMinor < 0) throw new Error('Line unit price cannot be negative.');
  return Math.round(qty * unitMinor);
}

export function calculateTotals(lines, taxRate = 0, discountTotal = 0) {
  if (!Array.isArray(lines) || !lines.length) throw new Error('At least one estimate line is required.');
  const rate = Number(taxRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Tax rate must be between 0 and 100.');
  const discountMinor = toMinor(discountTotal);
  const normalizedLines = lines.map((line, index) => {
    const totalMinor = lineTotalMinor(line.quantity, line.unit_price ?? line.unitPrice);
    return {
      index,
      totalMinor,
      taxable: Boolean(line.taxable),
      quantity: Number(line.quantity),
      unitPriceMinor: toMinor(line.unit_price ?? line.unitPrice)
    };
  });
  const subtotalMinor = normalizedLines.reduce((sum, line) => sum + line.totalMinor, 0);
  if (discountMinor < 0 || discountMinor > subtotalMinor) {
    throw new Error('Discount must be between zero and the estimate subtotal.');
  }
  const taxableSubtotalMinor = normalizedLines
    .filter(line => line.taxable)
    .reduce((sum, line) => sum + line.totalMinor, 0);
  const taxTotalMinor = Math.round(taxableSubtotalMinor * rate / 100);
  return {
    lines: normalizedLines,
    subtotalMinor,
    discountMinor,
    taxableSubtotalMinor,
    taxRate: rate,
    taxTotalMinor,
    grandTotalMinor: subtotalMinor - discountMinor + taxTotalMinor
  };
}

function fullAddress(job = {}, customer = {}) {
  return [
    cleanText(job.property_address || customer.address, 300),
    cleanText(job.city || customer.city, 120),
    [cleanText(job.state || customer.state, 80), cleanText(job.postal_code || customer.postal_code, 32)].filter(Boolean).join(' ')
  ].filter(Boolean).join(', ');
}

export function validateEstimateBundle(bundle) {
  const estimate = bundle?.estimate || {};
  const job = bundle?.job || {};
  const customer = bundle?.customer || {};
  const lines = Array.isArray(bundle?.lines) ? bundle.lines.filter(line => line.selected !== false && line.optional !== true) : [];
  const errors = [];
  const customerName = cleanText(customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`);
  if (!customerName) errors.push('Customer name is required.');
  if (!normalizeEmail(customer.email) && normalizePhone(customer.phone).length < 7) {
    errors.push('Customer email or phone is required.');
  }
  if (!cleanText(job.property_address || customer.address)) errors.push('Service street address is required.');
  if (!cleanText(job.city || customer.city)) errors.push('Service city is required.');
  if (!cleanText(job.state || customer.state)) errors.push('Service state is required.');
  if (!cleanText(job.postal_code || customer.postal_code)) errors.push('Service postal code is required.');
  if (!lines.length) errors.push('At least one selected estimate line is required.');

  let calculated = null;
  try {
    calculated = calculateTotals(lines, estimate.tax_rate, estimate.discount_total);
  } catch (error) {
    errors.push(error.message);
  }

  if (calculated) {
    const checks = [
      ['subtotal', calculated.subtotalMinor],
      ['taxable_subtotal', calculated.taxableSubtotalMinor],
      ['tax_total', calculated.taxTotalMinor],
      ['total', calculated.grandTotalMinor]
    ];
    for (const [field, expected] of checks) {
      if (estimate[field] === null || estimate[field] === undefined) continue;
      let actual;
      try { actual = toMinor(estimate[field]); } catch { errors.push(`${field} is not a finite currency value.`); continue; }
      if (Math.abs(actual - expected) > 1) {
        errors.push(`${field} does not match the server-calculated amount.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    calculated,
    customerName,
    serviceAddress: fullAddress(job, customer),
    lines
  };
}

export function allocateDiscountMinor(lines, discountMinor) {
  let remaining = discountMinor;
  return lines.map(line => {
    const available = Math.max(0, line.totalMinor);
    const applied = Math.min(available, remaining);
    remaining -= applied;
    return applied;
  });
}

export function buildBridgePayload(bundle, config = {}) {
  const validation = validateEstimateBundle(bundle);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(' '));
    error.code = 'ESTIMATE_VALIDATION_FAILED';
    error.details = validation.errors;
    throw error;
  }
  const { estimate, job, customer, attachments = [] } = bundle;
  const names = splitName(customer.name, customer.first_name, customer.last_name);
  const currency = cleanText(config.currency || 'USD', 3).toUpperCase();
  const expirationDays = Math.min(365, Math.max(1, Number(config.estimate_expiration_days || 30)));
  const issueDate = new Date().toISOString().slice(0, 10);
  const dueDate = estimate.expires_at
    ? new Date(estimate.expires_at).toISOString().slice(0, 10)
    : new Date(Date.now() + expirationDays * 86400000).toISOString().slice(0, 10);
  const propertyName = cleanText(job.name || `${validation.customerName} Service Property`, 240);
  return {
    protocolVersion: PROTOCOL_VERSION,
    provider: PROVIDER,
    customer: {
      roomflowId: customer.id,
      firstName: names.firstName,
      lastName: names.lastName,
      companyName: cleanText(customer.company_name, 240),
      email: normalizeEmail(customer.email),
      phone: cleanText(customer.phone, 64),
      billingAddress: cleanText(customer.address || validation.serviceAddress, 800)
    },
    property: {
      roomflowId: job.id,
      jobId: job.id,
      name: propertyName,
      streetAddress: cleanText(job.property_address || customer.address, 300),
      city: cleanText(job.city || customer.city, 120),
      state: cleanText(job.state || customer.state, 80),
      postalCode: cleanText(job.postal_code || customer.postal_code, 32),
      fullAddress: validation.serviceAddress,
      accessNotes: cleanText(job.access_notes || '', 1000)
    },
    estimate: {
      roomflowId: estimate.id,
      jobId: job.id,
      title: cleanText(`${estimate.estimate_number || 'RoomFlow Estimate'} — ${job.name || validation.customerName}`, 240),
      estimateNumber: cleanText(estimate.estimate_number, 120),
      jobNumber: cleanText(job.external_key || job.id, 120),
      scopeOfWork: cleanText(job.issue_description || estimate.customer_message || '', 4000),
      customerNotes: cleanText(estimate.customer_message || '', 4000),
      internalNotes: cleanText(job.internal_notes || '', 4000),
      terms: cleanText(estimate.terms || '', 8000),
      issueDate,
      expirationDate: dueDate,
      currency,
      taxRate: validation.calculated.taxRate,
      discountMinor: validation.calculated.discountMinor,
      subtotalMinor: validation.calculated.subtotalMinor,
      taxTotalMinor: validation.calculated.taxTotalMinor,
      grandTotalMinor: validation.calculated.grandTotalMinor,
      depositRequestMinor: toMinor(estimate.deposit_request || 0),
      status: 'DRAFT',
      lines: validation.lines.map((line, index) => ({
        roomflowId: line.id || `line-${index + 1}`,
        name: cleanText(line.name, 500),
        description: cleanText(line.description, 4000),
        quantity: Number(line.quantity),
        unit: cleanText(line.unit || 'each', 80),
        unitPriceMinor: toMinor(line.unit_price),
        taxable: Boolean(line.taxable),
        lineTotalMinor: lineTotalMinor(line.quantity, line.unit_price)
      }))
    },
    attachments: attachments.map(item => ({
      roomflowId: item.id,
      type: cleanText(item.attachment_type, 80),
      name: cleanText(item.display_name || 'RoomFlow attachment', 240),
      mimeType: cleanText(item.mime_type || 'application/octet-stream', 120),
      url: cleanText(item.signed_url, 2000)
    }))
  };
}

export function buildOfficialEstimateRequest(bridgePayload, matterUid, config = {}) {
  const estimate = bridgePayload.estimate;
  const includeMatterUid = config.include_matter_uid !== false;
  if (includeMatterUid && !matterUid) throw new Error('A documented inTandem client UID is required.');
  const discountAllocations = allocateDiscountMinor(
    estimate.lines.map(line => ({ totalMinor: line.lineTotalMinor })),
    estimate.discountMinor
  );
  const taxUid = cleanText(config.provider_tax_uid, 200);
  if (estimate.taxRate > 0 && estimate.lines.some(line => line.taxable) && !taxUid) {
    const error = new Error('Configure the Townsquare tax UID before syncing taxable lines in API mode.');
    error.code = 'TAX_UID_REQUIRED';
    throw error;
  }
  const reference = [estimate.estimateNumber, estimate.jobNumber].filter(Boolean).join(' / ');
  const requestEstimate = {
      issue_date: estimate.issueDate,
      due_date: estimate.expirationDate,
      currency: estimate.currency,
      billing_address: bridgePayload.property.fullAddress,
      purchase_order: reference,
      note: [estimate.scopeOfWork, estimate.customerNotes].filter(Boolean).join('\n\n'),
      terms_and_conditions: estimate.terms,
      status: 'DRAFT',
      notify_recipient: false,
      display_items_total: true,
      items: estimate.lines.map((line, index) => {
        const item = {
          name: line.name,
          description: [line.description, line.unit ? `Unit: ${line.unit}` : ''].filter(Boolean).join('\n'),
          quantity: line.quantity,
          unit_amount: Number(fromMinor(line.unitPriceMinor)),
          item_index: index,
          entity_type: 'Custom',
          tax_uids: line.taxable && taxUid ? [taxUid] : []
        };
        if (discountAllocations[index] > 0) {
          item.discount = { amount: Number(fromMinor(discountAllocations[index])) };
        }
        return item;
      })
  };
  if (includeMatterUid) requestEstimate.matter_uid = matterUid;
  return { estimate: requestEstimate };
}

export function customerMatchCandidates(candidates, customer) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const targetEmail = normalizeEmail(customer.email);
  const targetPhone = normalizePhone(customer.phone || customer.mobile_phone);
  const targetAddress = normalizeAddress(customer.address || customer.billingAddress);
  const targetName = normalizeName(`${customer.first_name || customer.firstName || ''} ${customer.last_name || customer.lastName || ''}` || customer.name);
  const strategies = [
    ['email', row => targetEmail && normalizeEmail(row.email) === targetEmail],
    ['phone', row => targetPhone && normalizePhone(row.phone || row.mobile_phone) === targetPhone],
    ['service_address', row => targetAddress && normalizeAddress(row.address) === targetAddress],
    ['name_and_address', row => targetName && targetAddress &&
      normalizeName(`${row.first_name || ''} ${row.last_name || ''}`) === targetName &&
      normalizeAddress(row.address) === targetAddress]
  ];
  for (const [method, predicate] of strategies) {
    const matches = rows.filter(predicate);
    if (matches.length) return { method, matches, ambiguous: matches.length > 1 };
  }
  return { method: 'none', matches: [], ambiguous: false };
}

export function resolveSyncStrategy(mapping, providerStatus, roomflowRevision) {
  if (!mapping?.provider_entity_id) return { action: 'create', reason: 'No saved external estimate mapping.' };
  const status = cleanText(providerStatus || mapping.provider_status).toUpperCase();
  if (FINAL_PROVIDER_STATUSES.has(status)) {
    return { action: 'blocked', reason: `The Townsquare estimate is finalized with status ${status}.` };
  }
  if (status && status !== 'DRAFT') {
    return { action: 'review', reason: `Townsquare returned an unrecognized estimate status: ${status}.` };
  }
  if (mapping.last_roomflow_revision === roomflowRevision && status === 'DRAFT') {
    return { action: 'noop', reason: 'The Townsquare draft already matches this RoomFlow revision.' };
  }
  return { action: 'update', reason: 'A mapped Townsquare draft exists.' };
}

export function chooseAdapter(mode, { apiConfigured = false, propertyApiSupported = false, bridgeAvailable = false } = {}) {
  if (mode === 'api') {
    if (!apiConfigured) return { adapter: null, error: 'API_NOT_CONFIGURED' };
    if (!propertyApiSupported) return { adapter: null, error: 'PROPERTY_API_UNAVAILABLE' };
    return { adapter: 'api' };
  }
  if (mode === 'browser_bridge') {
    return bridgeAvailable ? { adapter: 'browser_bridge' } : { adapter: null, error: 'BRIDGE_REQUIRED' };
  }
  if (apiConfigured && propertyApiSupported) return { adapter: 'api' };
  return bridgeAvailable
    ? { adapter: 'browser_bridge' }
    : { adapter: null, error: 'BRIDGE_REQUIRED' };
}

export function validateActionRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { valid: false, error: 'A JSON object is required.' };
  const action = cleanText(body.action, 80);
  if (!MANAGEMENT_ACTIONS.has(action) && !ESTIMATE_ACTIONS.has(action)) {
    return { valid: false, error: 'Unsupported integration action.' };
  }
  const organizationId = cleanText(body.organization_id, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
    return { valid: false, error: 'A valid organization_id is required.' };
  }
  if (ESTIMATE_ACTIONS.has(action) && !['complete_bridge_sync', 'cancel_bridge_sync'].includes(action)) {
    const estimateId = cleanText(body.estimate_id, 80);
    if (!/^[0-9a-f-]{36}$/i.test(estimateId)) return { valid: false, error: 'A valid estimate_id is required.' };
  }
  return { valid: true, action, organizationId };
}

export function authorizeAction({ isMember, capabilities = [] }, action) {
  if (!isMember) return { allowed: false, code: 'ORGANIZATION_ACCESS_DENIED' };
  const capabilitySet = new Set(capabilities);
  if (MANAGEMENT_ACTIONS.has(action)) {
    return capabilitySet.has('manage_integrations')
      ? { allowed: true }
      : { allowed: false, code: 'MANAGE_INTEGRATIONS_REQUIRED' };
  }
  return capabilitySet.has('generate_proposals') || capabilitySet.has('approve_proposals')
    ? { allowed: true }
    : { allowed: false, code: 'ESTIMATE_PERMISSION_REQUIRED' };
}

export function validateBridgeEnvelope(data, allowedOrigin, actualOrigin) {
  if (!data || typeof data !== 'object') return { valid: false, error: 'INVALID_MESSAGE' };
  if (actualOrigin !== allowedOrigin) return { valid: false, error: 'ORIGIN_MISMATCH' };
  if (data.type !== 'ROOMFLOW_TOWNSQUARE_SYNC_REQUEST') return { valid: false, error: 'INVALID_MESSAGE_TYPE' };
  if (data.protocolVersion !== PROTOCOL_VERSION) return { valid: false, error: 'PROTOCOL_MISMATCH' };
  if (!/^[0-9a-f-]{36}$/i.test(cleanText(data.runId, 80))) return { valid: false, error: 'INVALID_RUN_ID' };
  if (!data.payload || data.payload.provider !== PROVIDER) return { valid: false, error: 'INVALID_PAYLOAD' };
  if (!Array.isArray(data.payload.estimate?.lines) || !data.payload.estimate.lines.length) return { valid: false, error: 'MISSING_LINES' };
  return { valid: true };
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sanitizeProviderError(error) {
  const status = Number(error?.status) || 502;
  const code = cleanText(error?.code || `PROVIDER_${status}`, 100).replace(/[^A-Z0-9_-]/gi, '_').toUpperCase();
  const raw = cleanText(error?.message || 'Townsquare request failed.', 500);
  const message = raw
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:token|authorization|cookie|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
  return { status: status >= 400 && status < 600 ? status : 502, code, message };
}
