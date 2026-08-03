import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('extension uses Manifest V3 with narrow permissions and no cookie access', async () => {
  const manifest = JSON.parse(await read('townsquare-bridge-extension/manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.permissions.includes('cookies'), false);
  assert.equal(manifest.permissions.includes('webRequest'), false);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.optional_host_permissions.includes('<all_urls>'), false);
  assert.ok(manifest.optional_host_permissions.every(pattern => pattern.startsWith('https://*.')));
});

test('bridge stores pending payload only in session storage and clears it', async () => {
  const worker = await read('townsquare-bridge-extension/service-worker.js');
  assert.match(worker, /chrome\.storage\.session\.set/);
  assert.match(worker, /chrome\.storage\.session\.remove\(OPERATION_KEY\)/);
  assert.match(worker, /chrome\.tabs\.onUpdated\.addListener/);
  assert.match(worker, /waitForDestinationTab/);
  assert.doesNotMatch(worker, /chrome\.storage\.local\.set\([^)]*(payload|operation)/i);
});

test('extension never reads cookies or password values', async () => {
  const files = await Promise.all([
    'bridge-core.js', 'service-worker.js', 'roomflow-content.js',
    'townsquare-adapter.js', 'townsquare-content.js', 'popup.js'
  ].map(name => read(`townsquare-bridge-extension/${name}`)));
  const source = files.join('\n');
  assert.doesNotMatch(source, /chrome\.cookies|document\.cookie|cookieStore/i);
  assert.doesNotMatch(source, /input\[type=["']password["']\]\.value/i);
  assert.match(source, /UNSAFE_ACTION_BLOCKED/);
});

test('guided mapping can use nested Townsquare controls and resume safely', async () => {
  const adapter = await read('townsquare-bridge-extension/townsquare-adapter.js');
  const content = await read('townsquare-bridge-extension/townsquare-content.js');
  assert.match(adapter, /Map \+ use next control/);
  assert.match(adapter, /if \(actionable\) Core\.assertDraftSafeElement\(target\)/);
  assert.match(adapter, /event\.stopImmediatePropagation\(\)/);
  assert.match(adapter, /addEventListener\('pointerdown', this\.capture, true\)/);
  assert.match(adapter, /if \(!allowActivation\)/);
  assert.match(adapter, /suppressFollowupActivation\(target\)/);
  assert.match(adapter, /\['pointerup', 'mouseup', 'click'\]/);
  assert.match(adapter, /accessibleDocuments\(this\.document\)/);
  assert.match(adapter, /querySelectorAll\?\.\('iframe,frame'\)/);
  assert.match(adapter, /setInterval\(installCapture, 200\)/);
  assert.match(adapter, /selectorMappingSession/);
  assert.match(adapter, /persistProgress\(\)/);
  assert.match(content, /resumeGuidedMapping/);
  assert.match(content, /mapper\.start\(false, true\)/);
});

test('browser workflow opens Quick Actions before the combined estimate property chooser', async () => {
  const adapter = await read('townsquare-bridge-extension/townsquare-adapter.js');
  assert.ok(adapter.indexOf("safeClick('quickActionsButton')") < adapter.indexOf("safeClick('createEstimateButton')"));
  assert.match(adapter, /selectOrCreateEstimateProperty/);
  assert.match(adapter, /customer: \{ id, action: 'matched'/);
  assert.match(adapter, /property: \{ id, action: 'matched'/);
  assert.match(adapter, /openOrCreateDraft\(payload\.estimate, externalMappings, progress, true\)/);
  assert.match(adapter, /await this\.activateAndFill\(search, query\)/);
  assert.ok(adapter.indexOf("'customerFirstName', 'customerLastName'") > adapter.indexOf("'propertyContactName'"));
  assert.match(adapter, /this\.locator\.queryMapped\('propertyContactName'\)/);
  assert.match(adapter, /await this\.fillEstimateHeader\(estimate\)/);
  assert.match(adapter, /await this\.openLineItemPicker\(line\)/);
  assert.match(adapter, /LINE_ITEM_CREATE_CONTROL_REQUIRED/);
});

test('RoomFlow frontend never persists or displays the API token', async () => {
  const frontend = await read('townsquare-integration.js');
  assert.doesNotMatch(frontend, /localStorage\.(setItem|getItem)[^\n]*api[_-]?token/i);
  assert.doesNotMatch(frontend, /sessionStorage\.(setItem|getItem)[^\n]*api[_-]?token/i);
  assert.match(frontend, /type=\"password\"/);
  assert.match(frontend, /token\.value = ''/);
  assert.ok(frontend.indexOf("invoke('sync_estimate'") < frontend.indexOf('if (this.isAndroid)'), 'Android must attempt the server-side adapter before falling back to a queued desktop bridge');
});

test('web and Android entrypoints load the integration layers in dependency order', async () => {
  for (const path of ['index.html', 'app/src/main/assets/index.html']) {
    const entrypoint = await read(path);
    const appIndex = entrypoint.indexOf('src="app.js?v=69"');
    const supabaseIndex = entrypoint.indexOf('src="supabase-service.js?v=63"');
    const integrationsIndex = entrypoint.indexOf('src="roomflow-integrations.js?v=9"');
    const townsquareIndex = entrypoint.indexOf('src="townsquare-integration.js?v=3"');
    assert.ok(appIndex >= 0, `${path} must load the current application state`);
    assert.ok(supabaseIndex > appIndex, `${path} must load the Supabase service after application state`);
    assert.ok(integrationsIndex > supabaseIndex, `${path} must load RoomFlow integrations after Supabase`);
    assert.ok(townsquareIndex > integrationsIndex, `${path} must load Townsquare after RoomFlow integrations`);
  }
  for (const path of ['app.js', 'app/src/main/assets/app.js']) {
    assert.match(await read(path), /window\.state\s*=\s*state;/, `${path} must expose state to integration modules`);
  }
});

test('Edge Function encrypts credentials and explicitly validates JWT authorization', async () => {
  const edge = await read('supabase/functions/townsquare-sync/index.ts');
  assert.match(edge, /AES-GCM/);
  assert.match(edge, /service\.auth\.getUser\(token\)/);
  assert.match(edge, /authorizeAction/);
  assert.doesNotMatch(edge, /console\.(log|error).*token/i);
  assert.doesNotMatch(edge, /api_token_ciphertext.*publicConfiguration[\s\S]{0,200}api_token_ciphertext/);
});

test('migration provides unique mappings, idempotency, RLS, and protected credential storage', async () => {
  const migration = await read('supabase/migrations/20260802210000_townsquare_bridge.sql');
  assert.match(migration, /UNIQUE \(organization_id, provider, entity_type, roomflow_entity_id\)/);
  assert.match(migration, /UNIQUE \(organization_id, provider, idempotency_key\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /REVOKE ALL ON public\.external_integrations FROM anon, authenticated/);
  assert.match(migration, /api_token_ciphertext/);
});

test('all required Townsquare fixtures are present in the browser suite', async () => {
  const harness = await read('tests/townsquare-extension-smoke.html');
  for (const fixture of [
    'townsquare-customer-creation.html', 'townsquare-estimate-creation.html',
    'townsquare-missing-controls.html', 'townsquare-multiple-customers.html',
    'townsquare-validation-error.html', 'townsquare-estimate-update.html',
    'townsquare-staged-estimate.html'
  ]) assert.match(harness, new RegExp(fixture.replace('.', '\\.')));
  assert.match(harness, /Send\/Issue\/Email\/Approve controls are never clicked/);
  assert.match(harness, /Repeated synchronization updates mapped draft/);
});
