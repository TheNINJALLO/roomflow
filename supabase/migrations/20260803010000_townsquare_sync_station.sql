-- Dedicated RoomFlow Townsquare Sync Stations.
-- Apply after 20260802210000_townsquare_bridge.sql.

CREATE TABLE IF NOT EXISTS public.external_sync_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  last_claimed_at timestamptz,
  last_completed_at timestamptz,
  last_error_code text,
  last_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  FOREIGN KEY (integration_id, organization_id)
    REFERENCES public.external_integrations(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT external_sync_stations_name_check CHECK (char_length(name) BETWEEN 3 AND 80),
  UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS external_sync_stations_integration_idx
  ON public.external_sync_stations (integration_id, enabled, last_seen_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS external_sync_stations_active_name_idx
  ON public.external_sync_stations (integration_id, lower(name))
  WHERE enabled = true AND revoked_at IS NULL;

DROP TRIGGER IF EXISTS roomflow_external_sync_stations_updated_at ON public.external_sync_stations;
CREATE TRIGGER roomflow_external_sync_stations_updated_at
BEFORE UPDATE ON public.external_sync_stations
FOR EACH ROW EXECUTE FUNCTION public.roomflow_set_updated_at();

ALTER TABLE public.external_sync_stations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_sync_stations FROM anon, authenticated;
GRANT ALL ON public.external_sync_stations TO service_role;

ALTER TABLE public.external_sync_runs
  ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES public.external_sync_stations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS station_claim_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS external_sync_runs_station_idx
  ON public.external_sync_runs (station_id, status, bridge_expires_at);

-- The Edge Function calls this with the service role after authenticating the
-- station token. FOR UPDATE SKIP LOCKED guarantees that concurrent stations
-- cannot claim the same queued run.
CREATE OR REPLACE FUNCTION public.roomflow_claim_townsquare_sync(
  p_station_id uuid,
  p_bridge_token_hash text,
  p_bridge_expires_at timestamptz
)
RETURNS SETOF public.external_sync_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_station public.external_sync_stations%ROWTYPE;
BEGIN
  SELECT * INTO v_station
  FROM public.external_sync_stations
  WHERE id = p_station_id AND enabled = true AND revoked_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SYNC_STATION_NOT_AVAILABLE';
  END IF;

  IF p_bridge_token_hash IS NULL OR char_length(p_bridge_token_hash) <> 64 THEN
    RAISE EXCEPTION 'INVALID_BRIDGE_TOKEN_HASH';
  END IF;

  IF p_bridge_expires_at <= now() OR p_bridge_expires_at > now() + interval '15 minutes' THEN
    RAISE EXCEPTION 'INVALID_BRIDGE_LEASE';
  END IF;

  RETURN QUERY
  WITH next_run AS (
    SELECT run.id
    FROM public.external_sync_runs run
    JOIN public.external_integrations integration ON integration.id = run.integration_id
    WHERE run.organization_id = v_station.organization_id
      AND run.integration_id = v_station.integration_id
      AND run.provider = 'townsquare'
      AND run.adapter_mode = 'browser_bridge'
      AND run.status = 'queued'
      AND integration.enabled = true
    ORDER BY run.created_at ASC
    FOR UPDATE OF run SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.external_sync_runs run
  SET status = 'opening_townsquare',
      station_id = p_station_id,
      station_claim_attempts = run.station_claim_attempts + 1,
      bridge_token_hash = p_bridge_token_hash,
      bridge_expires_at = p_bridge_expires_at,
      error_code = NULL,
      error_message = NULL,
      review_reason = NULL,
      completed_at = NULL,
      started_at = now(),
      updated_at = now()
  FROM next_run
  WHERE run.id = next_run.id
  RETURNING run.*;
END;
$$;

REVOKE ALL ON FUNCTION public.roomflow_claim_townsquare_sync(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.roomflow_claim_townsquare_sync(uuid, text, timestamptz) TO service_role;

COMMENT ON TABLE public.external_sync_stations IS
  'Dedicated browser workers. Only a SHA-256 device-token hash is stored; plaintext tokens are returned once at pairing.';
COMMENT ON COLUMN public.external_sync_stations.last_status IS
  'Sanitized health metadata only. Customer data, bridge payloads, cookies, and credentials are prohibited.';
