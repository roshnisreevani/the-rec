-- Moderation: reports + blocked users.
-- Run this once in your Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Checked first: as of this migration, no `reports` or `blocked_users` table
-- existed anywhere else in the project (schema.sql / earlier migrations), so
-- these are new. Both are intentionally generic (content_type/content_id,
-- rather than a posts-only foreign key) so Banter/Connections can reuse the
-- same tables later instead of building their own.

-- 1. Reports ---------------------------------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  content_type text not null check (content_type in ('post', 'comment')),
  content_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'other')),
  created_at timestamptz not null default now()
);

create index if not exists reports_content_idx on public.reports (content_type, content_id);

alter table public.reports enable row level security;

drop policy if exists "Users can view their own reports" on public.reports;
create policy "Users can view their own reports"
  on public.reports for select
  using ( auth.uid() = reporter_id );

drop policy if exists "Users can file their own reports" on public.reports;
create policy "Users can file their own reports"
  on public.reports for insert
  with check ( auth.uid() = reporter_id );

-- No update/delete policy on purpose — a filed report shouldn't be editable
-- or removable by the reporter once submitted.

-- 2. Blocked users -----------------------------------------------------------
-- Generic across the whole app (not Feed-specific) — hides another user's
-- content from the blocker wherever content gets fetched. Feed's fetchFeed()
-- and fetchComments() both filter against this; Banter/Connections can read
-- the same table once they exist.

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocked_users_blocker_idx on public.blocked_users (blocker_id);

alter table public.blocked_users enable row level security;

drop policy if exists "Users can view their own block list" on public.blocked_users;
create policy "Users can view their own block list"
  on public.blocked_users for select
  using ( auth.uid() = blocker_id );

drop policy if exists "Users can block others" on public.blocked_users;
create policy "Users can block others"
  on public.blocked_users for insert
  with check ( auth.uid() = blocker_id );

drop policy if exists "Users can unblock" on public.blocked_users;
create policy "Users can unblock"
  on public.blocked_users for delete
  using ( auth.uid() = blocker_id );
