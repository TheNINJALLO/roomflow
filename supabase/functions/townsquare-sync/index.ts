import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import {
  BRIDGE_TTL_MS,
  buildBridgePayload,
  chooseAdapter,
  cleanText,
  fromMinor,
  sanitizeProviderError,
  stableJson,
  toMinor,
  validateActionRequest,
  authorizeAction
} from './shared/townsquare-core.mjs';
import { OfficialTownsquareProvider, officialApiDocumentation } from './shared/townsquare-provider.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ENCRYPTION_KEY = Deno.env.get('TOWNSQUARE_ENCRYPTION_KEY') || '';
const ALLOWED_ORIGINS = new Set((Deno.env.get('ROOMFLOW_ALLOWED_ORIGINS') ||
  'https://theninjallo.github.io,http://localhost:8080,http://127.0.0.1:8080')
  .split(',').map(value => value.trim()).filter(Boolean));
const API_HOSTS = new Set((Deno.env.get('TOWNSQUARE_ALLOWED_API_HOSTS') || 'api.vcita.biz')
  .split(',').map(value => value.trim().toLowerCase()).filter(Boolean));

const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://theninjallo.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
}

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function throwHttp(message: string, code: string, status = 400, details: unknown = null): never {
  const error = new Error(message) as Error & { code?: string; status?: number; details?: unknown };
  error.code = code;
  error.status = status;
  error.details = details;
  throw error;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function encryptionCryptoKey() {
  if (!ENCRYPTION_KEY) throwHttp('TOWNSQUARE_ENCRYPTION_KEY is not configured.', 'ENCRYPTION_KEY_MISSING', 503);
  let bytes: Uint8Array;
  try { bytes = base64ToBytes(ENCRYPTION_KEY); } catch { throwHttp('TOWNSQUARE_ENCRYPTION_KEY must be base64 encoded.', 'ENCRYPTION_KEY_INVALID', 503); }
  if (bytes.byteLength !== 32) throwHttp('TOWNSQUARE_ENCRYPTION_KEY must decode to exactly 32 bytes.', 'ENCRYPTION_KEY_INVALID', 503);
  return crypto.subtle.importKey('raw', asArrayBuffer(bytes), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptToken(token: string) {
  const key = await encryptionCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  return {
    api_token_ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    api_token_iv: bytesToBase64(iv),
    api_token_key_version: 'aes-gcm-v1',
    credential_updated_at: new Date().toISOString()
  };
}

async function decryptToken(integration: Record<string, any>) {
  if (!integration.api_token_ciphertext || !integration.api_token_iv) return '';
  const key = await encryptionCryptoKey();
  try {
    const iv = base64ToBytes(integration.api_token_iv);
    const ciphertext = base64ToBytes(integration.api_token_ciphertext);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(iv) },
      key,
      asArrayBuffer(ciphertext)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throwHttp('The saved Townsquare credential cannot be decrypted. Replace it in RoomFlow Settings.', 'CREDENTIAL_DECRYPTION_FAILED', 500);
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function bearerToken(req: Request) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throwHttp('Authentication is required.', 'AUTHENTICATION_REQUIRED', 401);
  return match[1];
}

async function authorizationContext(req: Request, organizationId: string, action: string) {
  const token = bearerToken(req);
  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData?.user) throwHttp('The RoomFlow session is invalid or expired.', 'INVALID_SESSION', 401);
  const userId = userData.user.id;
  const { data: member, error: memberError } = await service
    .from('organization_members')
    .select('id,role_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (memberError) throwHttp('Organization membership could not be verified.', 'MEMBERSHIP_CHECK_FAILED', 500);
  const capabilities = new Set<string>();
  if (member?.role_id) {
    const { data: roleCapabilities, error } = await service.from('role_capabilities').select('capability').eq('role_id', member.role_id);
    if (error) throwHttp('Role permissions could not be verified.', 'PERMISSION_CHECK_FAILED', 500);
    for (const item of roleCapabilities || []) capabilities.add(item.capability);
  }
  if (member?.id) {
    const { data: overrides, error } = await service.from('member_capability_overrides').select('capability,allowed').eq('member_id', member.id);
    if (error) throwHttp('Member permissions could not be verified.', 'PERMISSION_CHECK_FAILED', 500);
    for (const override of overrides || []) {
      if (override.allowed) capabilities.add(override.capability);
      else capabilities.delete(override.capability);
    }
  }
  const decision = authorizeAction({ isMember: Boolean(member), capabilities: [...capabilities] } as any, action);
  if (!decision.allowed) throwHttp('You do not have permission to perform this Townsquare action.', decision.code || 'PERMISSION_DENIED', 403);
  return { userId, capabilities: [...capabilities] };
}

async function getIntegration(organizationId: string, required = true) {
  const { data, error } = await service
    .from('external_integrations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('provider', 'townsquare')
    .maybeSingle();
  if (error) throwHttp('Townsquare configuration could not be loaded.', 'CONFIGURATION_READ_FAILED', 500);
  if (!data && required) throwHttp('Configure Townsquare in RoomFlow Settings first.', 'INTEGRATION_NOT_CONFIGURED', 409);
  return data;
}

function publicConfiguration(integration: Record<string, any> | null) {
  if (!integration) {
    return {
      configured: false,
      provider: 'townsquare',
      enabled: false,
      connection_mode: 'auto',
      api_base_url: 'https://api.vcita.biz',
      browser_destination_url: '',
      currency: 'USD',
      estimate_expiration_days: 30,
      attachment_mode: 'selected',
      has_api_token: false,
      provider_capabilities: { customers: true, draftEstimates: true, serviceProperties: false, estimateAttachments: false }
    };
  }
  return {
    configured: true,
    id: integration.id,
    provider: integration.provider,
    enabled: integration.enabled,
    connection_mode: integration.connection_mode,
    api_base_url: integration.api_base_url,
    browser_destination_url: integration.browser_destination_url || '',
    currency: integration.currency,
    estimate_expiration_days: integration.estimate_expiration_days,
    attachment_mode: integration.attachment_mode,
    provider_business_uid: integration.provider_business_uid || '',
    provider_tax_uid: integration.provider_tax_uid || '',
    has_api_token: Boolean(integration.api_token_ciphertext),
    credential_updated_at: integration.credential_updated_at,
    provider_capabilities: integration.provider_capabilities || {},
    last_successful_sync_at: integration.last_successful_sync_at,
    last_failed_sync_at: integration.last_failed_sync_at,
    last_error_code: integration.last_error_code,
    updated_at: integration.updated_at
  };
}

function safeHttpsUrl(value: unknown, kind: 'api' | 'browser') {
  const raw = cleanText(value, 2000);
  if (!raw) return '';
  let url: URL;
  try { url = new URL(raw); } catch { throwHttp(`The ${kind} URL is invalid.`, 'INVALID_DESTINATION_URL', 422); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throwHttp(`The ${kind} URL must be HTTPS and cannot contain credentials.`, 'INVALID_DESTINATION_URL', 422);
  }
  if (kind === 'api' && !API_HOSTS.has(url.hostname.toLowerCase())) {
    throwHttp('The API host is not in the server-side Townsquare allowlist.', 'API_HOST_NOT_ALLOWED', 422);
  }
  return url.toString().replace(/\/+$/, '');
}

async function saveConfiguration(organizationId: string, userId: string, body: Record<string, any>) {
  const existing = await getIntegration(organizationId, false);
  const config = body.configuration || {};
  const mode = ['auto', 'api', 'browser_bridge'].includes(config.connection_mode) ? config.connection_mode : 'auto';
  const currency = cleanText(config.currency || 'USD', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throwHttp('Currency must be a three-letter ISO code.', 'INVALID_CURRENCY', 422);
  const requestedExpiration = Number(config.estimate_expiration_days ?? 30);
  if (!Number.isFinite(requestedExpiration)) throwHttp('Estimate expiration must be a number of days from 1 to 365.', 'INVALID_EXPIRATION', 422);
  const expiration = Math.min(365, Math.max(1, Math.round(requestedExpiration)));
  const attachmentMode = ['none', 'selected', 'all_estimate'].includes(config.attachment_mode) ? config.attachment_mode : 'selected';
  const row: Record<string, any> = {
    organization_id: organizationId,
    provider: 'townsquare',
    enabled: Boolean(config.enabled),
    connection_mode: mode,
    api_base_url: safeHttpsUrl(config.api_base_url || 'https://api.vcita.biz', 'api'),
    browser_destination_url: safeHttpsUrl(config.browser_destination_url, 'browser') || null,
    currency,
    estimate_expiration_days: expiration,
    attachment_mode: attachmentMode,
    provider_business_uid: cleanText(config.provider_business_uid, 200) || null,
    provider_tax_uid: cleanText(config.provider_tax_uid, 200) || null,
    provider_capabilities: {
      customers: true,
      draftEstimates: true,
      draftStatusVerification: true,
      serviceProperties: false,
      estimateAttachments: false,
      verifiedFrom: 'official-intandem-openapi'
    },
    settings: { require_service_property: true, final_send_manual: true },
    updated_by: userId
  };
  if (!existing) row.created_by = userId;
  const newToken = cleanText(config.api_token, 10000);
  if (newToken) Object.assign(row, await encryptToken(newToken));
  const { data, error } = await service
    .from('external_integrations')
    .upsert(row, { onConflict: 'organization_id,provider' })
    .select('*')
    .single();
  if (error) throwHttp('Townsquare configuration could not be saved.', 'CONFIGURATION_SAVE_FAILED', 500);
  return publicConfiguration(data);
}

async function clearToken(organizationId: string, userId: string) {
  const { data, error } = await service.from('external_integrations').update({
    api_token_ciphertext: null,
    api_token_iv: null,
    api_token_key_version: null,
    credential_updated_at: null,
    updated_by: userId
  }).eq('organization_id', organizationId).eq('provider', 'townsquare').select('*').single();
  if (error) throwHttp('The Townsquare API credential could not be cleared.', 'CREDENTIAL_CLEAR_FAILED', 500);
  return publicConfiguration(data);
}

async function providerFor(integration: Record<string, any>) {
  const token = await decryptToken(integration);
  return new OfficialTownsquareProvider({
    token,
    baseUrl: integration.api_base_url,
    businessUid: integration.provider_business_uid,
    taxUid: integration.provider_tax_uid
  } as any);
}

async function loadEstimateBundle(organizationId: string, estimateId: string, attachmentMode: 'none' | 'selected' | 'all_estimate' = 'none') {
  const { data: estimate, error: estimateError } = await service.from('estimates').select('*')
    .eq('id', estimateId).eq('organization_id', organizationId).single();
  if (estimateError || !estimate) throwHttp('The requested RoomFlow estimate was not found in this organization.', 'ESTIMATE_NOT_FOUND', 404);
  const [{ data: job, error: jobError }, { data: lines, error: linesError }, { data: attachments, error: attachmentError }] = await Promise.all([
    service.from('jobs').select('*,customers(*)').eq('id', estimate.job_id).eq('organization_id', organizationId).single(),
    service.from('estimate_lines').select('*').eq('estimate_id', estimate.id).order('sort_order'),
    service.from('estimate_attachments').select('*').eq('estimate_id', estimate.id)
  ]);
  if (jobError || !job) throwHttp('The estimate job could not be loaded.', 'JOB_NOT_FOUND', 404);
  if (linesError) throwHttp('Estimate lines could not be loaded.', 'ESTIMATE_LINES_READ_FAILED', 500);
  if (attachmentError) throwHttp('Estimate attachment metadata could not be loaded.', 'ATTACHMENT_READ_FAILED', 500);
  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
  if (!customer) throwHttp('The estimate customer could not be loaded.', 'CUSTOMER_NOT_FOUND', 404);
  const safeAttachments: Record<string, any>[] = [];
  if (attachmentMode !== 'none') {
    const includedAttachments = (attachments || []).filter(attachment =>
      attachmentMode === 'all_estimate' || attachment.metadata?.selected !== false
    );
    for (const attachment of includedAttachments) {
      const { data } = await service.storage.from(attachment.storage_bucket).createSignedUrl(attachment.storage_path, Math.floor(BRIDGE_TTL_MS / 1000));
      if (data?.signedUrl) safeAttachments.push({ ...attachment, signed_url: data.signedUrl });
    }
  }
  const revisionParts = [
    estimate.updated_at,
    ...(lines || []).map(line => line.updated_at || line.created_at),
    ...(attachments || []).map(attachment => attachment.updated_at || attachment.created_at)
  ].filter(Boolean).sort();
  return { estimate, job, customer, lines: lines || [], attachments: safeAttachments, revision: revisionParts.at(-1) || estimate.updated_at };
}

async function addEvent(run: Record<string, any>, status: string, message: string, metadata: Record<string, unknown> = {}) {
  const safeMetadata = Object.fromEntries(Object.entries(metadata).filter(([key]) => !/token|authorization|cookie|password|payload/i.test(key)));
  const { error } = await service.from('external_sync_events').insert({
    organization_id: run.organization_id,
    sync_run_id: run.id,
    status,
    message: cleanText(message, 500),
    metadata: safeMetadata
  });
  if (error) throwHttp('The Townsquare audit event could not be recorded.', 'AUDIT_EVENT_WRITE_FAILED', 500);
}

async function markRunFailed(run: Record<string, any>, code: string, message: string, metadata: Record<string, unknown> = {}) {
  const safeCode = cleanText(code || 'TOWNSQUARE_SYNC_FAILED', 100);
  const safeMessage = cleanText(message || 'Townsquare synchronization failed.', 500);
  const now = new Date().toISOString();
  const { error: runError } = await service.from('external_sync_runs').update({
    status: 'failed', error_code: safeCode, error_message: safeMessage,
    bridge_token_hash: null, bridge_expires_at: null, completed_at: now
  }).eq('id', run.id);
  if (runError) throwHttp('The failed Townsquare run could not be recorded.', 'SYNC_RUN_UPDATE_FAILED', 500);
  const { error: integrationError } = await service.from('external_integrations').update({
    last_failed_sync_at: now, last_error_code: safeCode
  }).eq('id', run.integration_id);
  if (integrationError) throwHttp('The Townsquare failure status could not be recorded.', 'INTEGRATION_STATUS_UPDATE_FAILED', 500);
  await addEvent(run, 'failed', safeMessage, { errorCode: safeCode, ...metadata });
  return { status: 'failed', error: { code: safeCode, message: safeMessage } };
}

async function createOrReuseRun(integration: Record<string, any>, bundle: Record<string, any>, adapterMode: string, userId: string) {
  const bridgePayload = buildBridgePayload(bundle, integration) as Record<string, any>;
  const fingerprint = await sha256(stableJson(bridgePayload));
  const idempotencyKey = `${bundle.estimate.id}:${bundle.revision}:${integration.updated_at || 'unconfigured'}:${adapterMode}`;
  const row = {
    organization_id: integration.organization_id,
    integration_id: integration.id,
    provider: 'townsquare',
    adapter_mode: adapterMode,
    job_id: bundle.job.id,
    estimate_id: bundle.estimate.id,
    status: 'validating',
    idempotency_key: idempotencyKey,
    request_fingerprint: fingerprint,
    roomflow_revision: bundle.revision,
    roomflow_total_minor: bridgePayload.estimate.grandTotalMinor,
    created_by: userId,
    started_at: new Date().toISOString()
  };
  const { data: inserted, error } = await service.from('external_sync_runs').insert(row).select('*').single();
  if (!error) {
    await addEvent(inserted, 'validating', 'RoomFlow estimate validated server-side.');
    return { run: inserted, payload: bridgePayload, reused: false };
  }
  if (error.code !== '23505') throwHttp('The synchronization run could not be created.', 'SYNC_RUN_CREATE_FAILED', 500);
  const { data: existing, error: existingError } = await service.from('external_sync_runs').select('*')
    .eq('organization_id', integration.organization_id).eq('provider', 'townsquare').eq('idempotency_key', idempotencyKey).single();
  if (existingError || !existing) throwHttp('The prior synchronization run could not be loaded.', 'SYNC_RUN_READ_FAILED', 500);
  return { run: existing, payload: bridgePayload, reused: true };
}

async function prepareBridge(integration: Record<string, any>, bundle: Record<string, any>, userId: string, queuedOnly = false) {
  if (!integration.enabled) throwHttp('Enable the Townsquare integration before syncing.', 'INTEGRATION_DISABLED', 409);
  if (!integration.browser_destination_url) throwHttp('Set the Townsquare browser destination URL in Settings.', 'BROWSER_DESTINATION_REQUIRED', 409);
  const created = await createOrReuseRun(integration, bundle, 'browser_bridge', userId);
  const { data: savedMappings, error: mappingError } = await service.from('external_entity_mappings')
    .select('entity_type,roomflow_entity_id,provider_entity_id,provider_status,provider_url')
    .eq('organization_id', integration.organization_id)
    .eq('provider', 'townsquare')
    .in('roomflow_entity_id', [bundle.customer.id, bundle.job.id, bundle.estimate.id]);
  if (mappingError) throwHttp('Saved Townsquare mappings could not be loaded.', 'MAPPING_READ_FAILED', 500);
  const mappingByType = new Map((savedMappings || []).map(item => [item.entity_type, item]));
  created.payload.externalMappings = {
    customerId: mappingByType.get('customer')?.provider_entity_id || '',
    propertyId: mappingByType.get('property')?.provider_entity_id || '',
    estimateId: mappingByType.get('estimate')?.provider_entity_id || '',
    estimateStatus: mappingByType.get('estimate')?.provider_status || '',
    estimateUrl: mappingByType.get('estimate')?.provider_url || ''
  };
  if (created.run.status === 'completed') {
    return { completed: true, run: created.run, payload: null };
  }
  if (queuedOnly) {
    const { error } = await service.from('external_sync_runs').update({ status: 'queued', bridge_token_hash: null, bridge_expires_at: null }).eq('id', created.run.id);
    if (error) throwHttp('The desktop synchronization could not be queued.', 'SYNC_QUEUE_UPDATE_FAILED', 500);
    await addEvent(created.run, 'queued', 'Synchronization queued for an authenticated desktop browser.');
    return { queued: true, run: { ...created.run, status: 'queued' }, payload: null };
  }
  const bridgeToken = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
  const bridgeTokenHash = await sha256(bridgeToken);
  const expiresAt = new Date(Date.now() + BRIDGE_TTL_MS).toISOString();
  const { data: run, error } = await service.from('external_sync_runs').update({
    status: 'opening_townsquare',
    bridge_token_hash: bridgeTokenHash,
    bridge_expires_at: expiresAt,
    error_code: null,
    error_message: null
  }).eq('id', created.run.id).select('*').single();
  if (error) throwHttp('The browser bridge operation could not be prepared.', 'BRIDGE_PREPARE_FAILED', 500);
  await addEvent(run, 'opening_townsquare', 'Waiting for the desktop browser bridge to open Townsquare.');
  return {
    bridge_required: true,
    run: { id: run.id, status: run.status, expires_at: expiresAt },
    bridge_token: bridgeToken,
    destination_url: integration.browser_destination_url,
    payload: created.payload
  };
}

async function getEstimateSync(organizationId: string, estimateId: string) {
  const [{ data: mapping }, { data: runs, error: runError }] = await Promise.all([
    service.from('external_entity_mappings').select('provider_entity_id,provider_status,provider_url,last_roomflow_revision,last_provider_revision,last_synced_at')
      .eq('organization_id', organizationId).eq('provider', 'townsquare').eq('entity_type', 'estimate').eq('roomflow_entity_id', estimateId).maybeSingle(),
    service.from('external_sync_runs').select('id,status,adapter_mode,provider_estimate_id,provider_estimate_url,roomflow_total_minor,provider_total_minor,error_code,error_message,review_reason,created_at,completed_at')
      .eq('organization_id', organizationId).eq('estimate_id', estimateId).order('created_at', { ascending: false }).limit(10)
  ]);
  if (runError) throwHttp('Synchronization history could not be loaded.', 'SYNC_HISTORY_READ_FAILED', 500);
  return { mapping: mapping || null, runs: runs || [] };
}

function safeResultUrl(value: unknown, destination: string) {
  const raw = cleanText(value, 2000);
  if (!raw) return '';
  try {
    const result = new URL(raw);
    const expected = new URL(destination);
    return result.protocol === 'https:' && result.origin === expected.origin ? result.toString() : '';
  } catch { return ''; }
}

async function upsertMapping(run: Record<string, any>, entityType: string, roomflowId: string, providerId: string, providerStatus: string, providerUrl: string, userId: string) {
  if (!providerId) throwHttp(`The browser bridge did not return a ${entityType} ID.`, 'BRIDGE_RESULT_INCOMPLETE', 422);
  const { error } = await service.from('external_entity_mappings').upsert({
    organization_id: run.organization_id,
    integration_id: run.integration_id,
    provider: 'townsquare',
    entity_type: entityType,
    roomflow_entity_id: roomflowId,
    provider_entity_id: cleanText(providerId, 300),
    provider_status: cleanText(providerStatus, 80) || null,
    provider_url: providerUrl || null,
    last_roomflow_revision: run.roomflow_revision,
    last_synced_at: new Date().toISOString(),
    created_by: userId,
    updated_by: userId
  }, { onConflict: 'organization_id,provider,entity_type,roomflow_entity_id' });
  if (error) throwHttp(`The ${entityType} mapping could not be saved.`, 'MAPPING_SAVE_FAILED', 500);
}

async function completeBridge(organizationId: string, userId: string, body: Record<string, any>) {
  const runId = cleanText(body.run_id, 80);
  const bridgeToken = cleanText(body.bridge_token, 500);
  const result = body.result || {};
  const { data: run, error } = await service.from('external_sync_runs').select('*')
    .eq('id', runId).eq('organization_id', organizationId).eq('provider', 'townsquare').single();
  if (error || !run) throwHttp('The browser bridge run was not found.', 'SYNC_RUN_NOT_FOUND', 404);
  if (!run.bridge_token_hash || await sha256(bridgeToken) !== run.bridge_token_hash) throwHttp('The browser bridge token is invalid.', 'INVALID_BRIDGE_TOKEN', 403);
  if (!run.bridge_expires_at || new Date(run.bridge_expires_at).getTime() < Date.now()) throwHttp('The browser bridge operation expired. Retry from RoomFlow.', 'BRIDGE_OPERATION_EXPIRED', 410);

  if (result.status === 'cancelled') {
    const { error: cancelError } = await service.from('external_sync_runs').update({ status: 'cancelled', bridge_token_hash: null, bridge_expires_at: null, completed_at: new Date().toISOString() }).eq('id', run.id);
    if (cancelError) throwHttp('The cancelled Townsquare run could not be recorded.', 'SYNC_RUN_UPDATE_FAILED', 500);
    await addEvent(run, 'cancelled', 'The user cancelled the browser bridge operation.');
    return { status: 'cancelled' };
  }
  if (result.status !== 'completed' || result.confirmedDraft !== true) {
    const message = cleanText(result.message || 'The browser bridge could not confirm a Townsquare draft.', 500);
    return markRunFailed(run, result.code || 'BRIDGE_SYNC_FAILED', message, { stage: cleanText(result.stage, 80) || 'unknown' });
  }

  const providerStatus = cleanText(result.estimate?.status, 80).toUpperCase();
  if (providerStatus !== 'DRAFT') return markRunFailed(run, 'DRAFT_NOT_CONFIRMED', 'The browser bridge did not confirm DRAFT status.');
  const providerTotalMinor = Number(result.estimate?.totalMinor);
  if (!Number.isSafeInteger(providerTotalMinor) || providerTotalMinor !== Number(run.roomflow_total_minor)) {
    const reviewReason = `RoomFlow total ${fromMinor(Number(run.roomflow_total_minor))} does not match Townsquare total ${Number.isSafeInteger(providerTotalMinor) ? fromMinor(providerTotalMinor) : 'unknown'}.`;
    const { error: reviewError } = await service.from('external_sync_runs').update({
      status: 'review_required', provider_total_minor: Number.isSafeInteger(providerTotalMinor) ? providerTotalMinor : null,
      review_reason: reviewReason, bridge_token_hash: null, bridge_expires_at: null
    }).eq('id', run.id);
    if (reviewError) throwHttp('The Townsquare review status could not be recorded.', 'SYNC_RUN_UPDATE_FAILED', 500);
    const { error: reviewIntegrationError } = await service.from('external_integrations').update({ last_failed_sync_at: new Date().toISOString(), last_error_code: 'TOTAL_MISMATCH' }).eq('id', run.integration_id);
    if (reviewIntegrationError) throwHttp('The Townsquare review status could not be recorded.', 'INTEGRATION_STATUS_UPDATE_FAILED', 500);
    await addEvent(run, 'review_required', reviewReason);
    return { status: 'review_required', review_reason: reviewReason };
  }

  const integration = await getIntegration(organizationId);
  const bundle = await loadEstimateBundle(organizationId, run.estimate_id, 'none');
  if (bundle.job.id !== run.job_id) throwHttp('The synchronization run no longer matches its RoomFlow job.', 'SYNC_RUN_MISMATCH', 409);
  if (!['created', 'matched'].includes(result.customer?.action) || !['created', 'matched'].includes(result.property?.action) || !['created', 'updated'].includes(result.estimate?.action)) {
    return markRunFailed(run, 'BRIDGE_RESULT_INCOMPLETE', 'The browser bridge returned an invalid customer, property, or estimate action.');
  }
  const estimateUrl = safeResultUrl(result.estimate?.url, integration.browser_destination_url);
  try {
    await upsertMapping(run, 'customer', bundle.customer.id, result.customer?.id, 'active', safeResultUrl(result.customer?.url, integration.browser_destination_url), userId);
    await upsertMapping(run, 'property', bundle.job.id, result.property?.id, 'active', safeResultUrl(result.property?.url, integration.browser_destination_url), userId);
    await upsertMapping(run, 'job', run.job_id, result.property?.id, 'active', safeResultUrl(result.property?.url, integration.browser_destination_url), userId);
    await upsertMapping(run, 'estimate', run.estimate_id, result.estimate?.id, 'DRAFT', estimateUrl, userId);
  } catch (mappingError) {
    const mappedError = mappingError as { code?: string; message?: string };
    await markRunFailed(run, mappedError?.code || 'MAPPING_SAVE_FAILED', mappedError?.message || 'External mappings could not be saved.');
    throw mappingError;
  }

  const safeCount = (value: unknown) => {
    const count = Number(value || 0);
    return Number.isSafeInteger(count) && count >= 0 ? count : 0;
  };
  const attachmentSummary = {
    completed: safeCount(result.attachments?.completed),
    skipped: safeCount(result.attachments?.skipped),
    failed: safeCount(result.attachments?.failed)
  };
  const now = new Date().toISOString();
  const summary = {
    customer: cleanText(result.customer?.action || 'matched', 40),
    property: cleanText(result.property?.action || 'matched', 40),
    estimate: cleanText(result.estimate?.action || 'created', 40),
    confirmedDraft: true
  };
  await addEvent(run, 'finding_customer', 'RoomFlow searched Townsquare for the customer.');
  await addEvent(run, result.customer?.action === 'created' ? 'customer_created' : 'customer_matched', `Townsquare customer ${result.customer?.action === 'created' ? 'created' : 'matched'}.`);
  await addEvent(run, 'finding_property', 'RoomFlow searched Townsquare for the service property.');
  await addEvent(run, result.property?.action === 'created' ? 'property_created' : 'property_matched', `Townsquare property ${result.property?.action === 'created' ? 'created' : 'matched'}.`);
  await addEvent(run, result.estimate?.action === 'updated' ? 'updating_estimate' : 'creating_estimate', `Townsquare draft ${result.estimate?.action === 'updated' ? 'updated' : 'created'}.`);
  if (attachmentSummary.completed || attachmentSummary.failed || attachmentSummary.skipped) {
    await addEvent(run, 'attaching_documents', 'Optional attachment processing finished.', attachmentSummary);
  }
  await addEvent(run, 'draft_created', 'Townsquare confirmed that the estimate exists as a draft.', { providerEstimateId: cleanText(result.estimate.id, 300) });
  const { error: completionError } = await service.from('external_sync_runs').update({
    status: 'completed', provider_total_minor: providerTotalMinor,
    provider_estimate_id: cleanText(result.estimate.id, 300), provider_estimate_url: estimateUrl || null,
    result_summary: summary, attachment_summary: attachmentSummary,
    bridge_token_hash: null, bridge_expires_at: null, completed_at: now
  }).eq('id', run.id);
  if (completionError) throwHttp('The completed Townsquare run could not be recorded.', 'SYNC_RUN_UPDATE_FAILED', 500);
  const { error: successIntegrationError } = await service.from('external_integrations').update({ last_successful_sync_at: now, last_error_code: null }).eq('id', run.integration_id);
  if (successIntegrationError) throwHttp('The Townsquare success status could not be recorded.', 'INTEGRATION_STATUS_UPDATE_FAILED', 500);
  await addEvent(run, 'completed', 'Townsquare draft synchronization completed. Final customer delivery remains manual.');
  return { status: 'completed', completed_at: now, draft: { id: cleanText(result.estimate.id, 300), url: estimateUrl, total_minor: providerTotalMinor }, summary, attachment_summary: attachmentSummary };
}

async function diagnostics(organizationId: string) {
  const { data: runs, error } = await service.from('external_sync_runs')
    .select('id,status,adapter_mode,estimate_id,job_id,error_code,error_message,review_reason,created_at,completed_at')
    .eq('organization_id', organizationId).eq('provider', 'townsquare').order('created_at', { ascending: false }).limit(25);
  if (error) throwHttp('Townsquare diagnostics could not be loaded.', 'DIAGNOSTICS_READ_FAILED', 500);
  const ids = (runs || []).map(run => run.id);
  let events: Record<string, any>[] = [];
  if (ids.length) {
    const result = await service.from('external_sync_events').select('sync_run_id,status,message,provider_code,metadata,created_at')
      .in('sync_run_id', ids).order('created_at', { ascending: false }).limit(100);
    if (result.error) throwHttp('Townsquare event history could not be loaded.', 'DIAGNOSTICS_READ_FAILED', 500);
    events = result.data || [];
  }
  return { runs: runs || [], events };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json(req, 400, { ok: false, error: { code: 'INVALID_JSON', message: 'A valid JSON body is required.' } }); }
  const validation = validateActionRequest(body);
  if (!validation.valid) return json(req, 422, { ok: false, error: { code: 'INVALID_REQUEST', message: validation.error } });

  try {
    const organizationId = String(validation.organizationId || '');
    const action = String(validation.action || '');
    const auth = await authorizationContext(req, organizationId, action);
    if (action === 'get_configuration') {
      return json(req, 200, { ok: true, configuration: publicConfiguration(await getIntegration(organizationId, false)), documentation: officialApiDocumentation });
    }
    if (action === 'save_configuration') {
      return json(req, 200, { ok: true, configuration: await saveConfiguration(organizationId, auth.userId, body) });
    }
    if (action === 'clear_api_token') {
      return json(req, 200, { ok: true, configuration: await clearToken(organizationId, auth.userId) });
    }
    if (action === 'test_connection') {
      const integration = await getIntegration(organizationId);
      const provider = await providerFor(integration);
      const result = await provider.testConnection();
      return json(req, 200, { ok: true, connection: result, limitation: 'The official OpenAPI specifications do not publish a service-property resource; Auto mode uses Browser Bridge for the complete workflow.' });
    }
    if (action === 'get_diagnostics') return json(req, 200, { ok: true, diagnostics: await diagnostics(organizationId) });
    if (action === 'get_estimate_sync') return json(req, 200, { ok: true, sync: await getEstimateSync(organizationId, body.estimate_id) });
    if (action === 'complete_bridge_sync') return json(req, 200, { ok: true, result: await completeBridge(organizationId, auth.userId, body) });
    if (action === 'cancel_bridge_sync') {
      body.result = { status: 'cancelled' };
      return json(req, 200, { ok: true, result: await completeBridge(organizationId, auth.userId, body) });
    }

    const integration = await getIntegration(organizationId);
    if (!integration.enabled) throwHttp('Enable the Townsquare integration before syncing.', 'INTEGRATION_DISABLED', 409);
    const attachmentMode = ['selected', 'all_estimate'].includes(integration.attachment_mode)
      ? integration.attachment_mode as 'selected' | 'all_estimate'
      : 'none';
    const bundle = await loadEstimateBundle(organizationId, body.estimate_id, attachmentMode);
    if (action === 'queue_bridge_sync') {
      return json(req, 200, { ok: true, result: await prepareBridge(integration, bundle, auth.userId, true) });
    }
    if (action === 'prepare_bridge_sync') {
      return json(req, 200, { ok: true, result: await prepareBridge(integration, bundle, auth.userId, false) });
    }
    if (action === 'sync_estimate') {
      const decision = chooseAdapter(integration.connection_mode, {
        apiConfigured: Boolean(integration.api_token_ciphertext),
        propertyApiSupported: Boolean(integration.provider_capabilities?.serviceProperties),
        bridgeAvailable: true
      });
      if (decision.adapter === 'browser_bridge') {
        return json(req, 200, { ok: true, result: await prepareBridge(integration, bundle, auth.userId, false) });
      }
      if (decision.error === 'PROPERTY_API_UNAVAILABLE') {
        throwHttp('The verified official inTandem API does not publish a service-property endpoint. Select Auto or Browser Bridge mode.', 'PROPERTY_API_UNAVAILABLE', 422);
      }
      if (decision.error === 'API_NOT_CONFIGURED') throwHttp('Save a Townsquare API token first.', 'API_NOT_CONFIGURED', 409);
      throwHttp('The desktop browser bridge is required for the complete Townsquare workflow.', decision.error || 'BRIDGE_REQUIRED', 409);
    }
    throwHttp('Unsupported integration action.', 'UNSUPPORTED_ACTION', 422);
  } catch (error) {
    const safe = sanitizeProviderError(error);
    const requestError = error as { status?: number; code?: string; details?: unknown };
    return json(req, Number(requestError?.status) || safe.status, { ok: false, error: { code: requestError?.code || safe.code, message: safe.message, details: requestError?.details || undefined } });
  }
});
