import {
  buildOfficialEstimateRequest,
  cleanText,
  customerMatchCandidates,
  sanitizeProviderError
} from './townsquare-core.mjs';

const DEFAULT_BASE_URL = 'https://api.vcita.biz';
const DEFAULT_TIMEOUT_MS = 15000;

function providerError(message, code, status = 502, details = null) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function unwrap(response, key) {
  const data = response?.data || response || {};
  return key ? data[key] : data;
}

export class OfficialTownsquareProvider {
  constructor({ token, baseUrl = DEFAULT_BASE_URL, businessUid = '', taxUid = '', fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!cleanText(token, 10000)) throw providerError('Townsquare API token is not configured.', 'API_NOT_CONFIGURED', 400);
    this.token = token;
    this.baseUrl = cleanText(baseUrl, 500).replace(/\/+$/, '') || DEFAULT_BASE_URL;
    this.businessUid = cleanText(businessUid, 200);
    this.taxUid = cleanText(taxUid, 200);
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(1000, Math.min(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 30000));
  }

  async request(path, { method = 'GET', body, safeRetry = false } = {}) {
    const attempts = safeRetry ? 2 : 1;
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers = {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`
        };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (this.businessUid) headers['X-On-Behalf-Of'] = this.businessUid;
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal
        });
        const text = await response.text();
        let payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
        if (!response.ok) {
          const providerIssue = Array.isArray(payload?.errors) ? payload.errors[0] : null;
          throw providerError(
            providerIssue?.message || payload?.message || `Townsquare returned HTTP ${response.status}.`,
            providerIssue?.code || `TOWNSQUARE_HTTP_${response.status}`,
            response.status,
            providerIssue?.field ? { field: cleanText(providerIssue.field, 120) } : null
          );
        }
        return payload;
      } catch (error) {
        lastError = error?.name === 'AbortError'
          ? providerError('Townsquare did not respond before the request timed out.', 'TOWNSQUARE_TIMEOUT', 504)
          : error;
        if (attempt + 1 >= attempts) break;
      } finally {
        clearTimeout(timer);
      }
    }
    const safe = sanitizeProviderError(lastError);
    throw providerError(safe.message, safe.code, safe.status, lastError?.details || null);
  }

  async testConnection() {
    const response = await this.request('/platform/v1/clients?per_page=1&page=1', { safeRetry: true });
    const clients = unwrap(response, 'clients');
    return {
      connected: Array.isArray(clients),
      apiBaseUrl: this.baseUrl,
      capabilities: {
        customers: true,
        draftEstimates: true,
        draftStatusVerification: true,
        serviceProperties: false,
        estimateAttachments: false
      }
    };
  }

  async findCustomer(customer) {
    const candidates = [];
    const seen = new Set();
    const searches = [
      ['email', customer.email],
      ['phone', customer.phone]
    ].filter(([, value]) => cleanText(value));
    for (const [searchBy, searchTerm] of searches) {
      const query = new URLSearchParams({ search_by: searchBy, search_term: cleanText(searchTerm, 320), per_page: '100', page: '1' });
      const response = await this.request(`/platform/v1/clients?${query}`, { safeRetry: true });
      for (const client of unwrap(response, 'clients') || []) {
        const id = cleanText(client.id || client.uid, 200);
        if (id && !seen.has(id)) {
          seen.add(id);
          candidates.push(client);
        }
      }
    }
    return customerMatchCandidates(candidates, customer);
  }

  async createCustomer(customer) {
    const body = {
      first_name: cleanText(customer.firstName || customer.first_name, 120),
      last_name: cleanText(customer.lastName || customer.last_name, 120),
      email: cleanText(customer.email, 320) || undefined,
      phone: cleanText(customer.phone, 64) || undefined,
      address: cleanText(customer.billingAddress || customer.address, 800) || undefined,
      status: 'lead',
      source_name: 'RoomFlow',
      source_channel: 'integration'
    };
    if (!body.first_name) throw providerError('Customer first name is required by the official API.', 'CUSTOMER_NAME_REQUIRED', 422);
    Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);
    // This POST is intentionally never retried: the official API does not
    // document an idempotency header for client creation.
    const response = await this.request('/platform/v1/clients', { method: 'POST', body });
    const client = unwrap(response, 'client');
    const id = cleanText(client?.id || client?.uid, 200);
    if (!id) throw providerError('Townsquare created a client but did not return a client ID.', 'CUSTOMER_ID_MISSING', 502);
    return { ...client, id };
  }

  async updateCustomer(providerCustomerId, customer) {
    if (!providerCustomerId) throw providerError('Townsquare client ID is required.', 'CUSTOMER_ID_REQUIRED', 422);
    const body = {
      first_name: cleanText(customer.firstName || customer.first_name, 120),
      last_name: cleanText(customer.lastName || customer.last_name, 120),
      email: cleanText(customer.email, 320) || undefined,
      phone: cleanText(customer.phone, 64) || undefined,
      address: cleanText(customer.billingAddress || customer.address, 800) || undefined,
      status: 'lead'
    };
    Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);
    const response = await this.request(`/platform/v1/clients/${encodeURIComponent(providerCustomerId)}`, { method: 'PUT', body });
    const client = unwrap(response, 'client') || unwrap(response);
    return { ...client, id: cleanText(client?.id || client?.uid || providerCustomerId, 200) };
  }

  async findProperty() {
    return { supported: false, reason: 'The official inTandem OpenAPI specifications do not publish a service-property resource.' };
  }

  async createProperty() {
    throw providerError(
      'The official inTandem API does not currently publish a service-property create endpoint. Use Browser Bridge mode.',
      'PROPERTY_API_UNAVAILABLE',
      422
    );
  }

  async updateProperty() {
    throw providerError(
      'The official inTandem API does not currently publish a service-property update endpoint. Use Browser Bridge mode.',
      'PROPERTY_API_UNAVAILABLE',
      422
    );
  }

  async createDraftEstimate(bridgePayload, providerCustomerId) {
    const body = buildOfficialEstimateRequest(bridgePayload, providerCustomerId, { provider_tax_uid: this.taxUid });
    // Never retry a create without a documented provider idempotency key.
    const response = await this.request('/business/payments/v1/estimates', { method: 'POST', body });
    const estimate = unwrap(response, 'estimate');
    const id = cleanText(estimate?.uid || estimate?.id, 200);
    const status = cleanText(estimate?.status, 80).toUpperCase();
    if (!id) throw providerError('Townsquare did not return the created estimate ID.', 'ESTIMATE_ID_MISSING', 502);
    if (status !== 'DRAFT') {
      throw providerError(
        `Townsquare returned ${status || 'an unknown status'} instead of DRAFT. Review the estimate in Townsquare immediately.`,
        'DRAFT_NOT_CONFIRMED',
        409,
        { providerEstimateId: id, providerStatus: status }
      );
    }
    return { ...estimate, uid: id, status };
  }

  async updateDraftEstimate(providerEstimateId, bridgePayload) {
    const current = await this.getEstimateStatus(providerEstimateId);
    if (current.status !== 'DRAFT') {
      throw providerError(
        `The mapped Townsquare estimate is ${current.status || 'not confirmed as a draft'} and will not be overwritten.`,
        'FINALIZED_ESTIMATE_BLOCKED',
        409
      );
    }
    const body = buildOfficialEstimateRequest(bridgePayload, '', {
      provider_tax_uid: this.taxUid,
      include_matter_uid: false
    });
    const response = await this.request(`/business/payments/v1/estimates/${encodeURIComponent(providerEstimateId)}`, { method: 'PUT', body });
    const estimate = unwrap(response, 'estimate');
    const status = cleanText(estimate?.status, 80).toUpperCase();
    if (status !== 'DRAFT') throw providerError('Townsquare did not confirm the updated estimate as a draft.', 'DRAFT_NOT_CONFIRMED', 409);
    return { ...estimate, uid: cleanText(estimate?.uid || providerEstimateId, 200), status };
  }

  async attachDocument() {
    return {
      status: 'skipped',
      reason: 'The official inTandem OpenAPI specifications do not publish an estimate-attachment endpoint.'
    };
  }

  async getEstimateStatus(providerEstimateId) {
    if (!providerEstimateId) throw providerError('Townsquare estimate ID is required.', 'ESTIMATE_ID_REQUIRED', 422);
    const response = await this.request(`/business/payments/v1/estimates/${encodeURIComponent(providerEstimateId)}`, { safeRetry: true });
    const estimate = unwrap(response, 'estimate');
    return {
      id: cleanText(estimate?.uid || estimate?.id || providerEstimateId, 200),
      status: cleanText(estimate?.status, 80).toUpperCase(),
      total: estimate?.total,
      matterUid: cleanText(estimate?.matter_uid, 200),
      revision: cleanText(estimate?.last_action || estimate?.updated_at, 200),
      raw: estimate
    };
  }
}

export const officialApiDocumentation = Object.freeze({
  clients: 'https://developers.intandem.tech/reference/post_platform-v1-clients',
  createEstimate: 'https://developers.intandem.tech/reference/post_business-payments-v1-estimates',
  updateEstimate: 'https://developers.intandem.tech/reference/put_business-payments-v1-estimates-estimate-uid',
  getEstimate: 'https://developers.intandem.tech/reference/get_business-payments-v1-estimates-estimate-uid'
});
