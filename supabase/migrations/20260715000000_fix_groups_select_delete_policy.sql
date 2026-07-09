-- Fix: "new row violates row-level security policy for table groups" (42501)
-- on group creation. Root cause: createGroup() does insert(...).select().single(),
-- which Postgres runs as INSERT ... RETURNING. RETURNING is gated by the
-- table's SELECT policy against the new row, evaluated at insert time — before
-- the on_group_created AFTER INSERT trigger has added the creator to
-- group_members. So "Members and invitees can view groups" (which only
-- checked is_group_member) rejected the creator's own just-created row.
-- Fix: let the creator always see their own group directly via created_by,
-- independent of membership-row timing.
drop policy if exists "Members and invitees can view groups" on public.groups;
create policy "Members and invitees can view groups"
  on public.groups for select
  using (
    auth.uid() = created_by
    or public.is_group_member(id, auth.uid())
    or exists (
      select 1 from public.group_invite_members gim
      where gim.group_id = groups.id and gim.invited_user_id = auth.uid() and gim.status = 'pending'
    )
  );

-- Scoping fix while in here: DELETE checked auth.uid() = created_by directly,
-- inconsistent with UPDATE's is_group_owner(id, auth.uid()). created_by never
-- changes even if the creator later leaves the group (no UI path does this
-- today, but the DB-level policy shouldn't rely on that) — meaning a former
-- creator who's no longer a member could still delete the group, and a
-- transferred owner (if that ever ships) couldn't. Align DELETE with UPDATE's
-- ownership check.
drop policy if exists "Owners can delete their group" on public.groups;
create policy "Owners can delete their group"
  on public.groups for delete
  using ( public.is_group_owner(id, auth.uid()) );
