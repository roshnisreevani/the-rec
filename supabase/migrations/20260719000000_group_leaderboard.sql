-- Group leaderboards: per-group metric settings + per-member stat entries.
-- Run this once in your Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- "Commissioner" = the group's existing owner role (group_members.role =
-- 'owner', exactly one per group, assigned to the creator at group
-- creation) — no new role field. RLS reuses the security-definer helpers
-- is_group_member()/is_group_owner() from the groups schema, same pattern
-- as group posts.

-- 1. Per-group leaderboard settings ----------------------------------------
-- One row per group. The four track_* flags map 1:1 to the supported metric
-- types; the leaderboard screen renders only the flagged columns.

create table if not exists public.group_leaderboard_settings (
  group_id uuid primary key references public.groups(id) on delete cascade,
  track_wins_losses boolean not null default true,
  track_win_pct boolean not null default false,
  track_games_played boolean not null default true,
  track_attendance boolean not null default false,
  edit_mode text not null default 'commissioner' check (edit_mode in ('commissioner', 'anyone')),
  updated_at timestamptz not null default now()
);

-- Repair: `create table if not exists` skips entirely when the table already
-- exists, so if an earlier partial run created it with missing columns,
-- bring it up to the expected shape. All no-ops on a healthy table.
alter table public.group_leaderboard_settings add column if not exists track_wins_losses boolean not null default true;
alter table public.group_leaderboard_settings add column if not exists track_win_pct boolean not null default false;
alter table public.group_leaderboard_settings add column if not exists track_games_played boolean not null default true;
alter table public.group_leaderboard_settings add column if not exists track_attendance boolean not null default false;
alter table public.group_leaderboard_settings add column if not exists edit_mode text not null default 'commissioner';
alter table public.group_leaderboard_settings add column if not exists updated_at timestamptz not null default now();

alter table public.group_leaderboard_settings drop constraint if exists group_leaderboard_settings_edit_mode_check;
alter table public.group_leaderboard_settings add constraint group_leaderboard_settings_edit_mode_check
  check (edit_mode in ('commissioner', 'anyone'));

-- The upserts (and the one-row-per-group model) need group_id unique; add
-- the primary key if the partial table was created without one.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.group_leaderboard_settings'::regclass and contype = 'p'
  ) then
    alter table public.group_leaderboard_settings add primary key (group_id);
  end if;
end $$;

alter table public.group_leaderboard_settings enable row level security;

drop policy if exists "Members can view leaderboard settings" on public.group_leaderboard_settings;
create policy "Members can view leaderboard settings"
  on public.group_leaderboard_settings for select
  using ( public.is_group_member(group_id, auth.uid()) );

drop policy if exists "Commissioner can update leaderboard settings" on public.group_leaderboard_settings;
create policy "Commissioner can update leaderboard settings"
  on public.group_leaderboard_settings for update
  using ( public.is_group_owner(group_id, auth.uid()) );

-- Fallback insert for the commissioner (normal path is the trigger below).
drop policy if exists "Commissioner can create leaderboard settings" on public.group_leaderboard_settings;
create policy "Commissioner can create leaderboard settings"
  on public.group_leaderboard_settings for insert
  with check ( public.is_group_owner(group_id, auth.uid()) );

-- Every group gets a settings row automatically (same pattern as the
-- auto-created Banter thread).
create or replace function public.ensure_leaderboard_settings()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.group_leaderboard_settings (group_id)
  values (new.id)
  on conflict (group_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_group_created_leaderboard on public.groups;
create trigger on_group_created_leaderboard
  after insert on public.groups
  for each row execute procedure public.ensure_leaderboard_settings();

-- Backfill for groups that already exist.
insert into public.group_leaderboard_settings (group_id)
select id from public.groups
on conflict (group_id) do nothing;

-- 2. Per-member entries -------------------------------------------------------
-- Win percentage is always derived from wins/(wins+losses), never stored.

create table if not exists public.group_leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  wins int not null default 0 check (wins >= 0),
  losses int not null default 0 check (losses >= 0),
  games_played int not null default 0 check (games_played >= 0),
  attendance int not null default 0 check (attendance >= 0),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists group_leaderboard_entries_group_idx on public.group_leaderboard_entries (group_id);

alter table public.group_leaderboard_entries enable row level security;

-- Who may write entries: the commissioner always; any member only when the
-- group's edit_mode is 'anyone'. Security definer so the settings lookup
-- isn't itself subject to RLS recursion concerns.
create or replace function public.can_edit_leaderboard(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.is_group_owner(p_group_id, p_user_id)
    or (
      public.is_group_member(p_group_id, p_user_id)
      and exists (
        select 1 from public.group_leaderboard_settings s
        where s.group_id = p_group_id and s.edit_mode = 'anyone'
      )
    );
$$;

drop policy if exists "Members can view leaderboard entries" on public.group_leaderboard_entries;
create policy "Members can view leaderboard entries"
  on public.group_leaderboard_entries for select
  using ( public.is_group_member(group_id, auth.uid()) );

drop policy if exists "Authorized members can add entries" on public.group_leaderboard_entries;
create policy "Authorized members can add entries"
  on public.group_leaderboard_entries for insert
  with check ( public.can_edit_leaderboard(group_id, auth.uid()) );

drop policy if exists "Authorized members can update entries" on public.group_leaderboard_entries;
create policy "Authorized members can update entries"
  on public.group_leaderboard_entries for update
  using ( public.can_edit_leaderboard(group_id, auth.uid()) )
  with check ( public.can_edit_leaderboard(group_id, auth.uid()) );

drop policy if exists "Commissioner can remove entries" on public.group_leaderboard_entries;
create policy "Commissioner can remove entries"
  on public.group_leaderboard_entries for delete
  using ( public.is_group_owner(group_id, auth.uid()) );
