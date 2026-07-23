-- Leagues tab: large-scale tournament management, distinct from Groups.
-- Run this once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Confirmed Phase 1 design:
--  - Formats: single_elim, double_elim, round_robin, season — all selectable
--    per league, sharing one `matches` table (bracket-only columns are null
--    for round_robin/season).
--  - Team assignment: commissioner assigns members to teams manually. No
--    random/draft assignment built now.
--  - Stats: flexible per-league categories (league_stat_categories +
--    player_stats), not fixed columns.
--  - Join methods: browse/join public leagues directly, or join any league
--    via a shareable invite code (mirrors group_invites/join_group_via_invite).
--  - Standings/stat totals are Postgres views (security_invoker so they
--    respect the querying user's own RLS/membership) — never computed
--    client-side, and never go stale since nothing is materialized.
--  - Tie-break: left to the commissioner — standings show ties as-is, no
--    head-to-head tiebreaker logic.
--  - Announcements: postable by commissioner/co-commissioner only, visible
--    to league members only.
--  - Stats entry: commissioner/co-commissioner only, no self-report/approval
--    flow.
--  - No payment/paywall logic of any kind.

-- 1. Leagues -------------------------------------------------------------

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  sport_tag text,
  format text not null check (format in ('single_elim', 'double_elim', 'round_robin', 'season')),
  privacy text not null default 'public' check (privacy in ('public', 'private')),
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed')),
  max_members int,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  entry_requirements text not null default '',
  avatar_url text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.leagues enable row level security;

-- 2. Membership (commissioner / co_commissioner / member) -----------------

create table if not exists public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('commissioner', 'co_commissioner', 'member')),
  joined_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create index if not exists league_members_league_idx on public.league_members (league_id);
create index if not exists league_members_user_idx on public.league_members (user_id);

alter table public.league_members enable row level security;

-- 3. Shareable invite links (mirrors group_invites) -----------------------

create table if not exists public.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null unique references public.leagues(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.league_invites enable row level security;

-- 4. Teams ------------------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  description text not null default '',
  avatar_url text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists teams_league_idx on public.teams (league_id);

alter table public.teams enable row level security;

-- 5. Team membership -------------------------------------------------------
-- league_id is denormalized here (rather than joining through teams) so the
-- "one team per member per league" rule can be a real database constraint,
-- not just an app-layer check.

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create index if not exists team_members_team_idx on public.team_members (team_id);
create index if not exists team_members_league_idx on public.team_members (league_id);

alter table public.team_members enable row level security;

-- 6. Matches ------------------------------------------------------------------
-- One shape for all four formats. round/bracket_position/next_match_id/
-- loser_next_match_id are only populated for single_elim/double_elim; they
-- stay null for round_robin/season matches. winner_team_id is null for a
-- tie (season/round_robin only — brackets always have a winner).

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  round int,
  bracket_position int,
  team_a_id uuid references public.teams(id) on delete set null,
  team_b_id uuid references public.teams(id) on delete set null,
  team_a_score int,
  team_b_score int,
  winner_team_id uuid references public.teams(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'forfeit_a', 'forfeit_b')),
  scheduled_at timestamptz,
  next_match_id uuid references public.matches(id) on delete set null,
  next_match_slot text check (next_match_slot in ('a', 'b')),
  loser_next_match_id uuid references public.matches(id) on delete set null,
  loser_next_match_slot text check (loser_next_match_slot in ('a', 'b')),
  created_at timestamptz not null default now()
);

create index if not exists matches_league_idx on public.matches (league_id);
create index if not exists matches_next_match_idx on public.matches (next_match_id);
create index if not exists matches_loser_next_match_idx on public.matches (loser_next_match_id);

alter table public.matches enable row level security;

-- 7. Announcements ----------------------------------------------------------

create table if not exists public.league_announcements (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists league_announcements_league_idx on public.league_announcements (league_id, created_at desc);

alter table public.league_announcements enable row level security;

-- 8. Flexible stat categories + entries --------------------------------------

create table if not exists public.league_stat_categories (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  unit text,
  created_at timestamptz not null default now(),
  unique (league_id, name)
);

create index if not exists league_stat_categories_league_idx on public.league_stat_categories (league_id);

alter table public.league_stat_categories enable row level security;

create table if not exists public.player_stats (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  stat_category_id uuid not null references public.league_stat_categories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  value numeric not null,
  recorded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists player_stats_league_idx on public.player_stats (league_id);
create index if not exists player_stats_category_idx on public.player_stats (stat_category_id);
create index if not exists player_stats_user_idx on public.player_stats (user_id);

alter table public.player_stats enable row level security;

-- 9. RLS helper functions -----------------------------------------------------
-- Same security-definer pattern as is_group_member/is_group_owner, to avoid
-- Postgres 42P17 recursion when a table's own policy needs to check
-- membership in itself. Argument order is ALWAYS (id, user_id) — a past bug
-- (brackets) reversed this for is_group_member/is_group_owner and silently
-- broke RLS since both args are uuid with no type error; do not repeat that
-- here.

create or replace function public.is_league_member(p_league_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = p_user_id
  );
$$;

create or replace function public.is_league_commissioner(p_league_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = p_user_id and role in ('commissioner', 'co_commissioner')
  );
$$;

-- 10. RLS policies ------------------------------------------------------------

-- leagues: public leagues are discoverable by any signed-in user; private
-- leagues are visible only to members.
drop policy if exists "Public leagues or member leagues are visible" on public.leagues;
create policy "Public leagues or member leagues are visible"
  on public.leagues for select
  using ( privacy = 'public' or public.is_league_member(id, auth.uid()) );

drop policy if exists "Users can create leagues" on public.leagues;
create policy "Users can create leagues"
  on public.leagues for insert
  with check ( auth.uid() = created_by );

drop policy if exists "Commissioner can update league" on public.leagues;
create policy "Commissioner can update league"
  on public.leagues for update
  using ( public.is_league_commissioner(id, auth.uid()) );

drop policy if exists "Creator can delete league" on public.leagues;
create policy "Creator can delete league"
  on public.leagues for delete
  using ( auth.uid() = created_by );

-- league_members: any member can see the roster. Self-service join only for
-- public leagues; private-league / invite-code joins go through
-- join_league_via_invite (security definer) below. Commissioners can add/
-- remove members directly (manual team assignment starts from here).
drop policy if exists "Members can view league roster" on public.league_members;
create policy "Members can view league roster"
  on public.league_members for select
  using ( public.is_league_member(league_id, auth.uid()) );

drop policy if exists "Users can join public leagues or be added by commissioner" on public.league_members;
create policy "Users can join public leagues or be added by commissioner"
  on public.league_members for insert
  with check (
    (
      auth.uid() = user_id
      and exists (select 1 from public.leagues l where l.id = league_id and l.privacy = 'public')
    )
    or public.is_league_commissioner(league_id, auth.uid())
  );

drop policy if exists "Commissioner can change member roles" on public.league_members;
create policy "Commissioner can change member roles"
  on public.league_members for update
  using ( public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Users can leave or be removed by commissioner" on public.league_members;
create policy "Users can leave or be removed by commissioner"
  on public.league_members for delete
  using (
    auth.uid() = user_id
    or public.is_league_commissioner(league_id, auth.uid())
  );

-- league_invites: commissioner-managed only (invites are a management
-- action here, unlike Groups where any member can invite).
drop policy if exists "Commissioner can view invite link" on public.league_invites;
create policy "Commissioner can view invite link"
  on public.league_invites for select
  using ( public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Commissioner can create invite link" on public.league_invites;
create policy "Commissioner can create invite link"
  on public.league_invites for insert
  with check (
    auth.uid() = created_by
    and public.is_league_commissioner(league_id, auth.uid())
  );

drop policy if exists "Commissioner can regenerate invite link" on public.league_invites;
create policy "Commissioner can regenerate invite link"
  on public.league_invites for update
  using ( public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Commissioner can delete invite link" on public.league_invites;
create policy "Commissioner can delete invite link"
  on public.league_invites for delete
  using ( public.is_league_commissioner(league_id, auth.uid()) );

-- teams: visible to league members, managed by commissioner only.
drop policy if exists "Members can view teams" on public.teams;
create policy "Members can view teams"
  on public.teams for select
  using ( public.is_league_member(league_id, auth.uid()) );

drop policy if exists "Commissioner can create teams" on public.teams;
create policy "Commissioner can create teams"
  on public.teams for insert
  with check ( auth.uid() = created_by and public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Commissioner can update teams" on public.teams;
create policy "Commissioner can update teams"
  on public.teams for update
  using ( public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Commissioner can delete teams" on public.teams;
create policy "Commissioner can delete teams"
  on public.teams for delete
  using ( public.is_league_commissioner(league_id, auth.uid()) );

-- team_members: visible to league members, assigned/removed by commissioner
-- only (manual assignment, per confirmed design — no self-join).
drop policy if exists "Members can view team rosters" on public.team_members;
create policy "Members can view team rosters"
  on public.team_members for select
  using ( public.is_league_member(league_id, auth.uid()) );

drop policy if exists "Commissioner assigns team members" on public.team_members;
create policy "Commissioner assigns team members"
  on public.team_members for insert
  with check ( public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Commissioner removes team members" on public.team_members;
create policy "Commissioner removes team members"
  on public.team_members for delete
  using ( public.is_league_commissioner(league_id, auth.uid()) );

-- matches: visible to league members, schedule/results managed by
-- commissioner only.
drop policy if exists "Members can view matches" on public.matches;
create policy "Members can view matches"
  on public.matches for select
  using ( public.is_league_member(league_id, auth.uid()) );

drop policy if exists "Commissioner can create matches" on public.matches;
create policy "Commissioner can create matches"
  on public.matches for insert
  with check ( public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Commissioner can update matches" on public.matches;
create policy "Commissioner can update matches"
  on public.matches for update
  using ( public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Commissioner can delete matches" on public.matches;
create policy "Commissioner can delete matches"
  on public.matches for delete
  using ( public.is_league_commissioner(league_id, auth.uid()) );

-- league_announcements: visible to members only; postable by
-- commissioner/co-commissioner only (confirmed default).
drop policy if exists "Members can view announcements" on public.league_announcements;
create policy "Members can view announcements"
  on public.league_announcements for select
  using ( public.is_league_member(league_id, auth.uid()) );

drop policy if exists "Commissioner can post announcements" on public.league_announcements;
create policy "Commissioner can post announcements"
  on public.league_announcements for insert
  with check ( auth.uid() = author_id and public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Author or commissioner can delete announcement" on public.league_announcements;
create policy "Author or commissioner can delete announcement"
  on public.league_announcements for delete
  using ( auth.uid() = author_id or public.is_league_commissioner(league_id, auth.uid()) );

-- league_stat_categories: visible to members, managed by commissioner only.
drop policy if exists "Members can view stat categories" on public.league_stat_categories;
create policy "Members can view stat categories"
  on public.league_stat_categories for select
  using ( public.is_league_member(league_id, auth.uid()) );

drop policy if exists "Commissioner manages stat categories" on public.league_stat_categories;
create policy "Commissioner manages stat categories"
  on public.league_stat_categories for insert
  with check ( public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Commissioner updates stat categories" on public.league_stat_categories;
create policy "Commissioner updates stat categories"
  on public.league_stat_categories for update
  using ( public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Commissioner deletes stat categories" on public.league_stat_categories;
create policy "Commissioner deletes stat categories"
  on public.league_stat_categories for delete
  using ( public.is_league_commissioner(league_id, auth.uid()) );

-- player_stats: visible to members; entered/edited by commissioner/
-- co-commissioner only (confirmed default — no self-report).
drop policy if exists "Members can view player stats" on public.player_stats;
create policy "Members can view player stats"
  on public.player_stats for select
  using ( public.is_league_member(league_id, auth.uid()) );

drop policy if exists "Commissioner records player stats" on public.player_stats;
create policy "Commissioner records player stats"
  on public.player_stats for insert
  with check ( auth.uid() = recorded_by and public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Commissioner updates player stats" on public.player_stats;
create policy "Commissioner updates player stats"
  on public.player_stats for update
  using ( public.is_league_commissioner(league_id, auth.uid()) );

drop policy if exists "Commissioner deletes player stats" on public.player_stats;
create policy "Commissioner deletes player stats"
  on public.player_stats for delete
  using ( public.is_league_commissioner(league_id, auth.uid()) );

-- 11. Auto-add the creator as commissioner ------------------------------------

create or replace function public.handle_new_league()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.league_members (league_id, user_id, role)
  values (new.id, new.created_by, 'commissioner')
  on conflict (league_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_league_created on public.leagues;
create trigger on_league_created
  after insert on public.leagues
  for each row execute procedure public.handle_new_league();

-- 12. Invite-link functions (mirrors get_group_invite_preview / join_group_via_invite) --

create or replace function public.get_league_invite_preview(p_code text)
returns table (
  league_id uuid,
  name text,
  description text,
  format text,
  privacy text,
  member_count bigint
)
language sql
security definer set search_path = public
stable
as $$
  select l.id, l.name, l.description, l.format, l.privacy,
    (select count(*) from public.league_members lm where lm.league_id = l.id)
  from public.leagues l
  join public.league_invites li on li.league_id = l.id
  where li.code = p_code;
$$;

create or replace function public.join_league_via_invite(p_code text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_league_id uuid;
begin
  select l.id into v_league_id
  from public.leagues l
  join public.league_invites li on li.league_id = l.id
  where li.code = p_code;

  if v_league_id is null then
    raise exception 'This invite link is invalid or has expired.';
  end if;

  if exists (select 1 from public.league_members where league_id = v_league_id and user_id = auth.uid()) then
    return 'already_member';
  end if;

  insert into public.league_members (league_id, user_id, role) values (v_league_id, auth.uid(), 'member');
  return 'joined';
end;
$$;

-- 13. Standings + stat totals views -------------------------------------------
-- security_invoker = true so PostgREST runs these as the querying user, not
-- the view owner — the underlying tables' RLS (is_league_member) is what
-- actually gates visibility. Always live, never stale, no refresh needed.

create or replace view public.league_standings
with (security_invoker = true) as
select
  t.league_id,
  t.id as team_id,
  t.name as team_name,
  count(*) filter (
    where m.status in ('completed', 'forfeit_a', 'forfeit_b')
  ) as games_played,
  count(*) filter (
    where m.status in ('completed', 'forfeit_a', 'forfeit_b') and m.winner_team_id = t.id
  ) as wins,
  count(*) filter (
    where m.status in ('completed', 'forfeit_a', 'forfeit_b')
      and m.winner_team_id is not null
      and m.winner_team_id <> t.id
  ) as losses,
  count(*) filter (
    where m.status = 'completed' and m.winner_team_id is null
  ) as ties
from public.teams t
left join public.matches m
  on m.league_id = t.league_id and (m.team_a_id = t.id or m.team_b_id = t.id)
group by t.league_id, t.id, t.name;

grant select on public.league_standings to authenticated;

create or replace view public.league_player_stat_totals
with (security_invoker = true) as
select
  ps.league_id,
  ps.stat_category_id,
  sc.name as category_name,
  sc.unit as category_unit,
  ps.user_id,
  ps.team_id,
  sum(ps.value) as total,
  count(*) as entry_count
from public.player_stats ps
join public.league_stat_categories sc on sc.id = ps.stat_category_id
group by ps.league_id, ps.stat_category_id, sc.name, sc.unit, ps.user_id, ps.team_id;

grant select on public.league_player_stat_totals to authenticated;

-- 14. Announcement notifications -----------------------------------------------
-- Fans out one notification per other league member, unlike the single-
-- recipient triggers elsewhere (comment likes/replies) since an announcement
-- has many recipients at once.
--
-- The constraint below also carries forward 'highlight_failed'/
-- 'highlight_ready' — a Highlights notification type that's live in the
-- database (applied directly via Supabase, not as a committed migration
-- file here) but was missing from every prior version of this constraint
-- in the repo's migration history. Omitting them breaks this ALTER against
-- the real database with a 23514 check-violation, since existing rows
-- already use those values.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'reaction', 'comment', 'follow', 'comment_like', 'comment_reply',
    'highlight_failed', 'highlight_ready', 'league_announcement'
  ));

create or replace function public.notify_on_league_announcement()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, type, actor_id, related_content_id)
  select lm.user_id, 'league_announcement', new.author_id, new.league_id
  from public.league_members lm
  where lm.league_id = new.league_id and lm.user_id <> new.author_id;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_league_announcement on public.league_announcements;
create trigger trg_notify_on_league_announcement
after insert on public.league_announcements
for each row execute function public.notify_on_league_announcement();
