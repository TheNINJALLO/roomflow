(function () {
  'use strict';
  if (globalThis.__roomflowTownsquareContentInstalled) return;
  globalThis.__roomflowTownsquareContentInstalled = true;
  const Core = globalThis.RoomFlowBridgeCore;
  const Page = globalThis.RoomFlowTownsquarePageAdapter;
  if (!Core || !Page) return;

  async function progress(status, message) {
    await chrome.runtime.sendMessage({ type: 'SYNC_PROGRESS_FROM_TOWNSQUARE', detail: { status, message } }).catch(() => {});
  }

  async function runPendingOperation() {
    const response = await chrome.runtime.sendMessage({ type: 'GET_PENDING_OPERATION' }).catch(error => ({ ok: false, code: error.message }));
    if (!response?.ok) return;
    const operation = response.operation;
    if (new URL(location.href).origin !== operation.destinationOrigin) return;
    const config = await chrome.storage.local.get({ selectorMappings: {}, workflowSettings: {} });
    const adapter = new Page.TownsquarePageAdapter(document, config.selectorMappings, config.workflowSettings);
    let lastStage = 'opening_townsquare';
    try {
      const result = await adapter.run(operation, (status, message) => {
        lastStage = Core.cleanText(status, 80) || lastStage;
        return progress(status, message);
      });
      await chrome.runtime.sendMessage({ type: 'SYNC_RESULT_FROM_TOWNSQUARE', result });
    } catch (error) {
      const result = {
        status: error.code === 'USER_CANCELLED' ? 'cancelled' : 'failed',
        code: error.code || 'TOWNSQUARE_AUTOMATION_FAILED',
        message: Core.cleanText(error.message || 'Townsquare automation failed.', 500),
        stage: lastStage,
        confirmedDraft: false,
        providerTotalMinor: Number.isSafeInteger(error.providerTotalMinor) ? error.providerTotalMinor : undefined
      };
      await chrome.runtime.sendMessage({ type: 'SYNC_RESULT_FROM_TOWNSQUARE', result });
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'START_GUIDED_MAPPING') {
      new Page.GuidedMapper(document).start(Boolean(message.reset)).then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(runPendingOperation, 500), { once: true });
  else setTimeout(runPendingOperation, 500);
})();
