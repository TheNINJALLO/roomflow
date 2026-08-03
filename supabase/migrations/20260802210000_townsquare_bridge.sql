-- RoomFlow Townsquare Interactive / inTandem integration
-- Apply after supabase_phase1_email_tracker_catalog.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Configuration is only read or written through the townsquare-sync Edge
-- Function. The encrypted token columns are intentionally not granted to the
-- authenticated role.
CREATE TABLE IF NOT EXISTS public.external_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  connection_mode text NOT NULL DEFAULT 'auto',
  api_base_url text NOT NULL DEFAULT 'https://api.vcita.biz',
  browser_destination_url text,
  currency text NOT NULL DEFAULT 'USD',
  estimate_expiration_days integer NOT NULL DEFAULT 30,
  attachment_mode text NOT NULL DEFAULT 'selected',
  provider_business_uid text,
  provider_tax_uid text,
  api_token_ciphertext text,
  api_token_iv text,
  api_token_key_version text,
  credential_updated_at timestamptz,
  provider_capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_successful_sync_at timestamptz,
  last_failed_sync_at timestamptz,
  last_error_code text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT external_integrations_provider_check CHECK (provider IN ('townsquare')),
  CONSTRAINT external_integrations_mode_check CHECK (connection_mode IN ('auto', 'api', 'browser_bridge')),
  CONSTRAINT external_integrations_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT external_integrations_expiration_check CHECK (estimate_expiration_days BETWEEN 1 AND 365),
  CONSTRAINT external_integrations_attachment_check CHECK (attachment_mode IN ('none', 'selected', 'all_estimate')),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, provider)
);

CREATE INDEX IF NOT EXISTS external_integrations_org_idx
  ON public.external_integrations (organization_id, provider);

DROP TRIGGER IF EXISTS roomflow_external_integrations_updated_at ON public.external_integrations;
CREATE TRIGGER roomflow_external_integrations_updated_at
BEFORE UPDATE ON public.external_integrations
FOR EACH ROW EXECUTE FUNCTION public.roomflow_set_updated_at();

CREATE TABLE IF NOT EXISTS public.external_entity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'townsquare',
  entity_type text NOT NULL,
  roomflow_entity_id uuid NOT NULL,
  provider_entity_id text NOT NULL,
  provider_status text,
  provider_url text,
  last_roomflow_revision text,
  last_provider_revision text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_synced_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT external_entity_mappings_provider_check CHECK (provider IN ('townsquare')),
  CONSTRAINT external_entity_mappings_type_check CHECK (entity_type IN ('organization', 'customer', 'property', 'job', 'estimate')),
  FOREIGN KEY (integration_id, organization_id) REFERENCES public.external_integrations(id, organization_id) ON DELETE CASCADE,
  UNIQUE (organization_id, provider, entity_type, roomflow_entity_id),
  UNIQUE (organization_id, provider, entity_type, provider_entity_id)
);

CREATE INDEX IF NOT EXISTS external_entity_mappings_lookup_idx
  ON public.external_entity_mappings (organization_id, provider, entity_type, roomflow_entity_id);

DROP TRIGGER IF EXISTS roomflow_external_entity_mappings_updated_at ON public.external_entity_mappings;
CREATE TRIGGER roomflow_external_entity_mappings_updated_at
BEFORE UPDATE ON public.external_entity_mappings
FOR EACH ROW EXECUTE FUNCTION public.roomflow_set_updated_at();

CREATE TABLE IF NOT EXISTS public.external_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'townsquare',
  adapter_mode text NOT NULL,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  roomflow_revision text NOT NULL,
  roomflow_total_minor bigint NOT NULL,
  provider_total_minor bigint,
  provider_estimate_id text,
  provider_estimate_url text,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachment_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  review_reason text,
  bridge_token_hash text,
  bridge_expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT external_sync_runs_provider_check CHECK (provider IN ('townsquare')),
  CONSTRAINT external_sync_runs_mode_check CHECK (adapter_mode IN ('api', 'browser_bridge')),
  CONSTRAINT external_sync_runs_status_check CHECK (status IN (
    'queued','validating','opening_townsquare','finding_customer','customer_matched',
    'customer_created','finding_property','property_matched','property_created',
    'creating_estimate','updating_estimate','attaching_documents','draft_created',
    'review_required','completed','cancelled','failed'
  )),
  FOREIGN KEY (integration_id, organization_id) REFERENCES public.external_integrations(id, organization_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, provider, idempotency_key)
);

CREATE INDEX IF NOT EXISTS external_sync_runs_estimate_idx
  ON public.external_sync_runs (estimate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS external_sync_runs_org_status_idx
  ON public.external_sync_runs (organization_id, status, created_at DESC);

DROP TRIGGER IF EXISTS roomflow_external_sync_runs_updated_at ON public.external_sync_runs;
CREATE TRIGGER roomflow_external_sync_runs_updated_at
BEFORE UPDATE ON public.external_sync_runs
FOR EACH ROW EXECUTE FUNCTION public.roomflow_set_updated_at();

CREATE TABLE IF NOT EXISTS public.external_sync_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sync_run_id uuid NOT NULL,
  status text NOT NULL,
  message text NOT NULL,
  provider_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT external_sync_events_status_check CHECK (status IN (
    'queued','validating','opening_townsquare','finding_customer','customer_matched',
    'customer_created','finding_property','property_matched','property_created',
    'creating_estimate','updating_estimate','attaching_documents','draft_created',
    'review_required','completed','cancelled','failed'
  )),
  FOREIGN KEY (sync_run_id, organization_id) REFERENCES public.external_sync_runs(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS external_sync_events_run_idx
  ON public.external_sync_events (sync_run_id, created_at);

ALTER TABLE public.external_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_entity_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Integration managers can view provider configuration" ON public.external_integrations;
CREATE POLICY "Integration managers can view provider configuration" ON public.external_integrations
FOR SELECT TO authenticated
USING (
  public.roomflow_is_org_member(organization_id)
  AND public.has_capability(organization_id, 'manage_integrations')
);

DROP POLICY IF EXISTS "Integration managers can manage provider configuration" ON public.external_integrations;
CREATE POLICY "Integration managers can manage provider configuration" ON public.external_integrations
FOR ALL TO authenticated
USING (
  public.roomflow_is_org_member(organization_id)
  AND public.has_capability(organization_id, 'manage_integrations')
)
WITH CHECK (
  public.roomflow_is_org_member(organization_id)
  AND public.has_capability(organization_id, 'manage_integrations')
);

DROP POLICY IF EXISTS "Organization members can view external mappings" ON public.external_entity_mappings;
CREATE POLICY "Organization members can view external mappings" ON public.external_entity_mappings
FOR SELECT TO authenticated
USING (public.roomflow_is_org_member(organization_id));

DROP POLICY IF EXISTS "Organization members can view external sync runs" ON public.external_sync_runs;
CREATE POLICY "Organization members can view external sync runs" ON public.external_sync_runs
FOR SELECT TO authenticated
USING (public.roomflow_is_org_member(organization_id));

DROP POLICY IF EXISTS "Organization members can view external sync events" ON public.external_sync_events;
CREATE POLICY "Organization members can view external sync events" ON public.external_sync_events
FOR SELECT TO authenticated
USING (public.roomflow_is_org_member(organization_id));

-- All mutations and configuration reads use the service role after the Edge
-- Function validates membership and capability. This prevents browser clients
-- from selecting encrypted credential columns directly.
REVOKE ALL ON public.external_integrations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.external_entity_mappings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.external_sync_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.external_sync_events FROM anon, authenticated;
GRANT SELECT ON public.external_entity_mappings TO authenticated;
GRANT SELECT ON public.external_sync_runs TO authenticated;
GRANT SELECT ON public.external_sync_events TO authenticated;
GRANT ALL ON public.external_integrations TO service_role;
GRANT ALL ON public.external_entity_mappings TO service_role;
GRANT ALL ON public.external_sync_runs TO service_role;
GRANT ALL ON public.external_sync_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.external_sync_events_id_seq TO service_role;

-- Existing owners receive the capabilities used by this integration. Other
-- roles continue to use the existing role editor and override system.
INSERT INTO public.role_capabilities (role_id, capability)
SELECT cr.id, capability
FROM public.custom_roles cr
CROSS JOIN (VALUES ('manage_integrations'), ('generate_proposals')) AS caps(capability)
WHERE cr.name = 'Company Owner'
ON CONFLICT (role_id, capability) DO NOTHING;

COMMENT ON COLUMN public.external_integrations.api_token_ciphertext IS
  'AES-GCM ciphertext. Never return this column to browser clients.';
COMMENT ON COLUMN public.external_integrations.api_token_iv IS
  'AES-GCM initialization vector. Not a credential by itself.';
COMMENT ON TABLE public.external_sync_events IS
  'Sanitized synchronization audit events; credentials and raw provider responses are prohibited.';
