-- Delete -> Archive, plus promoting archived posts to a Featured section on
-- Profile. Posts should never force a decision from the poster: "deleting"
-- a post from Feed now archives it (soft-delete), and a real permanent
-- delete only exists from within Archive itself.
--
-- Automatic aging-out (posts older than N days, once the author has more
-- than a small floor of recent posts) stays computed at read-time in
-- lib/archive.ts -- it's pure time-based visibility, not a discrete event.
-- archived_at only covers the OTHER path into Archive: an explicit,
-- user-initiated delete-from-Feed action.

-- 1. Explicit archive marker on posts --------------------------------------

alter table public.posts add column if not exists archived_at timestamptz null;

-- Posts didn't have an update policy before (nothing needed editing).
-- Owners can now update their own posts -- used only to set archived_at
-- from the app.
drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts"
  on public.posts for update
  using ( auth.uid() = author_id )
  with check ( auth.uid() = author_id );

-- 2. Featured posts (Profile) ----------------------------------------------
-- A separate promoted-posts section, independent of the existing
-- profiles.pick_three field by design (kept separate per product decision).

create table if not exists public.featured_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create index if not exists featured_posts_user_idx on public.featured_posts (user_id, created_at desc);

alter table public.featured_posts enable row level security;

drop policy if exists "Featured posts are viewable by everyone" on public.featured_posts;
create policy "Featured posts are viewable by everyone"
  on public.featured_posts for select
  using ( true );

drop policy if exists "Users can feature their own posts" on public.featured_posts;
create policy "Users can feature their own posts"
  on public.featured_posts for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can unfeature their own posts" on public.featured_posts;
create policy "Users can unfeature their own posts"
  on public.featured_posts for delete
  using ( auth.uid() = user_id );

-- Defense in depth: a user can only feature a post they actually authored,
-- even though the app only ever offers this action from their own Archive.
create or replace function public.enforce_featured_post_ownership()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.posts
    where id = new.post_id and author_id = new.user_id
  ) then
    raise exception 'You can only feature your own posts.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_featured_post_ownership on public.featured_posts;
create trigger trg_enforce_featured_post_ownership
before insert on public.featured_posts
for each row execute function public.enforce_featured_post_ownership();
