-- Fixes "new row violates row-level security policy for table leagues" when
-- creating a PRIVATE league. Postgres reports both a failed INSERT WITH
-- CHECK and a failed RETURNING/SELECT-policy visibility check with the
-- identical error message. The previous SELECT policy required
-- is_league_member(id, auth.uid()) for private leagues, which only becomes
-- true once the on_league_created trigger inserts the creator into
-- league_members — a same-transaction ordering dependency that broke
-- createLeague()'s insert().select().single() for private leagues (public
-- leagues never hit this since `privacy = 'public'` short-circuits true).
--
-- Fix: let the creator see their own row directly via created_by, with no
-- dependency on the trigger having already run.

drop policy if exists "Public leagues or member leagues are visible" on public.leagues;
create policy "Public leagues or member leagues are visible"
  on public.leagues for select
  using (
    privacy = 'public'
    or created_by = auth.uid()
    or public.is_league_member(id, auth.uid())
  );
