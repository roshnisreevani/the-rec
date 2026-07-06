-- Feed tab schema — posts, reactions, comments.
-- Run this once in your Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Note: "which groups a post belongs to" is stored as a plain text group_id
-- (matching the mock ids in lib/groups-mock.ts, e.g. "mock-tuesday-hoops")
-- since there's no real Groups table yet. Once Groups ships, add a real
-- foreign key from posts.group_id to the groups table.

-- 1. Posts ---------------------------------------------------------------

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  group_id text not null,
  caption text not null default '',
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  created_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

drop policy if exists "Posts are viewable by everyone" on public.posts;
create policy "Posts are viewable by everyone"
  on public.posts for select
  using ( true );

drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create their own posts"
  on public.posts for insert
  with check ( auth.uid() = author_id );

drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts"
  on public.posts for delete
  using ( auth.uid() = author_id );

-- 2. Reactions -------------------------------------------------------------
-- One row per (post, user, reaction type) — toggling a reaction is just
-- inserting or deleting the matching row, so counts are a simple COUNT(*).

create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('fire', 'respect', 'no_way', 'rough')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id, type)
);

create index if not exists post_reactions_post_idx on public.post_reactions (post_id);

alter table public.post_reactions enable row level security;

drop policy if exists "Reactions are viewable by everyone" on public.post_reactions;
create policy "Reactions are viewable by everyone"
  on public.post_reactions for select
  using ( true );

drop policy if exists "Users can add their own reactions" on public.post_reactions;
create policy "Users can add their own reactions"
  on public.post_reactions for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can remove their own reactions" on public.post_reactions;
create policy "Users can remove their own reactions"
  on public.post_reactions for delete
  using ( auth.uid() = user_id );

-- 3. Comments --------------------------------------------------------------
-- Deliberately lightweight — real trash talk lives in Banter, not here.

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

drop policy if exists "Comments are viewable by everyone" on public.post_comments;
create policy "Comments are viewable by everyone"
  on public.post_comments for select
  using ( true );

drop policy if exists "Users can add their own comments" on public.post_comments;
create policy "Users can add their own comments"
  on public.post_comments for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can delete their own comments" on public.post_comments;
create policy "Users can delete their own comments"
  on public.post_comments for delete
  using ( auth.uid() = user_id );

-- 4. Storage bucket for post photos/videos ---------------------------------

insert into storage.buckets (id, name, public)
values ('feed-media', 'feed-media', true)
on conflict (id) do nothing;

drop policy if exists "Feed media is publicly readable" on storage.objects;
create policy "Feed media is publicly readable"
  on storage.objects for select
  using ( bucket_id = 'feed-media' );

drop policy if exists "Users can upload their own feed media" on storage.objects;
create policy "Users can upload their own feed media"
  on storage.objects for insert
  with check (
    bucket_id = 'feed-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own feed media" on storage.objects;
create policy "Users can delete their own feed media"
  on storage.objects for delete
  using (
    bucket_id = 'feed-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
