import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadStationConfig, publicHealth, safeError } from '../sync-station/server-core.mjs';
import { STATION_WORKER_ACTIONS, validateActionRequest } from '../supabase/functions/townsquare-sync/shared/townsquare-core.mjs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const ids = {
  org: '11111111-1111-4111-8111-111111111111',
  station: '55555555-5555-4555-8555-555555555555'
};

test('station configuration requires an HTTPS endpoint, UUID, and one-time token', () => {
  const config = loadStationConfig({
    ROOMFLOW_FUNCTION_URL: 'https://example.supabase.co/functions/v1/townsquare-sync',
    ROOMFLOW_STATION_ID: ids.station,
    ROOMFLOW_STATION_TOKEN: `rfs_${'a'.repeat(43)}`,
    STATION_POLL_INTERVAL_MS: '100'
  });
  assert.equal(config.stationId, ids.station);
  assert.equal(config.pollIntervalMs, 2000);
  assert.throws(() => loadStationConfig({
    ROOMFLOW_FUNCTION_URL: 'http://public.example/functions/v1/townsquare-sync',
    ROOMFLOW_STATION_ID: ids.station,
    ROOMFLOW_STATION_TOKEN: `rfs_${'a'.repeat(43)}`
  }), /HTTPS/);
});

test('station health and errors never expose payloads or credentials', () => {
  const health = publicHealth({
    version: '1.0.0', edgeConnected: true,
    browser: { ready: true, extensionInstalled: true, extensionConfigured: true, phase: 'idle' },
    currentWork: { envelope: { runId: ids.station, payload: { customer: 'private' }, bridgeToken: 'secret' } },
    lastError: null
  });
  assert.equal(health.currentRunId, ids.station);
  assert.equal(JSON.stringify(health).includes('private'), false);
  assert.equal(JSON.stringify(health).includes('secret'), false);
  const safe = safeError(new Error('token=abc123 Authorization: bearer-secret'));
  assert.doesNotMatch(safe.message, /abc123|bearer-secret/);
});

test('worker actions are isolated from normal user request validation', () => {
  assert.equal(STATION_WORKER_ACTIONS.has('station_claim'), true);
  assert.equal(validateActionRequest({ action: 'station_claim', organization_id: ids.org }).valid, false);
  assert.equal(validateActionRequest({ action: 'get_sync_station_status', organization_id: ids.org }).valid, true);
});

test('migration stores only token hashes and claims queued work atomically', async () => {
  const migration = await read('supabase/migrations/20260803010000_townsquare_sync_station.sql');
  assert.match(migration, /token_hash text NOT NULL/);
  assert.doesNotMatch(migration, /station_token text|plaintext_token/i);
  assert.match(migration, /FOR UPDATE OF run SKIP LOCKED/);
  assert.match(migration, /REVOKE ALL ON public\.external_sync_stations FROM anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.roomflow_claim_townsquare_sync[^\n]+ TO service_role/);
});

test('edge function uses hashed station authentication and lease-bound completion', async () => {
  const edge = await read('supabase/functions/townsquare-sync/index.ts');
  assert.match(edge, /x-roomflow-station-token/);
  assert.match(edge, /await sha256\(stationToken\) !== station\.token_hash/);
  assert.match(edge, /expectedStationId/);
  assert.match(edge, /QUEUED_ESTIMATE_CHANGED/);
  assert.match(edge, /STATION_LEASE_EXPIRED/);
  assert.doesNotMatch(edge, /console\.(log|error).*stationToken/i);
});

test('station runtime is loopback-only and keeps its credential out of public health', async () => {
  const server = await read('sync-station/server.mjs');
  assert.match(server, /server\.listen\(config\.port, '127\.0\.0\.1'/);
  assert.match(server, /x-roomflow-station-token': config\.stationToken/);
  assert.doesNotMatch(server, /sendJson\([^\n]+stationToken/);
  assert.doesNotMatch(server, /log\([^\n]+stationToken/);
  assert.match(server, /CLAIM_DELIVERY|delivered/);
});

test('Pterodactyl egg and image run the extension with persistent Chromium and protected noVNC', async () => {
  const egg = JSON.parse(await read('sync-station/pterodactyl/egg-roomflow-sync-station.json'));
  assert.equal(egg.meta.version, 'PTDL_v2');
  assert.equal(egg.docker_images['RoomFlow Sync Station'], 'ghcr.io/theninjallo/roomflow-sync-station:latest');
  const token = egg.variables.find(variable => variable.env_variable === 'ROOMFLOW_STATION_TOKEN');
  assert.equal(token.user_viewable, false);
  assert.equal(token.user_editable, false);
  const start = await read('sync-station/pterodactyl/start.sh');
  assert.match(start, /--load-extension=\/home\/container\/townsquare-bridge-extension/);
  assert.match(start, /--user-data-dir=\/home\/container\/data\/chromium/);
  assert.match(start, /x11vnc -storepasswd/);
  assert.match(start, /htpasswd -i -c -B/);
  assert.match(start, /ROOMFLOW_SYNC_STATION_READY/);
  const nginx = await read('sync-station/pterodactyl/nginx.conf.template');
  assert.match(nginx, /auth_basic_user_file \/home\/container\/data\/novnc\.htpasswd/);
});

test('Windows installer protects the token and schedules an interactive extension browser', async () => {
  const install = await read('sync-station/windows/install-sync-station.ps1');
  assert.match(install, /Read-Host[^\n]+-AsSecureString/);
  assert.match(install, /ConvertFrom-SecureString/);
  assert.match(install, /-LogonType Interactive -RunLevel Limited/);
  assert.match(install, /New-ScheduledTaskSettingsSet[\s\S]+-RestartCount/);
  const taskArguments = install.match(/\$taskArguments\s*=\s*([^\n]+)/)?.[1] || '';
  assert.doesNotMatch(taskArguments, /ROOMFLOW_STATION_TOKEN|station-token/i);

  const launcher = await read('sync-station/windows/start-sync-station.ps1');
  assert.match(launcher, /ConvertTo-SecureString/);
  assert.match(launcher, /ZeroFreeBSTR/);
  assert.match(launcher, /Remove-Item Env:ROOMFLOW_STATION_TOKEN/);
  assert.match(launcher, /--load-extension=/);
  assert.match(launcher, /--user-data-dir=/);
  assert.doesNotMatch(launcher, /--disable-extensions-except/);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:8787\/station/);

  const health = await read('sync-station/windows/check-sync-station.ps1');
  assert.match(health, /http:\/\/127\.0\.0\.1:8787\/health/);
  assert.doesNotMatch(health, /stationToken|ROOMFLOW_STATION_TOKEN/);
});

test('RoomFlow dispatches to paired stations while preserving an explicit user action', async () => {
  const frontend = await read('townsquare-integration.js');
  const edge = await read('supabase/functions/townsquare-sync/index.ts');
  const queuedRenderer = frontend.slice(frontend.lastIndexOf('showQueued(result)'), frontend.lastIndexOf('showSuccess(result)'));
  assert.match(frontend, /prefer_station: true/);
  assert.match(frontend, /result\.queue_target === 'station'/);
  assert.match(frontend, /await this\.loadStationStatus\(\)/);
  assert.match(frontend, /\['queued', 'Queue for Sync Station'\]/);
  assert.match(frontend, /monitorQueuedSync\(estimate\.id, result\.run\.id\)/);
  assert.match(frontend, /activeSyncForEstimate\(existingEstimateId\)/);
  assert.match(frontend, /\['validating', 'queued', 'opening_townsquare'\]\.includes\(run\.status\)/);
  assert.ok(frontend.indexOf('const activeRun = await this.activeSyncForEstimate') < frontend.indexOf('const estimate = await this.integration.saveDraftEstimate'), 'an active run must be resumed before the estimate is saved again');
  assert.match(frontend, /No duplicate draft was queued/);
  assert.match(frontend, /run\.status === 'opening_townsquare'/);
  assert.match(frontend, /run\.status === 'completed'/);
  assert.doesNotMatch(frontend, /if \(result\.queued\)[\s\S]{0,500}updateProgress\('completed'/);
  assert.match(frontend, /Create Pairing Key/);
  assert.match(frontend, /station_token/);
  assert.match(frontend, /Create.*via Sync Station/);
  assert.doesNotMatch(frontend, /localStorage[^\n]+station_token/i);
  assert.doesNotMatch(queuedRenderer, /stationStatus\.configured/);
  assert.match(edge, /queue_target: queueTarget/);
  assert.match(edge, /await syncStationStatus\(organizationId\)/);
  assert.match(edge, /queueTarget === 'station'/);
  assert.match(edge, /select\('id,status,adapter_mode,station_id,/);
});
