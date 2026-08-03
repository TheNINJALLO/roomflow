const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function integer(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function cleanText(value, maxLength = 500) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

export function loadStationConfig(environment = process.env) {
  const functionUrl = cleanText(environment.ROOMFLOW_FUNCTION_URL, 2000);
  const stationId = cleanText(environment.ROOMFLOW_STATION_ID, 80);
  const stationToken = cleanText(environment.ROOMFLOW_STATION_TOKEN, 500);
  if (!functionUrl) throw new Error('ROOMFLOW_FUNCTION_URL is required.');
  let parsedUrl;
  try { parsedUrl = new URL(functionUrl); } catch { throw new Error('ROOMFLOW_FUNCTION_URL must be a valid URL.'); }
  const localEndpoint = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !(localEndpoint && parsedUrl.protocol === 'http:')) {
    throw new Error('ROOMFLOW_FUNCTION_URL must use HTTPS.');
  }
  if (!UUID_PATTERN.test(stationId)) throw new Error('ROOMFLOW_STATION_ID must be a valid UUID.');
  if (!stationToken.startsWith('rfs_') || stationToken.length < 40) throw new Error('ROOMFLOW_STATION_TOKEN is invalid.');
  return Object.freeze({
    functionUrl: parsedUrl.toString(),
    stationId,
    stationToken,
    port: integer(environment.STATION_PORT, 8787, 1024, 65535),
    pollIntervalMs: integer(environment.STATION_POLL_INTERVAL_MS, 5000, 2000, 60000),
    requestTimeoutMs: integer(environment.STATION_REQUEST_TIMEOUT_MS, 15000, 5000, 60000),
    version: cleanText(environment.ROOMFLOW_STATION_VERSION || '1.0.0', 40)
  });
}

export function safeError(error) {
  const code = cleanText(error?.code || 'STATION_ERROR', 100).replace(/[^A-Z0-9_-]/gi, '_').toUpperCase();
  const message = cleanText(error?.message || 'The Sync Station request failed.', 300)
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/(token|authorization|cookie|password)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[REDACTED]');
  return { code, message, at: new Date().toISOString() };
}

export function publicHealth(state) {
  return {
    ok: Boolean(state.edgeConnected && state.browser.extensionInstalled && state.browser.extensionConfigured),
    status: state.currentWork ? 'busy' : (state.edgeConnected ? 'idle' : 'connecting'),
    version: state.version,
    edgeConnected: Boolean(state.edgeConnected),
    browser: {
      ready: Boolean(state.browser.ready),
      extensionInstalled: Boolean(state.browser.extensionInstalled),
      extensionConfigured: Boolean(state.browser.extensionConfigured),
      phase: cleanText(state.browser.phase, 60)
    },
    currentRunId: state.currentWork?.envelope?.runId || null,
    lastHeartbeatAt: state.lastHeartbeatAt || null,
    lastClaimAt: state.lastClaimAt || null,
    lastCompleteAt: state.lastCompleteAt || null,
    lastError: state.lastError || null
  };
}

export function validRunId(value) {
  return UUID_PATTERN.test(cleanText(value, 80));
}
