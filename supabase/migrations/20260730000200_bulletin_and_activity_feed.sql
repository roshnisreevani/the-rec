-- Feature 3: Bulletin (pinnable commissioner posts) + Announcements
-- (aggregated activity feed). Run once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Design: Bulletin reuses the EXISTING league_announcements table (adds
-- pinned/archived_at) rather than a new bulletin_posts table — it's
-- already exactly "commissioner-authored, league-wide, member-visible
-- posts." A NEW league_activity_feed table holds only the four
-- SYSTEM-GENERATED event types (match_result, standings_change,
-- team_created, settings_change) — Bulletin posts are NOT duplicated into
-- it, since their pinned/archived state can change after posting and a
-- jsonb snapshot would go stale; the Announcements screen instead merges
-- (a) currently-pinned + recent league_announcements rows and (b)
-- chronological league_activity_feed rows client-side. System events, by
-- contrast, never change after they happen, so snapshotting them into
-- payload jsonb at insert time is safe.

-- 1. Bulletin: pin/unpin/archive on the existing announcements table -------

alter table public.league_announcements add column if not exists pinned boolean not null default false;
alter table public.league_announcements add column if not exists archived_at timestamptz;

drop policy if exists "Commissioner can update announcements" on public.league_announcements;
create policy "Commissioner can update announcements"
  on public.league_announcements for update
  using ( public.is_league_commissioner(league_id, auth.uid()) );

-- 2. Notification priority --------------------------------------------------
-- Only Bulletin posts generate real `notifications` rows (via the existing
-- notify_on_league_announcement trigger) — the system events below are
-- feed-only and deliberately don't fan out notifications, or every match
-- result / standings shift would spam every member's inbox.

alter table public.notifications add column if not exists priority text not null default 'normal' check (priority in ('normal', 'high'));

create or replace function public.notify_on_league_announcement()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, type, actor_id, related_content_id, priority)
  select lm.user_id, 'league_announcement', new.author_id, new.league_id, case when new.pinned then 'high' else 'normal' end
  from public.league_members lm
  where lm.league_id = new.league_id and lm.user_id <> new.author_id;
  return new;
end;
$$;

-- 3. Announcements: system-events activity feed -----------------------------

create table if not exists public.league_activity_feed (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  event_type text not null check (event_type in ('match_result', 'standings_change', 'team_created', 'settings_change')),
  actor_id uuid references public.profiles(id) on delete set null,
  related_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists league_activity_feed_league_idx on public.league_activity_feed (league_id, created_at desc);

alter table public.league_activity_feed enable row level security;

-- Read-only for members; every row is written by the triggers below via
-- security definer, so there's no insert/update/delete policy for clients.
drop policy if exists "Members can view activity feed" on public.league_activity_feed;
create policy "Members can view activity feed"
  on public.league_activity_feed for select
  using ( public.is_league_member(league_id, auth.uid()) );

-- 4. Standings-change detection ----------------------------------------------
-- No history exists for a pure view, so a small snapshot table is needed
-- either way (single-table or unioned-view design) to know a team's
-- previous rank and emit "moved to Nth" only when it actually changes.
-- Deliberately silent on a team's first-ever ranking (no prior snapshot
-- row) so the season's opening round of results doesn't flood the feed
-- with "everyone just got ranked" noise.

create table if not exists public.team_standing_snapshot (
  team_id uuid primary key references public.teams(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  rank int not null,
  updated_at timestamptz not null default now()
);

alter table public.team_standing_snapshot enable row level security;

drop policy if exists "Members can view standing snapshots" on public.team_standing_snapshot;
create policy "Members can view standing snapshots"
  on public.team_standing_snapshot for select
  using ( public.is_league_member(league_id, auth.uid()) );

create or replace function public.recompute_standings_and_emit_changes(p_league_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_rank int := 0;
  v_prev_rank int;
begin
  for r in
    select team_id, team_name
    from public.league_standings
    where league_id = p_league_id
    order by wins desc, losses asc
  loop
    v_rank := v_rank + 1;

    select rank into v_prev_rank from public.team_standing_snapshot where team_id = r.team_id;

    if v_prev_rank is not null and v_prev_rank <> v_rank then
      insert into public.league_activity_feed (league_id, event_type, related_id, payload)
      values (
        p_league_id, 'standings_change', r.team_id,
        jsonb_build_object('team_name', r.team_name, 'old_rank', v_prev_rank, 'new_rank', v_rank)
      );
    end if;

    insert into public.team_standing_snapshot (team_id, league_id, rank)
    values (r.team_id, p_league_id, v_rank)
    on conflict (team_id) do update set rank = excluded.rank, updated_at = now();
  end loop;
end;
$$;

-- 5. Match-result events ------------------------------------------------------
-- Fires only on the scheduled -> completed/forfeit transition, so a later
-- edit to an already-recorded score doesn't re-emit the event.

create or replace function public.notify_on_match_result()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_team_a_name text;
  v_team_b_name text;
begin
  if new.status in ('completed', 'forfeit_a', 'forfeit_b') and old.status = 'scheduled' then
    select name into v_team_a_name from public.teams where id = new.team_a_id;
    select name into v_team_b_name from public.teams where id = new.team_b_id;

    insert into public.league_activity_feed (league_id, event_type, related_id, payload)
    values (
      new.league_id, 'match_result', new.id,
      jsonb_build_object(
        'team_a_id', new.team_a_id, 'team_a_name', v_team_a_name,
        'team_b_id', new.team_b_id, 'team_b_name', v_team_b_name,
        'team_a_score', new.team_a_score, 'team_b_score', new.team_b_score,
        'winner_team_id', new.winner_team_id, 'status', new.status
      )
    );

    perform public.recompute_standings_and_emit_changes(new.league_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_match_result on public.matches;
create trigger trg_notify_on_match_result
after update on public.matches
for each row execute function public.notify_on_match_result();

-- 6. Team-created events -------------------------------------------------------

create or replace function public.notify_on_team_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.league_activity_feed (league_id, event_type, actor_id, related_id, payload)
  values (new.league_id, 'team_created', new.created_by, new.id, jsonb_build_object('team_name', new.name));
  return new;
end;
$$;

drop trigger if exists trg_notify_on_team_created on public.teams;
create trigger trg_notify_on_team_created
after insert on public.teams
for each row execute function public.notify_on_team_created();

-- 7. Settings-change events (mirrors league_settings_audit into the feed) -----

create or replace function public.notify_on_settings_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.league_activity_feed (league_id, event_type, actor_id, related_id, payload)
  values (new.league_id, 'settings_change', new.changed_by, new.id, new.changes);
  return new;
end;
$$;

drop trigger if exists trg_notify_on_settings_change on public.league_settings_audit;
create trigger trg_notify_on_settings_change
after insert on public.league_settings_audit
for each row execute function public.notify_on_settings_change();
