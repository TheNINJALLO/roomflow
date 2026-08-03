'use strict';

const destination = document.getElementById('destination');
const status = document.getElementById('status');

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = `status ${type}`.trim();
}

async function load() {
  const config = await chrome.storage.local.get({ destinationUrl: '', selectorMappings: {} });
  destination.value = config.destinationUrl;
  let permission = false;
  try { if (config.destinationUrl) permission = await chrome.permissions.contains({ origins: [`${new URL(config.destinationUrl).origin}/*`] }); } catch { /* invalid saved URL */ }
  const mapped = Object.keys(config.selectorMappings || {}).length;
  setStatus(config.destinationUrl && permission ? `Ready · ${mapped} controls mapped` : 'Save a valid Townsquare URL and grant site access.', config.destinationUrl && permission ? 'ok' : '');
}

document.getElementById('save').addEventListener('click', async () => {
  try {
    const url = new URL(destination.value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS URL without embedded credentials.');
    const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
    if (!granted) throw new Error('Site access was not granted.');
    await chrome.storage.local.set({ destinationUrl: url.toString(), destinationUpdatedAt: new Date().toISOString() });
    setStatus('Destination saved and site access granted.', 'ok');
  } catch (error) { setStatus(error.message, 'error'); }
});

async function startMapping(reset) {
  const response = await chrome.runtime.sendMessage({ type: 'START_MAPPING_ACTIVE_TAB', reset }).catch(error => ({ ok: false, error: error.message }));
  if (response?.ok) { setStatus('Guided mapping opened in the active Townsquare tab.', 'ok'); window.close(); }
  else setStatus(response?.error || 'Could not start guided mapping. Open Townsquare first.', 'error');
}

document.getElementById('map').addEventListener('click', () => startMapping(false));
document.getElementById('reset').addEventListener('click', () => startMapping(true));
document.getElementById('refresh-logs').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' });
  document.getElementById('diagnostics').textContent = JSON.stringify(response?.logs || [], null, 2);
});

load();
