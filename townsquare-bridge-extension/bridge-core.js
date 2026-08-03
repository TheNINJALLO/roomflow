(function (root) {
  'use strict';

  const PROTOCOL_VERSION = 1;
  const REQUEST_TYPE = 'ROOMFLOW_TOWNSQUARE_SYNC_REQUEST';
  const RESULT_TYPE = 'ROOMFLOW_TOWNSQUARE_SYNC_RESULT';
  const STATUS_TYPE = 'ROOMFLOW_TOWNSQUARE_BRIDGE_STATUS';
  const MAX_OPERATION_AGE_MS = 10 * 60 * 1000;
  const BLOCKED_ACTION = /\b(send|issue|email|approve|accept|charge|pay|collect|publish|finalize)\b|\b(delete|remove|cancel|void|reject|decline)\b.{0,20}\b(draft|estimate|proposal)\b/i;

  function cleanText(value, maxLength = 4000) {
    return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);
  }

  function isAllowedRoomFlowUrl(value) {
    try {
      const url = new URL(value);
      if (url.origin === 'https://theninjallo.github.io' && url.pathname.startsWith('/roomflow/')) return true;
      return ['localhost', '127.0.0.1'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol);
    } catch { return false; }
  }

  function toMinor(value) {
    const numeric = Number(String(value ?? '').replace(/[$,\s]/g, ''));
    if (!Number.isFinite(numeric)) throw new Error('Currency value must be finite.');
    return Math.round((numeric + Math.sign(numeric) * Number.EPSILON) * 100);
  }

  function validatePayload(payload) {
    const errors = [];
    if (!payload || payload.provider !== 'townsquare') errors.push('Invalid provider payload.');
    const customer = payload?.customer || {};
    const property = payload?.property || {};
    const estimate = payload?.estimate || {};
    if (!cleanText(customer.firstName || customer.lastName)) errors.push('Customer name is required.');
    if (!cleanText(customer.email) && !cleanText(customer.phone)) errors.push('Customer contact information is required.');
    for (const [label, value] of [['street address', property.streetAddress], ['city', property.city], ['state', property.state], ['postal code', property.postalCode]]) {
      if (!cleanText(value)) errors.push(`Service ${label} is required.`);
    }
    if (estimate.status !== 'DRAFT') errors.push('Only DRAFT estimate payloads are allowed.');
    if (!Array.isArray(estimate.lines) || !estimate.lines.length) errors.push('At least one estimate line is required.');
    let subtotal = 0;
    for (const line of estimate.lines || []) {
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) errors.push('Every quantity must be greater than zero.');
      if (!Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) errors.push('Every unit price must use non-negative integer minor units.');
      subtotal += Math.round(quantity * Number(line.unitPriceMinor || 0));
    }
    if (Number.isSafeInteger(estimate.subtotalMinor) && subtotal !== estimate.subtotalMinor) errors.push('Estimate subtotal does not match its lines.');
    if (!Number.isSafeInteger(estimate.grandTotalMinor)) errors.push('Grand total must use integer minor units.');
    return { valid: errors.length === 0, errors };
  }

  function validatePageRequest(event, pageUrl) {
    if (!event || event.source !== window) return { valid: false, error: 'INVALID_SOURCE' };
    if (!isAllowedRoomFlowUrl(pageUrl)) return { valid: false, error: 'ROOMFLOW_ORIGIN_NOT_ALLOWED' };
    const expectedOrigin = new URL(pageUrl).origin;
    if (event.origin !== expectedOrigin) return { valid: false, error: 'ORIGIN_MISMATCH' };
    const data = event.data;
    if (!data || data.type !== REQUEST_TYPE || data.protocolVersion !== PROTOCOL_VERSION) return { valid: false, error: 'INVALID_PROTOCOL' };
    if (!/^[0-9a-f-]{36}$/i.test(cleanText(data.runId, 80))) return { valid: false, error: 'INVALID_RUN_ID' };
    if (!cleanText(data.bridgeToken, 500) || !cleanText(data.destinationUrl, 2000)) return { valid: false, error: 'MISSING_OPERATION_DATA' };
    const payload = validatePayload(data.payload);
    if (!payload.valid) return { valid: false, error: 'INVALID_PAYLOAD', details: payload.errors };
    return { valid: true };
  }

  function validateStoredOperation(operation) {
    if (!operation || !operation.createdAt || !operation.expiresAt) return { valid: false, error: 'MISSING_OPERATION' };
    const expiresAt = new Date(operation.expiresAt).getTime();
    const createdAt = new Date(operation.createdAt).getTime();
    if (!Number.isFinite(expiresAt) || !Number.isFinite(createdAt) || expiresAt <= Date.now() || Date.now() - createdAt > MAX_OPERATION_AGE_MS) {
      return { valid: false, error: 'OPERATION_EXPIRED' };
    }
    return validatePayload(operation.payload);
  }

  function redact(value) {
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') {
      const output = {};
      for (const [key, item] of Object.entries(value)) {
        if (/token|authorization|cookie|password|email|phone|address|name|description|notes?|payload/i.test(key)) output[key] = '[REDACTED]';
        else output[key] = redact(item);
      }
      return output;
    }
    return typeof value === 'string' && value.length > 120 ? `${value.slice(0, 20)}…[REDACTED]` : value;
  }

  function isBlockedAction(value) {
    return BLOCKED_ACTION.test(cleanText(value, 300));
  }

  function elementActionText(element) {
    if (!element) return '';
    return [element.textContent, element.getAttribute?.('aria-label'), element.getAttribute?.('title'), element.getAttribute?.('name'), element.value]
      .filter(Boolean).join(' ');
  }

  function assertDraftSafeElement(element) {
    const text = elementActionText(element);
    if (isBlockedAction(text)) throw Object.assign(new Error(`Unsafe Townsquare action blocked: ${cleanText(text, 100)}`), { code: 'UNSAFE_ACTION_BLOCKED' });
    return true;
  }

  const api = {
    PROTOCOL_VERSION, REQUEST_TYPE, RESULT_TYPE, STATUS_TYPE, MAX_OPERATION_AGE_MS,
    cleanText, isAllowedRoomFlowUrl, toMinor, validatePayload, validatePageRequest,
    validateStoredOperation, redact, isBlockedAction, elementActionText, assertDraftSafeElement
  };
  root.RoomFlowBridgeCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
