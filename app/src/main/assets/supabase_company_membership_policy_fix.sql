-- RoomFlow company membership visibility repair.
-- Safe to run repeatedly after the Phase 1 migration.

DROP POLICY IF EXISTS "Members can view other members in company"
ON public.organization_members;

CREATE POLICY "Members can view other members in company"
ON public.organization_members
FOR SELECT TO authenticated
USING (public.roomflow_is_org_member(organization_id));

DROP POLICY IF EXISTS "Members can view organization"
ON public.organizations;

CREATE POLICY "Members can view organization"
ON public.organizations
FOR SELECT TO authenticated
USING (public.roomflow_is_org_member(id));
