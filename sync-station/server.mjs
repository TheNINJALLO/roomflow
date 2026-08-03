import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanText, loadStationConfig, publicHealth, safeError, validRunId } from './server-core.mjs';

const config = loadStationConfig();
const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(root, 'public');
const MAX_BODY_BYTES = 512 * 1024;

const state = {
  version: config.version,
  edgeConnected: false,
  browser: { ready: false, extensionInstalled: false, extensionConfigured: false, phase: 'starting' },
  currentWork: null,
  claimInFlight: null,
  completeInFlight: null,
  lastHeartbeatAt: null,
  lastClaimAt: null,
  lastCompleteAt: null,
  lastError: null
};

function log(code, detail = '') {
  const suffix = detail ? ` ${cleanText(detail, 160)}` : '';
  process.stdout.write(`[${new Date().toISOString()}] ${code}${suffix}\n`);
}

async function edge(action, body = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(config.functionUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-roomflow-station-id': config.stationId,
        'x-roomflow-station-token': config.stationToken,
        'user-agent': `RoomFlow-Sync-Station/${config.version}`
      },
      body: JSON.stringify({ action, ...body }),
      signal: controller.signal
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!response.ok || !data?.ok) {
      const error = new Error(data?.error?.message || `RoomFlow returned HTTP ${response.status}.`);
      error.code = data?.error?.code || `ROOMFLOW_HTTP_${response.status}`;
      throw error;
    }
    state.edgeConnected = true;
    state.lastError = null;
    return data;
  } catch (error) {
    state.edgeConnected = false;
    state.lastError = safeError(error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413, code: 'BODY_TOO_LARGE' });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('A valid JSON body is required.'), { status: 400, code: 'INVALID_JSON' }); }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY'
  });
  response.end(JSON.stringify(data));
}

async function sendStatic(response, filename, contentType) {
  const content = await readFile(join(publicRoot, filename));
  response.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer'
  });
  response.end(content);
}

async function heartbeat(body) {
  state.browser = {
    ready: Boolean(body.browser_ready),
    extensionInstalled: Boolean(body.extension_installed),
    extensionConfigured: Boolean(body.extension_configured),
    phase: cleanText(body.phase, 60) || 'idle',
    pendingRunId: validRunId(body.pending_run_id) ? body.pending_run_id : null
  };
  const data = await edge('station_heartbeat', {
    version: config.version,
    browser_ready: state.browser.ready,
    extension_installed: state.browser.extensionInstalled,
    extension_configured: state.browser.extensionConfigured,
    phase: state.browser.phase,
    current_run_id: state.currentWork?.envelope?.runId || null,
    last_error_code: state.lastError?.code || null
  });
  state.lastHeartbeatAt = new Date().toISOString();
  return data.station;
}

async function claim() {
  if (state.currentWork) {
    const fresh = !state.currentWork.delivered;
    state.currentWork.delivered = true;
    return { work: state.currentWork.envelope, fresh };
  }
  if (!state.browser.ready || !state.browser.extensionInstalled || !state.browser.extensionConfigured) {
    throw Object.assign(new Error('The browser extension is not ready and configured.'), { status: 409, code: 'BROWSER_NOT_READY' });
  }
  if (!state.claimInFlight) {
    state.claimInFlight = (async () => {
      const data = await edge('station_claim');
      const envelope = data.result?.work || null;
      if (!envelope) return { work: null, fresh: false };
      state.currentWork = { envelope, delivered: true };
      state.lastClaimAt = new Date().toISOString();
      log('STATION_CLAIMED', `run=${envelope.runId}`);
      return { work: envelope, fresh: true };
    })().finally(() => { state.claimInFlight = null; });
  }
  return state.claimInFlight;
}

async function complete(body) {
  if (!state.currentWork) throw Object.assign(new Error('There is no claimed Sync Station run.'), { status: 409, code: 'NO_CURRENT_RUN' });
  const runId = cleanText(body.run_id, 80);
  if (runId !== state.currentWork.envelope.runId) throw Object.assign(new Error('The result does not match the claimed run.'), { status: 409, code: 'RUN_ID_MISMATCH' });
  if (!body.result || typeof body.result !== 'object' || Array.isArray(body.result)) {
    throw Object.assign(new Error('A bridge result object is required.'), { status: 422, code: 'INVALID_RESULT' });
  }
  if (!state.completeInFlight) {
    state.completeInFlight = (async () => {
      const data = await edge('station_complete', {
        run_id: runId,
        bridge_token: state.currentWork.envelope.bridgeToken,
        result: body.result
      });
      const status = data.result?.status || 'unknown';
      state.lastCompleteAt = new Date().toISOString();
      state.currentWork = null;
      log('STATION_RESULT', `run=${runId} status=${cleanText(status, 40)}`);
      return data.result;
    })().finally(() => { state.completeInFlight = null; });
  }
  return state.completeInFlight;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, publicHealth(state));
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/station')) return sendStatic(response, 'station.html', 'text/html; charset=utf-8');
    if (request.method === 'GET' && url.pathname === '/station.js') return sendStatic(response, 'station.js', 'text/javascript; charset=utf-8');
    if (request.method === 'GET' && url.pathname === '/station.css') return sendStatic(response, 'station.css', 'text/css; charset=utf-8');
    if (request.method === 'GET' && url.pathname === '/api/status') return sendJson(response, 200, { ok: true, health: publicHealth(state), pollIntervalMs: config.pollIntervalMs });
    if (request.method === 'POST' && url.pathname === '/api/heartbeat') return sendJson(response, 200, { ok: true, station: await heartbeat(await readBody(request)) });
    if (request.method === 'POST' && url.pathname === '/api/claim') return sendJson(response, 200, { ok: true, result: await claim() });
    if (request.method === 'POST' && url.pathname === '/api/result') return sendJson(response, 200, { ok: true, result: await complete(await readBody(request)) });
    if (request.method === 'POST' && url.pathname === '/api/expired') {
      const body = await readBody(request);
      if (state.currentWork?.envelope?.runId === cleanText(body.run_id, 80) && Date.parse(state.currentWork.envelope.expiresAt) <= Date.now()) {
        state.lastError = { code: 'STATION_LEASE_EXPIRED', message: 'The claimed operation expired and requires review before retrying.', at: new Date().toISOString() };
        state.currentWork = null;
      }
      return sendJson(response, 200, { ok: true });
    }
    return sendJson(response, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  } catch (error) {
    const safe = safeError(error);
    state.lastError = safe;
    log('STATION_ERROR', safe.code);
    return sendJson(response, Number(error?.status) || 500, { ok: false, error: safe });
  }
});

server.listen(config.port, '127.0.0.1', () => {
  log('STATION_HTTP_READY', `port=${config.port} version=${config.version}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
