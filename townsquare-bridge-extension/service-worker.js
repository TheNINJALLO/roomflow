importScripts('bridge-core.js');

const Core = globalThis.RoomFlowBridgeCore;
const OPERATION_KEY = 'roomflow_townsquare_pending_operation';
const LOG_KEY = 'roomflow_townsquare_diagnostics';

async function configuration() {
  const data = await chrome.storage.local.get({ destinationUrl: '', selectorMappings: {}, workflowSettings: {} });
  return data;
}

async function log(level, code, detail = {}) {
  const stored = await chrome.storage.session.get({ [LOG_KEY]: [] });
  const rows = Array.isArray(stored[LOG_KEY]) ? stored[LOG_KEY] : [];
  rows.push({ at: new Date().toISOString(), level, code, detail: Core.redact(detail) });
  await chrome.storage.session.set({ [LOG_KEY]: rows.slice(-100) });
}

async function clearOperation(reason = 'cleared') {
  await chrome.storage.session.remove(OPERATION_KEY);
  await log('info', 'OPERATION_CLEARED', { reason });
}

async function injectTownsquareScripts(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['bridge-core.js', 'townsquare-adapter.js', 'townsquare-content.js'] });
}

async function waitForDestinationTab(tabId, expectedOrigin, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    let origin = '';
    try { origin = new URL(tab?.url || '').origin; } catch { /* keep waiting through navigation */ }
    if (tab?.status === 'complete' && origin === expectedOrigin) return tab;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Object.assign(new Error('The configured Townsquare page did not finish loading. Confirm the URL and try again.'), { code: 'TOWNSQUARE_LOAD_TIMEOUT' });
}

async function startSync(message, sender) {
  if (!sender.tab?.id || !Core.isAllowedRoomFlowUrl(sender.tab.url || '')) return { ok: false, code: 'UNTRUSTED_ROOMFLOW_TAB', error: 'The request did not come from an allowed RoomFlow page.' };
  const request = message.request || {};
  const payloadValidation = Core.validatePayload(request.payload);
  if (!payloadValidation.valid || request.protocolVersion !== Core.PROTOCOL_VERSION || request.type !== Core.REQUEST_TYPE) {
    return { ok: false, code: 'INVALID_PAYLOAD', error: payloadValidation.errors?.join(' ') || 'Invalid bridge request.' };
  }
  const config = await configuration();
  const destinationUrl = request.destinationUrl || config.destinationUrl;
  let destination;
  try { destination = new URL(destinationUrl); } catch { return { ok: false, code: 'DESTINATION_NOT_CONFIGURED', error: 'Configure the Townsquare destination URL in the extension.' }; }
  if (destination.protocol !== 'https:' || destination.username || destination.password) return { ok: false, code: 'INVALID_DESTINATION', error: 'The Townsquare destination must be an HTTPS URL without embedded credentials.' };
  const permission = { origins: [`${destination.origin}/*`] };
  if (!await chrome.permissions.contains(permission)) return { ok: false, code: 'HOST_PERMISSION_REQUIRED', error: 'Open the extension popup and grant access to the configured Townsquare site.' };

  const operation = {
    runId: request.runId,
    bridgeToken: request.bridgeToken,
    payload: request.payload,
    destinationUrl: destination.toString(),
    destinationOrigin: destination.origin,
    sourceTabId: sender.tab.id,
    createdAt: new Date().toISOString(),
    expiresAt: request.expiresAt
  };
  const validation = Core.validateStoredOperation(operation);
  if (!validation.valid) return { ok: false, code: validation.error, error: 'The bridge operation is invalid or expired.' };
  await chrome.storage.session.set({ [OPERATION_KEY]: operation });
  await log('info', 'SYNC_ACCEPTED', { runId: operation.runId, destinationOrigin: operation.destinationOrigin });

  const tabs = await chrome.tabs.query({ url: `${destination.origin}/*` });
  let tab = tabs.find(item => item.id) || null;
  if (tab?.id) {
    await chrome.tabs.update(tab.id, { active: true, url: destination.toString() });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    tab = await chrome.tabs.create({ url: destination.toString(), active: true });
  }
  if (!tab?.id) return { ok: false, code: 'TOWNSQUARE_TAB_FAILED', error: 'The Townsquare tab could not be opened.' };
  operation.destinationTabId = tab.id;
  await chrome.storage.session.set({ [OPERATION_KEY]: operation });
  setTimeout(() => injectTownsquareScripts(tab.id).catch(error => log('error', 'SCRIPT_INJECTION_FAILED', { message: error.message })), 1200);
  return { ok: true, tabId: tab.id };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'BRIDGE_STATUS') {
      const config = await configuration();
      let destinationOrigin = '';
      try { destinationOrigin = config.destinationUrl ? new URL(config.destinationUrl).origin : ''; } catch { /* invalid saved URL */ }
      sendResponse({ connected: true, configured: Boolean(destinationOrigin), destinationOrigin });
      return;
    }
    if (message?.type === 'START_SYNC') {
      sendResponse(await startSync(message, sender));
      return;
    }
    if (message?.type === 'GET_PENDING_OPERATION') {
      const stored = await chrome.storage.session.get(OPERATION_KEY);
      const operation = stored[OPERATION_KEY];
      const validation = Core.validateStoredOperation(operation);
      if (!validation.valid) {
        if (operation) await clearOperation(validation.error);
        sendResponse({ ok: false, code: validation.error });
        return;
      }
      if (!sender.tab?.url || new URL(sender.tab.url).origin !== operation.destinationOrigin) {
        sendResponse({ ok: false, code: 'DESTINATION_ORIGIN_MISMATCH' });
        return;
      }
      sendResponse({ ok: true, operation });
      return;
    }
    if (message?.type === 'SYNC_PROGRESS_FROM_TOWNSQUARE') {
      const stored = await chrome.storage.session.get(OPERATION_KEY);
      const operation = stored[OPERATION_KEY];
      if (operation?.sourceTabId) await chrome.tabs.sendMessage(operation.sourceTabId, { type: 'SYNC_PROGRESS', detail: { runId: operation.runId, ...message.detail } }).catch(() => {});
      await log('info', 'SYNC_PROGRESS', message.detail || {});
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'SYNC_RESULT_FROM_TOWNSQUARE') {
      const stored = await chrome.storage.session.get(OPERATION_KEY);
      const operation = stored[OPERATION_KEY];
      if (!operation) { sendResponse({ ok: false, code: 'MISSING_OPERATION' }); return; }
      const detail = { runId: operation.runId, bridgeToken: operation.bridgeToken, result: message.result };
      if (operation.sourceTabId) await chrome.tabs.sendMessage(operation.sourceTabId, { type: 'SYNC_RESULT', detail }).catch(() => {});
      await log(message.result?.status === 'completed' ? 'info' : 'error', 'SYNC_RESULT', message.result || {});
      await clearOperation(message.result?.status || 'finished');
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'START_MAPPING_ACTIVE_TAB') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const config = await configuration();
      let destination;
      let activeOrigin;
      try {
        destination = new URL(config.destinationUrl);
        activeOrigin = new URL(tab?.url || '').origin;
      } catch { sendResponse({ ok: false, error: 'Save and open the configured Townsquare destination before mapping.' }); return; }
      if (!tab?.id || activeOrigin !== destination.origin) { sendResponse({ ok: false, error: 'Open the configured Townsquare site in the active tab before mapping.' }); return; }
      if (!await chrome.permissions.contains({ origins: [`${destination.origin}/*`] })) { sendResponse({ ok: false, error: 'Grant access to the configured Townsquare site before mapping.' }); return; }
      await injectTownsquareScripts(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'START_GUIDED_MAPPING', reset: Boolean(message.reset) });
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'START_MAPPING_FROM_ROOMFLOW') {
      if (!sender.tab?.url || !Core.isAllowedRoomFlowUrl(sender.tab.url)) { sendResponse({ ok: false, error: 'Mapping must be started from an allowed RoomFlow tab.' }); return; }
      const config = await configuration();
      let destination;
      try { destination = new URL(config.destinationUrl); } catch { sendResponse({ ok: false, error: 'Save the Townsquare destination URL in the extension first.' }); return; }
      if (!await chrome.permissions.contains({ origins: [`${destination.origin}/*`] })) { sendResponse({ ok: false, error: 'Grant access to the configured Townsquare site before mapping.' }); return; }
      const tabs = await chrome.tabs.query({ url: `${destination.origin}/*` });
      let tab = tabs.find(item => item.id) || null;
      if (!tab?.id) tab = await chrome.tabs.create({ url: destination.toString(), active: true });
      if (!tab?.id) { sendResponse({ ok: false, error: 'The Townsquare tab could not be opened.' }); return; }
      tab = await waitForDestinationTab(tab.id, destination.origin);
      await injectTownsquareScripts(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'START_GUIDED_MAPPING', reset: Boolean(message.reset) });
      await chrome.tabs.update(tab.id, { active: true });
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'GET_DIAGNOSTICS') {
      const stored = await chrome.storage.session.get({ [LOG_KEY]: [] });
      sendResponse({ ok: true, logs: stored[LOG_KEY] || [] });
      return;
    }
    sendResponse({ ok: false, code: 'UNKNOWN_MESSAGE' });
  })().catch(async error => {
    await log('error', 'SERVICE_WORKER_ERROR', { message: error.message });
    sendResponse({ ok: false, code: 'EXTENSION_ERROR', error: error.message });
  });
  return true;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const stored = await chrome.storage.session.get(OPERATION_KEY);
  const operation = stored[OPERATION_KEY];
  if (!operation || !Core.validateStoredOperation(operation).valid) return;
  let origin = '';
  try { origin = new URL(tab.url || '').origin; } catch { return; }
  if (origin !== operation.destinationOrigin || (operation.destinationTabId && operation.destinationTabId !== tabId)) return;
  await injectTownsquareScripts(tabId).catch(error => log('error', 'SCRIPT_INJECTION_FAILED', { message: error.message }));
});

chrome.alarms?.create?.('roomflow-operation-cleanup', { periodInMinutes: 5 });
chrome.alarms?.onAlarm?.addListener(async alarm => {
  if (alarm.name !== 'roomflow-operation-cleanup') return;
  const stored = await chrome.storage.session.get(OPERATION_KEY);
  if (stored[OPERATION_KEY] && !Core.validateStoredOperation(stored[OPERATION_KEY]).valid) await clearOperation('expired');
});
