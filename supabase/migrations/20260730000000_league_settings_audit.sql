-- Feature 1: editable league settings, enforced format-lock, audit trail.
-- Run this once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Confirmed design: name/description/max_members/registration dates/entry
-- requirements are freely editable by commissioner or co-commissioner at
-- any time. `format` is only editable until the league's first match row
-- exists (bracket/round-robin generate their whole match tree up front,
-- and season's first added match is the equivalent line) — enforced here
-- at the database, not just in the UI, per this codebase's "never trust
-- client-only checks" pattern (see team_members' unique constraint).

-- 1. Enforce the format lock ---------------------------------------------

create or replace function public.enforce_league_format_lock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.format is distinct from old.format
     and exists (select 1 from public.matches where league_id = old.id) then
    raise exception 'Format can''t be changed once the schedule has matches. Delete the league and recreate it to pick a different format.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_league_format_lock on public.leagues;
create trigger trg_enforce_league_format_lock
before update on public.leagues
for each row execute function public.enforce_league_format_lock();

-- 2. Audit trail -----------------------------------------------------------
-- One row per settings save (not per changed field) — `changes` is a jsonb
-- map of field name -> {old, new}, so a single edit that touches several
-- fields renders as one feed entry rather than several.

create table if not exists public.league_settings_audit (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  changed_by uuid not null references public.profiles(id) on delete cascade,
  changes jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists league_settings_audit_league_idx on public.league_settings_audit (league_id, created_at desc);

alter table public.league_settings_audit enable row level security;

-- Read-only for members; every row is written by the trigger below via
-- security definer, so there's no insert/update/delete policy for clients.
drop policy if exists "Members can view settings audit log" on public.league_settings_audit;
create policy "Members can view settings audit log"
  on public.league_settings_audit for select
  using ( public.is_league_member(league_id, auth.uid()) );

create or replace function public.log_league_settings_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_changes jsonb := '{}'::jsonb;
begin
  if new.name is distinct from old.name then
    v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('old', old.name, 'new', new.name));
  end if;
  if new.description is distinct from old.description then
    v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('old', old.description, 'new', new.description));
  end if;
  if new.max_members is distinct from old.max_members then
    v_changes := v_changes || jsonb_build_object('max_members', jsonb_build_object('old', old.max_members, 'new', new.max_members));
  end if;
  if new.registration_opens_at is distinct from old.registration_opens_at then
    v_changes := v_changes || jsonb_build_object('registration_opens_at', jsonb_build_object('old', old.registration_opens_at, 'new', new.registration_opens_at));
  end if;
  if new.registration_closes_at is distinct from old.registration_closes_at then
    v_changes := v_changes || jsonb_build_object('registration_closes_at', jsonb_build_object('old', old.registration_closes_at, 'new', new.registration_closes_at));
  end if;
  if new.entry_requirements is distinct from old.entry_requirements then
    v_changes := v_changes || jsonb_build_object('entry_requirements', jsonb_build_object('old', old.entry_requirements, 'new', new.entry_requirements));
  end if;
  if new.format is distinct from old.format then
    v_changes := v_changes || jsonb_build_object('format', jsonb_build_object('old', old.format, 'new', new.format));
  end if;

  if v_changes <> '{}'::jsonb then
    insert into public.league_settings_audit (league_id, changed_by, changes)
    values (new.id, auth.uid(), v_changes);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_league_settings_change on public.leagues;
create trigger trg_log_league_settings_change
after update on public.leagues
for each row execute function public.log_league_settings_change();

-- 3. RLS: update already restricted to commissioner/co-commissioner --------
-- (public.leagues already has "Commissioner can update league" from the
-- original leagues migration using is_league_commissioner — no change
-- needed here, this section just documents that this migration relies on it.)
