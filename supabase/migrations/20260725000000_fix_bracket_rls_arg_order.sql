-- Fix: bracket RLS policies called is_group_member/is_group_owner with the
-- arguments REVERSED. The helpers are (p_group_id, p_user_id), but every
-- bracket policy passed (auth.uid(), group_id). Both params are uuid, so
-- there was no type error — the check just silently evaluated false, which
-- is why creating a bracket failed with "violates row-level security policy"
-- (and why reading/updating brackets, participants, and matches also broke).
--
-- This recreates every affected policy with the correct order:
--   is_group_member(group_id, auth.uid())  /  is_group_owner(group_id, auth.uid())
-- Run this once in your Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new

-- brackets ------------------------------------------------------------------

drop policy if exists "group members read brackets" on brackets;
create policy "group members read brackets"
  on brackets for select
  using (is_group_member(group_id, auth.uid()));

drop policy if exists "group members create brackets" on brackets;
create policy "group members create brackets"
  on brackets for insert
  with check (is_group_member(group_id, auth.uid()) and auth.uid() = created_by);

drop policy if exists "bracket creator or owner can update" on brackets;
create policy "bracket creator or owner can update"
  on brackets for update
  using (auth.uid() = created_by or is_group_owner(group_id, auth.uid()));

drop policy if exists "bracket creator or owner can delete" on brackets;
create policy "bracket creator or owner can delete"
  on brackets for delete
  using (auth.uid() = created_by or is_group_owner(group_id, auth.uid()));

-- bracket_participants ------------------------------------------------------

drop policy if exists "group members read participants" on bracket_participants;
create policy "group members read participants"
  on bracket_participants for select
  using (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(b.group_id, auth.uid())
  ));

drop policy if exists "group members insert participants" on bracket_participants;
create policy "group members insert participants"
  on bracket_participants for insert
  with check (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(b.group_id, auth.uid())
  ));

-- bracket_matches -----------------------------------------------------------

drop policy if exists "group members read matches" on bracket_matches;
create policy "group members read matches"
  on bracket_matches for select
  using (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(b.group_id, auth.uid())
  ));

drop policy if exists "group members insert matches" on bracket_matches;
create policy "group members insert matches"
  on bracket_matches for insert
  with check (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(b.group_id, auth.uid())
  ));

drop policy if exists "group members update matches" on bracket_matches;
create policy "group members update matches"
  on bracket_matches for update
  using (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(b.group_id, auth.uid())
  ));
