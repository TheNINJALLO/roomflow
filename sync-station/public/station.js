(function () {
  'use strict';

  const ui = {
    overall: document.getElementById('overall-state'),
    edge: document.getElementById('edge-state'),
    extension: document.getElementById('extension-state'),
    work: document.getElementById('work-state'),
    completed: document.getElementById('completed-state'),
    phase: document.getElementById('phase'),
    detail: document.getElementById('detail'),
    meter: document.getElementById('meter'),
    error: document.getElementById('error-card'),
    errorDetail: document.getElementById('error-detail')
  };
  const extension = { installed: false, configured: false, pendingRunId: null };
  let currentWork = null;
  let claiming = false;
  let submitting = false;
  let pollIntervalMs = 5000;
  let lastHeartbeatSentAt = 0;
  let heartbeatInFlight = null;

  async function request(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers: options.body ? { 'content-type': 'application/json' } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw Object.assign(new Error(data?.error?.message || `Station returned HTTP ${response.status}.`), { code: data?.error?.code });
    return data;
  }

  function setError(error) {
    ui.error.hidden = !error;
    ui.errorDetail.textContent = error ? `${error.code || 'STATION_ERROR'} · ${error.message || error}` : '';
  }

  function render(health = {}) {
    ui.edge.textContent = health.edgeConnected ? 'Connected' : 'Connecting';
    ui.extension.textContent = extension.installed ? (extension.configured ? 'Ready' : 'Needs destination') : 'Not detected';
    ui.work.textContent = currentWork ? `Run ${currentWork.runId.slice(0, 8)}` : 'Idle';
    ui.completed.textContent = health.lastCompleteAt ? new Date(health.lastCompleteAt).toLocaleString() : 'Never';
    const ready = health.edgeConnected && extension.installed && extension.configured;
    ui.overall.textContent = currentWork ? 'Processing' : (ready ? 'Online' : 'Attention');
    ui.overall.dataset.state = currentWork ? 'busy' : (ready ? 'online' : 'attention');
    if (!currentWork && ready) {
      ui.phase.textContent = 'Waiting for queued drafts';
      ui.detail.textContent = 'The station is authenticated and will claim the next queued RoomFlow draft automatically.';
      ui.meter.style.width = '14%';
    }
    setError(health.lastError);
  }

  async function refreshStatus() {
    try {
      const data = await request('/api/status');
      pollIntervalMs = data.pollIntervalMs || pollIntervalMs;
      render(data.health);
    } catch (error) { setError(error); }
  }

  function pingExtension() {
    window.postMessage({ type: 'ROOMFLOW_TOWNSQUARE_BRIDGE_PING', protocolVersion: 1 }, location.origin);
  }

  async function heartbeat(force = false) {
    if (!force && Date.now() - lastHeartbeatSentAt < 25000) return;
    if (heartbeatInFlight) return heartbeatInFlight;
    lastHeartbeatSentAt = Date.now();
    heartbeatInFlight = (async () => {
      try {
        await request('/api/heartbeat', {
        method: 'POST',
        body: {
          browser_ready: document.visibilityState !== 'prerender',
          extension_installed: extension.installed,
          extension_configured: extension.configured,
          pending_run_id: extension.pendingRunId,
          phase: currentWork ? 'processing' : 'idle'
        }
      });
      } catch (error) { setError(error); }
    })().finally(() => { heartbeatInFlight = null; });
    return heartbeatInFlight;
  }

  async function claimNext() {
    if (claiming || submitting || currentWork || !extension.installed || !extension.configured) return;
    claiming = true;
    try {
      const data = await request('/api/claim', { method: 'POST' });
      const claimed = data.result;
      if (!claimed?.work) return;
      currentWork = claimed.work;
      if (!claimed.fresh) {
        ui.phase.textContent = extension.pendingRunId === currentWork.runId ? 'Resuming claimed draft' : 'Claimed draft needs review';
        ui.detail.textContent = extension.pendingRunId === currentWork.runId
          ? 'The extension still owns this operation; waiting for its result.'
          : 'The browser page restarted after delivery. RoomFlow will not replay the operation automatically because that could duplicate a draft.';
        if (extension.pendingRunId !== currentWork.runId) setError({ code: 'CLAIM_DELIVERY_UNCERTAIN', message: 'Review Townsquare before retrying this run.' });
        return;
      }
      ui.phase.textContent = 'Opening Townsquare';
      ui.detail.textContent = 'A queued draft was claimed. The extension is opening the authenticated Townsquare session.';
      ui.meter.style.width = '28%';
      window.postMessage(currentWork, location.origin);
    } catch (error) {
      if (error.code !== 'BROWSER_NOT_READY') setError(error);
    } finally { claiming = false; }
  }

  async function submitResult(message) {
    if (submitting || !currentWork || message.runId !== currentWork.runId) return;
    submitting = true;
    try {
      const data = await request('/api/result', { method: 'POST', body: { run_id: message.runId, result: message.result } });
      const status = data.result?.status || 'unknown';
      ui.phase.textContent = status === 'completed' ? 'Draft confirmed' : 'Draft requires attention';
      ui.detail.textContent = status === 'completed'
        ? 'Townsquare confirmed the saved draft. Final customer delivery remains manual.'
        : `RoomFlow recorded ${status.replaceAll('_', ' ')} and stopped safely.`;
      ui.meter.style.width = status === 'completed' ? '100%' : '70%';
      currentWork = null;
      setError(status === 'completed' ? null : { code: message.result?.code || status, message: message.result?.message || 'Review the failed synchronization.' });
      await refreshStatus();
    } catch (error) { setError(error); }
    finally { submitting = false; }
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || !event.data) return;
    if (event.data.type === 'ROOMFLOW_TOWNSQUARE_BRIDGE_STATUS' && event.data.protocolVersion === 1) {
      extension.installed = Boolean(event.data.installed || event.data.connected);
      extension.configured = Boolean(event.data.configured);
      extension.pendingRunId = event.data.pendingRunId || null;
      heartbeat().then(refreshStatus);
      return;
    }
    if (event.data.type === 'ROOMFLOW_TOWNSQUARE_SYNC_PROGRESS' && event.data.protocolVersion === 1 && event.data.runId === currentWork?.runId) {
      ui.phase.textContent = String(event.data.status || 'processing').replaceAll('_', ' ');
      ui.detail.textContent = event.data.message || 'The Sync Station is processing the Townsquare draft.';
      const stages = ['opening_townsquare', 'finding_customer', 'customer_matched', 'customer_created', 'finding_property', 'property_matched', 'property_created', 'creating_estimate', 'updating_estimate', 'attaching_documents', 'draft_created'];
      ui.meter.style.width = `${Math.max(28, Math.round(((stages.indexOf(event.data.status) + 1) / stages.length) * 90))}%`;
      return;
    }
    if (event.data.type === 'ROOMFLOW_TOWNSQUARE_SYNC_RESULT' && event.data.protocolVersion === 1) submitResult(event.data);
  });

  async function loop() {
    pingExtension();
    await refreshStatus();
    await claimNext();
    if (currentWork && Date.parse(currentWork.expiresAt) <= Date.now()) {
      await request('/api/expired', { method: 'POST', body: { run_id: currentWork.runId } }).catch(setError);
      currentWork = null;
    }
    setTimeout(loop, pollIntervalMs);
  }

  pingExtension();
  heartbeat(true).catch(() => {});
  loop();
  setInterval(() => heartbeat(true), 30000);
})();
