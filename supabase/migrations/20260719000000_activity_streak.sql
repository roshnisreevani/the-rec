-- Activity streak: replaces the hardcoded MOCK_STREAK_WEEKS on Profile with a
-- real "consecutive weeks with any activity" streak. Deliberately loose about
-- what counts as activity — this is a friendly "you showed up" streak, not an
-- attendance/performance stat, so opening the app at all is enough to log a
-- day. One row per user per calendar day (upserted, idempotent) keeps this
-- cheap regardless of how many times someone opens the app in a day.
--
-- Run this once in the Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new

create table if not exists public.activity_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

alter table public.activity_days enable row level security;

-- Users only ever read/write their own activity log — nobody else's activity
-- is exposed (no "who's been active" leaderboard here).
drop policy if exists "Users can view their own activity" on public.activity_days;
create policy "Users can view their own activity"
  on public.activity_days for select
  using ( auth.uid() = user_id );

drop policy if exists "Users can log their own activity" on public.activity_days;
create policy "Users can log their own activity"
  on public.activity_days for insert
  with check ( auth.uid() = user_id );
