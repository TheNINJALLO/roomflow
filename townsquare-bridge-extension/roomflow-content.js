(function () {
  'use strict';
  const Core = globalThis.RoomFlowBridgeCore;
  if (!Core || !Core.isAllowedRoomFlowUrl(location.href)) return;

  function sendStatus(detail = {}) {
    window.postMessage({
      type: Core.STATUS_TYPE,
      protocolVersion: Core.PROTOCOL_VERSION,
      installed: true,
      ...detail
    }, location.origin);
  }

  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.type === 'ROOMFLOW_TOWNSQUARE_BRIDGE_PING') {
      const response = await chrome.runtime.sendMessage({ type: 'BRIDGE_STATUS' }).catch(() => null);
      sendStatus({ connected: Boolean(response?.connected), configured: Boolean(response?.configured), destinationOrigin: response?.destinationOrigin || '', pendingRunId: response?.pendingRunId || '' });
      return;
    }
    if (event.data?.type === 'ROOMFLOW_TOWNSQUARE_START_MAPPING') {
      const response = await chrome.runtime.sendMessage({ type: 'START_MAPPING_FROM_ROOMFLOW', reset: Boolean(event.data.reset) }).catch(error => ({ ok: false, error: error.message }));
      window.postMessage({
        type: 'ROOMFLOW_TOWNSQUARE_MAPPING_STATUS',
        protocolVersion: Core.PROTOCOL_VERSION,
        ok: Boolean(response?.ok),
        message: response?.error || (response?.ok ? 'Guided mapping opened in Townsquare.' : 'Mapping could not start.')
      }, location.origin);
      return;
    }
    if (event.data?.type !== Core.REQUEST_TYPE) return;
    const validation = Core.validatePageRequest(event, location.href);
    if (!validation.valid) {
      window.postMessage({ type: Core.RESULT_TYPE, protocolVersion: Core.PROTOCOL_VERSION, runId: event.data?.runId || '', result: { status: 'failed', code: validation.error, message: (validation.details || [validation.error]).join(' ') } }, location.origin);
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: 'START_SYNC', request: event.data }).catch(error => ({ ok: false, error: error.message }));
    if (!response?.ok) {
      window.postMessage({ type: Core.RESULT_TYPE, protocolVersion: Core.PROTOCOL_VERSION, runId: event.data.runId, bridgeToken: event.data.bridgeToken, result: { status: 'failed', code: response?.code || 'EXTENSION_START_FAILED', message: response?.error || 'The Townsquare bridge could not start.' } }, location.origin);
    }
  });

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'SYNC_PROGRESS') {
      window.postMessage({ type: 'ROOMFLOW_TOWNSQUARE_SYNC_PROGRESS', protocolVersion: Core.PROTOCOL_VERSION, ...message.detail }, location.origin);
    }
    if (message?.type === 'SYNC_RESULT') {
      window.postMessage({ type: Core.RESULT_TYPE, protocolVersion: Core.PROTOCOL_VERSION, ...message.detail }, location.origin);
    }
  });

  sendStatus({ connected: true });
})();
