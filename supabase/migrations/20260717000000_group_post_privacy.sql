-- Group-post privacy, enforced at the database.
-- Run this once in your Supabase project's SQL Editor:
-- https://supabase.com/dashboard/project/dtrjnvbldzyqjtbuceou/sql/new
--
-- Self-contained: includes the posts policies from 20260716000000_group_posts.sql
-- (which was never applied to the live database — verified by an anonymous
-- probe that could read group posts) PLUS visibility inheritance for
-- comments and reactions. Everything is idempotent; safe to run even if
-- parts were applied before. No old migration files were edited.

-- 1. posts.group_id: null = general feed post, uuid = that group only ------

alter table public.posts alter column group_id drop not null;

-- Legacy mock group ids (pre-real-Groups slugs, not uuids) become plain
-- general posts — same audience they effectively had.
update public.posts set group_id = null
where group_id is not null
  and group_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 2. posts visibility: general posts public, group posts members-only ------
-- is_group_member() is the security-definer helper from the groups schema.

drop policy if exists "Posts are viewable by everyone" on public.posts;
drop policy if exists "Global posts public, group posts members-only" on public.posts;
create policy "Global posts public, group posts members-only"
  on public.posts for select
  using (
    group_id is null
    or public.is_group_member(group_id::uuid, auth.uid())
  );

drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create their own posts"
  on public.posts for insert
  with check (
    auth.uid() = author_id
    and (group_id is null or public.is_group_member(group_id::uuid, auth.uid()))
  );

-- 3. Comments inherit the parent post's visibility --------------------------
-- The subquery on posts runs with the CALLER's permissions (it's not
-- security definer), so posts' own RLS decides: if you can't see the post,
-- the subquery finds nothing and the comment row is invisible/unwritable.
-- One rule to maintain, and it automatically tracks any future posts policy.

drop policy if exists "Comments are viewable by everyone" on public.post_comments;
drop policy if exists "Comments visible with their post" on public.post_comments;
create policy "Comments visible with their post"
  on public.post_comments for select
  using (
    exists (select 1 from public.posts p where p.id = post_comments.post_id)
  );

drop policy if exists "Users can add their own comments" on public.post_comments;
create policy "Users can add their own comments"
  on public.post_comments for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.posts p where p.id = post_comments.post_id)
  );

-- (delete policy unchanged: users can delete their own comments)

-- 4. Reactions inherit the parent post's visibility --------------------------

drop policy if exists "Reactions are viewable by everyone" on public.post_reactions;
drop policy if exists "Reactions visible with their post" on public.post_reactions;
create policy "Reactions visible with their post"
  on public.post_reactions for select
  using (
    exists (select 1 from public.posts p where p.id = post_reactions.post_id)
  );

drop policy if exists "Users can add their own reactions" on public.post_reactions;
create policy "Users can add their own reactions"
  on public.post_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.posts p where p.id = post_reactions.post_id)
  );

-- (delete policy unchanged: users can remove their own reactions)
